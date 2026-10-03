# syntax=docker/dockerfile:1
# -------------------------------------------------------------
# Stage 1: Install production dependencies
# -------------------------------------------------------------
FROM node:22.13.0-alpine3.21 AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# -------------------------------------------------------------
# Stage 2: Lightweight production runner
# -------------------------------------------------------------
FROM node:22.13.0-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# Copy installed production node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Use non-root node user provided by the alpine image
USER node

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/healthz || exit 1

CMD ["node", "src/index.js"]
