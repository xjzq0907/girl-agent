//! Static catalogues mirrored from the TS wizard.
//!
//! Kept in sync with `src/presets/llm.ts`, `src/presets/stages.ts`,
//! `src/presets/communication.ts` and `src/data/timezones.ts`.

#[derive(Debug, Clone)]
pub struct LlmPreset {
    pub id: &'static str,
    pub label: &'static str,
    pub proto: &'static str, // "openai" | "anthropic"
    pub base_url: Option<&'static str>,
    pub default_model: &'static str,
    pub default_api_key: Option<&'static str>,
    pub api_key_required: bool,
    pub custom: bool,
    pub models: &'static [&'static str],
    pub hint: &'static str,
    pub recommended: bool,
    pub referral_url: Option<&'static str>,
    pub referral_label: Option<&'static str>,
}

pub const LLM_PRESETS: &[LlmPreset] = &[
    LlmPreset {
        id: "deepseek",
        label: "DeepSeek",
        proto: "openai",
        base_url: Some("https://api.deepseek.com"),
        default_model: "deepseek-v4-flash",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
        hint: "国内推荐 · 性价比高 · 中文能力强 · deepseek-v4 系列",
        recommended: true,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "claudehub",
        label: "ClaudeHub",
        proto: "anthropic",
        base_url: Some("https://api.claudehub.fun"),
        default_model: "claude-sonnet-4.6",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "claude-opus-4.7", "claude-opus-4.6", "claude-opus-4.5",
            "claude-sonnet-4.6", "claude-sonnet-4.5", "claude-haiku-4.5",
            "gpt-5.5", "gpt-5.4",
        ],
        hint: "代理 Claude / GPT · 支持多种支付方式",
        recommended: false,
        referral_url: Some("https://app.claudehub.fun/r/7BXGRY"),
        referral_label: Some("打开 claudehub.fun"),
    },
    LlmPreset {
        id: "openai",
        label: "OpenAI",
        proto: "openai",
        base_url: None,
        default_model: "gpt-5.5",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "gpt-5.5", "gpt-5.5-thinking", "gpt-5.5-pro",
            "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-thinking",
            "gpt-5.3-chat-latest", "gpt-5.4-mini", "gpt-5.4-nano",
            "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini",
        ],
        hint: "ChatGPT API · 需要 platform.openai.com 的 Key",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "lmstudio",
        label: "LM Studio",
        proto: "openai",
        base_url: Some("http://localhost:1234/v1"),
        default_model: "",
        default_api_key: Some("lm-studio"),
        api_key_required: false,
        custom: true,
        models: &[],
        hint: "本地运行，OpenAI 兼容端点，无需 Key",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "ollama",
        label: "Ollama",
        proto: "openai",
        base_url: Some("http://localhost:11434/v1"),
        default_model: "qwen3",
        default_api_key: Some("ollama"),
        api_key_required: false,
        custom: true,
        models: &[],
        hint: "本地运行 /v1 端点，无需 Key，推荐 qwen3 中文模型",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "anthropic",
        label: "Anthropic",
        proto: "anthropic",
        base_url: None,
        default_model: "claude-sonnet-4-6",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
            "claude-opus-4-6", "claude-sonnet-4-5", "claude-opus-4-1",
        ],
        hint: "Claude · 需要 console.anthropic.com 的 Key",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "openrouter",
        label: "OpenRouter",
        proto: "openai",
        base_url: Some("https://openrouter.ai/api/v1"),
        default_model: "openai/gpt-5.3-chat-latest",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "openai/gpt-5.3-chat-latest", "openai/gpt-5.5",
            "openai/gpt-5.5-thinking", "openai/gpt-5.5-pro",
            "anthropic/claude-sonnet-4.6", "anthropic/claude-opus-4.7",
            "google/gemini-3.1-pro", "deepseek/deepseek-v4-pro", "x-ai/grok-4.3",
        ],
        hint: "模型聚合器 · openrouter.ai · 支持加密货币",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "groq",
        label: "Groq",
        proto: "openai",
        base_url: Some("https://api.groq.com/openai/v1"),
        default_model: "llama-3.3-70b-versatile",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
            "llama-4-scout-17b-16e-instruct", "qwen-3-32b", "mixtral-8x7b-32768",
        ],
        hint: "极速推理 · 开源模型",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "mistral",
        label: "Mistral",
        proto: "openai",
        base_url: Some("https://api.mistral.ai/v1"),
        default_model: "mistral-large-2512",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "mistral-large-2512", "mistral-small-2603",
            "ministral-8b-2512", "ministral-14b-2512",
            "mistral-large-latest", "mistral-small-latest",
        ],
        hint: "法国服务商 · Le Chat 和 API",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "google",
        label: "Google Gemini",
        proto: "openai",
        base_url: Some("https://generativelanguage.googleapis.com/v1beta/openai"),
        default_model: "gemini-3.1-pro",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &["gemini-3.1-pro", "gemini-3-flash", "gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash"],
        hint: "Gemini 通过 OpenAI 兼容端点",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "xai",
        label: "xAI Grok",
        proto: "openai",
        base_url: Some("https://api.x.ai/v1"),
        default_model: "grok-4.3",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &["grok-4.3", "grok-4.20-reasoning", "grok-4.20-non-reasoning", "grok-4", "grok-3", "grok-3-mini"],
        hint: "Grok by xAI · 需要 console.x.ai 的 Key",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "together",
        label: "Together AI",
        proto: "openai",
        base_url: Some("https://api.together.xyz/v1"),
        default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "meta-llama/Llama-4-scout-17b-instruct",
            "Qwen/Qwen2.5-72B-Instruct-Turbo",
            "deepseek-ai/DeepSeek-V3",
        ],
        hint: "开源模型托管",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "fireworks",
        label: "Fireworks",
        proto: "openai",
        base_url: Some("https://api.fireworks.ai/inference/v1"),
        default_model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &[
            "accounts/fireworks/models/llama-v3p3-70b-instruct",
            "accounts/fireworks/models/llama-4-scout-17b-16e-instruct",
            "accounts/fireworks/models/qwen2p5-72b-instruct",
            "accounts/fireworks/models/deepseek-v3",
        ],
        hint: "开源模型托管",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "perplexity",
        label: "Perplexity",
        proto: "openai",
        base_url: Some("https://api.perplexity.ai"),
        default_model: "sonar-pro",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &["sonar-pro", "sonar", "sonar-reasoning"],
        hint: "内置搜索的推理服务",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "cerebras",
        label: "Cerebras",
        proto: "openai",
        base_url: Some("https://api.cerebras.ai/v1"),
        default_model: "llama-3.3-70b",
        default_api_key: None,
        api_key_required: true,
        custom: false,
        models: &["llama-3.3-70b", "llama-4-scout-17b-16e-instruct", "qwen-3-32b"],
        hint: "超快推理 · Cerebras 芯片",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "custom-openai",
        label: "自定义 (OpenAI 兼容)",
        proto: "openai",
        base_url: None,
        default_model: "",
        default_api_key: None,
        api_key_required: false,
        custom: true,
        models: &[],
        hint: "填写你自己的 Base URL 和模型名",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
    LlmPreset {
        id: "custom-anthropic",
        label: "自定义 (Anthropic 兼容)",
        proto: "anthropic",
        base_url: None,
        default_model: "",
        default_api_key: None,
        api_key_required: false,
        custom: true,
        models: &[],
        hint: "填写你自己的 Base URL 和模型名",
        recommended: false,
        referral_url: None,
        referral_label: None,
    },
];

