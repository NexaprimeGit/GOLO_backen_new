# Backend Dockerfile - reliable multi-stage build using Debian-slim
FROM node:20-bullseye-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install build tools needed for native modules (bcrypt, node-gyp)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 build-essential git \
	&& rm -rf /var/lib/apt/lists/*

# Install dependencies and build
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# Production image
FROM node:20-bullseye-slim

ENV NODE_ENV=production
WORKDIR /app

# Create app user and group (use non-root for better security)
RUN groupadd -r app && useradd -r -g app -s /sbin/nologin app || true

# Copy package metadata from builder and install production deps
COPY --from=builder /app/package*.json ./
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm ci --only=production --no-audit --progress=false

# Optional: rebuild native modules if necessary (best-effort)
RUN npm rebuild bcrypt --build-from-source || true

# Copy built output and scripts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/update-merchant-categories.js ./ || true
COPY --from=builder /app/check-merchants.js ./ || true

# Adjust ownership and switch to unprivileged user
RUN chown -R app:app /app
USER app

EXPOSE 3002

# Simple healthcheck (uses curl installed above)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:3002/ || exit 1

CMD ["node", "dist/main.js"]
