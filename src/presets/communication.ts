import type { CommunicationProfile, InitiativeLevel, LifeSharingLevel, MessageStyle, NotificationMode, ProfileConfig } from "../types.js";

export interface CommunicationPreset {
  id: string;
  label: string;
  description: string;
  profile: CommunicationProfile;
}

const NOTIFICATIONS: NotificationMode[] = ["muted", "normal", "priority"];
const MESSAGE_STYLES: MessageStyle[] = ["one-liners", "balanced", "bursty", "longform"];
const INITIATIVES: InitiativeLevel[] = ["low", "medium", "high"];
const LIFE_SHARING: LifeSharingLevel[] = ["low", "medium", "high"];

export const COMMUNICATION_PRESETS: CommunicationPreset[] = [
  {
    id: "normal",
    label: "普通型",
    description: "适中 — 回复正常，不粘人，偶尔主动发消息",
    profile: { notifications: "normal", messageStyle: "balanced", initiative: "medium", lifeSharing: "medium" }
  },
  {
    id: "cute",
    label: "可爱型",
    description: "温暖体贴，经常回复，主动发消息，分享日常",
    profile: { notifications: "priority", messageStyle: "balanced", initiative: "high", lifeSharing: "high" }
  },
  {
    id: "alt",
    label: "冷淡型",
    description: "冷漠、干巴巴、短回复，几乎不主动发消息，不分享私事",
    profile: { notifications: "normal", messageStyle: "one-liners", initiative: "low", lifeSharing: "low" }
  },
  {
    id: "clingy",
    label: "粘人型",
    description: "非常粘人，疯狂发消息，永远在线，总是主动找话题",
    profile: { notifications: "priority", messageStyle: "bursty", initiative: "high", lifeSharing: "high" }
  },
  {
    id: "chatty",
    label: "话痨型",
    description: "喜欢讲故事，写长消息，经常分享日常琐事",
    profile: { notifications: "priority", messageStyle: "longform", initiative: "medium", lifeSharing: "high" }
  }
];

export function findCommunicationPreset(id: string | undefined): CommunicationPreset | undefined {
  return COMMUNICATION_PRESETS.find(p => p.id === id);
}

export function normalizeCommunicationProfile(source?: Pick<Partial<ProfileConfig>, "communication" | "vibe">): CommunicationProfile {
  const fallback = source?.vibe === "warm"
    ? findCommunicationPreset("cute")!.profile
    : source?.vibe === "short"
      ? findCommunicationPreset("alt")!.profile
      : findCommunicationPreset("normal")!.profile;
  const raw = source?.communication;
  return {
    notifications: includes(NOTIFICATIONS, raw?.notifications) ? raw.notifications : fallback.notifications,
    messageStyle: includes(MESSAGE_STYLES, raw?.messageStyle) ? raw.messageStyle : fallback.messageStyle,
    initiative: includes(INITIATIVES, raw?.initiative) ? raw.initiative : fallback.initiative,
    lifeSharing: includes(LIFE_SHARING, raw?.lifeSharing) ? raw.lifeSharing : fallback.lifeSharing
  };
}

export function normalizeIgnoreTendency(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 35;
  if (!Number.isFinite(parsed)) return 35;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function ignoreTendencyLabel(value: number): string {
  const pct = normalizeIgnoreTendency(value);
  if (pct <= 10) return `${pct}% — 几乎不无故无视`;
  if (pct <= 30) return `${pct}% — 比平常更常回复`;
  if (pct <= 50) return `${pct}% — 正常活跃度/选择性`;
  if (pct <= 70) return `${pct}% — 冷淡，经常消失`;
  return `${pct}% — 非常冷淡，频繁无视`;
}

export function ignoreTendencyPrompt(value: unknown): string {
  const pct = normalizeIgnoreTendency(value);
  return `# 无视倾向
${pct}/100。这不是直接的随机百分比，而是特征权重：越高=更常不回、更慢恢复对话、更容易已读不回；越低=更常回复，哪怕很短。睡眠、冲突、繁忙、阶段和分数比这个权重更重要。`;
}

export function deriveLegacyVibe(profile: CommunicationProfile): "short" | "warm" {
  return profile.messageStyle === "one-liners" && profile.initiative === "low" && profile.lifeSharing === "low" ? "short" : "warm";
}

export function communicationProfileLabel(profile: CommunicationProfile): string {
  const exact = COMMUNICATION_PRESETS.find(p => sameProfile(p.profile, profile));
  if (exact) return exact.label;
  return `notifications=${profile.notifications}, style=${profile.messageStyle}, initiative=${profile.initiative}, life=${profile.lifeSharing}`;
}

export function communicationPromptFragment(profile: CommunicationProfile): string {
  const notifications = profile.notifications === "priority"
    ? "他的通知设为重要：你经常能快速看到他的消息，尤其是在对话进行时"
    : profile.notifications === "muted"
      ? "通知不优先：你可以晚点回复，但对话活跃时不要无故消失"
      : "普通通知：有时立即看到，有时晚一点";
  const style = profile.messageStyle === "one-liners"
    ? "通常1条短消息，1-5个字；连续消息很少，只有情绪波动时才会有"
    : profile.messageStyle === "bursty"
      ? "经常发2-5条连续消息：零碎想法、一个字、然后补充、然后情绪"
      : profile.messageStyle === "longform"
        ? "可以写一条较长的消息或2-3条中等长度的，当你在讲故事/解释感受时"
        : "通常1-3条不同长度的消息，不追求完美均匀";
  const initiative = profile.initiative === "high"
    ? "主动性高：你可能先发消息、问他在哪、分享日常杂念、吃醋/想念"
    : profile.initiative === "low"
      ? "主动性低：很少先发消息，主要在有明确理由时才发"
      : "主动性中等：偶尔根据事情、情绪或想起他时先发消息";
  const life = profile.lifeSharing === "high"
    ? "经常分享日常小瞬间：看到什么、什么事惹你烦、吃了什么、闺蜜/妈妈说了什么、学习/工作中发生了什么"
    : profile.lifeSharing === "low"
      ? "很少分享私事，没有理由不详细描述自己的一天"
      : "偶尔分享生活瞬间，尤其是与当前情绪相关时";
  return `# 沟通微调
- 通知：${notifications}。
- 消息风格：${style}。
- 主动性：${initiative}。
- 生活分享：${life}。

节奏规则：
- 不要每次都按"回复→离开→回来→回复"的模式行动。
- 在活跃对话中，正常人常常留在聊天框里快速回复。如果确实要走——文字里需要有日常原因，而不是突然消失。
- 有时可以连续发3-5条消息然后消失。有时可以进行长时间的快速对话。有时可以一个字回复。节奏应该有变化。
- 不要编造真实的URL。只有上下文中有的链接才能提到，或者用"回头发你"这样的日常回应。`;
}

export function communicationDecisionState(profile: CommunicationProfile): string {
  return `communication={notifications:${profile.notifications}, messageStyle:${profile.messageStyle}, initiative:${profile.initiative}, lifeSharing:${profile.lifeSharing}}`;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function sameProfile(a: CommunicationProfile, b: CommunicationProfile): boolean {
  return a.notifications === b.notifications && a.messageStyle === b.messageStyle && a.initiative === b.initiative && a.lifeSharing === b.lifeSharing;
}
