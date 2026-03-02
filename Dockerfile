# Sovereign CPA Engine — Multi-stage production build
# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production runtime
FROM node:20-alpine AS production

WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Runtime dependencies only
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Compiled application
COPY --from=builder /app/dist ./dist

# Runtime data: migrations, financial rules config
COPY migrations/ ./migrations/
COPY shared/ ./shared/

# Docker entrypoint (runs migrations then starts app)
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Writable directories for evidence storage and local storage
RUN mkdir -p /app/data/evidence /app/storage && \
    chown -R appuser:appgroup /app/data /app/storage

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

USER appuser

EXPOSE ${PORT:-3000}

CMD ["./docker-entrypoint.sh"]
