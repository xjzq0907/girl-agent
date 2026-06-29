# CLAUDE.md — girl-agent 项目级约定

> 全局约定（中断恢复、commit 节奏、不该做的事）见 `~/.claude/CLAUDE.md`。
> 本文件只写**本项目特有的**约定，会覆盖通用约定。

---

## 项目一句话
girl-agent：Telegram AI 人格引擎（Node ≥ 20 / TypeScript / ESM / Ink TUI / tsup 构建）。
详细架构与目录见 `AGENTS.md`。

---

## 项目级「不要做的事」

- ❌ 不要修改 `dist/` 和 `node_modules/`（前者构建产物、后者由 npm 还原）
- ❌ 不要跑 `npm start`（会启动 Telegram bot 连真实账号）
- ❌ 不要修改 `~/.claude/settings.json` 里的 MiniMax provider env（ANTHROPIC_BASE_URL / TOKEN / MODEL 等）

## 测试与构建

- 改 `src/` 后跑 `npm run typecheck` 确认无类型错误
- WebUI 改动跑 `npm run build:webui`
- 完整构建：`npm run build`

## 业务规则（核心，慎改）

以下模块是项目核心设计，改之前必须先确认设计意图：

- ⚠️ **Conflict**（冲突系统）：沉默/冷处理是设计如此，不是 bug
- ⚠️ **Relationship**（关系评分）：五项指标独立计算，耦合在 `prompt.ts`
- ⚠️ **Sleep**（睡眠系统）：夜间无唤醒时回复概率极低
- ⚠️ **Anti-AI**（反 AI 味）：prompt 禁用 markdown/反问/AI 套话

修改前先看 `src/engine/` 对应模块和现有 prompt 模板。