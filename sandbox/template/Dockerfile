# GameSmith game sandbox: the starter game, its dependencies and a Vite dev
# server. Built once, run per game by the sandbox manager (under gVisor in
# production). No network at runtime, so every dependency is installed here.
FROM node:22-alpine

WORKDIR /opt/template
COPY files/package.json files/package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY files/ ./files/
COPY entrypoint.sh /usr/local/bin/gs-entrypoint
# File operations the manager runs inside the sandbox via `docker exec`.
COPY fsop.mjs /opt/gs/fsop.mjs
RUN chmod 0555 /usr/local/bin/gs-entrypoint && chmod 0444 /opt/gs/fsop.mjs \
  && rm -rf ./files/node_modules \
  && mkdir -p /workspace && chown node:node /workspace

USER node
WORKDIR /workspace
ENV NODE_ENV=development
EXPOSE 5173
ENTRYPOINT ["/usr/local/bin/gs-entrypoint"]
