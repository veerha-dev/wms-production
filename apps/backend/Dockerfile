FROM node:20-alpine AS builder
WORKDIR /app

# Copy monorepo root files
COPY package.json ./

# Copy all workspace packages
COPY packages/ packages/
COPY apps/backend/ apps/backend/

# Install dependencies (handles monorepo workspaces)
RUN npm install --legacy-peer-deps

# Build backend from root (resolves workspace packages)
RUN npm run build --workspace=apps/backend

# Runtime image
FROM node:20-alpine
WORKDIR /app

# Copy only backend dist and node_modules
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main"]
