/**
 * 初始化数据：MC 游戏模板、默认配置、违禁词、首个超管。可重复执行。
 * 用法：pnpm db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { MC_ATTR_SCHEMA, MC_GAME_CODE, MC_GAME_NAME, MC_TITLE_TEMPLATE } from "../src/lib/games/mc";
import { DEFAULT_BANNED_WORDS } from "../src/lib/banned-words";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_FEE_TIERS } from "../src/lib/fee";

const SETTING_DEFAULTS: Record<string, unknown> = {
  fee_tiers: DEFAULT_FEE_TIERS,
  warranty_days: 7,
  max_active_listings: 10,
  min_credit_to_list: 60,
  max_open_orders: 3,
  no_show_limit: 3,
  no_show_lock_days: 30,
  credit_penalty_aftersale: 50,
  credit_penalty_no_show: 5,
  show_sold_price: true,
  announcement: "",
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });

  await db
    .insert(schema.games)
    .values({
      code: MC_GAME_CODE,
      name: MC_GAME_NAME,
      attrSchema: MC_ATTR_SCHEMA,
      titleTemplate: MC_TITLE_TEMPLATE,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: schema.games.code,
      set: { name: MC_GAME_NAME, attrSchema: MC_ATTR_SCHEMA, titleTemplate: MC_TITLE_TEMPLATE },
    });
  console.log("游戏模板 mc 已就绪");

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }
  console.log("默认配置已就绪（已存在的不覆盖）");

  for (const word of DEFAULT_BANNED_WORDS) {
    await db.insert(schema.bannedWords).values({ word }).onConflictDoNothing();
  }
  console.log(`违禁词已就绪：${DEFAULT_BANNED_WORDS.join("、")}`);

  const isProd = process.env.NODE_ENV === "production";
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
  if (admin) {
    console.log(`已存在超管：${admin.username}，跳过创建`);
    // 本地开发库不强制改密，免得每次演示都被拦；生产库保持为空，超管登录后必须改
    if (!isProd && !admin.passwordChangedAt) {
      await db.update(schema.users).set({ passwordChangedAt: new Date() }).where(eq(schema.users.id, admin.id));
      console.log("开发环境：已标记超管密码为已设置，不触发强制改密");
    }
  } else {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin12345";
    if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_PASSWORD || password === "admin12345" || password.length < 12)) {
      throw new Error("生产环境创建超管必须通过 ADMIN_PASSWORD 指定至少 12 位的非默认密码");
    }
    const qq = process.env.ADMIN_QQ || "10001";
    const phone = process.env.ADMIN_PHONE || "13800000000";
    await db.insert(schema.users).values({
      username,
      passwordHash: await hashPassword(password),
      qq,
      qqVerifiedAt: new Date(),
      phone,
      role: "admin",
    });
    console.log(`已创建超管 ${username}（QQ ${qq}），请尽快登录后台修改密码`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
