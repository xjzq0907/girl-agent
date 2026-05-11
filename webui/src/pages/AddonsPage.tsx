import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api, type AddonManifest, type InstalledAddon } from "../lib/api";

const TYPE_LABELS: Record<string, string> = {
  fix: "Фикс",
  mod: "Мод",
  persona: "Персона",
  mcp: "MCP",
  theme: "Тема",
  locale: "Локализация"
};

const TYPE_COLOR: Record<string, string> = {
  fix: "linear-gradient(135deg, #ff7a8c, #ffd07a)",
  mod: "linear-gradient(135deg, #7a8cff, #6df5ff)",
  persona: "linear-gradient(135deg, #ff7ad6, #c47aff)",
  mcp: "linear-gradient(135deg, #6df5ff, #7ce9a0)",
  theme: "linear-gradient(135deg, #ffd07a, #ff7ad6)",
  locale: "linear-gradient(135deg, #7ce9a0, #6df5ff)"
};

export function AddonsPage() {
  const activeSlug = useStore(s => s.activeSlug);
  const toast = useStore(s => s.toast);
  const [available, setAvailable] = useState<AddonManifest[]>([]);
  const [installed, setInstalled] = useState<InstalledAddon[]>([]);
  const [filter, setFilter] = useState<"all" | "fix" | "mod" | "persona" | "mcp" | "theme" | "locale">("all");
  const [tab, setTab] = useState<"marketplace" | "installed">("marketplace");
  const [search, setSearch] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [confirmAddon, setConfirmAddon] = useState<AddonManifest | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  async function refresh() {
    try {
      const r = await api.listAddons();
      setAvailable(r.available);
      setInstalled(r.installed);
    } catch (e) {
      toast(`Не удалось загрузить аддоны: ${(e as Error)?.message}`, "error");
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function requestInstall(a: AddonManifest) {
    try {
      const r = await api.previewAddon(a, activeSlug ?? undefined);
      if (r.conflicts.length === 0) {
        await doInstall(a);
      } else {
        setConfirmAddon(a);
        setConflicts(r.conflicts);
      }
    } catch (e) {
      toast(`Сбой preview: ${(e as Error)?.message}`, "error");
    }
  }

  async function doInstall(a: AddonManifest) {
    setInstalling(true);
    try {
      const r = await api.installAddon(a.id, a, activeSlug ?? undefined);
      const extra = r.applied?.length ? ` (${r.applied.join(", ")})` : "";
      toast(`${a.name} установлен${extra}`, "success");
      setConfirmAddon(null);
      setConflicts([]);
      await refresh();
    } catch (e) {
      toast(`Не удалось установить: ${(e as Error)?.message}`, "error");
    } finally {
      setInstalling(false);
    }
  }

  async function installFromUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setInstalling(true);
    try {
      const r = await api.installAddonFromUrl(url, activeSlug ?? undefined);
      toast(`${r.installed.manifest.name} установлен из URL`, "success");
      setUrlInput("");
      await refresh();
    } catch (e) {
      toast(`URL install: ${(e as Error)?.message}`, "error");
    } finally {
      setInstalling(false);
    }
  }

  async function uninstall(id: string) {
    try {
      await api.uninstallAddon(id);
      toast("Удалён", "success");
      await refresh();
    } catch (e) {
      toast(`Ошибка: ${(e as Error)?.message}`, "error");
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    try {
      await api.toggleAddon(id, enabled);
      await refresh();
    } catch (e) {
      toast(`Ошибка: ${(e as Error)?.message}`, "error");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = available.filter(a => {
    if (filter !== "all" && a.type !== filter) return false;
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.tags ?? []).some(t => t.toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 16 }}>
        <button className={`btn tiny ${tab === "marketplace" ? "primary" : ""}`} onClick={() => setTab("marketplace")}>Маркетплейс</button>
        <button className={`btn tiny ${tab === "installed" ? "primary" : ""}`} onClick={() => setTab("installed")}>Установленные ({installed.length})</button>
      </div>

      {tab === "marketplace" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button className={`btn tiny ${filter === "all" ? "primary" : ""}`} onClick={() => setFilter("all")}>Все</button>
            {Object.keys(TYPE_LABELS).map(t => (
              <button key={t} className={`btn tiny ${filter === t ? "primary" : ""}`} onClick={() => setFilter(t as any)}>{TYPE_LABELS[t]}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <input className="input" placeholder="Поиск по названию / тегу / id…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 200px" }} />
            <input className="input" placeholder="URL manifest.json (https://...)" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={{ flex: "1.5 1 280px" }} />
            <button className="btn primary tiny" disabled={installing || !urlInput.trim()} onClick={() => void installFromUrl()}>Установить из URL</button>
          </div>
          <div className="grid cols-3">
            {filtered.map(a => (
              <div key={a.id} className="addon-card">
                <div className="head">
                  <div className="icon-wrap" style={{ background: TYPE_COLOR[a.type] ?? TYPE_COLOR.mod }}>{TYPE_LABELS[a.type]?.[0] ?? "?"}</div>
                  <div>
                    <h3>{a.name}</h3>
                    <div className="meta">{TYPE_LABELS[a.type]} · v{a.version}{a.author ? ` · ${a.author}` : ""}</div>
                  </div>
                </div>
                <p>{a.description}</p>
                <div className="actions">
                  {a.installed
                    ? <button className="btn tiny ghost" onClick={() => void uninstall(a.id)}>Удалить</button>
                    : <button className="btn tiny primary" disabled={installing} onClick={() => void requestInstall(a)}>Установить</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirmAddon && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(6px)" }} onClick={() => { setConfirmAddon(null); setConflicts([]); }}>
          <div className="card" style={{ maxWidth: 520, margin: 16 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Подтверждение установки</h3>
            <p><b>{confirmAddon.name}</b> v{confirmAddon.version}</p>
            <p style={{ color: "var(--ga-text-dim)" }}>{confirmAddon.description}</p>
            <div style={{ background: "rgba(255, 122, 140, 0.08)", border: "1px solid rgba(255, 122, 140, 0.3)", borderRadius: 10, padding: 12, margin: "12px 0" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Внимание — конфликты ({conflicts.length}):</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {conflicts.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn tiny ghost" onClick={() => { setConfirmAddon(null); setConflicts([]); }}>Отмена</button>
              <button className="btn tiny primary" disabled={installing} onClick={() => void doInstall(confirmAddon)}>Всё равно установить</button>
            </div>
          </div>
        </div>
      )}

      {tab === "installed" && (
        <div className="grid cols-2">
          {installed.length === 0 && <div className="empty"><div className="em-icon">◉</div>Не установлено ни одного аддона.</div>}
          {installed.map(it => (
            <div key={it.manifest.id} className="addon-card">
              <div className="head">
                <div className="icon-wrap" style={{ background: TYPE_COLOR[it.manifest.type] }}>{TYPE_LABELS[it.manifest.type]?.[0]}</div>
                <div>
                  <h3>{it.manifest.name}</h3>
                  <div className="meta">{TYPE_LABELS[it.manifest.type]} · v{it.manifest.version} · {new Date(it.installedAt).toLocaleDateString("ru-RU")}</div>
                </div>
              </div>
              <p>{it.manifest.description}</p>
              <div className="actions">
                <label className="toggle">
                  <input type="checkbox" checked={it.enabled} onChange={(e) => void toggleEnabled(it.manifest.id, e.target.checked)} />
                  <span className="track"><span className="knob" /></span>
                  <span>{it.enabled ? "Включён" : "Выключен"}</span>
                </label>
                <button className="btn tiny danger" onClick={() => void uninstall(it.manifest.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
