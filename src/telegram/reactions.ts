// Bot API setMessageReaction 只接受有限的 emoji 列表 —
// 如果发送了其他 emoji，会返回 400 BAD_REQUEST: REACTION_INVALID，
// 用户侧不会出现反应。来源: https://core.telegram.org/bots/api#reactiontypeemoji
//
// behavior-tick 中的 LLM 经常输出此列表外的 emoji
// （😏、🙄、🥺、💀、💖、…）。在此修复之前，它们会静默落入 catch，反应
// 根本不会出现 — 因此社区反馈「日志里有，聊天里没有」。

export const BOT_REACTION_ALLOWED = new Set<string>([
  "👍", "👎", "❤", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱",
  "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊", "🤡",
  "🥱", "🥴", "😍", "🐳", "❤‍🔥", "🌚", "🌭", "💯", "🤣", "⚡",
  "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈",
  "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨",
  "🤝", "✍", "🤗", "🫡", "🎅", "🎄", "☃", "💅", "🤪", "🗿",
  "🆒", "💘", "🙉", "🦄", "😘", "💊", "🙊", "😎", "👾", "🤷‍♂",
  "🤷", "🤷‍♀", "😡"
]);

// 将常见的"不可用" emoji 映射到 allowlist 中语义最接近的。
// 选择的不是完美匹配，而是合适的替代，确保反应能真正出现，
// 而不是被静默忽略。
const FALLBACK: Record<string, string> = {
  "❤️": "❤",
  "💖": "❤",
  "💗": "❤",
  "💕": "❤",
  "💓": "❤",
  "💞": "❤",
  "🩷": "❤",
  "💜": "❤",
  "💙": "❤",
  "💚": "❤",
  "🧡": "❤",
  "💛": "❤",
  "🤍": "❤",
  "🖤": "❤",
  "🤎": "❤",
  "😏": "😎",
  "🙄": "🤨",
  "🥺": "🥹",
  "🥹": "😭",
  "💀": "🗿",
  "😂": "🤣",
  "🤭": "🤗",
  "🤫": "🫡",
  "🤐": "🫡",
  "🙃": "🥰",
  "🙂": "🥰",
  "😊": "🥰",
  "😅": "😁",
  "😆": "🤣",
  "😋": "😍",
  "😜": "🤪",
  "😝": "🤪",
  "😛": "🤪",
  "😬": "😨",
  "🤤": "🥴",
  "😪": "🥱",
  "😔": "😢",
  "😞": "😢",
  "😟": "🤔",
  "😕": "🤔",
  "🥶": "🥴",
  "🤧": "🥴",
  "🤒": "💊",
  "😷": "💊",
  "🤕": "💊",
  "🤢": "🤮",
  "👋": "🤝",
  "✊": "🏆",
  "👊": "🏆",
  "💪": "🏆",
  "🙌": "🙏",
  "🫶": "❤",
  "🥳": "🎉",
  "🎊": "🎉",
  "✨": "⚡",
  "⭐": "🏆",
  "🌟": "🏆",
  "🥲": "😭"
};

/**
 * 返回对 bot.api.setMessageReaction 安全的 emoji。
 * - 如果输入 emoji 在 allowlist 中 — 原样返回；
 * - 如果在 FALLBACK 中 — 返回替代值；
 * - 否则返回 undefined（调用方此时不执行反应）。
 */
export function normalizeBotReactionEmoji(emoji: string | undefined | null): string | undefined {
  if (!emoji) return undefined;
  const trimmed = emoji.trim();
  if (!trimmed) return undefined;
  if (BOT_REACTION_ALLOWED.has(trimmed)) return trimmed;
  // ❤ 经常附带变体选择器 U+FE0F，进行归一化。
  const stripped = trimmed.replace(/\uFE0F/g, "");
  if (BOT_REACTION_ALLOWED.has(stripped)) return stripped;
  const mapped = FALLBACK[trimmed] ?? FALLBACK[stripped];
  if (mapped && BOT_REACTION_ALLOWED.has(mapped)) return mapped;
  return undefined;
}
