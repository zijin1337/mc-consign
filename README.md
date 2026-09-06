# 方块寄售平台

Minecraft / Hypixel 正版账号寄售信息平台。产品大纲与数据模型见 `docs/`。

## 技术栈

Next.js 16（App Router，Server Actions）· TypeScript · Tailwind v4 · PostgreSQL 17 · Drizzle ORM · sharp（截图压缩加水印）· nodemailer（QQ 邮箱验证码）

## 本地开发

```bash
pnpm install
cp .env.example .env          # 按需修改
pnpm db:init                  # 首次：初始化便携版 PostgreSQL 并建库（见 scripts/dev-db.ps1）
pnpm db:migrate               # 建表
pnpm db:seed                  # MC 模板、默认配置、违禁词、首个超管
pnpm dev                      # http://localhost:3000
```

便携版 PostgreSQL 放在 `D:\Cat\pg17\pgsql`，可用环境变量 `PG_HOME` 指定别的位置。日常用 `pnpm db:up` / `pnpm db:down` 启停。

SMTP 留空时验证码直接打印到 `pnpm dev` 的终端，方便本地注册。

首个超管由 `.env` 里的 `ADMIN_*` 决定，默认 `admin / admin12345`，上线前必须改。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `pnpm test` | 业务规则单元测试（打码、中介费、信用分、违禁词） |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | 改了 `src/db/schema.ts` 后生成迁移 |
| `pnpm db:migrate` | 应用迁移 |
| `pnpm db:studio` | Drizzle Studio 看数据 |
| `DEV_LOG=<dev输出文件> pnpm exec tsx scripts/e2e.ts` | 用本机 Edge 跑端到端冒烟测试 |

## 目录

```
docs/            产品大纲、数据模型
drizzle/         SQL 迁移
scripts/         本地数据库、seed、e2e
src/db/          Drizzle schema 与连接
src/lib/         业务规则与服务端工具（auth、settings、upload、notify…）
src/actions/     Server Actions（auth、listings、admin、me）
src/components/  UI 组件
src/app/         页面：/ 列表，/listings/[id] 详情，/sold 已完成，/sell 发布，/me 我的，/admin 后台
uploads/         用户截图（已加水印，原图不保留）
```

## 部署（计划）

单台国内服务器，Docker Compose 跑 app + PostgreSQL + Caddy。`next.config.ts` 已设 `output: "standalone"`。
