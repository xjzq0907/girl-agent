/**
 * 处理用户对她消息的emoji反应 (Issue #76 / Task #16).
 *
 * 方法尽量贴近真实女生的行为：
 *
 *  1) 对她的消息使用有毒emoji（💀 🤡 🤮 👎 🖕 💩 等）—
 *     真实女生在TG上几乎从不会回复"你是认真的吗？！"。
 *     她们会默默生气 → annoyance/cringe 增长，在当前对话中可能变冷淡。
 *
 *  2) 但是有上下文。如果她的消息是关于一些有毒/荒谬的事情
 *     （"街上有个男人走过来对我大喊"），那么他的💀/🤡 —
 *     是对那个情况的赞同/反应，而不是针对她。这时annoyance不增长，
 *     甚至可以略微增加interest。
 *
 *  3) 积极emoji（❤ 😍 🔥 ...）— 温暖，偶尔温暖的文字回复
 *     或react-back，但很少。默认沉默。
 *
 *  4) 幽默（😂 🤣）— 偶尔配合。更多时候沉默。
 *
 *  5) 悲伤（😢 🥺）— 偶尔简短关切的回复。
 *
 *  6) 中性（👍 👌 ✅）— 几乎总是沉默。根据persona/initiative。
 *
 * 关于"有毒emoji上下文"的判断通过LLM决定：
 *  → `isToxicReactionContextual(llm, herLastMessage, emoji)` 返回 true
 *    如果emoji是关于她消息的内容（第三方/情况），
 *    false — 如果是针对她个人。
 *
 * 这个模块自己不调用LLM — 只返回 intent + 上下文
 * 给runtime，runtime在需要时进行快速LLM调用。
 */

import type { LLMClient } from "../llm/index.js";
import type { CommunicationProfile, RelationshipScore, StageId } from "../types.js";

const TOXIC = new Set(["👎", "🤡", "💩", "🤮", "🖕", "💀"]);
const POSITIVE = new Set(["❤", "❤️", "😍", "🥰", "😘", "🔥", "👏", "💋", "🤗", "🥹"]);
const FUNNY = new Set(["😂", "🤣", "😆", "🤭"]);
const SAD = new Set(["😢", "😭", "🥺", "😔"]);
const NEUTRAL_THUMBS = new Set(["👍", "👌", "✅"]);

export type EmojiCategory = "toxic" | "positive" | "funny" | "sad" | "neutral";

export function categorizeEmoji(emoji: string): EmojiCategory {
  if (TOXIC.has(emoji)) return "toxic";
  if (POSITIVE.has(emoji)) return "positive";
  if (FUNNY.has(emoji)) return "funny";
  if (SAD.has(emoji)) return "sad";
  if (NEUTRAL_THUMBS.has(emoji)) return "neutral";
  return "neutral";
}

export type EmojiReactionIntent =
  | "ignore"            // 完全沉默，不执行任何操作
  | "silent-mood"       // 沉默，但更新 mood (annoyance/cringe 或 attraction)
  | "react-back"        // 发送自己的TG反应
  | "reply-text";       // 极少情况 — 发送简短的文字回复

export interface EmojiReactionDecisionCtx {
  emoji: string;
  removed?: boolean;
  stage: StageId;
  score: RelationshipScore;
  communication?: CommunicationProfile;
  /** 她的最后一条消息，反应是针对这条消息的。用于判断有毒emoji的上下文。 */
  herLastMessageText?: string;
  /** 是否已经对有毒emoji进行了LLM上下文调用，以及结果如何。 */
  toxicContextResolved?: { aboutHerSelf: boolean };
}

export interface EmojiReactionDecision {
  intent: EmojiReactionIntent;
  /** 如果 react-back — 使用哪个emoji。 */
  reactBackEmoji?: string;
  /** mood变化（用于 silent-mood）。 */
  moodDelta?: Partial<RelationshipScore>;
  /** LLM的简短情况描述，当 intent="reply-text" 时。 */
  llmContext?: string;
  /** 用于日志记录。 */
  reason: string;
  category: EmojiCategory;
  /** 如果 true — runtime需要先调用 isToxicReactionContextual 并重新构建 decision。 */
  needsToxicContextCheck?: boolean;
}

