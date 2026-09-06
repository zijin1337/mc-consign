import { Card, Eyebrow } from "@/components/ui";
import { ResetForm } from "./reset-form";

export const metadata = { title: "重置密码" };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="AUTH" detail="重置密码" className="mb-3" />
      <Card title="重置密码">
        <p className="mb-4 text-sm text-zinc-400">输入注册时填写的 QQ 号，验证码会发到对应的 QQ 邮箱。重置后所有设备需要重新登录。</p>
        <ResetForm />
      </Card>
    </div>
  );
}
