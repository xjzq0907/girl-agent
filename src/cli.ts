import mri from "mri";
import { exec as childExec } from "node:child_process";
import os from "node:os";
import { startWebUIServer } from "./webui/server.js";
import { runHeadlessJsonEvents } from "./headless.js";
import { runServer } from "./server.js";
import { runMigrations, checkForPendingMigrations, formatUpdateWarnings } from "./migrations/index.js";
import { Runtime } from "./engine/runtime.js";
import { DATA_ROOT, readConfig, listProfiles, deleteProfile, writeConfig, normalizeOwnerId } from "./storage/md.js";
import { applyLLMUpdate, describeLLM } from "./config/llm-update.js";
import type { ProfileConfig } from "./types.js";
import { makeLLM } from "./llm/index.js";
import { generatePersonaPack } from "./engine/persona-gen.js";
import { findPreset } from "./presets/llm.js";
import { findStage } from "./presets/stages.js";
import { defaultTzForNationality, parseTzFlag } from "./data/timezones.js";
import { pickRandomNames } from "./data/names.js";
import { communicationProfileLabel, deriveLegacyVibe, findCommunicationPreset, normalizeCommunicationProfile } from "./presets/communication.js";

const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
if (nodeMajor < 18) {
  process.stderr.write(`[girl-agent] Node.js ${process.version} 不受支持。需要 Node.js 18.18+；Termux 中：pkg install nodejs\n`);
  process.exit(1);
}
if (nodeMajor < 20) {
  process.stderr.write(`[girl-agent] 警告：Node.js ${process.version}；建议使用 20/22，但继续启动。\n`);
}

const HELP = `
girl-agent — Telegram 的 AI 女友 (WebUI)

用法：
  npx girl-agent                       # 启动 WebUI 并打开 http://localhost:3000
  npx girl-agent --port=8080           # 自定义端口
  npx girl-agent --host=0.0.0.0        # 监听所有网络接口
  GIRL_AGENT_PUBLIC_URL=https://example.com npx girl-agent  # 反向代理/docker 的 URL
  npx girl-agent --no-browser          # 不自动打开浏览器
  npx girl-agent --profile=<slug>      # 启动 WebUI 并立即启动指定配置文件

server（适用于无 TTY 的系统：docker / systemd / cron / CI）：
  npx girl-agent server --print-config > bot.json
  npx girl-agent server --config bot.json --headless
  npx girl-agent server --print-systemd | --print-docker | --list

headless（用于 desktop-rs 包装器）：
  npx girl-agent --profile=<slug> --json-events
  npx girl-agent --profile=<slug> --headless

一键安装（机器上无需 node）：
  curl -fsSL https://raw.githubusercontent.com/TheSashaDev/girl-agent/main/scripts/install.sh | sh

快捷命令：
  --list                       显示配置文件和数据目录
  --set-model --profile=<slug> --api-preset=<id> --model=<m> [--api-key=<k>]
  --delete-profile --profile=<slug> --yes
  update [--verbose]           应用数据迁移
  addon pack <folder> [output] 将插件文件夹打包为 .gaa 文件
  addon init <folder>          创建插件模板
  --help
`;

