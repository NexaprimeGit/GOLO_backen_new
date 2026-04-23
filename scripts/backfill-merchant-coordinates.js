const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/golo";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const REQUEST_DELAY_MS = 1100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCoordinatesFromText(address) {
  if (!address) return null;
  const match = String(address).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const isValid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  return isValid ? { latitude, longitude } : null;
}

async function geocodeAddress(address) {
  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
    countrycodes: "in",
    addressdetails: "0",
  });

  const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "GOLO-Backend-CoordBackfill/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed (${response.status})`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const latitude = Number(data[0].lat);
  const longitude = Number(data[0].lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

async function run() {
  console.log("[backfill] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("[backfill] Connected.");

  const merchantCollection = mongoose.connection.db.collection("merchants");
  const merchants = await merchantCollection
    .find({
      storeLocation: { $exists: true, $ne: "" },
      $or: [
        { storeLocationLatitude: { $exists: false } },
        { storeLocationLatitude: null },
        { storeLocationLongitude: { $exists: false } },
        { storeLocationLongitude: null },
      ],
    })
    .toArray();

  console.log(`[backfill] Found ${merchants.length} merchant(s) with missing coordinates.`);
  if (!merchants.length) {
    await mongoose.disconnect();
    process.exit(0);
  }

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < merchants.length; index += 1) {
    const merchant = merchants[index];
    const address = String(merchant.storeLocation || "").trim();
    const merchantId = String(merchant._id);

    if (!address) {
      skippedCount += 1;
      continue;
    }

    try {
      const parsed = parseCoordinatesFromText(address);
      const coordinates = parsed || (await geocodeAddress(address));

      if (!coordinates) {
        skippedCount += 1;
        console.log(`[backfill] ${index + 1}/${merchants.length} no coordinates for: ${merchantId}`);
      } else {
        await merchantCollection.updateOne(
          { _id: merchant._id },
          {
            $set: {
              storeLocationLatitude: coordinates.latitude,
              storeLocationLongitude: coordinates.longitude,
              updatedAt: new Date(),
            },
          },
        );
        updatedCount += 1;
        console.log(
          `[backfill] ${index + 1}/${merchants.length} updated ${merchantId} -> (${coordinates.latitude}, ${coordinates.longitude})`,
        );
      }
    } catch (error) {
      failedCount += 1;
      console.log(
        `[backfill] ${index + 1}/${merchants.length} failed ${merchantId}: ${error.message}`,
      );
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log("[backfill] Done.");
  console.log(`[backfill] Updated: ${updatedCount}`);
  console.log(`[backfill] Skipped: ${skippedCount}`);
  console.log(`[backfill] Failed: ${failedCount}`);

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill] Fatal error:", error);
    process.exit(1);
  });
