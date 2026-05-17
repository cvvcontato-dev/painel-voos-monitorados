# ========================================
# Stage 1: Build the Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build the React app
RUN npm run build

# ========================================
# Stage 2: Production Server
# ========================================
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install Node.js 20 (Playwright image uses Ubuntu, so install via nodesource)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./

# Copy built frontend into backend's public directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Create data directory for SQLite persistence
RUN mkdir -p /data

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data

EXPOSE 3000

CMD ["node", "server.js"]
