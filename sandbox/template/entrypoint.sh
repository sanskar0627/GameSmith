#!/bin/sh
# GameSmith sandbox entrypoint. Runs as the unprivileged `node` user.
set -eu

# First start: seed the workspace from the template (a restored snapshot
# already has its files).
if [ ! -f /workspace/package.json ]; then
  cp -R /opt/template/files/. /workspace/
fi

# Dependencies are baked into the image: sandboxes have no network.
if [ ! -e /workspace/node_modules ]; then
  ln -s /opt/template/node_modules /workspace/node_modules
fi

# --base wins over vite.config.ts, so the preview keeps working even if the
# game's config is edited.
exec /opt/template/node_modules/.bin/vite --host 0.0.0.0 --port 5173 --strictPort --base "${GS_BASE:-/}"
