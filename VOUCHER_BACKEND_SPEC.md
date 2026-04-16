# Voucher & Redemption Backend Specification

## 1. Database Schema

### Voucher Schema (MongoDB)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (FK to User),
  offerId: ObjectId (FK to Offer/Banner),
  voucherId: String (unique, e.g., "VOUCHER-1234567890"),
  qrCode: String (unique, e.g., "VCH-ABC123456789"),
  merchantId: ObjectId (FK to Merchant/User),
  
  // Offer Details (denormalized for quick access)
  offerTitle: String,
  merchantName: String,
  discount: Number | String, // "50%", "₹100", etc
  
  // Status & Validity
  status: enum ['active', 'claimed', 'redeemed', 'expired'],
  claimedAt: Date,
  redeemedAt: Date,
  redeemedByMerchantId: ObjectId, // Which merchant redeemed it
  
  // Expiry
  expiresAt: Date,
  validityHours: Number, // How many hours valid from claim
  
  // For tracking redemptions
  redemptionCode: String, // Generated when redeemed
  
  createdAt: Date,
  updatedAt: Date,
}
```

## 2. API Routes Specification

### Route 1: POST /vouchers/claim
**Description**: User claims an offer and receives a voucher

**Request**:
```json
{
  "offerId": "banner-123"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "_id": "voucher-456",
    "voucherId": "VOUCHER-1234567890",
    "qrCode": "VCH-ABC123456789",
    "offerTitle": "50% Off Pizza",
    "merchantName": "Pizza Hut",
    "discount": "50%",
    "status": "active",
    "expiresAt": "2026-05-15T10:30:00Z",
    "claimedAt": "2026-04-15T10:30:00Z"
  }
}
```

---

### Route 2: GET /vouchers/my-vouchers
**Description**: Get user's all claimed vouchers with filtering

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 10)
- `status` (optional): Filter by status - 'active', 'claimed', 'redeemed', 'expired'

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "voucher-456",
      "voucherId": "VOUCHER-1234567890",
      "qrCode": "VCH-ABC123456789",
      "offerTitle": "50% Off Pizza",
      "merchantName": "Pizza Hut",
      "discount": "50%",
      "status": "active",
      "expiresAt": "2026-05-15T10:30:00Z",
      "claimedAt": "2026-04-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

### Route 3: GET /vouchers/{voucherId}
**Description**: Get single voucher details by ID

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "voucher-456",
    "voucherId": "VOUCHER-1234567890",
    "qrCode": "VCH-ABC123456789",
    "offerTitle": "50% Off Pizza",
    "merchantName": "Pizza Hut",
    "discount": "50%",
    "status": "active",
    "expiresAt": "2026-05-15T10:30:00Z",
    "claimedAt": "2026-04-15T10:30:00Z",
    "redeemedAt": null
  }
}
```

---

### Route 4: GET /vouchers/{voucherId}/download-qr
**Description**: Download voucher QR code as image/PDF

**Response**: 
- Content-Type: `image/png` or `application/pdf`
- Binary QR code image

---

### Route 5: POST /vouchers/{voucherId}/share
**Description**: Share voucher with friend via email

**Request**:
```json
{
  "friendEmail": "friend@example.com"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Voucher shared successfully",
  "data": {
    "sharedWith": "friend@example.com",
    "sharedAt": "2026-04-15T10:30:00Z"
  }
}
```

---

### Route 6: POST /vouchers/{voucherId}/verify
**Description**: Merchant verifies QR code WITHOUT redeeming

**Request**:
```json
{
  "qrCode": "VCH-ABC123456789"
}
```

**Response (200)**:
```json
{
  "success": true,
  "valid": true,
  "data": {
    "voucherId": "VOUCHER-1234567890",
    "userName": "John Doe",
    "userEmail": "john@example.com",
    "offerTitle": "50% Off Pizza",
    "discount": "50%",
    "status": "active",
    "expiresAt": "2026-05-15T10:30:00Z"
  }
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "valid": false,
  "message": "Voucher already redeemed",
  "data": null
}
```

---

### Route 7: POST /vouchers/{voucherId}/redeem
**Description**: Merchant completes the redemption

**Request**:
```json
{
  "qrCode": "VCH-ABC123456789"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Voucher redeemed successfully",
  "data": {
    "voucherId": "VOUCHER-1234567890",
    "userName": "John Doe",
    "offerTitle": "50% Off Pizza",
    "discount": "50%",
    "redeemedAt": "2026-04-15T11:00:00Z",
    "redemptionCode": "RDM-1234567890"
  }
}
```

---

### Route 8: GET /vouchers/merchant/pending
**Description**: Get merchant's pending redemptions (to be redeemed)

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 20)
- `status` (optional): 'pending', 'redeemed'

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "voucherId": "VOUCHER-1234567890",
      "qrCode": "VCH-ABC123456789",
      "userName": "John Doe",
      "offerTitle": "50% Off Pizza",
      "discount": "50%",
      "status": "active",
      "claimedAt": "2026-04-14T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

