import type { ProfileConfig, Weekday } from "../types.js";
import type { LLMClient } from "../llm/index.js";
import { readAgenda, writeAgenda, readMd, writeMd, readRelationship, type AgendaItem } from "../storage/md.js";
import { findStage } from "../presets/stages.js";
import { communicationDecisionState, normalizeCommunicationProfile } from "../presets/communication.js";
import type { DailyLife } from "./daily-life.js";
import type { ConflictState } from "./conflict.js";
import { searchPalaceDrawers } from "./memory-palace.js";
import { getTodayOccasions, renderOccasionsPrompt, type Occasion } from "../data/holidays.js";

/**
 * Agenda engine — 她会在心里记下"他明天有比赛"，
 * 自己决定什么时候发消息问他，如果他叫滚就推迟。
 *
 * 由以下部分组成：
 *   1. extractAgendaUpdates — 每次 user 消息后，LLM 决定是否创建/修改 agenda items
 *   2. tickAgenda — 每 ~60 秒 runtime 检查现在该发哪些消息
 *   3. handleResponseToProactive — 当用户回复她的主动消息时，LLM 决定「已收到 / 算了 / 再聊聊」
 */

function agendaById(items: AgendaItem[]): Map<string, AgendaItem> {
  return new Map(items.map(item => [item.id, item]));
}

const SYS_EXTRACT = `你是女友助手的模块。你的任务：每次男生发消息后，看看他是否提到了自己的未来（计划、事件、事情、截止日期、工作、比赛、考试、旅行），有什么是她会担心/想知道/在心里记下的——像真实的人，不是日历。还要判断她有没有理由之后主动给他发消息（没有他明显的触发）。

重要：
- 只表现真实的行为。不是他的每条消息都要创建 agenda。大多数——忽略。
- 在 "tg-given-cold" / "tg-given-warming" 阶段，她几乎不记东西也不发消息——冷淡的女生没什么太感兴趣的。
- 到了 "convinced" / "first-date-done" 阶段，她可能会表现出兴趣。
- 到了 "dating-early"+ 阶段，她开始真正担心，会问结果怎么样，会支持他。
- 如果他说"我明天有比赛"——她会在心里记下，在比赛开始后 ~1 小时发消息问"怎么样啦"。
- 如果他说的是中性内容——不要创建 agenda。

操作：
- "create" — agenda 中新添一条
- "update" — 修改已有条目（按 id）
- "cancel" — 取消（比如他改主意了）
- "noop" — 什么都不做（默认！）`;

const TEMPLATE_EXTRACT = (state: string, history: string, incoming: string, currentAgenda: AgendaItem[], nowISO: string, tz: string) => `${state}

现在 (${tz}): ${nowISO}

她当前关于他的 agenda（她记得/计划做的）：
${currentAgenda.length ? JSON.stringify(currentAgenda.map(a => ({ id: a.id, about: a.about, pingAt: a.pingAt, state: a.state })), null, 2) : "（空）"}

最近的消息：
${history}

他的新消息：
"""${incoming}"""

严格返回 JSON 动作数组（通常是空的）：
[
  {
    "action": "create" | "update" | "cancel" | "noop",
    "id"?: "string（用于 update/cancel）",
    "about"?: "简短描述他有什么事件",
    "userEventTime"?: "ISO 他的事件时间（如果他说了时间）或 null",
    "pingAt"?: "ISO 她计划发消息的时间",
    "reason"?: "她为什么想发消息（人性化，不要干巴巴）",
    "importance"?: 1|2|3
  }
]

规则：
- 如果是 "noop" — 返回 []
- 不要重复创建——如果已有类似 item，优先 "update" 而不是 "create"
- pingAt 要真实，不要"正好一小时后"。女生不会严格按照闹钟来。加 30-90 分钟的随机波动。
- 如果他明确要求"我工作/学习时别发"——把 pingAt 设在这个时段之后。
- 不要包在 markdown 里。只要 JSON。`;

interface ExtractAction {
  action: "create" | "update" | "cancel" | "noop";
  id?: string;
  about?: string;
  userEventTime?: string | null;
  pingAt?: string;
  reason?: string;
  importance?: 1 | 2 | 3;
}

