// Issue #81 — 周期性无消息地上线以增加真实感。
// 真实的女孩会经常"挂"在 Telegram 上不聊天 —— 这是正常的。
// 该模块决定 userbot 何时应调用 account.UpdateStatus({offline:false})。

import type { ProfileConfig } from "../types.js";
import { computePresenceState, type PresenceProfile } from "./presence.js";

export interface OnlineHeartbeatDecision {
  /** 当前她是否应显示为在线。 */
  online: boolean;
  /** 多少秒后再次检查。 */
  nextTickSec: number;
  /** 用于日志的决策简短说明。 */
  reason: string;
}

export interface OnlineHeartbeatInput {
  /** 当前处于活跃对话中（她已通过发消息自然在线 —— 不需要 heartbeat）。 */
  inActiveDialog: boolean;
  /** 她最近发过消息的时间戳（<2 分钟）—— 网络活跃的保证。 */
  recentSendMs: number;
}

/**
 * 决定她现在是否应"挂"在 Telegram 上显示为在线。
 *
 * 逻辑：
 * - 若处于活跃对话 → 发送消息本身会让她显示在线，无需 heartbeat；
 * - 若刚发了消息（<90秒）—— Telegram 已认为其在线，跳过；
 * - 睡觉中 / 处于严重 busy 时段 → 离线；
 * - presence.online == true → 模式中的某次"随机上线" → 触发 ping；
 * - 否则等到 next-check 后再重新尝试。
 */
export function decideOnlineHeartbeat(
  cfg: ProfileConfig,
  profile: PresenceProfile,
  input: OnlineHeartbeatInput
): OnlineHeartbeatDecision {
  if (input.inActiveDialog) {
    return { online: false, nextTickSec: 90, reason: "active-dialog (natural online via send)" };
  }
  if (Date.now() - input.recentSendMs < 90_000) {
    return { online: false, nextTickSec: 90, reason: "recent-send (natural online)" };
  }

  // computePresenceState 使用 Math.random 决定 onlineProb。
  const state = computePresenceState(
    cfg, profile,
    /*lastUserMsgTs=*/0,
    /*lastHerReplyTs=*/0,
    /*recentExchangeCount=*/0,
    /*forcedWake=*/false,
    /*conflict=*/null
  );

  if (state.asleep && !state.nightAwake) {
    // 睡觉中 —— 偶尔查看，使用较长超时
    const sec = Math.max(20 * 60, Math.min(state.nextCheckSec, 90 * 60));
    return { online: false, nextTickSec: sec, reason: "asleep" };
  }

  if (state.busy && (state.busy.checkAfterMin ?? 0) > 5) {
    // 严重忙碌 —— 不显示在线
    return { online: false, nextTickSec: Math.max(5 * 60, Math.min(state.nextCheckSec, 30 * 60)), reason: `busy: ${state.busy.label}` };
  }

  if (state.online) {
    // 维持一个真实的在线窗口，然后允许其离线。
    const sec = Math.max(45, Math.min(150, Math.round(profile.onlineWindowMin * 60)));
    return { online: true, nextTickSec: sec, reason: `presence-online (${profile.pattern})` };
  }

  // 不在线 —— 下次 tick 使用 presence.nextCheckSec，但封顶 10 分钟
  // 以便定期"掷骰子"，偶尔在预期窗口之外出现。
  const sec = Math.max(60, Math.min(state.nextCheckSec || 600, 10 * 60));
  return { online: false, nextTickSec: sec, reason: `offline (${profile.pattern})` };
}
