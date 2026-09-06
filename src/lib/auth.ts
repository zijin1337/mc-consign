import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

export const SESSION_COOKIE = "mc_session";
const SESSION_DAYS = 30;

export type SafeUser = Omit<User, "passwordHash">;
export type Role = User["role"];

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 当前请求会话的 token 哈希，改密码时用来保留本次登录、踢掉其他设备 */
export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const raw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return raw && isIP(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent")?.slice(0, 500) ?? null;
  } catch {}
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: await clientIp(),
    userAgent,
  });
  // 顺手清掉已过期的会话，表不会无限增长
  db.delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .catch(() => {});
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  }
  c.delete(SESSION_COOKIE);
}

function strip(u: User): SafeUser {
  const { passwordHash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

/** 当前登录用户，同一次渲染内缓存。未登录返回 null。封禁到期自动解封。 */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0]?.user;
  if (!u) return null;
  if (u.status === "banned" && u.banUntil && u.banUntil <= new Date()) {
    await db
      .update(schema.users)
      .set({ status: "active", banReason: null, banUntil: null })
      .where(eq(schema.users.id, u.id));
    return strip({ ...u, status: "active", banReason: null, banUntil: null });
  }
  return strip(u);
});

export function isBanned(u: SafeUser | null): boolean {
  return !!u && u.status === "banned";
}

/** 超管还在用初始口令（从未自己改过密码）时，除改密页外一律先去改密 */
export function mustChangePassword(u: SafeUser): boolean {
  return u.role === "admin" && !u.passwordChangedAt;
}

/**
 * 必须登录，否则跳登录页并带回跳地址。被封禁跳封禁页。
 * 超管未改初始口令时强制跳改密页，改密页自己传 skipPasswordGate。
 */
export async function requireUser(next?: string, opts: { skipPasswordGate?: boolean } = {}): Promise<SafeUser> {
  const u = await getCurrentUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (isBanned(u)) redirect("/banned");
  if (!opts.skipPasswordGate && mustChangePassword(u)) redirect("/me/password?force=1");
  return u;
}

export async function requireRole(roles: Role[], next?: string): Promise<SafeUser> {
  const u = await requireUser(next);
  if (!roles.includes(u.role)) redirect("/?denied=1");
  return u;
}

export const isAdmin = (u: SafeUser | null) => u?.role === "admin";
export const isAgent = (u: SafeUser | null) => u?.role === "agent" || u?.role === "admin";
