/**
 * 处理用户已删除消息（Task #15）。
 *
 * 分支（按需求要求）：
 *   1) "saw-and-read"     — 她已经读过了原始消息，并且它影响了她的回复
 *                            → 反应像"诶，你删哪去了"/"晚了，我已经看到了"
 *   2) "saw-not-read"     — 消息已经到达，但她还没来得及读（LLM 正在思考中）
 *                            → "哎哎哎删哪去了"（带点慌，开玩笑）
 *   3) "missed"           — 她完全没注意到（早睡了 / 间隔太久）
 *                            → 保持沉默，就当什么都没发生
 *
 * 角色对此上下文的反应由 LLM 通过 persona/speech 决定；
 * 本模块只负责分类事件并打包上下文。
 */

import type { ConversationTurn } from "./prompt.js";
import type { DeletionAwareness, DeletedMessageContext, ProfileConfig } from "../types.js";

export interface ClassifyOpts {
  deletedText: string;
  ageSec: number;
  lastReadByHerTs?: number;
  /** 她在 handleIncoming 中注意到消息的时间（毫秒时间戳）。 */
  receivedAtMs?: number;
  /** 当前的 thinking/pending 状态——是否有计划中的回复。 */
  hasPendingReply?: boolean;
  /** 当前是否有活跃对话（最近 5 分钟）。 */
  activeDialog?: boolean;
}

/**
 * 决定对该消息的感知程度。
 *
 * 逻辑：
 *  - 如果她已经回复了（最后一次她的回复时间 > 接收时间） → "saw-and-read"
 *  - 如果 pending 计时器已启动且消息已进入她的历史 → "saw-not-read"
 *  - 如果没有活跃对话且消息很旧（>30 分钟） → "missed"
 *  - 默认情况（活跃对话但尚未回复） → "saw-not-read"
 */
export function classifyDeletionAwareness(opts: ClassifyOpts): DeletionAwareness {
  // 如果消息超过 30 分钟且没有活跃对话——"missed"。
  if (opts.ageSec > 30 * 60 && !opts.activeDialog && !opts.hasPendingReply) return "missed";
  // 她在收到后已经将它标记为已读 → saw-and-read。
  if (opts.lastReadByHerTs && opts.receivedAtMs && opts.lastReadByHerTs > opts.receivedAtMs) {
    return "saw-and-read";
  }
  // 活跃对话 + 尚未回复 → saw-not-read（她正在输入中）。
  if (opts.activeDialog || opts.hasPendingReply) return "saw-not-read";
  // 默认：消息到达了，但没有强烈兴趣——saw-not-read（温和处理）。
  return "saw-not-read";
}

/**
 * 决定是否对删除做出回应（intent="missed" 时不回应）。
 */
export function shouldRespondToDeletion(ctx: DeletedMessageContext): boolean {
  if (ctx.awareness === "missed") return false;
  // 如果被删除的文本为空（服务端未保存）——无法引用它。
  // 但还是应该回应——她毕竟看到有什么东西发过来了。
  return true;
}

/**
 * 返回一个简短的 prompt 片段，LLM 将以此作为上下文，
 * 按自己的 persona/speech 自然地做出反应。
 */
export function buildDeletionPromptContext(cfg: ProfileConfig, ctx: DeletedMessageContext): string {
  const lines: string[] = [];
  lines.push("# 情境");
  lines.push("他在和你的聊天中删了一条消息。像普通 tg 女孩一样生动地回应，注意 persona/speech/communication。");
  lines.push("");
  if (ctx.awareness === "saw-and-read") {
    lines.push(`你已经读过了他的消息。内容曾是："${ctx.deletedText.slice(0, 200)}"。`);
    lines.push("反应风格：'诶你删哪去了'、'晚了，我已经看到了'、'这都是什么啊'，——但用自己的话。");
    lines.push("如果上下文合适/处于冷淡阶段也可以忽略。");
  } else if (ctx.awareness === "saw-not-read") {
    lines.push("你看到了有消息进来，但没来得及读——他删得很快。");
    lines.push("反应风格：'哎哎哎删哪去了'、'真是的'、'发的啥给我看看'，——但用自己的话。");
    lines.push("warm 阶段撩动好奇，cold/dumped 阶段——无视 / 冷淡。");
  } else {
    lines.push("你没注意到。根本不要回复。");
  }
  lines.push("");
  lines.push("通过 --- 分隔生成 1-2 条短气泡，不要带系统元评论，不要解释删除机制。");
  return lines.join("\n");
}

/**
 * 检查已删除的文本是否已经出现在她的历史 turn 中。
 */
export function isInHistory(hist: ConversationTurn[], deletedText: string): boolean {
  if (!deletedText) return false;
  const needle = deletedText.trim().toLowerCase();
  return hist.some(t => t.role === "user" && t.content.trim().toLowerCase().includes(needle));
}
