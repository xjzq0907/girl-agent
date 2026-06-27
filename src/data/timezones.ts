// Compact IANA timezone catalog with searchable city/country aliases.
// 用于 wizard 即输即搜、WebUI 下拉框和 CLI --tz=GMT±N 或 IANA。

export interface TzEntry {
  iana: string;
  /** GMT offset in winter (informational; DST handled by Intl) */
  gmtWinter: string;  // "GMT+8"
  city: string;       // 中文显示名称
  country: string;
  aliases: string[];  // 用于模糊搜索
  /** UI 中的分组显示。 */
  group: "CN" | "CIS" | "RU" | "UA";
}

export const TIMEZONES: TzEntry[] = [
  // === 中国 ===
  { iana: "Asia/Shanghai", gmtWinter: "GMT+8", city: "上海", country: "中国", aliases: ["上海", "北京", "广州", "深圳", "杭州", "成都", "武汉", "南京", "香港", "台北", "shanghai", "beijing", "cn", "china", "中国"], group: "CN" },
  { iana: "Asia/Urumqi", gmtWinter: "GMT+6", city: "乌鲁木齐", country: "中国", aliases: ["乌鲁木齐", "新疆", "urumqi", "xinjiang"], group: "CN" },

  // === 独联体 ===
  { iana: "Europe/Minsk", gmtWinter: "GMT+3", city: "明斯克", country: "白俄罗斯", aliases: ["明斯克", "minsk", "白俄", "by"], group: "CIS" },
  { iana: "Asia/Tbilisi", gmtWinter: "GMT+4", city: "第比利斯", country: "格鲁吉亚", aliases: ["第比利斯", "tbilisi", "ge"], group: "CIS" },
  { iana: "Asia/Yerevan", gmtWinter: "GMT+4", city: "埃里温", country: "亚美尼亚", aliases: ["埃里温", "yerevan", "am"], group: "CIS" },
  { iana: "Asia/Baku", gmtWinter: "GMT+4", city: "巴库", country: "阿塞拜疆", aliases: ["巴库", "baku", "az"], group: "CIS" },
  { iana: "Asia/Almaty", gmtWinter: "GMT+5", city: "阿拉木图", country: "哈萨克斯坦", aliases: ["阿拉木图", "almaty", "kz", "阿斯塔纳"], group: "CIS" },
  { iana: "Asia/Tashkent", gmtWinter: "GMT+5", city: "塔什干", country: "乌兹别克斯坦", aliases: ["塔什干", "tashkent", "uz"], group: "CIS" },
  { iana: "Asia/Bishkek", gmtWinter: "GMT+6", city: "比什凯克", country: "吉尔吉斯斯坦", aliases: ["比什凯克", "bishkek", "kg"], group: "CIS" },

  // === 俄罗斯（保留以兼容） ===
  { iana: "Europe/Moscow", gmtWinter: "GMT+3", city: "莫斯科", country: "俄罗斯", aliases: ["莫斯科", "msk", "moscow", "spb"], group: "RU" },
  { iana: "Asia/Novosibirsk", gmtWinter: "GMT+7", city: "新西伯利亚", country: "俄罗斯", aliases: ["新西伯利亚", "novosibirsk"], group: "RU" },
  { iana: "Asia/Irkutsk", gmtWinter: "GMT+8", city: "伊尔库茨克", country: "俄罗斯", aliases: ["伊尔库茨克", "irkutsk"], group: "RU" },
  { iana: "Asia/Vladivostok", gmtWinter: "GMT+10", city: "符拉迪沃斯托克", country: "俄罗斯", aliases: ["符拉迪沃斯托克", "vladivostok"], group: "RU" },

  // === 其他 ===
  { iana: "Asia/Seoul", gmtWinter: "GMT+9", city: "首尔", country: "韩国", aliases: ["首尔", "seoul", "kr"], group: "CIS" },
  { iana: "Asia/Tokyo", gmtWinter: "GMT+9", city: "东京", country: "日本", aliases: ["东京", "tokyo", "jp"], group: "CIS" },
  { iana: "Asia/Bangkok", gmtWinter: "GMT+7", city: "曼谷", country: "泰国", aliases: ["曼谷", "bangkok", "th"], group: "CIS" },
  { iana: "Asia/Singapore", gmtWinter: "GMT+8", city: "新加坡", country: "新加坡", aliases: ["新加坡", "singapore", "sg"], group: "CIS" },
  { iana: "America/New_York", gmtWinter: "GMT-5", city: "纽约", country: "美国", aliases: ["纽约", "new york", "us"], group: "CIS" },
  { iana: "America/Los_Angeles", gmtWinter: "GMT-8", city: "洛杉矶", country: "美国", aliases: ["洛杉矶", "los angeles", "la"], group: "CIS" },
  { iana: "Europe/London", gmtWinter: "GMT+0", city: "伦敦", country: "英国", aliases: ["伦敦", "london", "uk"], group: "CIS" },
  { iana: "Europe/Paris", gmtWinter: "GMT+1", city: "巴黎", country: "法国", aliases: ["巴黎", "paris", "fr"], group: "CIS" },
];

export function findTzByQuery(q: string, limit = 8): TzEntry[] {
  const norm = q.trim().toLowerCase();
  if (!norm) return TIMEZONES.slice(0, limit);
  return TIMEZONES.filter(t => {
    if (t.iana.toLowerCase().includes(norm)) return true;
    if (t.city.toLowerCase().includes(norm)) return true;
    if (t.country.toLowerCase().includes(norm)) return true;
    if (t.gmtWinter.toLowerCase().includes(norm)) return true;
    return t.aliases.some(a => a.includes(norm));
  }).slice(0, limit);
}

export function findTzByGmtOffset(offset: number): TzEntry | undefined {
  const target = `GMT+${offset}`;
  const targetNeg = `GMT${offset}`;
  return TIMEZONES.find(t => t.gmtWinter === target || t.gmtWinter === targetNeg);
}

/** Parse "--tz=GMT+3" or "--tz=Asia/Shanghai" or "--tz=+8" to IANA. */
export function parseTzFlag(value: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  // direct IANA
  if (v.includes("/")) return TIMEZONES.find(t => t.iana.toLowerCase() === v.toLowerCase())?.iana ?? v;
  // GMT±N
  const m = v.match(/^(?:GMT|UTC|gmt|utc)?\s*([+-]?\d{1,2})$/);
  if (m) {
    const off = parseInt(m[1]!, 10);
    return findTzByGmtOffset(off)?.iana;
  }
  // search by city/country
  return findTzByQuery(v, 1)[0]?.iana;
}

export function defaultTzForNationality(nat: "RU" | "UA" | "CN"): string {
  return "Asia/Shanghai";
}
