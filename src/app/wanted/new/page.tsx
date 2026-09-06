import { Suspense } from "react";
import { Skel } from "@/components/skeleton";
import { Alert, PageHeader } from "@/components/ui";
import { WantedForm } from "@/components/wanted-form";
import { requireUser, type SafeUser } from "@/lib/auth";
import { listAgents } from "@/lib/listings";
import { getSettings } from "@/lib/settings";
import { wantedBlock } from "@/lib/wanted";

export const metadata = { title: "发布求购" };

/** 上限与中介列表要查库，放进 Suspense；页头先到 */
async function NewWantedBody({ user }: { user: SafeUser }) {
  const [settings, agents] = await Promise.all([getSettings(), listAgents()]);
  const blocked = await wantedBlock(user, settings);
  if (blocked) return <Alert kind="warn">{blocked}</Alert>;
  return <WantedForm mode="create" agents={agents.filter((a) => a.id !== user.id)} defaultDays={settings.wanted_default_days} />;
}

/** 三张表单卡的占位，尺寸对齐 <WantedForm> */
function WantedFormSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="加载中">
      {[3, 3, 2].map((fields, i) => (
        <div key={i} className="border border-white/10 bg-card">
          <div className="mc-rule px-5 py-3.5">
            <Skel className="h-4 w-28" />
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, j) => (
              <div key={j} className="space-y-2">
                <Skel className="h-3 w-20" />
                <Skel className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Skel className="h-10 w-28" />
    </div>
  );
}

export default async function NewWantedPage() {
  const user = await requireUser("/wanted/new");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="WANTED" eyebrowDetail="发布求购" title="发布求购" description="写清想要的账号与预算，卖家和中介会把合适的账号推荐给你。采纳推荐后由中介通过 QQ 联系你，网站不收款。" />
      <Suspense fallback={<WantedFormSkeleton />}>
        <NewWantedBody user={user} />
      </Suspense>
    </div>
  );
}
