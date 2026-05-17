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
FROM node:20-bookworm

WORKDIR /app

# Install Chromium and dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy backend package files and install
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

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
