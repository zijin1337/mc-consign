/**
 * 生成本地演示账号：卖家、买家、中介。已存在则重置密码并解封。可重复执行。
 * 用法：pnpm db:demo
 * 只用于本地 / 测试环境，QQ 号是占位，不要在生产库执行。
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/lib/password";

const DEMO = [
  { username: "演示卖家", password: "seller12345", qq: "20001", phone: "13800000001", role: "user" as const },
  { username: "演示买家", password: "buyer12345", qq: "20002", phone: "13800000002", role: "user" as const },
  { username: "演示中介", password: "agent12345", qq: "20003", phone: "13800000003", role: "agent" as const },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("演示账号脚本只能在本地开发库运行");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });

  for (const d of DEMO) {
    const passwordHash = await hashPassword(d.password);
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, d.username))
      .limit(1);
    if (existing) {
      await db
        .update(schema.users)
        .set({ passwordHash, role: d.role, status: "active", banReason: null, banUntil: null, noShowLockedUntil: null })
        .where(eq(schema.users.id, existing.id));
      console.log(`已重置 ${d.username} 的密码`);
    } else {
      await db.insert(schema.users).values({
        username: d.username,
        passwordHash,
        qq: d.qq,
        qqVerifiedAt: new Date(),
        phone: d.phone,
        role: d.role,
        agentIntro: d.role === "agent" ? "演示中介，本地测试用" : null,
      });
      console.log(`已创建 ${d.username}`);
    }
    const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.username, d.username));
    if (!(await verifyPassword(d.password, row.passwordHash))) throw new Error(`${d.username} 密码校验失败`);
  }

  console.log("\n用户名 | 密码 | QQ | 角色");
  for (const d of DEMO) console.log(`${d.username} | ${d.password} | ${d.qq} | ${d.role}`);
  console.log(`admin | ${process.env.ADMIN_PASSWORD ?? "(见 .env ADMIN_PASSWORD)"} | ${process.env.ADMIN_QQ ?? "10001"} | admin`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
