import type { LLMClient } from "../llm/index.js";
import type { ProfileConfig, RelationshipScore } from "../types.js";
import { appendMd, readRelationship, writeRelationship } from "../storage/md.js";
import type { ConflictState } from "./conflict.js";

export function applyMoodDelta(score: RelationshipScore, delta: Partial<RelationshipScore>): RelationshipScore {
  return {
    interest: clamp(score.interest + (delta.interest ?? 0)),
    trust: clamp(score.trust + (delta.trust ?? 0)),
    attraction: clamp(score.attraction + (delta.attraction ?? 0)),
    annoyance: clamp(score.annoyance + (delta.annoyance ?? 0)),
    cringe: clamp(score.cringe + (delta.cringe ?? 0))
  };
}

function clamp(n: number, lo = -100, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

const REFLECT_SYS = `你是一位记录女孩日记的记者。根据最近的聊天记录，更新她对男生的内心态度。简短些。`;

export async function maybeReflect(
  llm: LLMClient,
  cfg: ProfileConfig,
  recent: { role: "user" | "assistant"; content: string }[],
  conflict: ConflictState | null = null
): Promise<void> {
  if (recent.length < 6) return;
  const transcript = recent.slice(-12).map(m => `${m.role === "user" ? "他" : cfg.name}: ${m.content}`).join("\n");

  const conflictNote = conflict && conflict.level > 0
    ? `\n\n重要：她目前和他有矛盾 (level ${conflict.level}, 原因: "${conflict.reason ?? "—"}")。这会影响她的反思：\n- Level 1: 轻微受伤 — 对他的话更挑剔一些\n- Level 2: 严重受伤 — 更负面的反思，聚焦缺点\n- Level 3+: 激烈矛盾 — 非常负面的反思，可能会觉得"一切都没意义"\n- 请体现在 feelingShift 和 newFacts 中。`
    : "";

  try {
    const raw = await llm.chat(
      [
        { role: "system", content: REFLECT_SYS },
        {
          role: "user",
          content: `姓名: ${cfg.name}, ${cfg.age} 岁。阶段: ${cfg.stage}.${conflictNote}
最新消息:
${transcript}

返回 JSON:
{
  "newFacts": ["关于他值得记住的简短事实"],
  "feelingShift": "1-2句话描述她的态度如何改变",
  "stageHint": "保持 | 提升 | 降低 | dumped"
}`
        }
      ],
      { temperature: 0.6, maxTokens: 3500, json: true }
    );
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.newFacts) && parsed.newFacts.length) {
      await appendMd(cfg.slug, "memory/long-term.md",
        `\n\n## ${new Date().toISOString().slice(0, 16)}\n` + parsed.newFacts.map((f: string) => `- ${f}`).join("\n"));
    }
    if (parsed.feelingShift) {
      const rel = await readRelationship(cfg.slug);
      const note = `\n\n## ${new Date().toISOString().slice(0, 16)}\n${parsed.feelingShift}`;
      await writeRelationship(cfg.slug, { ...rel, notes: (rel.notes || "") + note });
    }
  } catch {
    /* swallow */
  }
}
