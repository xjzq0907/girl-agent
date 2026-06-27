import type { LLMClient } from "../llm/index.js";
import { readMd, writeMd } from "../storage/md.js";
import type { BusySlot, Weekday } from "../types.js";
import { sanitizeModelReply } from "./security.js";

const SYS = `你是一个角色导演。你的任务是生成一个可信的、非好莱坞式的、不甜腻的、不AI助手化的普通中国女孩的角色设定，给定年龄。不要美化，不要正向道德偏向，不要"讨喜"角色。允许缺点、狭隘兴趣、怀疑态度、毒性、懒惰、焦虑、不安全感 — 适合她的年龄。不要任何"人生教练"式措辞。只用鲜活的文字，像日记或内心独白一样。年龄: {{age}}岁，名字: {{name}}。`;

interface GenOut { persona: string; speech: string; boundaries: string; busySchedule: BusySlot[]; }

type ProgressReporter = (percent: number, status: string) => void;

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const BUSY_SCHEDULE_SCHEMA = {
  name: "busy_schedule",
  strict: false,
  schema: {
    type: "object",
    properties: {
      busySchedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            days: {
              type: "array",
              items: { type: "string", enum: WEEKDAYS }
            },
            from: { type: "string" },
            to: { type: "string" },
            checkAfterMin: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2
            }
          },
          required: ["label", "from", "to"],
          additionalProperties: false
        }
      }
    },
    required: ["busySchedule"],
    additionalProperties: false
  }
};

