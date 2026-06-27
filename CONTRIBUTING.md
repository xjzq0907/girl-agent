# 贡献指南

```bash
git clone https://github.com/TheSashaDev/girl-agent && cd girl-agent
npm i && npm run dev
```

提交 PR 前请运行 `npm run typecheck` 和 `npm run build`。不要提交 `data/`、`dist/`、`.env`。

每次公开发布前：

1. 通过 `npm version patch|minor|major --no-git-tag-version` 更新版本号；
2. 确认 `package.json` 和 `package-lock.json` 中的版本号都已更新；
3. 在 `CHANGELOG.md` 中添加一条记录，包含日期和简要的改动列表；
4. merge 后创建并推送对应版本的 tag：`git tag vX.Y.Z && git push origin vX.X.Z`。

发布到 npm 由 GitHub Actions workflow `Publish to npm` 在匹配 `v*` tag 时自动触发。仓库中需配置 Actions secret `NPM_TOKEN`。

可以在以下位置方便地补充功能：

- `src/presets/llm.ts` —— LLM 预设
- `src/presets/mcp.ts` + `src/mcp/` —— MCP 集成
- `src/presets/names.ts` —— 地区化人名
- `src/engine/` —— 关系阶段、behavior-tick、情绪模型

不接受 NSFW 内容。不接受向量数据库和 RAG。较大的重构请先开 issue 讨论。

PR 默认以 MIT 协议收录。
