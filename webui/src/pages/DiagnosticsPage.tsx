import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function DiagnosticsPage() {
  const [version, setVersion] = useState<{ current: string; latest: string | null } | null>(null);
  const [diag, setDiag] = useState<{ platform: string; arch: string; node: string; hostname: string; uptime: number; dataRoot: string; ipv4: string[]; memTotalMB: number } | null>(null);

  useEffect(() => {
    void api.getVersion().then(setVersion).catch(() => { /* silent */ });
    void api.getDiagnostics().then(setDiag).catch(() => { /* silent */ });
  }, []);

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 720 }}>
      <div className="card">
        <div className="card-header"><div className="h-title">版本</div></div>
        <div className="grid cols-2">
          <div className="form-row"><label>当前</label><div>{version?.current ?? "..."}</div></div>
          <div className="form-row"><label>最新</label><div>{version?.latest ?? "—"}</div></div>
        </div>
        <div className="hint">更新: <code>npm i -g @thesashadev/girl-agent</code> 或 <code>docker pull ghcr.io/thesashadev/girl-agent:latest</code></div>
      </div>

      <div className="card">
        <div className="card-header"><div className="h-title">运行环境</div></div>
        {diag && (
          <div className="grid cols-2">
            <div className="form-row"><label>平台</label><div>{diag.platform} / {diag.arch}</div></div>
            <div className="form-row"><label>Node</label><div>{diag.node}</div></div>
            <div className="form-row"><label>主机</label><div>{diag.hostname}</div></div>
            <div className="form-row"><label>RAM</label><div>{diag.memTotalMB} MB</div></div>
            <div className="form-row"><label>Uptime</label><div>{Math.round(diag.uptime)} 秒</div></div>
            <div className="form-row"><label>Data root</label><div style={{ fontFamily: "var(--ga-font-mono)", fontSize: 12 }}>{diag.dataRoot}</div></div>
            <div className="form-row" style={{ gridColumn: "span 2" }}><label>IPv4</label><div>{diag.ipv4.length ? diag.ipv4.join(", ") : "(仅 loopback)"}</div></div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div className="h-title">网络连接</div></div>
        <div className="hint">girl-agent 默认使用 WSS (websocket) 连接 Telegram — 可绕过大多数网络封锁。<br />
          如果无法连接到 LLM API — 在 <strong>配置 → LLM</strong> 中选择合适的服务商。<br />
          如果有自己的代理 — 在 <strong>配置 → Telegram → 代理</strong> 中设置。</div>
      </div>
    </div>
  );
}
