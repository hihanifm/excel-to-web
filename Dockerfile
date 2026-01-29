# Excel-to-web: single process in production (backend serves built frontend).
# Build and run on Linux.

# ---- Build frontend ----
FROM node:20-bookworm AS build-client
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# ---- Runtime: backend + built frontend ----
FROM node:20-bookworm
WORKDIR /app

# Install server deps (better-sqlite3 has prebuilds for linux)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=build-client /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Data (db + uploads) lives under /app/server/data; mount a volume for persistence
RUN mkdir -p /app/server/data

CMD ["node", "server/src/server.js"]
