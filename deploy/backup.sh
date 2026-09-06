#!/bin/sh
# 在 backup 容器里运行：数据库全量 dump + 上传目录打包，保留 BACKUP_KEEP_DAYS 天。
# 恢复见 deploy/README.md。
set -eu
TS=$(date +%Y%m%d-%H%M%S)
KEEP=${BACKUP_KEEP_DAYS:-14}
mkdir -p /backups

pg_dump --no-owner --no-privileges | gzip -6 > "/backups/db-$TS.sql.gz"
if [ -d /data/uploads ]; then
  tar -czf "/backups/uploads-$TS.tar.gz" -C /data uploads
fi

find /backups -type f -name '*.gz' -mtime +"$KEEP" -delete
echo "[backup] $TS ok: $(du -sh /backups | cut -f1) total, keep ${KEEP}d"
