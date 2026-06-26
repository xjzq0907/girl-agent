// Compact IANA timezone catalog with searchable RU/UA city/country aliases.
// 用于 wizard 即输即搜、WebUI 下拉框和 CLI --tz=GMT±N 或 IANA。
//
// 排序（UX 要求）：乌克兰在最前面，然后是独联体国家，最后是俄罗斯时区从西到东。

export interface TzEntry {
  iana: string;
  /** GMT offset in winter (informational; DST handled by Intl) */
  gmtWinter: string;  // "GMT+3"
  city: string;       // 中文显示名称
  country: string;
  aliases: string[];  // 用于模糊搜索
  /** UI 中的分组显示。 */
  group: "UA" | "CIS" | "RU";
}

export const TIMEZONES: TzEntry[] = [
  // === 乌克兰 ===
  { iana: "Europe/Kyiv", gmtWinter: "GMT+2", city: "基辅", country: "乌克兰", aliases: ["基辅", "基辅", "kyiv", "kiev", "ua", "乌克兰", "乌克兰", "利沃夫", "利沃夫", "敖德萨", "敖德萨", "哈尔科夫", "哈尔科夫"], group: "UA" },
  { iana: "Europe/Uzhgorod", gmtWinter: "GMT+2", city: "乌日霍罗德", country: "乌克兰", aliases: ["乌日霍罗德", "uzhgorod", "外喀尔巴阡"], group: "UA" },
  { iana: "Europe/Zaporozhye", gmtWinter: "GMT+2", city: "扎波罗热", country: "乌克兰", aliases: ["扎波罗热", "扎波罗热", "zaporozhye"], group: "UA" },

  // === 独联体 ===
  { iana: "Europe/Minsk", gmtWinter: "GMT+3", city: "明斯克", country: "白俄罗斯", aliases: ["明斯克", "minsk", "白俄", "白俄罗斯", "by"], group: "CIS" },
  { iana: "Europe/Chisinau", gmtWinter: "GMT+2", city: "基希讷乌", country: "摩尔多瓦", aliases: ["基希讷乌", "基希讷乌", "chisinau", "md", "摩尔多瓦"], group: "CIS" },
  { iana: "Asia/Tbilisi", gmtWinter: "GMT+4", city: "第比利斯", country: "格鲁吉亚", aliases: ["第比利斯", "tbilisi", "ge", "格鲁吉亚"], group: "CIS" },
  { iana: "Asia/Yerevan", gmtWinter: "GMT+4", city: "埃里温", country: "亚美尼亚", aliases: ["埃里温", "yerevan", "am", "亚美尼亚"], group: "CIS" },
  { iana: "Asia/Baku", gmtWinter: "GMT+4", city: "巴库", country: "阿塞拜疆", aliases: ["巴库", "baku", "az", "阿塞拜疆"], group: "CIS" },
  { iana: "Asia/Almaty", gmtWinter: "GMT+5", city: "阿拉木图", country: "哈萨克斯坦", aliases: ["阿拉木图", "almaty", "kz", "哈萨克斯坦", "阿斯塔纳", "努尔苏丹"], group: "CIS" },
  { iana: "Asia/Aqtobe", gmtWinter: "GMT+5", city: "阿克托别", country: "哈萨克斯坦", aliases: ["阿克托别", "aqtobe", "西哈萨克斯坦"], group: "CIS" },
  { iana: "Asia/Tashkent", gmtWinter: "GMT+5", city: "塔什干", country: "乌兹别克斯坦", aliases: ["塔什干", "tashkent", "uz", "乌兹别克斯坦"], group: "CIS" },
  { iana: "Asia/Ashgabat", gmtWinter: "GMT+5", city: "阿什哈巴德", country: "土库曼斯坦", aliases: ["阿什哈巴德", "ashgabat", "tm", "土库曼斯坦"], group: "CIS" },
  { iana: "Asia/Dushanbe", gmtWinter: "GMT+5", city: "杜尚别", country: "塔吉克斯坦", aliases: ["杜尚别", "dushanbe", "tj", "塔吉克斯坦"], group: "CIS" },
  { iana: "Asia/Bishkek", gmtWinter: "GMT+6", city: "比什凯克", country: "吉尔吉斯斯坦", aliases: ["比什凯克", "bishkek", "kg", "吉尔吉斯斯坦"], group: "CIS" },

  // === 俄罗斯 ===
  { iana: "Europe/Kaliningrad", gmtWinter: "GMT+2", city: "加里宁格勒", country: "俄罗斯", aliases: ["加里宁格勒", "kaliningrad", "rus"], group: "RU" },
  { iana: "Europe/Moscow", gmtWinter: "GMT+3", city: "莫斯科", country: "俄罗斯", aliases: ["莫斯科", "msk", "moscow", "彼得堡", "圣彼得堡", "spb", "rus"], group: "RU" },
  { iana: "Europe/Samara", gmtWinter: "GMT+4", city: "萨马拉", country: "俄罗斯", aliases: ["萨马拉", "samara", "伊热夫斯克"], group: "RU" },
  { iana: "Asia/Yekaterinburg", gmtWinter: "GMT+5", city: "叶卡捷琳堡", country: "俄罗斯", aliases: ["叶卡", "yekaterinburg", "彼尔姆", "乌法", "车里雅宾斯克"], group: "RU" },
  { iana: "Asia/Omsk", gmtWinter: "GMT+6", city: "鄂木斯克", country: "俄罗斯", aliases: ["鄂木斯克", "omsk"], group: "RU" },
  { iana: "Asia/Novosibirsk", gmtWinter: "GMT+7", city: "新西伯利亚", country: "俄罗斯", aliases: ["新西", "新西伯利亚", "novosibirsk", "托木斯克", "克拉斯诺亚尔斯克"], group: "RU" },
  { iana: "Asia/Irkutsk", gmtWinter: "GMT+8", city: "伊尔库茨克", country: "俄罗斯", aliases: ["伊尔库茨克", "irkutsk", "乌兰乌德"], group: "RU" },
  { iana: "Asia/Yakutsk", gmtWinter: "GMT+9", city: "雅库茨克", country: "俄罗斯", aliases: ["雅库茨克", "yakutsk", "赤塔"], group: "RU" },
  { iana: "Asia/Vladivostok", gmtWinter: "GMT+10", city: "符拉迪沃斯托克", country: "俄罗斯", aliases: ["符拉迪沃斯托克", "vladivostok", "哈巴罗夫斯克"], group: "RU" },
  { iana: "Asia/Magadan", gmtWinter: "GMT+11", city: "马加丹", country: "俄罗斯", aliases: ["马加丹", "magadan", "萨哈林"], group: "RU" },
  { iana: "Asia/Kamchatka", gmtWinter: "GMT+12", city: "堪察加", country: "俄罗斯", aliases: ["堪察加", "kamchatka", "彼得罗巴甫洛夫斯克"], group: "RU" }
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

/** Parse "--tz=GMT+3" or "--tz=Europe/Moscow" or "--tz=+3" to IANA. */
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

export function defaultTzForNationality(nat: "RU" | "UA"): string {
  return nat === "UA" ? "Europe/Kyiv" : "Europe/Moscow";
}
