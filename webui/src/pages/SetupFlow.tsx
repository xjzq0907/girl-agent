import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { api, type LLMPreset, type StagePreset, type CommunicationPreset, type ProfileConfig } from "../lib/api";
import { MIN_AGE, MAX_AGE, DEFAULT_AGE, clampAge } from "../lib/age-config";

const TOURNAMENT_ROUNDS = 12;

type TzZone = { iana: string; gmtWinter: string; city: string; country: string; aliases: string[]; group?: "CN" | "CIS" | "RU" };

interface DraftState {
  mode: "simple" | "advanced";
  step: number;
  // form
  name: string;
  age: number;
  nationality: "CN" | "RU" | "UA";
  tz: string;
  tgMode: "bot" | "userbot" | "web";
  botToken: string;
  botApiRoot: string;
  // userbot
  userbotMethod: "proxy" | "own";
  apiId: string;
  apiHash: string;
  phone: string;
  // login session refs
  loginToken?: string;
  loginSessionId?: string;
  code: string;
  password2fa: string;
  needs2fa: boolean;
  sessionString?: string;
  // llm
  llmPresetId: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseURL: string;
  minorEnabled: boolean;
  minorSameAsMain: boolean;
  minorPresetId: string;
  minorModel: string;
  minorApiKey: string;
  minorBaseURL: string;
  // misc
  stage: string;
  communicationId: string;
  ignoreTendency: number;
  sleepFrom: number;
  sleepTo: number;
  nightWakeChance: number;
  ownerId: string;
  privacy: "owner-only" | "allow-strangers";
  proxy: string;
  personaNotes: string;
  generating: boolean;
  generated: boolean;
  // ux
  sendingCode: boolean;
  verifying: boolean;
  tgError?: string;
}

const defaultDraft = (): DraftState => ({
  mode: "simple",
  step: 0,
  name: "",
  age: DEFAULT_AGE,
  nationality: "CN",
  tz: "Asia/Shanghai",
  tgMode: "bot",
  botToken: "",
  botApiRoot: "",
  userbotMethod: "proxy",
  apiId: "",
  apiHash: "",
  phone: "",
  code: "",
  password2fa: "",
  needs2fa: false,
  llmPresetId: "claudehub",
  llmModel: "claude-sonnet-4.6",
  llmApiKey: "",
  llmBaseURL: "",
  minorEnabled: false,
  minorSameAsMain: true,
  minorPresetId: "claudehub",
  minorModel: "claude-haiku-4.5",
  minorApiKey: "",
  minorBaseURL: "",
  stage: "tg-given-cold",
  communicationId: "normal",
  ignoreTendency: 35,
  sleepFrom: 23,
  sleepTo: 8,
  nightWakeChance: 0.05,
  ownerId: "",
  privacy: "owner-only",
  proxy: "",
  personaNotes: "",
  generating: false,
  generated: false,
  sendingCode: false,
  verifying: false
});

// 步骤。此处列出的所有步骤按顺序排列。当用户输入手机号码时，
// 动态添加 tg-userbot-code — 仅在确实需要时添加到"advanced"模式。
const SIMPLE_STEPS = ["mode", "tg", "tg-userbot-code", "llm", "persona", "ready", "generating"] as const;
const ADV_STEPS = ["mode", "name", "tg", "tg-userbot-code", "llm", "api-config", "stage", "comm", "sleep", "owner", "tz", "persona", "ready", "generating"] as const;

