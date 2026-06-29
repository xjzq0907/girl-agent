# CLAUDE.md — Claude 在本项目的工作约定

## 项目一句话
girl-agent：Telegram AI 人格引擎（Node ≥ 20 / TypeScript / ESM / Ink TUI / tsup 构建）。
详细架构与目录见 `AGENTS.md`，本文档只约定 Claude 的工作行为。

---

## 1. 中断恢复流程（每次开工先做）

> 自动提交钩子已配置（`~/.claude/settings.json` 的 PostToolUse），所以**大多数中断 = 损失 ≤ 1 次工具调用**。但仍按以下顺序检查：

1. **看 git 现状**：`git status` 和 `git log --oneline -10`
2. **看最近 auto commit**：`git log --oneline --grep="^auto" -20`
3. **如果用户说"接着干"**：先复述我看到的代码状态，再问从哪一步继续，**不要瞎猜**
4. **如果用户没说从哪继续**：列出当前 uncommitted 改动 + 最近 3 个有意义的提交，问优先级

## 2. 自动存档机制（别手动覆盖）

- 每次 `Write` / `Edit` / `MultiEdit` 后，PostToolUse 钩子会自动 `git add -A && git commit`
- 提交格式：`auto(<ToolName>): HH:MM:SS`
- **意义提交**（用户能看懂的那种）仍应手写，auto commit 只作存档点
- 想撤销 auto 存档：`git reset --hard HEAD~N`

## 3. Commit 节奏

- 一个独立功能 / 一个修复 = 一个 commit
- 提交信息中文，祈使句：`feat: 修复用户重启后日程错乱`、`fix: webhook 404`
- 不在 commit 里夹带未完成的工作

## 4. 不要做的事

- ❌ 不要 `git push` 除非用户明确要求
- ❌ 不要 `git reset --hard` 除非用户明确要求
- ❌ 不要修改 `~/.claude/settings.json` 里 MiniMax provider 的 env（ANTHROPIC_BASE_URL / TOKEN 等）
- ❌ 不要 `npm install` 新依赖不打招呼
- ❌ 不要修改 `dist/` 和 `node_modules/`（前者是构建产物、后者由 npm 还原）

## 5. 测试与构建

- 改 `src/` 后跑 `npm run typecheck` 确认无类型错误
- WebUI 改动跑 `npm run build:webui`
- 不要跑 `npm start`（会启动 Telegram bot 连真实账号）

## 6. 不确定时

- 优先读已有代码（`AGENTS.md` 里的目录结构是真实索引）
- 冲突系统 / 关系评分 / 睡眠这些是**核心业务规则**，改之前先确认设计意图
- 拿不准就问，别瞎写