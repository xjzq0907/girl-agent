<div align="center">

# girl-agent

**Telegram AI 女友引擎 — 有日程、有记忆、有脾气，像真人一样。**

[![License](https://img.shields.io/badge/license-source--available-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Telegram](https://img.shields.io/badge/Telegram-Bot%20%2B%20Userbot-26A5E4?logo=telegram&logoColor=white)](https://t.me/GirlAgentAI)

</div>

---

> 当前为 Beta 版本。Bug 反馈请提交 [Issues](https://github.com/xjzq0907/girl-agent/issues)。

> **本仓库是对原项目 [girl-agent](https://github.com/TheSashaDev/girl-agent) 的中文本土化修改版**，增加了 SOCKS5 代理隧道、心跳保活、消息竞态修复等改进。

## 项目简介

她不会每条消息都回复。有时候已读不回，有时候只给个表情反应，有时候过一小时才回——因为在忙，或者就是不想回。

这不是 Bug。这是设计如此。

`girl-agent` 是一个 Telegram AI 人格引擎。**不是 prompt，不是 GPTs，不是插件。** 它是一个有完整状态的 AI 代理：每日日程、在线模式、睡眠、跨月长期记忆、冲突系统、五项关系评分、九个亲密阶段。行为由这些层级叠加决定，而非单条 `system_prompt`。

---

## 目录

- [快速开始](#快速开始)
- [引擎架构](#引擎架构)
- [为什么不用 GPTs 或 prompt](#为什么不用-gpts-或-prompt)
- [安全提醒](#安全提醒)
- [许可证](#许可证)
- [Changelog](./CHANGELOG.md)

---

## 快速开始

### 从源码运行

```sh
git clone https://github.com/xjzq0907/girl-agent.git
cd girl-agent
npm install
npm run build
npm start
```

WebUI 默认运行在 `http://localhost:3000`。

### 配置 LLM API

在 WebUI 设置页面中配置 API Key 和模型。支持 OpenAI 兼容接口（DeepSeek、Claude API 等）。

---

## 引擎架构

行为由多个独立模块叠加而成，而非单一 prompt。

| 模块 | 功能 |
|------|------|
| 📱 **Presence** | 在线模式：不是永远在线。不同角色有不同上线频率——有人全天在线，有人每小时看一次，有人只有晚上才回。 |
| 😴 **Sleep** | 睡眠系统：夜间自动进入睡眠状态，可通过 `:wake` 唤醒，但无唤醒时回复概率极低。 |
| 📅 **Daily-life** | 每日日程：上课、上班、通勤、自由时间。忙时手机不可用或回复延迟。 |
| ❤️ **Relationship** | 关系评分：五项指标——兴趣、信任、好感、烦躁度、尴尬容忍度。每次对话都会影响。 |
| 📈 **Stages** | 关系阶段：9 个阶段——从「给了 TG 但冷淡」到「长期在一起」。阶段影响回复温度、调情程度、回复长度。 |
| ⚠️ **Conflict** | 冲突系统：逼迫、刷屏、越界会导致冲突激活。可能沉默数小时甚至数天。 |
| 🧠 **Memory** | 长期记忆：重要事件写入记忆文件，在后续对话中回溯提及。 |
| 🚫 **Anti-AI** | 反 AI 味：prompt 禁止 markdown、禁止"当然""我理解"、禁止 emoji 连发、禁止末尾反问——一切暴露 AI 特征的表达。 |
| 👤 **Userbot** | 真实账号模式：通过 MTProto 协议使用真实 Telegram 账号。支持阅读、表情反应、输入状态、删除和编辑消息。像真人一样。 |
| 🗓 **Agenda** | 主动规划：Agent 自动规划主动消息——祝面试顺利、问约会进展、生日祝福。 |

---

## 为什么不用 GPTs 或 prompt

<details>
<summary><strong>ChatGPT GPTs</strong> — ChatGPT 内的自定义 bot（system prompt）</summary>

- 无跨会话记忆 — 每次从头开始
- 无 Telegram — 仅 Web 界面
- 无表情反应、输入状态、消息编辑
- 永远在线 — 无日程和睡眠
- 记忆受上下文窗口限制

**结论：** 带自定义 prompt 的聊天机器人，无状态，不真实。

</details>

<details>
<summary><strong>OpenClaw + prompt</strong> — AI 助手框架（markdown 人格文件）</summary>

通过 `SOUL.md`、`IDENTITY.md`、`USER.md` 定义人格，GramJS 桥接 Telegram。

- 无真实感模块：presence、sleep、conflict、daily-life、relationship stages
- 无 agenda — 不规划行动
- 记忆 = 消息历史，无长期存储
- 无关系评分和冲突系统

**结论：** 好的 Telegram 桥接，但不是人格引擎。行为 = prompt + 历史。

</details>

<details>
<summary><strong>Character.AI</strong> — 闭源 AI 聊天服务</summary>

- 无 Telegram — 仅 Web
- 无控制权 — 所有数据在云端
- 记忆随会话重置
- 人格随历史增长被截断

**结论：** 闭源服务，有限记忆，无 Telegram。

</details>

<details open>
<summary><strong>girl-agent</strong> — 多层状态引擎</summary>

- **Presence** — 上线模式（频率、离线、回复概率）
- **Sleep** — 睡眠时间、夜间唤醒概率
- **Daily-life** — 日程、忙碌状态、优先级
- **Relationship stages** — 9 阶段：见面给 TG → 说服回复 → 稳定交往 → 长期
- **Relationship score** — 兴趣、信任、好感、烦躁度、尴尬容忍度
- **Conflict** — 施压/刷屏触发冲突，可能沉默
- **Memory** — 重要事件长期存储，对话中回溯
- **Anti-AI** — 禁止 AI 味表达
- **Userbot** — 真实账号：已读、反应、输入中、删除、编辑
- **Agenda** — 主动规划：过自己的生活

**结论：** 行为由状态驱动，而非文本指令。

</details>

---

## 安全提醒

> ⚠️ **切勿公开：** `data/` 目录、`config.json`、`sessionString`、API 密钥。
>
> 🔒 **Userbot 模式**请使用独立的测试账号 — Telegram 可能因可疑活动封禁主账号。

---

## 许可证

📄 **Source-available** — 源码开放供个人测试、评估和贡献。

| 允许 | 未经书面许可禁止 |
|------|-----------------|
| ✅ 克隆并在本地运行 | ❌ 商业使用 |
| ✅ 提交 Issues 和 PR | ❌ 付费托管服务 |
| ✅ 学习代码和实验 | ❌ 转售 |
| | ❌ 公开竞品克隆 |
| | ❌ 在商业产品中使用代码 |

📜 完整文本：[LICENSE](./LICENSE)。

---

## 致谢

本项目基于 [TheSashaDev/girl-agent](https://github.com/TheSashaDev/girl-agent) 进行中文本地化和功能增强。
