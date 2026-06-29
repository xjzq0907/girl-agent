import { useEffect, useRef, useState } from "react";

/**
 * 消息气泡组件：复用现有 .chat-msg / .user / .assistant CSS 样式。
 *
 * role 决定对齐方向和配色：
 * - "user"   — 右侧对齐（深色 bubble），用户说的话
 * - "her"    — 左侧对齐（亮色 bubble），她的话
 * - "system" — 居中小灰条，连接状态 / typing 提示 / 表情反应 / 编辑后内容
 */
export interface MessageBubbleProps {
  role: "user" | "her" | "system";
  text: string;
  ts?: number;
  msgId?: string;
  /** 当 text 在收到 edit 帧后被更新时，传一个递增的版本号触发平滑过渡 */
  revision?: number;
}

export function MessageBubble({ role, text, ts, msgId, revision }: MessageBubbleProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [flash, setFlash] = useState(false);

  // 收到 edit / 表情反应时短暂高亮
  useEffect(() => {
    if (revision === undefined) return;
    if (revision === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, [revision]);

  if (role === "system") {
    return (
      <div className="chat-system-msg" style={systemStyle}>
        {text}
      </div>
    );
  }

  const className = `chat-msg ${role === "user" ? "user" : "assistant"}`;
  const time = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div ref={ref} className={className} style={flash ? { boxShadow: "0 0 0 2px var(--ga-accent, #E8412A)" } : undefined} data-msgid={msgId} data-revision={revision ?? 0}>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
      {time && <div style={timeStyle}>{time}</div>}
    </div>
  );
}

const systemStyle: React.CSSProperties = {
  alignSelf: "center",
  fontSize: 12,
  color: "var(--ga-text-faint, #888)",
  padding: "4px 12px",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 12,
  maxWidth: "90%",
  textAlign: "center"
};

const timeStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
  marginTop: 4,
  textAlign: "right"
};
