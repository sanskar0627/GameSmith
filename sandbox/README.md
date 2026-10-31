# Game sandboxes

Every game runs in its own container: a Vite dev server with the starter
game, its art kit and dependencies. The app never talks to Docker directly.

```
browser ──► app (Next.js) ──token──► sandbox-manager ──docker.sock──► gs-sbx-<game>
   │                                      ▲                              ▲
   └── iframe /p/<game>-<secret>/ ──► sandbox-proxy ──(private network)──┘
```

| Piece | Where | What it does |
|---|---|---|
| `template/` | image `gamesmith-sandbox` | Starter game (`files/`), art kit (`files/src/kit`), `fsop.mjs` file helper, entrypoint |
| `manager/` | container `gamesmith-sandbox-manager` | Starts/stops sandboxes, files, snapshots, idle reaper. Only service with the Docker socket |
| `manager/` (proxy entry) | container `gamesmith-sandbox-proxy` | Serves previews and HMR. Joins each sandbox's private network. No Docker access |

## Security model

- **One private network per sandbox**, created `internal`: no internet, no
  host, no Postgres, no Redis, no other sandboxes. Only the preview proxy
  joins it. The manager (Docker socket) is never reachable from a sandbox.
- **gVisor** (`runsc`) in production: game code talks to gVisor's user-space
  kernel, not the host kernel. The manager refuses to start without it when
  `SANDBOX_REQUIRE_GVISOR=true`.
- **Container limits:** non-root `node` user, all capabilities dropped,
  `no-new-privileges`, read-only root filesystem, 1 GB memory (no swap),
  1 CPU, 256 processes, small `/tmp`, capped logs.
- **Files** are read and written by `fsop.mjs` running *inside* the sandbox
  (`docker exec`), so whatever the game does to its workspace (symlinks,
  odd paths) can only affect itself. The manager never opens workspace files.
- **Snapshots** are rebuilt entry by entry: only plain files and folders with
  safe relative paths, owned by the sandbox user. Restores are extracted by
  Docker into the volume before any game code runs.
- **Previews** are capability links: `/p/<game>-<secret>/`, a new 144-bit
  secret on every start, given only to the game's owner. Links stop working
  when the sandbox sleeps. No cookies, so previews work in the app's iframe.
  `frame-ancestors` limits embedding to the app.
- **Idle sandboxes stop** after 15 minutes without preview traffic or file
  changes (snapshot first). At most `SANDBOX_MAX_RUNNING` run at once.

Sandboxes have **no network**, so games can only use the dependencies baked
into the image (`template/files/package.json`). Adding a package means
rebuilding the image.

## Local development (macOS, Docker Desktop)

Docker Desktop has no gVisor, so local sandboxes use `runc`. Isolation is
still network- and capability-based, but the kernel is shared. Never run
untrusted games this way in production.

1. Add to `.env.local`:
   ```bash
   SANDBOX_MANAGER_TOKEN=$(openssl rand -hex 32)   # paste the value
   SANDBOX_MANAGER_URL=http://127.0.0.1:4100
   SANDBOX_PREVIEW_ORIGIN=http://127.0.0.1:4101
   REDIS_PASSWORD=$(openssl rand -hex 16)          # paste the value
   ```
2. Build and start:
   ```bash
   npm run sandbox:build      # sandbox image + manager image
   npm run sandbox:up         # manager + preview proxy
   npm run sandbox:smoke      # end-to-end check, including isolation
   ```
3. Run the manager's own tests (no Docker needed):
   ```bash
   npm run sandbox:install
   npm run sandbox:test
   ```

`npm run sandbox:down` stops the manager and proxy. Sandboxes stop with the
manager (it snapshots them first).

## Production VM (Ubuntu or Debian)

1. Install gVisor (from [gvisor.dev](https://gvisor.dev/docs/user_guide/install/)):
   ```bash
   sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
   curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
   sudo apt-get update && sudo apt-get install -y runsc
   docker run --rm --runtime=runsc hello-world
   ```
2. Give Docker room for one network per sandbox. In `/etc/docker/daemon.json`
   (merge with what `runsc` added), then `sudo systemctl restart docker`:
   ```json
   { "default-address-pools": [{ "base": "10.200.0.0/16", "size": 24 }] }
   ```
   The default pools only allow about 30 networks.
3. Set `SANDBOX_RUNTIME=runsc` and `SANDBOX_REQUIRE_GVISOR=true`, then
   `npm run sandbox:smoke` with `SANDBOX_RUNTIME=runsc` to confirm the
   runtime and isolation on the VM.

The production compose file, TLS for the preview domain and R2 copies of
snapshots arrive in Phase 12.

## Known limits

- No per-sandbox disk quota yet: a runaway game can fill the workspace
  volume. Phase 12 adds XFS project quotas (or size-limited volumes) and
  disk alerts.
- Snapshots live on the VM's disk until Phase 12 copies them to R2.
- Previews share one origin (`/p/...` paths). They are owner-only, but two of
  the same owner's previews could read each other's pages if both links were
  known. Published games (Phase 11) get their own domain.
