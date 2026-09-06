import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "用户协议与免责声明" };

const SITE = process.env.SITE_NAME || "方块寄售平台";
const COMPANY = process.env.COMPANY_NAME || "【运营公司名称，备案后填写】";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="LEGAL" eyebrowDetail="用户协议" title="用户协议与免责声明" description="注册即表示你已阅读并同意以下全部条款。本页为初稿，质保规则确定后补充。" />
      <Card>
        <article className="text-sm leading-7 text-zinc-300 [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white [&_h3:first-child]:mt-0 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <h3>一、平台性质</h3>
          <p>
            {SITE}（下称「平台」）由 {COMPANY} 运营，仅提供游戏账号信息的发布、展示与中介撮合服务。平台不是账号的出售方或购买方，不经手任何交易资金，不托管任何账号。
          </p>
          <h3>二、账号交易风险提示</h3>
          <p>
            Minecraft 账号的转让不被微软服务条款允许。您理解并自愿承担由此带来的全部风险，包括但不限于账号被原持有人找回、被官方封禁或回收。平台对上述风险不作任何担保。
          </p>
          <h3>三、用户义务</h3>
          <p>
            您承诺注册信息真实有效，一个 QQ 号只注册一个账号。卖家承诺所发布账号信息真实、账号来源合法，不得发布任何涉及非法来源的内容。买家承诺按与中介约定的流程完成交易。
          </p>
          <h3>四、中介服务与费用</h3>
          <p>
            交易由平台认证的中介在 QQ 内人工完成，包括验号、收款、协助换绑与放款。中介费按平台公示的阶梯收取，「全包」表示标价已含中介费，「不包」表示买家另付。
          </p>
          <h3>五、质保与售后</h3>
          <p>【质保天数、赔付方式与责任判定规则待运营方与中介商定后补充。】</p>
          <h3>六、信用分与处罚</h3>
          <p>
            每个账号初始信用分 100。成交后双方按成交金额获得信用分。爽约、售后判定责任、发布违规内容等行为会被扣分，情节严重者封禁账号，其 QQ 与手机号将不能再注册。
          </p>
          <h3>七、隐私</h3>
          <p>您的 QQ 号与手机号仅对处理您交易的中介和平台管理员可见，平台会记录每一次查看。用户名在公开页面部分打码显示。</p>
          <h3>八、免责</h3>
          <p>
            因用户自身原因、第三方原因或不可抗力造成的损失，平台不承担责任。平台有权在不另行通知的情况下下架违规内容、封禁违规账号。
          </p>
          <h3>九、其他</h3>
          <p>平台可根据运营需要修订本协议，修订后在本页公示即生效。本协议自您注册时生效。</p>
        </article>
      </Card>
    </div>
  );
}
