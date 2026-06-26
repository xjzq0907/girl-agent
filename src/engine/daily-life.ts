// 模拟她的"对话外的真实生活"。每天生成日程 + 随意的"当天事件"。
// 用于系统 prompt："你现在在上班 / 在路上 / 在闺蜜小美家"。
// 缓存于 data/<slug>/daily-life/YYYY-MM-DD.md，按她的本地日期。

import type { LLMClient } from "../llm/index.js";
import type { ProfileConfig } from "../types.js";
import { readMd, writeMd, profileDir } from "../storage/md.js";
import type { ConflictState } from "./conflict.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface DailyLifeBlock {
  fromHour: number;     // 0..23 在她的本地时区
  toHour: number;
  activity: string;     // "在上班", "在闺蜜小美家", "健身", "回家路上"
  mood?: string;        // 该阶段的简短心情: "被小丽烦到了", "这周第一次睡够了"
  social: "alone" | "with-friends" | "with-family" | "with-coworkers" | "in-transit";
  phoneAvailable: boolean; // 是否能在 TG 回复
}

export interface DailyLife {
  dateLocal: string;    // YYYY-MM-DD 她的本地日
  weather?: string;     // 简短的
  vibe: string;         // 1句当天的总体心情（"懒洋洋的，没睡够"、"挺开心，今天不错"）
  blocks: DailyLifeBlock[];
  /** 随机小事件 — 已经发生或将要发生 (1-3条) */
  events: string[];
  /** 她今天"想要什么"（内心动机） */
  wants: string[];
}

function localDateStr(tz: string, now = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function localHour(tz: string, now = new Date()): number {
  try {
    return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
  } catch { return now.getHours(); }
}

function localWeekday(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  } catch { return ""; }
}

const SYS = `你是一个角色日常生活的导演。生成她一天的日常生活。不要戏剧化，不要"好莱坞式"事件 — 就是一个普通女孩在这个年龄段的普通一天：学校/学院/大学/工作（根据年龄）、日常琐事、闺蜜、父母、小冲突、关于昨晚的念头、没睡够、衣服烦恼、额头长了颗痘、健身、和妈妈聊天。不要编造男朋友的存在 — 她的男朋友就是那个在 TG 上和她聊天的人，不要在 blocks 里提他。`;

