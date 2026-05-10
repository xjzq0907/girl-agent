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

  async function install(a: AddonManifest) {
    try {
      await api.installAddon(a.id, a, activeSlug ?? undefined);
      toast(`${a.name} установлен`, "success");
      await refresh();
    } catch (e) {
      toast(`Не удалось установить: ${(e as Error)?.message}`, "error");
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

  const filtered = available.filter(a => filter === "all" || a.type === filter);

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 16 }}>
        <button className={`btn tiny ${tab === "marketplace" ? "primary" : ""}`} onClick={() => setTab("marketplace")}>Маркетплейс</button>
        <button className={`btn tiny ${tab === "installed" ? "primary" : ""}`} onClick={() => setTab("installed")}>Установленные ({installed.length})</button>
      </div>

      {tab === "marketplace" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button className={`btn tiny ${filter === "all" ? "primary" : ""}`} onClick={() => setFilter("all")}>Все</button>
            {Object.keys(TYPE_LABELS).map(t => (
              <button key={t} className={`btn tiny ${filter === t ? "primary" : ""}`} onClick={() => setFilter(t as any)}>{TYPE_LABELS[t]}</button>
            ))}
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
                    : <button className="btn tiny primary" onClick={() => void install(a)}>Установить</button>}
                </div>
              </div>
            ))}
          </div>
        </>
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
