# The game server as a container, for hosts that build from a Dockerfile (Northflank and others; see README →
# Online hosting). It serves the game page and runs the multiplayer server on PORT (the host may set its own).
# Secrets (OWNER_PASSWORD, DISCORD_WEBHOOK_URL, UPSTASH_REDIS_REST_URL/TOKEN) go in the host's environment
# variables, never in this file.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
