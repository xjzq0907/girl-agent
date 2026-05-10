import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";

const SUGGESTED = [
  { path: "persona.md", label: "persona.md", hint: "кто она: внешность, бэкграунд, привычки" },
  { path: "speech.md", label: "speech.md", hint: "как пишет: лексика, длина, эмоции" },
  { path: "boundaries.md", label: "boundaries.md", hint: "что не делает / реагирует негативно" },
  { path: "communication.md", label: "communication.md", hint: "стиль и темпы общения" },
  { path: "long-term.md", label: "long-term.md", hint: "долговременная память (заметки)" }
];

export function MemoryPage() {
  const cfg = useStore(s => s.activeConfig);
  const toast = useStore(s => s.toast);
  const [files, setFiles] = useState<{ path: string; size: number; mtime: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

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

  if (!cfg) {
    return (
      <div className="empty">
        <div className="em-icon">❀</div>
        <div className="em-title">Создайте профиль, чтобы редактировать память</div>
      </div>
    );
  }

  const dirty = content !== originalContent;
  async function save() {
    if (!cfg || !active) return;
    try {
      await api.writeMemoryFile(cfg.slug, active, content);
      setOriginalContent(content);
      toast(`${active} сохранён`, "success");
      void api.listMemoryFiles(cfg.slug).then(r => setFiles(r.files));
    } catch (e) {
      toast(`Ошибка сохранения: ${(e as Error)?.message}`, "error");
    }
  }

  // Merge known files with whatever is on disk (some may not exist yet).
  const knownPaths = new Set(SUGGESTED.map(s => s.path));
  const items = [
    ...SUGGESTED.map(s => ({ path: s.path, label: s.label, hint: s.hint, size: files.find(f => f.path === s.path)?.size })),
    ...files.filter(f => !knownPaths.has(f.path)).map(f => ({ path: f.path, label: f.path, hint: undefined, size: f.size }))
  ];

  return (
    <div className="memory-shell">
      <div className="card" style={{ padding: 14 }}>
        <div className="h-title" style={{ marginBottom: 8 }}>Файлы памяти</div>
        <div className="memory-list">
          {items.map(it => (
            <div key={it.path} className={`memory-item ${active === it.path ? "active" : ""}`} onClick={() => setActive(it.path)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{it.label}</div>
                {it.hint && <div className="size">{it.hint}</div>}
              </div>
              <div className="size">{it.size != null ? `${it.size}b` : "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        <div className="card-header">
          <div className="h-title">{active ?? "—"}</div>
          <div className="h-actions">
            <span className="chip">{content.length} символов</span>
            <button className="btn primary tiny" disabled={!dirty || loading} onClick={() => void save()}>Сохранить</button>
          </div>
        </div>
        <textarea
          className="editor"
          spellCheck={false}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={loading ? "загрузка..." : "пусто"}
        />
      </div>
    </div>
  );
}
