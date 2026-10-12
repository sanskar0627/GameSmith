# GameSmith sandbox manager and preview proxy (same image, two containers).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /data/snapshots
EXPOSE 4100 4101
# The manager runs as root because it needs the Docker socket (root-equivalent
# anyway); the preview proxy container overrides the user and has no socket.
CMD ["node", "dist/main.js"]
