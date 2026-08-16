# Matriq Backend — Dockerfile (NestJS, multi-stage)
# Stage 1: build
# node:22-slim (glibc) — argon2 0.45.1's shipped musl prebuild segfaults on
# node:20-alpine; the glibc prebuild loads cleanly (matches local Node 22).
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install --ignore-scripts && \
    npm cache clean --force

# Copy source
COPY src/ ./src/

# Build
RUN npm run build && \
    npm prune --omit=dev

# Stage 2: production runtime
FROM node:22-slim AS runner

# Non-root user per security.md
RUN groupadd -g 1001 matriq && \
    useradd -m -u 1001 -g matriq matriq

WORKDIR /app

# Copy built artifacts + production dependencies
COPY --from=builder --chown=matriq:matriq /app/dist ./dist
COPY --from=builder --chown=matriq:matriq /app/node_modules ./node_modules
COPY --from=builder --chown=matriq:matriq /app/package.json ./

# Health check tool + system Tesseract for OCR (open source, no API key, no
# runtime model download — eng traineddata ships with the tesseract-ocr-eng
# package so the OCR feature always works offline).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng && \
    rm -rf /var/lib/apt/lists/*

USER matriq

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
