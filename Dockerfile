# syntax=docker/dockerfile:1
# 三个可用目标：
#   runner   —— 生产应用（默认），Next standalone 输出，非 root 运行
#   migrator —— 一次性任务：执行数据库迁移 + 初始化种子（游戏模板、默认配置、首个超管）
# docker-compose.yml 已经按目标编排好，一般不需要手动 build。

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Shanghai
RUN npm install -g pnpm@11.8.0 && apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- 依赖 ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM deps AS builder
COPY . .
# 构建期不需要真实数据库；页面全部是动态渲染，不会在构建时查库
ENV BUILD_STANDALONE=1
RUN pnpm build

# ---------- 迁移 / 种子（一次性容器） ----------
FROM deps AS migrator
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY src/db ./src/db
COPY src/lib ./src/lib
COPY src/actions/types.ts ./src/actions/types.ts
COPY scripts/seed.ts ./scripts/seed.ts
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && pnpm exec tsx scripts/seed.ts"]

# ---------- 运行 ----------
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
