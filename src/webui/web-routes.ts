import crypto from "node:crypto";
import { Router, HttpError } from "./http.js";
import { readConfig } from "../storage/md.js";
import { bus } from "./runtime-bus.js";
import { webChatHub } from "./web-chat-hub.js";

/**
 * Web 聊天通道的 HTTP 路由。
 *
 * 当前端点：
 * - POST /api/chat/:slug/session
 *     为该 profile 创建一个新的浏览器 session。返回 sessionId，前端把它
 *     存到 localStorage，再连 /ws/chat/:slug?sessionId=<id>。
 *
 * 若 profile 还没启动（bus 中无 Runtime），本端点会按需自动 start；
 * 这与 Telegram 模式的"懒启动"一致。
 */
export function registerWebChatRoutes(r: Router): void {
  r.post("/api/chat/:slug/session", async ({ params }) => {
    const slug = params.slug ?? "";
    if (!slug) throw new HttpError(400, "slug required");

    const cfg = await readConfig(slug);
    if (!cfg) throw new HttpError(404, "profile not found");
    if (cfg.mode !== "web") {
      throw new HttpError(409, "profile is not in web mode (mode=" + cfg.mode + ")");
    }

    // 按需启动（与 Telegram 模式一致：bus.start 自动迁移 + 建 Runtime）
    if (!bus.get(slug)) {
      try { await bus.start(slug); }
      catch (e) { throw new HttpError(500, "failed to start runtime: " + ((e as Error)?.message ?? String(e))); }
    }

    // 等一帧让 runtime-bus 完成 webChatHub.register
    if (!webChatHub.get(slug)) {
      throw new HttpError(500, "web adapter not ready for slug " + slug);
    }

    const sessionId = crypto.randomUUID();
    return {
      sessionId,
      chatKey: `web:${sessionId}`,
      profileName: cfg.name,
      fromId: hashSessionId(sessionId)
    };
  });
}

function hashSessionId(sessionId: string): number {
  const h = crypto.createHash("sha256").update(sessionId).digest();
  const u32 = h.readUInt32BE(0);
  return u32 > 0x7fffffff ? u32 - 0x100000000 : u32;
}