export function SetupFlow() {
  const showSetupFlow = useStore(s => s.showSetupFlow);
  const refreshProfiles = useStore(s => s.refreshProfiles);
  const selectProfile = useStore(s => s.selectProfile);
  const setTab = useStore(s => s.setTab);
  const toast = useStore(s => s.toast);

  const [d, setD] = useState<DraftState>(defaultDraft());
  const [llmPresets, setLLMPresets] = useState<LLMPreset[]>([]);
  const [stages, setStages] = useState<StagePreset[]>([]);
  const [comms, setComms] = useState<CommunicationPreset[]>([]);
  const [namePool, setNamePool] = useState<string[]>([]);
  const [tzZones, setTzZones] = useState<TzZone[]>([]);
  const [tzQuery, setTzQuery] = useState("");
  const [tzOpen, setTzOpen] = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // tournament state
  type TournamentState = {
    active: boolean;
    phase: "qualifier" | "knockout";
    round: number;
    pair: [string, string];
    qualifiers: string[];
    pool: string[];
    seen: Set<string>;
  };
  const [t, setT] = useState<TournamentState>({
    active: false, phase: "qualifier", round: 0, pair: ["", ""], qualifiers: [], pool: [], seen: new Set()
  });

  useEffect(() => {
    void api.listLLMPresets().then(r => setLLMPresets(r.presets));
    void api.listStages().then(r => setStages(r.stages));
    void api.listCommunicationPresets().then(r => setComms(r.presets));
    void api.listTimezones("").then(r => setTzZones(r.zones));
  }, []);

  useEffect(() => {
    void api.pickNames(d.nationality, 8).then(r => {
      setNamePool(r.names);
      if (!d.name && r.names.length) setD(s => ({ ...s, name: r.names[0] }));
    });
    // 如果尚未选择时区 — 使用国籍的默认值。
    if (d.tz === "Europe/Moscow" && d.nationality === "UA") setD(s => ({ ...s, tz: "Europe/Kyiv" }));
  }, [d.nationality]);

  useEffect(() => {
    // 点击外部时关闭时区下拉菜单。
    function onDocClick(e: MouseEvent) {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // 动态收集步骤列表：仅在 userbot 模式下包含 tg-userbot-code。
  const stepIds = useMemo(() => {
    const list = (d.mode === "advanced" ? ADV_STEPS : SIMPLE_STEPS) as readonly string[];
    return list.filter(s => {
      if (s === "tg-userbot-code") return d.tgMode === "userbot" && !d.sessionString;
      if (s === "api-config") return d.mode === "advanced";
      return true;
    });
  }, [d.mode, d.tgMode, d.sessionString]);

  const totalSteps = stepIds.length;
  const currentStep = stepIds[d.step] ?? "ready";

  const canNext = useMemo(() => stepValid(currentStep, d), [currentStep, d]);

  function set<K extends keyof DraftState>(k: K, v: DraftState[K]) {
    setD(prev => ({ ...prev, [k]: v }));
  }

  function patch(p: Partial<DraftState>) {
    setD(prev => ({ ...prev, ...p }));
  }

  // === Tournament ===
  function pickPair(exclude: Set<string>, pool: string[]): [string, string] | null {
    const avail = pool.filter(n => !exclude.has(n));
    if (avail.length < 2) return null;
    const a = avail[Math.floor(Math.random() * avail.length)]!;
    let b = avail[Math.floor(Math.random() * avail.length)]!;
    while (b === a) b = avail[Math.floor(Math.random() * avail.length)]!;
    return [a, b];
  }

  async function startTournament() {
    try {
      // 获取 24 个名字用于高质量锦标赛
      const r = await api.pickNames(d.nationality, 24);
      const pool = r.names;
      const pair = pickPair(new Set(), pool);
      if (!pair) {
        toast("无法收集名字池", "error");
        return;
      }
      const seen = new Set([pair[0], pair[1]]);
      setT({ active: true, phase: "qualifier", round: 0, pair, qualifiers: [], pool, seen });
    } catch (e) {
      toast(`无法启动锦标赛: ${(e as Error)?.message}`, "error");
    }
  }

  function pickWinner(winner: string) {
    if (t.phase === "qualifier") {
      const qualifiers = [...t.qualifiers, winner];
      const nextRound = t.round + 1;
      if (nextRound >= TOURNAMENT_ROUNDS || qualifiers.length >= 8) {
        // 进入淘汰赛（或直接决赛）。
        if (qualifiers.length === 1) {
          set("name", qualifiers[0]!);
          setT({ active: false, phase: "qualifier", round: 0, pair: ["", ""], qualifiers: [], pool: [], seen: new Set() });
          return;
        }
        const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
        const koPair: [string, string] = [shuffled[0]!, shuffled[1]!];
        setT(s => ({ ...s, phase: "knockout", round: 0, pair: koPair, qualifiers, pool: shuffled, seen: new Set(shuffled) }));
        return;
      }
      const seen = new Set([...t.seen, winner]);
      const next = pickPair(seen, t.pool) ?? pickPair(new Set(), t.pool);
      if (!next) {
        // 池不够用 — 决赛
        if (qualifiers.length === 1) set("name", qualifiers[0]!);
        else if (qualifiers.length > 1) {
          setT(s => ({ ...s, phase: "knockout", round: 0, pair: [qualifiers[0]!, qualifiers[1]!], qualifiers, pool: qualifiers, seen: new Set(qualifiers) }));
        }
        return;
      }
      setT({ active: true, phase: "qualifier", round: nextRound, pair: next, qualifiers, pool: t.pool, seen });
    } else {
      // knockout
      const loser = t.pair[0] === winner ? t.pair[1] : t.pair[0];
      const nextPool = t.pool.filter(n => n !== loser);
      if (nextPool.length <= 1) {
        set("name", nextPool[0] ?? winner);
        setT({ active: false, phase: "qualifier", round: 0, pair: ["", ""], qualifiers: [], pool: [], seen: new Set() });
        return;
      }
      const shuffled = [...nextPool].sort(() => Math.random() - 0.5);
      setT(s => ({ ...s, round: s.round + 1, pair: [shuffled[0]!, shuffled[1]!], pool: nextPool }));
    }
  }

  function skipPair() {
    const next = pickPair(t.seen, t.pool) ?? pickPair(new Set(), t.pool);
    if (next) setT(s => ({ ...s, pair: next, seen: new Set([...s.seen, next[0], next[1]]) }));
  }

  // === userbot login ===
  async function sendCode() {
    if (d.sendingCode) return;
    patch({ sendingCode: true, tgError: undefined });
    try {
      const useRemote = d.userbotMethod === "proxy";
      const apiId = useRemote ? undefined : Number(d.apiId);
      const apiHash = useRemote ? undefined : d.apiHash;
      const r = await api.tgSendCode({ phone: d.phone, useRemote, apiId, apiHash, proxy: d.proxy || undefined });
      patch({ loginToken: r.loginToken, loginSessionId: r.sessionId, sendingCode: false });
      toast("验证码已发送到 Telegram", "success");
    } catch (e) {
      patch({ sendingCode: false, tgError: (e as Error)?.message });
      toast(`无法发送验证码: ${(e as Error)?.message}`, "error");
    }
  }

  async function verifyCode() {
    if (d.verifying) return;
    patch({ verifying: true, tgError: undefined });
    try {
      const r = await api.tgVerifyCode({ code: d.code, loginToken: d.loginToken, sessionId: d.loginSessionId });
      if (r.needs2fa) {
        patch({ needs2fa: true, loginToken: r.loginToken, loginSessionId: r.sessionId, verifying: false });
        toast("请输入 Telegram 云密码（2FA）", "info");
        return;
      }
      if (r.sessionString) {
        patch({
          sessionString: r.sessionString,
          apiId: r.apiId ? String(r.apiId) : d.apiId,
          apiHash: r.apiHash ?? d.apiHash,
          verifying: false,
          needs2fa: false
        });
        toast("登录成功", "success");
      }
    } catch (e) {
      patch({ verifying: false, tgError: (e as Error)?.message });
      toast(`验证码错误: ${(e as Error)?.message}`, "error");
    }
  }

  async function verify2fa() {
    if (d.verifying) return;
    patch({ verifying: true, tgError: undefined });
    try {
      const r = await api.tgVerifyPassword({ password: d.password2fa, loginToken: d.loginToken, sessionId: d.loginSessionId });
      patch({
        sessionString: r.sessionString,
        apiId: r.apiId ? String(r.apiId) : d.apiId,
        apiHash: r.apiHash ?? d.apiHash,
        verifying: false,
        needs2fa: false
      });
      toast("登录成功", "success");
    } catch (e) {
      patch({ verifying: false, tgError: (e as Error)?.message });
      toast(`密码错误: ${(e as Error)?.message}`, "error");
    }
  }

  async function createProfile(): Promise<ProfileConfig | null> {
    if (savingProfile) return null;
    setSavingProfile(true);
    try {
      const llmPreset = llmPresets.find(p => p.id === d.llmPresetId);
      const minorPreset = llmPresets.find(p => p.id === d.minorPresetId);
      const comm = comms.find(c => c.id === d.communicationId);
      const tgConfig: ProfileConfig["telegram"] = d.tgMode === "web"
        ? {}
        : d.tgMode === "bot"
        ? { botToken: d.botToken, useWSS: true, proxy: d.proxy || undefined, botApi: d.botApiRoot ? { apiRoot: d.botApiRoot } : undefined }
        : {
            apiId: d.apiId ? Number(d.apiId) : undefined,
            apiHash: d.apiHash || undefined,
            phone: d.phone || undefined,
            sessionString: d.sessionString || undefined,
            useWSS: true,
            proxy: d.proxy || undefined
          };
      const data: Partial<ProfileConfig> = {
        name: d.name,
        age: d.age,
        nationality: d.nationality,
        tz: d.tz,
        mode: d.tgMode,
        stage: d.stage,
        privacy: d.privacy,
        ownerId: d.ownerId ? Number(d.ownerId) : undefined,
        personaNotes: d.personaNotes || undefined,
        ignoreTendency: d.ignoreTendency,
        sleepFrom: d.sleepFrom,
        sleepTo: d.sleepTo,
        nightWakeChance: d.nightWakeChance,
        communication: comm?.profile,
        telegram: tgConfig,
        llm: {
          presetId: d.llmPresetId,
          proto: llmPreset?.proto ?? "openai",
          baseURL: d.llmBaseURL || llmPreset?.baseURL,
          model: d.llmModel || llmPreset?.defaultModel || "",
          apiKey: d.llmApiKey
        },
        minorLlm: d.minorEnabled ? {
          enabled: true,
          sameAsMain: d.minorSameAsMain,
          presetId: d.minorSameAsMain ? d.llmPresetId : d.minorPresetId,
          proto: d.minorSameAsMain ? (llmPreset?.proto ?? "openai") : (minorPreset?.proto ?? "openai"),
          baseURL: d.minorSameAsMain ? (d.llmBaseURL || llmPreset?.baseURL) : (d.minorBaseURL || minorPreset?.baseURL),
          model: d.minorSameAsMain ? (d.llmModel || llmPreset?.defaultModel || "") : (d.minorModel || minorPreset?.defaultModel || ""),
          apiKey: d.minorSameAsMain ? d.llmApiKey : d.minorApiKey
        } : undefined
      };
      const r = await api.createProfile(data);
      return r.config;
    } catch (e) {
      toast(`创建失败: ${(e as Error)?.message}`, "error");
      return null;
    } finally {
      setSavingProfile(false);
    }
  }

  async function generatePersona(slug: string) {
    set("generating", true);
    try {
      await Promise.race([
        api.generatePersona(slug, { name: d.name, age: d.age, nationality: d.nationality, notes: d.personaNotes }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("生成超时")), 120_000))
      ]);
      set("generated", true);
      toast("人设已生成", "success");
    } catch (e) {
      toast(`生成失败，已使用基础人设创建: ${(e as Error)?.message}`, "error");
      set("generated", true);
    } finally {
      set("generating", false);
    }
  }

  async function startGeneration() {
    const cfg = await createProfile();
    if (!cfg) return;
    await refreshProfiles();
    await selectProfile(cfg.slug);
    // 进入「生成中」步骤并开始生成
    await generatePersona(cfg.slug);
    try {
      await api.applyProfile(cfg.slug);
      toast("运行时已启动", "success");
    } catch (e) {
      toast(`启动失败 — 请检查 Token: ${(e as Error)?.message}`, "error");
    }
  }

  function finishAndClose() {
    showSetupFlow(false);
    setTab("logs");
  }

  function next() {
    if (d.step < totalSteps - 1) {
      const nextStep = stepIds[d.step + 1];
      if (nextStep === "generating") {
        set("step", d.step + 1);
        void startGeneration();
      } else {
        set("step", d.step + 1);
      }
    } else {
      finishAndClose();
    }
  }

  function back() {
    if (d.step > 0) set("step", d.step - 1);
  }

  // === tz dropdown ===
  const tzFiltered = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return tzZones;
    return tzZones.filter(t => {
      if (t.iana.toLowerCase().includes(q)) return true;
      if (t.city.toLowerCase().includes(q)) return true;
      if (t.country.toLowerCase().includes(q)) return true;
      return t.aliases.some(a => a.toLowerCase().includes(q));
    });
  }, [tzZones, tzQuery]);

  // 分组显示，更美观
  const tzGroups = useMemo(() => {
    const groups: { group: "CN" | "CIS" | "RU" | "other"; zones: TzZone[] }[] = [];
    const map = new Map<string, TzZone[]>();
    for (const z of tzFiltered) {
      const g = z.group ?? "other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(z);
    }
    for (const g of ["CN", "CIS", "RU", "other"] as const) {
      const zs = map.get(g);
      if (zs && zs.length) groups.push({ group: g as any, zones: zs });
    }
    return groups;
  }, [tzFiltered]);

  const selectedTz = tzZones.find(z => z.iana === d.tz);

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <div className="setup-stepper">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className={`setup-step ${i < d.step ? "done" : ""} ${i === d.step ? "active" : ""}`} />
          ))}
        </div>

        {currentStep === "mode" && (
          <>
            <h1 className="setup-title">你好 👋</h1>
            <p className="setup-subtitle">正在创建你的第一个个人资料。选择设置格式。</p>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className={`provider-card ${d.mode === "simple" ? "active" : ""}`} onClick={() => set("mode", "simple")}>
                <div className="p-name">简单</div>
                <div className="p-hint">约 3 分钟，5 个步骤。自动设置名字和时区。</div>
              </div>
              <div className={`provider-card ${d.mode === "advanced" ? "active" : ""}`} onClick={() => set("mode", "advanced")}>
                <div className="p-name">详细</div>
                <div className="p-hint">约 7 分钟。完全控制：睡眠、沟通、owner、代理、备注。</div>
              </div>
            </div>
          </>
        )}

        {currentStep === "name" && (
          <>
            <h1 className="setup-title">名字和年龄</h1>
            <p className="setup-subtitle">这是将要给你发消息的 AI 女友。</p>
            <div className="grid cols-2">
              <div className="form-row">
                <label>国籍</label>
                <select className="select" value={d.nationality} onChange={e => set("nationality", e.target.value as "CN" | "RU" | "UA")}>
                  <option value="CN">中国</option>
                  <option value="RU">俄罗斯</option>
                  <option value="UA">乌克兰</option>
                </select>
              </div>
              <div className="form-row">
                <label>年龄</label>
                <div className="age-slider-wrap">
                  <div className="age-slider-value">{d.age}<span className="age-unit">岁</span></div>
                  <input type="range" min={MIN_AGE} max={MAX_AGE} className="range" value={d.age} onChange={e => set("age", clampAge(Number(e.target.value)))} />
                  <div className="age-slider-bounds"><span>{MIN_AGE}</span><span>{MAX_AGE}</span></div>
                </div>
              </div>
            </div>

            {!t.active ? (
              <>
                <div className="form-row">
                  <label>名字</label>
                  <input className="input" value={d.name} onChange={e => set("name", e.target.value)} placeholder="例如：小美" />
                </div>
                {namePool.length > 0 && (
                  <div className="form-row">
                    <label>随机名字</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {namePool.map(n => (
                        <button key={n} className="btn tiny ghost" onClick={() => set("name", n)}>{n}</button>
                      ))}
                      <button className="btn tiny ghost" onClick={() => { void api.pickNames(d.nationality, 8).then(r => setNamePool(r.names)); }}>↻ 更多</button>
                    </div>
                  </div>
                )}
                <div className="form-row">
                  <button className="btn ghost" onClick={() => void startTournament()}>🎲 名字锦标赛 — 将显示成对的名字，凭直觉选择</button>
                </div>
              </>
            ) : (
              <div className="tournament-shell">
                <div className="tournament-progress">
                  {Array.from({ length: t.phase === "qualifier" ? TOURNAMENT_ROUNDS : Math.max(t.pool.length - 1, 1) }, (_, i) => (
                    <div key={i} className={`dot ${i < t.round ? "done" : ""} ${i === t.round ? "active" : ""}`} />
                  ))}
                </div>
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                  {t.phase === "qualifier" ? `预选赛 ${t.round + 1}/${TOURNAMENT_ROUNDS}` : `⚔ 淘汰赛 · 剩余 ${t.pool.length}`}
                </div>
                <div className="tournament-pair">
                  <div className="tournament-name-card" onClick={() => pickWinner(t.pair[0])}>{t.pair[0]}</div>
                  <div className="tournament-name-card" onClick={() => pickWinner(t.pair[1])}>{t.pair[1]}</div>
                </div>
                {t.phase === "qualifier" && (
                  <div className="tournament-skip" onClick={skipPair}>↻ 两个都不要 — 下一对</div>
                )}
                <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
                  晋级: {t.qualifiers.join(", ") || "—"}
                </div>
                <div style={{ textAlign: "center" }}>
                  <button className="btn ghost tiny" onClick={() => setT({ active: false, phase: "qualifier", round: 0, pair: ["", ""], qualifiers: [], pool: [], seen: new Set() })}>
                    取消
                  </button>
                </div>
              </div>
            )}
            <div className="form-row">
              <label>代理（可选）</label>
              <input className="input" value={d.proxy} onChange={e => set("proxy", e.target.value)} placeholder="socks5://user:pass@host:port 或 tg://proxy?..." />
              <div className="hint">SOCKS 适用于 bot/userbot，MTProxy 仅适用于 userbot。</div>
            </div>
          </>
        )}

        {currentStep === "tg" && (
          <>
            <h1 className="setup-title">连接方式</h1>
            <p className="setup-subtitle">选择 AI 女友如何接收和回复消息。</p>
            <div className="form-row">
              <label>模式</label>
              <div className="provider-grid">
                <div className={`provider-card ${d.tgMode === "web" ? "active" : ""}`} onClick={() => set("tgMode", "web")}>
                  <div className="p-name">网页聊天</div>
                  <div className="p-hint">不需要 Telegram 账号。直接在浏览器里聊。</div>
                  {d.tgMode === "web" && <div className="p-rec">REC</div>}
                </div>
                <div className={`provider-card ${d.tgMode === "bot" ? "active" : ""}`} onClick={() => set("tgMode", "bot")}>
                  <div className="p-name">Telegram Bot</div>
                  <div className="p-hint">需要 @BotFather 的 Token。无需手机号。</div>
                </div>
                <div className={`provider-card ${d.tgMode === "userbot" ? "active" : ""}`} onClick={() => set("tgMode", "userbot")}>
                  <div className="p-name">Userbot</div>
                  <div className="p-hint">作为普通 TG 账户登录。需要手机号 + 验证码。</div>
                </div>
              </div>
            </div>
            {d.tgMode === "web" && (
              <div className="form-row">
                <div className="hint" style={{ padding: "12px 16px", background: "var(--ga-card-2)", borderRadius: 8 }}>
                  无需任何 Telegram 配置。创建资料后，在左侧「聊天」标签页打开会话即可开始对话。
                </div>
              </div>
            )}
            {d.tgMode === "bot" ? (
              <div className="grid cols-2">
                <div className="form-row">
                  <label>Bot Token</label>
                  <input className="input" type="password" value={d.botToken} onChange={e => set("botToken", e.target.value)} placeholder="123456789:AAFxxxxxxxxx" />
                  <div className="hint">
                    1. 打开 <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a><br />
                    2. 发送 /newbot，创建名字和 username<br />
                    3. 将 Token 粘贴到这里
                  </div>
                </div>
                <div className="form-row">
                  <label>Bot API 端点（可选）</label>
                  <input className="input" value={d.botApiRoot} onChange={e => set("botApiRoot", e.target.value)} placeholder="https://api.telegram.org 或自建 reverse proxy" />
                  <div className="hint">如果 Telegram Bot API 被封锁 — 填入你自己的 proxy/本地 Bot API 端点。</div>
                </div>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label>登录方式</label>
                  <div className="grid cols-2" style={{ gap: 8 }}>
                    <div className={`provider-card ${d.userbotMethod === "proxy" ? "active" : ""}`} onClick={() => set("userbotMethod", "proxy")}>
                      <div className="p-name">通过官方代理</div>
                      <div className="p-hint">无需自备 api_id/api_hash — 使用服务器代理。</div>
                      {d.userbotMethod === "proxy" && <div className="p-rec">REC</div>}
                    </div>
                    <div className={`provider-card ${d.userbotMethod === "own" ? "active" : ""}`} onClick={() => set("userbotMethod", "own")}>
                      <div className="p-name">自有 api_id/hash</div>
                      <div className="p-hint">前往 my.telegram.org → API Development tools 获取。</div>
                    </div>
                  </div>
                </div>
                {d.userbotMethod === "own" && (
                  <div className="grid cols-2">
                    <div className="form-row"><label>API ID</label><input className="input" value={d.apiId} onChange={e => set("apiId", e.target.value)} /></div>
                    <div className="form-row"><label>API Hash</label><input className="input" type="password" value={d.apiHash} onChange={e => set("apiHash", e.target.value)} /></div>
                  </div>
                )}
                <div className="form-row">
                  <label>手机号</label>
                  <input className="input" value={d.phone} onChange={e => set("phone", e.target.value)} placeholder="+86..." />
                  <div className="hint">下一步将收到 Telegram 验证码。</div>
                </div>
              </>
            )}
          </>
        )}

        {currentStep === "tg-userbot-code" && (
          <>
            <h1 className="setup-title">Telegram 验证码</h1>
            <p className="setup-subtitle">正在向号码 <strong>{d.phone}</strong> 发送验证码。</p>

            {!d.loginToken && !d.loginSessionId ? (
              <div className="form-row">
                <button className="btn primary" onClick={() => void sendCode()} disabled={d.sendingCode || !d.phone}>
                  {d.sendingCode ? "正在发送…" : "发送验证码"}
                </button>
                {d.tgError && <div className="hint" style={{ color: "var(--accent)" }}>{d.tgError}</div>}
              </div>
            ) : !d.needs2fa ? (
              <>
                <div className="form-row">
                  <label>Telegram 验证码（5 位数字）</label>
                  <input className="code-input" inputMode="numeric" maxLength={6} value={d.code} onChange={e => set("code", e.target.value.replace(/\D/g, ""))} placeholder="12345" />
                </div>
                <div className="form-row" style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" onClick={() => void verifyCode()} disabled={d.verifying || d.code.length < 4}>
                    {d.verifying ? "正在验证…" : "确认"}
                  </button>
                  <button className="btn ghost" onClick={() => { patch({ loginToken: undefined, loginSessionId: undefined, code: "", needs2fa: false }); }}>重新发送</button>
                </div>
                {d.tgError && <div className="hint" style={{ color: "var(--accent)" }}>{d.tgError}</div>}
              </>
            ) : (
              <>
                <div className="form-row">
                  <label>Telegram 云密码（2FA）</label>
                  <input className="input" type="password" value={d.password2fa} onChange={e => set("password2fa", e.target.value)} placeholder="••••••" />
                </div>
                <button className="btn primary" onClick={() => void verify2fa()} disabled={d.verifying || !d.password2fa}>
                  {d.verifying ? "正在验证…" : "登录"}
                </button>
                {d.tgError && <div className="hint" style={{ color: "var(--accent)" }}>{d.tgError}</div>}
              </>
            )}
          </>
        )}

        {currentStep === "llm" && (
          <>
            <h1 className="setup-title">LLM 服务商</h1>
            <p className="setup-subtitle">AI 女友的「大脑」。国内推荐使用 ClaudeHub。</p>
            <div className="form-row">
              <label>服务商</label>
              <div className="provider-grid">
                {llmPresets.map(p => (
                  <div
                    key={p.id}
                    className={`provider-card ${d.llmPresetId === p.id ? "active" : ""} ${p.disabled ? "disabled" : ""}`}
                    onClick={() => {
                      if (p.disabled) return;
                      patch({ llmPresetId: p.id, llmModel: p.defaultModel, llmBaseURL: p.baseURL ?? "" });
                    }}
                  >
                    <div className="p-name">{p.name}</div>
                    <div className="p-hint">{p.hint ?? (p.disabled ? p.disabledReason : "")}</div>
                    {p.recommended && !p.disabled && <div className="p-rec">REC</div>}
                    {p.disabled && <div className="p-tag">N/A</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>模型</label>
              {(() => {
                const p = llmPresets.find(x => x.id === d.llmPresetId);
                return p?.models?.length
                  ? <select className="select" value={d.llmModel} onChange={e => set("llmModel", e.target.value)}>{p.models.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  : <input className="input" value={d.llmModel} onChange={e => set("llmModel", e.target.value)} />;
              })()}
            </div>
            {(llmPresets.find(p => p.id === d.llmPresetId)?.apiKeyRequired !== false) && (
              <div className="form-row">
                <label>API Key</label>
                <input className="input" type="password" value={d.llmApiKey} onChange={e => set("llmApiKey", e.target.value)} />
              </div>
            )}
            {(llmPresets.find(p => p.id === d.llmPresetId)?.custom) && (
              <div className="form-row">
                <label>Base URL</label>
                <input className="input" value={d.llmBaseURL} onChange={e => set("llmBaseURL", e.target.value)} placeholder="https://..." />
              </div>
            )}
            <div className="form-row">
              <label className="toggle">
                <input type="checkbox" checked={d.minorEnabled} onChange={e => set("minorEnabled", e.target.checked)} />
                <span className="track"><span className="knob" /></span>
                <span>添加 minor 模型用于辅助检查</span>
              </label>
              <div className="hint">节省主模型余额：可使用廉价模型执行回复检查。</div>
            </div>
            {d.minorEnabled && (
              <>
                <div className="form-row">
                  <label className="toggle">
                    <input type="checkbox" checked={d.minorSameAsMain} onChange={e => set("minorSameAsMain", e.target.checked)} />
                    <span className="track"><span className="knob" /></span>
                    <span>Minor 与主模型相同</span>
                  </label>
                </div>
                {!d.minorSameAsMain && (
                  <div className="grid cols-2">
                    <div className="form-row">
                      <label>Minor provider</label>
                      <select className="select" value={d.minorPresetId} onChange={e => {
                        const p = llmPresets.find(x => x.id === e.target.value);
                        if (p && !p.disabled) patch({ minorPresetId: p.id, minorModel: p.defaultModel, minorBaseURL: p.baseURL ?? "" });
                      }}>
                        {llmPresets.map(p => <option key={p.id} value={p.id} disabled={p.disabled}>{p.name}{p.disabled ? ` — ${p.disabledReason ?? "不可用"}` : ""}</option>)}
                      </select>
                    </div>
                    <div className="form-row">
                      <label>Minor model</label>
                      {(() => {
                        const p = llmPresets.find(x => x.id === d.minorPresetId);
                        return p?.models?.length
                          ? <select className="select" value={d.minorModel} onChange={e => set("minorModel", e.target.value)}>{p.models.map(m => <option key={m} value={m}>{m}</option>)}</select>
                          : <input className="input" value={d.minorModel} onChange={e => set("minorModel", e.target.value)} />;
                      })()}
                    </div>
                    <div className="form-row">
                      <label>Minor API Key</label>
                      <input className="input" type="password" value={d.minorApiKey} onChange={e => set("minorApiKey", e.target.value)} />
                    </div>
                    <div className="form-row">
                      <label>Minor Base URL</label>
                      <input className="input" value={d.minorBaseURL} onChange={e => set("minorBaseURL", e.target.value)} placeholder={llmPresets.find(p => p.id === d.minorPresetId)?.baseURL ?? "https://..."} />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {currentStep === "api-config" && (
          <>
            <h1 className="setup-title">API 设置</h1>
            <p className="setup-subtitle">连接到 {llmPresets.find(p => p.id === d.llmPresetId)?.name ?? d.llmPresetId} 的详细设置。</p>
            <div className="form-row">
              <label>模型</label>
              {(() => {
                const p = llmPresets.find(x => x.id === d.llmPresetId);
                return p?.models?.length
                  ? <select className="select" value={d.llmModel} onChange={e => set("llmModel", e.target.value)}>{p.models.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  : <input className="input" value={d.llmModel} onChange={e => set("llmModel", e.target.value)} placeholder="claude-sonnet-4.6, gpt-4o, 等等" />;
              })()}
            </div>
            <div className="form-row">
              <label>API Key</label>
              <input className="input" type="password" value={d.llmApiKey} onChange={e => set("llmApiKey", e.target.value)} placeholder="sk-..." />
              <div className="hint">服务商的 API 密钥。ClaudeHub 不需要密钥。</div>
            </div>
            <div className="form-row">
              <label>Base URL</label>
              <input className="input" value={d.llmBaseURL} onChange={e => set("llmBaseURL", e.target.value)} placeholder={llmPresets.find(p => p.id === d.llmPresetId)?.baseURL ?? "https://api.openai.com/v1"} />
              <div className="hint">API 端点 URL。留空则使用服务商默认值。</div>
            </div>
            <div className="form-row">
              <label>协议</label>
              <div style={{ display: "flex", gap: 8 }}>
                <div className={`provider-card ${(llmPresets.find(p => p.id === d.llmPresetId)?.proto ?? "openai") === "openai" ? "active" : ""}`} style={{ flex: 1, cursor: "default" }}>
                  <div className="p-name">{llmPresets.find(p => p.id === d.llmPresetId)?.proto ?? "openai"}</div>
                  <div className="p-hint">由服务商决定</div>
                </div>
              </div>
            </div>
          </>
        )}

        {currentStep === "stage" && (
          <>
            <h1 className="setup-title">关系阶段</h1>
            <p className="setup-subtitle">共 9 个阶段 — 从「刚交换了联系方式」到「在一起很久了」。</p>
            <div className="form-row">
              <select className="select" value={d.stage} onChange={e => set("stage", e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.num}. {s.label}</option>)}
              </select>
              <div className="hint">{stages.find(s => s.id === d.stage)?.description}</div>
            </div>
          </>
        )}

        {currentStep === "comm" && (
          <>
            <h1 className="setup-title">沟通风格</h1>
            <p className="setup-subtitle">AI 女友的性格特点。</p>
            <div className="provider-grid">
              {comms.map(c => (
                <div key={c.id} className={`provider-card ${d.communicationId === c.id ? "active" : ""}`} onClick={() => set("communicationId", c.id)}>
                  <div className="p-name">{c.label}</div>
                  <div className="p-hint">{c.description}</div>
                </div>
              ))}
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <label>忽视倾向: {d.ignoreTendency}%</label>
              <input type="range" min={0} max={100} className="range" value={d.ignoreTendency} onChange={e => set("ignoreTendency", Number(e.target.value))} />
              <div className="hint">越高则越频繁忽略消息、延迟回复。</div>
            </div>
          </>
        )}

        {currentStep === "sleep" && (
          <>
            <h1 className="setup-title">作息时间</h1>
            <p className="setup-subtitle">设定她睡觉和不回复的时间。</p>
            <div className="grid cols-2">
              <div className="form-row">
                <label>入睡时间: {d.sleepFrom}:00</label>
                <input type="range" min={20} max={26} className="range" value={d.sleepFrom < 12 ? d.sleepFrom + 24 : d.sleepFrom} onChange={e => set("sleepFrom", Number(e.target.value) % 24)} />
                <div className="hint">通常 23–02 点</div>
              </div>
              <div className="form-row">
                <label>醒来时间: {d.sleepTo}:00</label>
                <input type="range" min={5} max={12} className="range" value={d.sleepTo} onChange={e => set("sleepTo", Number(e.target.value))} />
                <div className="hint">通常 7–10 点</div>
              </div>
            </div>
            <div className="form-row">
              <label>「半夜醒来」概率: {Math.round(d.nightWakeChance * 100)}%</label>
              <input type="range" min={0} max={20} className="range" value={Math.round(d.nightWakeChance * 100)} onChange={e => set("nightWakeChance", Number(e.target.value) / 100)} />
            </div>
          </>
        )}

        {currentStep === "owner" && (
          <>
            <h1 className="setup-title">回复对象</h1>
            <p className="setup-subtitle">确保 Bot 不会回复陌生人。</p>
            <div className="form-row">
              <label>Privacy</label>
              <select className="select" value={d.privacy} onChange={e => set("privacy", e.target.value as "owner-only" | "allow-strangers")}>
                <option value="owner-only">仅主人</option>
                <option value="allow-strangers">所有人</option>
              </select>
            </div>
            <div className="form-row">
              <label>Owner Telegram ID</label>
              <input className="input" type="number" value={d.ownerId} onChange={e => set("ownerId", e.target.value)} placeholder="向 Bot 发送 /start 即可获取" />
              <div className="hint">可留空：第一次发送 /start 时 Bot 会自动提示你的 ID。</div>
            </div>
            {d.tgMode === "userbot" && (
              <div className="form-row">
                <label>Userbot 代理（可选）</label>
                <input className="input" value={d.proxy} onChange={e => set("proxy", e.target.value)} placeholder="tg://proxy?... 或 socks5://login:pass@host:port" />
                <div className="hint">支持 tg://proxy、socks5:// 和 socks4://。留空且设置了 GIRL_AGENT_TG_PROXY 环境变量时，将使用环境变量的值。</div>
              </div>
            )}
          </>
        )}

        {currentStep === "tz" && (
          <>
            <h1 className="setup-title">时区</h1>
            <p className="setup-subtitle">确保她的活跃时间和睡眠时间与你同步。</p>
            <div className="form-row">
              <div className="tz-dropdown" ref={tzRef}>
                <div className="tz-input" onClick={() => setTzOpen(!tzOpen)}>
                  {selectedTz
                    ? <><span className="tz-city">{selectedTz.city}, {selectedTz.country}</span><span className="tz-gmt">{selectedTz.gmtWinter} · {selectedTz.iana}</span></>
                    : <span style={{ color: "var(--muted)" }}>选择城市…</span>
                  }
                </div>
                {tzOpen && (
                  <div className="tz-list">
                    <div style={{ padding: 8 }}>
                      <input className="input" autoFocus value={tzQuery} onChange={e => setTzQuery(e.target.value)} placeholder="搜索: 上海, beijing, tokyo…" />
                    </div>
                    {tzGroups.map(g => (
                      <div key={g.group}>
                        <div className="tz-group-label">{groupLabel(g.group)}</div>
                        {g.zones.map(z => (
                          <div
                            key={z.iana}
                            className={`tz-item ${z.iana === d.tz ? "selected" : ""}`}
                            onClick={() => { set("tz", z.iana); setTzOpen(false); setTzQuery(""); }}
                          >
                            <span className="tz-city">{z.city}, {z.country}</span>
                            <span className="tz-gmt">{z.gmtWinter}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {tzFiltered.length === 0 && <div style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>未找到匹配结果</div>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {currentStep === "persona" && (
          <>
            <h1 className="setup-title">人设备注</h1>
            <p className="setup-subtitle">简要描述你希望她是什么样的。LLM 将在生成时参考此内容。</p>
            <div className="form-row">
              <textarea className="textarea" value={d.personaNotes} onChange={e => set("personaNotes", e.target.value)} placeholder="例如：设计系学生，喜欢猫，爱玩视觉小说，从北京搬到了上海..." style={{ minHeight: 140 }} />
            </div>
          </>
        )}

        {currentStep === "ready" && (
          <>
            <h1 className="setup-title">一切就绪</h1>
            <p className="setup-subtitle">检查设置。下一步将创建个人资料并通过 LLM 生成人设。</p>
            <div className="form-row">
              <div><strong>{d.name}</strong>, {d.age}, {d.nationality}, {d.tz}</div>
              <div><strong>连接:</strong> {d.tgMode === "web" ? "网页聊天（无需 Telegram）" : d.tgMode === "bot" ? `Telegram bot (token ${d.botToken ? "ok" : "missing"})` : `userbot (${d.sessionString ? "session ok" : d.apiId ? "creds ok, no session" : "missing"})`}</div>
              <div><strong>LLM:</strong> {d.llmPresetId} / {d.llmModel}</div>
              <div><strong>阶段:</strong> {stages.find(s => s.id === d.stage)?.label}</div>
            </div>
          </>
        )}

        {currentStep === "generating" && (
          <>
            {d.generating ? (
              <>
                <h1 className="setup-title">正在生成人设…</h1>
                <p className="setup-subtitle">LLM 正在创建性格、语气、边界和日程安排。通常需要 30-60 秒。</p>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
                  <div className="spinner" />
                  <div style={{ color: "var(--ga-text-dim)", fontSize: 13 }}>正在生成 persona.md, speech.md, boundaries.md…</div>
                </div>
              </>
            ) : d.generated ? (
              <>
                <h1 className="setup-title">人设已创建</h1>
                <p className="setup-subtitle">个人资料已准备就绪，运行时已启动。点击「完成」查看运行日志。</p>
                <div className="form-row">
                  <div><strong>{d.name}</strong>, {d.age}, {d.nationality}, {d.tz}</div>
                  <div><strong>LLM:</strong> {d.llmPresetId} / {d.llmModel}</div>
                  <div><strong>阶段:</strong> {stages.find(s => s.id === d.stage)?.label}</div>
                  <div style={{ color: "var(--ga-success, #7ce9a0)", marginTop: 8 }}>人设、语气和日程安排已生成。</div>
                </div>
              </>
            ) : (
              <>
                <h1 className="setup-title">正在创建个人资料…</h1>
                <p className="setup-subtitle">正在准备生成所需的数据。</p>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
                  <div className="spinner" />
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "space-between" }}>
          <div>
            {d.step > 0 && currentStep !== "generating" && <button className="btn ghost" onClick={back}>← 返回</button>}
            {currentStep !== "generating" && <button className="btn ghost" onClick={() => showSetupFlow(false)}>关闭</button>}
          </div>
          {currentStep === "generating" ? (
            <button className="btn primary" disabled={!d.generated} onClick={() => finishAndClose()}>
              {d.generating ? "正在生成人设…" : d.generated ? "完成 →" : "请稍候…"}
            </button>
          ) : (
            <button className="btn primary" disabled={!canNext || savingProfile} onClick={() => void next()}>
              {currentStep === "ready" ? (savingProfile ? "正在创建…" : "创建并生成 →") : "下一步 →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function groupLabel(group: "CN" | "CIS" | "RU" | "other"): string {
  switch (group) {
    case "CN": return "中国";
    case "CIS": return "亚洲 & 世界";
    case "RU": return "俄罗斯";
    default: return "其他";
  }
}

function stepValid(step: string, d: DraftState): boolean {
  switch (step) {
    case "mode": return true;
    case "name": return !!d.name && d.age >= MIN_AGE && d.age <= MAX_AGE;
    case "tg":
      if (d.tgMode === "web") return true;
      if (d.tgMode === "bot") return !!d.botToken;
      // userbot
      if (d.userbotMethod === "own") return !!d.apiId && !!d.apiHash && !!d.phone;
      return !!d.phone;
    case "tg-userbot-code":
      // 步骤仅在获取到 sessionString 时才完成
      return !!d.sessionString;
    case "llm": return !!d.llmPresetId && !!d.llmModel;
    case "api-config": return true;
    case "generating": return d.generated;
    case "stage": return !!d.stage;
    case "comm": return !!d.communicationId;
    case "sleep": return true;
    case "owner": return true;
    case "tz": return !!d.tz;
    case "persona": return true;
    case "ready": return true;
    default: return true;
  }
}
