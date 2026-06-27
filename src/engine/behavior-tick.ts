import type { LLMClient } from "../llm/index.js";
import type { BehaviorTickResult, CommunicationProfile, ProfileConfig } from "../types.js";
import { findStage } from "../presets/stages.js";
import { communicationDecisionState, ignoreTendencyPrompt, normalizeCommunicationProfile, normalizeIgnoreTendency } from "../presets/communication.js";
import { readRelationship } from "../storage/md.js";
import type { PresenceState } from "./presence.js";
import type { ConflictState } from "./conflict.js";

const SYS = `你是模拟真人女友的内部"决策层"。根据当前状态，决定她对男友新消息的反应。不要对话——只输出JSON。`;

interface BehaviorContext {
  presence?: PresenceState;
  conflict?: ConflictState;
  conflictColdActive?: boolean;
  blockHint?: string; // 她当前在 daily-life 中做什么
  activeDialog?: boolean;
  /** 最近收到的消息及其TG消息ID——用于反应。 */
  recentIncomingIds?: Array<{ messageId: number; text: string }>;
}

function reactionMenu(stage: string, score: { attraction: number; interest: number; annoyance: number; cringe: number }): string {
  const isWarm = score.attraction > 30 || ["dating-early", "dating-stable", "long-term"].includes(stage);
  const isCold = score.annoyance > 40 || stage === "tg-given-cold";

  if (isWarm) {
    return `可用反应（温暖阶段——她对他有感觉）:
- ❤ / 🥰 / 🥹 — 对可爱/动人的内容
- 😂 / 🤭 — 对好笑的内容
- 🔥 — 对厉害的内容
- 👀 — 对引人好奇的内容
- 🥺 — 想要关注时
- 😅 — 虽然尴尬但可爱
禁止使用: 🤡, 💀, 🤮, 🖕, 😐, 🙄 — 喜欢/有好感的女生不会对喜欢的人发这些。对于不好笑的笑话，她只会在文字里可爱地假笑（"哈哈就这"）或用 ❤/😂。`;
  }
  if (isCold) {
    return `可用反应（冷淡/冲突阶段——她正在疏远）:
- 👍 / 👌 — 冷淡确认
- 😐 / 🙄 — 烦躁
- 🤡 — 对他尴尬言行
- 💀 — 对他彻底离谱的言行
- 🤔 — 疑惑
禁止使用: ❤, 🥰, 🥹, 🥺, 🔥 — 这些是温暖信号，她现在不会发。`;
  }
  // 中性中间
  return `可用反应（中立阶段）:
- 👍 / 👌 — 好的，收到
- 😂 / 🤭 — 对好笑的内容
- 🤔 — 在思考
- 🔥 — 如果真的很厉害
- 🤡 — 仅针对明显尴尬且不带恶意
- 😐 — 累了
不要发 ❤/🥰，除非阶段到了 warming 或更高——太暴露了，还太早。`;
}

function formatIncomingIds(ids: Array<{ messageId: number; text: string }> | undefined): string {
  if (!ids || ids.length === 0) return "";
  const lines = ids.map(m => `  id=${m.messageId}: "${m.text.slice(0, 60)}"`);
  return `\n他最近的消息（用于 reactionTargetMessageId）:\n${lines.join("\n")}`;
}

