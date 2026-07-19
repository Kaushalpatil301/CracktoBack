# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required for node-gyp and Prisma
RUN apk add --no-cache python3 make g++ openssl

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy package files and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built code from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose port (can be overridden by environment)
EXPOSE 3000

# Set Node environment
ENV NODE_ENV=production

# Start script
CMD ["npm", "start"]