pub fn find_llm_preset(id: &str) -> Option<&'static LlmPreset> {
    LLM_PRESETS.iter().find(|p| p.id == id)
}

#[derive(Debug, Clone)]
pub struct StagePreset {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
}

pub const STAGE_PRESETS: &[StagePreset] = &[
    StagePreset { id: "met-irl-got-tg", label: "线下见过面 — 加了联系方式", description: "刚交换了联系方式。记得脸和声音，有一点兴趣。" },
    StagePreset { id: "tg-given-cold", label: "给了联系方式，但没说服她回消息", description: "还在犹豫。经常无视，回复简短。需要努力争取。" },
    StagePreset { id: "tg-given-warming", label: "给了联系方式，回复比较谨慎", description: "态度在软化。回复了，但很短。在测试你。" },
    StagePreset { id: "convinced", label: "愿意稳定回复", description: "定期聊天，会调情，还没再见过面。" },
    StagePreset { id: "first-date-done", label: "约会过一次", description: "第一次约会过了，悬而未决的状态 — 有好感，但还不是情侣。" },
    StagePreset { id: "dating-early", label: "刚开始交往", description: "在一起大约一个月。新鲜感足，一切都很新奇，但边界还脆弱。" },
    StagePreset { id: "dating-stable", label: "情侣，自由交流", description: "稳定关系，有玩笑、日常琐事、信任。" },
    StagePreset { id: "long-term", label: "在一起很久了", description: "一年以上。偶尔有摩擦、日常平淡，但深度信任。" },
];

