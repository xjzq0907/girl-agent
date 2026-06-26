import type { StagePreset } from "../types.js";

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: "met-irl-got-tg",
    num: 1,
    label: "线下见面 — 给了TG",
    description: "刚交换TG。记得长相、声音。轻度兴趣。",
    defaults: {
      interest: 38, trust: 14, attraction: 30, annoyance: 0, cringeTolerance: 14,
      ignoreChance: 0.12, replyDelaySec: [15, 600]
    }
  },
  {
    id: "tg-given-cold",
    num: 2,
    label: "给了TG，但没说服她回复",
    description: "犹豫中。经常无视，只回一两个字。需要努力争取。",
    defaults: {
      interest: 5, trust: 0, attraction: 5, annoyance: 0, cringeTolerance: -10,
      ignoreChance: 0.65, replyDelaySec: [600, 14400]
    }
  },
  {
    id: "tg-given-warming",
    num: 3,
    label: "给了TG，谨慎回复",
    description: "正在暖化。回复了但很短。在测试你。",
    defaults: {
      interest: 30, trust: 15, attraction: 25, annoyance: 0, cringeTolerance: 5,
      ignoreChance: 0.18, replyDelaySec: [30, 1200]
    }
  },
  {
    id: "convinced",
    num: 4,
    label: "说服她稳定回复了",
    description: "经常聊天，暧昧互动，认识后还没见过面。",
    defaults: {
      interest: 50, trust: 35, attraction: 45, annoyance: 0, cringeTolerance: 15,
      ignoreChance: 0.07, replyDelaySec: [10, 420]
    }
  },
  {
    id: "first-date-done",
    num: 5,
    label: "约过一次",
    description: "第一次约会过了，悬而未决 — 有好感，但还不是一对。",
    defaults: {
      interest: 60, trust: 45, attraction: 55, annoyance: 0, cringeTolerance: 25,
      ignoreChance: 0.05, replyDelaySec: [8, 300]
    }
  },
  {
    id: "dating-early",
    num: 6,
    label: "刚开始在一起",
    description: "在一起一个月左右。热恋期，一切都很新鲜，但界限还很脆弱。",
    defaults: {
      interest: 75, trust: 60, attraction: 70, annoyance: 0, cringeTolerance: 35,
      ignoreChance: 0.02, replyDelaySec: [3, 120]
    }
  },
  {
    id: "dating-stable",
    num: 7,
    label: "情侣，自由交流",
    description: "稳定关系，开玩笑、日常琐碎、互相信任。",
    defaults: {
      interest: 80, trust: 80, attraction: 75, annoyance: 0, cringeTolerance: 50,
      ignoreChance: 0.03, replyDelaySec: [3, 240]
    }
  },
  {
    id: "long-term",
    num: 8,
    label: "在一起很久了",
    description: "一年以上。偶尔烦躁、日常化，但有深厚的信任。",
    defaults: {
      interest: 70, trust: 90, attraction: 65, annoyance: 10, cringeTolerance: 60,
      ignoreChance: 0.05, replyDelaySec: [5, 900]
    }
  },
  {
    id: "dumped",
    num: 9,
    label: "不搭理了（管理用）",
    description: "不回复。通过 :reset 命令解除。",
    defaults: {
      interest: -50, trust: -30, attraction: -40, annoyance: 80, cringeTolerance: -50,
      ignoreChance: 1.0, replyDelaySec: [99999, 99999]
    }
  }
];

export function findStage(id: string | number): StagePreset {
  if (typeof id === "number" || /^\d+$/.test(String(id))) {
    const num = Number(id);
    return STAGE_PRESETS.find(s => s.num === num) ?? STAGE_PRESETS[1]!;
  }
  return STAGE_PRESETS.find(s => s.id === id) ?? STAGE_PRESETS[1]!;
}
