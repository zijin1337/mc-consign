# Docker 部署（备选方案）

推荐的部署方式是纯 Linux 命令行，见 `deploy/README.md`。这份是 Docker Compose 的备选，仓库里的 `Dockerfile`、`docker-compose.yml`、`Caddyfile`、`deploy/backup.sh` 都是给它用的。国内服务器拉镜像前要先给 Docker 配镜像加速器，否则第一步就会卡住。

## 启动

```bash
cp .env.production.example .env.production   # DATABASE_URL 用 db 主机名，UPLOAD_DIR 用 /data/uploads
nano .env.production
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production logs -f migrate   # 迁移与种子，跑完自动退出
docker compose --env-file .env.production ps                # app 应为 healthy
```

服务：`db`（PostgreSQL 17）→ `migrate`（迁移 + 种子，跑完即退）→ `app`（Next.js 独立输出，非 root）→ `caddy`（自动 HTTPS）；`backup` 每天 4 点备份到 `backups/`。

## 更新

```bash
git pull
docker compose --env-file .env.production up -d --build
```

## 备份与恢复

```bash
docker compose --env-file .env.production exec backup sh /backup.sh
docker compose --env-file .env.production stop app
gunzip -c backups/db-20260905-040000.sql.gz | docker compose --env-file .env.production exec -T db psql -U mc -d mc_consign
docker compose --env-file .env.production start app
docker compose --env-file .env.production run --rm -v "$PWD/backups:/backups:ro" app sh -c "tar -xzf /backups/uploads-20260905-040000.tar.gz -C /data"
```

## 排错

| 现象 | 处理 |
|---|---|
| 拉镜像超时 | 给 Docker 配国内镜像加速器（阿里云容器镜像服务里有免费地址） |
| `app` 起不来，日志有「启动自检未通过」 | `SESSION_SECRET` 太短或 `DATABASE_URL` 没填 |
| `migrate` 报「生产环境创建超管必须…」 | `ADMIN_PASSWORD` 为空、太短或还是默认值 |
| Caddy 证书申请失败 | 域名没解析到本机、80/443 被占、或备案未通过导致运营商拦截 |
