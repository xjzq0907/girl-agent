# 更新日志

## 0.4.7

日期：2026-05-24

- 加固日志元数据脱敏
- 修复聊天用户问题
- 增加少量 LLM 配置
- 修复 Telegram 在线状态和 WebUI 问题


## 0.4.6

日期：2026-05-24

- 修复 Termux 安装脚本和文档


## 0.4.5

日期：2026-05-22

📝 文档
- 项目许可证已更新 —— 现采用 Contribution-Only License v2.0


## 0.4.4

日期：2026-05-17

📝 文档

- 更新许可证政策：项目已切换到 Community License (GSACL) 1.1 版本，许可证中明确了对虚假信息的立场。


## 0.4.3

日期：2026-05-17

🐛 修复

- 修复了模型改写回复时出现的消息重复问题 —— 内容相同或相近的「消息气泡」不再出现两次。


## 0.4.2

日期：2026-05-17

🐛 修复

- 正确地把所有回退的 reaction 值与白名单记录进行匹配，确保 reaction 行为可预期。
- 修复了社区反馈的若干 bug：代理解析、bot 初始化报错，以及 daily-life 中的重复问题。

📝 文档

- 快速开始页面中 Windows npx 标签卡被移到首位，并补充了在 Windows 上启动的说明。
- 用户文档已俄文化（按上游原版），并更新了 README。
- 更正了 ClaudeHub 的价格信息。
- 完整 Fumadocs 文档站已上线并更新，地址 docs.girl-agent.com


## 0.4.1

日期：2026-05-14

🐛 修复
- 修正了 Docker 镜像 URL 错误，避免镜像下载失败
- 解决媒体处理时的内存问题（降低泄漏/过度占用）
- 修复了安装流程和 WebUI 中影响正确配置的错误
- 修复 Termux 安装：安装器不再用自己的 install-prefix 覆盖 Termux 系统的 `$PREFIX`，并正确检查 `girl-agent` 命令是否可用

🔧 改进
- 优化插件用户体验：完善了与扩展交互的界面和行为
- 为 Termux 增加清晰说明：通过 `pkg install nodejs` 安装、在手机上启动 WebUI、通过 Wi-Fi 从电脑访问


## 0.4.0

日期：2026-05-14

🚀 新功能

- WebUI 启动时直接展示 3 个清晰的链接：
  - `http://127.0.0.1:<port>` —— 同机本地运行；
  - `http://localhost:<port>` —— 习惯的本地地址；
  - `http://<public-ip>:<port>` —— 当 girl-agent 跑在服务器、VPS 或 Docker 上时，方便从主电脑打开。
- 新增 WebUI 鉴权。如果设置了 `GIRL_AGENT_WEBUI_PASSWORD` 或 `GIRL_AGENT_WEBUI_TOKEN`，界面会要求密码登录并保护 API/WebSocket 不被未授权访问；常规本地启动未设置环境变量时 WebUI 保持便捷，不需要密码。
- 新增对 Telegram 代理格式 `tg://proxy?server=...&port=...&secret=...` 的支持。可直接从 Telegram 粘贴链接，无需手动转成 socks 格式。
- 新增对媒体中常见网络梗图的轻度识别（不依赖 reverse image search）。当 vision 模型能确定图片是已知梗图时，会把这一信息传给角色；不确定时则按普通图片处理，避免产生误报。
- 为 Termux 新增专门的 low-memory 构建方案：编译阶段尽量少占内存，同时不削减回复质量、token 上限和对话运行时内存。
- WebUI 现在使用 `webui/` 目录下独立的 React/Vite 界面作为主用户界面。内置的 `src/webui` 保留为后端/API/runtime 层。

🔧 改进