const TEMPLATE = (state: string, history: string, incoming: string, ctx: BehaviorContext, reactionsHint: string) => `状态:
${state}
${ctx.presence ? `\n在线状态: ${ctx.presence.online ? "在线" : "离线"}${ctx.presence.asleep ? ", 正在睡觉" : ""}${ctx.presence.nightAwake ? ", 夜间醒来（困倦，简短）" : ""} (当地时间 ${ctx.presence.localHour}:00)。${ctx.presence.hint}` : ""}
${ctx.blockHint ? `\n当前正在做什么: ${ctx.blockHint}` : ""}
${ctx.activeDialog ? `\n活跃对话: 她刚回复过，而他几分钟内又发了消息。继续聊天，不要无缘无故随机忽略。` : ""}
${ctx.conflict && ctx.conflict.level > 0 ? `\n冲突: level ${ctx.conflict.level}, ${ctx.conflictColdActive ? "活跃冷淡期（沉默/无视）" : "冲突后余波"}, 原因: ${ctx.conflict.reason ?? "—"}` : ""}

最近消息（最后一条来自他）:
${history}

他的新消息:
"""${incoming}"""

${reactionsHint}
${formatIncomingIds(ctx.recentIncomingIds)}

决定并严格返回JSON:
{
  "intent": "reply" | "ignore" | "short" | "left-on-read" | "leave-chat" | "reaction-only",
  "shouldReply": boolean,
  "shouldRead": boolean (即使不回复，也要读消息并标记已读？她看了但未回复=left-on-read，看了且决定无视=ignore),
  "delaySec": 数字 (0..3600秒。如果她离线/忙碌/冲突中——长延迟正常。如果是活跃对话——短延迟。),
  "bubbles": 数字 (1..6),
  "typing": boolean,
  "reaction": "" 或从上方可用列表中选择一个表情。不能是禁止的!,
  "reactionTargetMessageId": 下方列表中要反应的消息ID。TG女生有时会回头对消息组中较早的消息做出反应——比如他说了两件事，她稍后回来对第一条做了反应。没有reaction时不要用。,
  "ignoreReason": 字符串或 "",
  "moodDelta": { "interest": 数字, "trust": 数字, "attraction": 数字, "annoyance": 数字, "cringe": 数字 }
}

规则:
- 如果冲突冷淡期活跃——几乎总是ignore或干巴巴的short回复。没有 ❤，也没有 ")"。
- 如果她正在睡觉——ignore或left-on-read (shouldRead=false)。如果他在夜里发了很多消息——可能惹她生气 (annoyance +)。
- 如果她处于忙碌状态——不要立即回复；如果消息值得回复，设置shouldReply=true和大delaySec，运行时会在她空闲并查看Telegram时发送。
- 如果她离线（没在睡觉）——可以有高delaySec (300-2400秒) 加上正常回复，或者ignore且shouldRead=true（她看了一下，读了，但稍后回复）。
- 如果 communication.notifications=priority ——她更容易看到他的通知；没有睡觉/冲突时，不要把每个离线状态都变成无视。
- 如果 communication.messageStyle=bursty ——即使普通回复bubbles 2..5也正常。如果one-liners——bubbles更多是1。
- 如果 communication.lifeSharing=high ——更适合选normal reply，她可以分享自己的生活片段。
- 在中文Telegram中，他消息末尾单独的")"通常表示微笑/轻松友好，而不是冷淡或"没兴趣"。不要仅因为")"就提高annoyance/cringe。
- 如果阶段是"tg-given-cold"且消息无聊/含糊——大概率ignore或left-on-read。
- 如果消息尴尬/有毒/越界——annoyance上升，可能是ignore或leave-chat。
- 如果在温暖阶段内容可爱/得体——interest和attraction +。
- 他发了长篇大论——她回复的bubbles不会更多；反而更少。
- moodDelta: 小数字 -10..+10。
- 反应——2026年真实女生更多使用TG表情反应而非在文字中用表情。如果消息引起了注意但不想回复——"intent":"reaction-only", "shouldReply":false, "reaction":"..."。默认reaction=""。
- 重要: 反应必须符合她的态度。有好感的不会对梗图发 🤡——她会发 😂/❤ 或用文字可爱地笑。冷淡的不会发 ❤。
- 不要用markdown包裹。只有JSON。`;

