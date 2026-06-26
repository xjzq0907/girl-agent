import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, accessSync, constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ProfileConfig, RelationshipScore } from "../types.js";
import { normalizeCommunicationProfile, normalizeIgnoreTendency } from "../presets/communication.js";

/**
 * 配置文件根目录。
 *
 * 可通过 `GIRL_AGENT_DATA` 覆盖（由桌面包装层使用，
 * 将数据存储在 `%APPDATA%/girl-agent/data` 或 `~/.local/share/...`）。
 * 默认：
 * - 项目源码中 — `./data`；
 * - 通过 npx/全局二进制从任意文件夹运行时 — XDG data dir。
 */
export const DATA_ROOT = process.env.GIRL_AGENT_DATA
  ? path.resolve(process.env.GIRL_AGENT_DATA)
  : defaultDataRoot();

function canWriteDir(dir: string): boolean {
  try {
    existsSync(dir) || mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultDataRoot(): string {
  const cwd = process.cwd();
  const projectData = path.resolve(cwd, "data");
  if (looksLikeProjectRoot(cwd) && canWriteDir(path.dirname(projectData))) return projectData;
  // Issue #72: 在 Windows 上存储在 %APPDATA%\\girl-agent\\data — 这是
  // 没有 XDG 时 npm 应用的预期配置位置。
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA
      ? path.resolve(process.env.APPDATA)
      : path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "girl-agent", "data");
  }
  // macOS: ~/Library/Application Support/girl-agent/data（如果未设置 XDG）
  if (process.platform === "darwin" && !process.env.XDG_DATA_HOME) {
    return path.join(os.homedir(), "Library", "Application Support", "girl-agent", "data");
  }
  const xdg = process.env.XDG_DATA_HOME
    ? path.resolve(process.env.XDG_DATA_HOME)
    : path.join(os.homedir(), ".local", "share");
  return path.join(xdg, "girl-agent", "data");
}

function looksLikeProjectRoot(dir: string): boolean {
  return existsSync(path.join(dir, "package.json")) &&
    (existsSync(path.join(dir, "src")) || existsSync(path.join(dir, "dist")));
}

export function profileDir(slug: string): string {
  return path.join(DATA_ROOT, slug);
}

export async function ensureProfile(slug: string): Promise<void> {
  const dir = profileDir(slug);
  await fs.mkdir(path.join(dir, "memory", "episodes"), { recursive: true });
  await fs.mkdir(path.join(dir, "log"), { recursive: true });
}

