import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api, type LLMPreset, type StagePreset, type CommunicationPreset } from "../lib/api";

export function ConfigurationPage() {
  const cfg = useStore(s => s.activeConfig);
  const draft = useStore(s => s.draft);
  const patch = useStore(s => s.patchDraft);
  const toast = useStore(s => s.toast);
  const setTab = useStore(s => s.setTab);
  const showSetupFlow = useStore(s => s.showSetupFlow);
  const refreshActive = useStore(s => s.refreshActive);

  const [llmPresets, setLLMPresets] = useState<LLMPreset[]>([]);
  const [stages, setStages] = useState<StagePreset[]>([]);
  const [comms, setComms] = useState<CommunicationPreset[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void api.listLLMPresets().then(r => setLLMPresets(r.presets));
    void api.listStages().then(r => setStages(r.stages));
    void api.listCommunicationPresets().then(r => setComms(r.presets));
  }, []);

  if (!cfg) {
    return (
      <div className="empty">
        <div className="em-icon">⚙</div>
        <div className="em-title">创建资料</div>
        <button className="btn primary" onClick={() => showSetupFlow(true)}>打开设置向导</button>
      </div>
    );
  }

  const merged = { ...cfg, ...(draft ?? {}) };

  function pf<K extends keyof typeof merged>(key: K, value: (typeof merged)[K]) {
    patch({ [key]: value } as any);
  }

  function pfDeep(path: string, value: unknown) {
    const parts = path.split(".");
    const head = parts[0]!;
    const sub = parts.slice(1).join(".");
    const current = (merged as any)[head] ?? {};
    if (sub) {
      patch({ [head]: { ...current, [sub]: value } } as any);
    } else {
      patch({ [head]: value } as any);
    }
  }

  async function genPersona() {
    if (!cfg) return;
    setGenerating(true);
    try {
      await api.generatePersona(cfg.slug, { name: merged.name, age: merged.age, nationality: merged.nationality, notes: merged.personaNotes });
      toast("人设已生成 — 请检查记忆文件", "success");
      await refreshActive();
      setTab("memory");
    } catch (e) {
      toast(`生成失败：${(e as Error)?.message}`, "error");
    } finally {
      setGenerating(false);
    }
  }

  async function testLLM() {
    if (!cfg) return;
    try {
      const r = await api.testLLM(cfg.slug);
      if (r.ok) toast(`LLM ok: ${r.reply ?? ""}`.slice(0, 100), "success");
      else toast(`LLM error: ${r.error}`, "error");
    } catch (e) {
      toast(`LLM test failed: ${(e as Error)?.message}`, "error");
    }
  }

  async function deleteProfile() {
    if (!cfg) return;
    if (!confirm(`确认永久删除资料 ${cfg.name} (${cfg.slug})？所有数据将被清除。`)) return;
    try {
      await api.deleteProfile(cfg.slug);
      toast("资料已删除", "success");
      window.location.reload();
    } catch (e) {
      toast(`删除失败：${(e as Error)?.message}`, "error");
    }
  }

  const llmPreset = llmPresets.find(p => p.id === merged.llm.presetId);
  const minor = merged.minorLlm ?? { enabled: false, sameAsMain: true, presetId: merged.llm.presetId, proto: merged.llm.proto, baseURL: merged.llm.baseURL, apiKey: merged.llm.apiKey, model: merged.llm.model };
  const minorPreset = llmPresets.find(p => p.id === minor.presetId);

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 920 }}>

      <div className="card">
        <div className="card-header">
          <div className="h-title">人设</div>
          <div className="h-meta">人设基础字段</div>
          <div className="h-actions">
            <button className="btn tiny" disabled={generating} onClick={() => void genPersona()}>{generating ? "生成中..." : "重新生成人设"}</button>
          </div>
        </div>
        <div className="grid cols-2">
          <div className="form-row"><label>姓名</label><input className="input" value={merged.name} onChange={e => pf("name", e.target.value)} /></div>
          <div className="form-row"><label>年龄</label><input type="number" className="input" min={18} max={45} value={merged.age} onChange={e => pf("age", Number(e.target.value))} /></div>
          <div className="form-row"><label>国籍</label>
            <select className="select" value={merged.nationality} onChange={e => pf("nationality", e.target.value as "CN" | "RU" | "UA")}>
              <option value="CN">中国</option>
              <option value="RU">俄罗斯</option>
              <option value="UA">乌克兰</option>
            </select>
          </div>
          <div className="form-row"><label>时区</label><input className="input" value={merged.tz} onChange={e => pf("tz", e.target.value)} placeholder="Europe/Moscow" /></div>
        </div>
        <div className="form-row">
          <label>人设备注（自由文本）</label>
          <textarea className="textarea" value={merged.personaNotes ?? ""} onChange={e => pf("personaNotes", e.target.value)} placeholder="例如：设计系学生，喜欢猫，爱玩视觉小说，从北京搬到了上海..." />
          <div className="hint">这些备注用于生成人设（persona.md / speech.md / communication.md）</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">连接方式</div>
          <div className="h-meta">连接模式与令牌</div>
        </div>
        <div className="form-row">
          <label>模式</label>
          <select className="select" value={merged.mode} onChange={e => pf("mode", e.target.value as "bot" | "userbot" | "web")}>
            <option value="web">web — 网页聊天（无需 Telegram，直接在浏览器里对话）</option>
            <option value="bot">bot — Bot API（需要 @BotFather 令牌）</option>
            <option value="userbot">userbot — MTProto（手机号；api_id/api_hash 可选）</option>
          </select>
          <div className="hint">{merged.mode === "web"
            ? "网页聊天模式：直接在 WebUI 的「聊天」标签页与她对话，无需 Telegram 账号。历史为临时性。"
            : merged.mode === "bot"
            ? "机器人只能向已通过 /start 添加它的用户发送消息。适合大多数场景。"
            : "Userbot 使用普通 TG 账号连接。可按用户名/手机号向所有人发送消息。请在自己的账号上使用。"}</div>
        </div>
        {merged.mode === "web" ? (
          <div className="form-row">
            <div className="hint" style={{ padding: "12px 16px", background: "var(--ga-card-2)", borderRadius: 8 }}>
              网页聊天模式不需要任何 Telegram 配置。保存后在左侧「聊天」标签页打开会话即可。
            </div>
          </div>
        ) : merged.mode === "bot" ? (
          <div className="grid cols-2">
            <div className="form-row">
              <label>Bot Token</label>
              <input className="input" type="password" value={merged.telegram?.botToken ?? ""} onChange={e => pfDeep("telegram.botToken", e.target.value)} placeholder="123456789:AAFxxxxxxxxx" />
              <div className="hint">在 <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> 通过 /newbot 命令获取</div>
            </div>
            <div className="form-row">
              <label>Bot API 端点（可选）</label>
              <input className="input" value={merged.telegram?.botApi?.apiRoot ?? ""} onChange={e => pfDeep("telegram.botApi", { ...(merged.telegram?.botApi ?? {}), apiRoot: e.target.value || undefined })} placeholder="https://api.telegram.org 或自定义反向代理" />
              <div className="hint">用于 Bot API 代理/本地服务器。可留空。</div>
            </div>
          </div>
        ) : (
          <div className="grid cols-2">
            <div className="form-row"><label>API ID（可选）</label><input className="input" value={merged.telegram?.apiId ?? ""} onChange={e => pfDeep("telegram.apiId", Number(e.target.value) || undefined)} placeholder="留空 = 作者代理" /></div>
            <div className="form-row"><label>API Hash（可选）</label><input className="input" type="password" value={merged.telegram?.apiHash ?? ""} onChange={e => pfDeep("telegram.apiHash", e.target.value || undefined)} placeholder="留空 = 作者代理" /></div>
            <div className="form-row"><label>手机号</label><input className="input" value={merged.telegram?.phone ?? ""} onChange={e => pfDeep("telegram.phone", e.target.value)} placeholder="+79..." /></div>
            <div className="form-row"><label>Session String（如有）</label><input className="input" type="password" value={merged.telegram?.sessionString ?? ""} onChange={e => pfDeep("telegram.sessionString", e.target.value)} /></div>
            <div className="hint" style={{ gridColumn: "1 / -1" }}>如果通过"作者代理"登录，请将 API ID/Hash 留空。</div>
          </div>
        )}
        <div className="grid cols-2">
          <div className="form-row">
            <label className="toggle">
              <input type="checkbox" checked={merged.telegram?.useWSS !== false} onChange={e => pfDeep("telegram.useWSS", e.target.checked)} />
              <span className="track"><span className="knob" /></span>
              <span>WSS（websocket，增强连接稳定性）</span>
            </label>
          </div>
          <div className="form-row">
            <label>代理（可选）</label>
            <input className="input" value={merged.telegram?.proxy ?? ""} onChange={e => pfDeep("telegram.proxy", e.target.value)} placeholder="tg://proxy?... 或 socks5://user:pass@host:port" />
          </div>
        </div>
        <div className="form-row">
          <label>Privacy</label>
          <select className="select" value={merged.privacy ?? "owner-only"} onChange={e => pf("privacy", e.target.value as "owner-only" | "allow-strangers")}>
            <option value="owner-only">仅限主人 — 只回复你（按 ownerId）</option>
            <option value="allow-strangers">所有人 — 回复任何发消息的人</option>
          </select>
        </div>
        <div className="form-row">
          <label>Owner ID (Telegram user id)</label>
          <input className="input" type="number" value={merged.ownerId ?? ""} onChange={e => pf("ownerId", Number(e.target.value) || undefined)} placeholder="向机器人发送 /start 以获取你的 ID" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">LLM</div>
          <div className="h-meta">模型与提供商</div>
          <div className="h-actions">
            <button className="btn tiny" onClick={() => void testLLM()}>测试连接</button>
          </div>
        </div>
        <div className="grid cols-2">
          <div className="form-row">
            <label>提供商（preset）</label>
            <select className="select" value={merged.llm.presetId} onChange={e => {
              const id = e.target.value;
              const p = llmPresets.find(x => x.id === id);
              if (p && !p.disabled) pf("llm", { presetId: p.id, proto: p.proto, baseURL: p.baseURL, apiKey: merged.llm.apiKey ?? "", model: p.defaultModel });
            }}>
              {llmPresets.map(p => (
                <option key={p.id} value={p.id} disabled={p.disabled}>
                  {p.name}{p.recommended ? " ★" : ""}{p.disabled ? ` — ${p.disabledReason ?? "不可用"}` : ""}
                </option>
              ))}
            </select>
            {llmPreset?.hint && <div className="hint">{llmPreset.hint}</div>}
          </div>
          <div className="form-row">
            <label>模型</label>
            {llmPreset?.models?.length ? (
              <select className="select" value={merged.llm.model} onChange={e => pfDeep("llm.model", e.target.value)}>
                {llmPreset.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="input" value={merged.llm.model} onChange={e => pfDeep("llm.model", e.target.value)} placeholder="模型名称" />
            )}
          </div>
          {llmPreset?.apiKeyRequired !== false && (
            <div className="form-row">
              <label>API Key</label>
              <input className="input" type="password" value={merged.llm.apiKey ?? ""} onChange={e => pfDeep("llm.apiKey", e.target.value)} />
            </div>
          )}
          {llmPreset?.custom && (
            <div className="form-row">
              <label>Base URL</label>
              <input className="input" value={merged.llm.baseURL ?? ""} onChange={e => pfDeep("llm.baseURL", e.target.value)} placeholder="https://..." />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">Minor LLM</div>
          <div className="h-meta">用于检查和辅助任务的廉价模型</div>
        </div>
        <div className="form-row">
          <label className="toggle">
            <input type="checkbox" checked={minor.enabled} onChange={e => pf("minorLlm", { ...minor, enabled: e.target.checked })} />
            <span className="track"><span className="knob" /></span>
            <span>使用 minor 模型</span>
          </label>
          <div className="hint">主模型继续撰写消息、日程和人设。Minor 目前用于发送前检查回复。</div>
        </div>
        {minor.enabled && (
          <>
            <div className="form-row">
              <label className="toggle">
                <input type="checkbox" checked={minor.sameAsMain !== false} onChange={e => pf("minorLlm", { ...minor, sameAsMain: e.target.checked })} />
                <span className="track"><span className="knob" /></span>
                <span>与主模型相同</span>
              </label>
            </div>
            {minor.sameAsMain === false && (
              <div className="grid cols-2">
                <div className="form-row">
                  <label>Minor 提供商</label>
                  <select className="select" value={minor.presetId} onChange={e => {
                    const id = e.target.value;
                    const p = llmPresets.find(x => x.id === id);
                    if (p && !p.disabled) pf("minorLlm", { ...minor, enabled: true, sameAsMain: false, presetId: p.id, proto: p.proto, baseURL: p.baseURL, apiKey: minor.apiKey ?? "", model: p.defaultModel });
                  }}>
                    {llmPresets.map(p => <option key={p.id} value={p.id} disabled={p.disabled}>{p.name}{p.disabled ? ` — ${p.disabledReason ?? "不可用"}` : ""}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label>Minor 模型</label>
                  {minorPreset?.models?.length ? (
                    <select className="select" value={minor.model} onChange={e => pf("minorLlm", { ...minor, model: e.target.value })}>
                      {minorPreset.models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={minor.model} onChange={e => pf("minorLlm", { ...minor, model: e.target.value })} placeholder="模型名称" />
                  )}
                </div>
                {minorPreset?.apiKeyRequired !== false && (
                  <div className="form-row">
                    <label>API Key minor</label>
                    <input className="input" type="password" value={minor.apiKey ?? ""} onChange={e => pf("minorLlm", { ...minor, apiKey: e.target.value })} />
                  </div>
                )}
                <div className="form-row">
                  <label>Base URL minor</label>
                  <input className="input" value={minor.baseURL ?? ""} onChange={e => pf("minorLlm", { ...minor, baseURL: e.target.value || undefined })} placeholder={minorPreset?.baseURL ?? "https://..."} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">关系阶段</div>
          <div className="h-meta">9 个等级：从"给了 TG"到"分手"</div>
        </div>
        <div className="form-row">
          <select className="select" value={merged.stage} onChange={e => pf("stage", e.target.value)}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.num}. {s.label}</option>)}
          </select>
          <div className="hint">{stages.find(s => s.id === merged.stage)?.description}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">交流风格</div>
          <div className="h-meta">汇总 4 个参数的预设</div>
        </div>
        <div className="grid cols-2">
          {comms.map(c => {
            const cur = merged.communication;
            const isMatch = cur && cur.notifications === c.profile.notifications && cur.messageStyle === c.profile.messageStyle && cur.initiative === c.profile.initiative && cur.lifeSharing === c.profile.lifeSharing;
            return (
              <div key={c.id} className={`card`} style={{ padding: 14, cursor: "pointer", borderColor: isMatch ? "var(--ga-accent)" : "var(--ga-border)", boxShadow: isMatch ? "0 0 0 1px var(--ga-accent) inset" : "none" }} onClick={() => pf("communication", c.profile as any)}>
                <strong>{c.label}</strong>
                <div className="hint" style={{ marginTop: 4 }}>{c.description}</div>
              </div>
            );
          })}
        </div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <label>忽略倾向：{merged.ignoreTendency ?? 35}%</label>
          <input type="range" className="range" min={0} max={100} value={merged.ignoreTendency ?? 35} onChange={e => pf("ignoreTendency", Number(e.target.value))} />
          <div className="hint">0% — 几乎不会无故忽略。100% — 非常冷淡。</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-title">睡眠</div>
        </div>
        <div className="grid cols-2">
          <div className="form-row"><label>入睡时间（小时）</label><input type="number" min={0} max={23} className="input" value={merged.sleepFrom} onChange={e => pf("sleepFrom", Number(e.target.value))} /></div>
          <div className="form-row"><label>起床时间（小时）</label><input type="number" min={0} max={23} className="input" value={merged.sleepTo} onChange={e => pf("sleepTo", Number(e.target.value))} /></div>
          <div className="form-row" style={{ gridColumn: "span 2" }}>
            <label>夜间回复概率：{Math.round((merged.nightWakeChance ?? 0) * 100)}%</label>
            <input type="range" min={0} max={100} className="range" value={Math.round((merged.nightWakeChance ?? 0) * 100)} onChange={e => pf("nightWakeChance", Number(e.target.value) / 100)} />
          </div>
        </div>
      </div>


      <div className="card" style={{ borderColor: "rgba(255, 122, 140, 0.3)" }}>
        <div className="card-header">
          <div className="h-title" style={{ color: "var(--ga-error)" }}>危险区域</div>
        </div>
        <div className="grid cols-2">
          <button className="btn danger" onClick={() => deleteProfile()}>删除资料</button>
          <button className="btn" onClick={() => sendCommand("amnesia", toast, cfg.slug)}>重置记忆</button>
        </div>
      </div>
    </div>
  );
}

async function sendCommand(cmd: string, toast: (t: string, k?: "success" | "error" | "info") => void, slug: string) {
  if (!confirm(`确认执行 :${cmd}？`)) return;
  try {
    const r = await api.sendCommand(slug, cmd);
    toast(r.text || `${cmd} ok`, "success");
  } catch (e) {
    toast(`${cmd}: ${(e as Error)?.message}`, "error");
  }
}
