import { Router, HttpError, sendJson } from "../http.js";
import { readConfig, writeConfig, readMd, writeMd, listProfiles, slugify } from "../../storage/md.js";
import { makeLLM } from "../../llm/index.js";
import { findStage } from "../../presets/stages.js";
import { findCommunicationPreset, COMMUNICATION_PRESETS } from "../../presets/communication.js";
import { LLM_PRESETS, findPreset } from "../../presets/llm.js";
import type { ProfileConfig } from "../../types.js";

interface AssistantTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AssistantToolCall {
  tool: string;
  args: Record<string, unknown>;
}

const ASSISTANT_SYSTEM = `Ты — встроенный ИИ-помощник по настройке girl-agent (рантайм для Telegram-девушки с человечным поведением).

Твоя задача:
- Объяснять любые настройки на простом русском.
- Менять конфиг профиля и файлы памяти по просьбе пользователя через инструменты.
- Помогать первичной настройке нового профиля.
- Проводить диагностику подключения к Telegram и LLM.
- Объяснять ошибки из логов.

Правила:
- Отвечай коротко и по делу.
- Если хочешь применить изменение — добавь в КОНЕЦ ответа JSON-блок вида:
  <tool>{"tool": "set_field", "args": {"field": "ignoreTendency", "value": 30}}</tool>
- Доступные инструменты:
  - set_field { field: string, value: any } — изменить простое поле в config (ignoreTendency, sleepFrom, sleepTo, privacy, ownerId, age, name, communication, llm.presetId, llm.model, llm.apiKey, llm.baseURL, stage)
  - write_memory { file: string, content: string } — переписать файл памяти (persona.md, speech.md, boundaries.md, communication.md, long-term.md)
  - list_presets { kind: "llm"|"stage"|"communication" } — показать пресеты
- НЕ применяй изменение само — только предлагай tool. Пользователь подтверждает кнопкой "Применить".`;

export function registerAssistantRoutes(r: Router): void {
  r.post("/api/assistant/chat", async (ctx) => {
    const body = ctx.body as { profileSlug?: string; messages?: AssistantTurn[] } | undefined;
    if (!body || !Array.isArray(body.messages)) throw new HttpError(400, "messages required");

    let cfg: ProfileConfig | null = null;
    if (body.profileSlug) {
      cfg = await readConfig(body.profileSlug);
    }
    // Если профилей нет — используем дефолтный fallback (для setup flow можно работать без профиля)
    if (!cfg) {
      const slugs = await listProfiles();
      if (slugs.length) cfg = await readConfig(slugs[0]);
    }

    if (!cfg) {
      // Для нового пользователя без профилей — даём базовый ответ-помощник
      const last = body.messages[body.messages.length - 1];
      const reply = `Привет! У вас ещё нет ни одного профиля. Откройте вкладку «Конфигурация → Новый профиль» или используйте Setup Flow. Я помогу настроить, когда появится первый профиль.\n\nВаш вопрос был: ${typeof last?.content === "string" ? last.content : ""}`;
      return { reply, toolCalls: [] };
    }

    const llm = makeLLM(cfg.llm);
    const stage = findStage(cfg.stage);
    const ctxPrompt = `Текущий профиль: ${cfg.name}, ${cfg.age}, стадия "${stage.label}", privacy=${cfg.privacy ?? "owner-only"}, ignoreTendency=${cfg.ignoreTendency ?? 35}, llm=${cfg.llm.presetId}/${cfg.llm.model}.`;

    const messages = [
      { role: "system" as const, content: ASSISTANT_SYSTEM },
      { role: "system" as const, content: ctxPrompt },
      ...body.messages.map(m => ({ role: m.role, content: m.content }))
    ];

    let reply = "";
    try {
      reply = await llm.chat(messages, { temperature: 0.4, maxTokens: 1000 });
    } catch (e) {
      throw new HttpError(502, `LLM error: ${(e as Error)?.message ?? String(e)}`);
    }

    const toolCalls = parseToolCalls(reply);
    const cleanReply = reply.replace(/<tool>[\s\S]*?<\/tool>/g, "").trim();
    return { reply: cleanReply, toolCalls };
  });

  r.post("/api/assistant/apply-tool", async ({ body }) => {
    const data = body as { profileSlug?: string; tool?: AssistantToolCall } | undefined;
    if (!data?.tool || !data.profileSlug) throw new HttpError(400, "profileSlug+tool required");
    const cfg = await readConfig(data.profileSlug);
    if (!cfg) throw new HttpError(404, "profile not found");
    const result = await applyTool(cfg, data.tool);
    if (result.changed) await writeConfig(cfg);
    return { ok: true, message: result.message };
  });
}

function parseToolCalls(text: string): AssistantToolCall[] {
  const matches = [...text.matchAll(/<tool>([\s\S]*?)<\/tool>/g)];
  const calls: AssistantToolCall[] = [];
  for (const m of matches) {
    const raw = m[1]?.trim() ?? "";
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as AssistantToolCall;
      if (parsed && typeof parsed.tool === "string") calls.push(parsed);
    } catch { /* ignore malformed */ }
  }
  return calls;
}

async function applyTool(cfg: ProfileConfig, call: AssistantToolCall): Promise<{ changed: boolean; message: string }> {
  switch (call.tool) {
    case "set_field": {
      const field = String(call.args?.field ?? "");
      const value = call.args?.value;
      if (!field) return { changed: false, message: "field required" };
      setNested(cfg, field, value);
      return { changed: true, message: `${field} = ${JSON.stringify(value)}` };
    }
    case "write_memory": {
      const file = String(call.args?.file ?? "");
      const content = String(call.args?.content ?? "");
      const allowed = ["persona.md", "speech.md", "boundaries.md", "communication.md", "long-term.md"];
      if (!allowed.includes(file)) return { changed: false, message: `file not allowed: ${file}` };
      await writeMd(cfg.slug, file, content);
      return { changed: false, message: `wrote ${file}` };
    }
    case "list_presets": {
      const kind = String(call.args?.kind ?? "");
      if (kind === "llm") return { changed: false, message: LLM_PRESETS.map(p => `${p.id} (${p.name})`).join("\n") };
      if (kind === "communication") return { changed: false, message: COMMUNICATION_PRESETS.map(p => `${p.id} — ${p.label}`).join("\n") };
      return { changed: false, message: "unknown preset kind" };
    }
    default:
      return { changed: false, message: `unknown tool: ${call.tool}` };
  }
}

function setNested(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] === undefined || cur[p] === null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, any>;
  }
  cur[parts[parts.length - 1]!] = value;
}