export function decideEmojiReactionResponse(ctx: EmojiReactionDecisionCtx): EmojiReactionDecision {
  const cat = categorizeEmoji(ctx.emoji);

  // 移除反应 — 通常完全忽略。
  if (ctx.removed) {
    return { intent: "ignore", reason: "user removed reaction", category: cat };
  }

  // === 有毒类 ===
  if (cat === "toxic") {
    // 如果上下文尚未确定 — 请求runtime进行廉价的LLM调用。
    if (!ctx.toxicContextResolved) {
      return {
        intent: "silent-mood",
        moodDelta: {},
        reason: "toxic emoji: need contextual classification",
        category: cat,
        needsToxicContextCheck: true
      };
    }
    // 上下文已确定。
    if (!ctx.toxicContextResolved.aboutHerSelf) {
      // Emoji针对情况/第三方，不是针对她。这是赞同/情感支持。
      // 默默接受，略微增加interest。
      return {
        intent: "ignore",
        moodDelta: { interest: 1 },
        reason: "toxic emoji about external context (agreement)",
        category: cat
      };
    }
    // Emoji针对的是她。默默生气，不戏剧化。
    const sensitivityBoost = (ctx.communication?.notifications ?? "balanced") === "muted" ? 0 : 2;
    const moodDelta: Partial<RelationshipScore> = {
      annoyance: 4 + sensitivityBoost + Math.floor(Math.random() * 3),
      cringe: 2 + Math.floor(Math.random() * 3),
      attraction: -1,
      interest: -1
    };
    // 极少情况 — 冷漠的文字评论。并且只在相对温暖的阶段，
    // 她足够投入才会反应。在 "tg-given-cold"/"dumped" — 保持沉默。
    const coldText = canColdReplyToToxic(ctx);
    if (coldText && Math.random() < 0.08) {
      return {
        intent: "reply-text",
        llmContext: textReplyContextForToxic(ctx),
        moodDelta,
        reason: "rare cold reply to toxic about herself",
        category: cat
      };
    }
    return {
      intent: "silent-mood",
      moodDelta,
      reason: "toxic about her: silent annoyance",
      category: cat
    };
  }

  // === 非有毒类 ===
  // 默认：silent + 轻微情绪调整（如果积极 — interest+，如果sad — interest+ 但是通过关怀...）。
  const baseChance = baseTextReplyChance(cat, ctx);
  if (Math.random() > baseChance) {
    // 不回复文字。可能react-back。
    if (cat === "positive" && shouldReactBack(ctx)) {
      const back = pickReactBack(cat);
      return {
        intent: "react-back",
        reactBackEmoji: back,
        moodDelta: { attraction: 1, interest: 1 },
        reason: "react-back on positive",
        category: cat
      };
    }
    // 只是记录注意到了关注。
    const moodDelta = passiveMoodFor(cat, ctx);
    return {
      intent: moodDelta ? "silent-mood" : "ignore",
      moodDelta,
      reason: `silent skip (chance=${baseChance.toFixed(2)})`,
      category: cat
    };
  }

  // 文字回复很少发生。
  return {
    intent: "reply-text",
    llmContext: textReplyContextFor(cat, ctx),
    moodDelta: passiveMoodFor(cat, ctx),
    reason: `text reply (chance=${baseChance.toFixed(2)})`,
    category: cat
  };
}

function canColdReplyToToxic(ctx: EmojiReactionDecisionCtx): boolean {
  if (ctx.stage === "dumped") return false;
  if (ctx.stage === "tg-given-cold") return false;
  if (ctx.score.annoyance > 70) return false; // 已经太生气了
  return true;
}

function baseTextReplyChance(cat: EmojiCategory, ctx: EmojiReactionDecisionCtx): number {
  let chance = 0.08;
  const init = ctx.communication?.initiative ?? "medium";
  if (init === "high") chance += 0.1;
  if (init === "low") chance -= 0.04;
  const life = ctx.communication?.lifeSharing ?? "medium";
  if (life === "high") chance += 0.06;
  if (ctx.stage === "long-term" || ctx.stage === "dating-stable") chance += 0.04;
  if (ctx.stage === "met-irl-got-tg" || ctx.stage === "tg-given-cold") chance -= 0.07;
  if (cat === "funny") chance += 0.06;
  if (cat === "sad") chance += 0.04;
  if (cat === "neutral") chance -= 0.04;
  if (cat === "positive" && ctx.score.annoyance > 50) chance -= 0.07;
  return Math.max(0, Math.min(0.5, chance));
}

function shouldReactBack(ctx: EmojiReactionDecisionCtx): boolean {
  let chance = 0.22;
  if (ctx.stage === "dating-stable" || ctx.stage === "long-term") chance = 0.32;
  if (ctx.stage === "tg-given-cold" || ctx.stage === "met-irl-got-tg") chance = 0.08;
  return Math.random() < chance;
}

function pickReactBack(cat: EmojiCategory): string {
  if (cat === "positive") return ["❤", "🥰", "😘", "🤗"][Math.floor(Math.random() * 4)]!;
  if (cat === "funny") return ["😂", "🤣"][Math.floor(Math.random() * 2)]!;
  return "👍";
}

