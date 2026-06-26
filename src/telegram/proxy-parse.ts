import type { TelegramProxyConfig } from "../types.js";

/**
 * 将代理字符串解析为 TelegramProxyConfig。
 *
 * 支持的格式（与文档一致）:
 * - `tg://proxy?server=...&port=...&secret=...` → MTProxy
 * - `https://t.me/proxy?server=...&port=...&secret=...` → MTProxy
 * - `socks5://[user:pass@]host:port` → SOCKS5
 * - `socks4://host:port` → SOCKS4
 * - 纯 `host:port` → SOCKS5（常用简写格式）
 *
 * 如果输入已经是 TelegramProxyConfig 对象 — 原样返回。
 * 这是因为 UI 历史上以字符串形式发送代理，而运行时需要对象。
 */
export function parseTelegramProxyInput(
  raw: string | TelegramProxyConfig | undefined | null
): TelegramProxyConfig | undefined {
  if (raw == null) return undefined;

  // 已是对象 — 归一化字段。
  if (typeof raw === "object") {
    if (!raw.ip || !raw.port) return undefined;
    if (raw.MTProxy && raw.secret) {
      return { ip: raw.ip, port: raw.port, MTProxy: true, secret: raw.secret, timeout: raw.timeout };
    }
    // SOCKS — 未指定 socksType 时默认为 5（合理的默认值）。
    const socksType = raw.socksType === 4 ? 4 : 5;
    return {
      ip: raw.ip,
      port: raw.port,
      socksType,
      username: raw.username,
      password: raw.password,
      timeout: raw.timeout
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 尝试 1: 按 URL 解析。
  try {
    const url = new URL(trimmed);
    // MTProxy: tg://proxy?... 或 https://t.me/proxy?...
    const isMtproxy =
      (url.protocol === "tg:" && url.hostname === "proxy") ||
      (/^https?:$/.test(url.protocol) && url.hostname === "t.me" && url.pathname.replace(/^\//, "") === "proxy");
    if (isMtproxy) {
      const ip = url.searchParams.get("server")?.trim();
      const port = Number(url.searchParams.get("port"));
      const secret = url.searchParams.get("secret")?.trim();
      if (!ip || !Number.isInteger(port) || port <= 0 || !secret) return undefined;
      return { ip, port, MTProxy: true, secret };
    }
    if (url.protocol === "socks4:" || url.protocol === "socks5:") {
      const socksType = url.protocol === "socks4:" ? 4 : 5;
      const port = Number(url.port);
      if (!url.hostname || !Number.isInteger(port) || port <= 0) return undefined;
      return {
        ip: url.hostname,
        port,
        socksType,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined
      };
    }
    return undefined;
  } catch {
    // 不是 URL — 尝试 host:port
  }

  // 尝试 2: 纯 host:port（默认 SOCKS5）。
  const [host, portRaw] = trimmed.split(":");
  const port = Number(portRaw);
  if (!host || !Number.isInteger(port) || port <= 0) return undefined;
  return { ip: host, port, socksType: 5 };
}

export function formatTelegramProxy(proxy: TelegramProxyConfig | undefined | null): string {
  if (!proxy) return "";
  if (proxy.MTProxy && proxy.secret) {
    const params = new URLSearchParams({
      server: proxy.ip,
      port: String(proxy.port),
      secret: proxy.secret
    });
    return `tg://proxy?${params.toString()}`;
  }
  const proto = proxy.socksType === 4 ? "socks4" : "socks5";
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ""}@`
    : "";
  return `${proto}://${auth}${proxy.ip}:${proxy.port}`;
}
