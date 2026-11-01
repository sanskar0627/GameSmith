#!/bin/sh
# Nightly backup of the production stack (run from the repo on the VM, as root):
#   crontab: 17 3 * * *  cd /opt/gamesmith && ./scripts/backup.sh >> /var/log/gamesmith-backup.log 2>&1
#
# Writes a Postgres dump (published games live in it too) and a tarball of the
# sandbox snapshots volume to $BACKUP_DIR, keeps $KEEP_DAYS days, and, when
# rclone has a remote named in $BACKUP_REMOTE (e.g. "r2:gamesmith-backups"),
# copies them off the machine.
set -eu

BACKUP_DIR=${BACKUP_DIR:-/var/backups/gamesmith}
KEEP_DAYS=${KEEP_DAYS:-14}
COMPOSE="docker compose -f compose.prod.yml --env-file .env.production"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
umask 077

echo "[backup] $STAMP database"
$COMPOSE exec -T postgres pg_dump -U gamesmith -d gamesmith --format=custom --compress=6 > "$BACKUP_DIR/db-$STAMP.dump"

echo "[backup] $STAMP snapshots"
docker run --rm -v gamesmith-prod_snapshots:/data:ro -v "$BACKUP_DIR":/out alpine \
  tar -czf "/out/snapshots-$STAMP.tar.gz" -C /data .

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete

if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  echo "[backup] copying to $BACKUP_REMOTE"
  rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --include "*-$STAMP.*"
fi
echo "[backup] done"
