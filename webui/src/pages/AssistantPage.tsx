import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";

interface Msg {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { tool: string; args: Record<string, unknown> }[];
}

const GREETING = "Привет! Я встроенный помощник. Спроси про любые настройки, попроси сменить стадию или ignoreTendency, объясни ошибки из логов — я помогу.";

export function AssistantPage() {
  const activeSlug = useStore(s => s.activeSlug);
  const toast = useStore(s => s.toast);
  const refreshActive = useStore(s => s.refreshActive);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    try {
      const payload = next.filter(m => m.role !== "tool").map(m => ({ role: m.role, content: m.content }));
      const r = await api.assistantChat(activeSlug ?? undefined, payload);
      const reply: Msg = { role: "assistant", content: r.reply, toolCalls: r.toolCalls };
      setMessages(prev => [...prev, reply]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `(ошибка: ${(e as Error)?.message})` }]);
    } finally {
      setBusy(false);
    }
  }

  async function applyTool(idx: number, tcIdx: number) {
    const msg = messages[idx];
    if (!msg?.toolCalls?.[tcIdx] || !activeSlug) return;
    const tc = msg.toolCalls[tcIdx];
    try {
      const r = await api.applyAssistantTool(activeSlug, tc);
      toast(`Применено: ${r.message}`, "success");
      await refreshActive();
      setMessages(prev => [...prev, { role: "tool", content: `✓ ${tc.tool}: ${r.message}` }]);
    } catch (e) {
      toast(`Ошибка: ${(e as Error)?.message}`, "error");
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-msgs" ref={boxRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            {m.toolCalls?.map((tc, j) => (
              <div key={j} style={{ marginTop: 8, padding: "10px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 10, fontFamily: "var(--ga-font-mono)", fontSize: 12 }}>
                <div><strong>{tc.tool}</strong>({Object.entries(tc.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})</div>
                <button className="btn tiny primary" style={{ marginTop: 8 }} onClick={() => void applyTool(i, j)}>Применить</button>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><span className="spinner" /> думаю...</div>}
      </div>

      <div className="chat-input">
        <textarea
          placeholder="спроси меня что-нибудь..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button className="btn primary" disabled={busy || !draft.trim()} onClick={() => void send()}>Отправить</button>
      </div>
    </div>
  );
}
