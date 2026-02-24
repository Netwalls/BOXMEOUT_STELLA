# Use Node.js 20 Alpine as base image (LTS)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
# - OpenSSL for Prisma
# - curl for health checks and API calls
# - bash for init scripts
# - cargo/rust for building Soroban contracts (if needed)
RUN apk add --no-cache \
    openssl \
    curl \
    bash \
    git \
    build-base

# Install Stellar CLI
RUN curl -L https://github.com/stellar/stellar-cli/releases/download/v21.5.0/stellar-cli-21.5.0-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin

# Copy package files
COPY package*.json ./

# Install dependencies
# Install dependencies (including devDependencies for build)
RUN npm ci --only=none

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Copy initialization script
COPY scripts/init-local-dev.sh /app/scripts/init-local-dev.sh
RUN chmod +x /app/scripts/init-local-dev.sh

# Expose port
EXPOSE 3000

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Run initialization if INIT_LOCAL_DEV is set\n\
if [ "$INIT_LOCAL_DEV" = "true" ]; then\n\
  echo "Running local development initialization..."\n\
  /app/scripts/init-local-dev.sh\n\
fi\n\
\n\
# Start the application\n\
exec npm start\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Use custom entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]