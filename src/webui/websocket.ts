import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { bus, type BufferedEvent, type RuntimeStatus } from "./runtime-bus.js";
import { readRelationship } from "../storage/md.js";
import { isAuthorized } from "./auth.js";
import { webChatHub } from "./web-chat-hub.js";
import type { WebIncomingPayload } from "../telegram/web-adapter.js";

/**
 * WS 端点，参见技术规范 §6.2。
 *  /ws/logs/:slug    — 实时推送运行时事件流（单向广播，旁观模式）。
 *  /ws/status/:slug  — 推送状态快照 (分数、阶段、在线/离线)。
 *  /ws/chat/:slug?sessionId=<uuid>  — 双向聊天（Web 通道专用）。
 */
export function attachWebSockets(server: http.Server): void {
  const wssLogs = new WebSocketServer({ noServer: true });
  const wssStatus = new WebSocketServer({ noServer: true });
  const wssChat = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!isAuthorized(req)) {
      socket.destroy();
      return;
    }
    const url = req.url ?? "";
    const logsMatch = url.match(/^\/ws\/logs\/([^/?#]+)/);
    if (logsMatch) {
      const slug = decodeURIComponent(logsMatch[1] ?? "");
      wssLogs.handleUpgrade(req, socket as any, head, (ws) => {
        wssLogs.emit("connection", ws, req, slug);
      });
      return;
    }
    const statusMatch = url.match(/^\/ws\/status\/([^/?#]+)/);
    if (statusMatch) {
      const slug = decodeURIComponent(statusMatch[1] ?? "");
      wssStatus.handleUpgrade(req, socket as any, head, (ws) => {
        wssStatus.emit("connection", ws, req, slug);
      });
      return;
    }
    const chatMatch = url.match(/^\/ws\/chat\/([^/?#]+)/);
    if (chatMatch) {
      const slug = decodeURIComponent(chatMatch[1] ?? "");
      wssChat.handleUpgrade(req, socket as any, head, (ws) => {
        wssChat.emit("connection", ws, req, slug);
      });
      return;
    }
    socket.destroy();
  });

  wssLogs.on("connection", (ws: WebSocket, _req: http.IncomingMessage, slug: string) => {
    // Backlog
    for (const ev of bus.recentLogs(slug)) {
      try { ws.send(JSON.stringify({ kind: "event", event: ev })); } catch { /* ignore */ }
    }
    const onLog = (ev: BufferedEvent) => {
      try { ws.send(JSON.stringify({ kind: "event", event: ev })); } catch { /* ignore */ }
    };
    bus.on(`log:${slug}`, onLog);
    ws.on("close", () => bus.off(`log:${slug}`, onLog));
    ws.on("error", () => bus.off(`log:${slug}`, onLog));
  });

  wssStatus.on("connection", async (ws: WebSocket, _req: http.IncomingMessage, slug: string) => {
    const send = async () => {
      try {
        const status = bus.status(slug);
        let score: unknown = null;
        let stage: string | undefined;
        try {
          const rel = await readRelationship(slug);
          score = rel.score;
          stage = rel.stage;
        } catch { /* no relationship yet */ }
        ws.send(JSON.stringify({ kind: "status", status, score, stage, t: Date.now() }));
      } catch { /* ignore */ }
    };
    await send();
    const onStatus = (s: RuntimeStatus) => { if (s.slug === slug) void send(); };
    const onLog = (ev: BufferedEvent) => {
      // refresh status periodically when new events come
      if (ev.type === "score" || ev.type === "info") void send();
    };
    bus.on("status", onStatus);
    bus.on(`log:${slug}`, onLog);
    const interval = setInterval(send, 5000);
    ws.on("close", () => {
      bus.off("status", onStatus);
      bus.off(`log:${slug}`, onLog);
      clearInterval(interval);
    });
    ws.on("error", () => {
      bus.off("status", onStatus);
      bus.off(`log:${slug}`, onLog);
      clearInterval(interval);
    });
  });

  // ===== /ws/chat/:slug?sessionId=<uuid> — 双向 Web 聊天通道 =====
  wssChat.on("connection", (ws: WebSocket, req: http.IncomingMessage, slug: string) => {
    const u = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const sessionId = u.searchParams.get("sessionId") ?? "";

    if (!sessionId) {
      try { ws.close(4001, "sessionId required"); } catch { /* ignore */ }
      return;
    }
    const adapter = webChatHub.get(slug);
    if (!adapter) {
      try { ws.close(4004, "profile not in web mode or not running"); } catch { /* ignore */ }
      return;
    }

    // attachSocket 内部会发 welcome + 关闭旧 socket
    adapter.attachSocket(sessionId, ws);

    // 把 bus 上的日志事件透传为 { kind: "event", event } 帧
    const onLog = (ev: BufferedEvent) => {
      try { ws.send(JSON.stringify({ kind: "event", event: ev })); } catch { /* ignore */ }
    };
    bus.on(`log:${slug}`, onLog);
    // 发最近 20 条事件做 backlog（welcome 之前已发）
    for (const ev of bus.recentLogs(slug).slice(-20)) {
      try { ws.send(JSON.stringify({ kind: "event", event: ev })); } catch { /* ignore */ }
    }

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (!data || typeof data !== "object") return;
        switch (data.kind) {
          case "user-msg": {
            const p: WebIncomingPayload = {
              text: String(data.text ?? ""),
              messageId: String(data.messageId ?? ""),
              clientTs: Number(data.clientTs ?? Date.now())
            };
            void adapter.routeIncoming(sessionId, p);
            break;
          }
          case "user-reaction": {
            const p: WebIncomingPayload = {
              text: "",
              messageId: "",
              clientTs: Date.now(),
              emojiReaction: {
                emoji: String(data.emoji ?? ""),
                targetMessageId: String(data.messageId ?? ""),
                removed: !!data.removed
              }
            };
            void adapter.routeIncoming(sessionId, p);
            break;
          }
          case "ping": {
            try { ws.send(JSON.stringify({ kind: "pong", ts: Number(data.ts ?? Date.now()) })); } catch { /* ignore */ }
            break;
          }
          case "typing-stop":
            // 当前 Runtime 不消费；仅前端用于抑制 typing 闪烁。无副作用。
            break;
          default:
            // 忽略未知帧类型
            break;
        }
      } catch { /* malformed JSON — ignore */ }
    });

    const cleanup = () => {
      adapter.detachSocket(sessionId);
      bus.off(`log:${slug}`, onLog);
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
}
