#!/bin/bash
# 一键更新 / 首次上线：拉代码 → 装依赖 → 构建到临时目录 → 迁移数据库 → 种子 → 秒级切换 → 健康检查，失败自动回滚。
# 用法（root 执行）：bash /opt/mc-consign/deploy/linux/update.sh
#   SKIP_PULL=1  不 git pull（用 scp/rsync 上传代码时用）
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/mc-consign}
APP_USER=${APP_USER:-mc}
SERVICE=mc-consign
PORT=${PORT:-3000}

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H env HOME="/var/lib/${APP_USER}" "$@"; }
# 在应用用户身份下、带上 .env.production 的变量执行一条命令
with_env() { as_app bash -c "set -a; . '$APP_DIR/.env.production'; set +a; export NODE_ENV=production; cd '$APP_DIR'; $*"; }

[ "$(id -u)" -eq 0 ] || die "请用 root 执行"
cd "$APP_DIR"
[ -f .env.production ] || die "缺少 $APP_DIR/.env.production，先跑 install.sh"
grep -Eq '^ADMIN_PASSWORD=.{12,}' .env.production || die ".env.production 里 ADMIN_PASSWORD 为空或短于 12 位"
grep -Eq '^SESSION_SECRET=.{32,}' .env.production || die ".env.production 里 SESSION_SECRET 为空或短于 32 位"

if [ "${SKIP_PULL:-0}" != "1" ] && [ -d .git ]; then
  log "拉取代码"
  as_app git -C "$APP_DIR" pull --ff-only
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "安装依赖"
as_app pnpm --dir "$APP_DIR" install --frozen-lockfile

log "构建到 .next-build（线上服务不受影响）"
rm -rf "$APP_DIR/.next-build"
with_env "NEXT_DIST_DIR=.next-build pnpm build"

log "数据库迁移与种子（种子只补缺失的模板、配置和首个超管，可重复执行）"
with_env "pnpm exec drizzle-kit migrate"
with_env "pnpm exec tsx scripts/seed.ts"

log "切换到新构建并重启服务"
systemctl stop "$SERVICE" || true
rm -rf "$APP_DIR/.next.old"
[ -d "$APP_DIR/.next" ] && mv "$APP_DIR/.next" "$APP_DIR/.next.old"
mv "$APP_DIR/.next-build" "$APP_DIR/.next"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next"
systemctl start "$SERVICE"

log "健康检查"
ok=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1.5
done
if [ "$ok" = "1" ]; then
  rm -rf "$APP_DIR/.next.old"
  systemctl reload caddy 2>/dev/null || true
  echo "上线成功：$(curl -fsS "http://127.0.0.1:${PORT}/api/health")"
  systemctl --no-pager --lines=0 status "$SERVICE" | head -3
else
  echo "健康检查失败，最近日志："
  journalctl -u "$SERVICE" -n 40 --no-pager || true
  if [ -d "$APP_DIR/.next.old" ]; then
    log "回滚到上一版构建"
    systemctl stop "$SERVICE" || true
    rm -rf "$APP_DIR/.next.failed"
    mv "$APP_DIR/.next" "$APP_DIR/.next.failed"
    mv "$APP_DIR/.next.old" "$APP_DIR/.next"
    systemctl start "$SERVICE"
    echo "已回滚。失败的构建保留在 .next.failed 供排查。"
  fi
  die "更新失败"
fi
