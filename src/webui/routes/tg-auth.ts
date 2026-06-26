import { Router, HttpError } from "../http.js";
import { remoteSendCode, remoteVerifyCode, remoteVerifyPassword, isNeeds2FA } from "../../telegram/remote-auth.js";
import { userbotLogin } from "../../telegram/userbot.js";
import { parseTelegramProxyInput } from "../../telegram/proxy-parse.js";
import type { TelegramProxyConfig } from "../../types.js";

/**
 * 用于用户机器人登录的 WebUI 端点。
 *
 * 流程 1 (不带自己的 api_id/hash):
 *   POST /api/tg/userbot/send-code { phone }                  → { loginToken }
 *   POST /api/tg/userbot/verify-code { loginToken, code }     → { sessionString, apiId, apiHash } | { needs2fa: true, loginToken }
 *   POST /api/tg/userbot/verify-password { loginToken, password } → { sessionString, apiId, apiHash }
 *
 * 流程 2 (使用自己的 api_id/hash):
 *   使用一次性 pending 解决方案 — 在一个会话中处理 phone+code+password。
 *   由于 gramjs 期望基于回调的 promptCode/promptPassword，
 *   我们在内存中保持 pending 会话并通过 PUT 来解析它。
 */

interface PendingLogin {
  resolve?: (code: string) => void;
  resolvePass?: (pass: string) => void;
  done: Promise<string>;
  apiId: number;
  apiHash: string;
  createdAt: number;
}

const pending = new Map<string, PendingLogin>();
const proxyByToken = new Map<string, TelegramProxyConfig>(); // 远程代理流程中缓存 proxy 配置

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (now - v.createdAt > 10 * 60 * 1000) pending.delete(k);
  }
  // 代理缓存也定期清理（token 有效期通常很短）
  if (proxyByToken.size > 50) proxyByToken.clear();
}, 60_000).unref?.();

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function registerTgAuthRoutes(r: Router): void {
  // 远程代理流程 (默认)
  r.post("/api/tg/userbot/send-code", async ({ body }) => {
    const { phone, useRemote, apiId, apiHash, proxy: proxyRaw } = (body as { phone?: string; useRemote?: boolean; apiId?: number; apiHash?: string; proxy?: string }) ?? {};
    if (!phone) throw new HttpError(400, "phone required");
    const proxy = parseTelegramProxyInput(proxyRaw);
    const useProxy = useRemote !== false; // 默认使用代理
    if (useProxy) {
      const r = await remoteSendCode(phone, proxy);
      if (proxy) proxyByToken.set(r.loginToken, proxy);
      return { method: "remote", loginToken: r.loginToken };
    }
    // 自己的凭据: 在后台启动 gramjs userbotLogin，通过队列等待 code/password。
    if (!apiId || !apiHash) throw new HttpError(400, "apiId/apiHash required for self-login");
    const sessionId = randomId();
    let resolveCode: (s: string) => void = () => {};
    let resolvePass: (s: string) => void = () => {};
    const codeP = new Promise<string>(res => { resolveCode = res; });
    const passP = new Promise<string>(res => { resolvePass = res; });
    const done = userbotLogin({
      apiId,
      apiHash,
      phone,
      promptCode: () => codeP,
      promptPassword: () => passP,
      proxy
    });
    pending.set(sessionId, {
      resolve: resolveCode,
      resolvePass: resolvePass,
      done,
      apiId,
      apiHash,
      createdAt: Date.now()
    });
    return { method: "self", sessionId };
  });

  r.post("/api/tg/userbot/verify-code", async ({ body }) => {
    const { loginToken, sessionId, code } = (body as { loginToken?: string; sessionId?: string; code?: string }) ?? {};
    if (!code) throw new HttpError(400, "code required");
    if (loginToken) {
      const r = await remoteVerifyCode(loginToken, code, proxyByToken.get(loginToken));
      if (isNeeds2FA(r)) return { needs2fa: true, loginToken: r.loginToken };
      proxyByToken.delete(loginToken);
      return { sessionString: r.sessionString, apiId: r.apiId, apiHash: r.apiHash };
    }
    if (sessionId) {
      const p = pending.get(sessionId);
      if (!p) throw new HttpError(404, "session expired");
      p.resolve?.(code);
      // Wait a short moment to see if gramjs accepts the code or asks for password.
      // Race the done promise with a small delay: if done resolves quickly with sessionString,
      // login is complete; otherwise gramjs will request password via promptPassword.
      const result = await Promise.race([
        p.done.then(s => ({ kind: "ok" as const, sessionString: s })),
        new Promise<{ kind: "wait" }>(r => setTimeout(() => r({ kind: "wait" }), 4500))
      ]);
      if (result.kind === "ok") {
        pending.delete(sessionId);
        return { sessionString: result.sessionString, apiId: p.apiId, apiHash: p.apiHash };
      }
      return { needs2fa: true, sessionId };
    }
    throw new HttpError(400, "loginToken or sessionId required");
  });

  r.post("/api/tg/userbot/verify-password", async ({ body }) => {
    const { loginToken, sessionId, password } = (body as { loginToken?: string; sessionId?: string; password?: string }) ?? {};
    if (!password) throw new HttpError(400, "password required");
    if (loginToken) {
      const r = await remoteVerifyPassword(loginToken, password, proxyByToken.get(loginToken));
      proxyByToken.delete(loginToken);
      return { sessionString: r.sessionString, apiId: r.apiId, apiHash: r.apiHash };
    }
    if (sessionId) {
      const p = pending.get(sessionId);
      if (!p) throw new HttpError(404, "session expired");
      p.resolvePass?.(password);
      const sessionString = await p.done.catch((e: Error) => { throw new HttpError(400, `userbot login failed: ${e.message}`); });
      pending.delete(sessionId);
      return { sessionString, apiId: p.apiId, apiHash: p.apiHash };
    }
    throw new HttpError(400, "loginToken or sessionId required");
  });
}
