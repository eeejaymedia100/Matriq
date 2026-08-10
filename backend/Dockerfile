# Matriq Backend — Dockerfile (NestJS, multi-stage)
# Stage 1: build
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

# Non-root user per security.md
RUN addgroup -g 1001 -S matriq && \
    adduser -S matriq -u 1001 -G matriq

WORKDIR /app

# Copy built artifacts + production dependencies
COPY --from=builder --chown=matriq:matriq /app/dist ./dist
COPY --from=builder --chown=matriq:matriq /app/node_modules ./node_modules
COPY --from=builder --chown=matriq:matriq /app/package.json ./

# Health check tool
RUN apk add --no-cache curl

USER matriq

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