interface AutonomousItem {
  about?: string;
  reason?: string;
  pingAt?: string;
  importance?: 1 | 2 | 3;
}

type SanitizedAutonomousItem = Required<Pick<AutonomousItem, "about" | "pingAt">> & Pick<AutonomousItem, "reason" | "importance">;

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function localDateKey(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function localParts(tz: string, when: Date): { hour: number; minute: number; weekday: Weekday } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = fmt.formatToParts(when);
    const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");
    const raw = (parts.find(p => p.type === "weekday")?.value ?? "Mon").toLowerCase().slice(0, 3);
    const map: Record<string, Weekday> = { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" };
    return { hour, minute, weekday: map[raw] ?? "mon" };
  } catch {
    return { hour: when.getHours(), minute: when.getMinutes(), weekday: WEEKDAYS[(when.getDay() + 6) % 7] ?? "mon" };
  }
}

function maxAutonomousItems(stage: string, initiative: "low" | "medium" | "high"): number {
  let base =
    stage === "tg-given-cold" ? (initiative === "high" ? 1 : 0) :
    stage === "met-irl-got-tg" ? 1 :
    stage === "tg-given-warming" ? 1 :
    stage === "convinced" || stage === "first-date-done" ? 2 :
    stage === "dating-early" ? 3 :
    4;
  if (initiative === "low") base = Math.max(0, base - 1);
  if (initiative === "high") base += 1;
  return base;
}

function isDuringSleep(cfg: ProfileConfig, when: Date): boolean {
  const { hour } = localParts(cfg.tz, when);
  const from = cfg.sleepFrom ?? 23;
  const to = cfg.sleepTo ?? 8;
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

function isDuringUnavailableBlock(dailyLife: DailyLife, cfg: ProfileConfig, when: Date): boolean {
  const { hour } = localParts(cfg.tz, when);
  const block = dailyLife.blocks?.find(b => hour >= b.fromHour && hour < b.toHour);
  return block?.phoneAvailable === false;
}

function normalizePingAt(raw: string | undefined, now: number, horizon: number): string | null {
  const t = raw ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(t) || t <= now + 5 * 60 * 1000 || t > horizon) return null;
  return new Date(t).toISOString();
}

function sanitizeAutonomousItems(
  items: AutonomousItem[],
  now: number,
  horizon: number,
  existingAbout: string[],
  limit: number,
  cfg?: ProfileConfig,
  dailyLife?: DailyLife
): SanitizedAutonomousItem[] {
  const out: SanitizedAutonomousItem[] = [];
  for (const item of items) {
    if (out.length >= limit) break;
    if (!item.about || item.about.trim().length < 3) continue;
    const about = item.about.trim().slice(0, 120);
    if (existingAbout.some(x => x.includes(about.toLowerCase()) || about.toLowerCase().includes(x))) continue;
    if (out.some(x => Math.abs(new Date(x.pingAt).getTime() - new Date(item.pingAt ?? "").getTime()) < 45 * 60 * 1000)) continue;
    const pingAt = normalizePingAt(item.pingAt, now, horizon);
    if (!pingAt) continue;
    const date = new Date(pingAt);
    if (cfg && isDuringSleep(cfg, date)) continue;
    if (cfg && dailyLife && isDuringUnavailableBlock(dailyLife, cfg, date)) continue;
    out.push({
      about,
      pingAt,
      reason: item.reason?.trim().slice(0, 160) || undefined,
      importance: item.importance && item.importance >= 1 && item.importance <= 3 ? item.importance : 1
    });
  }
  return out;
}

