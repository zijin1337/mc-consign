# 部署手册（纯 Linux 命令行）

一台 2 核 4G 的国内云服务器，Ubuntu 22.04 / 24.04 或 Debian 12。不用 Docker：Node.js 22 直接跑网站，PostgreSQL 17 装成系统服务，systemd 守护进程，Caddy 反向代理并自动申请 HTTPS，cron 每日备份。脚本都在 `deploy/linux/`。Docker 备选方案见 `deploy/docker.md`。

## 一、代码怎么上服务器

推荐用 Git。在本机项目目录（Windows PowerShell）：

```powershell
git init
git add .
git commit -m "init"
git remote add origin https://gitee.com/你的账号/mc-consign.git   # Gitee 私有仓库，国内快
git push -u origin master
```

`.gitignore` 已经排除了 `.env`、`uploads`、`node_modules`、`.next`，不会把密钥和图片推上去。以后改了代码就 `git add . && git commit -m "..." && git push`。

不想用 Git 也可以直接传目录（排除大文件夹），在本机执行：

```powershell
scp -r ./* root@服务器IP:/opt/mc-consign/
```

传目录时记得不要带上 `node_modules`、`.next`、`uploads`、`.local`、`.env`。

## 二、一次性安装

SSH 登录服务器，root 身份执行。用 Git 的写法：

```bash
apt-get update && apt-get install -y git
git clone https://gitee.com/你的账号/mc-consign.git /opt/mc-consign
DOMAIN=example.com bash /opt/mc-consign/deploy/linux/install.sh
```

备案还没下来、先用 IP 测试，就不传 `DOMAIN`（脚本默认 `:80`，只走 HTTP）。

脚本做的事：装 Node 22 与 pnpm、装 PostgreSQL 17 并建库建用户（密码随机生成，存在 `/root/.mc-consign-db-password`）、装 Caddy 并写好站点配置、建系统用户 `mc`、生成 `/opt/mc-consign/.env.production`（数据库连接串与会话密钥已填好）、注册 systemd 服务、每天 4 点备份、防火墙放开 22/80/443。内存小于 4G 会自动补 2G swap 保证构建不被杀。

## 三、填配置并首次上线

```bash
nano /opt/mc-consign/.env.production
```

必填：

| 变量 | 说明 |
|---|---|
| `ADMIN_PASSWORD` `ADMIN_QQ` `ADMIN_PHONE` | 首个超管。密码至少 12 位，不能是默认值，否则初始化拒绝执行 |
| `SMTP_HOST` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | 发验证码和通知的邮箱。QQ 邮箱要用「授权码」不是登录密码。不填能启动，但用户注册不了 |
| `SITE_URL` | 邮件里链接的站点地址，脚本按域名或 IP 填了，确认一下 |

然后：

```bash
bash /opt/mc-consign/deploy/linux/update.sh
```

这条命令负责拉依赖、构建、迁移数据库、创建超管、启动服务、健康检查。看到「上线成功」就可以打开浏览器访问了。第一次登录后台会强制先改一次密码，然后到「后台 → 系统配置」点「给我发一封测试邮件」确认邮箱通了，再填中介费阶梯和质保天数。

云服务器控制台的安全组同样要放开 80 和 443。

## 四、日常运维

| 要做什么 | 命令 |
|---|---|
| 更新代码上线 | `bash /opt/mc-consign/deploy/linux/update.sh`（Git 方式会自动 pull；scp 上传后加 `SKIP_PULL=1`） |
| 看运行状态 | `systemctl status mc-consign` |
| 看实时日志 | `journalctl -u mc-consign -f` |
| 改了 .env.production | `systemctl restart mc-consign` |
| 重启网站 | `systemctl restart mc-consign` |
| 看 Caddy 状态 / 日志 | `systemctl status caddy`，`tail -f /var/log/caddy/access.log` |
| 手动备份一次 | `mc-consign-backup` |
| 进数据库 | `sudo -u postgres psql mc_consign` |

更新时先在临时目录构建，旧版本继续服务，构建完成后停机几秒切换。健康检查不通过会自动回滚到上一版，失败的构建留在 `.next.failed` 供排查。

## 五、备份与恢复

每天凌晨 4 点自动备份到 `/var/backups/mc-consign/`：数据库 `db-*.sql.gz`、上传图片 `uploads-*.tar.gz`、配置文件 `env-*.bak`，默认保留 14 天（`.env.production` 里的 `BACKUP_KEEP_DAYS`）。建议再用云厂商的快照或对象存储把这个目录异地同步一份。

恢复数据库（会覆盖当前数据）：

```bash
systemctl stop mc-consign
sudo -u postgres psql -c "drop database mc_consign" -c "create database mc_consign owner mc"
gunzip -c /var/backups/mc-consign/db-20260905-040000.sql.gz | sudo -u postgres psql mc_consign
systemctl start mc-consign
```

恢复上传图片：

```bash
tar -xzf /var/backups/mc-consign/uploads-20260905-040000.tar.gz -C /opt/mc-consign
chown -R mc:mc /opt/mc-consign/uploads
```

## 六、备案与页脚

企业 ICP 备案通过后：

1. `nano /etc/caddy/Caddyfile`，把第一行的 `:80` 改成域名，`caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`，证书自动申请。
2. `.env.production` 里 `SITE_URL` 改成 `https://域名`，填 `ICP_NUMBER`、`PSB_NUMBER`、`COMPANY_NAME`，`systemctl restart mc-consign`。页脚会显示备案号并链接到工信部与公安备案查询页。

## 七、排错

| 现象 | 处理 |
|---|---|
| `update.sh` 报 `ADMIN_PASSWORD` 或 `SESSION_SECRET` 太短 | 编辑 `.env.production` 补齐 |
| 服务起不来，日志有「启动自检未通过」 | `journalctl -u mc-consign -n 50`，按提示补配置 |
| 构建阶段被杀（日志 Killed） | 内存不够，`free -h` 看 swap 是否生效，或临时升配 |
| 注册收不到验证码 | 后台系统配置里发测试邮件看报错；确认用的是邮箱授权码 |
| Caddy 证书申请失败 | 域名没解析到本机、80/443 被占、或备案未通过被运营商拦截 |
| 上传图片 413 | 单张超 5MB；Caddy 层上限 12MB |
| pnpm 安装很慢 | 脚本默认已切国内镜像；检查 `npm config get registry` |

## 八、需要知道的边界

- 限流（登录、验证码、上传）是应用进程内存实现，systemd 只跑一个进程，正好。将来扩多台机器要换 Redis，只改 `src/lib/rate-limit.ts`。
- 通知邮件在事务提交后由发件箱发出，靠 Caddy 每 30 秒的健康探测顺带触发，所以 Caddy 必须在跑。
- 时间统一按 `SITE_TZ`（上海）显示，与服务器系统时区无关。
