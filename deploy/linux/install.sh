#!/bin/bash
# 一次性安装脚本：在一台干净的 Ubuntu 22.04 / 24.04 或 Debian 12 上装好 Node 22、PostgreSQL 17、Caddy，
# 建系统用户、数据库、systemd 服务、每日备份，生成 .env.production 骨架。
# 用法（root 执行）：
#   bash install.sh
# 可选环境变量：
#   REPO_URL=https://gitee.com/xxx/mc-consign.git   代码仓库；留空表示代码已经放在 /opt/mc-consign
#   DOMAIN=example.com                              域名；留空或 :80 表示先用 IP 走 HTTP
#   USE_CN_MIRROR=1                                 用国内 npm 镜像（默认 1）
# 跑完后按提示编辑 /opt/mc-consign/.env.production，再执行 deploy/linux/update.sh 完成首次上线。
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/mc-consign}
APP_USER=${APP_USER:-mc}
DB_NAME=${DB_NAME:-mc_consign}
DB_USER=${DB_USER:-mc}
REPO_URL=${REPO_URL:-}
DOMAIN=${DOMAIN:-:80}
USE_CN_MIRROR=${USE_CN_MIRROR:-1}
NODE_MAJOR=22
PG_VERSION=17
PNPM_VERSION=11.8.0

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 执行：sudo bash install.sh"
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) die "只支持 Ubuntu / Debian，当前是 ${ID:-未知}" ;; esac
export DEBIAN_FRONTEND=noninteractive

log "1/9 基础工具"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg lsb-release ufw openssl rsync

log "2/9 内存不足 4G 时补 2G swap（构建时需要）"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "已启用 2G swap"
else
  echo "内存 ${MEM_MB}MB，跳过"
fi

log "3/9 Node.js ${NODE_MAJOR} 与 pnpm ${PNPM_VERSION}"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm install -g "pnpm@${PNPM_VERSION}" >/dev/null
if [ "$USE_CN_MIRROR" = "1" ]; then
  npm config set -g registry https://registry.npmmirror.com >/dev/null 2>&1 || true
fi
echo "node $(node -v), pnpm $(pnpm -v)"

log "4/9 PostgreSQL ${PG_VERSION}"
if ! command -v psql >/dev/null || ! psql --version | grep -q " ${PG_VERSION}\."; then
  apt-get install -y postgresql-common
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -y "postgresql-${PG_VERSION}" "postgresql-client-${PG_VERSION}"
fi
systemctl enable --now postgresql
DB_PASS_FILE=/root/.mc-consign-db-password
if [ ! -f "$DB_PASS_FILE" ]; then
  openssl rand -hex 24 > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "create role ${DB_USER} login password '${DB_PASS}'"
else
  sudo -u postgres psql -c "alter role ${DB_USER} with password '${DB_PASS}'"
fi
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" -E UTF8 --locale=C.UTF-8 -T template0 "${DB_NAME}"
fi
echo "数据库 ${DB_NAME} 就绪，密码保存在 ${DB_PASS_FILE}"

log "5/9 Caddy"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

log "6/9 系统用户与代码目录"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/var/lib/${APP_USER}" --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  [ -z "$(ls -A "$APP_DIR")" ] || die "$APP_DIR 不是空目录，又指定了 REPO_URL，请先清空或去掉 REPO_URL"
  git clone "$REPO_URL" "$APP_DIR"
fi
[ -f "$APP_DIR/package.json" ] || die "$APP_DIR 里没有代码。要么设置 REPO_URL 让脚本 clone，要么先把项目上传到这个目录"
mkdir -p "$APP_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
# 让 mc 用户在这个目录里也用国内镜像
[ "$USE_CN_MIRROR" = "1" ] && sudo -u "$APP_USER" -H npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true

log "7/9 生成 .env.production（已存在则不动）"
ENV_FILE="$APP_DIR/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  SITE_URL="https://${DOMAIN}"
  [ "$DOMAIN" = ":80" ] && SITE_URL="http://$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  sed -e "s#^DOMAIN=.*#DOMAIN=${DOMAIN}#" \
      -e "s#^SITE_URL=.*#SITE_URL=${SITE_URL}#" \
      -e "s#^DATABASE_URL=.*#DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}#" \
      -e "s#^POSTGRES_USER=.*#POSTGRES_USER=${DB_USER}#" \
      -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${DB_PASS}#" \
      -e "s#^POSTGRES_DB=.*#POSTGRES_DB=${DB_NAME}#" \
      -e "s#^SESSION_SECRET=.*#SESSION_SECRET=$(openssl rand -hex 32)#" \
      -e "s#^UPLOAD_DIR=.*#UPLOAD_DIR=${APP_DIR}/uploads#" \
      "$APP_DIR/.env.production.example" > "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "已生成 $ENV_FILE，数据库与会话密钥已填好"
else
  echo "$ENV_FILE 已存在，保留"
fi

log "8/9 systemd 服务、Caddy 站点、每日备份"
install -m 644 "$APP_DIR/deploy/linux/mc-consign.service" /etc/systemd/system/mc-consign.service
sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__APP_USER__#${APP_USER}#g" -i /etc/systemd/system/mc-consign.service
systemctl daemon-reload
systemctl enable mc-consign >/dev/null
sed -e "s#__DOMAIN__#${DOMAIN}#g" "$APP_DIR/deploy/linux/Caddyfile.template" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl enable --now caddy >/dev/null
systemctl reload caddy || systemctl restart caddy
install -m 755 "$APP_DIR/deploy/linux/backup.sh" /usr/local/bin/mc-consign-backup
mkdir -p /var/backups/mc-consign
cat > /etc/cron.d/mc-consign-backup <<EOF
# 每天凌晨 4 点备份数据库与上传目录，保留 BACKUP_KEEP_DAYS 天
0 4 * * * root APP_DIR=${APP_DIR} /usr/local/bin/mc-consign-backup >> /var/log/mc-consign-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/mc-consign-backup

log "9/9 防火墙：放开 SSH、80、443"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -8

cat <<EOF

================ 安装完成，还差两步 ================
1. 编辑配置，至少填 ADMIN_PASSWORD（至少 12 位）、ADMIN_QQ、ADMIN_PHONE 和 SMTP_*：
     nano ${ENV_FILE}
2. 首次上线（拉依赖、构建、迁移、建超管、启动）：
     bash ${APP_DIR}/deploy/linux/update.sh

之后每次更新代码也只需执行 update.sh。
域名：${DOMAIN}$( [ "$DOMAIN" = ":80" ] && printf '（目前是 IP 直连 HTTP，备案通过后把 /etc/caddy/Caddyfile 第一行改成域名并 systemctl reload caddy）' )
云服务器控制台的安全组也要放开 80 / 443。
EOF