---

### Route 9: GET /vouchers/merchant/history
**Description**: Get merchant's redemption history (already redeemed)

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 20)

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "voucherId": "VOUCHER-1234567890",
      "userName": "John Doe",
      "offerTitle": "50% Off Pizza",
      "discount": "50%",
      "claimedAt": "2026-04-14T10:30:00Z",
      "redeemedAt": "2026-04-14T18:00:00Z",
      "redemptionCode": "RDM-1234567890"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "pages": 1
  }
}
```

---

### Route 10: GET /vouchers/merchant/offers
**Description**: Get all active offers for the merchant

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 20)
- `status` (optional): 'active', 'expired'

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "offerId": "banner-123",
      "offerTitle": "50% Off Pizza",
      "discount": "50%",
      "status": "active",
      "createdAt": "2026-04-01T10:30:00Z",
      "claimsCount": 45,
      "redeemedCount": 12
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "pages": 1
  }
}
```

---

## 3. QR Code Generation

### Technology
Use `qrcode` npm package:
```bash
npm install qrcode
```

### Implementation

```javascript
import QRCode from 'qrcode';

// Generate QR Code String (what to encode)
const generateQRCodeString = (voucherId, merchantId) => {
  // Format: voucher-{voucherId}-{merchantId}
  return `voucher-${voucherId}-${merchantId}`;
};

// Generate QR Code Image (PNG)
const generateQRCodeImage = async (qrString) => {
  try {
    const qrImage = await QRCode.toDataURL(qrString, {
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'H', // High error correction
    });
    return qrImage; // Returns data:image/png;base64,...
  } catch (error) {
    console.error('QR Code generation failed:', error);
    throw error;
  }
};

// Usage when claiming voucher
const voucherId = 'VOUCHER-' + Date.now();
const qrString = generateQRCodeString(voucherId, merchantId);
const qrImage = await generateQRCodeImage(qrString);

// Save qrImage (base64) to database or file system
```

### QR Scanning on Frontend
Already implemented in `app/merchant/redeem/page.js` using `react-qr-reader`

---

## 4. Sample Seed Data

### Create Seed Script: `scripts/seed-vouchers.js`

```javascript
const mongoose = require('mongoose');

// Sample Banners/Offers (these should already exist in your system)
const banners = [
  {
    _id: mongoose.Types.ObjectId('111111111111111111111111'),
    title: '50% Off Pizza',
    merchantName: 'Pizza Hut',
    discount: '50%',
  },
  {
    _id: mongoose.Types.ObjectId('222222222222222222222222'),
    title: '30% Off Burgers',
    merchantName: 'Burger King',
    discount: '30%',
  },
  {
    _id: mongoose.Types.ObjectId('333333333333333333333333'),
    title: '₹200 Off Any Order',
    merchantName: 'Zomato Partner',
    discount: '₹200',
  },
];

// Sample Users
const users = [
  {
    _id: mongoose.Types.ObjectId('444444444444444444444444'),
    email: 'user@example.com',
    name: 'John Doe',
  },
  {
    _id: mongoose.Types.ObjectId('555555555555555555555555'),
    email: 'user2@example.com',
    name: 'Jane Smith',
  },
];

// Sample Merchants
const merchants = [
  {
    _id: mongoose.Types.ObjectId('666666666666666666666666'),
    name: 'Pizza Hut Manager',
  },
  {
    _id: mongoose.Types.ObjectId('777777777777777777777777'),
    name: 'Burger King Manager',
  },
];

// Sample Vouchers
const vouchers = [
  {
    userId: users[0]._id,
    offerId: banners[0]._id,
    voucherId: 'VOUCHER-1704067200000',
    qrCode: 'voucher-VOUCHER-1704067200000-' + merchants[0]._id,
    merchantId: merchants[0]._id,
    offerTitle: '50% Off Pizza',
    merchantName: 'Pizza Hut',
    discount: '50%',
    status: 'active',
    claimedAt: new Date('2026-04-10T10:00:00Z'),
    expiresAt: new Date('2026-05-10T10:00:00Z'),
    validityHours: 720, // 30 days
    createdAt: new Date('2026-04-10T10:00:00Z'),
    updatedAt: new Date('2026-04-10T10:00:00Z'),
  },
  {
    userId: users[0]._id,
    offerId: banners[1]._id,
    voucherId: 'VOUCHER-1704153600000',
    qrCode: 'voucher-VOUCHER-1704153600000-' + merchants[1]._id,
    merchantId: merchants[1]._id,
    offerTitle: '30% Off Burgers',
    merchantName: 'Burger King',
    discount: '30%',
    status: 'redeemed',
    claimedAt: new Date('2026-04-08T10:00:00Z'),
    redeemedAt: new Date('2026-04-12T18:00:00Z'),
    redeemedByMerchantId: merchants[1]._id,
    expiresAt: new Date('2026-05-08T10:00:00Z'),
    validityHours: 720,
    redemptionCode: 'RDM-1704153600000',
    createdAt: new Date('2026-04-08T10:00:00Z'),
    updatedAt: new Date('2026-04-12T18:00:00Z'),
  },
  {
    userId: users[1]._id,
    offerId: banners[2]._id,
    voucherId: 'VOUCHER-1704240000000',
    qrCode: 'voucher-VOUCHER-1704240000000-' + merchants[0]._id,
    merchantId: merchants[0]._id,
    offerTitle: '₹200 Off Any Order',
    merchantName: 'Zomato Partner',
    discount: '₹200',
    status: 'active',
    claimedAt: new Date('2026-04-14T10:00:00Z'),
    expiresAt: new Date('2026-05-14T10:00:00Z'),
    validityHours: 720,
    createdAt: new Date('2026-04-14T10:00:00Z'),
    updatedAt: new Date('2026-04-14T10:00:00Z'),
  },
];

// Run seed
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Clear existing vouchers
    await Voucher.deleteMany({});
    
    // Insert sample data
    const result = await Voucher.insertMany(vouchers);
    console.log(`✅ Seeded ${result.length} vouchers`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
```