async function main(): Promise<void> {
  const argv = mri(process.argv.slice(2), {
    string: [
      "profile", "host", "port", "config", "api-preset", "model", "api-key", "base-url", "proto",
      "name", "stage", "nationality", "tz", "vibe", "persona-notes", "communication-preset",
      "notifications", "message-style", "initiative", "life-sharing", "ignore-tendency", "owner-id", "privacy",
      "mode", "token", "api-id", "api-hash", "phone", "age"
    ],
    boolean: [
      "help", "list", "reset", "new", "json-events", "headless", "server", "set-model", "delete-profile", "yes",
      "print-config", "print-systemd", "print-docker", "no-start", "verbose", "no-browser"
    ],
    alias: { h: "help" }
  });

  const positional = (argv._ as string[]) ?? [];
  const subcommand = positional[0];

  // Server subcommand: `npx girl-agent server [...]`
  const isServer = subcommand === "server" || !!argv.server || !!argv["print-config"] || !!argv["print-systemd"] || !!argv["print-docker"];
  if (isServer) {
    await runServer(argv as Record<string, unknown>);
    return;
  }

  if (subcommand === "update") {
    await runUpdate(!!argv.verbose);
    return;
  }

  if (subcommand === "addon") {
    await runAddonCommand(positional.slice(1));
    return;
  }

  if (argv.help) { process.stdout.write(HELP); return; }

  // Quick CLI utilities（不启动 WebUI）
  if (argv.list) {
    const list = await listProfiles();
    process.stdout.write(list.length ? list.join("\n") + "\n" : "(无配置文件)\n");
    process.stdout.write(`data: ${DATA_ROOT}\n`);
    return;
  }

  if (argv["delete-profile"]) {
    const slug = typeof argv.profile === "string" ? argv.profile : undefined;
    if (!slug) { process.stderr.write("--delete-profile 需要 --profile=<slug>\n"); process.exit(1); }
    if (!argv.yes) {
      process.stderr.write(`配置文件未删除：添加 --yes 确认。\n将删除：${DATA_ROOT}/${slug}\n`);
      process.exit(1);
    }
    await deleteProfile(slug);
    process.stdout.write(`配置文件已删除：${slug}\n`);
    return;
  }

  if (argv["set-model"]) {
    const slug = typeof argv.profile === "string" ? argv.profile : undefined;
    if (!slug) { process.stderr.write("--set-model 需要 --profile=<slug>\n"); process.exit(1); }
    const cfg = await readConfig(slug);
    if (!cfg) { process.stderr.write(`profile not found: ${slug}\n`); process.exit(1); }
    const changed = applyLLMUpdate(cfg, {
      presetId: typeof argv["api-preset"] === "string" ? argv["api-preset"] : undefined,
      model: typeof argv.model === "string" ? argv.model : undefined,
      apiKey: typeof argv["api-key"] === "string" ? argv["api-key"] : undefined,
      baseURL: typeof argv["base-url"] === "string" ? argv["base-url"] : undefined,
      proto: argv.proto === "anthropic" ? "anthropic" : argv.proto === "openai" ? "openai" : undefined
    });
    await writeConfig(cfg);
    process.stdout.write((changed.length ? changed.map(x => `- ${x}`).join("\n") : "未做任何更改") + "\n\n" + describeLLM(cfg) + "\n");
    return;
  }

  // Headless / json-events：不启动 WebUI，以管道模式运行 runtime（用于 desktop-rs）
  const jsonEvents = !!(argv["json-events"] || argv.headless);
  if (jsonEvents) {
    const slug = typeof argv.profile === "string" ? argv.profile : undefined;
    if (!slug) { process.stderr.write("headless 模式需要 --profile=<slug>\n"); process.exit(1); }
    const cfg = await readConfig(slug);
    if (!cfg) { process.stderr.write(`profile not found: ${slug}\n`); process.exit(1); }
    if (await checkForPendingMigrations()) {
      const result = await runMigrations({
        verbose: true,
        llmFactory: (c) => { try { return makeLLM(c.llm); } catch { return undefined; } }
      });
      if (result.warnings.length) process.stderr.write(formatUpdateWarnings(result.warnings) + "\n");
    }
    const rt = new Runtime(cfg);
    await rt.start();
    await runHeadlessJsonEvents(rt);
    return;
  }

  // Headless flag-driven setup (skip wizard entirely if essentials present, then run WebUI)
  const presetForFlags = argv["api-preset"] ? findPreset(String(argv["api-preset"])) : undefined;
  const apiKeyRequiredForFlags = presetForFlags?.apiKeyRequired !== false;
  const haveEnoughForFlags = argv.mode && argv["api-preset"] && (!apiKeyRequiredForFlags || argv["api-key"]) && argv.age && argv.stage;
  if (haveEnoughForFlags) {
    const cfg = await buildConfigFromFlags(argv as Record<string, unknown>);
    await writeConfig(cfg);
    process.stdout.write(`配置文件：${cfg.name}，${cfg.age}，${cfg.nationality}，${cfg.tz}\n正在生成 persona.md / speech.md / communication.md...\n`);
    const llm = makeLLM(cfg.llm);
    const generated = await generatePersonaPack(llm, cfg.slug, cfg.name, cfg.age, cfg.nationality, personaNotesForGeneration(cfg));
    cfg.busySchedule = generated.busySchedule;
    await writeConfig(cfg);
  }

  // ===== WebUI entrypoint =====
  const port = Number(argv.port ?? process.env.GIRL_AGENT_PORT ?? 3000);
  const host = String(argv.host ?? process.env.GIRL_AGENT_HOST ?? "127.0.0.1");

  const instance = await startWebUIServer({
    port,
    host,
    autoStart: !argv.profile,
    noBrowser: !!argv["no-browser"]
  });

  process.stdout.write(`\n  🌐 girl-agent WebUI 已启动\n`);
  process.stdout.write(`     1) ${instance.urls.loopback}\n`);
  process.stdout.write(`     2) ${instance.urls.localhost}\n`);
  process.stdout.write(`     3) ${instance.urls.public}\n`);
  if (isTermuxRuntime()) {
    process.stdout.write(`\n  Termux：在手机浏览器中打开链接 1 或 2。\n`);
    process.stdout.write(`  如果从同一 Wi-Fi 网络的 PC 打开：girl-agent --host=0.0.0.0\n`);
  }
  process.stdout.write(`\n  REST API:        ${instance.urls.loopback}/api/system/health\n`);
  process.stdout.write(`  WebSocket logs:  ws://127.0.0.1:${port}/ws/logs/<slug>\n`);
  process.stdout.write(`  Ctrl+C 停止\n\n`);

  // 自动启动指定的配置文件
  if (typeof argv.profile === "string") {
    try {
      const cfg = await readConfig(argv.profile);
      if (cfg) {
        const { bus } = await import("./webui/runtime-bus.js");
        await bus.startWithConfig(cfg);
        process.stdout.write(`  ▶ 配置文件 ${cfg.name} (${cfg.slug}) 已启动\n`);
      }
    } catch (e) {
      process.stderr.write(`无法自动启动配置文件：${(e as Error)?.message}\n`);
    }
  }

  if (!argv["no-browser"]) {
    await tryOpenBrowser(instance.url);
  }

  // Hold process; stop on SIGINT/SIGTERM
  const shutdown = async () => {
    process.stdout.write("\n[girl-agent] 正在停止...\n");
    try { await instance.stop(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Hold the event loop indefinitely
  await new Promise<void>(() => { /* never resolves */ });
}

async function runUpdate(verbose: boolean): Promise<void> {
  const profiles = await listProfiles();
  if (!profiles.length) { process.stdout.write("无配置文件 — 无需更新。\n"); return; }
  process.stdout.write(`找到 ${profiles.length} 个配置文件\n正在运行迁移...\n`);
  const result = await runMigrations({ verbose });
  if (!result.migrationsApplied.length) {
    process.stdout.write("所有数据已是最新，无需迁移。\n");
    return;
  }
  process.stdout.write(`\n完成：${result.migrationsApplied.length} 次迁移，${result.profilesUpdated} 个配置文件\n`);
  if (result.errors.length) {
    process.stdout.write(`错误：${result.errors.length}\n`);
    for (const e of result.errors) process.stdout.write(`  ${e.profile} @ ${e.migration}: ${e.error}\n`);
  }
}

async function buildConfigFromFlags(argv: Record<string, unknown>): Promise<ProfileConfig> {
  const presetId = String(argv["api-preset"]);
  const preset = findPreset(presetId);
  const proto = preset?.proto ?? (argv.proto === "anthropic" ? "anthropic" : "openai");
  const baseURL = preset?.baseURL ?? (typeof argv["base-url"] === "string" ? (argv["base-url"] as string) : undefined);
  const model = (typeof argv.model === "string" ? (argv.model as string) : undefined) ?? preset?.defaultModel ?? "";
  const nationality = (String(argv.nationality ?? "CN").toUpperCase() === "UA") ? "UA" : (String(argv.nationality ?? "CN").toUpperCase() === "RU") ? "RU" : "CN";
  const name = argv.name ? String(argv.name) : pickRandomNames(nationality, 1)[0]!;
  const slug = String(argv.profile ?? slugifyLocal(name));
  const mode = (argv.mode === "userbot" ? "userbot" : "bot");
  const tz = (argv.tz ? parseTzFlag(String(argv.tz)) : undefined) ?? defaultTzForNationality(nationality);
  const communication = (() => {
    const preset = findCommunicationPreset(typeof argv["communication-preset"] === "string" ? argv["communication-preset"] as string : undefined);
    return preset?.profile ?? normalizeCommunicationProfile({});
  })();
  const privacy = argv.privacy === "allow-strangers" ? "allow-strangers" : "owner-only";
  return {
    slug,
    name,
    age: Number(argv.age),
    nationality: nationality as "RU" | "UA" | "CN",
    tz,
    mode,
    stage: findStage(argv.stage as string).id,
    llm: { presetId, proto, baseURL, apiKey: String(argv["api-key"] ?? preset?.defaultApiKey ?? ""), model },
    telegram: mode === "bot"
      ? { botToken: String(argv.token ?? "") }
      : {
          apiId: Number(argv["api-id"] ?? 0),
          apiHash: String(argv["api-hash"] ?? ""),
          phone: String(argv.phone ?? "")
        },
    privacy,
    ownerId: normalizeOwnerId(argv["owner-id"] ?? process.env.GIRL_AGENT_OWNER_ID),
    createdAt: new Date().toISOString(),
    sleepFrom: 23,
    sleepTo: 8,
    nightWakeChance: 0.05,
    ignoreTendency: Number(argv["ignore-tendency"] ?? 35),
    vibe: deriveLegacyVibe(communication),
    communication,
    personaNotes: argv["persona-notes"] ? String(argv["persona-notes"]) : undefined,
    busySchedule: []
  };
}

function slugifyLocal(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `profile-${Date.now().toString(36)}`;
}

async function runAddonCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === "pack") {
    const folder = args[1];
    if (!folder) {
      process.stderr.write("用法：npx girl-agent addon pack <folder> [output.gaa]\n");
      process.exit(1);
    }
    const { packGaa } = await import("./webui/addons.js");
    const output = args[2] ?? undefined;
    const result = await packGaa(folder, output);
    process.stdout.write(`已创建：${result}\n`);
    return;
  }

  if (sub === "init") {
    const folder = args[1];
    if (!folder) {
      process.stderr.write("用法：npx girl-agent addon init <folder>\n");
      process.exit(1);
    }
    const { promises: initFs } = await import("node:fs");
    const initPath = await import("node:path");
    const dir = initPath.default.resolve(folder);
    await initFs.mkdir(initPath.default.join(dir, "files"), { recursive: true });
    const name = initPath.default.basename(dir);
    const manifest = {
      id: name,
      name,
      description: "插件描述",
      version: "1.0.0",
      author: "",
      tags: [],
      settings: []
    };
    await initFs.writeFile(initPath.default.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    await initFs.writeFile(initPath.default.join(dir, "README.md"), `# ${name}\n\n插件描述。\n`, "utf8");
    await initFs.writeFile(
      initPath.default.join(dir, "config.patch.json"),
      JSON.stringify({ "_comment": "用于合并到配置文件 config.json 的字段" }, null, 2),
      "utf8"
    );
    process.stdout.write(`插件模板已创建：${dir}\n`);
    process.stdout.write(`  manifest.json  — 元数据\n`);
    process.stdout.write(`  files/         — 要复制到配置文件的文件\n`);
    process.stdout.write(`  config.patch.json — config overrides\n`);
    process.stdout.write(`  README.md      — 文档\n\n`);
    process.stdout.write(`打包：npx girl-agent addon pack ${folder}\n`);
    return;
  }

  process.stderr.write("命令：\n  addon pack <folder> [output.gaa]  — 构建 .gaa\n  addon init <folder>              — 创建模板\n");
  process.exit(1);
}

function personaNotesForGeneration(cfg: ProfileConfig): string {
  const parts = [
    cfg.personaNotes?.trim(),
    `沟通语气：${communicationProfileLabel(normalizeCommunicationProfile(cfg))}。在 speech.md 和 communication.md 中体现这一点。`
  ].filter(Boolean);
  return parts.join("\n\n");
}

async function tryOpenBrowser(url: string): Promise<void> {
  if (process.env.GIRL_AGENT_NO_BROWSER || process.env.NO_BROWSER) return;
  const platform = os.platform();
  let cmd = "";
  if (platform === "darwin") cmd = `open "${url}"`;
  else if (platform === "win32") cmd = `start "" "${url}"`;
  else if (isTermuxRuntime()) cmd = `command -v termux-open-url >/dev/null 2>&1 && termux-open-url "${url}" || true`;
  else cmd = `xdg-open "${url}" >/dev/null 2>&1 || true`;
  childExec(cmd, () => { /* 忽略 — 浏览器为可选 */ });
}

function isTermuxRuntime(): boolean {
  return process.platform === "android" ||
    !!process.env.TERMUX_VERSION ||
    (process.env.PREFIX?.includes("/data/data/com.termux/files/usr") ?? false);
}

process.on("unhandledRejection", (reason) => {
  const r = reason as { stack?: string } | string | undefined;
  const text = (typeof r === "object" && r && r.stack) ? r.stack : String(reason);
  process.stderr.write("[girl-agent] unhandled rejection: " + text + "\n");
});

process.on("uncaughtException", (err) => {
  process.stderr.write("[girl-agent] uncaught: " + (err?.stack ?? err) + "\n");
});

main().catch((e) => {
  process.stderr.write("[girl-agent] fatal: " + (e?.stack ?? e) + "\n");
  process.exit(1);
});