- Node.js 最低版本从 20 降低到 `18.18+`。在 Node 18/19 上应用不再因硬性要求 Node 20 而直接退出：会显示警告但继续启动。
- Termux 安装改用 `pkg install nodejs`，会检查已安装的 Node 版本并在需要安装/升级时给出明确提示。
- Docker 启动对真实服务器更友好：转发 `3000` 端口到外部，WebUI 监听 `0.0.0.0`，容器以当前用户身份运行，避免出现意外的 root 权限文件。
- 改进了 `data` 目录的处理：当前目录不可写时，girl-agent 会改用合适的用户存储目录，而不是直接报 `permission denied` 退出。
- `GIRL_AGENT_PUBLIC_URL` 继续支持反向代理/域名，但不再隐藏本地链接 —— 用户始终能看到所有入口。
- 在 userbot 配置 API ID/API HASH 时，如果选择了「作者代理」方案则不再需要填写；选择自己的 Telegram API 凭证时，字段仍然必填。
- 为所有者代理流程增加了 `GIRL_AGENT_OWNER_PROXY_API_ID` 和 `GIRL_AGENT_OWNER_PROXY_API_HASH` 环境变量，可回退到 `GIRL_AGENT_TG_API_ID`/`GIRL_AGENT_TG_API_HASH`。
- WebUI 开发服务器现在监听 `0.0.0.0`，方便在 VM/服务器上从外部访问。
- WebUI 构建中显式锁定 `esbuild`，避免不同安装场景下 JS wrapper 与 native binary 不一致。
- 保留了当前 PR 中的改进：更清晰的 Docker URL、媒体/贴纸修复、非所有者的安全记忆、插件 UX 提升，以及桌面端安装器的改进。

🐛 修复

- 修复 `runtime start failed: Invalid sockets params: ip=undefined, port=undefined, socksType=undefined` 错误，原因是之前不支持 `tg://proxy` 或代理 URL 解析有误。
- 修复了改完设置并点「应用」后，WebUI 中数值视觉上弹回旧值的问题（实际重载后已经是新值）。现在仅在保存/应用成功后才会清空 draft。
- 修复人格生成卡死：已存在 persona 文件时会复用；LLM 无响应或失败时会生成一个基础 persona 包，避免配置向导无限挂起。
- 修复 Linux/Docker 下创建 `data` 时的 permission denied 场景，不再需要手动 `chmod`。
- 修复 Telegram 媒体管线问题：图片和静态贴纸更正确地传入 vision 上下文，重复贴纸也不会在记忆中产生多余副本。
- 修复安装器/桌面流程中的边界情况：运行时更新更原子化，Ctrl/Cmd+V 粘贴在 Cyrillic 键盘布局下也能正常工作。

📝 给用户

- 本地运行 —— 用 `127.0.0.1` 或 `localhost`。
- 服务器或 Docker 中运行 —— 转发端口后用 public IP 访问。
- 想给 WebUI 加密码 —— 用 `GIRL_AGENT_WEBUI_PASSWORD=你的密码` 启动。
- 使用 Telegram 代理链接 —— 现在可以直接粘贴 `tg://proxy?...`。
- 在 Termux 中运行 —— 使用 Termux 仓库自带的 `nodejs`；不再强制要求 Node 20，但需要 `18.18+`。

## 0.3.2

日期：2026-05-13

🚀 新功能
- 扩展了项目知识库，并实现了分类化知识抽取 —— 现在会按主题分类检索答案，相关性更高。

🐛 修复
- 修正了助手上下文色和按钮文字色，提升在不同主题下的可读性。
- 修复配置向导的逻辑：「睡眠」滑块的跳过步骤和值绑定都恢复正常。


## 0.3.1

日期：2026-05-13

🚀 新功能
- 实现了「记忆宫殿（memory palace）」长期记忆存储，可以更高效地结构化并保存记忆。

🔧 改进
- 扩大了记忆捕获覆盖范围，提升记忆的连续性和复现能力，让 bot 能更好地保存和恢复对话上下文。
- 去除了硬编码的「memory boosts」设置，记忆现在更灵活、可动态配置。

🐛 修复
- 修正了 WebUI 的 Docker 构建上下文，消除了构建镜像时的错误。


