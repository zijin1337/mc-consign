import { Eyebrow, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
      <Eyebrow section="ERROR" detail="404" />
      <p className="mt-6 font-pixel text-[5.5rem] leading-none text-white sm:text-[8rem]">
        404<span className="text-lime-300">.</span>
      </p>
      <p className="mt-5 text-base leading-7 text-zinc-400">页面不存在，或内容已下架。</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LinkButton href="/">回到账号市场</LinkButton>
        <LinkButton href="/sold" variant="secondary">
          查看成交记录
        </LinkButton>
      </div>
    </div>
  );
}
