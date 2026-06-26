import type { ProfileConfig } from "../types.js";

export interface IncomingMessage {
  text: string;
  fromId: number;
  chatId: number | string;
  messageId: number;
  isPrivate: boolean;
  fromName?: string;
  media?: IncomingMedia;
  replyTo?: IncomingMessageContext;
  forward?: IncomingForwardContext;
  /**
   * 如果消息是用户对她的消息的emoji反应（Issue #76）。
   * 此时 `text` 为空，取而代之的是 emojiReaction。
   */
  emojiReaction?: {
    /** 反应的emoji（单个字符或emoji序列）。 */
    emoji: string;
    /** 被添加反应的消息ID（她的消息）。 */
    targetMessageId: number;
    /** 取消反应时为 true。 */
    removed?: boolean;
  };
  /**
   * 如果消息是用户删除消息的通知（Task #15）。
   * `text` 为空；deletion.text 中是来自历史的原始文本。
   */
  deletion?: {
    /** 已删除消息的ID。 */
    messageId: number;
    /** 原始文本（如果历史中有的话）。 */
    text: string;
    /** 原始消息距今多久（以秒为单位，删除时的时刻）。 */
    ageSec: number;
  };
}

export interface IncomingMessageContext {
  messageId?: number;
  text?: string;
  fromId?: number;
  fromName?: string;
  media?: IncomingMedia;
}

export interface IncomingForwardContext extends IncomingMessageContext {
  date?: string;
}

export type IncomingMediaKind = "photo" | "video" | "voice" | "video_note" | "sticker" | "document";

export interface IncomingMedia {
  kind: IncomingMediaKind;
  caption?: string;
  mimeType?: string;
  base64?: string;
  fileId?: string;
  emoji?: string;
}

export interface TgAdapter {
  start(onMessage: (m: IncomingMessage) => Promise<void>): Promise<void>;
  sendText(chatId: number | string, text: string): Promise<number | undefined>;
  setTyping(chatId: number | string, on: boolean): Promise<void>;
  /** 对消息添加反应。emoji为单个字符。不支持时静默无操作。 */
  setReaction(chatId: number | string, messageId: number, emoji: string): Promise<void>;
  /** 编辑已发送的消息（Task #1）。不支持时静默无操作。 */
  editText?(chatId: number | string, messageId: number, newText: string): Promise<void>;
  /**
   * Issue #81 — 在Telegram中ping"在线"状态，无需发送消息。
   * 对于userbot调用 account.UpdateStatus，对于bot模式静默无操作
   * （bot没有 last seen）。
   */
  updateOnlineStatus?(online: boolean): Promise<void>;
  blockContact?(chatId: number | string): Promise<void>;
  unblockContact?(chatId: number | string): Promise<void>;
  readHistory?(chatId: number | string): Promise<void>;
  reportSpam?(chatId: number | string): Promise<void>;
  sendSticker?(chatId: number | string, fileId: string): Promise<void>;
  deleteMessages?(chatId: number | string, messageIds: number[], revoke?: boolean): Promise<void>;
  /** 返回bot/userbot自身的信息：username和在TG中的显示名。 */
  getSelf?(): { username?: string; displayName?: string };
  stop(): Promise<void>;
}

export async function makeTgAdapter(cfg: ProfileConfig): Promise<TgAdapter> {
  if (cfg.mode === "bot") {
    const mod = await import("./bot.js");
    return mod.makeBotAdapter(cfg);
  }
  const mod = await import("./userbot.js");
  return mod.makeUserbotAdapter(cfg);
}