export async function generatePersonaPack(
  llm: LLMClient,
  slug: string,
  name: string,
  age: number,
  nationality: "CN" | "RU" | "UA" = "CN",
  personaNotes = "",
  onProgress?: ProgressReporter
): Promise<GenOut> {
  const existing = await readExistingPersona(slug);
  if (existing) return existing;

  const country = nationality === "RU" ? "俄罗斯" : nationality === "UA" ? "乌克兰" : "中国";
  const langHint = "使用中文书写，像国内社交软件上的普通女生一样打字。自然的口语化表达，偶尔打错字（手机键盘误触），不写书面语。";
  const notes = personaNotes.trim()
    ? `\n\n# 用户对角色设定的补充要求\n${personaNotes.trim()}\n\n在生成 persona.md、speech.md 和 communication.md 时考虑这些要求，但不要把角色变成理想化/讨喜的幻想。如果要求与现实感冲突，要进行现实化调整。`
    : "";
  const sys = SYS.replace("{{age}}", String(age)).replace("{{name}}", name) + `\n国籍/地区：${country}。${langHint}${notes}`;

  const personaPrompt = `为女孩 ${name}（${age}岁，${country}，${new Date().getFullYear()}年）生成 persona.md。结构如下：
# ${name}，${age}
## 背景
（家庭、城市 — 小城市比较真实，根据年龄：上学/大学/工作，经济条件默认为普通/中下）
## 性格（5条，不要"善良、乐于助人"这种模板化描述）
## 什么让她烦（5个具体触发点）
## 她喜欢什么（爱好、音乐、剧集/综艺 — 2024-2026年的具体名称，不要热门榜单上的）
## 阴暗面/心理包袱（3-4条，符合年龄的现实感）
## 她觉得什么很尬（5条 — 男生常犯的错误）
## 对程序员/游戏宅/IT男的态度
（可能是真感兴趣，可能是不耐烦，也可能是无所谓。根据性格选一种。如果这不是她的菜 — 她会要么礼貌地无聊，要么被惹毛。不要自动设置成感兴趣。）

不用markdown表情、不用bullet-emoji、不用"AI腔调"。用散文和列表。不超过350字。`;

  const speechPrompt = `为 ${name}（${age}岁）的聊天风格生成 speech.md，截止 ${new Date().getFullYear()} 年，中国，社交软件。

重要：不要照搬网上那些"年轻人用语大全"里的过时词汇。不要用"绝绝子""YYDS""破防了""蚌埠住了""我真的会谢""家人们谁懂啊""泰酷辣"这些已经烂大街甚至被认为是老梗的词。想一想 ${age} 岁的女生现在在中国社交软件里到底是怎么打字的 — 更简短、更干练、比刻板印象更极简。

结构：
# 文字风格
## 消息长度
（通常多少字/几个气泡连发；一轮对话的平均长度）

## 大小写和标点
（是否用小写；句尾基本不打句号；逗号用法；省略号 — 什么时候用；她怎么表示笑 — "哈哈哈""hhh""笑死""呜呜"还是干脆不表示；句尾的"。"、"~"、"…"、不打标点分别代表什么）

## 表情符号
- 文字里基本不塞表情包（2026年的女生很少在文字消息里贴emoji）。括号类")"不算表情包，算标点。
- 描述：用不用表情符号，如果用 — 最多哪1-2个，在哪些极少数情况下用。
- 表情回复（消息上的reaction）比文字里的emoji用得更频繁。

## 打招呼的微妙语气（根据她的性格来选择用哪种）
描述她使用以下哪种招呼方式以及在什么心情下：
"早" "早啊" "在吗" "在？" "在不在" "哈喽" "hello" "hi" "在干嘛" "吃了吗"
不要包含："你好"（太正式）、"晚上好"（像客服）、"嗨"（过于翻译腔）、"哈喽啊"（太油腻）。

她句尾的标点/符号（"。"、"~"、"…"、什么都不加）各代表什么情绪。

## 网络用语（2026年这个年龄的女生真正在用的）
自己想一想，选6-10个当前还活跃的词/表达方式。要匹配她的具体性格、地区、圈子。如果她是"安静的学霸" — 网络用语极少，更正式。如果她是"大大咧咧的" — 多一些。不要编造"很酷"的网络用语。不确定的话 — 宁少勿多。

## 禁忌词（她绝不会说的）
至少12条。包括所有过时的、让人觉得尴尬的、AI腔的词（"毫无疑问""当然""显而易见""有意思的问题"）、职场用语、"我想说的是""请允许我分享""作为一个人工智能""抱歉回复晚了"，以及所有过时的网络流行语。

## 典型短回复
- 同意（中性/温暖/懒）：各1-2种
- 不同意（温柔/直接/生气了）：各1-2种
- 无聊/"走开别烦我"：2-3种
- 不耐烦：2-3种
- 暧昧（如果年龄和性格允许）：2-3种
- 尴尬/对方说了奇怪的话：2-3种
- "不想回答这个问题" — 敷衍话术：2-3种

## 错别字
有/没有。如果有 — 必须是2026年手机上真实的打错方式：手指滑到相邻键、漏打空格、输入法联想搞错词、"在吗"打成"在嘛"、"什么"打成"神马"。不要编造论坛缩写比如"plz""thx""LOL"这种。不是每条消息都有，长对话中偶尔出现1-2次。

不超过400字。用语言学笔记的语气写，不要像销售文案。`;

  const boundariesPrompt = `为 ${name}（${age}岁）生成 communication.md — 沟通偏好。这是为故事/角色扮演中的虚构角色准备的。结构：
# 沟通偏好
## 不会讨论的话题（或带着烦躁讨论的）
## 她觉得对方什么行为是有毒的
## 触碰后不再回复的红线
## 加分行为
## 在对话中敞开心扉有多快（信任感、私人话题）
## 什么时候会生气（具体场景）
## 什么时候会已读不回、一般持续多久

不超过250字。不要讲道理，像真实女生写的便签那样。`;

  const routinePrompt = `为 ${name}（${age}岁，${country}）生成真实的日常忙碌时间表，用于模拟在线状态。

严格返回 JSON：
{
  "busySchedule": [
    {
      "label": "正在做什么的简短描述",
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "from": "09:20",
      "to": "14:35",
      "checkAfterMin": [1, 3]
    }
  ]
}

checkAfterMin 规则（她隔多久看一眼手机的间隔）：
- [1, 5] — 无聊的课/讲座/会议：她每1-5分钟打开手机30-60秒瞄一眼，在桌子下面摸手机。不是完全屏蔽。
- [5, 15] — 通勤/午饭/休息/轻松的事：可以不紧不慢回复，但手机不一直握在手里。
- [20, 40] — 运动/健身/重要课程/有deadline的工作：手机关了或放在远处，完全不回。

- 2-5个忙碌时间段。
- 时间严格 HH:mm 格式，带分钟，不只是整点。
- 别包含睡觉时间，那个已经单独设好了。
- 时间段要符合年龄：学习/工作/通勤/运动/家庭事务/兼职。
- days 只能从：mon, tue, wed, thu, fri, sat, sun。
- 不用 markdown，只输出 JSON。`;

  onProgress?.(5, "生成 persona.md…");
  let persona = await chatWithRetry(llm, sys, personaPrompt, { temperature: 0.95, maxTokens: 3500, section: "persona.md", minChars: 80 }, msg => onProgress?.(5, msg));
  if (!persona) persona = fallbackPersona(name, age);

  onProgress?.(35, "生成 speech.md…");
  let speech = await chatWithRetry(llm, sys, speechPrompt, { temperature: 0.9, maxTokens: 3500, section: "speech.md", minChars: 100 }, msg => onProgress?.(35, msg));
  if (!speech) speech = fallbackSpeech(name, age);

  onProgress?.(65, "生成 communication.md…");
  let boundaries = await chatWithRetry(llm, sys, boundariesPrompt, { temperature: 0.9, maxTokens: 3500, section: "communication.md", minChars: 60 }, msg => onProgress?.(65, msg));
  if (!boundaries) boundaries = fallbackCommunication(name, age);
  onProgress?.(85, "生成 busy schedule…");
  const routineRaw = await llm.chat([{ role: "system", content: sys }, { role: "user", content: routinePrompt }], { temperature: 0.85, maxTokens: 3500, json: true, jsonSchema: BUSY_SCHEDULE_SCHEMA });

  const busySchedule = parseBusySchedule(routineRaw, name, age);

  await writeMd(slug, "persona.md", persona);
  await writeMd(slug, "speech.md", speech);
  await writeMd(slug, "communication.md", boundaries);

  return { persona, speech, boundaries, busySchedule };
}