## 0.3.0

日期：2026-05-13

🚀 新功能

- Memory Palace：受记忆宫殿启发的新记忆系统。角色把重要细节分到「抽屉」里：事实、事件、发现、偏好、建议、承诺、未关闭的话题、情绪和存疑事实。
- 逐字保存：重要的原话和聊天片段被原样保留，不做转述、不裁剪单词，以保留语气、细节和具体说法。
- 智能上下文注入：进入模型请求的不是整段历史，而是与当前消息相关的记忆抽屉。能在不撑爆 prompt 的前提下记住昨天/今早的事。
- 日志分块挖掘：旧日日志按 chunk 拆解，长长的一天不会因为单次 summary 的限制而丢失。
- ignored / reaction-only 消息的记忆：角色即使没回复，如果用户说了重要的事实，也仍可进入记忆。
- 通过 `npx @thesashadev/girl-agent update` 把现有 profile 迁移到 Memory Palace。
- WebUI 现在展示扩展后的记忆文件，包括 Memory Palace 抽屉。

🔧 改进

- 主动日程（Proactive agenda）使用相关的 Memory Palace 抽屉，替代原来一坨 legacy long-term 块。
- 稳定的抽屉 ID 减少对同一片段重复挖掘产生的重复。
- 旧版记忆文件继续更新，保持向后兼容。

## 0.2.2

日期：2026-05-12

🚀 新功能

- 新增用于测试 girl-agent WebUI 的能力（skill）


## 0.2.1

日期：2026-05-12

🚀 新功能
- 支持 `.gaa` 插件格式：拖拽上传、code.patch 支持，以及 pack/init CLI 命令。
- WebUI 大幅更新：全新的 React 前端 + HTTP API 和 WebSocket，界面重新设计，Markdown 预览，关系仪表盘，插件市场，以及桌面端 supervisor。
- 命令和插件设置的模态弹窗，配置向导中直接生成角色 —— WebUI 在功能上与引擎对齐。
- 为 userbot 新增周期性「心跳」—— 模拟真实用户的在线行为。
- 大量对话改进：拼写修正、消息编辑、reaction、阶段切换、删除处理、emoji 等。

🐛 修复
- 修复「应用」按钮逻辑和 AI 助手提问系统。
- 修复独立的角色生成步骤和向导中的 API 配置。
- 修复 WebUI 动态路由，更新依赖（安全审计）。
- 消除叙述泄漏，修复未闭合 code-fence 的切片问题，并规范化模型名。
- 引擎中修复错误的标记和行为：严格的工具标记校验、移除 [REPORT]、不再静默忽略而是插入占位符，改善「气泡」拆分。

🔧 改进
- 切到使用真实的 Telegram message ID 做 reaction，替代 offset。
- 扩展安装兼容性：install.sh 现在支持 Termux/Android（pkg install nodejs，不需要 glibc）。
- 预设中的 GirlAI 提供者可见但被禁用 —— 不能选中。
- 打磨插件市场、向导和整体 UI/UX。

📝 文档
- 更新俄罗斯时区相关注释。
- 新增并扩展了关于插件及 WebUI 使用的文档。


## 0.1.19

日期：2026-05-09

🔧 改进

- 改造自动发布流程：提升了自动发布 workflow 的稳定性和功能


## 0.1.18

日期：2026-05-09

- chore(ci): 将 changelog 模型切换到 gpt-5-mini
- feat(ci): 通过 GitHub Models API 实现 AI 自动生成 changelog
- 优化 profile 和模型配置的 UX


## 0.1.17

日期：2026-05-09

- Merge pull request #65 from TheSashaDev/devin/1778314838-bug-sweep
- 加固 owner id 处理
- 优化 why 和 wake 命令
- 修复 Telegram 行为和设置问题

## 0.1.16

日期：2026-05-08

- Merge pull request #63 from TheSashaDev/devin/1778244236-serialize-llm-requests
- 串行化 LLM provider 请求