function passiveMoodFor(cat: EmojiCategory, ctx: EmojiReactionDecisionCtx): Partial<RelationshipScore> | undefined {
  if (cat === "positive") {
    if (ctx.score.annoyance > 50) return undefined; // 生气时 — 忽略不会让她变暖
    return { attraction: 1, interest: 1 };
  }
  if (cat === "funny") return { interest: 1 };
  if (cat === "sad") return { trust: 1 };
  return undefined;
}

function textReplyContextFor(cat: EmojiCategory, ctx: EmojiReactionDecisionCtx): string {
  const lines: string[] = [];
  lines.push("# 当前情况");
  lines.push(`他对你最后一条消息发送了 ${ctx.emoji} 反应。`);
  if (ctx.herLastMessageText) {
    lines.push(`你的消息是："${ctx.herLastMessageText.slice(0, 200)}"。`);
  }
  switch (cat) {
    case "positive":
      lines.push("温暖的反应。可以温柔地评论一下，回应式地撩一下，或者展开话题 — 根据 persona/speech/stage。");
      break;
    case "funny":
      lines.push("他对你的消息笑了。可以配合气氛，再发一个笑话或评论一下。");
      break;
    case "sad":
      lines.push("他感到难过/同情。按照 persona 用关心或支持的方式回应。");
      break;
    case "neutral":
      lines.push("中性反应（👍 / 👌）。如果你想的话 — 用一条简短消息评论一下。");
      break;
    default:
      lines.push("反应。自然地点评一下。");
  }
  lines.push("");
  lines.push("生成1个短气泡（最多2个）。不要元评论，不要解释反应机制。");
  return lines.join("\n");
}

function textReplyContextForToxic(ctx: EmojiReactionDecisionCtx): string {
  const lines: string[] = [];
  lines.push("# 当前情况");
  lines.push(`他对你最后一条消息发送了 ${ctx.emoji} 反应，而且这明显是针对你本人的，不是针对你讲述的某个情况。`);
  if (ctx.herLastMessageText) {
    lines.push(`你的消息是："${ctx.herLastMessageText.slice(0, 200)}"。`);
  }
  lines.push("真实女生遇到这种事会默默生气，不会大吵大闹。一个简短的冷淡/冷漠/委屈的气泡，按照你自己的 persona/speech。例如：'好吧', '明白了。', '你也一样', '...', '谢谢。', '我知道了'。也可以直接沉默无视 — 但你决定发一条气泡是值得的。");
  lines.push("");
  lines.push("一条短气泡。不要解释，不要说'你是认真的吗？！'，不要戏剧化。");
  return lines.join("\n");
}

/**
 * Anti-flood：如果用户每分钟更改反应5次以上 — 忽略。
 */
export function shouldThrottleEmojiReactions(recentReactionsCount: number): boolean {
  return recentReactionsCount > 4;
}

/**
 * 有毒emoji的上下文检查：emoji是针对她本人还是
 * 针对她故事中的情况/第三方？
 *
 * 返回 true 如果是针对她个人（受伤），false 如果是关于上下文。
 *
 * 廉价LLM调用，json模式，低temperature。
 */
export async function isToxicReactionAboutHerSelf(
  llm: LLMClient,
  herLastMessageText: string,
  emoji: string
): Promise<boolean> {
  if (!herLastMessageText.trim()) return true; // 没有上下文 — 默认认为针对她
  try {
    const raw = await llm.chat([
      {
        role: "system",
        content: `你是一个上下文分类器。女生发了一条消息，男生在上面放了一个有毒的emoji反应（${emoji}）。判断：这个emoji是针对她本人（受伤），还是针对她讲述的内容（第三方、情况、荒谬的事情）？

示例：
- "做了美甲" + 💀 → ABOUT_HER（侮辱）
- "街上有个醉汉对我大喊" + 💀 → ABOUT_CONTEXT（关于那个男人）
- "补考通过了" + 🤡 → ABOUT_HER（侮辱）
- "同事第5次搞砸了报告" + 🤡 → ABOUT_CONTEXT（关于同事）
- "又没睡好" + 💀 → ABOUT_HER（关于她）
- "看到一个骑滑板车的男人直接摔进了水坑" + 💀 → ABOUT_CONTEXT（关于那个男人）

严格返回 JSON：{"aboutHer": boolean, "confidence": 0..1}.`
      },
      { role: "user", content: `她的消息："""${herLastMessageText.slice(0, 600)}"""\n他的emoji反应：${emoji}` }
    ], { temperature: 0.1, maxTokens: 80, json: true });
    const parsed = JSON.parse(raw);
    return parsed?.aboutHer !== false;
  } catch {
    // 回退：如果emoji明显是负面的并且她的消息看起来是关于自己的中性内容 — 受伤。
    // 默认认为针对她（对情感状态更安全）。
    return true;
  }
}
