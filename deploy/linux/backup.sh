#!/bin/bash
# 备份数据库与上传目录到 /var/backups/mc-consign，保留 BACKUP_KEEP_DAYS 天（默认 14）。
# 由 /etc/cron.d/mc-consign-backup 每天 4 点调用，也可以手动执行：mc-consign-backup
# 恢复方法见 deploy/README.md。
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/mc-consign}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/mc-consign}

set -a
. "$APP_DIR/.env.production"
set +a
KEEP=${BACKUP_KEEP_DAYS:-14}
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -6 > "$BACKUP_DIR/db-$TS.sql.gz"
if [ -d "${UPLOAD_DIR:-$APP_DIR/uploads}" ]; then
  tar -czf "$BACKUP_DIR/uploads-$TS.tar.gz" -C "$(dirname "${UPLOAD_DIR:-$APP_DIR/uploads}")" "$(basename "${UPLOAD_DIR:-$APP_DIR/uploads}")"
fi
cp "$APP_DIR/.env.production" "$BACKUP_DIR/env-$TS.bak" && chmod 600 "$BACKUP_DIR/env-$TS.bak"

find "$BACKUP_DIR" -type f \( -name '*.gz' -o -name '*.bak' \) -mtime +"$KEEP" -delete
echo "[backup] $TS ok, $(du -sh "$BACKUP_DIR" | cut -f1) total, keep ${KEEP}d"
