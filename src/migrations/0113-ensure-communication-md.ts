/**
 * Migration 0113: 如果 communication.md 不存在则生成。
 *
 * 在引入 communication.md 之前创建的配置文件没有此文件。
 * 迁移使用用户的 LLM 根据 persona.md 生成 communication.md。
 * 如果 LLM 不可用，则跳过且不报错。
 */

import type { Migration, MigrationContext } from "./index.js";
import { readMd, writeMd } from "../storage/md.js";

export const migration0113: Migration = {
  id: "0113-ensure-communication-md",
  description: "如果不存在则通过 AI 生成 communication.md",
  needsLLM: true,

  async migrate(ctx: MigrationContext) {
    const { config, llm, log } = ctx;
    const existing = await readMd(config.slug, "communication.md");
    if (existing.trim()) return config;

    if (!llm) {
      log("communication.md 不存在，但 LLM 不可用 — 跳过");
      return config;
    }

    const persona = await readMd(config.slug, "persona.md");
    if (!persona.trim()) {
      log("persona.md 也不存在 — 跳过生成 communication.md");
      return config;
    }

    log("正在通过 AI 生成 communication.md...");
    const prompt = `根据下面的 persona.md 生成 communication.md — ${config.name}（${config.age} 岁）的沟通偏好。结构：

# 沟通偏好
## 什么时候发消息（活跃时间、频率）
## 消息风格（长度、表情、贴纸、语音）
## 聊天中讨厌什么（具体触发点）
## 感兴趣 / 不感兴趣的话题
## 对语音 / 视频 / 照片的反应

用第三人称写，简洁，不使用表情。不超过 250 字。

persona.md:
${persona}`;

    const response = await llm.chat([
      { role: "system", content: "你正在为角色扮演游戏生成角色配置文件。" },
      { role: "user", content: prompt }
    ]);

    if (response?.trim()) {
      await writeMd(config.slug, "communication.md", response);
      log("communication.md 已生成");
    }

    return config;
  }
};
