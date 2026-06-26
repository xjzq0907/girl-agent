import readline from "node:readline";
import type { Runtime, RuntimeEvent } from "./engine/runtime.js";
import { findStage } from "./presets/stages.js";
import { readRelationship, readMd, readSessionLog, sessionDate } from "./storage/md.js";
import type { ProfileConfig } from "./types.js";

/**
 * Headless / JSON-events 模式，供桌面包装器 (Rust 应用) 使用。
 *
 * - 不渲染任何 Ink/TUI。
 * - 将每个 Runtime 事件以 NDJSON 格式写入 stdout。
 * - 将 stdin 中的每一行视为命令（:status、:pause 等），
 *   并在同一 stdout 上回复 { "type": "response", "text": "..." }。
 * - 在 SIGINT/SIGTERM 时正确停止 runtime 并退出。
 *
 * 此契约是稳定的 — 外部进程（例如 girl-agent-desktop.exe）
 * 依赖于此。可以扩展，但不能破坏 — 只能与包装层同步修改。
 */
export async function runHeadlessJsonEvents(rt: Runtime): Promise<void> {
  const out = (obj: unknown) => {
    process.stdout.write(JSON.stringify(obj) + "\n");
  };

  out({ type: "ready", profile: profileSummary(rt.cfg) });

  rt.on("event", (e: RuntimeEvent) => {
    out({ ...e, t: Date.now() });
  });

  // Push initial relationship snapshot — 与 CLI 控制面板的挂载逻辑相同。
  try {
    const r = await readRelationship(rt.cfg.slug);
    out({ type: "score", score: r.score, t: Date.now() });
  } catch {
    /* 首次启动 — 还没有关系数据 */
  }

  let paused = false;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) return;
    if (!line.startsWith(":")) {
      out({ type: "response", ok: false, text: "命令以 : 开头" });
      return;
    }
    const [head, ...rest] = line.slice(1).split(" ");
    try {
      let text = "";
      switch (head) {
        case "status": text = await rt.cmdStatus(); break;
        case "model": text = await rt.cmdModel(rest); break;
        case "reset": text = await rt.cmdReset(); break;
        case "stage": text = await rt.cmdSetStage(rest.join(" ")); break;
        case "wake": text = await rt.cmdWake(rest[0]); break;
        case "debug": text = await rt.cmdDebug(rest[0]); break;
        case "why": text = await rt.cmdWhy(rest[0]); break;
        case "amnesia": text = await rt.cmdAmnesia(rest[0], rest[1]); break;
        case "sticker": text = await rt.cmdSticker(rest[0]); break;
        case "pause": rt.pause(); paused = true; text = "⏸ pause"; break;
        case "resume": rt.resume(); paused = false; text = "▶ resume"; break;
        case "cringe": {
          const r = await readRelationship(rt.cfg.slug);
          text = `cringe=${r.score.cringe}; 参见 memory/long-term.md 和 log/`;
          break;
        }
        case "relationship": {
          const r = await readRelationship(rt.cfg.slug);
          text = `stage=${r.stage} score=${JSON.stringify(r.score)}`;
          break;
        }
        case "persona": {
          const p = await readMd(rt.cfg.slug, "persona.md");
          text = p.slice(0, 4000);
          break;
        }
        case "log": {
          const day = /^\d{4}-\d{2}-\d{2}$/.test(rest[0] ?? "") ? rest[0]! : sessionDate(rt.cfg.tz);
          const limit = Number(rest.find(x => /^\d+$/.test(x)) ?? 3000);
          const p = await readSessionLog(rt.cfg.slug, day);
          text = p.trim() ? p.slice(-Math.max(500, Math.min(limit, 20000))) : `(log/${day}.md 为空)`;
          break;
        }
        case "snapshot": {
          // 方便 wrapper 使用的聚合快照 — 状态、评分、阶段。
          const r = await readRelationship(rt.cfg.slug);
          out({
            type: "snapshot",
            t: Date.now(),
            paused,
            profile: profileSummary(rt.cfg),
            stage: { id: r.stage, num: findStage(r.stage as ProfileConfig["stage"]).num, label: findStage(r.stage as ProfileConfig["stage"]).label },
            score: r.score
          });
          return;
        }
        case "help":
          text = ":status :model :why :amnesia :reset :stage :wake :debug :pause :resume :cringe :relationship :persona :log :sticker :snapshot :quit";
          break;
        case "quit":
        case "exit":
          await rt.stop();
          out({ type: "response", ok: true, text: "bye" });
          process.exit(0);
        default:
          out({ type: "response", ok: false, text: `未知命令: ${head}` });
          return;
      }
      out({ type: "response", ok: true, text });
    } catch (e) {
      out({ type: "response", ok: false, text: "err: " + (e as Error).message });
    }
  });

  const shutdown = async () => {
    try { await rt.stop(); } catch { /* ignore */ }
    out({ type: "stopped", t: Date.now() });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Hold the event loop.
  await new Promise<void>(() => { /* never resolves */ });
}

function profileSummary(cfg: ProfileConfig) {
  const stage = findStage(cfg.stage);
  return {
    slug: cfg.slug,
    name: cfg.name,
    age: cfg.age,
    mode: cfg.mode,
    nationality: cfg.nationality,
    tz: cfg.tz,
    stage: { id: cfg.stage, num: stage.num, label: stage.label }
  };
}
