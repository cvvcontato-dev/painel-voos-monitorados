# ========================================
# Stage 1: Build the Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ========================================
# Stage 2: Production Server
# ========================================
FROM node:20-bookworm-slim

WORKDIR /app

# Install Chromium, build tools for native modules, and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    python3 make g++ \
    libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libasound2t64 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy backend package files and install (rebuild native modules inside container)
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev && npm rebuild sqlite3 --build-from-source

# Copy backend source
COPY backend/ ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./public

# Create data directory for SQLite persistence
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data

EXPOSE 3000

CMD ["node", "server.js"]
