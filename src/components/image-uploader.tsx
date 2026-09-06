"use client";

import { ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CoverBadge } from "./cover-badge";
import { cn, focusRing } from "./ui";

interface Item {
  key: string;
  name: string;
  /** 留着原文件，失败后可以重试 */
  file?: File;
  state: "uploading" | "done" | "error";
  id?: number;
  url?: string;
  error?: string;
}

export interface UploadState {
  uploading: number;
  done: number;
}

const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * 截图上传器：选中（或拖入）即逐张上传到 /api/upload，成功后以隐藏字段 imageIds 参与表单提交。
 * 格式、大小、张数在浏览器里先拦一道，不用等服务器报错；失败的可以重试；第一张标为封面。
 * 表单校验失败重新渲染时组件状态保留，已上传的图不会丢。
 */
export function ImageUploader({
  name = "imageIds",
  max = 9,
  existingCount = 0,
  onChange,
}: {
  name?: string;
  max?: number;
  existingCount?: number;
  /** 上传中 / 已完成的张数变化时回调，父表单据此禁用提交按钮。请传稳定引用（useCallback） */
  onChange?: (s: UploadState) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const live = items.filter((i) => i.state !== "error");
  const remaining = Math.max(0, max - existingCount - live.length);
  const uploading = items.filter((i) => i.state === "uploading").length;
  const done = items.filter((i) => i.state === "done").length;
  // 没有已有截图时，第一张上传成功的就是封面
  const coverKey = existingCount === 0 ? items.find((i) => i.state === "done")?.key : undefined;

  useEffect(() => {
    onChange?.({ uploading, done });
  }, [uploading, done, onChange]);

  async function upload(file: File, retryKey?: string) {
    const key = retryKey ?? newKey();
    setItems((p) => (retryKey ? p.map((i) => (i.key === key ? { ...i, state: "uploading", error: undefined } : i)) : [...p, { key, name: file.name, file, state: "uploading" }]));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; id?: number; url?: string; message?: string } | null;
      if (!res.ok || !j?.ok || !j.id || !j.url) throw new Error(j?.message ?? `上传失败（${res.status}）`);
      setItems((p) => p.map((i) => (i.key === key ? { ...i, state: "done", id: j.id, url: j.url } : i)));
    } catch (e) {
      setItems((p) => p.map((i) => (i.key === key ? { ...i, state: "error", error: e instanceof Error ? e.message : "上传失败" } : i)));
    }
  }

  function addFiles(files: File[]) {
    const accepted: File[] = [];
    const rejected: Item[] = [];
    for (const f of files) {
      if (!ACCEPT.has(f.type)) rejected.push({ key: newKey(), name: f.name, state: "error", error: "只支持 jpg / png / webp" });
      else if (f.size > MAX_BYTES) rejected.push({ key: newKey(), name: f.name, state: "error", error: `超过 5MB（${(f.size / 1024 / 1024).toFixed(1)}MB），请先压缩` });
      else accepted.push(f);
    }
    const toUpload = accepted.slice(0, remaining);
    const dropped = accepted.length - toUpload.length;
    setNotice(dropped > 0 ? `最多 ${max} 张，已忽略多出的 ${dropped} 张` : null);
    if (rejected.length) setItems((p) => [...p, ...rejected]);
    for (const f of toUpload) void upload(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    addFiles(files);
  }

  return (
    <div>
      {items.filter((i) => i.state === "done").map((i) => <input key={i.key} type="hidden" name={name} value={i.id} />)}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.key} data-upload-state={i.state} className="relative aspect-[16/10] overflow-hidden border border-white/10 bg-field">
            {i.state === "done" && i.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.url} alt={i.name} className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs ${i.state === "error" ? "text-rose-300" : "text-zinc-500"}`}>
                {i.state === "uploading" ? <Loader2 className="size-4 animate-spin" /> : null}
                <span className="line-clamp-2 break-all">{i.state === "error" ? i.error : "上传中…"}</span>
                {i.state === "error" && i.file && (
                  <button
                    type="button"
                    onClick={() => void upload(i.file!, i.key)}
                    className={cn("mt-1 inline-flex items-center gap-1 border border-white/15 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-white/40 hover:text-white", focusRing)}
                  >
                    <RotateCcw className="size-3" />
                    重试
                  </button>
                )}
              </div>
            )}
            {i.key === coverKey && <CoverBadge />}
            <button
              type="button"
              onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}
              className={cn("absolute right-1 top-1 flex size-6 items-center justify-center bg-background/80 text-zinc-300 hover:bg-rose-400 hover:text-on-rose", focusRing)}
              aria-label={`移除 ${i.name}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(Array.from(e.dataTransfer.files));
            }}
            // 荧光绿只留给 dragging（正在交互）与键盘焦点；普通 hover 是白，且不和 dragging 态叠在一起打架
            className={cn(
              "flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed bg-white/[0.02] text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime-300",
              dragging ? "border-lime-300 bg-lime-300/[0.06] text-lime-300" : "border-white/20 text-zinc-400 hover:border-white/40 hover:text-zinc-200",
            )}
          >
            <ImagePlus className="size-5" />
            {dragging ? "松开上传" : "选择或拖入截图"}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} className="sr-only" aria-label="选择截图上传" />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {done + existingCount} / {max} 张
        {existingCount === 0 && done > 0 ? " · 第一张是封面，会显示在账号卡上" : ""}
        {uploading > 0 ? " · 上传中，请等全部完成再提交" : ""}
        {notice ? ` · ${notice}` : ""}
      </p>
    </div>
  );
}
