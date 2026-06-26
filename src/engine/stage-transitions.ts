/**
 * 智能自动关系阶段切换。
 *
 * 目标：当评分表明温暖、持久的联系时提升阶段，
 * 当评分变为负值且日志中长时间没有恢复迹象时降低（或终止关系）。
 *
 * 决策不是随机的：
 *  - 有评分阈值（interest/trust/attraction/annoyance）
 *  - 有"进入阶段后至少 N 条消息"的要求
 *    （避免在一个周期内在阶段之间跳跃）
 *  - 有禁止列表：例如，永远不会从"dumped"阶段自动提升
 *  - 降低优先：如果情况非常糟糕，先降级，否则
 *    检查升级
 *
 * 返回下一个阶段，如果不需要更改则返回 null。
 */

import type { RelationshipScore, StageId } from "../types.js";

export interface StageTransitionContext {
  currentStage: StageId;
  score: RelationshipScore;
  /** 她在该阶段期间发送的消息数量。 */
  herMessagesInStage: number;
  /** 他在该阶段期间发送的消息数量。 */
  hisMessagesInStage: number;
  /** 她在此阶段忽略了他的次数（避免"通过忽略"来提升）。 */
  ignoresInStage: number;
  /** 可选项 — 是否存在活跃的冲突。 */
  hasActiveConflict?: boolean;
}

export interface StageTransitionResult {
  next: StageId;
  reason: string;
  direction: "up" | "down";
}

const STAGE_ORDER: StageId[] = [
  "met-irl-got-tg",
  "tg-given-cold",
  "tg-given-warming",
  "convinced",
  "first-date-done",
  "dating-early",
  "dating-stable",
  "long-term"
];

function stageIndex(id: StageId): number {
  return STAGE_ORDER.indexOf(id);
}

/**
 * 判断是否需要推进阶段。
 *
 * 如果阶段应保持不变则返回 null。
 */
export function decideStageTransition(ctx: StageTransitionContext): StageTransitionResult | null {
  // "dumped" — 终末阶段，不会自动退出
  // （只能通过 :reset 或 runtime 中的特殊逻辑）。
  if (ctx.currentStage === "dumped") return null;

  const { score } = ctx;
  const idx = stageIndex(ctx.currentStage);
  if (idx < 0) return null;

  // === 首先检查降级（downgrade） ===
  // 降至"dumped" — 由 runtime 单独处理（那里基于
  // 极端 annoyance 自动 dumped）。这里只做软降级。
  const wantsDowngrade = wantsDowngradeFor(ctx);
  if (wantsDowngrade && idx > 0) {
    const next = STAGE_ORDER[idx - 1]!;
    return {
      next,
      reason: wantsDowngrade,
      direction: "down"
    };
  }

  // === 然后升级 ===
  // 有活跃冲突时不升级。
  if (ctx.hasActiveConflict) return null;

  const wantsUpgrade = wantsUpgradeFor(ctx);
  if (wantsUpgrade && idx < STAGE_ORDER.length - 1) {
    const next = STAGE_ORDER[idx + 1]!;
    return {
      next,
      reason: wantsUpgrade,
      direction: "up"
    };
  }

  return null;
}

function wantsDowngradeFor(ctx: StageTransitionContext): string | null {
  const { score, currentStage, herMessagesInStage, ignoresInStage } = ctx;

  // 条件：annoyance 高，interest/trust 大幅下降 — 且该阶段
  // 已持续足够长时间以使此状况确立（>= 8 条她的消息）。
  if (
    score.annoyance >= 60 &&
    score.interest <= -10 &&
    score.trust <= 10 &&
    herMessagesInStage >= 8
  ) {
    return `annoyance ${score.annoyance}, interest ${score.interest}, trust ${score.trust} — 关系正在退化`;
  }

  // 如果她在温暖阶段一直忽略 — 这也是退化的迹象。
  if (
    ["convinced", "first-date-done", "dating-early", "dating-stable", "long-term"].includes(currentStage) &&
    ignoresInStage >= 12 &&
    ignoresInStage >= ctx.hisMessagesInStage * 0.7 &&
    score.interest < 20
  ) {
    return `${ignoresInStage} 次忽略 / 他的 ${ctx.hisMessagesInStage} 条消息 — 失去兴趣`;
  }

  return null;
}

function wantsUpgradeFor(ctx: StageTransitionContext): string | null {
  const { score, currentStage, herMessagesInStage } = ctx;
  // 她最少需要发多少条消息才能提升阶段：6条。
  // 这让 LLM 有时间在该阶段工作，而不是因为一条好消息就"跳跃"。
  const MIN_HER = 6;
  if (herMessagesInStage < MIN_HER) return null;

  // 不同阶段有不同的阈值（要求随级别提高）。
  switch (currentStage) {
    case "met-irl-got-tg": {
      // 刚认识 → 开始热情回复。
      if (score.interest >= 30 && score.attraction >= 20 && score.annoyance < 20) {
        return `interest ${score.interest}, attraction ${score.attraction} — 态度软化`;
      }
      // 如果她忽略且兴趣没有增长 — 应降至"tg-given-cold"
      // （但这是降级，由 downgrade 处理）。
      return null;
    }
    case "tg-given-cold": {
      if (score.interest >= 25 && score.trust >= 10 && score.annoyance < 25) {
        return `interest ${score.interest}, trust ${score.trust} — 开始谨慎回复`;
      }
      return null;
    }
    case "tg-given-warming": {
      if (score.interest >= 40 && score.trust >= 25 && score.attraction >= 30 && score.annoyance < 20) {
        return `interest ${score.interest}, trust ${score.trust}, attraction ${score.attraction} — 稳定交流`;
      }
      return null;
    }
    case "convinced": {
      // 这里至少需要她10条消息来确定已安排
      // 约会/约定。
      if (herMessagesInStage >= 10 && score.attraction >= 50 && score.trust >= 35 && score.interest >= 50) {
        return `attraction ${score.attraction}, trust ${score.trust} — 进行了第一次约会`;
      }
      return null;
    }
    case "first-date-done": {
      if (herMessagesInStage >= 12 && score.attraction >= 65 && score.trust >= 50 && score.interest >= 60) {
        return `attraction ${score.attraction}, trust ${score.trust} — 关系确立`;
      }
      return null;
    }
    case "dating-early": {
      if (herMessagesInStage >= 25 && score.trust >= 70 && score.attraction >= 65 && score.annoyance < 15) {
        return `trust ${score.trust}, attraction ${score.attraction}, ${herMessagesInStage} 条消息 — 稳定情侣`;
      }
      return null;
    }
    case "dating-stable": {
      if (herMessagesInStage >= 60 && score.trust >= 80 && score.interest >= 55) {
        return `trust ${score.trust}, ${herMessagesInStage} 条消息 — 长期在一起`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * 辅助函数：可以通过 trackers 统计阶段消息数，但基础方式 —
 * 通过 relationship.md / log。runtime 可以每隔 N 个周期调用此函数。
 */
export function shouldRunStageTransitionCheck(messagesSinceLastCheck: number): boolean {
  // 不是每条消息都检查 — 每5条一次。
  return messagesSinceLastCheck > 0 && messagesSinceLastCheck % 5 === 0;
}
