import { COMMUNICATION_PRESETS } from "../presets/communication.js";
import { LLM_PRESETS } from "../presets/llm.js";
import { STAGE_PRESETS } from "../presets/stages.js";

export interface KnowledgeArticle {
  category: string;
  subcategory: string;
  title: string;
  keywords: string[];
  body: string;
}

const CORE_KNOWLEDGE_BASE: KnowledgeArticle[] = [
  {
    category: "overview",
    subcategory: "product",
    title: "什么是 girl-agent",
    keywords: ["项目", "girl-agent", "机器人", "是什么", "概念", "架构", "理念"],
    body: "girl-agent 是 Telegram 人格引擎，而非普通聊天机器人。它模拟女孩的鲜活行为：在线/离线、睡眠、忙碌、心情、记忆、关系阶段、冲突、延迟、反应、贴纸、错别字和主动消息。README 特别强调：她并非每条消息都回复，有时已读不回——这是设计意图。"
  },
  {
    category: "overview",
    subcategory: "layers",
    title: "分层架构",
    keywords: ["分层", "架构", "runtime", "prompt", "behavior", "presence", "memory"],
    body: "行为由多个层次组成：Telegram 适配器接收事件；Runtime 编排状态；presence 决定可用性；behavior-tick 选择意图/延迟/反应；prompt 组合 persona/speech/boundaries/relationship/memory；LLM 撰写文本；storage 记录日志、score、memory、agenda。因此不能用单个 system prompt 来解释问题——几乎总需要查看负责该症状的层。"
  },
  {
    category: "overview",
    subcategory: "tech-stack",
    title: "项目技术栈",
    keywords: ["技术栈", "typescript", "node", "react", "vite", "grammy", "gramjs", "tsup", "rust", "desktop"],
    body: "运行时：Node.js >=20，TypeScript strict，ESM。构建：tsup 输出到 dist/cli.js。WebUI：React + Vite。Telegram：grammY 用于 bot 模式，GramJS/telegram 用于 userbot。LLM：OpenAI-compatible 和 Anthropic SDK。桌面端：Rust/iced 在 desktop-rs。TypeScript 导入使用 .js 扩展名。"
  },
  {
    category: "overview",
    subcategory: "project-structure",
    title: "目录地图",
    keywords: ["目录", "文件", "结构", "src", "engine", "webui", "telegram", "storage"],
    body: "src/engine — 行为核心：runtime, presence, behavior-tick, prompt, memory-palace, conflict, agenda, daily-life。src/telegram — bot/userbot 适配器。src/llm — 提供商客户端。src/storage/md.ts — 文件存储。src/webui — HTTP API, runtime bus, routes。webui/src — React 页面。src/presets — stages, llm, communication。"
  },
  {
    category: "overview",
    subcategory: "commands",
    title: "开发与启动命令",
    keywords: ["命令", "npm", "build", "typecheck", "dev", "start", "server", "update", "addon"],
    body: "主要命令：npm install, npm run dev, npm run build, npm run typecheck, npm run start。CLI：npx girl-agent 启动 WebUI；--profile 启动配置文件；server --print-config/--config/--headless 用于服务器；update 应用数据迁移；addon init/pack 处理 .gaa 插件。"
  },
  {
    category: "storage",
    subcategory: "data-root",
    title: "数据存放位置",
    keywords: ["data", "GIRL_AGENT_DATA", "文件夹", "配置文件", "windows", "macos", "linux", "存储"],
    body: "配置文件根目录取自 GIRL_AGENT_DATA，否则在源码中为 ./data，在 npm/global 启动时为 XDG data dir，在 Windows 为 %APPDATA%/girl-agent/data，在 macOS 为 ~/Library/Application Support/girl-agent/data。每个配置文件位于 data/<slug>/。"
  },
  {
    category: "storage",
    subcategory: "profile-files",
    title: "配置文件",
    keywords: ["config.json", "persona.md", "speech.md", "boundaries.md", "communication.md", "relationship.md", "agenda.json"],
    body: "config.json 存储 ProfileConfig。persona.md — 人格，speech.md — 言语，boundaries.md — 界限，communication.md — 沟通风格。relationship.md 存储 stage 和 score。agenda.json — 未来的主动消息。conflict.json — 当前冲突和 coldUntil。"
  },
  {
    category: "storage",
    subcategory: "memory-files",
    title: "记忆文件",
    keywords: ["memory", "long-term", "facts", "uncertain", "timeline", "promises", "open-loops"],
    body: "主要记忆文件：memory/long-term.md, memory/facts.md, memory/uncertain.md, relationship/timeline.md, time/open-loops.md, time/promises.md。还有旧版 long-term.md。MemoryPage 和 assistant 只允许安全白名单路径，外加 memory/daily/YYYY-MM-DD.md, memory/episodes/*.md, memory/palace/*。"
  },
  {
    category: "storage",
    subcategory: "logs-and-days",
    title: "日志与每日摘要",
    keywords: ["log", "daily", "summary", "session", "日记", "日期", "05:00"],
    body: "log/YYYY-MM-DD.md — 会话日志。sessionDate 根据配置文件时区计算日期；在当地时间 05:00 之前的事件属于前一天。memory/daily/YYYY-MM-DD.md — 每日摘要，用于长上下文和搜索过去的日子。"
  },
  {
    category: "config",
    subcategory: "profile-config",
    title: "ProfileConfig",
    keywords: ["ProfileConfig", "config", "slug", "name", "age", "nationality", "tz", "mode"],
    body: "ProfileConfig 包含 slug, name, age, nationality RU/UA, timezone, mode bot/userbot, stage, llm, telegram, ownerId, privacy, sleepFrom/sleepTo, nightWakeChance, ignoreTendency, vibe, communication, personaNotes, addons 和 busySchedule。读取时 storage 会规范化 ownerId、communication 和 ignoreTendency。"
  },
  {
    category: "config",
    subcategory: "sleep-and-schedule",
    title: "睡眠与忙碌",
    keywords: ["sleepFrom", "sleepTo", "nightWakeChance", "busySchedule", "睡眠", "时间表", "忙碌"],
    body: "sleepFrom/sleepTo — 睡眠时间 0..23，可跨午夜。nightWakeChance — 夜间醒来几率（无需 :wake）。busySchedule 包含 label, days, from/to 和 checkAfterMin；daily-life 和 presence 使用它来解释延迟和手机不可用。"
  },
  {
    category: "telegram",
    subcategory: "bot-mode",
    title: "Bot 模式",
    keywords: ["bot", "grammy", "Bot API", "令牌", "message_reaction", "机器人"],
    body: "bot 模式使用 grammY 和 telegram.botToken。接收 message 和 message_reaction，可执行 sendMessage、typing action、setMessageReaction、editMessageText 和 sendSticker。设置更简单，但显示为机器人且受 Bot API 限制。"
  },
  {
    category: "telegram",
    subcategory: "userbot-mode",
    title: "Userbot 模式",
    keywords: ["userbot", "gramjs", "mtproto", "apiId", "apiHash", "sessionString", "真实账号"],
    body: "userbot 模式使用 GramJS/MTProto 作为普通 Telegram 账号。需要 apiId/apiHash 和通过授权获得的 sessionString。支持 readHistory、typing、reactions、stickers、block/unblock/reportSpam 以及通过 raw updates 处理已删除消息。"
  },
  {
    category: "telegram",
    subcategory: "wss-and-proxy",
    title: "WSS 与代理",
    keywords: ["wss", "useWSS", "proxy", "socks", "封锁", "443"],
    body: "telegram.useWSS 默认为 true，通过 443 端口使用 WebSocket 而非 TCP 80——这有助于应对 Telegram 封锁。对于 userbot，可在 config 中或通过 GIRL_AGENT_TG_PROXY 设置 SOCKS 代理。"
  },
  {
    category: "telegram",
    subcategory: "privacy",
    title: "隐私与所有者",
    keywords: ["privacy", "owner", "ownerId", "allow-strangers", "strangers", "陌生人", "primary"],
    body: "privacy=owner-only 仅回复 ownerId/primary owner。allow-strangers 允许陌生人私聊，但 relationshipScope=acquaintance：无主要男友记忆、无恋爱历史，且在主要关系已 committed 时有界限。"
  },
  {
    category: "runtime",
    subcategory: "runtime-bus",
    title: "WebUI 中的 RuntimeBus",
    keywords: ["runtimebus", "runtime", "start", "stop", "pause", "resume", "restart", "logs"],
    body: "RuntimeBus 为每个配置文件维护 Runtime，状态有 running/paused/stopped/error，以及最近 500 个事件的环形缓冲区。WebUI 通过它启动/停止配置文件，显示 status 和 recentLogs，WebSocket 分发 UI 事件。"
  },
  {
    category: "runtime",
    subcategory: "message-flow",
    title: "入站消息路径",
    keywords: ["handleIncoming", "incoming", "message flow", "消息", "回复"],
    body: "Telegram 适配器创建 IncomingMessage。Runtime 检查隐私/所有者、media、删除/反应、历史、presence、conflict、active dialog 和 behavior-tick。如果 shouldReply=false，记录 ignored/read。如果 reply — scheduleReply 延迟后 generateAndSend 组合 prompt、调用 LLM、清理回复、分割成 bubbles 并发送。"
  },
  {
    category: "runtime",
    subcategory: "behavior-tick",
    title: "Behavior tick",
    keywords: ["behavior", "intent", "reply", "ignore", "short", "left-on-read", "reaction-only", "delay", "moodDelta"],
    body: "behavior-tick — 内部决策层。返回 JSON：intent, shouldReply, shouldRead, delaySec, bubbles, typing, reaction, reactionTargetMessageId, ignoreReason 和 moodDelta。它考虑 stage defaults、score、ignoreTendency、presence、conflict、active dialog 和最近消息。"
  },
  {
    category: "runtime",
    subcategory: "presence",
    title: "存在模拟",
    keywords: ["presence", "online", "offline", "phone-attached", "burst-checker", "rare-checker", "evening-only", "night"],
    body: "PresenceProfile 确定性选择模式：phone-attached, burst-checker, rare-checker, evening-only 或 phone-attached-night。它设置 checkEveryMin、onlineWindowMin、offlineReplyChance 和 nightWakeChance。Communication 通知和 stage 可以加速/减慢可用性。"
  },
  {
    category: "runtime",
    subcategory: "ignore-tendency",
    title: "ignoreTendency",
    keywords: ["ignoreTendency", "无视", "沉默", "不回复", "read", "left-on-read"],
    body: "ignoreTendency 0..100 — 特征权重，而非直接百分比。0 几乎无故不忽视，35 默认，70+ 冷淡且经常消失。睡眠、忙碌、阶段、冲突和 score 影响更大。当抱怨'不回复'时，检查 runtime state、recent logs、sleep/busy/conflict/stage/score。"
  },
  {
    category: "runtime",
    subcategory: "active-dialog",
    title: "活跃对话",
    keywords: ["活跃对话", "activeDialog", "爆发", "快速回复", "不消失"],
    body: "如果她最近刚回复过，而他在几分钟内又发了消息，Runtime 标记为 activeDialog。行为层应继续对话，不应无故随机无视。这让对话像真实的聊天，而非独立请求。"
  },
  {
    category: "runtime",
    subcategory: "bubbles",
    title: "消息气泡",
    keywords: ["bubbles", "气泡", "split", "---", "消息", "拆分"],
    body: "LLM 接收指示：如果 bubbles > 1，用'---'分隔消息。smartSplitBubbles 和 dedupeBubbles 将回复转换为单独的 TG 消息。禁止不带'---'的换行，因为在 Telegram 中这是单条竖排消息，暴露 AI 身份。"
  },
  {
    category: "runtime",
    subcategory: "typing-and-delays",
    title: "输入状态与延迟",
    keywords: ["typing", "delay", "延迟", "正在输入", "scheduleReply", "sendBubbles"],
    body: "delaySec 来自 behavior-tick，可能因 offline/busy 而增加。scheduleReply 设置计时器。sendBubbles 模拟输入状态：第一条气泡前短暂暂停，气泡之间根据文本长度和 WPM 延迟。如果 userbot 可用，发送前可能执行 readHistory。"
  },
  {
    category: "runtime",
    subcategory: "anti-ai",
    title: "反 AI 与清洗",
    keywords: ["anti-ai", "sanitize", "markdown", "jailbreak", "system prompt", "chatgpt", "技术错误"],
    body: "ANTI_AI_RULES 禁止 ChatGPT 行为、markdown 和元短语。security.ts 清理 code fences、action leak narration、system/developer 标签、CJK 垃圾文本和技术错误回复。类似 jailbreak 的长回复会被丢弃；技术错误时 Runtime 进入安全 fallback/ignored。"
  },
  {
    category: "runtime",
    subcategory: "media",
    title: "媒体",
    keywords: ["media", "photo", "voice", "video", "video_note", "sticker", "document", "照片", "语音"],
    body: "IncomingMedia 描述照片、视频、语音、视频消息、贴纸或文档。如果提供商支持，带 base64 的照片作为 image part 传递给 LLM。对于未转文字的语音，角色可能要求发文字。对于索要照片/视频/语音的请求，Runtime 通常回复'现在不想拍照'之类的拒绝。"
  },
  {
    category: "runtime",
    subcategory: "deleted-messages",
    title: "已删除消息",
    keywords: ["已删除", "deleted", "delete", "saw-and-read", "saw-not-read", "missed"],
    body: "deletion-handler 分类删除：saw-and-read — 她已读且可能说'晚了，我看到了'；saw-not-read — 她看到有消息但未读，可能要求展示；missed — 没注意到，保持沉默。Userbot 缓存入站消息，以便通过 raw update 恢复文本。"
  },
  {
    category: "runtime",
    subcategory: "emoji-reactions",
    title: "用户反应",
    keywords: ["emoji", "reaction", "反应", "有毒的", "positive", "react-back", "silent-mood"],
    body: "emoji-reaction-handler 将反应分为 toxic、positive、funny、sad、neutral。对她的消息使用有毒表情通常默默降低 mood；但如果表情是针对她文本中描述的外部情况，annoyance 不会增加。Positive 有时回以反应/简短文本，但更多是沉默。取消反应通常被忽略。"
  },
  {
    category: "runtime",
    subcategory: "typos",
    title: "逼真的错别字",
    keywords: ["typos", "错别字", "键盘", "qwerty", "错误"],
    body: "typos.ts 在 LLM 之后插入错别字以控制密度。类型：相邻键位、遗漏、重复、相邻字母交换、罕见的 RU/EN 键盘布局错误。不破坏短词、链接、表情符号和标点。强度取决于 communication messageStyle 和 vibe。"
  },
  {
    category: "relationship",
    subcategory: "stages",
    title: "关系阶段",
    keywords: ["stage", "阶段", "关系", "见面", "cold", "warming", "dating", "long-term", "dumped"],
    body: "阶段决定亲密程度、语气、无视和延迟的几率。主要顺序：met-irl-got-tg → tg-given-cold → tg-given-warming → convinced → first-date-done → dating-early → dating-stable → long-term。dumped — 服务用终端阶段，完全无视。"
  },
  {
    category: "relationship",
    subcategory: "score",
    title: "关系评分",
    keywords: ["score", "interest", "trust", "attraction", "annoyance", "cringe", "指标"],
    body: "RelationshipScore：interest — 兴趣，trust — 信任，attraction — 浪漫/身体吸引，annoyance — 恼怒，cringe — 令人尴尬/压力行为程度。Score 通过 moodDelta 和 reflection 变化，影响 conflict、stage transitions、激素 stressLoad、ignore 和语气。"
  },
  {
    category: "relationship",
    subcategory: "stage-transitions",
    title: "自动切换阶段",
    keywords: ["stage transition", "自动切换", "提升", "降低", "回退", "upgrade", "downgrade"],
    body: "decideStageTransition 并非随机：先检查 downgrade，再 check upgrade。升级需要当前阶段至少 6 条她的消息、合适的 score 且无活跃冲突。降级在 annoyance 高、interest/trust 低或温暖阶段大量无视时触发。dumped 不会自动提升。"
  },
  {
    category: "relationship",
    subcategory: "dumped",
    title: "dumped",
    keywords: ["dumped", "拒绝了", "分手", "重置", "reset", "不回复"],
    body: "dumped — '拒绝了'服务阶段：ignoreChance=1.0 且巨大延迟。Runtime 在 annoyance > 80 且 interest < -30 时可能设置 dumped。退出方式 — :reset 或手动 set_stage。reset 清除 score、长期记忆、conflict，从 dumped 返回 tg-given-cold。"
  },
  {
    category: "relationship",
    subcategory: "timeline",
    title: "relationship/timeline.md",
    keywords: ["timeline", "关系历史", "relationship", "阶段已变更"],
    body: "maybeAdvanceRelationshipTimeline 在阶段变更时将现有记忆迁移到 Memory Palace，并在 relationship/timeline.md 中写入类似'阶段已变更 previous → next'的行。这对助手回答关系如何发展很重要。"
  },
  {
    category: "conflict",
    subcategory: "levels",
    title: "冲突级别",
    keywords: ["conflict", "冲突", "coldUntil", "委屈", "level", "沉默"],
    body: "conflict.json 存储 level 0..4、reason、since、coldUntil 和 history。level 1 — 轻微委屈约一小时，2 — 委屈数小时/天，3 — 严重冲突数天，4 — 接近分手。coldUntil 生效期间，behavior 几乎总是 ignore 或冷淡 short。"
  },
  {
    category: "conflict",
    subcategory: "escalation",
    title: "升级与和解",
    keywords: ["escalate", "soften", "annoyance", "cringe", "interestDrop", "和好"],
    body: "escalateFromMood 查看 delta annoyance/cringe/interestDrop 和当前 score。trigger >= 8 产生轻微委屈，>=15 更严重，>=25 或 annoyance >70 — level 3。annoyance >85 + cringe >70 + interest < -30 导致 level 4。softenFromMood 在 positive delta attraction+trust+interest >=12 时降低 level。"
  },
  {
    category: "memory",
    subcategory: "memory-palace",
    title: "Memory Palace",
    keywords: ["memory palace", "mempalace", "palace", "hall", "drawer", "记忆", "宫殿"],
    body: "Memory Palace — memory/palace 中的结构化记忆。分为 halls 和 drawers，可按入站消息搜索并混入 prompt。这不是向量数据库：采用文件存储，相关上下文的选择轻量且本地化。"
  },
  {
    category: "memory",
    subcategory: "halls",
    title: "Memory Palace 大厅",
    keywords: ["hall_facts", "hall_events", "hall_discoveries", "hall_preferences", "hall_advice", "hall_promises", "hall_open_loops", "hall_feelings", "hall_uncertain"],
    body: "大厅：hall_facts — 事实；hall_events — 事件；hall_discoveries — 关于他/她的发现；hall_preferences — 偏好；hall_advice — 建议；hall_promises — 承诺；hall_open_loops — 未闭合话题；hall_feelings — 感受；hall_uncertain — 不确定/未确认的信息。"
  },
  {
    category: "memory",
    subcategory: "recording",
    title: "记忆记录",
    keywords: ["recordInteractionMemory", "maybeReflect", "memory", "reflect", "interaction"],
    body: "主交互后 Runtime 调用 recordInteractionMemory。大约每 6 轮 maybeReflect 可能将反思写入长期记忆，并考虑 conflict。agenda 使用来自消息的未来事件；daily summaries 用于关闭过期/当前会话。"
  },
  {
    category: "memory",
    subcategory: "retrieval",
    title: "在 prompt 中检索记忆",
    keywords: ["retrieval", "searchDailySummaries", "loadMemoryPalaceContext", "recall", "prompt"],
    body: "buildSystemPrompt 读取 persona/speech/communication/relationship、旧记忆，并在有入站消息时搜索 daily summaries。Runtime 额外传递 loadRealismContext=loadMemoryPalaceContext，添加相关的 palace drawers。模型应将记忆作为背景，不引用'日志中写道'。"
  },
  {
    category: "life",
    subcategory: "daily-life",
    title: "Daily-life",
    keywords: ["daily-life", "生活", "白天", "blocks", "events", "wants", "weather", "时间表"],
    body: "daily-life 生成一天的生活：weather、vibe、activity blocks、events 和 wants。缓存存储在 data/<slug>/daily-life/YYYY-MM-DD.md。生成考虑 persona、年龄、stage、timezone、sleep 和 busySchedule，conflict 会让一天更沉重。"
  },
  {
    category: "life",
    subcategory: "age-context",
    title: "年龄与学业",
    keywords: ["年龄", "学校", "大学", "学院", "课程", "课"],
    body: "prompt.ts 单独控制学业语言。17 岁以下她是学生：'课'、'学校'、'课间'、'作业'，而非'课程/大学/讲座'。17-22 岁可以是学院/大学，如果 persona 允许。Daily-life 在 blocks 中也考虑这一点。"
  },
  {
    category: "life",
    subcategory: "agenda",
    title: "主动议程",
    keywords: ["agenda", "主动", "主动发消息", "消息", "提醒", "事件"],
    body: "Agenda 引擎为用户未来事件和主动发消息的理由做 mental notes。extractAgendaUpdates 在他的消息后创建/更新/取消项目；tickAgenda 大约每分钟检查到期的项目；handleResponseToProactive 理解他的反应。在 cold 阶段 agenda 几乎不创建任何内容。"
  },
  {
    category: "life",
    subcategory: "autonomous-agenda",
    title: "自主消息",
    keywords: ["autonomous", "自主", "主动", "initiative", "lifeSharing", "主动发消息"],
    body: "ensureAutonomousAgenda 可创建不依赖于用户明确未来事件的自主发消息理由。这取决于 stage、communication initiative/lifeSharing、conflict 和日间上下文。Runtime 不会刷屏：每次 tick 最多一个到期项目，如果最近有活动则不打扰。"
  },
  {
    category: "persona",
    subcategory: "prompt-files",
    title: "persona/speech/boundaries/communication",
    keywords: ["persona", "speech", "boundaries", "communication.md", "人格", "言语", "界限"],
    body: "persona.md 描述人格和传记，speech.md — 说话方式和口头禅，boundaries.md — 禁止事项和个人界限，communication.md — 沟通风格。buildSystemPrompt 将这些文件作为主要来源插入，因此最好通过 MemoryPage 或 assistant tools 编辑，而非修改代码。"
  },
  {
    category: "persona",
    subcategory: "generation",
    title: "人格生成",
    keywords: ["generatePersonaPack", "generate_persona", "创建人格", "setup", "personaNotes"],
    body: "generatePersonaPack 通过 LLM 创建 persona.md、speech.md、boundaries.md 和 communication.md。Assistant tool generate_persona 使用当前的 name/age/nationality/personaNotes。SetupFlow 和 CLI 也可生成初始配置文件。"
  },
  {
    category: "communication",
    subcategory: "fields",
    title: "CommunicationProfile",
    keywords: ["communication", "notifications", "messageStyle", "initiative", "lifeSharing"],
    body: "CommunicationProfile 由 notifications muted/normal/priority、messageStyle one-liners/balanced/bursty/longform、initiative low/medium/high、lifeSharing low/medium/high 组成。它影响 presence、agenda、错别字密度、prompt 和活跃对话中的行为。"
  },
  {
    category: "communication",
    subcategory: "legacy-vibe",
    title: "legacy vibe",
    keywords: ["vibe", "short", "warm", "legacy", "deriveLegacyVibe"],
    body: "旧字段 vibe 保留用于兼容。vibe=warm 大致映射为可爱/温暖风格，vibe=short — 另类/简短回复/低主动性。新设置是 communication，vibe 仅为旧版遗留。"
  },
  {
    category: "llm",
    subcategory: "client",
    title: "LLM client",
    keywords: ["llm", "openai", "anthropic", "client", "timeout", "retries", "json"],
    body: "src/llm/index.ts 提供统一的 LLMClient.chat，支持 OpenAI-compatible 和 Anthropic。有 120s timeout、maxRetries=1，通过队列序列化调用以避免并行请求压垮提供商。选项：temperature、maxTokens、json/jsonSchema。"
  },
  {
    category: "llm",
    subcategory: "providers",
    title: "LLM 提供商",
    keywords: ["provider", "preset", "claudehub", "openrouter", "groq", "deepseek", "mistral", "gemini", "ollama"],
    body: "LLM presets 包括 claudehub、openai、lmstudio、ollama、anthropic、openrouter、groq、deepseek、mistral、google、xai、together、fireworks、perplexity、cerebras 等。每个有 proto openai/anthropic、baseURL、defaultModel、models、apiKeyRequired 和 hints。GirlAI 当前已禁用。"
  },
  {
    category: "llm",
    subcategory: "oauth",
    title: "OAuth GirlAI",
    keywords: ["oauth", "girlai", "refresh token", "access token", "expires"],
    body: "LLM config 支持 oauthRefreshToken 和 oauthExpiresAt。OpenAILike 调用前执行 ensureFreshToken：如果 token 过期，refreshAccessToken 更新 access/refresh tokens。refresh 出错时 oauth 字段被清除，以免破坏后续设置。"
  },
  {
    category: "diagnostics",
    subcategory: "runtime-commands",
    title: "Runtime 命令",
    keywords: ["status", "why", "wake", "debug", "reset", "stage", "sticker", "amnesia", "命令"],
    body: "assistant 中的 send_command 可发送 runtime 命令：status、why、wake、debug、reset。Runtime 还有 :stage、:sticker、:amnesia 和其他 CLI/chat 命令。status — 总体快照，why — 最近决策原因，debug — 扩展 presence/stage/conflict/score/communication，wake — 临时唤醒，reset — 清除 score/memory/conflict。"
  },
  {
    category: "diagnostics",
    subcategory: "not-replying",
    title: "如果她不回复",
    keywords: ["不回复", "沉默", "ignore", "ignored", "为什么", "why", "read_logs"],
    body: "排查步骤：检查 RuntimeBus state 和 lastError；read_logs 查 ignored/error；why/debug 命令；sleep/busy/presence；conflict coldUntil；stage defaults ignoreChance；ignoreTendency；score annoyance/cringe/interest；LLM/provider 错误；Telegram 模式/token/session。如果原因是 stage/sleep/conflict，不要急着建议换模型。"
  },
  {
    category: "diagnostics",
    subcategory: "llm-errors",
    title: "LLM 错误",
    keywords: ["401", "403", "429", "quota", "billing", "timeout", "api key", "baseURL", "model", "模型错误"],
    body: "silentErrorLabel 将技术错误分类为 auth/quota/rate-limit/network/provider。LLM 错误时检查 llm.presetId、proto、baseURL、apiKey、model、余额/配额以及 max_tokens/max_completion_tokens 兼容性。本地 LM Studio/Ollama 可能无需真实密钥即可运行。"
  },
  {
    category: "diagnostics",
    subcategory: "telegram-errors",
    title: "Telegram 错误",
    keywords: ["telegram error", "BOT_TOKEN", "API_ID", "API_HASH", "session", "connect", "timeout"],
    body: "bot 模式需要 telegram.botToken。userbot 需要 apiId/apiHash/sessionString，可能在 connect/getMe 时失败。应对封锁启用 useWSS 或 proxy。GIRL_AGENT_DEBUG=1 打印 userbot connect/getMe/handlers 调试信息。"
  },
  {
    category: "webui",
    subcategory: "pages",
    title: "WebUI 页面",
    keywords: ["webui", "页面", "assistant", "configuration", "diagnostics", "logs", "memory", "relationship", "addons"],
    body: "WebUI React 页面：SetupFlow — 初次设置；ConfigurationPage — 配置；AssistantPage — 助手（含 tool blocks 和问题按钮）；DiagnosticsPage — 运行时/系统诊断；LogsPage — 事件；MemoryPage — 编辑/预览记忆；RelationshipPage — 阶段/评分/时间线；AddonsPage — 市场/已安装。"
  },
  {
    category: "webui",
    subcategory: "assistant",
    title: "WebUI assistant",
    keywords: ["assistant", "助手", "tool", "question", "按钮", "assistant page"],
    body: "AssistantPage 发送 /api/assistant/chat 消息历史。回复可包含 <tool> JSON 块（UI 显示为可应用的操作），以及带 options 的 <question>（渲染为按钮）。用户确认 tool calls，它们不会自动应用。"
  },
  {
    category: "webui",
    subcategory: "assistant-tools",
    title: "助手工具",
    keywords: ["set_field", "set_stage", "write_memory", "append_memory", "runtime_action", "read_logs", "read_memory", "list_presets"],
    body: "后端助手工具：set_field、set_stage、set_communication_preset、write_memory、append_memory、generate_persona、runtime_action、send_command、list_presets、read_logs、read_memory。ALLOWED_FIELDS 和 ALLOWED_MEMORY 限制可更改内容，防止助手写入任意文件。"
  },
  {
    category: "webui",
    subcategory: "theme-and-css",
    title: "WebUI 主题与按钮",
    keywords: ["theme", "dark", "light", "css", "按钮", "颜色", "bone", "ink"],
    body: "styles.css 使用 bone/ink 调色板和 CSS 变量。在 light/dark 中 --bone 和 --ink 变化，app colors 通过 --ga-text、--ga-bg-* 和 --ga-border 设置。按钮文本必须显式继承或使用 --ga-text，否则浏览器默认可能导致对比度差。"
  },
  {
    category: "webui",
    subcategory: "api",
    title: "WebUI API",
    keywords: ["api", "routes", "profiles", "presets", "system", "tg-auth", "addons", "websocket"],
    body: "src/webui/routes 包含 profiles、presets、assistant、addons、system、tg-auth。runtime-bus 提供 runtime state/logs，websocket 发送 live events。static.ts 提供 webui/dist。system diagnostics 显示 platform、arch、node、dataRoot、ipv4 和 memory。"
  },
  {
    category: "addons",
    subcategory: "format",
    title: ".gaa 插件格式",
    keywords: ["addon", "gaa", "manifest", "files", "config.patch", "theme.css", "install.sh"],
    body: ".gaa — 插件文件夹的 zip 压缩包。manifest.json 必需。files/ 复制到 data/<slug>/，config.patch.json 深度合并到 config，code.patch 可通过 git apply 应用，theme.css 添加 CSS，install.sh 可选。市场来自 GIRL_AGENT_ADDON_REGISTRY 或 GitHub raw registry。"
  },
  {
    category: "addons",
    subcategory: "manifest",
    title: "插件 manifest.json",
    keywords: ["manifest", "addon", "id", "version", "compatibility", "settings"],
    body: "Manifest 需要 id/name/description/version。附加：author、compatibility semver 范围、tags、dependencies、settings、icon、homepage。Settings 支持 string/number/boolean/select，带 default/options/required。"
  },
  {
    category: "migrations",
    subcategory: "data-migrations",
    title: "数据迁移",
    keywords: ["migration", "update", "0112", "0113", "0114", "迁移"],
    body: "src/migrations 包含版本化数据迁移。RuntimeBus 在启动前检查待处理的 migrations 并运行 runMigrations。CLI update [--verbose] 手动应用迁移。最近的：0112 useWSS default、0113 communication.md、0114 Memory Palace。"
  },
  {
    category: "desktop",
    subcategory: "wrapper",
    title: "desktop-rs",
    keywords: ["desktop", "rust", "iced", "windows", "installer", "json-events"],
    body: "README 描述 desktop-rs：原生 Rust/iced 客户端和 Windows 安装向导。它安装 Node 包、创建配置文件并在 127.0.0.1:7777 打开 WebUI。CLI 支持 --json-events/--headless 用于桌面包装器。"
  },
  {
    category: "release",
    subcategory: "install",
    title: "用户安装",
    keywords: ["install", "安装", "curl", "docker", "npx", "node", "server", "systemd"],
    body: "用户安装：curl install.sh 安装 docker wrapper 或本地 Node 22 LTS 到 ~/.local/share/girl-agent/runtime，不需要 sudo。替代方案：npx @thesashadev/girl-agent、docker run 加载 /data 卷、server --print-config/--print-systemd/--print-docker。"
  }
];

