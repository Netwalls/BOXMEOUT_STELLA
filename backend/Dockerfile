# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Generate Prisma client before building
RUN npx prisma generate
RUN npm run build

# ── Stage 3: runtime base ────────────────────────────────────────────────────
# Shared layer used by both the API and the indexer targets below.
FROM node:20-alpine AS runtime-base
WORKDIR /app

ENV NODE_ENV=production

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy compiled output
COPY --from=builder /app/dist ./dist
# Copy Prisma schema and generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Copy OpenAPI spec into dist/api/ so docs route can find it at runtime
COPY --from=builder /app/src/api/openapi.json ./dist/api/openapi.json

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 apiuser
USER apiuser

# ── Stage 4: API server ──────────────────────────────────────────────────────
FROM runtime-base AS api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]

# ── Stage 5: indexer ─────────────────────────────────────────────────────────
# B-54: Separate target so the indexer can be deployed independently.
# Uses the same compiled image — no extra build cost.
FROM runtime-base AS indexer
CMD ["node", "dist/indexer/index.js"]
