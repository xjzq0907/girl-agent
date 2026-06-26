/**
 * 基于键盘布局的真实拼写错误模拟。
 *
 * 逻辑：
 *  - 只模拟人们实际会犯的拼写错误：
 *    - 相邻按键（胖手指/fat-finger）：拼音错误，如 "nihao" → "nijao" 或 "nihso"
 *    - 漏打字母：拼音中漏掉字母，如 "xianzai" → "xanzi"
 *    - 重复字母：如 "shenme" → "shenmme"
 *    - 相邻字母交换：如 "pengyou" → "pnegyou"
 *    - 忘记切换输入法导致的英文/拼音混入（偶尔出现）
 *  - 支持中文拼音输入（Pinyin）和英文 QWERTY 键盘布局
 *  - 拼写错误在客户端（即最终文本中插入），不在 LLM 层面处理——这样便于控制密度。
 *  - 每个单词的拼写错误概率通过 `intensity`（0..1）参数调节。
 *  - 不会破坏表情符号、标点符号和链接。
 */

// 拼音输入时的相邻按键（QWERTY 键盘布局）。
// 每个键为小写字母，对应的值是物理相邻的按键列表
// （包括上下排）。仅包含常用字母。
const RU_NEIGHBORS: Record<string, string> = {
  "q": "wasd",
  "w": "eqasd",
  "e": "rwsdf",
  "r": "tedfgh",
  "t": "yrdfgh",
  "y": "uthj",
  "u": "iyghjk",
  "i": "ouhjkl",
  "o": "pijk;l",
  "p": "[okl;'",
  "[": "]pl;'",
  "]": "[;'",
  "a": "qwsxz",
  "s": "qweadzx",
  "d": "erfghc",
  "f": "rdtghcvb",
  "g": "fythj",
  "h": "gyujnm",
  "j": "huikm,",
  "k": "jio,lm,.",
  "l": "kop;,.m",
  ";": "lp['.]",
  "'": ";[]",
  "z": "asx",
  "x": "szcv",
  "c": "fxvdb",
  "v": "dcbn,",
  "b": "gfhvnm",
  "n": "gbh,m",
  "m": "hjnk,.",
  ",": "kj.mv",
  ".": "lk,m"
};

// QWERTY 键盘上的相邻按键（英文 / 拼音输入布局）。
const EN_NEIGHBORS: Record<string, string> = {
  "q": "wa", "w": "qears", "e": "wrsd", "r": "etdf", "t": "ryfg",
  "y": "tugh", "u": "yihj", "i": "uojk", "o": "ipkl", "p": "ol",
  "a": "qwsz", "s": "awedxz", "d": "serfcx", "f": "drtgvc", "g": "ftyhbv",
  "h": "gyujnb", "j": "huiknm", "k": "jiolm", "l": "kop",
  "z": "asx", "x": "zsdc", "c": "xdfv", "v": "cfgb", "b": "vghn",
  "n": "bhjm", "m": "njk"
};

// 中/英文输入法下的字符映射。
// 用于模拟"忘记切换输入法"导致的拼写错误。
const RU_TO_EN: Record<string, string> = {
  "q": "q", "w": "w", "e": "e", "r": "r", "t": "t", "y": "y", "u": "u",
  "i": "i", "o": "o", "p": "p", "[": "[", "]": "]",
  "a": "a", "s": "s", "d": "d", "f": "f", "g": "g", "h": "h", "j": "j",
  "k": "k", "l": "l", ";": ";", "'": "'",
  "z": "z", "x": "x", "c": "c", "v": "v", "b": "b", "n": "n", "m": "m",
  ",": ",", ".": "."
};

const EN_TO_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_TO_EN).map(([ru, en]) => [en, ru])
);

function neighborsOf(ch: string): string {
  const low = ch.toLowerCase();
  if (RU_NEIGHBORS[low]) return RU_NEIGHBORS[low]!;
  if (EN_NEIGHBORS[low]) return EN_NEIGHBORS[low]!;
  return "";
}

function preserveCase(src: string, target: string): string {
  return src === src.toUpperCase() ? target.toUpperCase() : target;
}