#[derive(Debug, Clone)]
pub struct CommunicationPreset {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub notifications: &'static str, // muted|normal|priority
    pub message_style: &'static str, // one-liners|balanced|bursty|longform
    pub initiative: &'static str,    // low|medium|high
    pub life_sharing: &'static str,  // low|medium|high
}

pub const COMMUNICATION_PRESETS: &[CommunicationPreset] = &[
    CommunicationPreset {
        id: "normal", label: "普通",
        description: "适中 — 回复正常，不粘人，偶尔会主动发消息",
        notifications: "normal", message_style: "balanced", initiative: "medium", life_sharing: "medium",
    },
    CommunicationPreset {
        id: "cute", label: "温柔",
        description: "温暖贴心，经常回复，主动发消息，分享生活点滴",
        notifications: "priority", message_style: "balanced", initiative: "high", life_sharing: "high",
    },
    CommunicationPreset {
        id: "alt", label: "冷淡",
        description: "冷淡、简洁、回复很短，几乎不主动发消息，不分享私事",
        notifications: "normal", message_style: "one-liners", initiative: "low", life_sharing: "low",
    },
    CommunicationPreset {
        id: "clingy", label: "粘人",
        description: "非常粘人，连续发消息，总是在线，永远主动找你",
        notifications: "priority", message_style: "bursty", initiative: "high", life_sharing: "high",
    },
    CommunicationPreset {
        id: "chatty", label: "话多",
        description: "喜欢讲故事，写长消息，经常分享日常",
        notifications: "priority", message_style: "longform", initiative: "medium", life_sharing: "high",
    },
];

#[derive(Debug, Clone)]
pub struct TzEntry {
    pub iana: &'static str,
    pub gmt_winter: &'static str,
    pub city: &'static str,
    pub country: &'static str,
    pub aliases: &'static [&'static str],
}

pub const TIMEZONES: &[TzEntry] = &[
    // 中国
    TzEntry { iana: "Asia/Shanghai", gmt_winter: "GMT+8", city: "上海", country: "中国", aliases: &["上海", "北京", "广州", "深圳", "shanghai", "beijing", "cn", "china"] },
    TzEntry { iana: "Asia/Urumqi", gmt_winter: "GMT+6", city: "乌鲁木齐", country: "中国", aliases: &["乌鲁木齐", "新疆", "urumqi"] },
    // 亚洲其他
    TzEntry { iana: "Asia/Tokyo", gmt_winter: "GMT+9", city: "东京", country: "日本", aliases: &["东京", "tokyo", "jp"] },
    TzEntry { iana: "Asia/Seoul", gmt_winter: "GMT+9", city: "首尔", country: "韩国", aliases: &["首尔", "seoul", "kr"] },
    TzEntry { iana: "Asia/Singapore", gmt_winter: "GMT+8", city: "新加坡", country: "新加坡", aliases: &["新加坡", "singapore", "sg"] },
    TzEntry { iana: "Asia/Bangkok", gmt_winter: "GMT+7", city: "曼谷", country: "泰国", aliases: &["曼谷", "bangkok", "th"] },
    // 欧美
    TzEntry { iana: "America/New_York", gmt_winter: "GMT-5", city: "纽约", country: "美国", aliases: &["纽约", "new york", "us"] },
    TzEntry { iana: "America/Los_Angeles", gmt_winter: "GMT-8", city: "洛杉矶", country: "美国", aliases: &["洛杉矶", "los angeles", "la"] },
    TzEntry { iana: "Europe/London", gmt_winter: "GMT+0", city: "伦敦", country: "英国", aliases: &["伦敦", "london", "uk"] },
    TzEntry { iana: "Europe/Paris", gmt_winter: "GMT+1", city: "巴黎", country: "法国", aliases: &["巴黎", "paris", "fr"] },
    // 俄罗斯
    TzEntry { iana: "Europe/Moscow", gmt_winter: "GMT+3", city: "莫斯科", country: "俄罗斯", aliases: &["莫斯科", "msk", "moscow", "rus"] },
];

