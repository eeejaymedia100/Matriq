# Matriq Association Dashboard — Dockerfile (Next.js standalone, multi-stage)
# Self-hosted on the same VM as the backend (see docs/docs/deployment-cost.md).
# Build arg overrides the browser-side API base URL (same as Vercel's env).
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_API_URL=https://api.matriq.com.ng/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Production runtime ──
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd -g 1001 matriq && useradd -m -u 1001 -g matriq matriq

COPY --from=builder --chown=matriq:matriq /app/.next/standalone ./
COPY --from=builder --chown=matriq:matriq /app/.next/static ./.next/static
COPY --from=builder --chown=matriq:matriq /app/public ./public

USER matriq
EXPOSE 3000

CMD ["node", "server.js"]
