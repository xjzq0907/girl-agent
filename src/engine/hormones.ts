// 生化近似模型：按周期日计算的连续激素曲线 + 昼夜皮质醇。
// 逻辑来源：
//   - 雌二醇：双峰（卵泡期高峰第12-13天，黄体中期第二个小峰）
//   - 孕酮：黄体中期单峰（约第21天）
//   - LH：排卵前约36小时的尖峰
//   - 皮质醇：昼夜节律（CAR——皮质醇觉醒反应，早上7-9点，夜间下降，凌晨2-4点最低点）+ 黄体期+20%
//   - 催产素：排卵期温暖平台，亲密关系阶段升高
//   - BBT：排卵后黄体期+0.3..+0.5°C
//   - PMDD：约8%女性——黄体晚期反应急剧增强
// HormoneSnapshot中的数值为相对指数0..100，非血浆单位。与实际曲线成正比。

export interface HormoneSnapshot {
  estrogen: number;     // 0..100（周期中期峰值约95）
  progesterone: number; // 0..100（黄体中期峰值约85）
  oxytocin: number;     // 0..100
  cortisol: number;     // 0..100
  lh: number;           // 0..100（排卵前尖峰）
  /** 基础体温相对于平均值的偏移，°C。卵泡期约0，黄体期约+0.35。 */
  bbtDelta: number;
  cyclePhase: "menstrual" | "early-follicular" | "late-follicular" | "ovulation" | "early-luteal" | "late-luteal";
  /** 昼夜活动 -1..+1，早晨疲倦为负，白天高峰为正 */
  energy: number;
  irritability: number; // 0..1
  affection: number;    // 0..1
  libido: number;       // 0..1，排卵窗口高峰
  cycleDay: number;     // 1..N，她的个人周期
  cycleLength: number;  // 她的个人长度（24..34）
  pmdd: boolean;        // 如果该女孩有PMDD级别反应则为true（约8%人群）
}

// ===== 辅助函数 =====
function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function mod(a: number, n: number): number { return ((a % n) + n) % n; }

// 基于种子的伪随机（对同一女孩是确定性的）
function seedRand(seed: number, salt: number): number {
  const x = Math.sin(seed * 9301.13 + salt * 49297.71) * 233280;
  return x - Math.floor(x);
}

/**
 * 她的个人周期长度。成人——26..32，青少年——24..34，波动较大。
 */
function personalCycleLength(seed: number, age: number): number {
  const r = seedRand(seed, 7);
  if (age <= 18) return Math.round(24 + r * 10);  // 24..34
  if (age <= 22) return Math.round(25 + r * 7);   // 25..32
  return Math.round(26 + r * 6);                   // 26..32
}

/**
 * 当日 → 根据相对于总长度的标准化标记确定周期阶段。
 */
function phaseOf(cycleDay: number, len: number): HormoneSnapshot["cyclePhase"] {
  // 归一化到标准28天
  const ovulDay = Math.round(len - 14); // 黄体期稳定约14天
  if (cycleDay <= 4) return "menstrual";
  if (cycleDay <= ovulDay - 5) return "early-follicular";
  if (cycleDay <= ovulDay - 1) return "late-follicular";
  if (cycleDay <= ovulDay + 1) return "ovulation";
  if (cycleDay <= ovulDay + 8) return "early-luteal";
  return "late-luteal";
}

