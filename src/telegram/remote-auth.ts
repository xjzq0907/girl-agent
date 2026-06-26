/**
 * TG 认证代理服务器的 HTTP 客户端。
 * 允许没有自有 api_id/api_hash 的用户通过远程代理登录，
 * 使用所有者凭据。
 * 代理处理 Telegram MTProto 认证流程；客户端仅发送
 * 手机号、验证码和可选的 2FA 密码。
 */

import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { TelegramProxyConfig } from '../types.js';

const DEFAULT_PROXY = "https://tgproxy.girl-agent.com";

function proxyUrl(): string {
  return process.env.GIRL_AGENT_AUTH_PROXY ?? DEFAULT_PROXY;
}

/** 从 TelegramProxyConfig 构建 SOCKS 代理 agent，用于 HTTPS 请求。 */
function buildAgent(proxy?: TelegramProxyConfig): SocksProxyAgent | undefined {
  if (!proxy || proxy.MTProxy) return undefined;
  const proto = proxy.socksType === 4 ? 'socks4' : 'socks5';
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? ':' + encodeURIComponent(proxy.password) : ''}@`
    : '';
  return new SocksProxyAgent(`${proto}://${auth}${proxy.ip}:${proxy.port}`, {
    timeout: (proxy.timeout ?? 10) * 1000
  });
}

export interface SendCodeResult {
  loginToken: string;
}

export interface AuthSuccess {
  sessionString: string;
  apiId?: number;
  apiHash?: string;
}

export interface Needs2FA {
  needs2fa: true;
  loginToken: string;
}

export type VerifyCodeResult = AuthSuccess | Needs2FA;

async function post<T>(path: string, body: Record<string, string>, proxy?: TelegramProxyConfig): Promise<T> {
  const url = new URL(`${proxyUrl()}${path}`);
  const postData = JSON.stringify(body);
  const agent = buildAgent(proxy);
  const timeoutMs = (proxy?.timeout ?? 30) * 1000;

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Host': url.hostname,
    },
    agent,
    timeout: timeoutMs,
  };

  const via = agent ? ` via SOCKS ${url.hostname}` : '';
  console.log(`[tg-auth] POST ${path}${via}`);

  return new Promise<T>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[tg-auth] ${path} → ${res.statusCode} (${data.length} bytes)`);
        try {
          const parsed = JSON.parse(data) as T & { error?: string };
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error ?? `proxy ${path} failed (${res.statusCode})`));
          } else if (parsed.error) {
            reject(new Error(`proxy ${path} error: ${parsed.error}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response from ${path}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      console.error(`[tg-auth] ${path} ERROR: ${e.message} (code=${e.code})`);
      reject(new Error(`Request to ${path} failed: ${e.message}${e.code ? ' (' + e.code + ')' : ''}`));
    });
    req.on('timeout', () => {
      console.error(`[tg-auth] ${path} TIMEOUT after ${timeoutMs}ms`);
      req.destroy();
      reject(new Error(`Request to ${path} timed out after ${timeoutMs}ms`));
    });
    req.write(postData);
    req.end();
  });
}

export function remoteSendCode(phone: string, proxy?: TelegramProxyConfig): Promise<SendCodeResult> {
  return post("/send-code", { phone }, proxy);
}

export function remoteVerifyCode(loginToken: string, code: string, proxy?: TelegramProxyConfig): Promise<VerifyCodeResult> {
  return post("/verify-code", { loginToken, code }, proxy);
}

export function remoteVerifyPassword(loginToken: string, password: string, proxy?: TelegramProxyConfig): Promise<AuthSuccess> {
  return post("/verify-password", { loginToken, password }, proxy);
}

export function isNeeds2FA(r: VerifyCodeResult): r is Needs2FA {
  return "needs2fa" in r && r.needs2fa === true;
}
