import type { TelegramProxy } from "../types.js";

/**
 * Build grammy ApiClientOptions.baseFetchConfig for SOCKS5 proxy support.
 * For bot mode, grammy uses fetch() to call api.telegram.org over HTTPS.
 * When a SOCKS5 proxy is configured, we route requests through it using
 * the undici ProxyAgent (available in Node 18+).
 *
 * MTProxy is not applicable to bot mode (it's an MTProto-level proxy).
 */
export function buildBotClientOptions(proxy?: TelegramProxy): Record<string, unknown> | undefined {
  if (!proxy) return undefined;
  if (proxy.type !== "socks5") return undefined;

  try {
    // Use undici's ProxyAgent for SOCKS5 — requires Node 20+ with undici built-in.
    // Grammy's baseFetchConfig accepts a `dispatcher` option.
    const auth = proxy.username ? `${proxy.username}:${proxy.password ?? ""}@` : "";
    const proxyUrl = `socks5://${auth}${proxy.host}:${proxy.port}`;

    // Dynamic require to avoid hard dependency; falls back gracefully.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("socks-proxy-agent") as Record<string, unknown>;
    const Agent = mod.SocksProxyAgent as new (url: string) => unknown;
    const agent = new Agent(proxyUrl);
    return {
      baseFetchConfig: {
        agent
      }
    };
  } catch {
    process.stderr.write(
      `[bot] socks-proxy-agent не найден. Для SOCKS5 прокси в bot-режиме установите: npm i socks-proxy-agent\n` +
      `[bot] запускаем без прокси.\n`
    );
    return undefined;
  }
}
