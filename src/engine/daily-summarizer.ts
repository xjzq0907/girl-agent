// 当会话关闭时，从会话日志生成每日摘要
// （最后一条消息后间隔>=4小时，或会话日期变更时）。

import type { LLMClient } from "../llm/index.js";
import type { ProfileConfig } from "../types.js";
import {
  readSessionLog, writeDailySummary, readDailySummary,
  listSessionDays, sessionDate, stripLogMetadata
} from "../storage/md.js";
import { mineDailyLogToPalace } from "./memory-palace.js";

const SYS = `你是女孩的内部日记。根据当天她的聊天原始日志，为长期记忆写一份简要摘要。以第一人称，用她的语气（小写，不使用markdown）。内容包括：发生了什么、讨论了什么、她最终对他的看法、关于他的新发现、是否有让她恼火的事。`;

export interface DailySummary {
  day: string;
  topics: string[];          // 谈论的话题
  newFactsAboutHim: string[]; // 当天了解到的关于他的新事实
  feeling: string;           // 她当天与他交流后的最终感受
  conflict?: string;         // 如果有冲突——简要引用
  highlight?: string;        // 当天最难忘的时刻
}

/**
 * 生成当天的摘要。如果已有则覆盖（用于当天尚未结束的情况）。
 */
export async function buildDailySummary(
  llm: LLMClient,
  cfg: ProfileConfig,
  day: string
): Promise<DailySummary | null> {
  const log = sanitizeSessionLogForSummary(await readSessionLog(cfg.slug, day));
  if (!log || log.length < 50) return null;

  try {
    await mineDailyLogToPalace(llm, cfg, day).catch(() => 0);
    const raw = await llm.chat([
      { role: "system", content: SYS },
      {
        role: "user",
        content: `名称: ${cfg.name}, ${cfg.age}. 阶段: ${cfg.stage}. 日期: ${day}.

当天聊天日志：
"""
${log.slice(-8000)}
"""

返回严格JSON：
{
  "topics": ["谈论的话题（3-6条，简要）"],
  "newFactsAboutHim": ["当天了解到的关于他的新事实（如果没有则为[])"],
  "feeling": "1-2句话描述她在这一天结束后对他的感受",
  "conflict": "如果有严重冲突——用一句话概括核心，否则为空",
  "highlight": "最难忘的时刻（如果没有则为空）"
}`
      }
    ], { temperature: 0.7, maxTokens: 3500, json: true });

    const parsed = JSON.parse(raw);
    const summary: DailySummary = {
      day,
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      newFactsAboutHim: Array.isArray(parsed.newFactsAboutHim) ? parsed.newFactsAboutHim : [],
      feeling: typeof parsed.feeling === "string" ? parsed.feeling : "",
      conflict: parsed.conflict || undefined,
      highlight: parsed.highlight || undefined
    };

    const md = renderSummary(summary);
    await writeDailySummary(cfg.slug, day, md);
    return summary;
  } catch {
    return null;
  }
}

function sanitizeSessionLogForSummary(raw: string): string {
  return raw.split(/\r?\n/).map(stripLogMetadata).join("\n").trim();
}

function renderSummary(s: DailySummary): string {
  const lines = [`# ${s.day}`, ``, `## 感受`, s.feeling || "—"];
  if (s.topics.length) {
    lines.push("", "## 谈论的话题");
    s.topics.forEach(t => lines.push(`- ${t}`));
  }
  if (s.newFactsAboutHim.length) {
    lines.push("", "## 关于他的新发现");
    s.newFactsAboutHim.forEach(t => lines.push(`- ${t}`));
  }
  if (s.highlight) lines.push("", "## 当日亮点", s.highlight);
  if (s.conflict) lines.push("", "## 冲突", s.conflict);
  return lines.join("\n");
}

/**
 * 关闭旧会话：对于除今天以外的每个会话日期，如果还没有摘要则生成。
 * 由运行时定期调用。
 */
export async function closeStaleSessions(llm: LLMClient, cfg: ProfileConfig): Promise<number> {
  const today = sessionDate(cfg.tz);
  const days = await listSessionDays(cfg.slug);
  let made = 0;
  for (const day of days) {
    if (day === today) continue;
    const existing = await readDailySummary(cfg.slug, day);
    if (existing) continue;
    const r = await buildDailySummary(llm, cfg, day);
    if (r) made++;
  }
  return made;
}

export async function closeCurrentSession(llm: LLMClient, cfg: ProfileConfig): Promise<boolean> {
  const today = sessionDate(cfg.tz);
  const r = await buildDailySummary(llm, cfg, today);
  return !!r;
}