---

## 5. Implementation Checklist

### Phase 1: Schema & Service
- [ ] Create Voucher MongoDB schema (`src/vouchers/schemas/voucher.schema.ts`)
- [ ] Create Voucher Mongoose model
- [ ] Create Voucher service with database methods
- [ ] Install QR code dependency: `npm install qrcode`

### Phase 2: API Routes
- [ ] Create Voucher controller (`src/vouchers/vouchers.controller.ts`)
- [ ] Implement all 10 endpoints
- [ ] Add JWT authentication guards
- [ ] Add request validation (DTOs)
- [ ] Add error handling

### Phase 3: Testing
- [ ] Run seed script to populate test data
- [ ] Test all 10 endpoints with Postman
- [ ] Verify QR code generation
- [ ] Test frontend integration

### Phase 4: Frontend Validation
- [ ] Test user claim flow
- [ ] Test my-deals page loading
- [ ] Test merchant QR scanning
- [ ] Test redemption flow

---

## 6. NestJS Service Example

```typescript
// src/vouchers/vouchers.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';

@Injectable()
export class VouchersService {
  constructor(
    @InjectModel('Voucher') private voucherModel: Model<any>,
  ) {}

  async claimOffer(userId: string, offerId: string) {
    const voucherId = 'VOUCHER-' + Date.now();
    const qrCode = `voucher-${voucherId}-${offerId}`;
    
    // Generate QR image
    const qrImage = await QRCode.toDataURL(qrCode, { width: 300 });
    
    const voucher = await this.voucherModel.create({
      userId,
      offerId,
      voucherId,
      qrCode,
      status: 'active',
      claimedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      validityHours: 720,
    });
    
    return voucher;
  }

  async getMyVouchers(userId: string, page = 1, limit = 10, status?: string) {
    const query = { userId };
    if (status) query['status'] = status;
    
    const vouchers = await this.voucherModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
    
    const total = await this.voucherModel.countDocuments(query);
    
    return {
      data: vouchers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async verifyVoucher(voucherId: string, qrCode: string) {
    const voucher = await this.voucherModel.findOne({ voucherId, qrCode });
    
    if (!voucher) {
      throw new Error('Invalid QR code');
    }
    if (voucher.status === 'redeemed') {
      throw new Error('Voucher already redeemed');
    }
    if (new Date() > voucher.expiresAt) {
      throw new Error('Voucher expired');
    }
    
    return {
      valid: true,
      voucherId: voucher.voucherId,
      offerTitle: voucher.offerTitle,
      discount: voucher.discount,
    };
  }

  async redeemVoucher(voucherId: string, qrCode: string, merchantId: string) {
    const voucher = await this.voucherModel.findOneAndUpdate(
      { voucherId, qrCode },
      {
        status: 'redeemed',
        redeemedAt: new Date(),
        redeemedByMerchantId: merchantId,
        redemptionCode: 'RDM-' + Date.now(),
      },
      { new: true },
    );
    
    return voucher;
  }
}
```

---

## Summary

You now have a complete specification to build the backend. The steps are:

1. **Create Voucher Schema** in NestJS with Mongoose
2. **Create Voucher Service** with all the database operations
3. **Create Voucher Controller** with all 10 endpoints
4. **Implement QR Code generation** using qrcode library
5. **Run seed script** to populate test data
6. **Test with Postman** before connecting to frontend

Would you like me to create the actual Voucher controller, service, and schema files for your NestJS backend?
