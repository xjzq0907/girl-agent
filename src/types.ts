/**
 * 客户端模式：
 * - "bot"     — Telegram Bot（grammy）
 * - "userbot" — Telegram Userbot（MTProto，模拟真实账号）
 * - "web"     — WebUI 原生聊天通道（无需 Telegram）
 */
export type ClientMode = "bot" | "userbot" | "web";

export type LLMProto = "openai" | "anthropic";

export type PrivacyMode = "owner-only" | "allow-strangers";

export type Nationality = "RU" | "UA";

export interface TelegramProxyConfig {
  ip: string;
  port: number;
  socksType?: 4 | 5;
  MTProxy?: true;
  secret?: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface BotApiConfig {
  /** Custom Telegram Bot API root, e.g. reverse proxy or local Bot API server. */
  apiRoot?: string;
}

export interface LLMPreset {
  id: string;
  name: string;
  proto: LLMProto;
  baseURL?: string;
  defaultModel: string;
  defaultApiKey?: string;
  apiKeyRequired?: boolean;
  models?: string[];
  custom?: boolean;
  hint?: string;
  recommended?: boolean;
  /** Preset supports OAuth login as alternative to API key */
  oauth?: boolean;
  /** Provider 暂时不可用 — 在列表中显示为只读。 */
  disabled?: boolean;
  /** 禁用原因（在 UI 中显示）。 */
  disabledReason?: string;
}

export interface MCPPreset {
  id: string;
  name: string;
  description: string;
  ready: boolean; // false = coming soon slot
  /** prompts user for these key/value secrets */
  secrets?: { key: string; label: string }[];
  /** how to spawn the MCP server (stdio) */
  spawn?: (secrets: Record<string, string>) => { command: string; args: string[]; env?: Record<string, string> };
}

export type StageId =
  | "met-irl-got-tg"
  | "tg-given-cold"
  | "tg-given-warming"
  | "convinced"
  | "first-date-done"
  | "dating-early"
  | "dating-stable"
  | "long-term"
  | "dumped";

export interface StagePreset {
  id: StageId;
  num: number;
  label: string;
  description: string;
  /** behavioural defaults baked into prompt */
  defaults: {
    interest: number;     // -100..100
    trust: number;
    attraction: number;
    annoyance: number;
    cringeTolerance: number; // higher = more tolerant
    ignoreChance: number;    // 0..1 base probability per incoming message
    replyDelaySec: [number, number]; // min,max
  };
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BusySlot {
  label: string;
  days?: Weekday[];
  from: string;
  to: string;
  checkAfterMin?: [number, number];
}

export type NotificationMode = "muted" | "normal" | "priority";

export type MessageStyle = "one-liners" | "balanced" | "bursty" | "longform";

export type InitiativeLevel = "low" | "medium" | "high";

export type LifeSharingLevel = "low" | "medium" | "high";

export interface CommunicationProfile {
  notifications: NotificationMode;
  messageStyle: MessageStyle;
  initiative: InitiativeLevel;
  lifeSharing: LifeSharingLevel;
}

export interface ProfileConfig {
  slug: string;
  name: string;
  age: number;
  nationality: Nationality;
  /** IANA timezone, e.g. "Europe/Moscow" or "Europe/Kyiv" */
  tz: string;
  mode: ClientMode;
  stage: StageId;
  llm: {
    presetId: string;
    proto: LLMProto;
    baseURL?: string;
    apiKey: string;
    model: string;
    /** OAuth refresh token (for providers that support OAuth login) */
    oauthRefreshToken?: string;
    /** Unix ms when the current access token expires */
    oauthExpiresAt?: number;
  };
  minorLlm?: {
    enabled: boolean;
    sameAsMain?: boolean;
    presetId: string;
    proto: LLMProto;
    baseURL?: string;
    apiKey: string;
    model: string;
  };
  /**
   * Telegram 相关配置。`mode === "web"` 时可给空对象（内部所有字段都可选），
   * Telegram 模式下也要存在以保持向后兼容。所有内部字段都是可选的。
   */
  telegram: {
    botToken?: string;
    apiId?: number;
    apiHash?: string;
    sessionString?: string;
    phone?: string;
    /** 使用 WebSocket 通过端口 443 替代 TCP 端口 80。绕过 RF 封锁。默认 true（auto）。 */
    useWSS?: boolean;
    /** SOCKS proxy for MTProto userbot mode and Bot API mode. */
    proxy?: TelegramProxyConfig;
    /** Bot API 设置：自定义 endpoint/反向代理。 */
    botApi?: BotApiConfig;
  };
  /** @deprecated MCP 设置已从 UI 隐藏；外部扩展通过 addons 安装。 */
  mcp?: { id: string; secrets: Record<string, string> }[];
  ownerId?: number; // tg user id of the human (set on first message in practice / fallback)
  privacy?: PrivacyMode;
  createdAt: string;
  /** 睡眠时间（0-23）。sleepFrom — 入睡时间，sleepTo — 醒来时间。可以跨过午夜。 */
  sleepFrom: number;
  sleepTo: number;
  /** 概率 0..1，表示她会在夜间因收到消息而醒来（无需 :wake） */
  nightWakeChance: number;
  /** 忽略倾向 0..100。非直接随机：在 behavior-layer 中用作权重。 */
  ignoreTendency?: number;
  /** 沟通风格："short" — 真实简洁的回复，更容易忽略；"warm" — 详细、温暖、会编故事，较少忽略 */
  vibe?: "short" | "warm";
  communication?: CommunicationProfile;
  personaNotes?: string;
  busySchedule?: BusySlot[];
  /** 用户的生日，YYYY-MM-DD 或 MM-DD。可选；用于节假日感知触发主动消息。 */
  birthday?: string;
  /** 角色（她）的生日，YYYY-MM-DD 或 MM-DD。可选。 */
  characterBirthday?: string;
}

export interface RelationshipScore {
  interest: number;
  trust: number;
  attraction: number;
  annoyance: number;
  cringe: number;
}

export interface BehaviorTickResult {
  shouldReply: boolean;
  shouldRead?: boolean;     // 即使不回复，也读取并打上已读标记？
  delaySec: number;
  bubbles: number;          // how many message-pieces to split the reply into
  typing: boolean;
  ignoreReason?: string;
  moodDelta?: Partial<RelationshipScore>;
  intent: "reply" | "ignore" | "short" | "left-on-read" | "leave-chat" | "reaction-only";
  /** 可选的 TG 反应表情，用于回复他的消息。2026 年的女孩更倾向于使用反应而不是在文本中发送表情。单个字符。 */
  reaction?: string;
  /**
   * 要做出反应的 Telegram 消息 ID。
   * TG 中的女孩有时会对更早吸引她们注意的消息做出反应。
   */
  reactionTargetMessageId?: number;
  /**
   * 如果设置 — 在发送消息后，女孩决定编辑它。
   * （很少发生，主要是拼写错误 / 误发送 / 改变主意）
   */
  selfEdit?: {
    /** 已发送消息气泡中的消息序号（0 = 最后一条，1 = 倒数第二条...）。 */
    targetOffset: number;
    newText: string;
    reason?: string;
  };
  /**
   * 梦话：仅在睡眠状态收到消息时偶发。设置后，runtime 直接发送该字段作为回复，
   * 跳过 LLM 调用、system prompt 和 shouldRead=true 的副作用。
   */
  sleepTalk?: string;
}

export type DeletionAwareness = "saw-and-read" | "saw-not-read" | "missed";

export interface DeletedMessageContext {
  deletedText: string;
  awareness: DeletionAwareness;
  /** 删除多久了（以秒计）。 */
  ageSec: number;
}
