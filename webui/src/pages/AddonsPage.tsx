import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "../lib/store";
import { api, type AddonManifest, type InstalledAddon, type AddonSetting } from "../lib/api";

export function AddonsPage() {
  const activeSlug = useStore(s => s.activeSlug);
  const toast = useStore(s => s.toast);
  const [available, setAvailable] = useState<AddonManifest[]>([]);
  const [installed, setInstalled] = useState<InstalledAddon[]>([]);
  const [tab, setTab] = useState<"marketplace" | "installed">("marketplace");
  const [search, setSearch] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const r = await api.listAddons();
      setAvailable(r.available);
      setInstalled(r.installed);
    } catch (e) {
      toast(`无法加载插件: ${(e as Error)?.message}`, "error");
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function doInstall(a: AddonManifest) {
    setInstalling(true);
    try {
      const r = await api.installAddon(a.id, activeSlug ?? undefined);
      const extra = r.applied.length ? ` (${r.applied.join(", ")})` : "";
      toast(`${a.name} 已安装${extra}`, "success");
      await refresh();
    } catch (e) {
      toast(`无法安装: ${(e as Error)?.message}`, "error");
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
      toast(`${r.installed.manifest.name} 已安装`, "success");
      setUrlInput("");
      await refresh();
    } catch (e) {
      toast(`URL install: ${(e as Error)?.message}`, "error");
    } finally {
      setInstalling(false);
    }
  }

  async function installFromFile(file: File) {
    setInstalling(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await api.installAddonFromFile(base64, activeSlug ?? undefined);
      toast(`${r.installed.manifest.name} 已从 .gaa 安装`, "success");
      await refresh();
    } catch (e) {
      toast(`文件: ${(e as Error)?.message}`, "error");
    } finally {
      setInstalling(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void installFromFile(file);
    e.target.value = "";
  }

  async function uninstall(id: string) {
    try {
      await api.uninstallAddon(id);
      toast("已删除", "success");
      await refresh();
    } catch (e) {
      toast(`错误: ${(e as Error)?.message}`, "error");
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    try {
      await api.toggleAddon(id, enabled);
      await refresh();
    } catch (e) {
      toast(`错误: ${(e as Error)?.message}`, "error");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = available.filter(a => {
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.tags ?? []).some(t => t.toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 16 }}>
        <button className={`btn tiny ${tab === "marketplace" ? "primary" : ""}`} onClick={() => setTab("marketplace")}>市场</button>
        <button className={`btn tiny ${tab === "installed" ? "primary" : ""}`} onClick={() => setTab("installed")}>已安装 ({installed.length})</button>
      </div>

      {tab === "marketplace" && (
        <>
          {/* 加载自定义 .gaa */}
          <div
            className="gaa-drop-zone"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("drag-over"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drag-over");
              const file = e.dataTransfer.files[0];
              if (file && file.name.endsWith(".gaa")) void installFromFile(file);
              else toast("请拖放 .gaa 文件", "error");
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".gaa" style={{ display: "none" }} onChange={handleFileSelect} />
            <div className="gaa-drop-icon">📦</div>
            <div className="gaa-drop-text">
              {installing ? "正在安装…" : "将 .gaa 文件拖放到此处或点击选择"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <input className="input" placeholder="按名称/标签/ID搜索…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 200px" }} />
            <input className="input" placeholder="URL (.gaa 或 manifest.json)" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={{ flex: "1.5 1 280px" }} />
            <button className="btn primary tiny" disabled={installing || !urlInput.trim()} onClick={() => void installFromUrl()}>从URL</button>
          </div>
          {filtered.length === 0 && (
            <div className="empty">
              <div className="em-icon">◉</div>
              {available.length === 0
                ? "插件注册表为空或不可用。请从 .gaa 文件或 URL 安装插件。"
                : "未找到任何内容。"}
            </div>
          )}
          <div className="grid cols-3">
            {filtered.map(a => (
              <div key={a.id} className="addon-card">
                <div className="head">
                  <div className="icon-wrap" style={{ background: "linear-gradient(135deg, #7a8cff, #6df5ff)" }}>{a.name[0]}</div>
                  <div>
                    <h3>{a.name}</h3>
                    <div className="meta">v{a.version}{a.author ? ` · ${a.author}` : ""}{a.tags?.length ? ` · ${a.tags.join(", ")}` : ""}</div>
                  </div>
                </div>
                <p>{a.description}</p>
                <div className="actions">
                  {a.installed
                    ? <button className="btn tiny ghost" onClick={() => void uninstall(a.id)}>删除</button>
                    : <button className="btn tiny primary" disabled={installing} onClick={() => void doInstall(a)}>安装</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "installed" && (
        <div className="grid cols-2">
          {installed.length === 0 && <div className="empty"><div className="em-icon">◉</div>尚未安装任何插件。</div>}
          {installed.map(it => (
            <InstalledAddonCard
              key={it.manifest.id}
              addon={it}
              onToggle={toggleEnabled}
              onUninstall={uninstall}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InstalledAddonCard({ addon, onToggle, onUninstall, onRefresh }: {
  addon: InstalledAddon;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onUninstall: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const toast = useStore(s => s.toast);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsValues, setSettingsValues] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  const settings = addon.manifest.settings ?? [];
  const hasSettings = settings.length > 0;

  const initSettings = useCallback(() => {
    const vals: Record<string, string | number | boolean> = {};
    for (const s of settings) {
      vals[s.key] = addon.settingsValues?.[s.key] ?? s.default ?? (s.type === "boolean" ? false : s.type === "number" ? 0 : "");
    }
    setSettingsValues(vals);
  }, [addon, settings]);

  useEffect(() => { initSettings(); }, [initSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      await api.updateAddonSettings(addon.manifest.id, settingsValues);
      toast("设置已保存", "success");
      setShowSettings(false);
      await onRefresh();
    } catch (e) {
      toast(`错误: ${(e as Error)?.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key: string, value: string | number | boolean) {
    setSettingsValues(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="addon-card">
      <div className="head">
        <div className="icon-wrap" style={{ background: "linear-gradient(135deg, #7a8cff, #6df5ff)" }}>{addon.manifest.name[0]}</div>
        <div>
          <h3>{addon.manifest.name}</h3>
          <div className="meta">v{addon.manifest.version} · {new Date(addon.installedAt).toLocaleDateString("zh-CN")} · {addon.source}</div>
        </div>
      </div>
      <p>{addon.manifest.description}</p>
      {addon.installedFiles?.length ? (
        <div className="meta" style={{ marginBottom: 6 }}>文件: {addon.installedFiles.join(", ")}</div>
      ) : null}
      <div className="actions">
        <label className="toggle">
          <input type="checkbox" checked={addon.enabled} onChange={(e) => void onToggle(addon.manifest.id, e.target.checked)} />
          <span className="track"><span className="knob" /></span>
          <span>{addon.enabled ? "已启用" : "已禁用"}</span>
        </label>
        {hasSettings && (
          <button className="btn tiny ghost" onClick={() => { setShowSettings(!showSettings); if (!showSettings) initSettings(); }}>设置</button>
        )}
        <button className="btn tiny danger" onClick={() => void onUninstall(addon.manifest.id)}>删除</button>
      </div>
      {showSettings && hasSettings && (
        <div className="addon-settings">
          {settings.map(s => (
            <AddonSettingField
              key={s.key}
              setting={s}
              value={settingsValues[s.key]}
              onChange={(v) => updateSetting(s.key, v)}
            />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn tiny primary" disabled={saving} onClick={() => void saveSettings()}>
              {saving ? "正在保存…" : "保存"}
            </button>
            <button className="btn tiny ghost" onClick={() => setShowSettings(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddonSettingField({ setting, value, onChange }: {
  setting: AddonSetting;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  return (
    <div className="form-row" style={{ marginBottom: 8 }}>
      <label>{setting.label}{setting.required ? " *" : ""}</label>
      {setting.type === "boolean" ? (
        <label className="toggle">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="track"><span className="knob" /></span>
        </label>
      ) : setting.type === "select" ? (
        <select className="select" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(setting.options ?? []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : setting.type === "number" ? (
        <input className="input" type="number" value={String(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
      ) : (
        <input className="input" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
      {setting.hint && <div className="hint">{setting.hint}</div>}
    </div>
  );
}