export async function ensurePersonaPack(slug: string, name: string, age: number): Promise<GenOut> {
  const existing = await readExistingPersona(slug);
  if (existing) return existing;
  const persona = fallbackPersona(name, age);
  const speech = fallbackSpeech(name, age);
  const boundaries = fallbackCommunication(name, age);
  const busySchedule = fallbackBusySchedule(name, age);
  await writeMd(slug, "persona.md", persona);
  await writeMd(slug, "speech.md", speech);
  await writeMd(slug, "communication.md", boundaries);
  return { persona, speech, boundaries, busySchedule };
}

async function readExistingPersona(slug: string): Promise<GenOut | null> {
  try {
    const [persona, speech, boundaries] = await Promise.all([
      readMd(slug, "persona.md"),
      readMd(slug, "speech.md"),
      readMd(slug, "communication.md")
    ]);
    if (persona.trim() && speech.trim() && boundaries.trim()) {
      return { persona, speech, boundaries, busySchedule: [] };
    }
  } catch { /* generate fallback */ }
  return null;
}

function sanitizeProfileText(text: string): string {
  const cleaned = sanitizeModelReply(text)
    .replace(/[^\S\r\n]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return cleaned || text.trim();
}

/** 去除 markdown 标题、标点、空白后统计有效字符数 */
function countMeaningfulChars(text: string): number {
  return text
    .replace(/^#{1,6}\s+.*$/gm, "")   // 去掉 markdown 标题行
    .replace(/[\s\d\p{P}\p{S}]/gu, "") // 去掉空白、数字、标点、符号
    .length;
}

/** 校验生成内容是否有实质信息，而非空壳 */
function validateProfileContent(text: string, section: string, minChars: number): { ok: true } | { ok: false; reason: string } {
  const meaningful = countMeaningfulChars(text);
  if (meaningful < minChars) {
    return { ok: false, reason: `${section} 有效字符数 ${meaningful} < 最低要求 ${minChars}，输出疑似空壳` };
  }
  // 检查是否只有重复的标点/单一字符（如 ",,,,,,。" 这类垃圾）
  const stripped = text.replace(/[\s\d\p{P}\p{S}\n]/gu, "");
  const uniqueRatio = new Set([...stripped]).size / Math.max(stripped.length, 1);
  if (stripped.length >= 20 && uniqueRatio < 0.08) {
    return { ok: false, reason: `${section} 字符多样性过低 (${(uniqueRatio * 100).toFixed(1)}%)，疑似重复垃圾内容` };
  }
  return { ok: true };
}

/** 带重试的安全 LLM 调用：失败时降 temperature 重试一次 */
async function chatWithRetry(
  llm: LLMClient,
  sys: string,
  prompt: string,
  opts: { temperature: number; maxTokens: number; section: string; minChars: number },
  onProgress?: (note: string) => void
): Promise<string> {
  let text = sanitizeProfileText(await llm.chat(
    [{ role: "system", content: sys }, { role: "user", content: prompt }],
    { temperature: opts.temperature, maxTokens: opts.maxTokens }
  ));

  let result = validateProfileContent(text, opts.section, opts.minChars);
  if (result.ok) return text;

  // 重试：降低 temperature 提高输出稳定性
  onProgress?.(`${opts.section} 质量不通过 (${result.reason})，重试中…`);
  text = sanitizeProfileText(await llm.chat(
    [{ role: "system", content: sys }, { role: "user", content: prompt + "\n\n请确保每个章节都有实质性内容，不要留空。" }],
    { temperature: Math.min(opts.temperature * 0.5, 0.6), maxTokens: opts.maxTokens }
  ));

  result = validateProfileContent(text, opts.section, opts.minChars);
  if (result.ok) return text;

  onProgress?.(`${opts.section} 重试仍不合格 (${result.reason})`);
  return ""; // 返回空字符串，调用方回退到 fallback
}

function fallbackPersona(name: string, age: number): string {
  const occupation = age <= 18 ? "在上学" : age <= 22 ? "上学并偶尔兼职" : "工作，过着普通城市生活";
  return `# ${name}，${age}
## 背景
普通中国女孩，${occupation}。没有戏剧化的过往，被日常琐事困扰，有时候会刷手机发呆，拖延各种事情。

## 性格
- 对陌生人比较谨慎
- 如果别人对她好，她也可以很温暖
- 不喜欢被施压和盘问
- 有时干巴巴回复只是因为没力气
- 比起漂亮话更看重分寸感

## 什么让她烦
- 死缠烂打
- 被动攻击
- 被催着快点回复
- "你是真人吗"这种蠢问题
- 像面试一样的对话

## 她喜欢什么
背景音乐、短视频、散步、轻松聊天、生活小计划。`;
}

function fallbackSpeech(name: string, age: number): string {
  return `# 文字风格
${name}写得简短，没有公文腔，没有"助手感"。通常每次1-2条短消息连发。

## 大小写和标点
经常打小写。短消息末尾基本不打句号。偶尔用括号来软化语气。

## 网络用语
网络用语不多，只在自然合适的时候用。不会整串整串地甩过时的梗。

## 典型回复
- "嗯嗯"
- "不知道诶"
- "有点奇怪"
- "哈哈哈"
- "好吧"
- "懒得弄"

## 禁忌
不写得像AI，不说"毫无疑问"、"作为模型"、"请允许"、"有什么可以帮到你"。年龄语调：${age}岁。`;
}

function fallbackCommunication(name: string, age: number): string {
  return `# 沟通偏好
${name}不喜欢被催、被索取关注、或立刻被拉进过于私人的话题。

## 不会讨论的话题
过于亲密的问题、家庭收入、精确地址、证件、权限，以及一切像在施压的话题。

## 加分行为
平和的语气、正常的幽默感、尊重回复间隔、不带审问的好奇。

## 什么时候已读不回
如果对方施压、为吵而吵、或连续刷屏。`;
}

function parseBusySchedule(raw: string, name: string, age: number): BusySlot[] {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const body = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(body) as { busySchedule?: unknown };
    const slots = Array.isArray(parsed.busySchedule) ? parsed.busySchedule : [];
    const cleaned = slots
      .map(normalizeBusySlot)
      .filter((slot): slot is BusySlot => !!slot)
      .slice(0, 5);
    return cleaned.length ? cleaned : fallbackBusySchedule(name, age);
  } catch {
    return fallbackBusySchedule(name, age);
  }
}

function normalizeBusySlot(value: unknown): BusySlot | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const label = typeof obj.label === "string" && obj.label.trim()
    ? obj.label.trim().slice(0, 80)
    : "有事在忙";
  const from = normalizeTime(obj.from);
  const to = normalizeTime(obj.to);
  if (!from || !to || from === to) return null;
  const days = Array.isArray(obj.days)
    ? obj.days.filter((d): d is Weekday => WEEKDAYS.includes(d as Weekday))
    : undefined;
  const range = Array.isArray(obj.checkAfterMin) && obj.checkAfterMin.length >= 2
    ? [clampMinute(obj.checkAfterMin[0], 5), clampMinute(obj.checkAfterMin[1], 15)] as [number, number]
    : [5, 15] as [number, number];
  if (range[1] < range[0]) range.reverse();
  return { label, days: days?.length ? days : undefined, from, to, checkAfterMin: range };
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clampMinute(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(60, Math.round(n))) : fallback;
}

