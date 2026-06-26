import type { LLMClient } from "../llm/index.js";
import type { ProfileConfig } from "../types.js";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  appendMd,
  appendSharedMemory,
  listDailySummaries,
  listSessionDays,
  profileDir,
  readDailySummary,
  readMd,
  readSessionLog,
  sessionDate,
  stripLogMetadata,
  writeMd
} from "../storage/md.js";

export type MemoryHall =
  | "hall_facts"
  | "hall_events"
  | "hall_discoveries"
  | "hall_preferences"
  | "hall_advice"
  | "hall_promises"
  | "hall_open_loops"
  | "hall_feelings"
  | "hall_uncertain";

export interface MemoryDrawer {
  id: string;
  ts: string;
  wing: string;
  room: string;
  hall: MemoryHall;
  source: string;
  quote: string;
  keywords: string[];
  salience: number;
}

export interface MemoryPalaceContext {
  facts: string;
  episodes: string;
  relationshipTimeline: string;
  attachment: string;
  time: string;
  weeklyLife: string;
  socialGraph: string;
  habits: string;
  openLoops: string;
  palace: string;
}

type ParsedMemoryDrawer = Omit<MemoryDrawer, "id" | "ts" | "wing" | "source">;

const DEFAULT_FACTS = `# facts
- 主要对话者的名字未知
- 关于他的重要事实，只有在他明确亲口说出时才记录
- 有争议的事实保留为 uncertain，不要武断地断言`;

const DEFAULT_ATTACHMENT = `# attachment
attachment: anxious-avoidant
jealousy: 0.58
needForAttention: 0.66
trustRecoverySpeed: 0.34
conflictStyle: withdraws_then_snaps
flirtStyle: teasing_then_soft
apologyStyle: awkward_short`;

const DEFAULT_WEEKLY = `# week-plan
工作日：学习/工作、通勤，晚上刷手机/看剧/闺蜜/宅家
周末：睡懒觉，处理琐事，偶尔和闺蜜见面
不是每天都有空；有时忙、累了，或者就是不想回`;

const DEFAULT_SOCIAL = `# contacts
- 妈妈：生活摩擦、控制欲，偶尔也会关心
- 莉拉：闺蜜，嘴毒，爱约出去逛街
- 娜斯佳：性格更稳一点的闺蜜，会听语音
- 同学/同事：背景板，不是感情线`;

const DEFAULT_HABITS = `# habits
- 早上回复比较冷淡
- 晚上更温柔，前提是一天没被惹毛
- 累了会已读，然后拖着不回
- 很少解释自己为什么消失
- 如果某个细节情绪上戳中她，可能隔天还会想起来`;

const HALLS: readonly MemoryHall[] = [
  "hall_facts",
  "hall_events",
  "hall_discoveries",
  "hall_preferences",
  "hall_advice",
  "hall_promises",
  "hall_open_loops",
  "hall_feelings",
  "hall_uncertain"
];

const STOP_WORDS = new Set([
  "这个", "怎么", "什么", "或者", "如果", "她", "他们", "他的", "他", "你", "我", "为了",
  "关于", "上面", "下面", "当时", "没有", "还", "已经", "那里", "这里", "也", "之后", "现在",
  "什么时候", "为什么", "因为", "很", "只是", "根本", "简单说", "类似"
]);

function wordsFrom(text: string): string[] {
  return [...text.toLowerCase().matchAll(/[a-zA-Z0-9]{3,}|[\u4e00-\u9fa5]{2,}/gi)]
    .map(match => match[0])
    .filter(token => !STOP_WORDS.has(token));
}

