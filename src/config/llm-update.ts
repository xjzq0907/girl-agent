import { findPreset } from "../presets/llm.js";
import { normalizeModelName } from "../engine/security.js";
import type { LLMProto, ProfileConfig } from "../types.js";

export interface LLMUpdate {
  presetId?: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  proto?: LLMProto;
}

export type LLMConfig = ProfileConfig["llm"] | NonNullable<ProfileConfig["minorLlm"]>;

export function describeLLM(cfg: ProfileConfig): string {
  const preset = findPreset(cfg.llm.presetId);
  const auth = cfg.llm.oauthRefreshToken
    ? "oauth"
    : cfg.llm.apiKey.trim()
      ? "api-key"
      : "无密钥";
  return [
    `provider: ${preset?.name ?? cfg.llm.presetId}`,
    `preset: ${cfg.llm.presetId}`,
    `proto: ${cfg.llm.proto}`,
    `model: ${cfg.llm.model || "—"}`,
    `baseURL: ${cfg.llm.baseURL ?? "default"}`,
    `auth: ${auth}`
  ].join("\n");
}

export function minorLLMConfig(cfg: ProfileConfig): ProfileConfig["llm"] {
  const minor = cfg.minorLlm;
  if (!minor?.enabled || minor.sameAsMain) return cfg.llm;
  return {
    presetId: minor.presetId,
    proto: minor.proto,
    baseURL: minor.baseURL,
    apiKey: minor.apiKey,
    model: minor.model
  };
}

export function applyLLMUpdate(cfg: ProfileConfig, update: LLMUpdate): string[] {
  const changed: string[] = [];
  const currentPresetId = cfg.llm.presetId;
  const presetId = update.presetId ?? currentPresetId;
  const preset = findPreset(presetId);
  const presetChanged = presetId !== currentPresetId;

  const proto = update.proto ?? preset?.proto ?? cfg.llm.proto;
  const baseURL = update.baseURL !== undefined
    ? emptyToUndefined(update.baseURL)
    : presetChanged
      ? preset?.baseURL
      : cfg.llm.baseURL;
  const rawModel = update.model ?? (presetChanged ? preset?.defaultModel : cfg.llm.model) ?? "";
  let model = normalizeModelName(rawModel);
  // Issue #75: 如果模型与预设不匹配（例如，切换预设或手动输入后）
  // — 则温和地回退到预设的 defaultModel，
  // 不中断进程。仅当预设为固定预设（非 custom）
  // 并且显式列出了模型时才生效。
  if (preset && !preset.custom && Array.isArray(preset.models) && preset.models.length > 0 && model && !preset.models.includes(model)) {
    const fallback = preset.defaultModel || preset.models[0] || "";
    if (fallback && fallback !== model) {
      changed.push(`model ${model} 不在预设 ${preset.name} 中 → 回退到 ${fallback}`);
      model = fallback;
    }
  }
  const apiKey = update.apiKey !== undefined
    ? update.apiKey
    : presetChanged
      ? preset?.defaultApiKey ?? ""
      : cfg.llm.apiKey;

  const keepOAuth = !presetChanged && update.apiKey === undefined && preset?.oauth;

  if (presetChanged) changed.push(`provider ${currentPresetId} → ${presetId}`);
  if (cfg.llm.model !== model) changed.push(`model ${cfg.llm.model || "—"} → ${model || "—"}`);
  if (cfg.llm.proto !== proto) changed.push(`proto ${cfg.llm.proto} → ${proto}`);
  if ((cfg.llm.baseURL ?? "") !== (baseURL ?? "")) changed.push("baseURL 已更新");
  if (update.apiKey !== undefined) changed.push("apiKey 已更新");
  if (!keepOAuth && cfg.llm.oauthRefreshToken) changed.push("旧 OAuth 已清除");

  cfg.llm = {
    presetId,
    proto,
    baseURL,
    apiKey,
    model,
    ...(keepOAuth ? {
      oauthRefreshToken: cfg.llm.oauthRefreshToken,
      oauthExpiresAt: cfg.llm.oauthExpiresAt
    } : {})
  };

  return changed;
}

export function resolveLLMUpdate(current: LLMConfig, update: LLMUpdate): { next: LLMConfig; changed: string[] } {
  const shell: ProfileConfig = {
    slug: "",
    name: "",
    age: 18,
    nationality: "RU",
    tz: "UTC",
    mode: "bot",
    stage: "tg-given-cold",
    telegram: {},
    privacy: "owner-only",
    createdAt: "",
    sleepFrom: 23,
    sleepTo: 8,
    nightWakeChance: 0.05,
    llm: current
  };
  const changed = applyLLMUpdate(shell, update);
  return { next: shell.llm as LLMConfig, changed };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
