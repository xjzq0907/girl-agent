import crypto from "node:crypto";
import type { WebSocket } from "ws";
import type { IncomingMessage, TgAdapter } from "./index.js";
import type { ProfileConfig } from "../types.js";

/**
 * WebAdapter — TgAdapter 的 Web 实现。
 *
 * Runtime 业务逻辑零修改。所有 `sendText` / `setTyping` / `setReaction` /
 * `editText` 副作用被翻译成 WebSocket 帧，路由到对应 sessionId 的客户端。
 *
 * session 模型：
 * - 每个浏览器 = 一个 sessionId（由前端生成 UUID 并存到 localStorage）
 * - chatKey = `web:<sessionId>`，与 Telegram 数字 chatId 命名空间天然隔离
 * - fromId = sha256(sessionId) 的前 4 字节转 int32，保证同一浏览器同一人
 *
 * 容错：
 * - sendText 找不到 session 时 emit `info` 事件并静默返回（Runtime 全程 .catch 包裹）
 * - 断网 / 浏览器关闭 → detachSocket 清空映射；in-flight typing/reply 不会崩
 */

export interface WebSession {
  sessionId: string;
  socket: WebSocket;
  chatKey: string;
  fromId: number;
}

export interface WebIncomingPayload {
  text: string;
  messageId: string;
  clientTs: number;
  /** 可选：用户对她的某条消息的表情反应（type === "user-reaction"） */
  emojiReaction?: { emoji: string; targetMessageId: string; removed?: boolean };
}

export interface WebOutgoingFrame {
  kind: "outgoing" | "typing" | "reaction" | "edit";
  [k: string]: unknown;
}

const CHAT_KEY_PREFIX = "web:";
/** 浏览器消息 ID 计数器。同一 session 内单调递增；不同 session 独立。 */
const sessionMsgSeq = new WeakMap<WebSession, number>();

function hashSessionId(sessionId: string): number {
  // sha256 前 4 字节 → int32（有符号）。稳定且分布均匀。
  const h = crypto.createHash("sha256").update(sessionId).digest();
  // 读为 unsigned int32 再解释为有符号 int32
  const u32 = h.readUInt32BE(0);
  return u32 > 0x7fffffff ? u32 - 0x100000000 : u32;
}

function chatKeyFor(sessionId: string): string {
  return `${CHAT_KEY_PREFIX}${sessionId}`;
}

export class WebAdapter implements TgAdapter {
  private sessions = new Map<string, WebSession>();
  private listeners = new Set<(m: IncomingMessage) => Promise<void>>();
  private stopped = false;
  /** info 事件直接 emit 到 EventEmitter——Runtime 父类继承自 EventEmitter */
  constructor(private cfg: ProfileConfig) {
    // cfg 用于在 getSelf 推断 profileName / tz；不立即 IO
  }