pub fn search_tz(query: &str) -> Vec<&'static TzEntry> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return TIMEZONES.iter().collect();
    }
    TIMEZONES
        .iter()
        .filter(|tz| {
            tz.iana.to_lowercase().contains(&q)
                || tz.city.to_lowercase().contains(&q)
                || tz.country.to_lowercase().contains(&q)
                || tz.aliases.iter().any(|a| a.contains(&q))
        })
        .collect()
}

pub fn default_tz_for_nationality(nationality: &str) -> &'static str {
    match nationality {
        "RU" => "Europe/Moscow",
        "UA" => "Europe/Kyiv",
        _ => "Asia/Shanghai",
    }
}

pub const NATIONALITIES: &[(&str, &str)] = &[
    ("CN", "中国"),
    ("RU", "俄罗斯"),
    ("UA", "乌克兰"),
];

pub const NAMES_RU: &[&str] = &[
    "小月", "诗雨", "思涵", "晓雪", "雨晴",
    "梦琪", "静怡", "雅婷", "欣然", "若曦",
    "子涵", "梓萱", "语嫣", "雨桐", "安琪",
    "佳怡", "婉清", "念慈", "清瑶", "心怡",
    "忆南", "乐瑶", "曼琳", "芷若", "碧萱",
    "悦悦", "甜甜", "萌萌", "朵朵", "可可",
    "念念", "悠悠", "浅浅", "小鹿", "阿宁",
];

pub const NAMES_UA: &[&str] = &[
    "小月", "诗雨", "思涵", "晓雪", "雨晴",
    "梦琪", "静怡", "雅婷", "欣然", "若曦",
    "子涵", "梓萱", "语嫣", "雨桐", "安琪",
    "佳怡", "婉清", "念慈", "清瑶", "心怡",
    "忆南", "乐瑶", "曼琳", "芷若", "碧萱",
    "悦悦", "甜甜", "萌萌", "朵朵", "可可",
    "念念", "悠悠", "浅浅", "小鹿", "阿宁",
];

pub fn pick_random_name(nationality: &str, seed: u64) -> &'static str {
    let pool: &[&str] = NAMES_RU;
    let idx = (seed as usize) % pool.len();
    pool[idx]
}

#[derive(Debug, Clone)]
pub struct SleepPreset {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub from_h: u8,
    pub to_h: u8,
    pub wake_chance: f32,
}

pub const SLEEP_PRESETS: &[SleepPreset] = &[
    SleepPreset { id: "standard", label: "标准", description: "23:00 — 08:00 · ~5% 被消息吵醒", from_h: 23, to_h: 8, wake_chance: 0.05 },
    SleepPreset { id: "late", label: "夜猫子", description: "02:00 — 11:00 · 晚睡晚起", from_h: 2, to_h: 11, wake_chance: 0.05 },
    SleepPreset { id: "early", label: "早起型", description: "22:00 — 07:00 · 早睡早起", from_h: 22, to_h: 7, wake_chance: 0.04 },
    SleepPreset { id: "owl", label: "通宵", description: "04:00 — 13:00 · 日夜颠倒", from_h: 4, to_h: 13, wake_chance: 0.08 },
    SleepPreset { id: "custom", label: "自定义", description: "自己设置睡眠时间", from_h: 0, to_h: 0, wake_chance: 0.0 },
];

pub const PRIVACY_OPTIONS: &[(&str, &str, &str)] = &[
    ("owner-only", "仅限主人", "只回复你。陌生人会被忽略。"),
    ("allow-strangers", "所有人", "回复任何发消息的人 — 用于群聊 Bot 模式。"),
];

pub fn slugify(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .map(|c| c.to_ascii_lowercase())
        .fold(String::new(), |mut acc, c| {
            if c == '-' || c == '_' {
                if !acc.is_empty() && !acc.ends_with('-') {
                    acc.push('-');
                }
            } else {
                acc.push(c);
            }
            acc
        })
        .trim_matches('-')
        .to_string()
        .chars()
        .take(40)
        .collect()
}
