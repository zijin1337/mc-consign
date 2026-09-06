import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未设置，请检查 .env");
  return new Pool({ connectionString: url, max: 10 });
}

// 开发环境热重载时复用连接池，避免连接数爆掉
const pool = globalForDb.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