## 0.1.15

日期：2026-05-08

- Merge pull request #62 from TheSashaDev/devin/1778239329-fix-proactive-memory-and-username
- fix: 主动消息考虑对话记忆 + 在系统 prompt 中加入 TG 身份

## 0.1.14

日期：2026-05-08

- Merge pull request #59 from TheSashaDev/devin/1778231542-oauth-fixed-port
- fix: 更新 OAuth 客户端凭证，并在 token 请求中加入 client_secret
- fix: OAuth 回调使用固定端口 3000

## 0.1.13

日期：2026-05-08

- Merge pull request #56 from TheSashaDev/devin/1778220196-data-migration-system
- feat: 支持 GirlAI OAuth 登录和 token 刷新
- feat: 新增 GirlAI API 预设和 LLM provider 推荐状态
- feat: 扩展迁移系统，支持 LLM 并在启动时自动运行
- fix: 打包产物的版本查找更健壮，修正 AGENTS.md 自动运行的描述
- fix: 移除未使用的 import，版本号从 package.json 动态读取，使用静态 listProfiles
- feat: AGENTS.md + 带迁移系统的 update 命令

## 0.1.12

日期：2026-05-08

- Merge pull request #58 from k1gs/fix/daily-life-sleep-schedule-11930283897782997721
- fix: 在 daily-life prompt 生成器中使用动态睡眠表
- fix: 更新 daily-life prompt 以支持动态睡眠表

## 0.1.11

日期：2026-05-07

- Merge pull request #53 from TheSashaDev/devin/1778183666-smart-busy-notify
- feat: 基于上下文、角色、阶段、时长的智能忙时通知

## 0.1.10

日期：2026-05-07

- Merge pull request #51 from TheSashaDev/devin/1778179420-proxy-wss-support
- refactor: 移除代理支持，默认启用 WSS
- feat: 为 stage 增加数字 ID 方便使用
- feat: 为 Telegram 增加代理 / WSS 支持（修复 #38、#32）

## 0.1.9

日期：2026-05-07

