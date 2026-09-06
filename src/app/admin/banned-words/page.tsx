import { asc } from "drizzle-orm";
import { addBannedWord, removeBannedWord } from "@/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Card, Input, PageHeader, cn, focusRing } from "@/components/ui";
import { db, schema } from "@/db";

export const metadata = { title: "违禁词" };

export default async function BannedWordsPage() {
  const words = await db.select().from(schema.bannedWords).orderBy(asc(schema.bannedWords.word));
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="ADMIN" eyebrowDetail="违禁词" title="违禁词" description="作用于用户名、账号说明与联系方式、下单留言、求购要求与推荐留言。匹配时忽略空格和符号，英文不分大小写。售后描述不过滤。" />
      <Card>
        <form action={addBannedWord} className="flex gap-2">
          <Input name="word" placeholder="新增违禁词" maxLength={30} required />
          <SubmitButton pendingText="添加中…">添加</SubmitButton>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w.id} className="flex items-center gap-1 rounded-none border border-white/15 bg-white/[0.03] pl-3 pr-1 text-sm">
              {w.word}
              <form action={removeBannedWord}>
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" className={cn("rounded-none px-1.5 text-zinc-600 hover:bg-rose-400/15 hover:text-rose-300", focusRing)} aria-label={`删除 ${w.word}`}>×</button>
              </form>
            </li>
          ))}
          {words.length === 0 && <li className="text-sm text-zinc-500">暂无</li>}
        </ul>
      </Card>
    </div>
  );
}
