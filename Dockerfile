# Witchat Dockerfile - Multi-stage build
# Next.js frontend + Socket.io server

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev for build)
RUN npm ci --legacy-peer-deps

# ============================================
# Stage 2: Build Next.js
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for Next.js
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

# Build Next.js application
RUN npm run build

# ============================================
# Stage 3: Production Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install tini for proper init, dumb-init alternative
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 witchat

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built Next.js app (standalone mode would be better but we need socket-server too)
# Note: No public folder in this project
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy socket server and required libs
COPY --from=builder /app/socket-server.js ./socket-server.js
COPY --from=builder /app/lib ./lib

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Change ownership
RUN chown -R witchat:nodejs /app

USER witchat

# Expose both ports
EXPOSE 3000 4001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ && \
        wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start both services
CMD ["/docker-entrypoint.sh"]
