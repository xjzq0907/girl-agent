// 对话统计：每日记录消息量、回复率、延迟分布、活跃时段等。
// 存放在 data/<slug>/stats/YYYY-MM-DD.json，WebUI 在 stats 标签页展示。

import { promises as fs } from "node:fs";
import path from "node:path";
import { profileDir } from "../storage/md.js";
import { sessionDate } from "../storage/md.js";

export interface DailyStats {
  date: string;                // YYYY-MM-DD (按 profile tz 的本地日)
  received: number;            // 收到的用户消息数
  replied: number;             // 她的回复数
  ignored: number;             // 被忽略（不回复）的次数
  avgReplyDelaySec: number;    // 平均回复延迟（秒）
  maxReplyDelaySec: number;    // 最长回复延迟（秒）
  hourBuckets: number[];       // 24 个 0..N，活跃时段分布（按她的本地小时）
  userCharTotal: number;       // 用户消息总字符数
  herCharTotal: number;        // 她的回复总字符数
  topics: string[];            // 来自 daily-summary（如有）
  updatedAt: string;           // ISO
}

function emptyStats(date: string): DailyStats {
  return {
    date,
    received: 0,
    replied: 0,
    ignored: 0,
    avgReplyDelaySec: 0,
    maxReplyDelaySec: 0,
    hourBuckets: Array.from({ length: 24 }, () => 0),
    userCharTotal: 0,
    herCharTotal: 0,
    topics: [],
    updatedAt: new Date().toISOString()
  };
}

function statsPath(slug: string, day: string): string {
  return path.join(profileDir(slug), "stats", `${day}.json`);
}

async function readStatsFile(slug: string, day: string): Promise<DailyStats> {
  try {
    const raw = await fs.readFile(statsPath(slug, day), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyStats>;
    const base = emptyStats(day);
    return {
      ...base,
      ...parsed,
      hourBuckets: Array.isArray(parsed.hourBuckets) && parsed.hourBuckets.length === 24
        ? parsed.hourBuckets.map(n => Number(n) || 0)
        : base.hourBuckets,
      topics: Array.isArray(parsed.topics) ? parsed.topics : []
    };
  } catch {
    return emptyStats(day);
  }
}

async function writeStatsFile(slug: string, stats: DailyStats): Promise<void> {
  await fs.mkdir(path.join(profileDir(slug), "stats"), { recursive: true });
  await fs.writeFile(statsPath(slug, stats.date), JSON.stringify(stats, null, 2), "utf8");
}

/**
 * 同步读取/修改/写回当日 stats 的便捷函数。
 * updater 拿到当前 stats 后原地修改即可，不需要返回。
 */
export async function recordStats(
  slug: string,
  tz: string,
  updater: (s: DailyStats) => void
): Promise<void> {
  const day = sessionDate(tz);
  const cur = await readStatsFile(slug, day);
  updater(cur);
  cur.updatedAt = new Date().toISOString();
  await writeStatsFile(slug, cur);
}

/**
 * 读取最近 N 天的 stats，按日期升序返回；缺失的日期填 0。
 */
export async function readStatsRange(slug: string, tz: string, days: number): Promise<DailyStats[]> {
  const n = Math.max(1, Math.min(180, Math.floor(days) || 7));
  const today = sessionDate(tz);
  const out: DailyStats[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = shiftDay(today, -i);
    out.push(await readStatsFile(slug, d));
  }
  return out;
}

/** 把 YYYY-MM-DD 往前推 k 天（k 可负）。 */
function shiftDay(dateKey: string, k: number): string {
  const t = Date.parse(dateKey + "T00:00:00Z");
  if (!Number.isFinite(t)) return dateKey;
  const shifted = new Date(t + k * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * 计算平均回复延迟的辅助：把 (delay, char) 元组列表压成 avg/max。
 */
export function foldDelayStats(totalDelay: number, count: number, maxDelay: number): { avg: number; max: number } {
  return {
    avg: count > 0 ? Math.round(totalDelay / count) : 0,
    max: Math.max(0, Math.round(maxDelay))
  };
}