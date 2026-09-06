"use client";

import { Button, Eyebrow, LinkButton } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
      <Eyebrow section="ERROR" detail="500" />
      <p className="mt-6 font-pixel text-[5.5rem] leading-none text-white sm:text-[8rem]">
        500<span className="text-rose-300">.</span>
      </p>
      <p className="mt-5 text-base leading-7 text-zinc-400">页面暂时打不开，请稍后重试。</p>
      {error.digest && <p className="mt-2 font-mono text-xs tracking-[0.1em] text-zinc-600">REF / {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>重试</Button>
        <LinkButton href="/" variant="secondary">
          回到账号市场
        </LinkButton>
      </div>
    </div>
  );
}
