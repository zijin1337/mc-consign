/**
 * 生成站点图标：src/app/favicon.ico（16 / 32 / 48，PNG 封装）、apple-icon.png（180）、icon.svg。
 * 图形与 globals.css 的 .brand-mark 一致：左上荧光绿、右上青、下面一整条白，近黑底。
 * 运行：pnpm icons
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const BG = "#080b0d";
const LIME = "#c8ff54";
const CYAN = "#5fdcff";
const WHITE = "#f5f7f2";

/** 全部整数坐标，crispEdges 下每个像素都是实的 */
const GEOMETRY: Record<number, { pad: number; gap: number }> = {
  16: { pad: 2, gap: 2 },
  32: { pad: 4, gap: 2 },
  48: { pad: 6, gap: 4 },
  180: { pad: 36, gap: 8 },
};

function markSvg(size: number, withBg = true) {
  const { pad, gap } = GEOMETRY[size];
  const inner = size - pad * 2;
  const cell = (inner - gap) / 2;
  const x1 = pad + cell + gap;
  const bg = withBg ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bg}<rect x="${pad}" y="${pad}" width="${cell}" height="${cell}" fill="${LIME}"/><rect x="${x1}" y="${pad}" width="${cell}" height="${cell}" fill="${CYAN}"/><rect x="${pad}" y="${x1}" width="${inner}" height="${cell}" fill="${WHITE}"/></svg>`;
}

/** ICO 容器允许直接放 PNG，Vista 以后的 Windows 和所有主流浏览器都认 */
function ico(entries: Array<{ size: number; png: Buffer }>) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

async function main() {
  const png = (size: number) => sharp(Buffer.from(markSvg(size))).png({ compressionLevel: 9 }).toBuffer();
  const [p16, p32, p48, p180] = await Promise.all([16, 32, 48, 180].map(png));
  writeFileSync("src/app/favicon.ico", ico([{ size: 16, png: p16 }, { size: 32, png: p32 }, { size: 48, png: p48 }]));
  writeFileSync("src/app/apple-icon.png", p180);
  writeFileSync("src/app/icon.svg", markSvg(32));
  console.log("written: src/app/favicon.ico, src/app/apple-icon.png, src/app/icon.svg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
