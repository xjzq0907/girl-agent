// 心情日记：每天结束时基于 session log 生成第一人称视角的日记文件。
// 与 daily-summary（第三人称客观总结）互补。

import type { LLMClient } from "../llm/index.js";
import type { ProfileConfig } from "../types.js";
import {
  readSessionLog, writeDiary, readDiary, stripLogMetadata
} from "../storage/md.js";

export interface Diary {
  day: string;
  mood: string;          // 一两个字的当日心情标签
  text: string;          // 第一人称日记正文（2-4 段，无 markdown 格式）
}

const SYS = `你是女孩的真实日记本。请根据当天她和男生的聊天原始日志，写一段她自己的日记。

严格要求：
- 第一人称，用"我"
- 用她的语气（口语化、短句）
- 绝对不要 markdown：不要标题、不要列表、不要粗体、不要星号、不要井号
- 绝对不要 AI 套话：不要"当然"、"我理解"、"希望"、"总之"等
- 不要 emoji 连发，最多一个
- 不要在结尾问问题或抛话头
- 段落之间用空行隔开，2-4 段
- 内容真实、像她自己写的：可以是碎碎念、抱怨、开心、反思、困惑、看电影感想、吃东西的吐槽
- 总字数 150-400 字左右，不要太长

返回严格 JSON：
{
  "mood": "一两个字的当日心情（比如：平静 / 小确幸 / 烦躁 / 想他 / 无聊 / 窝心）",
  "text": "日记正文（2-4 段，\\n\\n 分隔，不要 markdown）"
}`;

/**
 * 生成当天的心情日记。如果已有则覆盖。
 * 仅当 session log 非空且 ≥ 50 字符时才返回 diary；否则返回 null（保持当天不写日记）。
 */
export async function buildDiary(
  llm: LLMClient,
  cfg: ProfileConfig,
  day: string
): Promise<Diary | null> {
  const log = sanitizeSessionLogForDiary(await readSessionLog(cfg.slug, day));
  if (!log || log.length < 50) return null;

  try {
    const raw = await llm.chat([
      { role: "system", content: SYS },
      {
        role: "user",
        content: `姓名: ${cfg.name}, ${cfg.age} 岁。阶段: ${cfg.stage}。日期: ${day}。

当天聊天日志：
"""
${log.slice(-8000)}
"""
`
      }
    ], { temperature: 0.85, maxTokens: 3500, json: true });

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    const diary: Diary = {
      day,
      mood: typeof parsed.mood === "string" ? parsed.mood.trim().slice(0, 24) : "平静",
      text: parsed.text.trim().slice(0, 2000)
    };
    const md = renderDiary(diary);
    await writeDiary(cfg.slug, day, md);
    return diary;
  } catch {
    return null;
  }
}

/** 是否当天已经写过日记（用于幂等跳过）。 */
export async function hasDiary(slug: string, day: string): Promise<boolean> {
  const raw = await readDiary(slug, day);
  return raw.trim().length > 0;
}

function sanitizeSessionLogForDiary(raw: string): string {
  return raw.split(/\r?\n/).map(stripLogMetadata).join("\n").trim();
}

function renderDiary(d: Diary): string {
  return `---\ndate: ${d.day}\nmood: ${d.mood}\n---\n\n${d.text}\n`;
}