function generatedKnowledge(): KnowledgeArticle[] {
  return [
    ...STAGE_PRESETS.map(stage => ({
      category: "relationship",
      subcategory: `stage-${stage.num}`,
      title: `${stage.num}. ${stage.id}`,
      keywords: ["stage", "阶段", stage.id, stage.label, String(stage.num)],
      body: `${stage.label}: ${stage.description}. Defaults: interest=${stage.defaults.interest}, trust=${stage.defaults.trust}, attraction=${stage.defaults.attraction}, annoyance=${stage.defaults.annoyance}, cringeTolerance=${stage.defaults.cringeTolerance}, ignoreChance=${stage.defaults.ignoreChance}, replyDelaySec=${stage.defaults.replyDelaySec[0]}-${stage.defaults.replyDelaySec[1]}.`
    })),
    ...COMMUNICATION_PRESETS.map(preset => ({
      category: "communication",
      subcategory: `preset-${preset.id}`,
      title: `Communication preset ${preset.id}`,
      keywords: ["communication", "preset", "沟通", preset.id, preset.label],
      body: `${preset.label}: ${preset.description}. notifications=${preset.profile.notifications}, messageStyle=${preset.profile.messageStyle}, initiative=${preset.profile.initiative}, lifeSharing=${preset.profile.lifeSharing}.`
    })),
    {
      category: "llm",
      subcategory: "preset-index",
      title: "LLM presets 索引",
      keywords: ["llm", "preset", "提供商", ...LLM_PRESETS.map(p => p.id)],
      body: LLM_PRESETS.map(p => `${p.id}: ${p.name}, proto=${p.proto}, default=${p.defaultModel || "custom"}${p.baseURL ? `, baseURL=${p.baseURL}` : ""}${p.disabled ? `, disabled=${p.disabledReason ?? "yes"}` : ""}${p.hint ? `, hint=${p.hint}` : ""}`).join("\n")
    },
    {
      category: "addons",
      subcategory: "integration-index",
      title: "插件替代 MCP",
      keywords: ["addons", "插件", "集成", "gaa", "mcp"],
      body: "外部扩展现在显示为插件。MCP 预设不在 WebUI 中作为独立系统输出；集成通过 Marketplace/.gaa 安装，可修改 config.patch.json、配置文件、主题或 code.patch。"
    }
  ];
}