export async function behaviorTick(
  llm: LLMClient,
  cfg: ProfileConfig,
  recentHistory: { role: "user" | "assistant"; content: string }[],
  incoming: string,
  ctx: BehaviorContext = {}
): Promise<BehaviorTickResult> {
  const stage = findStage(cfg.stage);
  const rel = await readRelationship(cfg.slug);
  const communication = normalizeCommunicationProfile(cfg);
  const ignoreTendency = normalizeIgnoreTendency(cfg.ignoreTendency);
  const state = `stage=${cfg.stage} (${stage.label})\nscore=${JSON.stringify(rel.score)}\nbase_ignore=${stage.defaults.ignoreChance}\nbase_delay=${stage.defaults.replyDelaySec.join("..")}s\n${communicationDecisionState(communication)}\n${ignoreTendencyPrompt(ignoreTendency)}`;
  const reactionsHint = reactionMenu(cfg.stage, rel.score);

  const history = recentHistory.slice(-8)
    .map(m => `${m.role === "user" ? "他" : "她"}: ${m.content}`).join("\n");

  if (ctx.activeDialog && !ctx.conflictColdActive) {
    const bubbles = sampleBubbles(communication, true);
    return {
      shouldReply: true,
      shouldRead: true,
      delaySec: clamp(activeDialogDelay(communication), 2, 180),
      bubbles,
      typing: true,
      ignoreReason: undefined,
      moodDelta: { interest: 1 },
      intent: bubbles > 1 || communication.messageStyle !== "one-liners" ? "reply" : "short"
    };
  }

  // 基础保护: 如果冷淡期活跃——绕过LLM，以80%概率直接ignore
  if (ctx.conflictColdActive && Math.random() < 0.8) {
    return {
      shouldReply: false,
      shouldRead: false,
      delaySec: 0,
      bubbles: 1,
      typing: false,
      ignoreReason: "conflict-cold",
      moodDelta: {},
      intent: "ignore"
    };
  }

  // warm vibe——降低随机无视概率
  const ignoreMul = ignoreMultiplier(communication, ignoreTendency);

  // 如果正在睡觉——几乎总是无视，但偶发梦话
  const sleepIgnoreMul = communication.notifications === "priority" ? 0.8 : communication.notifications === "muted" ? 1 : 0.9;
  if (ctx.presence?.asleep && !ctx.presence.nightAwake) {
    const sleepRoll = Math.random();
    // ~65% 完全无视（不读不回复）
    if (sleepRoll < 0.65 * sleepIgnoreMul) {
      return {
        shouldReply: false,
        shouldRead: false,
        delaySec: 0,
        bubbles: 1,
        typing: false,
        ignoreReason: "asleep",
        moodDelta: {},
        intent: "left-on-read"
      };
    }
    // ~20% 梦话模式：发一条 2-4 字含糊内容（不读消息，延迟发出，纯本地随机，不耗 LLM）
    if (sleepRoll < 0.85 * sleepIgnoreMul) {
      return {
        shouldReply: true,
        shouldRead: false,
        delaySec: 180 + Math.random() * 720, // 3-15 分钟延迟，看起来像半梦半醒随手打的
        bubbles: 1,
        typing: true,
        ignoreReason: undefined,
        moodDelta: {},
        intent: "short",
        sleepTalk: pickSleepTalk()
      };
    }
    // 其余 ~15% 仍然 left-on-read
    return {
      shouldReply: false,
      shouldRead: false,
      delaySec: 0,
      bubbles: 1,
      typing: false,
      ignoreReason: "asleep",
      moodDelta: {},
      intent: "left-on-read"
    };
  }

  // 夜间醒来: 慢，短，可能再次睡着
  if (ctx.presence?.nightAwake) {
    // 15%概率直接无视——又睡着了（从40%下调）
    if (Math.random() < 0.15) {
      return {
        shouldReply: false,
        shouldRead: false,
        delaySec: 0,
        bubbles: 1,
        typing: false,
        ignoreReason: "night-fell-asleep",
        moodDelta: { annoyance: 5 },
        intent: "ignore"
      };
    }
    // 否则回复——但简短且慢
    const parsed = await llm.chat(
      [{ role: "system", content: SYS }, { role: "user", content: TEMPLATE(state, history, incoming, ctx, reactionsHint) }],
      { temperature: 0.7, maxTokens: 3500, json: true }
    );
    const result = JSON.parse(parsed);
    return {
      shouldReply: true,
      shouldRead: true,
      delaySec: clamp(result.delaySec ?? 20, 10, 120),
      bubbles: 1,
      typing: result.typing ?? true,
      ignoreReason: undefined,
      moodDelta: result.moodDelta || { annoyance: 3 },
      intent: "short",
      reaction: undefined
    };
  }

  try {
    const raw = await llm.chat(
      [{ role: "system", content: SYS }, { role: "user", content: TEMPLATE(state, history, incoming, ctx, reactionsHint) }],
      { temperature: 0.7, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);

    // 根据warm/cold规则清理反应
    let reaction: string | undefined = typeof parsed.reaction === "string" && parsed.reaction.length > 0 && parsed.reaction.length <= 4
      ? parsed.reaction : undefined;
    if (reaction) {
      reaction = sanitizeReaction(reaction, cfg.stage, rel.score);
    }
    const reactionTargetMessageId: number | undefined =
      typeof parsed.reactionTargetMessageId === "number" && Number.isFinite(parsed.reactionTargetMessageId)
        ? Math.floor(parsed.reactionTargetMessageId)
        : undefined;

    let intent = parsed.intent || "reply";
    let shouldReply = !!parsed.shouldReply && intent !== "ignore" && intent !== "left-on-read" && intent !== "reaction-only";
    let delaySec = parsed.delaySec ?? 30;
    let bubbles = parsed.bubbles ?? sampleBubbles(communication, false);

    if (!shouldReply && canRecoverReply(cfg.stage, rel.score, ctx) && Math.random() < recoverReplyChance(communication, rel.score, ignoreTendency)) {
      shouldReply = true;
      intent = communication.messageStyle === "one-liners" ? "short" : "reply";
      delaySec = recoverDelay(communication, ctx);
      bubbles = sampleBubbles(communication, false);
    }

    delaySec = adjustDelay(delaySec, communication, ctx);
    bubbles = normalizeBubbles(bubbles, communication, intent, ctx.activeDialog);

    return {
      shouldReply,
      shouldRead: parsed.shouldRead ?? true,
      delaySec,
      bubbles,
      typing: parsed.typing ?? true,
      ignoreReason: parsed.ignoreReason || undefined,
      moodDelta: parsed.moodDelta || {},
      intent,
      reaction,
      reactionTargetMessageId: reaction ? reactionTargetMessageId : undefined
    };
  } catch {
    const ignore = Math.random() < stage.defaults.ignoreChance * ignoreMul;
    const [lo, hi] = stage.defaults.replyDelaySec;
    return {
      shouldReply: !ignore,
      shouldRead: true,
      delaySec: adjustDelay(lo + Math.random() * (hi - lo), communication, ctx),
      bubbles: sampleBubbles(communication, false),
      typing: true,
      moodDelta: {},
      intent: ignore ? "ignore" : "reply"
    };
  }
}

function sanitizeReaction(emoji: string, stage: string, score: { attraction: number; annoyance: number }): string | undefined {
  const isWarm = score.attraction > 30 || ["dating-early", "dating-stable", "long-term"].includes(stage);
  const isCold = score.annoyance > 40 || stage === "tg-given-cold";
  const FORBIDDEN_WHEN_WARM = new Set(["🤡", "💀", "🤮", "🖕", "😐", "🙄"]);
  const FORBIDDEN_WHEN_COLD = new Set(["❤", "❤️", "🥰", "🥹", "🥺", "🔥"]);
  if (isWarm && FORBIDDEN_WHEN_WARM.has(emoji)) {
    // 替换为合适的温暖表情
    return ["😂", "❤", "🥹"][Math.floor(Math.random() * 3)];
  }
  if (isCold && FORBIDDEN_WHEN_COLD.has(emoji)) {
    return ["👍", "😐", "🤔"][Math.floor(Math.random() * 3)];
  }
  return emoji;
}

function ignoreMultiplier(profile: CommunicationProfile, ignoreTendency: number): number {
  let mul = profile.notifications === "priority" ? 0.3 : profile.notifications === "muted" ? 1.15 : 0.75;
  if (profile.initiative === "high") mul *= 0.75;
  if (profile.lifeSharing === "high") mul *= 0.85;
  if (profile.messageStyle === "one-liners" && profile.initiative === "low") mul *= 1.15;
  mul *= 0.35 + normalizeIgnoreTendency(ignoreTendency) / 35;
  return mul;
}

function activeDialogDelay(profile: CommunicationProfile): number {
  const base = profile.notifications === "priority" ? 3 : profile.notifications === "muted" ? 18 : 8;
  const spread = profile.messageStyle === "one-liners" ? 55 : profile.messageStyle === "bursty" ? 25 : 40;
  return base + Math.random() * spread;
}

function sampleBubbles(profile: CommunicationProfile, activeDialog: boolean): number {
  const r = Math.random();
  if (profile.messageStyle === "one-liners") return activeDialog && r > 0.82 ? 2 : 1;
  if (profile.messageStyle === "bursty") {
    if (activeDialog) return 2 + Math.floor(Math.random() * 4);
    return r < 0.18 ? 1 : 2 + Math.floor(Math.random() * 3);
  }
  if (profile.messageStyle === "longform") {
    if (activeDialog) return r < 0.2 ? 1 : 2 + Math.floor(Math.random() * 2);
    return r < 0.45 ? 1 : 2;
  }
  if (activeDialog) return r < 0.3 ? 1 : r < 0.82 ? 2 : 3;
  return r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
}

function canRecoverReply(stage: string, score: { interest: number; attraction: number; annoyance: number }, ctx: BehaviorContext): boolean {
  if (stage === "dumped") return false;
  if (ctx.conflictColdActive) return false;
  if (ctx.presence?.asleep && !ctx.presence.nightAwake) return false;
  if (score.annoyance > 65) return false;
  if (stage === "tg-given-cold" && score.interest < 20 && score.attraction < 20) return false;
  return true;
}

function recoverReplyChance(profile: CommunicationProfile, score: { interest: number; attraction: number; annoyance: number }, ignoreTendency: number): number {
  let chance = profile.notifications === "priority" ? 0.72 : profile.notifications === "muted" ? 0.16 : 0.38;
  if (profile.initiative === "high") chance += 0.16;
  if (profile.initiative === "low") chance -= 0.1;
  if (profile.lifeSharing === "high") chance += 0.08;
  chance -= (normalizeIgnoreTendency(ignoreTendency) - 35) / 100;
  if (score.interest > 40) chance += 0.12;
  if (score.attraction > 50) chance += 0.1;
  if (score.annoyance > 30) chance -= 0.2;
  return clamp(chance, 0.03, 0.95);
}

function recoverDelay(profile: CommunicationProfile, ctx: BehaviorContext): number {
  if (ctx.activeDialog) return activeDialogDelay(profile);
  if (ctx.presence?.online) return profile.notifications === "priority" ? 5 + Math.random() * 55 : 15 + Math.random() * 120;
  if (ctx.presence?.notificationSeen) return profile.notifications === "priority" ? 30 + Math.random() * 210 : 120 + Math.random() * 600;
  return profile.notifications === "priority" ? 180 + Math.random() * 600 : 300 + Math.random() * 1500;
}

function adjustDelay(delaySec: number, profile: CommunicationProfile, ctx: BehaviorContext): number {
  let delay = Number(delaySec) || 30;
  if (profile.notifications === "priority") delay *= 0.45;
  else if (profile.notifications === "normal") delay *= 0.8;
  else delay *= 1.15;
  if (profile.initiative === "high") delay *= 0.85;
  if (ctx.activeDialog) delay = Math.min(delay, activeDialogDelay(profile) + 20);
  if (ctx.presence?.online) delay = Math.min(delay, profile.notifications === "priority" ? 120 : 240);
  if (ctx.presence?.notificationSeen) delay = Math.min(delay, profile.notifications === "priority" ? 300 : 900);
  return clamp(delay, 0, 3600);
}

function normalizeBubbles(value: number, profile: CommunicationProfile, intent: string, activeDialog?: boolean): number {
  if (intent === "short" || intent === "ignore" || intent === "left-on-read" || intent === "reaction-only") return 1;
  const sampled = Number.isFinite(Number(value)) ? Number(value) : sampleBubbles(profile, !!activeDialog);
  if (profile.messageStyle === "one-liners") return clamp(sampled, 1, activeDialog ? 2 : 1);
  if (profile.messageStyle === "bursty") return clamp(sampled, 1, 6);
  if (profile.messageStyle === "longform") return clamp(sampled, 1, 4);
  return clamp(sampled, 1, 3);
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, Number(n) || 0));
}

// 梦话片段 — 睡眠状态偶发的短回复，纯本地随机。
const SLEEP_TALK_FRAGMENTS = ["嗯…", "嗯", "zzz", "困…", "嗯哼", "哦…", "嗯啊", "zz", "嗯好"] as const;

function pickSleepTalk(): string {
  return SLEEP_TALK_FRAGMENTS[Math.floor(Math.random() * SLEEP_TALK_FRAGMENTS.length)];
}
