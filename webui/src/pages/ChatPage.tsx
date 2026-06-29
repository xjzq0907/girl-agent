import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { ensureChatSession, chatOutgoing, type ChatFrame, type ChatSessionInfo } from "../lib/api";
import { MessageBubble } from "../components/MessageBubble";

/**
 * WebUI 原生聊天页（mode === "web"）。
 *
 * 行为：完全复用 Runtime 的人格引擎，通过 /ws/chat/:slug 双向 WS 通道收发消息。
 * 所有"真实感"机制（延迟/不回/反应/编辑/睡眠/冲突/agenda）由后端 ZeroMod 负责，
 * 本页只负责：建连、收帧、渲染气泡、自动重连、自动滚动、心跳、编辑框。
 *
 * 历史是 ephemeral 的：浏览器关闭/重连后清空（Runtime.histories 是内存 Map）。
 */

interface DisplayMessage {
  id: string;            // 唯一 key（user 用 messageId；her 用 msgId；system 用 seq）
  role: "user" | "her" | "system";
  text: string;
  ts: number;
  /** her 的消息才有 msgId；user 才有 clientMsgId */
  msgId?: string;
  /** 每次 edit 递增，触发气泡短暂高亮 */
  revision?: number;
}

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10_000]; // 指数退避

export function ChatPage() {
  const activeSlug = useStore(s => s.activeSlug);
  const activeConfig = useStore(s => s.activeConfig);
  const toast = useStore(s => s.toast);

  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedByUserRef = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 切换 profile 时重置一切
  useEffect(() => {
    closedByUserRef.current = true;
    cleanupConnection();
    setSession(null);
    setMessages([]);
    setDraft("");
    setConnected(false);
    setConnecting(false);
    setTyping(false);
    setError(null);
    if (!activeSlug) return;
    if (activeConfig && activeConfig.mode !== "web") {
      setError(`当前 profile 是 "${activeConfig.mode}" 模式，不支持 Web 聊天。请在配置中将 mode 改为 web。`);
      return;
    }
    closedByUserRef.current = false;
    reconnectAttemptRef.current = 0;
    void bootSession(activeSlug);
    return () => { closedByUserRef.current = true; cleanupConnection(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug, activeConfig?.mode]);

  // 自动滚到底
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  async function bootSession(slug: string) {
    setConnecting(true);
    setError(null);
    try {
      const localKey = `ga-web-chat-${slug}`;
      let sid: string | null = localStorage.getItem(localKey);
      let info: ChatSessionInfo;
      if (sid) {
        // 复用旧 session — 但服务端可能不认识，先调 session 端点拿到最新信息
        info = await ensureChatSession(slug);
        if (info.sessionId !== sid) {
          // 服务端给了新 id（重启过），更新本地
          localStorage.setItem(localKey, info.sessionId);
          sid = info.sessionId;
        }
      } else {
        info = await ensureChatSession(slug);
        localStorage.setItem(localKey, info.sessionId);
        sid = info.sessionId;
      }
      setSession(info);
      setMessages([{ id: "sys-greet", role: "system", text: `已连接到 ${info.profileName}`, ts: Date.now() }]);
      connect(slug, sid);
    } catch (e) {
      setError(`连接失败: ${(e as Error)?.message ?? String(e)}`);
      setConnecting(false);
    }
  }

  function connect(slug: string, sessionId: string) {
    if (closedByUserRef.current) return;
    cleanupConnection();
    if (wsRef.current) return; // 双保险
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const sock = new WebSocket(
      `${proto}//${location.host}/ws/chat/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sessionId)}`
    );
    wsRef.current = sock;
    sock.addEventListener("open", () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      reconnectAttemptRef.current = 0;
      // 心跳
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = window.setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify(chatOutgoing("ping", { ts: Date.now() })));
        }
      }, PING_INTERVAL_MS);
    });
    sock.addEventListener("message", (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data && typeof data === "object" && typeof data.kind === "string") {
          handleFrame(data as ChatFrame);
        }
      } catch { /* ignore */ }
    });
    sock.addEventListener("close", () => {
      setConnected(false);
      wsRef.current = null;
      if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (closedByUserRef.current) return;
      // 自动重连
      scheduleReconnect(slug, sessionId);
    });
    sock.addEventListener("error", () => {
      // 浏览器不暴露详细错误；让 close 处理重连
    });
  }

  function scheduleReconnect(slug: string, sessionId: string) {
    if (closedByUserRef.current) return;
    const idx = Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1);
    const delay = RECONNECT_DELAYS[idx] ?? 10_000;
    reconnectAttemptRef.current++;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    setConnecting(true);
    setMessages((m) => m.some(x => x.id === "sys-reconnect")
      ? m
      : [...m, { id: "sys-reconnect", role: "system", text: `连接已断开，${Math.round(delay / 1000)}s 后重连...`, ts: Date.now() }]);
    reconnectTimerRef.current = window.setTimeout(() => {
      if (closedByUserRef.current) return;
      connect(slug, sessionId);
    }, delay);
  }

  function handleFrame(f: ChatFrame) {
    switch (f.kind) {
      case "welcome":
        setSession((prev) => prev ? { ...prev, sessionId: f.sessionId, chatKey: f.chatKey } : prev);
        break;
      case "event":
        // 透传 runtime event：只在 event 类型是 outgoing/incoming 时入列；info/score 转为 system 简报
        handleRuntimeEvent(f.event);
        break;
      case "outgoing":
        // 新消息：append。如果同 msgId 已存在（reconnect 期间重复），更新 revision。
        setMessages((m) => {
          const idx = m.findIndex(x => x.msgId === f.msgId);
          if (idx >= 0) {
            const next = m.slice();
            const cur = next[idx]!;
            next[idx] = { ...cur, text: f.text, ts: f.ts, revision: (cur.revision ?? 0) + 1 };
            return next;
          }
          return [...m, { id: `her-${f.msgId}`, role: "her", text: f.text, ts: f.ts, msgId: f.msgId, revision: 0 }];
        });
        setTyping(false);
        break;
      case "typing":
        setTyping(f.on);
        break;
      case "reaction": {
        const target = f.messageId;
        setMessages((m) => [...m, { id: `sys-react-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, role: "system", text: `她给消息 #${target} 加了 ${f.emoji}`, ts: Date.now() }]);
        break;
      }
      case "edit": {
        setMessages((m) => {
          const idx = m.findIndex(x => x.msgId === String(f.messageId));
          if (idx < 0) return m;
          const next = m.slice();
          const cur = next[idx]!;
          next[idx] = { ...cur, text: f.text, revision: (cur.revision ?? 0) + 1 };
          return next;
        });
        break;
      }
      case "pong":
        // 心跳回应；无需处理
        break;
    }
  }

  function handleRuntimeEvent(ev: { type?: string; text?: string; chatId?: number | string; [k: string]: unknown }) {
    const t = String(ev?.type ?? "");
    if (t === "outgoing") {
      // outgoing 走专门的 outgoing 帧；这里略过（避免重复渲染）
      return;
    }
    if (t === "incoming") {
      // 入站也走 user-msg 路径；这里不重复
      return;
    }
    if (t === "info" || t === "error" || t === "score") {
      const text = String(ev?.text ?? "");
      if (!text) return;
      // 只显示短消息（避免日志噪音）
      if (text.length > 200) return;
      setMessages((m) => [...m, { id: `sys-evt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, role: "system", text, ts: Date.now() }]);
    }
  }

  function cleanupConnection() {
    if (pingTimerRef.current) { window.clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    if (reconnectTimerRef.current) { window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast("尚未连接", "error");
      return;
    }
    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientTs = Date.now();
    wsRef.current.send(JSON.stringify(chatOutgoing("user-msg", { text, messageId, clientTs })));
    setMessages((m) => [...m, { id: `user-${messageId}`, role: "user", text, ts: clientTs, msgId: messageId, revision: 0 }]);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!activeSlug) {
    return <div className="content-pad" style={{ padding: 32, color: "var(--ga-text-faint)" }}>请先选择或创建一个 profile。</div>;
  }

  return (
    <div className="chat-shell">
      {/* 顶部状态条 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 8px 8px", fontSize: 12, color: "var(--ga-text-dim)" }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: connected ? "#7ce9a0" : connecting ? "#e0c060" : "#888"
        }} />
        {connected ? "已连接" : connecting ? "连接中..." : "未连接"}
        {typing && <span style={{ marginLeft: 12, color: "var(--ga-text-faint)" }}>对方正在输入...</span>}
        {error && <span style={{ marginLeft: 12, color: "var(--ga-accent, #E8412A)" }}>{error}</span>}
      </div>

      {/* 消息列表 */}
      <div className="chat-msgs" ref={boxRef}>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            text={m.text}
            ts={m.role === "system" ? undefined : m.ts}
            msgId={m.msgId}
            revision={m.revision}
          />
        ))}
      </div>

      {/* 输入框 */}
      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={connected ? "输入消息，Enter 发送，Shift+Enter 换行" : "等待连接..."}
          disabled={!connected}
          rows={1}
        />
        <button className="btn primary" disabled={!connected || !draft.trim()} onClick={send}>发送</button>
      </div>
    </div>
  );
}
