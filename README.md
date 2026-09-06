# 方块寄售平台

Minecraft / Hypixel 正版账号寄售信息平台 Demo。

平台用于展示账号信息，并提供审核、意向单排队和人工中介撮合流程。平台不经手交易资金，也不托管用户的 Minecraft 账号。

> 本项目与 Mojang、Microsoft、Hypixel 及其关联公司无关。仓库当前主要用于功能演示和技术评审。

## 功能

- 用户注册、登录、邮箱验证码和账号安全设置
- 账号发布、截图上传、审核、违禁词检测和水印处理
- 游客与登录用户的分级信息展示
- 意向单排队、中介分派、交易状态流转和操作记录
- 信用分、中介费阶梯、质保和售后处理
- 求购发布、推荐、撤回、关闭和恢复
- 站内通知、未读提醒和可选的邮件推送
- 管理后台：账号、发布、订单、求购、配置、违禁词和审计日志
- Hypixel 数据面板，可切换为本地模拟数据

## 技术栈

- Next.js 16 · App Router · Server Actions
- React 19 · TypeScript · Tailwind CSS v4
- PostgreSQL 17 · Drizzle ORM
- sharp：截图压缩和水印
- nodemailer：邮箱验证码和通知邮件
- Vitest · Playwright：单元测试和端到端测试

## 本地运行

### 环境要求

- Node.js 22+
- pnpm 11.8.0
- PostgreSQL 17

### 安装与初始化

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
pnpm install
cp .env.example .env
```

编辑 `.env`，至少确认 `DATABASE_URL` 指向一个可用的 PostgreSQL 数据库。开发环境可以保留示例中的 `SESSION_SECRET`；生产环境必须换成随机长字符串。

然后执行数据库迁移和初始化：

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

打开 <http://localhost:3000>。

Windows 如果使用项目附带的便携 PostgreSQL 辅助脚本，可以先设置 `PG_HOME`，再执行：

```powershell
$env:PG_HOME = 'D:\path\to\pgsql'
pnpm db:init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

也可以直接使用本机安装的 PostgreSQL 或 Docker，只要 `.env` 中的 `DATABASE_URL` 正确即可。

### 本地演示账号

需要体验买家、卖家和中介角色时执行：

```bash
pnpm db:demo
```

该脚本只允许在非生产环境运行，会创建或重置三个本地演示账号，并在终端打印登录信息。不要在生产数据库执行，也不要把生产账号密码写进 README 或提交到仓库。

### 可选配置

| 配置 | 用途 |
|---|---|
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | 邮箱验证码和通知邮件；留空时验证码打印到开发终端 |
| `HYPIXEL_API_KEY` | 启用 Hypixel 官方数据查询 |
| `HYPIXEL_MOCK=1` | 本地演示使用模拟 Hypixel 数据 |
| `UPLOAD_DIR` | 用户截图保存目录，默认是项目根目录下的 `uploads` |
| `SITE_URL` | 站点地址，用于邮件链接和 SEO 文件 |

完整配置项和说明见 [.env.example](.env.example)。`.env`、上传文件、依赖目录和构建产物不会提交到 Git。

## 生产部署

### Docker Compose

项目根目录提供了 `Dockerfile`、`docker-compose.yml` 和 `Caddyfile`，包含 PostgreSQL、数据库迁移、Next.js 应用、Caddy HTTPS 和备份服务。

```bash
cp .env.production.example .env.production
```

编辑 `.env.production`，生产环境至少要设置：

- `DOMAIN` 和 `SITE_URL`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`，Docker Compose 中的数据库主机应填写 `db`
- 长度至少 32 位的 `SESSION_SECRET`
- 长度至少 12 位且非默认值的 `ADMIN_PASSWORD`
- `SMTP_*`，否则用户无法通过邮箱注册

确认域名 DNS 已指向服务器后启动：

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production logs -f migrate
docker compose --env-file .env.production ps
```

境外服务器部署时，`ICP_NUMBER`、`PSB_NUMBER` 和 `COMPANY_NAME` 可以留空；正式域名仍需要正确解析，Caddy 才能申请 HTTPS 证书。

更完整的部署、更新、备份和恢复说明见：

- [Docker 部署](deploy/docker.md)
- [Linux 部署](deploy/README.md)

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产版本 |
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm test:e2e` | 运行 Playwright 端到端测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:seed` | 初始化游戏模板、配置、违禁词和管理员 |
| `pnpm db:demo` | 创建本地演示账号 |

## 目录结构

```text
src/app/          页面、路由和 API
src/actions/      Server Actions
src/components/   React UI 组件
src/db/           Drizzle schema 和数据库连接
src/lib/          认证、通知、上传、规则和第三方数据服务
drizzle/          数据库迁移
scripts/          本地数据库、初始化和端到端测试脚本
deploy/           Linux、Docker 和备份部署文件
docs/             数据模型、开发进度和文案规范
public/           静态资源
```

## 当前边界

- 平台只记录信息、状态和撮合过程，不代收代付。
- 平台不保存或托管 Minecraft 登录凭据。
- 短信验证和第三方登录暂未接入。
- 限流当前基于单进程内存，多实例部署时需要替换为共享存储方案。
- 本仓库暂未附带开源许可证，代码仅供演示和评审使用。

## 状态

当前主流程已完成，单元测试、端到端测试、类型检查和 lint 均已配置。公开仓库用于展示代码结构和产品 Demo，线上实例与生产配置不包含在仓库内。
