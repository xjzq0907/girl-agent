// 在线行为模拟。每个女孩有自己的 TG 上线模式。
// 用于实现真实的回复延迟，以及解决"她此刻不在线"的问题。

import type { BusySlot, CommunicationProfile, ProfileConfig, StageId, Weekday } from "../types.js";
import type { ConflictState } from "./conflict.js";
import { normalizeCommunicationProfile } from "../presets/communication.js";

export type PresencePattern =
  | "phone-attached"   // 手机几乎不离手。回复很快。只有睡觉/工作时离线
  | "burst-checker"    // 每15-30分钟上线看2-5分钟，然后再次离开
  | "rare-checker"     // 每1-2小时看一次，有时会忘
  | "evening-only"     // 白天在忙（工作/大学），18:00之后才活跃
  | "phone-attached-night"; // 夜猫子，22:00-04:00活跃，白天无精打采

export interface PresenceProfile {
  pattern: PresencePattern;
  /** 她当地时区的睡眠时间段（起止，可能跨越午夜）。从配置文件中获取。 */
  sleepFrom: number; // 0..23
  sleepTo: number;   // 0..23
  /** 平均上线间隔（分钟） */
  checkEveryMin: number;
  /** 每次上线保持"在线"的分钟数 */
  onlineWindowMin: number;
  /** 离线时回复消息的基础概率（通过推送通知） */
  offlineReplyChance: number; // 0..1
  /** 夜间被消息唤醒的概率 */
  nightWakeChance: number;
}

/** 根据姓名种子和人物设定，确定性地生成存在模式配置。睡眠时间从配置文件中获取。 */
export function computePresenceProfile(cfg: ProfileConfig): PresenceProfile {
  const seed = [...cfg.name].reduce((a, c) => a + c.charCodeAt(0), 0) + cfg.age;
  const r = (n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const communication = normalizeCommunicationProfile(cfg);

  const patterns: PresencePattern[] = [
    "phone-attached", "burst-checker", "rare-checker", "evening-only", "phone-attached-night"
  ];
  let pattern = patterns[Math.floor(r(1) * patterns.length)] ?? "burst-checker";
  if (communication.notifications === "priority") {
    pattern = communication.messageStyle === "bursty" || pattern === "rare-checker" || pattern === "evening-only" ? "phone-attached" : pattern;
  } else if (communication.notifications === "muted") {
    pattern = pattern === "phone-attached" ? "burst-checker" : pattern === "phone-attached-night" ? "evening-only" : pattern;
  }

  const sleepFrom = cfg.sleepFrom ?? 23;
  const sleepTo = cfg.sleepTo ?? 8;
  const baseNightWakeChance = cfg.nightWakeChance ?? 0.05;
  const nightWakeChance = communication.notifications === "priority"
    ? Math.min(0.35, baseNightWakeChance + 0.05)
    : communication.notifications === "muted"
      ? Math.max(0, baseNightWakeChance * 0.4)
      : baseNightWakeChance;

  let checkEveryMin =
    pattern === "phone-attached" ? 3 + Math.floor(r(4) * 5) :
    pattern === "burst-checker" ? 15 + Math.floor(r(4) * 20) :
    pattern === "rare-checker" ? 60 + Math.floor(r(4) * 60) :
    pattern === "evening-only" ? 45 + Math.floor(r(4) * 30) :
    10 + Math.floor(r(4) * 15);

  let onlineWindowMin =
    pattern === "phone-attached" ? 30 + Math.floor(r(5) * 60) :
    pattern === "burst-checker" ? 2 + Math.floor(r(5) * 4) :
    pattern === "rare-checker" ? 5 + Math.floor(r(5) * 10) :
    pattern === "evening-only" ? 60 + Math.floor(r(5) * 90) :
    20 + Math.floor(r(5) * 40);

  let offlineReplyChance =
    pattern === "phone-attached" ? 0.85 :
    pattern === "burst-checker" ? 0.5 :
    pattern === "rare-checker" ? 0.25 :
    pattern === "evening-only" ? 0.3 :
    0.55;

  if (communication.notifications === "priority") {
    checkEveryMin = Math.max(2, Math.round(checkEveryMin * 0.35));
    onlineWindowMin = Math.round(onlineWindowMin * 1.35);
    offlineReplyChance = Math.max(offlineReplyChance, communication.initiative === "high" ? 0.95 : 0.85);
  } else if (communication.notifications === "muted") {
    checkEveryMin = Math.round(checkEveryMin * 1.5);
    onlineWindowMin = Math.max(1, Math.round(onlineWindowMin * 0.65));
    offlineReplyChance = Math.min(offlineReplyChance, 0.25);
  }

  if (["convinced", "first-date-done", "dating-early", "dating-stable", "long-term"].includes(cfg.stage)) {
    offlineReplyChance = Math.min(0.98, offlineReplyChance + 0.12);
    checkEveryMin = Math.max(2, Math.round(checkEveryMin * 0.8));
  } else if (cfg.stage === "met-irl-got-tg") {
    offlineReplyChance = Math.min(0.9, offlineReplyChance + 0.08);
  }

  return { pattern, sleepFrom, sleepTo, checkEveryMin, onlineWindowMin, offlineReplyChance, nightWakeChance };
}

export interface PresenceState {
  /** 此刻从模拟角度看，她是否"在 TG 在线" */
  online: boolean;
  /** 是否在睡觉 */
  asleep: boolean;
  /** 夜间是否被唤醒（强制或随机）——影响回复风格 */
  nightAwake: boolean;
  /** 距离她下次上线看 TG 还有多少秒（如果当前离线） */
  nextCheckSec: number;
  /** 她时区的本地小时数 */
  localHour: number;
  /** 用于 prompt 的文本描述 */
  hint: string;
  busy?: { label: string; until: string; checkAfterMin: number };
  notificationSeen: boolean;
}

function isHourInRange(h: number, from: number, to: number): boolean {
  if (from === to) return false;
  if (from < to) return h >= from && h < to;
  return h >= from || h < to;
}

function minutesUntil(hour: number, minute: number, targetHour: number, targetMinute: number): number {
  const now = hour * 60 + minute;
  const target = targetHour * 60 + targetMinute;
  return target > now ? target - now : target + 1440 - now;
}

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function localParts(tz: string): { hour: number; minute: number; weekday: Weekday } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = fmt.formatToParts(new Date());
    const rawHour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    const weekdayRaw = (parts.find(p => p.type === "weekday")?.value ?? "Mon").toLowerCase().slice(0, 3);
    const map: Record<string, Weekday> = { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" };
    return { hour: rawHour % 24, minute, weekday: map[weekdayRaw] ?? "mon" };
  } catch {
    const d = new Date();
    return { hour: d.getHours(), minute: d.getMinutes(), weekday: WEEKDAYS[(d.getDay() + 6) % 7] ?? "mon" };
  }
}