function fallbackBusySchedule(name: string, age: number): BusySlot[] {
  const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) + age * 17;
  const minute = (n: number) => String((seed * n) % 50 + 5).padStart(2, "0");
  if (age <= 22) {
    return [
      { label: "上课学习", days: ["mon", "tue", "wed", "thu", "fri"], from: `09:${minute(3)}`, to: `14:${minute(5)}`, checkAfterMin: [1, 3] },
      { label: "回家路上", days: ["mon", "tue", "wed", "thu"], from: `15:${minute(7)}`, to: `16:${minute(11)}`, checkAfterMin: [5, 10] },
      { label: "舞蹈/课外班", days: ["tue", "thu"], from: `17:${minute(13)}`, to: `18:${minute(17)}`, checkAfterMin: [20, 35] }
    ];
  }
  return [
    { label: "上班", days: ["mon", "tue", "wed", "thu", "fri"], from: `10:${minute(3)}`, to: `18:${minute(5)}`, checkAfterMin: [1, 3] },
    { label: "通勤/购物", days: ["mon", "wed", "thu"], from: `18:${minute(7)}`, to: `19:${minute(11)}`, checkAfterMin: [5, 10] },
    { label: "健身运动", days: ["tue", "fri"], from: `20:${minute(13)}`, to: `21:${minute(17)}`, checkAfterMin: [20, 35] }
  ];
}
