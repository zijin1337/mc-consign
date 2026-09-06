// 用户头像是身份，不用品牌绿（品牌绿只表达动作与已核验）
const PALETTE = ["#5fdcff", "#b78aff", "#ffd45d", "#ff8998", "#6ef3c5", "#ff9f4a"];

function fnv1a(str: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 由用户名确定的 5×5 像素头像，左右对称，同一个名字永远同一张，不存库。
 * 呼应 Minecraft 的像素语言，也让导航栏和卖家卡片不再只是一串文字。
 */
export function PixelAvatar({ seed, size = 28, className }: { seed: string; size?: number; className?: string }) {
  const bits = fnv1a(seed, 0x811c9dc5);
  const color = PALETTE[fnv1a(seed, 0x9747b28c) % PALETTE.length];
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((bits >>> (y * 3 + x)) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  if (cells.length === 0) cells.push([2, 2]);
  return (
    <svg viewBox="0 0 5 5" width={size} height={size} shapeRendering="crispEdges" className={className} aria-hidden="true">
      <rect width="5" height="5" fill="#151a1d" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />
      ))}
    </svg>
  );
}