// 基础操作。
function swapAdjacent(word: string, i: number): string {
  if (i < 0 || i >= word.length - 1) return word;
  return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
}

function dropChar(word: string, i: number): string {
  return word.slice(0, i) + word.slice(i + 1);
}

function dupChar(word: string, i: number): string {
  if (i < 0 || i >= word.length) return word;
  return word.slice(0, i + 1) + word[i] + word.slice(i + 1);
}

function replaceWithNeighbor(word: string, i: number): string {
  if (i < 0 || i >= word.length) return word;
  const ch = word[i]!;
  const neigh = neighborsOf(ch);
  if (!neigh) return word;
  const repl = neigh[Math.floor(Math.random() * neigh.length)]!;
  return word.slice(0, i) + preserveCase(ch, repl) + word.slice(i + 1);
}

// 输入法切换错误 —— 将字符替换为"忘记切换布局"时对应的
// 拉丁/非拉丁字符。
function wrongLayout(word: string, i: number): string {
  if (i < 0 || i >= word.length) return word;
  const ch = word[i]!;
  const low = ch.toLowerCase();
  const swap = RU_TO_EN[low] ?? EN_TO_RU[low];
  if (!swap) return word;
  return word.slice(0, i) + preserveCase(ch, swap) + word.slice(i + 1);
}

export interface TypoOptions {
  /** 整体拼写错误概率，0..1。默认 0.06（约每16个词出现一次错误）。 */
  intensity?: number;
  /** 每个词最多出现的错误数。默认 1。 */
  maxPerWord?: number;
}

const TYPO_OPS = [replaceWithNeighbor, replaceWithNeighbor, dropChar, dupChar, swapAdjacent, wrongLayout];

function corruptWord(word: string, opts: Required<TypoOptions>): string {
  if (word.length < 3) return word;
  let result = word;
  let count = 0;
  for (let i = 0; i < word.length && count < opts.maxPerWord; i++) {
    if (Math.random() > opts.intensity) continue;
    const op = TYPO_OPS[Math.floor(Math.random() * TYPO_OPS.length)]!;
    const idx = Math.min(i, result.length - 1);
    const next = op(result, idx);
    if (next !== result && next.length >= 1) {
      result = next;
      count++;
    }
  }
  return result;
}

const WORD_RE = /([A-Za-z\u4e00-\u9fff]+)/g;

/**
 * 为文本添加真实的拼写错误。
 *
 * - 不会影响 URL、数字、表情符号和标点符号。
 * - 短于 3 个字符的单词不会被破坏（效果不好）。
 * - 并非每个单词都会有错误——只有统计上 intensity 比例的单词
 *   会出现拼写错误。
 */
export function injectTypos(text: string, opts: TypoOptions = {}): string {
  const merged: Required<TypoOptions> = {
    intensity: opts.intensity ?? 0.06,
    maxPerWord: opts.maxPerWord ?? 1
  };
  if (merged.intensity <= 0) return text;
  // 不处理包含 URL 的字符串（直接跳过整行）。
  if (/(?:https?:\/\/|www\.|t\.me\/|@\w+)/i.test(text)) return text;
  return text.replace(WORD_RE, (word) => {
    // 每个词以 intensity * 4 的概率获得一次拼写错误尝试。
    // （corruptWord 内部也会控制密度）。
    if (Math.random() > merged.intensity * 4) return word;
    return corruptWord(word, merged);
  });
}

/**
 * 决定是否在此条回复中添加拼写错误。
 *
 * 决策依赖于 vibe/communication 风格："warm"——错误更少，
 * "short"/"bursty"——错误更多。返回 intensity（0 = 不添加错误）。
 */
export function pickTypoIntensity(opts: { messageStyle?: string; vibe?: string; bubbles?: number }): number {
  // 基础频率较低。
  let base = 0.04;
  if (opts.messageStyle === "bursty" || opts.vibe === "short") base = 0.08;
  if (opts.messageStyle === "longform" || opts.vibe === "warm") base = 0.025;
  // 气泡较多时允许稍微多一点错误。
  if ((opts.bubbles ?? 1) >= 3) base += 0.02;
  // 每条回复单独掷骰子：60% 的回复完全不出错。
  if (Math.random() < 0.6) return 0;
  return base;
}