function parseTime(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function previousWeekday(day: Weekday): Weekday {
  const idx = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(idx + 6) % 7] ?? "mon";
}

function dayAllowed(slot: BusySlot, day: Weekday): boolean {
  return !slot.days?.length || slot.days.includes(day);
}

function activeBusySlot(slots: BusySlot[] | undefined, day: Weekday, minuteOfDay: number): { slot: BusySlot; remainingMin: number; until: string } | null {
  for (const slot of slots ?? []) {
    const from = parseTime(slot.from);
    const to = parseTime(slot.to);
    if (from == null || to == null || from === to) continue;
    if (from < to) {
      if (dayAllowed(slot, day) && minuteOfDay >= from && minuteOfDay < to) {
        return { slot, remainingMin: to - minuteOfDay, until: slot.to };
      }
      continue;
    }
    if (dayAllowed(slot, day) && minuteOfDay >= from) {
      return { slot, remainingMin: 1440 - minuteOfDay + to, until: slot.to };
    }
    if (dayAllowed(slot, previousWeekday(day)) && minuteOfDay < to) {
      return { slot, remainingMin: to - minuteOfDay, until: slot.to };
    }
  }
  return null;
}

function randomCheckAfter(slot: BusySlot): number {
  const [lo, hi] = slot.checkAfterMin ?? [5, 15];
  const min = Math.max(1, Math.min(lo, hi));
  const max = Math.max(min, Math.max(lo, hi));
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * 判断在活跃对话中，进入忙时槽位是否应该提醒对话对象。
 * 返回提示字符串，如果直接沉默离开则返回 null。
 */
function busyTransitionHint(
  stage: StageId,
  comm: CommunicationProfile,
  remainingMin: number,
  checkAfterMin: number,
  recentExchangeCount: number
): string | null {
  // --- 根据关系阶段的基础概率 ---
  const stageChance: Record<StageId, number> = {
    "met-irl-got-tg": 0.05,
    "tg-given-cold": 0.08,
    "tg-given-warming": 0.18,
    "convinced": 0.40,
    "first-date-done": 0.55,
    "dating-early": 0.70,
    "dating-stable": 0.80,
    "long-term": 0.75,
    "dumped": 0.0
  };
  let chance = stageChance[stage] ?? 0.3;

  // --- 沟通风格的修正 ---
  if (comm.initiative === "high") chance += 0.15;
  else if (comm.initiative === "low") chance -= 0.15;

  if (comm.notifications === "priority") chance += 0.10;
  else if (comm.notifications === "muted") chance -= 0.10;

  if (comm.lifeSharing === "high") chance += 0.05;

  // --- 根据忙碌时长的修正 ---
  if (remainingMin <= 10) chance -= 0.20;
  else if (remainingMin <= 20) chance -= 0.05;
  else if (remainingMin >= 90) chance += 0.15;
  else if (remainingMin >= 45) chance += 0.08;

  // --- 根据任务重要程度的修正 ---
  if (checkAfterMin >= 30) chance += 0.15;
  else if (checkAfterMin >= 15) chance += 0.05;
  else if (checkAfterMin <= 8) chance -= 0.10;

  // --- 根据对话强度的修正 ---
  if (recentExchangeCount >= 6) chance += 0.10;
  else if (recentExchangeCount >= 4) chance += 0.05;

  chance = Math.max(0, Math.min(1, chance));
  if (Math.random() >= chance) return null;

  // --- 提醒风格取决于关系阶段和人格 ---
  const isClose = ["dating-early", "dating-stable", "long-term"].includes(stage);
  const isWarm = comm.initiative === "high" || comm.lifeSharing === "high";
  const isCold = comm.initiative === "low" && comm.messageStyle === "one-liners";

  if (isCold) {
    return `进入忙时状态：你刚才在活跃对话中，但现在要开始${remainingMin > 30 ? "比较长时间" : "短时间"}的忙碌。简单冷淡地提醒一下，按你的人设风格——就一两个字（"忙"、"回头"、"有事"）。不用解释太多。`;
  }
  if (isClose && isWarm) {
    return `进入忙时状态：你刚才在活跃对话中，但现在要做其他事情了。用亲切自然的方式提醒他，以你们亲密关系的口吻（比如："宝贝我要去忙${remainingMin > 45 ? "一会儿" : "一下下"}，回头找你"或"我有点事去，要乖哦"）。风格参考你的persona。`;
  }
  if (isClose) {
    return `进入忙时状态：你刚才在活跃对话中，但现在要做其他事情了。自然地提醒一下（比如："我得走开一下，等下回复你"或"我要忙${remainingMin > 45 ? "一阵" : "一会"}了，晚点回你"）。`;
  }
  return `进入忙时状态：你刚才在活跃对话中，但现在要到其他事情了。可以简单提醒一下要走了（比如："我先走了，回头聊"或"我该走了，等一下回你哈"）。风格取决于你们的关系阶段和persona。`;
}

export function computePresenceState(
  cfg: ProfileConfig,
  profile: PresenceProfile,
  lastUserMsgTs: number,
  lastHerReplyTs: number,
  recentExchangeCount: number,
  forcedWake = false,
  conflict: ConflictState | null = null
): PresenceState {
  const local = localParts(cfg.tz);
  const communication = normalizeCommunicationProfile(cfg);
  const localHour = local.hour;
  const localMinute = local.minute;
  const minuteOfDay = localHour * 60 + localMinute;

  const asleep = isHourInRange(localHour, profile.sleepFrom, profile.sleepTo);
  const busySlot = asleep ? null : activeBusySlot(cfg.busySchedule, local.weekday, minuteOfDay);

  // 检查冲突的冷处理期
  const conflictCold = conflict && conflict.coldUntil ? new Date(conflict.coldUntil).getTime() > Date.now() : false;

  // 夜间唤醒：强制唤醒或随机概率（强制唤醒始终有效，随机只在睡着时触发）
  const nightAwake = forcedWake || (asleep && Math.random() < profile.nightWakeChance);

  // 活跃对话：最近30分钟至少3个来回，且她最后一条回复还算新鲜
  const now = Date.now();
  const inActiveDialog = recentExchangeCount >= 3
    && lastHerReplyTs > 0
    && now - lastHerReplyTs < 15 * 60 * 1000
    && now - lastUserMsgTs < 5 * 60 * 1000;

  let online: boolean;
  let nextCheckSec = 0;
  let busy: PresenceState["busy"] | undefined;
  let notificationSeen = false;

  // 如果冲突冷处理期激活——她不在线
  if (conflictCold && !forcedWake) {
    online = false;
    const remainingMs = new Date(conflict!.coldUntil!).getTime() - now;
    nextCheckSec = Math.max(60, Math.floor(remainingMs / 1000));
  } else if (asleep && !nightAwake) {
    online = false;
    // 下次检查 = 直到早上 + 随机 0-30 分钟
    let hoursToWake = profile.sleepTo - localHour;
    if (hoursToWake < 0) hoursToWake += 24;
    // 如果此刻刚好该醒了（sleepTo == localHour），约30分钟后检查
    if (hoursToWake === 0) hoursToWake = 0.5;
    nextCheckSec = Math.floor(hoursToWake * 3600) + Math.floor(Math.random() * 1800);
  } else if (busySlot && !forcedWake) {
    const busyMul = communication.notifications === "priority" ? 0.45 : communication.notifications === "muted" ? 1.25 : 1;
    const activeDialogMul = inActiveDialog ? 0.35 : 1;
    const [rawMinCheck, rawMaxCheck] = busySlot.slot.checkAfterMin ?? [5, 15];
    const minCheck = Math.max(1, Math.round(rawMinCheck * busyMul * activeDialogMul));
    const maxCheck = Math.max(minCheck, Math.round(rawMaxCheck * busyMul * activeDialogMul));
    if (maxCheck <= 5) {
      // 无聊的任务——每隔1-5分钟快速刷一下Telegram，持续30-90秒
      const cycleMin = Math.max(1, Math.round((minCheck + maxCheck) / 2));
      const minuteOfCycle = minuteOfDay % Math.max(1, cycleMin);
      const onlineMin = Math.max(1, Math.min(2, Math.floor(cycleMin / 2)));
      online = minuteOfCycle < onlineMin;
      if (!online) {
        nextCheckSec = (cycleMin - minuteOfCycle) * 60;
      }
      busy = { label: busySlot.slot.label, until: busySlot.until, checkAfterMin: cycleMin };
    } else {
      online = false;
      const checkAfterMin = minCheck + Math.floor(Math.random() * (maxCheck - minCheck + 1));
      const activeDialogCapMin = communication.notifications === "priority" ? 12 : 20;
      const waitMin = inActiveDialog ? Math.min(busySlot.remainingMin + checkAfterMin, activeDialogCapMin) : busySlot.remainingMin + checkAfterMin;
      nextCheckSec = waitMin * 60;
      busy = { label: busySlot.slot.label, until: busySlot.until, checkAfterMin };
    }
  } else if (forcedWake) {
    online = true;
    nextCheckSec = 0;
  } else if (inActiveDialog) {
    online = true;
    nextCheckSec = 0;
  } else {
    // Time-of-day gates for pattern-specific behavior
    const isEvening = localHour >= 18 || localHour < profile.sleepFrom;
    const isNightOwl = localHour >= 22 || localHour < 8;
    if (profile.pattern === "evening-only" && !isEvening) {
      online = false;
      const minutesToEvening = Math.max(1, minutesUntil(localHour, localMinute, 18, 0));
      const capMin = communication.notifications === "priority" ? 20 : communication.initiative === "high" ? 35 : minutesToEvening;
      nextCheckSec = Math.min(minutesToEvening, capMin) * 60 + Math.floor(Math.random() * 600);
    } else if (profile.pattern === "phone-attached-night" && !isNightOwl) {
      online = false;
      const minutesToNight = Math.max(1, minutesUntil(localHour, localMinute, 22, 0));
      const capMin = communication.notifications === "priority" ? 15 : communication.initiative === "high" ? 30 : 75;
      nextCheckSec = Math.min(minutesToNight, capMin) * 60 + Math.floor(Math.random() * 600);
    } else {
      // 使用伪随机窗口：此刻在窗口内的概率 = onlineWindow / (onlineWindow + checkEvery)
      const onlineProb = profile.onlineWindowMin / (profile.onlineWindowMin + profile.checkEveryMin);
      online = Math.random() < onlineProb;
      if (!online) {
        notificationSeen = Math.random() < profile.offlineReplyChance;
        nextCheckSec = notificationSeen
          ? 60 + Math.floor(Math.random() * 4 * 60)
          : Math.max(30, Math.floor(Math.random() * profile.checkEveryMin * 60));
      }
    }
  }

  // prompt 提示语
  let hint: string;
  if (forcedWake) {
    hint = `强制唤醒——你收到了通知/被叫醒了。即使平时在睡觉或忙碌，也要回复。不要提你被"叫醒"了，像平时一样正常回复就好。`;
  } else if (conflictCold && !forcedWake && conflict) {
    const hoursLeft = Math.ceil((new Date(conflict.coldUntil!).getTime() - now) / 3600_000);
    hint = `冷战/闹别扭中 (等级 ${conflict.level})。你处于沉默模式。还剩约${hoursLeft}小时的冷处理时间。回复极简、冷淡：".", "哦", "嗯", "然后呢"。不用任何表情包，不用"）"括号。可以完全不回。只有当他真正诚恳道歉的时候才可能原谅。`;
  } else if (asleep && !nightAwake) {
    hint = `正在睡觉（当地时间 ${localHour}:00）。如果回复了，那就是迷迷糊糊的、只言片语，要么干脆不理到早上。`;
  } else if (nightAwake) {
    hint = `半夜醒来（当地时间 ${localHour}:00）。你半夜醒了——也许是被通知吵醒，也许是自己醒了。脑子不清醒。回复很短、有错别字、不用大号字体、迷迷糊糊。可能说着说着又睡着了——那就戛然而止。不聊长话题。如果不想聊，一句"睡了"或"明天再说"。`;
  } else if (busy) {
    if ((busy.checkAfterMin ?? 15) <= 5) {
      hint = `正在${busy.label}（到${busy.until}），但比较无聊——抽空刷刷Telegram。可以快速回复，但也可能错过时机。`;
    } else {
      hint = `现在正忙：${busy.label} 一直到 ${busy.until}。无法正常回复。之后会在${busy.checkAfterMin}分钟后打开Telegram查看；消息会被读到，回复也要等到那时。`;
      if (inActiveDialog && busySlot) {
        const notifyHint = busyTransitionHint(cfg.stage, communication, busySlot.remainingMin, busy.checkAfterMin ?? 15, recentExchangeCount);
        if (notifyHint) hint += "\n\n" + notifyHint;
      }
    }
  } else if (online) {
    if (inActiveDialog) {
      hint = `活跃对话中。回复相对较快。如果你突然"消失了"——必须有借口（妈妈进来了 / 上厕所 / 拿吃的 / 猫猫跳到腿上了）。突然"离线"没有理由——这太假了，别这样。`;
    } else {
      hint = `现在在线，但不沉迷——只是打开TG看了一眼。可以直接进入对话，或者等1-2分钟再回。`;
    }
  } else {
    hint = notificationSeen
      ? `现在不在线，但看到了通知。大约${Math.round(nextCheckSec / 60)}分钟后会打开Telegram，如果愿意的话那时再回复。`
      : `现在不在线（上线模式: ${profile.pattern}）。没注意到通知；大约${Math.round(nextCheckSec / 60)}分钟后，自己刷TG的时候才会看到这条消息。这很正常，现实中没人24小时守在TG上。`;
  }
  if (!conflictCold && !asleep && communication.notifications === "priority") {
    hint += ` 他的通知对你很重要，所以聊得正热络的时候别无缘无故消失。`;
  }

  return { online, asleep, nightAwake, nextCheckSec, localHour, hint, busy, notificationSeen };
}
