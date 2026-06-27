// 关系自然衰减：长期不聊天时，5 项关系分数缓慢衰减，体现"距离感"。
//
// 设计：温和档（30+ 天不聊才有明显变化）。
// - 兴趣 / 好感：缓慢流失
// - 信任：缓慢流失
// - 烦躁：消退更快（人更容易原谅）
// - 尴尬：上升（陌生感）
//
// 衰减通过 runtime.dailyMaintenance 每日（实际是每 30 分钟 tick 时检查日切换）执行一次。

import type { RelationshipScore } from "../types.js";

export const DECAY_DAILY: RelationshipScore = {
  interest: -0.3,
  trust: -0.1,
  attraction: -0.2,
  annoyance: -0.5,
  cringe: 0.2
};

/**
 * 对分数应用 N 天的衰减。
 * - daysSinceLastChat < 1 → 原样返回
 * - 否则按天线性叠加
 * - clamp 到 [-100, 100]
 */
export function applyRelationshipDecay(
  score: RelationshipScore,
  daysSinceLastChat: number
): RelationshipScore {
  if (!Number.isFinite(daysSinceLastChat) || daysSinceLastChat < 1) return { ...score };
  const days = Math.floor(daysSinceLastChat);
  return {
    interest: clamp(score.interest + DECAY_DAILY.interest * days),
    trust: clamp(score.trust + DECAY_DAILY.trust * days),
    attraction: clamp(score.attraction + DECAY_DAILY.attraction * days),
    annoyance: clamp(score.annoyance + DECAY_DAILY.annoyance * days),
    cringe: clamp(score.cringe + DECAY_DAILY.cringe * days)
  };
}

function clamp(n: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * 给定两次 ISO 日期 (YYYY-MM-DD)，返回相差的天数（b - a，向上取整）。
 * 入参不合法时返回 0。
 */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a + "T00:00:00Z");
  const tb = Date.parse(b + "T00:00:00Z");
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  const ms = tb - ta;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}