function buildPrompt(
  cfg: ProfileConfig,
  persona: string,
  weekday: string,
  dateLocal: string,
  conflict: ConflictState | null,
  recentEvents: string[]
): string {
  const conflictNote = conflict && conflict.level > 0
    ? `\n\n重要：她现在和他处于冲突中 (等级 ${conflict.level}，原因: "${conflict.reason ?? "—"}")。这会影响她的一天：\n- 等级 1：轻微生气 — 日子略微平淡，温暖事件减少\n- 等级 2：严重生气 — 日子更灰暗，日常烦恼更多，社交更少\n- 等级 3+：强烈冲突 — 日子很难熬，她烦躁，事件偏负面，想一个人待着\n- 在 blocks/events/wants 中要反映这种情绪。`
    : "";

  const busyNote = cfg.busySchedule && cfg.busySchedule.length > 0
    ? `\n\n她的固定忙碌时间表 (busySchedule):\n${cfg.busySchedule.map(s => `- ${s.label}: ${s.from}-${s.to}${s.days ? ` (${s.days.join(", ")})` : ""}`).join("\n")}\n\n生成 blocks 时参考：如果 busySlot 覆盖某个时间段，activity 应该对应。对于 17 岁以下，使用"在学校"、"上课"、"课间"；不要用"大学课"、"讲座"、"大学"、"教授"。17岁以上根据 persona 可以用大学/学院。"phoneAvailable=false" 只在手机真的不可用时才设。`
    : "";

  // 重要：屏蔽前几天的重复事件。否则 LLM 可能连续生成同一事件
  // （比如连续4天"咖啡店弄错订单" — 来自社区的真实反馈）。
  // LLM 不知道之前的生成结果，需要传给它。
  const recentNote = recentEvents.length > 0
    ? `\n\n之前几天已经发生过的事件（不要重复 — 这些是完全相同的事件，不能重复也不能换说法）:\n${recentEvents.map(e => `- ${e}`).join("\n")}\n\n为今天生成全新的、本质上不同于上述列表的事件（而不是换一种表述）。如果想法重复了 — 另外想一个新的。`
    : "";

  return `名字: ${cfg.name}, ${cfg.age}岁。关系阶段: ${cfg.stage}。时区: ${cfg.tz}。今天是: ${weekday}, ${dateLocal}。${conflictNote}${busyNote}${recentNote}

角色设定（摘要）:
${persona.slice(0, 1200)}

注意她的睡眠时间表。她 ${cfg.sleepFrom}:00 入睡，${cfg.sleepTo}:00 起床。
日程 (blocks) 应该只覆盖她醒着的时间（一整天，排除睡眠时间）。

生成 STRICT JSON 结构:
{
  "vibe": "1句话，描述她今天感觉如何（没精神/累/休息好了/生气/有状态）",
  "weather": "城市+天气，简短描述她所在区域的情况",
  "blocks": [
    { "fromHour": ${cfg.sleepTo}, "toHour": ${cfg.sleepTo === 23 ? 0 : cfg.sleepTo + 1}, "activity": "醒来，赖床，在床上刷手机", "mood": "没睡够", "social": "alone", "phoneAvailable": true },
    ... (一共6-9个区块，覆盖一整天的清醒时间；如果 persona 提到上学/工作就不要漏掉，午饭、健身（有或没有）、和闺蜜在一起/独自/和家人)
  ],
  "events": ["2-3个今天发生的随机小事件（老师发脾气 / 咖啡店搞错订单 / 闺蜜约局 / 头疼犯了）"],
  "wants": ["2-4个今天的内心愿望（补觉 / 想看看新衣服 / 想见闺蜜 / 想一个人静静）"]
}

social 规则:
- "alone" — 独自一人（在家、独自在路上、独自散步）
- "with-friends" — 和闺蜜们
- "with-family" — 和妈妈/弟弟/妹妹
- "with-coworkers" — 在上班/上学
- "in-transit" — 公交/地铁/打车

phoneAvailable=false 的情况：睡觉、健身（健身房）、重要课程/会议、洗澡。无聊的课/讲座/会议 — phoneAvailable=true（她每隔几分钟就在课桌下刷手机，可以快速查看、简短回复，但也可能没注意到）。如果她不到17岁，说"上课/学校"，不说"大学课程/讲座"。

只输出JSON，不要注释。`;
}

