/** 上传图片的访问地址，前后端共用（upload.ts 是 server-only，不能在组件里引） */
export function imageUrl(rel: string) {
  return `/uploads/${rel}`;
}
