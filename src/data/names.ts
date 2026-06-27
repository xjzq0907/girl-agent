// 中国女生常见名字池。
// 用于 name-tournament 向导以及 --name 参数为空时的默认值。

export const NAMES_CN: string[] = [
  "小月", "诗雨", "思涵", "晓雪", "雨晴",
  "梦琪", "静怡", "雅婷", "欣然", "若曦",
  "子涵", "梓萱", "语嫣", "雨桐", "安琪",
  "佳怡", "婉清", "念慈", "清瑶", "心怡",
  "忆南", "乐瑶", "曼琳", "芷若", "碧萱",
  "悦悦", "甜甜", "萌萌", "朵朵", "可可",
  "念念", "悠悠", "浅浅", "小鹿", "阿宁",
  "小瑶", "小琳", "小薇", "小婷", "小冉",
  "雪儿", "灵儿", "萱萱", "瑶瑶", "莹莹"
];

// 保留 RU/UA 名字池以兼容旧数据
export const NAMES_RU: string[] = NAMES_CN;
export const NAMES_UA: string[] = NAMES_CN;

export function pickRandomNames(nat: "RU" | "UA" | "CN", count: number, exclude: Set<string> = new Set()): string[] {
  const pool = NAMES_CN.filter(n => !exclude.has(n));
  const out: string[] = [];
  const used = new Set<string>();
  while (out.length < Math.min(count, pool.length)) {
    const idx = Math.floor(Math.random() * pool.length);
    const n = pool[idx]!;
    if (!used.has(n)) {
      used.add(n);
      out.push(n);
    }
  }
  return out;
}