const SYS_AUTONOMOUS = `你是女友主动行为的内部规划器。她过着自己的生活，有时会主动先给男生发消息，不是因为他发了消息，而是因为她想起来了、想他了、心情不好、想分享小事、想查岗他在哪、想抱怨、想逗他、想让他知道她在乎。

任务是创建今天/明天她主动发消息的真实理由。这不是日历，也不是助手。这是一个真实的女生。

关键：不要编造聊天记录里没有的事件和话题。如果你提到他说过 X——确认 X 确实在聊天记录或 long-term memory 里。不能写你们从未讨论过的话题。最好写关于她自己的生活（今天、daily-life 里的事件），而不是引用不存在的对话。

严格返回 JSON：
{
  "items": [
    {
      "about": "她未来消息的简短主题",
      "reason": "她为什么主动发消息，人性化一点",
      "pingAt": "ISO 时间，什么时候发",
      "importance": 1
    }
  ]
}`;

const TEMPLATE_AUTONOMOUS = (
  state: string,
  dailyLife: DailyLife,
  history: string,
  currentAgenda: AgendaItem[],
  nowISO: string,
  tz: string,
  maxItems: number
) => `${state}

现在 (${tz}): ${nowISO}

她今天的一天：
${JSON.stringify({
  dateLocal: dailyLife.dateLocal,
  vibe: dailyLife.vibe,
  weather: dailyLife.weather,
  blocks: dailyLife.blocks,
  events: dailyLife.events,
  wants: dailyLife.wants
}, null, 2)}

最近的消息：
${history || "（聊天记录还不多）"}

已计划：
${currentAgenda.length ? JSON.stringify(currentAgenda.filter(a => a.state === "pending").map(a => ({ about: a.about, pingAt: a.pingAt, reason: a.reason })), null, 2) : "（空）"}

创建 0-${maxItems} 条未来 18 小时内的主动消息。

规则：
- 这必须是她的主动行为："哎呀我们现在...", "你跑哪去了", "我刚看到个东西", "我做了个怪梦", "我妈烦死了", "想发给你看看算了", "我累了"。
- 不要无缘无故地发无聊的"在干嘛"。
- 在冷淡阶段不要太粘人。
- 关键：不要编造聊天记录或 long-term memory 里没有的话题。不要引用不存在的事件/对话。如果历史里没有提到某个话题——不要写它。最好创建关于她自己的生活/一天/心情的 item。
- 到了 dating-early+ 阶段可以想他、吃醋、查岗、发日常琐事。
- pingAt 必须在将来，不能在她睡觉时间，也不能在 phoneAvailable=false 的 block 时段。
- 消息间隔至少 45 分钟。
- 不要重复创建当前 agenda 已有的内容。
- 如果今天按上下文不适合主动发消息——items=[]。
- 不要包在 markdown 里。只要 JSON。`;

