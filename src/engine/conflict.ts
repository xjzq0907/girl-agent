// 长期冲突。当用户真的惹恼 / 搞砸了她，她可能会离线数天。
// 存储在 data/<slug>/conflict.json。影响 behavior-tick（设置 coldUntil → 忽略）。

import { promises as fs } from "node:fs";
import path from "node:path";
import { profileDir, ensureProfile, appendMd } from "../storage/md.js";
import type { RelationshipScore } from "../types.js";

export interface ConflictState {
  /** ISO 时间的“冷处理”截止点 — 忽略，不回复。 */
  coldUntil?: string;
  /** 等级：0=无，1=生气一小时，2=生气一天，3=严重冲突数天，4=濒临破裂 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 具体触发了什么。简短。 */
  reason?: string;
  /** 冲突开始 ISO 时间 */
  since?: string;
  /** 事件日志 */
  history: { ts: string; note: string; deltaLevel: number }[];
}

const empty: ConflictState = { level: 0, history: [] };

export async function readConflict(slug: string): Promise<ConflictState> {
  try {
    const raw = await fs.readFile(path.join(profileDir(slug), "conflict.json"), "utf8");
    const parsed = JSON.parse(raw);
    return { ...empty, ...parsed, history: parsed.history ?? [] };
  } catch { return { ...empty, history: [] }; }
}

export async function writeConflict(slug: string, c: ConflictState): Promise<void> {
  await ensureProfile(slug);
  await fs.writeFile(path.join(profileDir(slug), "conflict.json"), JSON.stringify(c, null, 2), "utf8");
}

/** 当前冲突状态（考虑 cold 期是否已过期） */
export function activeConflict(c: ConflictState, now = new Date()): { active: boolean; coldActive: boolean } {
  const cold = c.coldUntil ? new Date(c.coldUntil).getTime() > now.getTime() : false;
  return { active: c.level > 0, coldActive: cold };
}

/** 根据 mood 增量 + 消息判断是否需要提升/降低冲突等级 */
export function escalateFromMood(
  current: ConflictState,
  delta: Partial<RelationshipScore>,
  score: RelationshipScore,
  incomingText: string
): ConflictState {
  const ann = delta.annoyance ?? 0;
  const cr = delta.cringe ?? 0;
  const interestDrop = -(delta.interest ?? 0);
  const trigger = ann + cr + interestDrop;

  let newLevel = current.level;
  let coldHours = 0;
  let bumpReason: string | undefined;

  if (trigger >= 25 || score.annoyance > 70) { newLevel = Math.max(newLevel, 3) as ConflictState["level"]; coldHours = 24 + Math.random() * 24; bumpReason = "强烈负面"; }
  else if (trigger >= 15) { newLevel = Math.max(newLevel, 2) as ConflictState["level"]; coldHours = 4 + Math.random() * 12; bumpReason = "生气了"; }
  else if (trigger >= 8) { newLevel = Math.max(newLevel, 1) as ConflictState["level"]; coldHours = 0.5 + Math.random() * 2; bumpReason = "有点赌气"; }

  if (score.annoyance > 85 && score.cringe > 70 && score.interest < -30) {
    newLevel = 4;
    coldHours = Math.max(coldHours, 48 + Math.random() * 48);
    bumpReason = "濒临破裂";
  }

  if (newLevel === current.level && newLevel === 0) return current;

  const next: ConflictState = { ...current };
  if (newLevel > current.level) {
    next.level = newLevel as ConflictState["level"];
    next.since = next.since ?? new Date().toISOString();
    next.reason = bumpReason ?? next.reason;
    if (coldHours > 0) {
      const until = new Date(Date.now() + coldHours * 3600_000);
      // 如果已有更长的 cold — 保留更长的那个
      const existing = current.coldUntil ? new Date(current.coldUntil).getTime() : 0;
      next.coldUntil = until.getTime() > existing ? until.toISOString() : current.coldUntil;
    }
    next.history = [...(current.history ?? []), {
      ts: new Date().toISOString(),
      note: `level ${current.level}→${newLevel}: ${bumpReason} | "${incomingText.slice(0, 60)}"`,
      deltaLevel: newLevel - current.level
    }];
  }
  return next;
}

/** 当消息非常可爱时 — 降低冲突等级（和解） */
export function softenFromMood(
  current: ConflictState,
  delta: Partial<RelationshipScore>
): ConflictState {
  if (current.level === 0) return current;
  const positive = (delta.attraction ?? 0) + (delta.trust ?? 0) + (delta.interest ?? 0);
  if (positive < 12) return current;

  const next: ConflictState = { ...current };
  next.level = Math.max(0, current.level - 1) as ConflictState["level"];
  if (next.level === 0) {
    next.coldUntil = undefined;
    next.since = undefined;
    next.reason = undefined;
  } else if (next.coldUntil) {
    // 把 cold 时间减半
    const remaining = new Date(next.coldUntil).getTime() - Date.now();
    if (remaining > 0) next.coldUntil = new Date(Date.now() + remaining / 2).toISOString();
  }
  next.history = [...(current.history ?? []), {
    ts: new Date().toISOString(),
    note: `softened to level ${next.level} (positive ${positive})`,
    deltaLevel: next.level - current.level
  }];
  return next;
}

export function conflictPromptFragment(c: ConflictState, now = new Date()): string {
  const { active, coldActive } = activeConflict(c, now);
  if (!active) return "";
  const lines: string[] = [
    `# 冲突（等级 ${c.level}）`,
    `原因：${c.reason ?? "—"}。开始于 ${c.since ?? "最近"}。`
  ];
  if (coldActive) {
    const until = c.coldUntil ? new Date(c.coldUntil) : null;
    const hoursLeft = until ? Math.max(0, Math.round((until.getTime() - now.getTime()) / 3600_000)) : 0;
    lines.push(`你现在处于冷战模式。还剩约 ${hoursLeft} 小时会忽略对方。`);
    if (c.level >= 3) {
      lines.push(`对消息回复要极少、冷淡：如“。”、“嗯？”、“哦？”、“干嘛”。不准有任何表情符号、括号 ")" 等。可以直接无视。`);
    } else {
      lines.push(`回复冷淡、简短。不准有 ")"、不准“噗噗”，没有温度。`);
    }
    lines.push(`只有在他真正实质性道歉时——不是“对不起啦”而是认真解释——你才能慢慢原谅，但不是立刻。`);
  } else {
    lines.push(`Cold 期已过，但仍有芥蒂。比平时更克制。`);
  }
  return lines.join("\n");
}

/** reset 时清空冲突 */
export async function clearConflict(slug: string): Promise<void> {
  await writeConflict(slug, { level: 0, history: [] });
}

/** 将冲突记录到 memory/long-term（用于 reset/修复后的长期处理） */
export async function logConflictToMemory(slug: string, c: ConflictState): Promise<void> {
  if (c.level === 0 || !c.history.length) return;
  const last = c.history[c.history.length - 1];
  if (!last) return;
  await appendMd(slug, "memory/conflicts.md",
    `\n\n## ${last.ts}\n- level: ${c.level}\n- reason: ${c.reason ?? "?"}\n- note: ${last.note}\n`);
}