export async function loadOrGenerateDailyLife(
  llm: LLMClient,
  cfg: ProfileConfig,
  now = new Date(),
  conflict: ConflictState | null = null
): Promise<DailyLife> {
  const dateLocal = localDateStr(cfg.tz, now);
  const path = `daily-life/${dateLocal}.md`;
  const existing = await readMd(cfg.slug, path);
  if (existing) {
    try {
      const m = existing.match(/<!--daily:(.+?)-->/s);
      if (m && m[1]) return JSON.parse(m[1]) as DailyLife;
    } catch { /* regenerate */ }
  }

  const persona = await readMd(cfg.slug, "persona.md");
  const weekday = localWeekday(cfg.tz, now);
  const recentEvents = await loadRecentEvents(cfg.slug, dateLocal, 5);
  let dl: DailyLife;
  try {
    const raw = await llm.chat(
      [
        { role: "system", content: SYS },
        { role: "user", content: buildPrompt(cfg, persona, weekday, dateLocal, conflict, recentEvents) }
      ],
      { temperature: 0.95, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);
    dl = {
      dateLocal,
      weather: typeof parsed.weather === "string" ? parsed.weather : undefined,
      vibe: typeof parsed.vibe === "string" ? parsed.vibe : "普通的一天",
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      wants: Array.isArray(parsed.wants) ? parsed.wants : []
    };
  } catch {
    dl = { dateLocal, vibe: "普通的一天", blocks: [], events: [], wants: [] };
  }

  // 保存
  const human = renderDailyLifeHuman(dl);
  await writeMd(cfg.slug, path, `${human}\n\n<!--daily:${JSON.stringify(dl)}-->\n`);
  return dl;
}

export function renderDailyLifeHuman(dl: DailyLife): string {
  const lines: string[] = [];
  lines.push(`# ${dl.dateLocal}日`);
  if (dl.weather) lines.push(`天气: ${dl.weather}`);
  lines.push(`心情: ${dl.vibe}`);
  if (dl.blocks?.length) {
    lines.push("");
    lines.push("## 日程");
    for (const b of dl.blocks) {
      lines.push(`- ${String(b.fromHour).padStart(2, "0")}:00–${String(b.toHour).padStart(2, "0")}:00 — ${b.activity} [${b.social}${b.phoneAvailable ? "" : ", 没手机"}]${b.mood ? ` (${b.mood})` : ""}`);
    }
  }
  if (dl.events?.length) {
    lines.push("");
    lines.push("## 今天的小事件");
    dl.events.forEach(e => lines.push(`- ${e}`));
  }
  if (dl.wants?.length) {
    lines.push("");
    lines.push("## 今天想要什么");
    dl.wants.forEach(e => lines.push(`- ${e}`));
  }
  return lines.join("\n");
}

export function currentBlock(dl: DailyLife, tz: string, now = new Date()): DailyLifeBlock | undefined {
  const h = localHour(tz, now);
  return dl.blocks?.find(b => h >= b.fromHour && h < b.toHour)
    ?? dl.blocks?.[dl.blocks.length - 1];
}

/**
 * 读取最近 N 个 daily-life 文件中的小事件（前几天）—
 * 传给 LLM 作为"不要重复"的参考。否则模型会开心地连续4天
 * 生成"咖啡店弄错订单"这个事件。
 */
async function loadRecentEvents(slug: string, todayLocal: string, days: number): Promise<string[]> {
  try {
    const dir = path.join(profileDir(slug), "daily-life");
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const recent = files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace(/\.md$/, ""))
      .filter(d => d < todayLocal)
      .sort()
      .slice(-days);
    const out: string[] = [];
    for (const day of recent) {
      const raw = await readMd(slug, `daily-life/${day}.md`);
      if (!raw) continue;
      const m = raw.match(/<!--daily:(.+?)-->/s);
      if (!m || !m[1]) continue;
      try {
        const parsed = JSON.parse(m[1]) as DailyLife;
        if (Array.isArray(parsed.events)) {
          for (const e of parsed.events) {
            if (typeof e === "string" && e.trim()) out.push(e.trim());
          }
        }
      } catch { /* 缓存损坏 — 跳过 */ }
    }
    // 限制：超过20条没必要，通常6-12条就够了。
    return out.slice(-20);
  } catch {
    return [];
  }
}

export function dailyLifePromptFragment(dl: DailyLife, tz: string, now = new Date()): string {
  const b = currentBlock(dl, tz, now);
  const parts = [
    `# 你今天的生活 (${dl.dateLocal}) — 这是你的人生，不是他的`,
    `整体心情: ${dl.vibe}`
  ];
  if (dl.weather) parts.push(`天气: ${dl.weather}`);
  if (b) {
    parts.push(`当前 (${b.fromHour}:00–${b.toHour}:00) 你在: ${b.activity}。社交状态: ${b.social}。${b.phoneAvailable ? "" : " 手机现在不能用 — 不能/不想回复。"}`);
    if (b.mood) parts.push(`当前微心情: ${b.mood}`);
  }
  if (dl.events?.length) {
    parts.push(`今天发生/将发生的事: ${dl.events.slice(0, 3).join("; ")}`);
  }
  if (dl.wants?.length) {
    parts.push(`你今天想要什么: ${dl.wants.slice(0, 3).join("; ")}`);
  }
  parts.push(`不要把这一切一下子全倒给他。这是给你自己的 — 背景信息。在合适的时候自然地提一下（"在上课"、"天我妈又跟我吵"、"在公交上"），不要一次性像讲课一样罗列。`);
  return parts.join("\n");
}