- Merge pull request #48 from TheSashaDev/devin/1778156776-auto-release-workflow
- Merge pull request #50 from TheSashaDev/devin/1778176335-fix-markdown-escape
- fix: userbot editLastMessage 也改用 HTML spoiler，移除无用的 escapeMarkdownV2
- fix(telegram): 用 HTML spoiler 替代 MarkdownV2，默认纯文本 (#46)
- feat(ci): 自动发布 workflow —— 每小时自动 patch 升版本 + 生成 changelog
- Merge pull request #47 from TheSashaDev/devin/1778156514-docker-latest-on-master
- fix(docker): master 分支推送时打 latest tag（不是 main）
- Merge pull request #45 from TheSashaDev/devin/1778149966-fix-dockerfile-build-stage
- fix(docker): 在 build stage 加入 build 工具以支持 arm64 native modules
- Merge pull request #44 from TheSashaDev/devin/1778149678-fix-dockerfile-arm64
- fix(docker): 为 alpine arm64 上的 native modules 增加 build 工具
- Merge pull request #43 from TheSashaDev/devin/1778149272-fix-docker-install
- fix: docker install —— 修正分支引用（main→master），拉取失败时回退到本地
- Merge pull request #37 from TheSashaDev/devin/1778090781-windows-installer-webui
- feat(server): curl|sh 安装器 + docker 镜像 + headless server 模式
- fix(cli): 非 TTY 终端大声报错 + 捕获未处理的 rejection
- feat(installer/desktop): 粘贴、ClaudeHub 推荐链接、随机名字、自定义睡眠、profile 选择
- fix(installer): Windows 静默崩溃 —— panic=abort + windowed subsystem 把 panic 藏住了
- fix(installer): 用 Space 替换进度头中空文本的 widget
- feat(installer): 内置 portable Node + cli.js，与 TS 向导完全对齐，Cyrillic 字体
- perf: 增加 release-fast profile、mold linker、windows_subsystem
- 增加 Telegram 频道和社区链接
- feat: 原生 Windows 安装器 + 桌面 app + Web UI（Rust/iced）
- Merge pull request #36 from TheSashaDev/devin/1778089384-changelog-pr35
- docs: 把 PR 35 加入 changelog

## 0.1.8 — 兼容 OpenAI 风格的 API

日期：2026-05-06

- JSON 响应优先通过 `json_schema` 请求，并对不同的 OpenAI 兼容 API 回退到 `json_object` 和 `text`。 (#33)
- LM Studio 和 Ollama 在 wizard/headless 设置中不再要求真实的 API key。
- 新增对返回 SSE/event-stream 的 OpenAI 兼容代理的兼容（即使在普通 chat completions 请求上也返回）。
- 新增 Docker 支持，可在服务器上 7×24 运行：`Dockerfile`、`docker-compose.yml`、用于 `data` 的 volume，以及 README 中的说明。 (#35)

## 0.1.7 — MarkdownV2 转义修复

日期：2026-05-06

- 修复发送包含点、括号和其他 MarkdownV2 保留字符的消息时报 `400: Bad Request: can't parse entities` 的问题。 (#15)
- 增加 `escapeMarkdownV2()` 帮助函数，转义全部 18 个保留字符。
- 在转义仍不起作用时回退为纯文本。

## 0.1.6 — --new 参数

日期：2026-05-06

- 增加 `--new` 参数，强制在创建新 profile 时打开配置向导（即使已经存在 profile）。

## 0.1.5 — owner TG 凭证代理

日期：2026-05-06

- 为无法访问 my.telegram.org 的用户（虚拟号、新号、IP 属于数据中心的 VPN）新增 TG auth 代理。
- 配置向导新增一步：选择用自己的 api_id/api_hash，还是用所有者提供的代理。
- 整个 MTProto 授权过程通过代理服务器完成 —— 所有者的凭证不会出现在用户端。
- 新增模块 `src/telegram/remote-auth.ts` —— 代理的 HTTP 客户端。
- 代理 URL 通过 `GIRL_AGENT_AUTH_PROXY` 环境变量配置（默认 `https://tgproxy.girl-agent.com`）。

## 0.1.4 — npm 发布自动化

日期：2026-05-06

- 新增 GitHub Actions workflow，在打 `v*` tag 时自动发布包到 npm。
- 增加发布规则：每次公开发布必须修改 `package.json` / `package-lock.json` 中的版本号，并在 changelog 中增加一条记录。

## 0.1.3 — Telegram 格式修复

日期：2026-05-05

- 修复：发送消息到 Telegram（bot 和 userbot）时启用 `parse_mode: "MarkdownV2"`。
- 现已支持 spoiler 格式 `||文本||` 等 MarkdownV2 样式。

## 0.1.2 — 沟通风格真实性更新

日期：2026-05-05

- 热修复：向导创建的 profile 现在保存得更早，profile 列表也不再显示缺少 `config.json` 的未保存目录。
- 增加沟通风格：**普通**、**可爱**、**二次元**、**黏人**、**话痨**。
- 新增 `CommunicationProfile`，可配置通知、消息风格、主动性和 life sharing。
- 在线状态、回复时机、消息气泡、忽略概率和主动日程都受沟通风格影响。
- 向导和 CLI 增加沟通风格设置。
- Runtime 的 `:status` 和 `:debug` 会显示当前沟通风格。
- `:log` 命令更顺手，支持按天/按行数限制输出。
- 旧 `vibe` 字段会自动归一化到新格式。

## 0.1.1 — 稳定基线

日期：2026-05-05

- 首个公开发布的稳定版本，包含 Telegram bot / userbot 模式。
- 人设、说话风格、关系状态、记忆、冲突和主动日程模块。
- 提供安装、配置、真实性模块和故障排查文档。
