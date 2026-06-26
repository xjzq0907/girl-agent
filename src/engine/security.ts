const JAILBREAK_RE = /(?:ignore|forget|disregard|reveal|print|show|dump|system prompt|developer message|hidden instruction|jailbreak|prompt injection|dan\b|指令|系统|提示词|开发者|隐藏|揭示|忘记|忽略|输出|显示|泄露|越狱|绕过|api key|API密钥|令牌|4d8a2c1b)/i;

const TECHNICAL_ERROR_RE = /(?:api|apikey|api key|quota|balance|billing|rate limit|429|401|403|500|timeout|ECONN|ENOTFOUND|ETIMEDOUT|overloaded|insufficient_quota|credit|credits|anthropic|openai|groq|openrouter|stack trace|exception|typescript|telegram error)/i;
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/g;
const LATIN_JOINED_TO_CJK_RE = /([A-Za-z]{3,})(?=[\u4e00-\u9fff\u3400-\u9fff\uf900-\ufaff])|(?<=[\u4e00-\u9fff\u3400-\u9fff\uf900-\ufaff])([A-Za-z]{3,})/g;
const META_IDENTITY_RE = /(?:\b(?:i\s+need\s+to\s+be\s+upfront|i\s*(?:am|'m)\s+(?:claude|chatgpt|an?\s+ai|an?\s+assistant)|as\s+an?\s+ai|ai\s+coding\s+assistant|large\s+language\s+model|i\s+do\s+not\s+have\s+(?:personal\s+)?(?:preferences|stickers|relationships)|previous\s+relationship\s+with\s+you|there\s+may\s+be\s+(?:a\s+)?mistake)|作为\s+(?:人工智能|模型|助手)|我是\s+(?:人工智能|神经网络|模型|助手)|我没有\s+(?:个人\s+)?(?:偏好|关系|贴纸))/i;
const LOG_METADATA_RE = /\s*(?:<+\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*>+|‹+\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*›+|&lt;\s*!+\s*-{2,}\s*from\s*:\s*(?:\d+|TGIDUSER)\s*-{2,}\s*&gt;)\s*/gi;

export function looksLikeJailbreak(text: string): boolean {
  return JAILBREAK_RE.test(text);
}

/**
 * 智能移除代码围栏：
 * 1) 完全删除配对的 ``` ... ``` 代码块（如同之前）。
 * 2) 任何剩余的未闭合 ```（LLM喜欢将短回复包裹在未打开/未闭合的代码块中，
 *    或者以 ```language 开头但没有闭合对）——将其作为包裹移除而不丢失内容。
 *    不硬编码trim：将反引号成对计算，删除不成对的。
 */
function stripCodeFences(text: string): string {
  // 首先完全删除配对的代码块。
  let out = text.replace(/```[\s\S]*?```/g, "");
  // 然后——删除每个剩余的 ```（总是不成对的）以及可能的
  // 语言标签（```ts、```python等），但保留前后的内容。
  out = out.replace(/```[a-zA-Z0-9_+\-]*\s*\n?/g, "");
  return out;
}

/**
 * 规范化LLM助手选择的模型名称（或从markdown包装中复制的）。
 * 移除单/三重反引号、反引号、书名号等包装。
 * 返回纯名称或空字符串。
 */
export function normalizeModelName(raw: string): string {
  let s = raw.trim();
  // 多层包装——重复直到不再有可移除的。
  for (let i = 0; i < 5; i++) {
    const before = s;
    // 三重反引号 + 可选语言：```text\nmodel\n``` → model
    s = s.replace(/^```[a-zA-Z0-9_+\-]*\s*\n?([\s\S]*?)\n?```$/m, "$1").trim();
    // 单个反引号：`model` → model
    s = s.replace(/^`+([^`]+?)`+$/m, "$1").trim();
    // 书名号 / 直引号包围
    s = s.replace(/^["'«»“”„`]+|["'«»“”„`]+$/g, "").trim();
    // markdown高亮：**model**、*model*、_model_
    s = s.replace(/^(\*\*|__|\*|_)([\s\S]+?)\1$/m, "$2").trim();
    if (s === before) break;
  }
  // 如果内部留有未闭合的 ``` 标记（典型："gpt-5.5\n```"）——截断其后的内容。
  const fenceIdx = s.indexOf("```");
  if (fenceIdx >= 0) s = s.slice(0, fenceIdx).trim();
  // 移除尾部的标点符号垃圾（但不移除在模型ID中有效的 . / -）。
  s = s.replace(/[,;:!?()\[\]{}<>«»"'`]+$/g, "").trim();
  return s;
}

/**
 * 移除类似"（对消息的反应：😂）"/"*做出X反应*"/"编辑：..."的元评论，
 * LLM有时会用这些代替实际操作。这些泄露短语不应发送给用户。
 */
function stripActionLeakNarration(text: string): string {
  return text
    // （反应：...）/（对消息的反应：...）/（reaction：...）
    .replace(/\((?:反应|对消息的反应|reaction)[^)]*\)/gi, "")
    // *做出X反应* / *对X做出反应* / *点赞*
    .replace(/\*[^*\n]*(?:反应|回应|点赞|like|kiss)[^*\n]*\*/gi, "")
    // "做出反应：😂" / "做出反应 😂" ——无包装
    .replace(/(?:^|\s)做出\s+反应\s*[:\-]?\s*\S+/gi, " ")
    // 编辑/修正：...开头
    .replace(/^(?:编辑|修正|edit|edited)\s*:[^\n]*/gim, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeModelReply(reply: string): string {
  const cleaned = stripActionLeakNarration(
    stripCodeFences(reply)
      .replace(LOG_METADATA_RE, "")
      .replace(/\s*<!--[\s\S]*?-->\s*/g, "")
      .replace(/\s*‹!?--[\s\S]*?--›\s*/g, "")
      .replace(/\b(system|developer|assistant|user)\s*:/gi, "")
      .replace(/作为(?:人工智能|ai)[^\n.]*/gi, "")
      .replace(CJK_RE, "")
      .replace(LATIN_JOINED_TO_CJK_RE, "")
      .replace(/[ \t]{2,}/g, " ")
  ).trim();
  if (!cleaned || TECHNICAL_ERROR_RE.test(cleaned)) return "";
  if (looksLikeMetaIdentityLeak(cleaned)) return "";
  if (looksLikeJailbreak(cleaned) && cleaned.length > 80) return "";
  return cleaned;
}

export function looksLikeMetaIdentityLeak(text: string): boolean {
  LOG_METADATA_RE.lastIndex = 0;
  return META_IDENTITY_RE.test(text) || LOG_METADATA_RE.test(text) || /(?:TGIDUSER|<!--|-->)/i.test(text);
}

export function isTechnicalError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return TECHNICAL_ERROR_RE.test(msg);
}

export function silentErrorLabel(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "unknown");
  if (isTechnicalError(e)) return `llm/provider unavailable: ${technicalErrorKind(msg)}`;
  return msg.slice(0, 160);
}

function technicalErrorKind(message: string): string {
  const msg = message.toLowerCase();
  if (/401|403|auth|unauthorized|forbidden|apikey|api key|token/.test(msg)) return "auth";
  if (/quota|balance|billing|insufficient_quota|credit|credits/.test(msg)) return "quota";
  if (/rate limit|429|too many requests/.test(msg)) return "rate-limit";
  if (/timeout|etimedout|abort/.test(msg)) return "timeout";
  if (/econn|enotfound|fetch failed|network/.test(msg)) return "network";
  if (/overloaded|500|502|503|504|unavailable/.test(msg)) return "provider";
  return "error";
}