  /**
   * Runtime.start() 调用。把 onMessage 回调存下来，等 WS 连接后才会触发。
   */
  async start(onMessage: (m: IncomingMessage) => Promise<void>): Promise<void> {
    this.listeners.add(onMessage);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const s of this.sessions.values()) {
      try { s.socket.close(1001, "adapter stopped"); } catch { /* ignore */ }
    }
    this.sessions.clear();
    this.listeners.clear();
  }

  getSelf(): { username?: string; displayName?: string } {
    return { username: undefined, displayName: this.cfg.name };
  }

  // ===== Web 专用方法（由 WS handler 调用）=====

  /** 注册一个浏览器 session。已有同 sessionId 时关闭旧 socket。 */
  attachSocket(sessionId: string, socket: WebSocket): WebSession {
    const existing = this.sessions.get(sessionId);
    if (existing && existing.socket !== socket) {
      try { existing.socket.close(1000, "replaced by new connection"); } catch { /* ignore */ }
    }
    const session: WebSession = {
      sessionId,
      socket,
      chatKey: chatKeyFor(sessionId),
      fromId: hashSessionId(sessionId)
    };
    this.sessions.set(sessionId, session);

    // 立即发 welcome + 最近日志 backlog（让前端"追赶"）
    const welcome = {
      kind: "welcome",
      sessionId,
      chatKey: session.chatKey,
      profileName: this.cfg.name,
      fromId: session.fromId
    };
    try { socket.send(JSON.stringify(welcome)); } catch { /* ignore */ }

    return session;
  }

  detachSocket(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 处理一个入站帧（来自前端）。构造 IncomingMessage 后调所有 listener。
   * 不去重、不丢消息——Runtime 内部有 incomingProcessing 串行锁。
   */
  async routeIncoming(sessionId: string, payload: WebIncomingPayload): Promise<void> {
    if (this.stopped) return;
    const session = this.sessions.get(sessionId);
    if (!session) {
      // session 已关闭（用户在回复期间刷新）。Runtime 不感知网络。
      return;
    }
    if (payload.emojiReaction) {
      // 表情反应走专门事件
      const m: IncomingMessage = {
        text: "",
        fromId: session.fromId,
        chatId: session.chatKey,
        messageId: parseInt(payload.emojiReaction.targetMessageId, 10) || 0,
        isPrivate: true,
        fromName: "you",
        emojiReaction: {
          emoji: payload.emojiReaction.emoji,
          targetMessageId: parseInt(payload.emojiReaction.targetMessageId, 10) || 0,
          removed: payload.emojiReaction.removed
        }
      };
      for (const l of this.listeners) {
        try { await l(m); } catch { /* listener 自己处理错误 */ }
      }
      return;
    }
    const m: IncomingMessage = {
      text: payload.text,
      fromId: session.fromId,
      chatId: session.chatKey,
      messageId: parseInt(payload.messageId, 10) || Math.floor(Math.random() * 1e9),
      isPrivate: true,
      fromName: "you"
    };
    for (const l of this.listeners) {
      try { await l(m); } catch { /* listener 内部应处理 */ }
    }
  }

  // ===== TgAdapter 接口副作用 =====

  async sendText(chatId: number | string, text: string): Promise<number | undefined> {
    if (this.stopped) return undefined;
    const session = this.findSession(chatId);
    if (!session) {
      this.emitInfo(`web: sendText dropped, no active session for chatId=${chatId}`);
      return undefined;
    }
    const seq = (sessionMsgSeq.get(session) ?? 0) + 1;
    sessionMsgSeq.set(session, seq);
    const msgId = `${session.sessionId.slice(0, 8)}-${seq}`;
    const frame = { kind: "outgoing", text, ts: Date.now(), msgId, chatId: session.chatKey };
    this.safeSend(session, frame);
    // 返回 number | undefined（实际是 string msgId）— Runtime 透传到 editText/setReaction 的 messageId
    // 把它转回 number 形式以便 Runtime 内部兼容
    return hashSessionId(msgId);
  }

  async setTyping(chatId: number | string, on: boolean): Promise<void> {
    if (this.stopped) return;
    const session = this.findSession(chatId);
    if (!session) return;
    this.safeSend(session, { kind: "typing", on, ts: Date.now() });
  }

  async setReaction(chatId: number | string, messageId: number, emoji: string): Promise<void> {
    if (this.stopped) return;
    const session = this.findSession(chatId);
    if (!session) return;
    this.safeSend(session, { kind: "reaction", messageId, emoji });
  }

  async editText(chatId: number | string, messageId: number, text: string): Promise<void> {
    if (this.stopped) return;
    const session = this.findSession(chatId);
    if (!session) return;
    this.safeSend(session, { kind: "edit", messageId, text });
  }

  // ===== 内部 =====

  private findSession(chatId: number | string): WebSession | undefined {
    const key = String(chatId);
    if (!key.startsWith(CHAT_KEY_PREFIX)) return undefined;
    const sessionId = key.slice(CHAT_KEY_PREFIX.length);
    return this.sessions.get(sessionId);
  }

  private safeSend(session: WebSession, frame: WebOutgoingFrame | Record<string, unknown>): void {
    try {
      if (session.socket.readyState === 1 /* OPEN */) {
        session.socket.send(JSON.stringify(frame));
      }
    } catch { /* socket closed mid-send — ignore */ }
  }

  private emitInfo(text: string): void {
    // 通过 console.error 输出；前端可订阅 /ws/logs 看到
    process.stderr.write(`[web-adapter] ${text}\n`);
  }
}

export function makeWebAdapter(cfg: ProfileConfig): WebAdapter {
  return new WebAdapter(cfg);
}

/** 类型守卫：识别 WebAdapter 实例。RuntimeBus 用它决定是否注册到 webChatHub。 */
export function isWebAdapter(x: unknown): x is WebAdapter {
  return x instanceof WebAdapter;
}
