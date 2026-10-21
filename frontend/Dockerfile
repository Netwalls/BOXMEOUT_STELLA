# syntax=docker/dockerfile:1
# ── BOXMEOUT frontend production image ───────────────────────────────────────
# Multi-stage build on the Next.js "standalone" output. The final image runs as
# an unprivileged user and contains only the traced server bundle.
#
# NEXT_PUBLIC_* values are inlined into the JavaScript bundle at build time, so
# they are passed as build args rather than runtime env. The defaults below
# target the local docker-compose stack; override them for other environments:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_STELLAR_NETWORK=testnet
ARG NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ARG NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ARG NEXT_PUBLIC_MARKET_CONTRACT_ID=
ARG NEXT_PUBLIC_ADMIN_ADDRESSES=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STELLAR_NETWORK=$NEXT_PUBLIC_STELLAR_NETWORK \
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=$NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE \
    NEXT_PUBLIC_SOROBAN_RPC_URL=$NEXT_PUBLIC_SOROBAN_RPC_URL \
    NEXT_PUBLIC_MARKET_CONTRACT_ID=$NEXT_PUBLIC_MARKET_CONTRACT_ID \
    NEXT_PUBLIC_ADMIN_ADDRESSES=$NEXT_PUBLIC_ADMIN_ADDRESSES

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]