export async function readMd(slug: string, name: string): Promise<string> {
  const p = path.join(profileDir(slug), name);
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

export async function writeMd(slug: string, name: string, content: string): Promise<void> {
  const p = path.join(profileDir(slug), name);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

export async function appendMd(slug: string, name: string, content: string): Promise<void> {
  const p = path.join(profileDir(slug), name);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, content, "utf8");
}

export async function readConfig(slug: string): Promise<ProfileConfig | null> {
  try {
    const raw = await fs.readFile(path.join(profileDir(slug), "config.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProfileConfig>;
    const communication = normalizeCommunicationProfile(parsed);
    const ownerId = normalizeOwnerId(parsed.ownerId);
    const ignoreTendency = normalizeIgnoreTendency(parsed.ignoreTendency);
    return {
      sleepFrom: 23,
      sleepTo: 8,
      nightWakeChance: 0.05,
      privacy: "owner-only",
      busySchedule: [],
      ...parsed,
      ownerId,
      ignoreTendency,
      communication
    } as ProfileConfig;
  } catch {
    return null;
  }
}

export async function writeConfig(cfg: ProfileConfig): Promise<void> {
  await ensureProfile(cfg.slug);
  const ownerId = normalizeOwnerId(cfg.ownerId ?? process.env.GIRL_AGENT_OWNER_ID);
  const normalized = ownerId === undefined
    ? { ...cfg, ownerId: undefined, ignoreTendency: normalizeIgnoreTendency(cfg.ignoreTendency) }
    : { ...cfg, ownerId, ignoreTendency: normalizeIgnoreTendency(cfg.ignoreTendency) };
  await fs.writeFile(
    path.join(profileDir(cfg.slug), "config.json"),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );
}

export async function deleteProfile(slug: string): Promise<void> {
  if (!slug || slug.includes("/") || slug.includes("\\") || slug === "." || slug === "..") {
    throw new Error(`无效的配置文件 slug: ${slug}`);
  }
  await fs.rm(profileDir(slug), { recursive: true, force: true });
}

export function normalizeOwnerId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}


export async function listProfiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const valid = await Promise.all(dirs.map(async (name) => {
      try {
        await fs.access(path.join(profileDir(name), "config.json"));
        return name;
      } catch {
        return null;
      }
    }));
    return valid.filter((name): name is string => !!name);
  } catch {
    return [];
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `profile-${Date.now().toString(36)}`;
}

export interface RelationshipState {
  stage: string;
  score: RelationshipScore;
  notes: string;
}

export interface StoredConversationTurn {
  role: "user" | "assistant";
  content: string;
  ts?: number;
  fromId?: number;
}

const SCORE_RE = /<!--score:(.+?)-->/;

export async function readRelationship(slug: string): Promise<RelationshipState> {
  const raw = await readMd(slug, "relationship.md");
  const m = raw.match(SCORE_RE);
  let score: RelationshipScore = { interest: 0, trust: 0, attraction: 0, annoyance: 0, cringe: 0 };
  if (m) {
    try { score = JSON.parse(m[1]); } catch { /* ignore */ }
  }
  const stageMatch = raw.match(/^stage:\s*(.+)$/m);
  return {
    stage: stageMatch?.[1]?.trim() ?? "tg-given-cold",
    score,
    notes: raw
  };
}

export async function writeRelationship(slug: string, state: RelationshipState): Promise<void> {
  let body = state.notes;
  if (SCORE_RE.test(body)) {
    body = body.replace(SCORE_RE, `<!--score:${JSON.stringify(state.score)}-->`);
  } else {
    body = `stage: ${state.stage}\n<!--score:${JSON.stringify(state.score)}-->\n\n${body || ""}`;
  }
  if (!/^stage:\s*/m.test(body)) body = `stage: ${state.stage}\n` + body;
  else body = body.replace(/^stage:\s*.+$/m, `stage: ${state.stage}`);
  await writeMd(slug, "relationship.md", body);
}

/**
 * 已弃用：此函数之前使用 UTC，导致日志时间与 daily-life/agenda/memory
 * 不一致（Issue #78）。现在它只是 appendSessionLog 的代理，
 * 使用默认时区 Europe/Moscow（兼容旧的没有 tz 参数的调用点）。
 */
export async function appendDayLog(slug: string, line: string, tz = "Europe/Moscow"): Promise<void> {
  await appendSessionLog(slug, tz, line);
}

/**
 * 返回"会话日"的 YYYY-MM-DD 字符串。
 * 会话日是她本地的日期，但如果时间在 00:00 到 04:59 之间 — 则属于前一天。
 * 这是为了避免 23:59 → 00:30 的对话被分割到两个文件中。
 */
export function sessionDate(tz: string, now = new Date()): string {
  let y: number, mo: number, d: number, h: number;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hour12: false });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    y = parseInt(get("year"), 10);
    mo = parseInt(get("month"), 10);
    d = parseInt(get("day"), 10);
    h = parseInt(get("hour"), 10);
  } catch {
    y = now.getUTCFullYear(); mo = now.getUTCMonth() + 1; d = now.getUTCDate(); h = now.getUTCHours();
  }
  if (h < 5) {
    // 回退一天
    const prev = new Date(Date.UTC(y, mo - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return prev.toISOString().slice(0, 10);
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 追加到会话感知日记。请使用此函数代替 appendDayLog。 */
export async function appendSessionLog(slug: string, tz: string, line: string, fromId?: number): Promise<void> {
  const day = sessionDate(tz);
  const suffix = fromId ? ` ${fromMarker(fromId)}` : "";
  const safeLine = stripLogMetadata(line);
  await appendMd(slug, `log/${day}.md`, safeLine + suffix + "\n");
}

export async function appendSharedMemory(slug: string, tz: string, fromId: number, text: string): Promise<void> {
  const day = sessionDate(tz);
  const safe = text.replace(/\s+/g, " ").trim();
  if (!safe) return;
  const line = `- ${new Date().toISOString()} user:${fromId} day:${day}: ${safe}`;
  const raw = await readMd(slug, "memory/shared-cross-chat.md");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.slice(-20).some(existing => existing.endsWith(`: ${safe}`))) return;
  await writeMd(slug, "memory/shared-cross-chat.md", [...lines.slice(-500), line].join("\n") + "\n");
}

export async function readSharedMemory(slug: string, limit = 40): Promise<string> {
  const raw = await readMd(slug, "memory/shared-cross-chat.md");
  return raw.split(/\r?\n/).map(stripLogMetadata).filter(Boolean).slice(-limit).join("\n");
}

export async function searchSharedMemory(slug: string, query: string, limit = 8): Promise<string> {
  const raw = await readMd(slug, "memory/shared-cross-chat.md");
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  const lines = raw.split(/\r?\n/).map(stripLogMetadata).filter(Boolean);
  const hits = tokens.length
    ? lines.filter(line => tokens.some(t => line.toLowerCase().includes(t)))
    : [];
  return (hits.length ? hits : lines).slice(-limit).join("\n");
}

/** 按升序排列的所有会话日列表 */
export async function listSessionDays(slug: string): Promise<string[]> {
  try {
    const dir = path.join(profileDir(slug), "log");
    const files = await fs.readdir(dir);
    return files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace(/\.md$/, ""))
      .sort();
  } catch { return []; }
}

/** 每日摘要（由会话结束后生成） */
export async function readDailySummary(slug: string, day: string): Promise<string> {
  return stripLogMetadata(await readMd(slug, `memory/daily/${day}.md`));
}

export async function writeDailySummary(slug: string, day: string, content: string): Promise<void> {
  await writeMd(slug, `memory/daily/${day}.md`, content);
}

export async function listDailySummaries(slug: string): Promise<string[]> {
  try {
    const dir = path.join(profileDir(slug), "memory", "daily");
    const files = await fs.readdir(dir);
    return files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace(/\.md$/, ""))
      .sort();
  } catch { return []; }
}

