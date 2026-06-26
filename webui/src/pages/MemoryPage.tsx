import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";

const SUGGESTED = [
  { path: "persona.md", label: "persona.md", hint: "她是谁: 外貌、背景、习惯" },
  { path: "speech.md", label: "speech.md", hint: "如何写作: 词汇、长度、情感" },
  { path: "boundaries.md", label: "boundaries.md", hint: "不做的事 / 负面反应" },
  { path: "communication.md", label: "communication.md", hint: "沟通风格和节奏" },
  { path: "long-term.md", label: "long-term.md", hint: "长期记忆 (笔记)" },
  { path: "relationship.md", label: "relationship.md", hint: "阶段 + 分数 + 关系历史" }
];

export function MemoryPage() {
  const cfg = useStore(s => s.activeConfig);
  const toast = useStore(s => s.toast);
  const [files, setFiles] = useState<{ path: string; size: number; mtime: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"edit" | "preview" | "split">("split");

  useEffect(() => {
    if (!cfg) return;
    void api.listMemoryFiles(cfg.slug).then(r => {
      setFiles(r.files);
      if (!active && r.files.length) setActive(r.files[0].path);
    });
  }, [cfg?.slug]);

  useEffect(() => {
    if (!cfg || !active) return;
    setLoading(true);
    void api.readMemoryFile(cfg.slug, active)
      .then(r => { setContent(r.content); setOriginalContent(r.content); })
      .catch(() => { setContent(""); setOriginalContent(""); })
      .finally(() => setLoading(false));
  }, [cfg?.slug, active]);

  const previewHtml = useMemo(() => renderMarkdown(content), [content]);

  if (!cfg) {
    return (
      <div className="empty">
        <div className="em-icon">❀</div>
        <div className="em-title">创建个人资料以编辑记忆</div>
      </div>
    );
  }

  const dirty = content !== originalContent;
  async function save() {
    if (!cfg || !active) return;
    try {
      await api.writeMemoryFile(cfg.slug, active, content);
      setOriginalContent(content);
      toast(`${active} 已保存`, "success");
      void api.listMemoryFiles(cfg.slug).then(r => setFiles(r.files));
    } catch (e) {
      toast(`保存错误: ${(e as Error)?.message}`, "error");
    }
  }

  // Merge known files with whatever is on disk (some may not exist yet).
  const knownPaths = new Set(SUGGESTED.map(s => s.path));
  const items = [
    ...SUGGESTED.map(s => ({ path: s.path, label: s.label, hint: s.hint, size: files.find(f => f.path === s.path)?.size, group: "core" as const })),
    ...files.filter(f => !knownPaths.has(f.path) && f.path.startsWith("memory/daily/")).map(f => ({ path: f.path, label: f.path.replace(/^memory\/daily\//, "📅 "), hint: undefined, size: f.size, group: "daily" as const })),
    ...files.filter(f => !knownPaths.has(f.path) && f.path.startsWith("memory/episodes/")).map(f => ({ path: f.path, label: f.path.replace(/^memory\/episodes\//, "✦ "), hint: undefined, size: f.size, group: "episodes" as const })),
    ...files.filter(f => !knownPaths.has(f.path) && !f.path.startsWith("memory/") && !f.path.startsWith("log/")).map(f => ({ path: f.path, label: f.path, hint: undefined, size: f.size, group: "core" as const }))
  ];

  const groups: Record<string, typeof items> = { core: [], daily: [], episodes: [] };
  for (const it of items) groups[it.group]!.push(it);

  return (
    <div className="memory-shell">
      <div className="card" style={{ padding: 14, overflowY: "auto", maxHeight: "82vh" }}>
        <div className="h-title" style={{ marginBottom: 8 }}>记忆文件</div>
        <div className="memory-list">
          {groups.core.map(it => (
            <div key={it.path} className={`memory-item ${active === it.path ? "active" : ""}`} onClick={() => setActive(it.path)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{it.label}</div>
                {it.hint && <div className="size">{it.hint}</div>}
              </div>
              <div className="size">{it.size != null ? `${it.size}b` : "—"}</div>
            </div>
          ))}
        </div>

        {groups.daily.length > 0 && (
          <>
            <div className="h-title" style={{ margin: "16px 0 8px", fontSize: 13 }}>每日摘要</div>
            <div className="memory-list">
              {groups.daily.slice(-30).reverse().map(it => (
                <div key={it.path} className={`memory-item ${active === it.path ? "active" : ""}`} onClick={() => setActive(it.path)}>
                  <div className="name">{it.label}</div>
                  <div className="size">{it.size}b</div>
                </div>
              ))}
            </div>
          </>
        )}
        {groups.episodes.length > 0 && (
          <>
            <div className="h-title" style={{ margin: "16px 0 8px", fontSize: 13 }}>片段</div>
            <div className="memory-list">
              {groups.episodes.slice(-30).reverse().map(it => (
                <div key={it.path} className={`memory-item ${active === it.path ? "active" : ""}`} onClick={() => setActive(it.path)}>
                  <div className="name">{it.label}</div>
                  <div className="size">{it.size}b</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        <div className="card-header">
          <div className="h-title">{active ?? "—"}</div>
          <div className="h-actions">
            <div style={{ display: "flex", gap: 4, padding: 2, background: "var(--ga-bg-elev)", borderRadius: 8 }}>
              <button className={`btn tiny ${view === "edit" ? "primary" : "ghost"}`} style={{ padding: "4px 10px" }} onClick={() => setView("edit")}>文本</button>
              <button className={`btn tiny ${view === "split" ? "primary" : "ghost"}`} style={{ padding: "4px 10px" }} onClick={() => setView("split")}>分屏</button>
              <button className={`btn tiny ${view === "preview" ? "primary" : "ghost"}`} style={{ padding: "4px 10px" }} onClick={() => setView("preview")}>预览</button>
            </div>
            <span className="chip">{content.length}c</span>
            <button className="btn primary tiny" disabled={!dirty || loading} onClick={() => void save()}>保存</button>
          </div>
        </div>
        <div style={{ flex: 1, display: view === "split" ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 0 }}>
          {(view === "edit" || view === "split") && (
            <textarea
              className="editor"
              spellCheck={false}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={loading ? "加载中..." : "空白。支持 Markdown。"}
            />
          )}
          {(view === "preview" || view === "split") && (
            <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml || "<p style='color:var(--ga-text-faint)'>(空白)</p>" }} />
          )}
        </div>
      </div>
    </div>
  );
}
