# syntax=docker/dockerfile:1

# ---- Build the PWA ---------------------------------------------------------
FROM oven/bun:1.4.2 AS web
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
# Images are built outside the corporate network, so point Bun at the public
# registry. The committed bunfig/lock reference an internal Artifactory mirror;
# the tarball bytes (and thus the lockfile integrity hashes) are identical.
RUN sed -i 's#https://repo.inform-software.com/artifactory/api/npm/npmjs-remote/#https://registry.npmjs.org/#g' bun.lock \
 && printf '[install]\nregistry = "https://registry.npmjs.org/"\n' > bunfig.toml \
 && bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- Runtime: static PWA + sync API ---------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PING_DB=/data/ping.sqlite \
    STATIC_DIR=/app/dist
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY --from=web /app/dist ./dist
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
# The server is pure Node built-ins (node:http + node:sqlite): no install step.
CMD ["node", "server/index.js"]