function knowledgeBase(): KnowledgeArticle[] {
  return [...CORE_KNOWLEDGE_BASE, ...generatedKnowledge()];
}

export function renderRelevantKnowledge(query: string, limit = 8): string {
  const articles = selectKnowledgeArticles(query, limit);
  return [
    "girl-agent 项目知识库：",
    renderKnowledgeIndex(),
    "选定的相关类别/子类别：",
    ...articles.map(a => `## ${a.category} / ${a.subcategory}: ${a.title}\n${a.body}`),
    "如果问题未被选定的文章涵盖——请谨慎说明并建议检查具体配置、记忆或 runtime logs。"
  ].join("\n\n");
}

function renderKnowledgeIndex(): string {
  const grouped = new Map<string, string[]>();
  for (const article of knowledgeBase()) {
    const list = grouped.get(article.category) ?? [];
    if (!list.includes(article.subcategory)) list.push(article.subcategory);
    grouped.set(article.category, list);
  }
  return [...grouped.entries()]
    .map(([category, subcategories]) => `- ${category}: ${subcategories.join(", ")}`)
    .join("\n");
}

function selectKnowledgeArticles(query: string, limit: number): KnowledgeArticle[] {
  const normalized = normalizeSearchText(query);
  const terms = searchTerms(normalized);
  const scored = knowledgeBase()
    .map(article => ({ article, score: knowledgeScore(article, normalized, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.article);
  if (scored.length) return scored;
  return knowledgeBase()
    .filter(article => article.category === "overview" || article.category === "diagnostics")
    .slice(0, limit);
}

function knowledgeScore(article: KnowledgeArticle, normalizedQuery: string, terms: string[]): number {
  const haystack = normalizeSearchText([
    article.category,
    article.subcategory,
    article.title,
    article.keywords.join(" "),
    article.body
  ].join(" "));
  let score = 0;
  for (const keyword of article.keywords) {
    const normalizedKeyword = normalizeSearchText(keyword);
    if (normalizedKeyword && normalizedQuery.includes(normalizedKeyword)) score += 6;
  }
  for (const term of terms) {
    if (article.category.includes(term) || article.subcategory.includes(term)) score += 3;
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function searchTerms(text: string): string[] {
  return [...new Set(text.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(t => t.length >= 3))];
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase();
}
