# syntax=docker/dockerfile:1
# -------------------------------------------------------------
# Stage 1: Build the React client with Vite
# -------------------------------------------------------------
FROM node:22.13.0-alpine3.21 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: High-performance Nginx static web server
# -------------------------------------------------------------
FROM nginx:1.27.3-alpine AS runner

# Remove default nginx public directory contents
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