function normalizedQuote(value: string): string {
  return stripLogMetadata(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function today(tz: string): string {
  return sessionDate(tz);
}

function nowStamp(): string {
  return new Date().toISOString();
}

function wingFor(cfg: ProfileConfig): string {
  return `primary-${cfg.ownerId ?? "unknown"}`;
}

function normalizeRoom(value: string): string {
  const source = value.trim().toLowerCase() || "general";
  const slug = source
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "general";
}

function normalizeHall(value: string): MemoryHall {
  return (HALLS as readonly string[]).includes(value) ? value as MemoryHall : "hall_facts";
}

function normalizeKeywords(value: unknown, quote: string, room: string): string[] {
  const raw = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  const fallback = [...quote.toLowerCase().matchAll(/[a-zA-Z0-9]{3,}|[\u4e00-\u9fa5]{2,}/gi)]
    .map(match => match[0])
    .filter(word => !STOP_WORDS.has(word))
    .slice(0, 10);
  return [...new Set([...raw, room, ...fallback]
    .map(x => x.trim().toLowerCase())
    .filter(Boolean))]
    .slice(0, 16);
}

function scoreClamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function safeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stableId(source: string, quote: string): string {
  return createHash("sha1").update(`${source}\n${quote}`).digest("hex").slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDrawer(raw: string): MemoryDrawer | null {
  const metaMatch = raw.match(/^<!--drawer:(.+?)-->\n/);
  if (!metaMatch) return null;
  try {
    const meta = JSON.parse(metaMatch[1] ?? "") as Partial<MemoryDrawer>;
    const quote = stripLogMetadata(raw.slice(metaMatch[0].length));
    if (!meta.id || !meta.ts || !meta.wing || !meta.room || !meta.hall || !meta.source || !quote.trim()) return null;
    return {
      id: meta.id,
      ts: meta.ts,
      wing: meta.wing,
      room: meta.room,
      hall: normalizeHall(meta.hall),
      source: meta.source,
      quote: quote.trim(),
      keywords: normalizeKeywords(meta.keywords, quote, meta.room),
      salience: scoreClamp(meta.salience)
    };
  } catch {
    return null;
  }
}

function renderDrawer(drawer: MemoryDrawer): string {
  const meta = {
    id: drawer.id,
    ts: drawer.ts,
    wing: drawer.wing,
    room: drawer.room,
    hall: drawer.hall,
    source: drawer.source,
    keywords: drawer.keywords,
    salience: drawer.salience
  };
  return `<!--drawer:${JSON.stringify(meta)}-->\n${drawer.quote.trim()}\n`;
}

function drawerPath(drawer: MemoryDrawer): string {
  return `memory/palace/${drawer.wing}/${drawer.hall}/${drawer.room}/${drawer.id}.md`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
}

function parsedDrawers(value: unknown): ParsedMemoryDrawer[] {
  if (!Array.isArray(value)) return [];
  const out: ParsedMemoryDrawer[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const quote = typeof rec.quote === "string" ? stripLogMetadata(rec.quote).trim() : "";
    if (!quote) continue;
    const room = normalizeRoom(typeof rec.room === "string" ? rec.room : "");
    out.push({
      room,
      hall: normalizeHall(typeof rec.hall === "string" ? rec.hall : ""),
      quote,
      keywords: normalizeKeywords(rec.keywords, quote, room),
      salience: scoreClamp(rec.salience)
    });
  }
  return out;
}

async function ensureDefaults(cfg: ProfileConfig): Promise<void> {
  const defaults: [string, string][] = [
    ["memory/facts.md", DEFAULT_FACTS],
    ["relationship/timeline.md", `# relationship timeline\n- ${nowStamp()}: 档案已创建，阶段 ${cfg.stage}`],
    ["life/week-plan.md", DEFAULT_WEEKLY],
    ["life/contacts.md", DEFAULT_SOCIAL],
    ["life/habits.md", DEFAULT_HABITS],
    ["personality/attachment.md", DEFAULT_ATTACHMENT],
    ["time/open-loops.md", "# open loops\n"],
    ["time/promises.md", "# promises\n"],
    ["memory/uncertain.md", "# uncertain\n"]
  ];
  await Promise.all(defaults.map(async ([path, content]) => {
    const current = await readMd(cfg.slug, path);
    if (!current.trim()) await writeMd(cfg.slug, path, content + "\n");
  }));
}

function scoreDrawer(drawer: MemoryDrawer, tokens: string[], query: string): number {
  if (!tokens.length) return drawer.salience;
  const haystack = [
    drawer.quote,
    drawer.room,
    drawer.hall,
    drawer.keywords.join(" ")
  ].join("\n").toLowerCase();
  let score = drawer.salience;
  for (const token of tokens) {
    if (haystack.includes(token)) score += drawer.keywords.includes(token) ? 4 : 2;
  }
  if (drawer.quote.toLowerCase().includes(query)) score += 4;
  return score;
}

async function listPalaceDrawers(cfg: ProfileConfig): Promise<MemoryDrawer[]> {
  const root = `memory/palace/${wingFor(cfg)}`;
  const halls = await listChildDirs(cfg.slug, root);
  const drawers: MemoryDrawer[] = [];
  for (const hall of halls) {
    const rooms = await listChildDirs(cfg.slug, `${root}/${hall}`);
    for (const room of rooms) {
      const files = await listChildFiles(cfg.slug, `${root}/${hall}/${room}`);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const drawer = parseDrawer(await readMd(cfg.slug, `${root}/${hall}/${room}/${file}`));
        if (drawer) drawers.push(drawer);
      }
    }
  }
  return drawers;
}

async function listChildDirs(slug: string, rel: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(profileDir(slug), rel), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch {
    return [];
  }
}

async function listChildFiles(slug: string, rel: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(profileDir(slug), rel), { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
  } catch {
    return [];
  }
}

function renderPalaceRecall(drawers: MemoryDrawer[]): string {
  if (!drawers.length) return "";
  const grouped = new Map<string, MemoryDrawer[]>();
  for (const drawer of drawers) {
    const key = `${drawer.hall}/${drawer.room}`;
    grouped.set(key, [...(grouped.get(key) ?? []), drawer]);
  }
  const lines = ["## Memory Palace: 按主题的精确抽屉"];
  for (const [key, group] of grouped) {
    lines.push(`### ${key}`);
    for (const drawer of group.slice(0, 4)) {
      lines.push(`- [${drawer.ts.slice(0, 10)}] ${drawer.quote}`);
    }
  }
  lines.push("把这些抽屉当作精确记忆。不要引用 hall/room/source 这些系统字段，也不要说它是文件或记忆。");
  return lines.join("\n");
}

export async function searchPalaceDrawers(cfg: ProfileConfig, query: string, limit = 8): Promise<MemoryDrawer[]> {
  const normalized = query.toLowerCase();
  const tokens = wordsFrom(normalized);
  const scored = (await listPalaceDrawers(cfg))
    .map(drawer => ({ drawer, score: scoreDrawer(drawer, tokens, normalized) }))
    .filter(item => item.score > item.drawer.salience || item.drawer.salience >= 8)
    .sort((a, b) => b.score - a.score || b.drawer.ts.localeCompare(a.drawer.ts));
  return scored.slice(0, limit).map(item => item.drawer);
}

export async function loadMemoryPalaceContext(cfg: ProfileConfig, incoming?: string): Promise<MemoryPalaceContext> {
  await ensureDefaults(cfg);
  const [facts, episodesRaw, timeline, attachment, openLoops, promises, weeklyLife, socialGraph, habits, palaceHits] = await Promise.all([
    readMd(cfg.slug, "memory/facts.md"),
    readMd(cfg.slug, `memory/episodes/${today(cfg.tz)}.md`),
    readMd(cfg.slug, "relationship/timeline.md"),
    readMd(cfg.slug, "personality/attachment.md"),
    readMd(cfg.slug, "time/open-loops.md"),
    readMd(cfg.slug, "time/promises.md"),
    readMd(cfg.slug, "life/week-plan.md"),
    readMd(cfg.slug, "life/contacts.md"),
    readMd(cfg.slug, "life/habits.md"),
    incoming && incoming.trim().length > 3 ? searchPalaceDrawers(cfg, incoming, 10) : Promise.resolve([])
  ]);
  const query = incoming?.toLowerCase() ?? "";
  const factLines = facts.split("\n").filter(l => l.trim());
  const tokens = wordsFrom(query);
  const relevantFacts = tokens.length
    ? factLines.filter(l => tokens.some(t => l.toLowerCase().includes(t))).slice(-18).join("\n") || facts.slice(-1800)
    : facts.slice(-1800);
  return {
    facts: stripLogMetadata(relevantFacts),
    episodes: stripLogMetadata(episodesRaw.slice(-2200)),
    relationshipTimeline: stripLogMetadata(timeline.slice(-2200)),
    attachment: stripLogMetadata(attachment.slice(-1200)),
    time: stripLogMetadata([openLoops.slice(-1400), promises.slice(-1400)].filter(Boolean).join("\n\n")),
    weeklyLife: stripLogMetadata(weeklyLife.slice(-1200)),
    socialGraph: stripLogMetadata(socialGraph.slice(-1200)),
    habits: stripLogMetadata(habits.slice(-1200)),
    openLoops: stripLogMetadata(openLoops.slice(-1400)),
    palace: renderPalaceRecall(palaceHits)
  };
}

export function memoryPalacePromptFragment(ctx: MemoryPalaceContext): string {
  return [
    "# 真实的连续性",
    "把这些数据当作背景，而不是报告。不要说你拥有记忆、文件、事实或系统。",
    "如果没有确切事实——不要自信地编造；用含糊或人性化的方式回应、追问。",
    ctx.palace,
    "## 关于他的事实", ctx.facts,
    "## 今日片段", ctx.episodes || "还没有亮眼的片段",
    "## 关系史", ctx.relationshipTimeline,
    "## 依恋与性格", ctx.attachment,
    "## 时间、承诺、未完成的事", ctx.time || "没有未完成的事",
    "## 一周生活", ctx.weeklyLife,
    "## 社交圈", ctx.socialGraph,
    "## 习惯", ctx.habits
  ].filter(Boolean).join("\n\n");
}

async function appendDrawer(cfg: ProfileConfig, source: string, parsed: ParsedMemoryDrawer): Promise<void> {
  const stamp = nowStamp();
  const safeParsed = { ...parsed, quote: stripLogMetadata(parsed.quote) };
  const quoteKey = normalizedQuote(safeParsed.quote);
  if (!quoteKey) return;
  const duplicate = (await listPalaceDrawers(cfg)).find(existing =>
    normalizedQuote(existing.quote) === quoteKey ||
    (existing.room === safeParsed.room && existing.hall === safeParsed.hall && normalizedQuote(existing.quote).includes(quoteKey)) ||
    (existing.room === safeParsed.room && existing.hall === safeParsed.hall && quoteKey.includes(normalizedQuote(existing.quote)))
  );
  if (duplicate && duplicate.salience >= safeParsed.salience) return;
  const drawer: MemoryDrawer = {
    id: stableId(source, safeParsed.quote),
    ts: stamp,
    wing: wingFor(cfg),
    room: safeParsed.room,
    hall: safeParsed.hall,
    source,
    quote: safeParsed.quote,
    keywords: safeParsed.keywords,
    salience: safeParsed.salience
  };
  const existing = await readMd(cfg.slug, drawerPath(drawer));
  if (existing.trim()) return;
  await writeMd(cfg.slug, drawerPath(drawer), renderDrawer(drawer));
  await appendCompatibilityMemory(cfg, drawer);
}

async function appendCompatibilityMemory(cfg: ProfileConfig, drawer: MemoryDrawer): Promise<void> {
  const stamp = drawer.ts;
  const line = `- ${stamp}: ${drawer.quote}\n`;
  if (drawer.hall === "hall_facts" || drawer.hall === "hall_preferences" || drawer.hall === "hall_discoveries") {
    await appendMd(cfg.slug, "memory/facts.md", line);
    await appendMd(cfg.slug, "memory/long-term.md", `\n## ${stamp.slice(0, 16)}\n- ${drawer.quote}`);
  } else if (drawer.hall === "hall_events" || drawer.hall === "hall_feelings") {
    await appendMd(cfg.slug, `memory/episodes/${today(cfg.tz)}.md`, line);
  } else if (drawer.hall === "hall_promises") {
    await appendMd(cfg.slug, "time/promises.md", line);
  } else if (drawer.hall === "hall_open_loops") {
    await appendMd(cfg.slug, "time/open-loops.md", line);
  } else if (drawer.hall === "hall_uncertain") {
    await appendMd(cfg.slug, "memory/uncertain.md", line);
  }
  if (drawer.hall === "hall_events" && drawer.salience >= 8) {
    await appendMd(cfg.slug, "relationship/timeline.md", line);
  }
}

export async function recordInteractionMemory(llm: LLMClient, cfg: ProfileConfig, incoming: string, reply?: string, fromId?: number, scope: "primary" | "acquaintance" = "primary"): Promise<void> {
  const safeIncoming = stripLogMetadata(incoming);
  const safeReply = stripLogMetadata(reply ?? "");
  if (!safeIncoming.trim()) return;
  await ensureDefaults(cfg);
  const raw = await llm.chat([
    {
      role: "system",
      content: scope === "acquaintance"
        ? `你正在为第三方 Telegram 对话者提取跨聊天记忆。只需要安全的基础事实：谁在说话、整体语气、明确的非私密事实、异常/危险行为。禁止保存秘密、地址、文件、私密内容、令牌、联系方式、逐字长引用。写得简短且概括。`
        : `你正在为 Telegram 虚拟女友提取记忆。MemPalace 原则：逐字保留原始表述，不要复述，不要压缩。只需要明确的事实、偏好、承诺、未完成的事、情绪片段和存疑事实。如果整句话很重要——完整保存，不要删任何一个字。不要编造。`
    },
    {
      role: "user",
      content: `档案：${cfg.name}，阶段 ${cfg.stage}。
他发了：
"""
${safeIncoming}
"""

她回了：
"""
${safeReply}
"""

返回 STRICT JSON:
{
  "drawers": [
    {
      "room": "简短主题，中文或 latin-slug",
      "hall": "hall_facts | hall_events | hall_discoveries | hall_preferences | hall_advice | hall_promises | hall_open_loops | hall_feelings | hall_uncertain",
      "quote": "对话中的逐字短语/片段，不要复述，不要删掉重要词",
      "keywords": ["搜索关键词"],
      "salience": 1-10
    }
  ]
}`
    }
  ], { temperature: 0.1, maxTokens: 3500, json: true });
  const parsed = parseJsonObject(raw);
  const drawers = parsedDrawers(parsed?.drawers).slice(0, scope === "acquaintance" ? 4 : 12);
  if (scope === "acquaintance") {
    if (!fromId) return;
    for (const drawer of drawers) {
      await appendSharedMemory(cfg.slug, cfg.tz, fromId, drawer.quote);
    }
    return;
  }
  for (const drawer of drawers) {
    await appendDrawer(cfg, "interaction", drawer);
  }
}

export async function mineDailyLogToPalace(llm: LLMClient, cfg: ProfileConfig, day: string): Promise<number> {
  await ensureDefaults(cfg);
  const log = stripLogMetadata(await readSessionLog(cfg.slug, day));
  if (!log.trim()) return 0;
  const chunks = splitTextByChars(log, 12000);
  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    const raw = await llm.chat([
      {
        role: "system",
        content: `你正在把一天的聊天记录挖掘进 Memory Palace。尽量保留事实和逐字表述。不要 summarizing 替代 quote：quote 必须是日志的原始片段。可以有很多 drawers，但每个都是独立的记忆原子。`
      },
      {
        role: "user",
        content: `日期：${day}。档案：${cfg.name}，阶段 ${cfg.stage}。
第 ${i + 1}/${chunks.length} 部分。日志：
"""
${chunks[i] ?? ""}
"""

返回 STRICT JSON:
{
  "drawers": [
    {
      "room": "主题",
      "hall": "hall_facts | hall_events | hall_discoveries | hall_preferences | hall_advice | hall_promises | hall_open_loops | hall_feelings | hall_uncertain",
      "quote": "日志的逐字片段，不要删掉重要词",
      "keywords": ["搜索关键词"],
      "salience": 1-10
    }
  ]
}`
      }
    ], { temperature: 0.1, maxTokens: 8000, json: true });
    const parsed = parseJsonObject(raw);
    const drawers = parsedDrawers(parsed?.drawers).slice(0, 80);
    for (const drawer of drawers) {
      await appendDrawer(cfg, `log/${day}`, drawer);
    }
    total += drawers.length;
  }
  if (total) {
    await writeMd(cfg.slug, `memory/palace/.mined/${day}.txt`, nowStamp() + "\n");
  }
  return total;
}

function splitTextByChars(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    if (current.length + line.length + 1 > maxChars && current) {
      chunks.push(current);
      current = "";
    }
    current += current ? `\n${line}` : line;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function mineUnminedDailyLogs(llm: LLMClient, cfg: ProfileConfig, maxDays = 3): Promise<number> {
  const todayDay = today(cfg.tz);
  const days = (await listSessionDays(cfg.slug)).filter(day => day !== todayDay).reverse();
  let mined = 0;
  let checked = 0;
  for (const day of days) {
    if (checked >= maxDays) break;
    const mark = await readMd(cfg.slug, `memory/palace/.mined/${day}.txt`);
    if (mark.trim()) continue;
    checked++;
    mined += await mineDailyLogToPalace(llm, cfg, day);
  }
  return mined;
}

export async function migrateExistingMemoryToPalace(cfg: ProfileConfig): Promise<number> {
  await ensureDefaults(cfg);
  const existing = await listPalaceDrawers(cfg);
  if (existing.length) return 0;
  let made = 0;
  const wing = wingFor(cfg);
  const migrateLines = async (source: string, content: string, hall: MemoryHall, room: string) => {
    const lines = stripLogMetadata(content).split("\n").map(line => line.trim()).filter(line => line.startsWith("- "));
    for (const line of lines) {
      const quote = stripLogMetadata(line.replace(/^-\s*/, "")).trim();
      if (!quote) continue;
      const drawer: MemoryDrawer = {
        id: safeId(),
        ts: nowStamp(),
        wing,
        room: normalizeRoom(room),
        hall,
        source,
        quote,
        keywords: normalizeKeywords([], quote, room),
        salience: hall === "hall_uncertain" ? 4 : 6
      };
      await writeMd(cfg.slug, drawerPath(drawer), renderDrawer(drawer));
      made++;
    }
  };
  await migrateLines("memory/facts.md", await readMd(cfg.slug, "memory/facts.md"), "hall_facts", "facts");
  await migrateLines("memory/uncertain.md", await readMd(cfg.slug, "memory/uncertain.md"), "hall_uncertain", "uncertain");
  await migrateLines("time/promises.md", await readMd(cfg.slug, "time/promises.md"), "hall_promises", "promises");
  await migrateLines("time/open-loops.md", await readMd(cfg.slug, "time/open-loops.md"), "hall_open_loops", "open-loops");
  const dailyDays = await listDailySummaries(cfg.slug);
  for (const day of dailyDays.slice(-30)) {
    const summary = await readDailySummary(cfg.slug, day);
    if (summary.trim()) {
      const drawer: MemoryDrawer = {
        id: safeId(),
        ts: nowStamp(),
        wing,
        room: normalizeRoom(day),
        hall: "hall_events",
        source: `memory/daily/${day}.md`,
        quote: summary.trim(),
        keywords: normalizeKeywords([day], summary, day),
        salience: 5
      };
      await writeMd(cfg.slug, drawerPath(drawer), renderDrawer(drawer));
      made++;
    }
  }
  return made;
}