/** 在所有每日摘要中进行简单搜索（子字符串 + 单词匹配）。返回最相关的前 N 天。 */
export async function searchDailySummaries(slug: string, query: string, limit = 5): Promise<{ day: string; excerpt: string; score: number }[]> {
  const days = await listDailySummaries(slug);
  if (!days.length) return [];
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
  if (!tokens.length) return [];
  const out: { day: string; excerpt: string; score: number }[] = [];
  for (const day of days) {
    const txt = stripLogMetadata(await readDailySummary(slug, day)).toLowerCase();
    if (!txt) continue;
    let score = 0;
    for (const t of tokens) {
      const matches = txt.split(t).length - 1;
      score += matches;
    }
    if (score > 0) {
      // 简短摘录：包含 token 的第一行
      const lineMatch = txt.split("\n").find(l => tokens.some(t => l.includes(t))) ?? txt.slice(0, 200);
      out.push({ day, excerpt: lineMatch.slice(0, 240), score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** 读取一个会话日的完整原始日志 */
export async function readSessionLog(slug: string, day: string): Promise<string> {
  return readMd(slug, `log/${day}.md`);
}

export function parseSessionLogTurns(raw: string, fromId?: number, limit = 30): StoredConversationTurn[] {
  const turns: StoredConversationTurn[] = [];
  let currentChatMatches = fromId == null;
  for (const line of raw.split(/\r?\n/)) {
    const clean = stripLogMetadata(line);
    const user = clean.match(/^\[(.+?)\]\s+他\((\d+)\):\s*(.*)$/);
    if (user) {
      currentChatMatches = fromId == null || Number(user[2]) === fromId;
      if (currentChatMatches) {
        turns.push({ role: "user", content: stripLogMetadata(user[3] ?? ""), ts: Date.parse(user[1] ?? "") || undefined, fromId: Number(user[2]) });
      }
      continue;
    }
    const assistant = clean.match(/^\s*->\s+(?:\[proactive\]\s+)?她:\s*(.*)$/);
    if (assistant && currentChatMatches) {
      turns.push({ role: "assistant", content: stripLogMetadata(assistant[1] ?? "") });
    }
  }
  return turns.slice(-limit);
}

export function stripLogMetadata(text: string): string {
  return text
    .replace(/\s*<+\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*>+\s*/gi, "")
    .replace(/\s*‹+\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*›+\s*/gi, "")
    .replace(/\s*&lt;\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*&gt;\s*/gi, "")
    .replace(/\s*<!--[\s\S]*?-->\s*/g, "")
    .replace(/\s*‹!?--[\s\S]*?--›\s*/g, "")
    .trimEnd();
}

function fromMarker(fromId: number): string {
  return `<${"!"}--from:${fromId}-->`;
}

export async function readRecentSessionTurns(slug: string, tz: string, fromId?: number, limit = 30): Promise<StoredConversationTurn[]> {
  const day = sessionDate(tz);
  const days = [...new Set([...(await listSessionDays(slug)), day])]
    .filter(d => d <= day)
    .sort()
    .slice(-4);
  const raw = (await Promise.all(days.map(d => readSessionLog(slug, d)))).join("\n");
  return parseSessionLogTurns(raw, fromId, limit);
}

// ===== Agenda (proactive scheduler) =====

export interface AgendaItem {
  id: string;                  // unique id
  about: string;               // 用户事件的简短描述（"游泳比赛"）
  userEventTime?: string;      // ISO 格式的用户事件发生时间（如果已知）
  pingAt: string;              // ISO when she should ping
  reason: string;              // 为什么要发消息（"问问进展如何", "祝好运"）
  importance: 1 | 2 | 3;       // 1=普通好奇, 3=非常关心
  state: "pending" | "fired" | "cancelled" | "rescheduled";
  attempts: number;            // 已经 ping 了多少次（用于重新调度）
  chatId: string | number;     // 要发送到的聊天
  createdAt: string;
  history?: string[];          // 项目事件日志（"用户在某时说 别烦我 ..."）
}

export async function readAgenda(slug: string): Promise<AgendaItem[]> {
  try {
    const raw = await fs.readFile(path.join(profileDir(slug), "agenda.json"), "utf8");
    return JSON.parse(raw) as AgendaItem[];
  } catch {
    return [];
  }
}

export async function writeAgenda(slug: string, items: AgendaItem[]): Promise<void> {
  await ensureProfile(slug);
  await fs.writeFile(path.join(profileDir(slug), "agenda.json"), JSON.stringify(items, null, 2), "utf8");
}
