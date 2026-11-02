# Deploying GameSmith

One VM runs everything with Docker Compose (`compose.prod.yml`): Postgres,
Redis, the app, the agent worker, the sandbox manager and preview proxy,
and Caddy for TLS. This is the runbook for the first deploy, updates,
backups and incidents.

## 1. What you need

| Thing | Notes |
|---|---|
| A VM | Ubuntu 24.04 or Debian 12, x86_64. 4 vCPU / 16 GB RAM / 100 GB SSD runs ~20 sandboxes at once. |
| Three host names | `APP_DOMAIN` (the app), `PLAY_DOMAIN` (published games), `PREVIEW_DOMAIN` (live previews). |
| DNS | An A (and AAAA) record for each name, pointing at the VM. |
| Clerk | A **production** instance: publishable + secret key, webhook secret. |
| AI keys | At least one `PLATFORM_*` key (or users bring their own). `PLATFORM_FAL_KEY` enables painted art on sparks. |
| Polar | Optional at launch. Products and webhook (see the README). |
| Sentry | Optional. A DSN for error reports. |

**Domains matter for security.** `PLAY_DOMAIN` serves untrusted game code.
Put it on a *different registrable domain* from the app (for example
`gamesmith.app` and `play.gamesmith.games`), never a subdomain of the app's
domain, so games can never see or set the app's cookies. `PREVIEW_DOMAIN`
should also be on the separate domain (`preview.gamesmith.games`).

## 2. Prepare the VM (once)

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and back in