export function computeHormones(birthSeed: number, age: number, now = new Date(), stressLoad = 0): HormoneSnapshot {
  // 1) 个人周期长度 + 青少年的随机偏移
  const cycleLength = personalCycleLength(birthSeed, age);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

  // 青少年——±2天的不规律性（按日期确定）
  const teenJitter = age <= 18 ? Math.round((seedRand(birthSeed, dayOfYear) - 0.5) * 4) : 0;
  // 压力延迟排卵：高烦恼/尴尬（stressLoad 0..1）最多增加3天
  const stressShift = Math.round(stressLoad * 3);

  const cycleDay = mod(dayOfYear + birthSeed + teenJitter - stressShift, cycleLength) + 1; // 1..len

  const ovulDay = cycleLength - 14;
  const phase = phaseOf(cycleDay, cycleLength);

  // 2) 雌二醇：双峰
  //    主峰 ~ovulDay-1（sigma 2），次峰 ~ovulDay+7（sigma 3，振幅 0.4）
  const estrogenBase = 18; // 月经期基础最低值
  const estrogenMain = 80 * gauss(cycleDay, ovulDay - 1, 2);
  const estrogenSecondary = 32 * gauss(cycleDay, ovulDay + 7, 3);
  let estrogen = clamp(estrogenBase + estrogenMain + estrogenSecondary, 0, 100);

  // 3) LH：排卵前约36小时的尖峰，sigma 0.6天
  const lh = clamp(95 * gauss(cycleDay, ovulDay - 1.5, 0.6) + 8, 0, 100);

  // 4) 孕酮：黄体中期高峰
  //    排卵前为零，然后上升，高峰约ovulDay+7，末期下降
  const progesteroneRaw = cycleDay > ovulDay
    ? 85 * gauss(cycleDay, ovulDay + 7, 3.5)
    : 5 * gauss(cycleDay, ovulDay + 1, 1.5); // 排卵后小峰
  const progesterone = clamp(progesteroneRaw, 0, 100);

  // 5) BBT delta：排卵前为0，排卵后+0.35±0.1
  let bbtDelta = 0;
  if (cycleDay > ovulDay) {
    const peak = 0.35 + (seedRand(birthSeed, 11) - 0.5) * 0.2;
    bbtDelta = peak * Math.min(1, (cycleDay - ovulDay) / 2);
  }

  // 6) 皮质醇：昼夜CAR + 黄体期加成 + 压力
  //    CAR：早上7-9点高峰（~+30%），夜间下降，凌晨约3点最低点
  const hour = now.getHours() + now.getMinutes() / 60;
  // 平滑曲线：cos相位使最大值在约8:00
  const carCurve = Math.cos(((hour - 8) / 24) * Math.PI * 2); // -1..+1，+1在8:00
  const cortisolDiurnal = 35 + carCurve * 28; // 7..63
  const lutealBoost = phase === "early-luteal" || phase === "late-luteal" ? 12 : 0;
  const menstrualBoost = phase === "menstrual" ? 10 : 0;
  const teenBase = age <= 18 ? 10 : age <= 22 ? 5 : 0;
  let cortisol = clamp(cortisolDiurnal + lutealBoost + menstrualBoost + teenBase + stressLoad * 20, 0, 100);

  // 7) 催产素：平稳平台，排卵期升高，黄体期略降低
  let oxytocin = 45 + (estrogen - 40) * 0.25;
  if (phase === "ovulation") oxytocin += 18;
  if (phase === "late-luteal") oxytocin -= 8;
  oxytocin = clamp(oxytocin, 10, 100);

  // 8) 性欲：排卵高峰（sigma 2）+ 卵泡晚期小平台
  const libidoOvul = gauss(cycleDay, ovulDay - 1, 2);
  const libidoLateFoll = 0.35 * gauss(cycleDay, ovulDay - 5, 4);
  let libido = clamp(libidoOvul + libidoLateFoll, 0, 1);
  if (phase === "menstrual") libido *= 0.4;
  if (phase === "late-luteal") libido *= 0.6;

  // 9) PMDD：约8%人群——黄体晚期反应急剧
  const pmdd = seedRand(birthSeed, 13) < 0.08;

  // 10) 易怒性和情感——导出值
  let irritability =
    phase === "menstrual" ? 0.5 :
    phase === "early-follicular" ? 0.2 :
    phase === "late-follicular" ? 0.12 :
    phase === "ovulation" ? 0.08 :
    phase === "early-luteal" ? 0.25 :
    /* late-luteal */ (pmdd ? 0.85 : 0.55);
  // 青少年——更紧张
  if (age <= 18) irritability = clamp(irritability + 0.1, 0, 1);
  // 压力加成
  irritability = clamp(irritability + stressLoad * 0.25, 0, 1);

  let affection =
    phase === "ovulation" ? 0.85 :
    phase === "late-follicular" ? 0.7 :
    phase === "early-follicular" ? 0.55 :
    phase === "early-luteal" ? 0.5 :
    phase === "menstrual" ? 0.35 :
    /* late-luteal */ (pmdd ? 0.2 : 0.4);
  affection = clamp(affection - stressLoad * 0.15, 0, 1);

  // 11) 能量：昼夜（通过CAR）+ 周期阶段影响
  const phaseEnergyBias =
    phase === "menstrual" ? -0.25 :
    phase === "early-follicular" ? 0.05 :
    phase === "late-follicular" ? 0.2 :
    phase === "ovulation" ? 0.25 :
    phase === "early-luteal" ? 0 :
    /* late-luteal */ (pmdd ? -0.4 : -0.2);
  // 昼夜节律分量：9-20点高，夜间低
  const dayCirc = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.45;
  const energy = clamp(dayCirc + phaseEnergyBias - stressLoad * 0.2, -1, 1);

  return {
    estrogen, progesterone, oxytocin, cortisol, lh,
    bbtDelta,
    cyclePhase: phase,
    energy, irritability, affection, libido,
    cycleDay, cycleLength, pmdd
  };
}

export function hormonesMd(h: HormoneSnapshot): string {
  return [
    `cycle_phase: ${h.cyclePhase} (天 ${h.cycleDay}/${h.cycleLength}${h.pmdd ? ", PMDD倾向" : ""})`,
    `estrogen: ${h.estrogen.toFixed(0)} | progesterone: ${h.progesterone.toFixed(0)} | LH: ${h.lh.toFixed(0)} | oxytocin: ${h.oxytocin.toFixed(0)} | cortisol: ${h.cortisol.toFixed(0)}`,
    `BBT: +${h.bbtDelta.toFixed(2)}°C 相对于基准`,
    `energy: ${h.energy.toFixed(2)} | irritability: ${h.irritability.toFixed(2)} | affection: ${h.affection.toFixed(2)} | libido: ${h.libido.toFixed(2)}`
  ].join("\n");
}
