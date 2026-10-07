# syntax=docker/dockerfile:1

# ---- Runtime: sync API only ------------------------------------------------
# The PWA is deployed separately (e.g. GitHub Pages) and points back here via
# its SYNC_URL build variable, so this image runs just the sync backend. It
# keeps package.json because the server is ESM ("type": "module").
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PING_DB=/data/ping.sqlite
WORKDIR /app
COPY package.json ./
COPY server ./server
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
# The server is pure Node built-ins (node:http + node:sqlite): no install step.
CMD ["node", "server/index.js"]