# gVisor: sandboxes run under runsc in production
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install
```

Give Docker room for one private network per sandbox. Merge into
`/etc/docker/daemon.json` (keep what `runsc install` added), then restart:

```json
{
  "default-address-pools": [{ "base": "10.200.0.0/16", "size": 24 }],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
```

```bash
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

Firewall: allow only 22, 80 and 443.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw enable
```

## 3. Configure

```bash
sudo mkdir -p /opt/gamesmith && sudo chown $USER /opt/gamesmith
git clone https://github.com/sanskar0627/GameSmith.git /opt/gamesmith
cd /opt/gamesmith
cp .env.example .env.production
chmod 600 .env.production
```

Fill in `.env.production`. Generate secrets with:

```bash
openssl rand -hex 24                                    # POSTGRES_PASSWORD, REDIS_PASSWORD
openssl rand -hex 32                                    # SANDBOX_MANAGER_TOKEN
node -e "console.log('1:' + require('crypto').randomBytes(32).toString('base64'))"   # KEY_ENCRYPTION_KEYS
```

Production values that differ from local development:

```bash
NODE_ENV=production
APP_DOMAIN=gamesmith.app
PLAY_DOMAIN=play.gamesmith.games
PREVIEW_DOMAIN=preview.gamesmith.games
ACME_EMAIL=you@example.com

NEXT_PUBLIC_APP_URL=https://gamesmith.app
PUBLISHED_ORIGIN=https://play.gamesmith.games
SANDBOX_PREVIEW_ORIGIN=https://preview.gamesmith.games

POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
SANDBOX_MANAGER_TOKEN=...
KEY_ENCRYPTION_KEYS=1:...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
POLAR_SERVER=production
# SENTRY_DSN=https://<key>@o0.ingest.sentry.io/<project>
```

`DATABASE_URL`, `REDIS_URL`, `AGENT_QUEUE` and `SANDBOX_MANAGER_URL` are set by
`compose.prod.yml`; don't put them in the file. **Back up
`KEY_ENCRYPTION_KEYS` somewhere safe**: without it, saved user API keys can't
be decrypted.

## 4. First deploy

```bash
cd /opt/gamesmith
export COMPOSE="docker compose -f compose.prod.yml --env-file .env.production"
$COMPOSE --profile build build          # app image, sandbox image, manager image
$COMPOSE up -d                           # migrations run first, then everything starts
$COMPOSE ps                              # all healthy, migrate "exited (0)"
curl -fsS https://$APP_DOMAIN/api/health # {"status":"ok","db":"ok","redis":"ok"}
```

Check the sandboxes on the VM (gVisor and isolation). The smoke test talks
to the manager on `127.0.0.1:4100`, so run it once from a checkout with the
local compose file, which publishes that port on localhost only. Do it before
`$COMPOSE up` (both stacks use the same sandbox container names):

```bash
# in a second checkout, with SANDBOX_RUNTIME=runsc and SANDBOX_REQUIRE_GVISOR=true in .env.local
npm run sandbox:build && npm run sandbox:up
SANDBOX_RUNTIME=runsc npm run sandbox:smoke    # every check must pass, including "runtime is runsc"
npm run sandbox:down
```

Then in the dashboards:

- **Clerk:** add `https://$APP_DOMAIN` to allowed origins; webhook endpoint
  `https://$APP_DOMAIN/api/webhooks/clerk` for `user.created`,
  `user.updated`, `user.deleted`.
- **Polar:** webhook `https://$APP_DOMAIN/api/webhooks/polar` for
  `order.paid`, `order.refunded`, `subscription.*`.

Last, sign up, create a game, let Smith build it, publish it (Share, then
Publish), and open the play link in a private window with sharing set to
"Anyone with the link".

## 5. Updates

```bash
cd /opt/gamesmith && git pull
$COMPOSE --profile build build
$COMPOSE up -d          # re-runs migrations, then restarts what changed
```

The worker gets 60 s to stop: running agents are asked to stop, save what
they have and settle sparks. Runs a crashed worker left behind are failed
and refunded by housekeeping within a few minutes.

Rollback: `git checkout <previous tag>`, then build and `up -d` again.
Migrations only ever add; an older app runs fine on a newer schema.

## 6. Backups

`scripts/backup.sh` dumps Postgres (users, games, chat, billing, published
builds) and tars the sandbox snapshots volume (game source) into
`/var/backups/gamesmith`, keeping 14 days. With an `rclone` remote it also
copies them off the machine (recommended: a Cloudflare R2 bucket).

```bash
sudo crontab -e
17 3 * * * cd /opt/gamesmith && BACKUP_REMOTE=r2:gamesmith-backups ./scripts/backup.sh >> /var/log/gamesmith-backup.log 2>&1
```

Restore (to a fresh stack):

```bash
$COMPOSE up -d postgres
$COMPOSE exec -T postgres pg_restore -U gamesmith -d gamesmith --clean --if-exists < db-<stamp>.dump
docker run --rm -v gamesmith-prod_snapshots:/data -v $PWD:/in alpine tar -xzf /in/snapshots-<stamp>.tar.gz -C /data
$COMPOSE up -d
```

Test a restore once before launch.

## 7. Operations

| Task | Command |
|---|---|
| Logs | `$COMPOSE logs -f app worker sandbox-manager` |
| Running sandboxes | `docker ps --filter label=gamesmith.sandbox` |
| One housekeeping pass now | `$COMPOSE exec worker node --conditions=react-server --import tsx scripts/housekeeping.mts` |
| Database shell | `$COMPOSE exec postgres psql -U gamesmith` |
| More agent capacity | `$COMPOSE up -d --scale worker=2` (each runs `AGENT_CONCURRENCY` runs) |
| More sandboxes | raise `SANDBOX_MAX_RUNNING` (about 1 GB RAM and 1 CPU each, at most) |
| Rotate the key-encryption key | put the new entry first: `KEY_ENCRYPTION_KEYS=2:<new>,1:<old>`, restart; keys re-encrypt as they're used |

Housekeeping (in the worker, every minute) fails stale agent runs and
refunds their sparks, purges games deleted more than 30 days ago (sandbox,
workspace, snapshots, then rows), purges deleted accounts' games at once,
cancels subscriptions of accounts deleted from the Clerk dashboard, and
drops orphaned published builds.

### Limits that protect the VM

- Sandboxes: 1 GB RAM, 1 CPU, 256 processes, no network, read-only root,
  gVisor, stopped after 15 idle minutes, at most `SANDBOX_MAX_RUNNING`.
- Game source: 4 MB per file, 100 MB and 5,000 files per workspace.
- Published builds: 40 MB and 2,000 files; 20 publishes per user per hour.
- Agent runs: one per game, 40 steps, 15 minutes, 12 painted images.
- Sandbox starts: 30 per user per 10 minutes.

Rate limits are kept in the app's memory, which is right for the one app
container this stack runs. Before running several app containers, move
`lib/server/rate-limit.ts` to Redis.

## 8. Incidents

| Symptom | Look at |
|---|---|
| `/api/health` 503 | `$COMPOSE ps`; which of `db` / `redis` is down; `$COMPOSE logs postgres redis` |
| "The sandbox had a problem" | `$COMPOSE logs sandbox-manager`; disk space (`df -h`, `docker system df`) |
| Previews blank | `$COMPOSE logs sandbox-proxy caddy`; `PREVIEW_DOMAIN` DNS and certificate |
| Published games 404 | `PUBLISHED_ORIGIN` matches `PLAY_DOMAIN`; the game is shared by link |
| Agent runs never start | `$COMPOSE logs worker`; Redis health |
| Disk filling | `docker system prune` (not volumes); old backups in `/var/backups/gamesmith` |

Errors go to Sentry when `SENTRY_DSN` is set, and always to the container logs.
