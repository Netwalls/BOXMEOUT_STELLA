# Use Node.js 20 Alpine as base image (LTS)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install OpenSSL for Prisma (use openssl3 for modern Alpine)
RUN apk add --no-cache openssl

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

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]