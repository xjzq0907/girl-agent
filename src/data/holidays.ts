import type { ProfileConfig } from "../types.js";

/**
 * 节假日与纪念日感知。
 *
 * 设计：
 * - 公历节日（SOLAR）：精确到 MM-DD
 * - 农历节日（LUNAR）：用近似公历日期（每年略有浮动），覆盖大部分年份够用
 *   精确农历支持超出本模块范围；用户想精确可用 characterBirthday / birthday 字段。
 * - 用户/角色生日：从 cfg.birthday（用户）、cfg.characterBirthday（角色）读取，YYYY-MM-DD
 */

export type OccasionKind = "holiday" | "birthday" | "anniversary";
export type OccasionType = "solar" | "lunar";

export interface Occasion {
  kind: OccasionKind;
  type?: OccasionType;        // 节日用，生日没有
  name: string;               // 中文名
  vibe: string;               // 简要情感/情境描述（注入 prompt 用）
  /** "他" / "她" / "通用" —— 谁的节日，决定她的反应角度 */
  who: "him" | "her" | "both";
}

interface SolarHoliday {
  month: number;     // 1-12
  day: number;       // 1-31
  name: string;
  vibe: string;
  who?: "him" | "her" | "both";
}

interface LunarApprox {
  approxMonth: number;
  approxDay: number;
  name: string;
  vibe: string;
  who?: "him" | "her" | "both";
}

/** 公历节日（精确 MM-DD）。 */
const SOLAR_HOLIDAYS: SolarHoliday[] = [
  { month: 1, day: 1, name: "元旦", vibe: "新年第一天", who: "both" },
  { month: 2, day: 14, name: "情人节", vibe: "西方的情人节", who: "both" },
  { month: 3, day: 8, name: "妇女节", vibe: "国际妇女节", who: "her" },
  { month: 3, day: 14, name: "白色情人节", vibe: "回礼的日子", who: "both" },
  { month: 4, day: 1, name: "愚人节", vibe: "可以整蛊一下", who: "both" },
  { month: 5, day: 1, name: "劳动节", vibe: "放假的一天", who: "both" },
  { month: 5, day: 4, name: "青年节", vibe: "年轻人的节日", who: "him" },
  { month: 5, day: 11, name: "母亲节", vibe: "感恩妈妈", who: "both" },
  { month: 6, day: 1, name: "儿童节", vibe: "装嫩的日子", who: "both" },
  { month: 6, day: 18, name: "父亲节", vibe: "感恩爸爸", who: "both" },
  { month: 9, day: 10, name: "教师节", vibe: "老师的节日", who: "both" },
  { month: 10, day: 1, name: "国庆节", vibe: "祖国生日", who: "both" },
  { month: 11, day: 11, name: "光棍节", vibe: "单身狗的节日", who: "him" },
  { month: 11, day: 26, name: "感恩节", vibe: "西方感恩节", who: "both" },
  { month: 12, day: 24, name: "平安夜", vibe: "平安夜", who: "both" },
  { month: 12, day: 25, name: "圣诞节", vibe: "圣诞快乐", who: "both" },
  { month: 12, day: 31, name: "跨年夜", vibe: "一年的最后一天", who: "both" }
];

/**
 * 农历节日（用近似公历日期，每年浮动 ±1-2 天；2024-2030 区间基本覆盖）。
 * 真实农历转换超出本模块范围 — 用户需要精确日期请直接用 birthday 字段。
 */
const LUNAR_HOLIDAYS_APPROX: LunarApprox[] = [
  { approxMonth: 1, approxDay: 10, name: "春节", vibe: "新年到啦", who: "both" },
  { approxMonth: 1, approxDay: 26, name: "元宵节", vibe: "吃汤圆的日子", who: "both" },
  { approxMonth: 2, approxDay: 14, name: "情人节", vibe: "中式情人节", who: "both" },
  { approxMonth: 5, approxDay: 5, name: "端午节", vibe: "吃粽子、纪念屈原", who: "both" },
  { approxMonth: 7, approxDay: 7, name: "七夕", vibe: "中式情人节", who: "both" },
  { approxMonth: 8, approxDay: 15, name: "中秋节", vibe: "团圆、吃月饼", who: "both" },
  { approxMonth: 9, approxDay: 9, name: "重阳节", vibe: "登高、敬老", who: "both" },
  { approxMonth: 12, approxDay: 23, name: "小年", vibe: "准备过年的节奏", who: "both" }
];

/**
 * 检测给定日期今天是什么节日 / 谁的生日。
 * @param now 任意 Date；默认当前时间
 * @param cfg ProfileConfig，用于读取 birthday / characterBirthday
 */
export function getTodayOccasions(now: Date = new Date(), cfg?: ProfileConfig): Occasion[] {
  const out: Occasion[] = [];

  // 公历节日
  const m = now.getMonth() + 1;
  const d = now.getDate();
  for (const h of SOLAR_HOLIDAYS) {
    if (h.month === m && h.day === d) {
      out.push({
        kind: "holiday",
        type: "solar",
        name: h.name,
        vibe: h.vibe,
        who: h.who ?? "both"
      });
    }
  }

  // 农历节日（按近似公历匹配）
  for (const h of LUNAR_HOLIDAYS_APPROX) {
    if (h.approxMonth === m && h.approxDay === d) {
      out.push({
        kind: "holiday",
        type: "lunar",
        name: h.name,
        vibe: h.vibe,
        who: h.who ?? "both"
      });
    }
  }

  // 生日 — 按 YYYY-MM-DD 解析后只看 MM-DD
  if (cfg) {
    const dateKey = formatDateKey(now);
    if (cfg.birthday && matchMD(cfg.birthday, dateKey)) {
      out.push({
        kind: "birthday",
        name: "他的生日",
        vibe: "记得给他祝福",
        who: "him"
      });
    }
    if (cfg.characterBirthday && matchMD(cfg.characterBirthday, dateKey)) {
      out.push({
        kind: "birthday",
        name: `${cfg.name}的生日`,
        vibe: "她的生日 — 重要的一天",
        who: "her"
      });
    }
  }

  return out;
}

/** 是否有值得主动发消息的节日（含生日）。 */
export function hasNotableOccasion(now: Date = new Date(), cfg?: ProfileConfig): boolean {
  return getTodayOccasions(now, cfg).length > 0;
}

/** 把节日列表渲染成 prompt fragment，给 LLM 看。空时返回空串。 */
export function renderOccasionsPrompt(occasions: Occasion[]): string {
  if (!occasions.length) return "";
  const lines = occasions.map(o => `- [${o.kind}${o.type ? `/${o.type}` : ""}] ${o.name}（${o.vibe}；涉及：${whoLabel(o.who)}）`);
  return `## 今天的日子\n${lines.join("\n")}\n`;
}

function whoLabel(w: "him" | "her" | "both"): string {
  return w === "him" ? "他" : w === "her" ? "她" : "双方";
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function matchMD(cfgDate: string, todayKey: string): boolean {
  // cfgDate 可能是 "MM-DD" 或 "YYYY-MM-DD"
  const parts = cfgDate.split("-");
  if (parts.length === 2) {
    return `${todayKey.slice(5)}` === cfgDate;
  }
  if (parts.length === 3) {
    return cfgDate === todayKey;
  }
  return false;
}