export async function extractAgendaUpdates(
  llm: LLMClient,
  cfg: ProfileConfig,
  history: { role: "user" | "assistant"; content: string }[],
  incoming: string,
  chatId: string | number
): Promise<{ created: number; updated: number; cancelled: number }> {
  const stage = findStage(cfg.stage);
  const communication = normalizeCommunicationProfile(cfg);
  // Agenda 不用于冷淡阶段 — 节省 LLM 调用。
  if ((cfg.stage === "tg-given-cold" && communication.initiative !== "high") || (cfg.stage === "met-irl-got-tg" && communication.initiative === "low")) {
    return { created: 0, updated: 0, cancelled: 0 };
  }

  const persona = (await readMd(cfg.slug, "persona.md")).slice(0, 800);
  const stateBlock = `# 阶段: ${stage.label} (${stage.description})\n# ${communicationDecisionState(communication)}\n# persona 片段:\n${persona}`;
  const histStr = history.slice(-8).map(m => `${m.role === "user" ? "他" : "她"}: ${m.content}`).join("\n");
  const agenda = await readAgenda(cfg.slug);
  const now = new Date().toISOString();

  let actions: ExtractAction[] = [];
  try {
    const raw = await llm.chat(
      [{ role: "system", content: SYS_EXTRACT }, { role: "user", content: TEMPLATE_EXTRACT(stateBlock, histStr, incoming, agenda, now, cfg.tz) }],
      { temperature: 0.4, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) actions = parsed as ExtractAction[];
    else if (Array.isArray(parsed.actions)) actions = parsed.actions;
  } catch {
    return { created: 0, updated: 0, cancelled: 0 };
  }

  let created = 0, updated = 0, cancelled = 0;
  const byId = agendaById(agenda);
  for (const a of actions) {
    if (a.action === "noop" || !a.action) continue;
    if (a.action === "create" && a.about && a.pingAt) {
      const item: AgendaItem = {
        id: `ag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        about: a.about,
        userEventTime: a.userEventTime || undefined,
        pingAt: a.pingAt,
        reason: a.reason ?? "想知道结果怎么样",
        importance: (a.importance ?? 1) as 1 | 2 | 3,
        state: "pending",
        attempts: 0,
        chatId,
        createdAt: new Date().toISOString(),
        history: [`created from his message at ${new Date().toISOString()}`]
      };
      agenda.push(item);
      created++;
    } else if (a.action === "update" && a.id) {
      const item = byId.get(a.id);
      if (item) {
        if (a.about) item.about = a.about;
        if (a.pingAt) item.pingAt = a.pingAt;
        if (a.reason) item.reason = a.reason;
        if (a.userEventTime) item.userEventTime = a.userEventTime;
        if (a.importance) item.importance = a.importance;
        item.history = [...(item.history ?? []), `updated at ${new Date().toISOString()}: ${a.reason ?? ""}`];
        updated++;
      }
    } else if (a.action === "cancel" && a.id) {
      const item = byId.get(a.id);
      if (item) {
        item.state = "cancelled";
        item.history = [...(item.history ?? []), `cancelled at ${new Date().toISOString()}: ${a.reason ?? ""}`];
        cancelled++;
      }
    }
  }
  if (created || updated || cancelled) {
    await writeAgenda(cfg.slug, agenda);
  }
  return { created, updated, cancelled };
}

export async function ensureAutonomousAgenda(
  llm: LLMClient,
  cfg: ProfileConfig,
  dailyLife: DailyLife | undefined,
  chatId: string | number,
  history: { role: "user" | "assistant"; content: string }[],
  conflict: ConflictState | null = null
): Promise<{ created: number }> {
  if (!dailyLife || cfg.stage === "dumped") return { created: 0 };
  if (conflict && conflict.level >= 2) return { created: 0 };
  const dateKey = dailyLife.dateLocal || localDateKey(cfg.tz);
  const statePath = "memory/proactive-state.md";
  const state = await readMd(cfg.slug, statePath);
  if (state.includes(`autonomous:${dateKey}`)) return { created: 0 };

  const agenda = await readAgenda(cfg.slug);
  const communication = normalizeCommunicationProfile(cfg);
  const maxItems = maxAutonomousItems(cfg.stage, communication.initiative);
  if (maxItems <= 0) {
    await writeMd(cfg.slug, statePath, `${state.trim()}\nautonomous:${dateKey} created=0`.trim() + "\n");
    return { created: 0 };
  }

  const now = Date.now();
  const horizon = now + 18 * 60 * 60 * 1000;
  const pendingSoon = agenda.filter(a =>
    a.state === "pending" &&
    a.chatId === chatId &&
    new Date(a.pingAt).getTime() > now &&
    new Date(a.pingAt).getTime() <= horizon
  );
  if (pendingSoon.length >= maxItems) {
    await writeMd(cfg.slug, statePath, `${state.trim()}\nautonomous:${dateKey} created=0`.trim() + "\n");
    return { created: 0 };
  }

  const stage = findStage(cfg.stage);
  const rel = await readRelationship(cfg.slug);
  const persona = (await readMd(cfg.slug, "persona.md")).slice(0, 900);
  const speech = (await readMd(cfg.slug, "speech.md")).slice(0, 600);
  const palace = await searchPalaceDrawers(cfg, history.slice(-8).map(m => m.content).join("\n"), 8);
  const longTerm = palace.length
    ? palace.map(d => `- [${d.ts.slice(0, 10)} ${d.hall}/${d.room}] ${d.quote}`).join("\n")
    : (await readMd(cfg.slug, "memory/long-term.md")).slice(-1200);
  const histStr = history.slice(-16).map(m => `${m.role === "user" ? "他" : "她"}: ${m.content}`).join("\n");
  const stateBlock = [
    `# 阶段: ${stage.label} (${cfg.stage})`,
    `# 阶段描述: ${stage.description}`,
    `# Score: ${JSON.stringify(rel.score)}`,
    `# ${communicationDecisionState(communication)}`,
    `# persona:\n${persona}`,
    `# speech:\n${speech}`,
    longTerm ? `# long-term memory（真正知道的关于他的信息）:\n${longTerm}` : "# long-term memory: （空 — 目前还不了解他，不要编造事实）"
  ].filter(Boolean).join("\n\n");

  let items: AutonomousItem[] = [];
  // 节假日感知 — 把今天的节日 / 生日注入 LLM context，让她生成相关主动消息
  const nowDate = new Date();
  const todayOccasions = getTodayOccasions(nowDate, cfg);
  const occasionFragment = renderOccasionsPrompt(todayOccasions);
  try {
    const raw = await llm.chat(
      [{ role: "system", content: SYS_AUTONOMOUS }, { role: "user", content: TEMPLATE_AUTONOMOUS(stateBlock, dailyLife, histStr, agenda, new Date().toISOString(), cfg.tz, maxItems - pendingSoon.length) + (occasionFragment ? `\n\n${occasionFragment}` : "") }],
      { temperature: 0.8, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    await writeMd(cfg.slug, statePath, `${state.trim()}\nautonomous:${dateKey} created=0 fallback`.trim() + "\n");
    return { created: 0 };
  }

  const existingAbout = agenda.map(a => a.about.toLowerCase());
  const selected = sanitizeAutonomousItems(items, now, horizon, existingAbout, maxItems - pendingSoon.length, cfg, dailyLife);
  for (const item of selected) {
    agenda.push({
      id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      about: item.about!,
      pingAt: item.pingAt!,
      reason: item.reason ?? "自己想发消息",
      importance: item.importance ?? 1,
      state: "pending",
      attempts: 0,
      chatId,
      createdAt: new Date().toISOString(),
      history: [`autonomous:${dateKey}`]
    });
  }

  // 节假日兜底：如果今天有节日但 LLM 没生成相关 item，确保至少追加一条 importance=3 的 item
  if (todayOccasions.length > 0 && !occasionCoveredByAgenda(agenda, todayOccasions)) {
    const occ = todayOccasions[0]!;
    const pingAt = computeOccasionPingAt(now, horizon, cfg, dailyLife);
    if (pingAt) {
      agenda.push({
        id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        about: `节日相关：${occ.name}`,
        pingAt,
        reason: occ.vibe,
        importance: 3,
        state: "pending",
        attempts: 0,
        chatId,
        createdAt: new Date().toISOString(),
        history: [`autonomous:${dateKey}`, `occasion:${occ.kind}/${occ.name}`]
      });
      selected.push({
        about: `节日相关：${occ.name}`,
        pingAt,
        reason: occ.vibe,
        importance: 3
      });
    }
  }

  if (selected.length) await writeAgenda(cfg.slug, agenda);
  await writeMd(cfg.slug, statePath, `${state.trim()}\nautonomous:${dateKey} created=${selected.length}`.trim() + "\n");
  return { created: selected.length };
}

/**
 * 检查当前 agenda 中是否已有节日相关条目（粗匹配节日名）。
 */
function occasionCoveredByAgenda(agenda: AgendaItem[], occasions: Occasion[]): boolean {
  const lc = agenda.map(a => a.about.toLowerCase());
  return occasions.some(o => lc.some(a => a.includes(o.name.toLowerCase())));
}

/**
 * 给节日选一个合适的 pingAt：现在 + 30~120 分钟之间的随机，
 * 跳过睡眠时段和 phoneAvailable=false 的 block。
 */
function computeOccasionPingAt(
  now: number,
  horizon: number,
  cfg: ProfileConfig,
  dailyLife: DailyLife | undefined
): string | null {
  const delayMin = 30 + Math.random() * 90;
  const t = now + delayMin * 60_000;
  if (t > horizon) return null;
  const date = new Date(t);
  if (isDuringSleep(cfg, date)) return null;
  if (dailyLife && isDuringUnavailableBlock(dailyLife, cfg, date)) return null;
  return date.toISOString();
}

export async function reconcileAgendaAfterConflict(
  slug: string,
  conflict: ConflictState,
  prevLevel: number
): Promise<{ cancelled: number; rescheduled: number }> {
  if (conflict.level === 0 || conflict.level <= prevLevel) return { cancelled: 0, rescheduled: 0 };

  const agenda = await readAgenda(slug);
  const pending = agenda.filter(a => a.state === "pending");
  if (!pending.length) return { cancelled: 0, rescheduled: 0 };

  let cancelled = 0;
  let rescheduled = 0;
  const now = Date.now();

  for (const item of pending) {
    if (conflict.level >= 3 || item.importance === 1) {
      item.state = "cancelled";
      item.history = [...(item.history ?? []), `cancelled due to conflict level ${conflict.level} at ${new Date().toISOString()}`];
      cancelled++;
    } else if (conflict.level >= 2 && item.importance === 2) {
      const delayHours = 12 + Math.random() * 24;
      const newPing = new Date(now + delayHours * 3600_000).toISOString();
      item.pingAt = newPing;
      item.history = [...(item.history ?? []), `rescheduled due to conflict level ${conflict.level} at ${new Date().toISOString()}`];
      rescheduled++;
    }
  }

  if (cancelled || rescheduled) {
    await writeAgenda(slug, agenda);
  }
  return { cancelled, rescheduled };
}

/** 返回 pingAt <= now 且 state="pending" 的 items。 */
export async function dueAgendaItems(slug: string): Promise<AgendaItem[]> {
  const agenda = await readAgenda(slug);
  const now = Date.now();
  return agenda.filter(a => a.state === "pending" && new Date(a.pingAt).getTime() <= now);
}

export async function markAgendaFired(slug: string, id: string): Promise<void> {
  const agenda = await readAgenda(slug);
  const item = agendaById(agenda).get(id);
  if (item) {
    item.state = "fired";
    item.attempts += 1;
    item.history = [...(item.history ?? []), `fired at ${new Date().toISOString()}`];
    await writeAgenda(slug, agenda);
  }
}

export async function rescheduleAgenda(slug: string, id: string, newPingAt: string, note: string): Promise<void> {
  const agenda = await readAgenda(slug);
  const item = agendaById(agenda).get(id);
  if (item) {
    item.pingAt = newPingAt;
    item.state = "pending";
    item.history = [...(item.history ?? []), `rescheduled to ${newPingAt}: ${note}`];
    await writeAgenda(slug, agenda);
  }
}

const SYS_RESCHED = `你是女友的内部规划器。她最近主动给用户发了消息（item 如下），他回复了。决定她是否需要再发、什么时候发。这是真实人的行为：如果他说"忙着呢，别烦"——她会生气或理解然后推迟。如果他说"好晚上聊"——她会设到晚上。如果她的问题得到了正常回答——她满足了，agenda 可以取消。

严格返回 JSON：
{
  "decision": "satisfied" | "reschedule" | "give-up",
  "newPingAt"?: "ISO 如果是 reschedule",
  "note": "简短说明为什么这么决定"
}`;

export async function decideAfterProactiveResponse(
  llm: LLMClient,
  cfg: ProfileConfig,
  item: AgendaItem,
  userResponse: string
): Promise<{ decision: "satisfied" | "reschedule" | "give-up"; newPingAt?: string; note: string }> {
  const now = new Date().toISOString();
  const prompt = `阶段: ${cfg.stage}
现在 (${cfg.tz}): ${now}
Item:
${JSON.stringify(item, null, 2)}

用户回复了她的消息：
"""${userResponse}"""

决定？`;
  try {
    const raw = await llm.chat(
      [{ role: "system", content: SYS_RESCHED }, { role: "user", content: prompt }],
      { temperature: 0.5, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);
    return {
      decision: parsed.decision ?? "satisfied",
      newPingAt: parsed.newPingAt,
      note: parsed.note ?? ""
    };
  } catch {
    // 默认 — 不再发消息以免显得纠缠
    return { decision: "satisfied", note: "fallback" };
  }
}
