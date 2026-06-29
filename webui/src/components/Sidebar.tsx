import { useState } from "react";
import { useStore } from "../lib/store";
import type { Tab } from "../lib/store";

const ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "聊天", icon: "✎" },
  { id: "assistant", label: "助手", icon: "✦" },
  { id: "logs", label: "日志 / 状态", icon: "≡" },
  { id: "relationship", label: "关系", icon: "♥" },
  { id: "stats", label: "统计", icon: "▦" },
  { id: "configuration", label: "配置", icon: "⚙" },
  { id: "memory", label: "记忆", icon: "❀" },
  { id: "addons", label: "插件", icon: "◉" },
  { id: "diagnostics", label: "诊断", icon: "✓" }
];

export function Sidebar() {
  const profiles = useStore(s => s.profiles);
  const activeSlug = useStore(s => s.activeSlug);
  const activeConfig = useStore(s => s.activeConfig);
  const tab = useStore(s => s.tab);
  const setTab = useStore(s => s.setTab);
  const selectProfile = useStore(s => s.selectProfile);
  const showSetupFlow = useStore(s => s.showSetupFlow);
  const toggleTheme = useStore(s => s.toggleTheme);
  const theme = useStore(s => s.theme);
  const [pickerOpen, setPickerOpen] = useState(false);

  const active = profiles.find(p => p.slug === activeSlug) ?? null;

  const initial = (active?.name?.trim()?.[0] ?? "?").toUpperCase();
  const stateClass = active?.status === "running" ? "running"
    : active?.status === "paused" ? "paused"
    : active?.status === "error" ? "error"
    : "";

  return (
    <>
      <div className="sidebar-brand">
        <div className="logo" />
        <div className="name">girl-agent</div>
        <div className="ver">webui</div>
      </div>

      <div style={{ position: "relative" }}>
        <div className="profile-picker" onClick={() => setPickerOpen(!pickerOpen)}>
          <div className="pp-avatar">{initial}</div>
          <div className="pp-info">
            <div className="pp-name">{active?.name ?? "创建配置文件"}</div>
            <div className="pp-meta">
              <span className={`pp-dot ${stateClass}`} />
              {active ? `${active.age}, ${active.mode}, ${stateLabel(active.status)}` : "无配置文件"}
            </div>
          </div>
          <span style={{ color: "var(--ga-text-faint)", fontSize: 11 }}>⇅</span>
        </div>
        {pickerOpen && (
          <div className="profile-popover">
            {profiles.map(p => (
              <div
                key={p.slug}
                className={`profile-popover-item ${p.slug === activeSlug ? "active" : ""}`}
                onClick={() => { void selectProfile(p.slug); setPickerOpen(false); }}
              >
                <div className="pp-avatar">{(p.name?.[0] ?? "?").toUpperCase()}</div>
                <div className="pp-info">
                  <div className="pp-name">{p.name}</div>
                  <div className="pp-meta">
                    <span className={`pp-dot ${p.status === "running" ? "running" : p.status === "error" ? "error" : ""}`} />
                    {p.age}, {p.mode}
                  </div>
                </div>
              </div>
            ))}
            <div
              className="profile-popover-item"
              onClick={() => { setPickerOpen(false); showSetupFlow(true); }}
            >
              <div className="pp-avatar" style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--ga-text-dim)" }}>+</div>
              <div className="pp-info">
                <div className="pp-name">新建配置文件</div>
                <div className="pp-meta">通过设置流程</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="nav">
        {ITEMS.map(it => (
          <div
            key={it.id}
            className={`nav-item ${tab === it.id ? "active" : ""}`}
            onClick={() => setTab(it.id)}
          >
            <span className="icon">{it.icon}</span>
            {it.label}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <div className="nav">
          <div className="nav-item" onClick={toggleTheme}>
            <span className="icon">{theme === "dark" ? "☾" : "☀"}</span>
            {theme === "dark" ? "深色主题" : "浅色主题"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ga-text-faint)", padding: "2px 8px" }}>
          {activeConfig?.slug ? `slug: ${activeConfig.slug}` : "无活动配置文件"}
        </div>
      </div>
    </>
  );
}

function stateLabel(s: string): string {
  switch (s) {
    case "running": return "运行中";
    case "paused": return "已暂停";
    case "error": return "错误";
    case "stopped":
    default: return "已停止";
  }
}
