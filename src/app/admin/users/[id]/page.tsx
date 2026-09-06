import Link from "next/link";
import { parseId } from "@/lib/ids";
import { desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adjustCredit, banUser, setRole, unbanUser, updateAgentProfile } from "@/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, DescList, Input, LinkButton, PageHeader, Select, Textarea, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { idDetail } from "@/lib/eyebrow";
import { LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, ROLE_LABEL, formatDateTime, formatPrice } from "@/lib/labels";

export const metadata = { title: "用户详情" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["admin"], "/admin");
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();
  const { users, listings, creditLogs } = schema;

  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) notFound();
  await audit(me.id, "view_contact", "user", id);

  const [myListings, logs] = await Promise.all([
    db
      .select({ id: listings.id, title: listings.title, price: listings.price, status: listings.status })
      .from(listings)
      .where(sql`${listings.sellerId} = ${id} and ${listings.status} <> 'deleted'`)
      .orderBy(desc(listings.createdAt))
      .limit(50),
    db.select().from(creditLogs).where(eq(creditLogs.userId, id)).orderBy(desc(creditLogs.createdAt)).limit(30),
  ]);
  const isSelf = me.id === u.id;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ADMIN"
        eyebrowDetail={`用户 ${idDetail(u.id, 4)}`}
        title={u.username}
        description={
          <span className="flex items-center gap-2">
            <Badge className="bg-white/10 text-white">{ROLE_LABEL[u.role]}</Badge>
            {u.status === "banned" && <Badge className="bg-rose-400/15 text-rose-300">已封禁</Badge>}
            <span>#{u.id}</span>
          </span>
        }
        actions={<LinkButton href="/admin/users" variant="secondary">返回列表</LinkButton>}
      />
      {u.status === "banned" && (
        <Alert kind="error">
          封禁原因：{u.banReason}。{u.banUntil ? `到 ${formatDateTime(u.banUntil)} 解封` : "永久封禁"}。其 QQ 与手机号已进入注册黑名单。
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="资料（联系方式已记录本次查看）">
          <DescList
            items={[
              { label: "QQ", value: <span className="font-mono">{u.qq}</span> },
              { label: "手机", value: <span className="font-mono">{u.phone}</span> },
              { label: "信用分 / 成交次数", value: `${u.creditScore} / ${u.dealCount}` },
              { label: "爽约次数", value: u.noShowCount },
              { label: "注册时间", value: formatDateTime(u.createdAt) },
              { label: "QQ 验证", value: u.qqVerifiedAt ? formatDateTime(u.qqVerifiedAt) : "未验证" },
            ]}
          />
        </Card>

        <Card title="角色与中介设置">
          <form action={setRole} className="flex items-end gap-2">
            <input type="hidden" name="id" value={u.id} />
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-zinc-400">角色</span>
              <Select name="role" defaultValue={u.role} disabled={isSelf}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </label>
            <SubmitButton variant="secondary" disabled={isSelf} pendingText="保存中…" confirm="降为普通用户会把名下进行中的意向单退回待分派，升为超管会获得全部后台权限。确定修改角色？">
              保存角色
            </SubmitButton>
          </form>
          {isSelf && <p className="mt-1 text-xs text-zinc-500">不能修改自己的角色。</p>}
          {(u.role === "agent" || u.role === "admin") && (
            <form action={updateAgentProfile} className="mt-4 space-y-2 border-t border-white/[0.08] pt-4">
              <input type="hidden" name="id" value={u.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-400">中介简介（买家选中介时看到，60 字内）</span>
                <Input name="agentIntro" defaultValue={u.agentIntro ?? ""} maxLength={60} />
              </label>
              <div className="flex items-center justify-between">
                <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" name="agentAccepting" defaultChecked={u.agentAccepting} />接受新单</label>
                <SubmitButton variant="secondary" pendingText="保存中…">保存中介设置</SubmitButton>
              </div>
            </form>
          )}
        </Card>

        <Card title="信用分调整">
          <form action={adjustCredit} className="space-y-2">
            <input type="hidden" name="id" value={u.id} />
            <div className="flex gap-2">
              <Input name="delta" type="number" placeholder="加填正数，扣填负数" className="w-48" required />
              <Input name="reason" placeholder="原因，用户可见" required className="flex-1" />
            </div>
            <SubmitButton variant="secondary" pendingText="调整中…">调整</SubmitButton>
          </form>
        </Card>

        <Card title={u.status === "banned" ? "解封" : "封禁"}>
          {u.status === "banned" ? (
            <form action={unbanUser}>
              <input type="hidden" name="id" value={u.id} />
              <SubmitButton variant="secondary" pendingText="处理中…">解除封禁并移出黑名单</SubmitButton>
              <p className="mt-2 text-xs text-zinc-500">信用分不会自动恢复，需要的话手动调整。</p>
            </form>
          ) : u.role === "admin" || isSelf ? (
            <p className="text-sm text-zinc-500">超管不能被封禁，请先降为普通用户。</p>
          ) : (
            <form action={banUser} className="space-y-2">
              <input type="hidden" name="id" value={u.id} />
              <Textarea name="reason" placeholder="封禁原因，用户可见" required className="min-h-16" />
              <div className="flex items-center gap-2">
                <Input name="days" type="number" min={0} defaultValue={0} className="w-28" />
                <span className="text-sm text-zinc-500">天，0 为永久</span>
                <SubmitButton variant="danger" className="ml-auto" pendingText="封禁中…" confirm={`封禁会下架其全部账号、清零信用分、退出全部登录，QQ 与手机号进入注册黑名单。确定封禁 ${u.username}？`}>
                  封禁
                </SubmitButton>
              </div>
              <p className="text-xs text-zinc-500">封禁会下架其全部账号、清零信用分、退出全部登录，QQ 与手机号进入注册黑名单。</p>
            </form>
          )}
        </Card>
      </div>

      <Card flush={myListings.length > 0} title={`发布的账号（${myListings.length}）`}>
        {myListings.length === 0 ? (
          <p className="text-sm text-zinc-500">无</p>
        ) : (
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">账号</th>
                <th scope="col">价格</th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {myListings.map((l) => (
                <tr key={l.id}>
                  <td className="text-zinc-600">#{l.id}</td>
                  <td><Link href={`/admin/listings/${l.id}`} className="link-quiet">{l.title}</Link></td>
                  <td className="font-semibold text-white">{formatPrice(l.price)}</td>
                  <td><Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card flush={logs.length > 0} title="信用分记录">
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">无</p>
        ) : (
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">变动</th>
                <th scope="col">变动后</th>
                <th scope="col">类型</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-zinc-500">{formatDateTime(l.createdAt)}</td>
                  <td className={l.delta >= 0 ? "font-semibold text-white" : "font-semibold text-rose-300"}>{l.delta >= 0 ? `+${l.delta}` : l.delta}</td>
                  <td>{l.balanceAfter}</td>
                  <td className="text-xs text-zinc-500">{l.reasonType}</td>
                  <td>{l.reasonText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
