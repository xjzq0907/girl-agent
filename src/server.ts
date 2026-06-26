import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { findPreset } from "./presets/llm.js";
import { findStage } from "./presets/stages.js";
import { COMMUNICATION_PRESETS } from "./presets/communication.js";
import { defaultTzForNationality, parseTzFlag } from "./data/timezones.js";
import { pickRandomNames } from "./data/names.js";
import { DATA_ROOT, slugify, writeConfig, readConfig, listProfiles, normalizeOwnerId, deleteProfile } from "./storage/md.js";
import { Runtime } from "./engine/runtime.js";
import { makeLLM } from "./llm/index.js";
import { generatePersonaPack } from "./engine/persona-gen.js";
import { runHeadlessJsonEvents } from "./headless.js";
import { checkForPendingMigrations, runMigrations, formatUpdateWarnings } from "./migrations/index.js";
import type { ProfileConfig, ClientMode, Nationality, StageId, LLMProto, PrivacyMode } from "./types.js";
import { applyLLMUpdate, describeLLM } from "./config/llm-update.js";
import { parseTelegramProxyInput } from "./telegram/proxy-parse.js";

/**
 * Server / automation entrypoint.
 *
 * The interactive setup happens in the WebUI (default `npx girl-agent`).
 * This module is for non-TTY automation only:
 *   --config <file>        load profile from json, run/save it
 *   --print-config         print json template
 *   --print-systemd        print systemd unit
 *   --print-docker         print Dockerfile / compose / docker run
 *   --list                 list existing profiles
 *   --profile=<slug>       run a specific profile
 *   --headless             NDJSON events to stdout (12-factor logs)
 *
 * Plus env-vars for fully automated provisioning (CI, k8s secrets, docker -e):
 *   GIRL_AGENT_MODE / _TOKEN / _API_PRESET / _API_KEY / ...
 */

interface ServerArgs {
  config?: string;
  printConfig?: boolean;
  printSystemd?: boolean;
  printDocker?: boolean;
  headless?: boolean;
  jsonEvents?: boolean;
  noStart?: boolean;
  profile?: string;
  setModel?: boolean;
  deleteProfile?: boolean;
  yes?: boolean;
  list?: boolean;
  help?: boolean;
}

const SERVER_HELP = `
girl-agent server — 自动化 / 运维模式（不需要 TTY）

用法:
  girl-agent server --print-config > bot.json
  # 编辑 bot.json
  girl-agent server --config bot.json --headless

  girl-agent server --list
  girl-agent server --profile=<slug> --headless
  girl-agent server --profile=<slug> --set-model --api-preset=<id> --model=<model> [--api-key=<key>]
  girl-agent server --profile=<slug> --delete-profile --yes

  girl-agent server --print-systemd > /etc/systemd/system/girl-agent.service
  girl-agent server --print-docker

环境变量（用于 CI / docker secrets / k8s）:
  GIRL_AGENT_DATA           配置文件路径 (default: ./data)
  GIRL_AGENT_MODE           bot|userbot
  GIRL_AGENT_TOKEN          telegram bot token
  GIRL_AGENT_API_PRESET     openai|anthropic|claudehub|...
  GIRL_AGENT_API_KEY        来自服务提供商的密钥
  GIRL_AGENT_MODEL, _NAME, _AGE, _NATIONALITY, _TZ, _STAGE（id 或编号 1-8）, _COMM_PRESET, _IGNORE_TENDENCY, _OWNER_ID

要进行交互式初始设置，请不要使用任何参数运行 —
WebUI 将在 http://localhost:3000 打开（在 docker 中使用 -p 3000:3000）。
`;

function parseServerArgs(argv: Record<string, unknown>): ServerArgs {
  return {
    config: typeof argv.config === "string" ? argv.config : undefined,
    printConfig: !!argv["print-config"],
    printSystemd: !!argv["print-systemd"],
    printDocker: !!argv["print-docker"],
    headless: !!argv.headless,
    jsonEvents: !!argv["json-events"],
    noStart: !!argv["no-start"] || argv.start === false,
    profile: typeof argv.profile === "string" ? argv.profile : undefined,
    setModel: !!argv["set-model"],
    deleteProfile: !!argv["delete-profile"],
    yes: !!argv.yes,
    list: !!argv.list,
    help: !!argv.help
  };
}

export async function runServer(rawArgv: Record<string, unknown>): Promise<void> {
  const args = parseServerArgs(rawArgv);

  if (args.help) {
    process.stdout.write(SERVER_HELP);
    return;
  }

  if (args.printConfig) { process.stdout.write(buildConfigTemplate()); return; }
  if (args.printSystemd) { process.stdout.write(buildSystemdUnit()); return; }
  if (args.printDocker) { process.stdout.write(buildDockerArtifacts()); return; }

  if (args.list) {
    const list = await listProfiles();
    process.stdout.write(list.length ? list.join("\n") + "\n" : "(无配置)\n");
    process.stdout.write(`data: ${DATA_ROOT}\n`);
    return;
  }

  if (args.deleteProfile) {
    if (!args.profile) {
      process.stderr.write("--delete-profile 需要 --profile=<slug>\n");
      process.exit(1);
    }
    if (!args.yes) {
      process.stderr.write(`配置未删除：添加 --yes 以确认。\n将删除: ${path.join(DATA_ROOT, args.profile)}\n`);
      process.exit(1);
    }
    await deleteProfile(args.profile);
    process.stdout.write(`配置已删除: ${args.profile}\ndata: ${DATA_ROOT}\n`);
    return;
  }

  if (args.setModel) {
    if (!args.profile) {
      process.stderr.write("--set-model 需要 --profile=<slug>\n");
      process.exit(1);
    }
    const cfg = await readConfig(args.profile);
    if (!cfg) {
      process.stderr.write(`profile not found: ${args.profile}\ndata dir: ${DATA_ROOT}\n`);
      process.exit(1);
    }
    const changed = applyLLMUpdate(cfg, {
      presetId: typeof rawArgv["api-preset"] === "string" ? rawArgv["api-preset"] : undefined,
      model: typeof rawArgv.model === "string" ? rawArgv.model : undefined,
      apiKey: typeof rawArgv["api-key"] === "string" ? rawArgv["api-key"] : undefined,
      baseURL: typeof rawArgv["base-url"] === "string" ? rawArgv["base-url"] : undefined,
      proto: rawArgv.proto === "anthropic" ? "anthropic" : rawArgv.proto === "openai" ? "openai" : undefined
    });
    await writeConfig(cfg);
    process.stdout.write((changed.length ? changed.map(x => `- ${x}`).join("\n") : "无任何更改") + "\n\n" + describeLLM(cfg) + "\n");
    return;
  }

  if (args.profile) {
    const cfg = await readConfig(args.profile);
    if (!cfg) {
      process.stderr.write(`profile not found: ${args.profile}\n`);
      process.stderr.write(`data dir: ${DATA_ROOT}\n`);
      process.exit(1);
    }
    await startRuntime(cfg, args);
    return;
  }

  if (args.config) {
    const cfg = await loadConfigFile(args.config);
    await persistAndMaybeStart(cfg, args);
    return;
  }

  const cfgFromEnv = configFromEnv();
  if (cfgFromEnv) {
    process.stderr.write("[server] 正在从环境变量配置 profile\n");
    await persistAndMaybeStart(cfgFromEnv, args);
    return;
  }

  process.stderr.write(SERVER_HELP);
  process.stderr.write("\n[server] 要进行交互式设置，请在 TTY 终端中不使用任何参数运行。\n");
  process.exit(1);
}

async function persistAndMaybeStart(cfg: ProfileConfig, args: ServerArgs): Promise<void> {
  await writeConfig(cfg);
  process.stderr.write(`[server] profile 已保存: ${path.join(DATA_ROOT, cfg.slug)}\n`);

  if (cfg.llm.apiKey || findPreset(cfg.llm.presetId)?.apiKeyRequired === false) {
    try {
      process.stderr.write("[server] 正在生成 persona/speech/communication...\n");
      const llm = makeLLM(cfg.llm);
      const generated = await generatePersonaPack(llm, cfg.slug, cfg.name, cfg.age, cfg.nationality, cfg.personaNotes ?? "");
      cfg.busySchedule = generated.busySchedule;
      await writeConfig(cfg);
      process.stderr.write("[server] 角色已准备就绪。\n");
    } catch (e) {
      process.stderr.write(`[server] 角色生成出错: ${(e as Error)?.message ?? e}\n`);
      process.stderr.write("[server] profile 已保存，但缺少 persona.md。可以稍后重新生成。\n");
    }
  } else {
    process.stderr.write("[server] 未设置 api 密钥 — 跳过角色生成。\n");
  }

  if (args.noStart) {
    process.stderr.write(`[server] --no-start: 已跳过启动。\n`);
    return;
  }

  await startRuntime(cfg, args);
}

async function startRuntime(cfg: ProfileConfig, args: ServerArgs): Promise<void> {
  if (await checkForPendingMigrations()) {
    process.stderr.write("[updater] 检测到待处理的迁移，正在启动...\n");
    const result = await runMigrations({
      verbose: true,
      llmFactory: (c) => { try { return makeLLM(c.llm); } catch { return undefined; } }
    });
    if (result.warnings.length) {
      process.stderr.write(formatUpdateWarnings(result.warnings) + "\n");
    }
  }

  const rt = new Runtime(cfg);
  await rt.start();

  const wantsHeadless = !!(args.headless || args.jsonEvents);
  if (wantsHeadless) {
    await runHeadlessJsonEvents(rt);
    return;
  }

  // 非 NDJSON 服务端运行的纯文本日志模式。
  process.stderr.write(`[server] bot 已启动: ${cfg.name} (${cfg.slug})\n`);
  rt.on("event", (e) => {
    const ts = new Date().toISOString();
    const t = (e as { type?: string }).type ?? "event";
    process.stdout.write(`${ts} ${t} ${JSON.stringify(e)}\n`);
  });

  const stop = async () => {
    process.stderr.write("[server] 正在停止...\n");
    await rt.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

// ---------------- env / file config ----------------

function configFromEnv(): ProfileConfig | null {
  const e = process.env;
  if (!e.GIRL_AGENT_MODE && !e.GIRL_AGENT_TOKEN && !e.GIRL_AGENT_API_KEY) return null;
  const mode = (e.GIRL_AGENT_MODE === "userbot" ? "userbot" : "bot") as ClientMode;
  const presetId = e.GIRL_AGENT_API_PRESET ?? "claudehub";
  const preset = findPreset(presetId);
  if (!preset) {
    process.stderr.write(`[server] unknown api preset in env: ${presetId}\n`);
    process.exit(1);
  }
  const nationality = (e.GIRL_AGENT_NATIONALITY === "UA" ? "UA" : "RU") as Nationality;
  const name = e.GIRL_AGENT_NAME || pickRandomNames(nationality, 1)[0]!;
  const age = Number(e.GIRL_AGENT_AGE ?? 18);
  const tz = e.GIRL_AGENT_TZ ? (parseTzFlag(e.GIRL_AGENT_TZ) ?? defaultTzForNationality(nationality)) : defaultTzForNationality(nationality);
  const stage = e.GIRL_AGENT_STAGE ? findStage(e.GIRL_AGENT_STAGE).id : "tg-given-cold";
  const commPreset = COMMUNICATION_PRESETS.find((c) => c.id === (e.GIRL_AGENT_COMM_PRESET ?? "normal")) ?? COMMUNICATION_PRESETS[0]!;

  return {
    slug: slugify(name),
    name, age, nationality, tz, mode, stage,
    llm: {
      presetId,
      proto: preset.proto as LLMProto,
      baseURL: preset.baseURL,
      apiKey: e.GIRL_AGENT_API_KEY ?? preset.defaultApiKey ?? "",
      model: e.GIRL_AGENT_MODEL ?? preset.defaultModel
    },
    telegram: mode === "bot"
      ? { botToken: e.GIRL_AGENT_TOKEN ?? "" }
      : {
          apiId: Number(e.GIRL_AGENT_TG_API_ID ?? 0),
          apiHash: e.GIRL_AGENT_TG_API_HASH ?? "",
          phone: e.GIRL_AGENT_TG_PHONE ?? "",
          proxy: parseTelegramProxy(e.GIRL_AGENT_TG_PROXY)
        },
    ownerId: normalizeOwnerId(e.GIRL_AGENT_OWNER_ID),
    privacy: "owner-only" as PrivacyMode,
    createdAt: new Date().toISOString(),
    sleepFrom: Number(e.GIRL_AGENT_SLEEP_FROM ?? 23),
    sleepTo: Number(e.GIRL_AGENT_SLEEP_TO ?? 8),
    nightWakeChance: Number(e.GIRL_AGENT_NIGHT_WAKE ?? 0.05),
    ignoreTendency: Number(e.GIRL_AGENT_IGNORE_TENDENCY ?? 35),
    communication: commPreset.profile,
    vibe: commPreset.profile.messageStyle === "one-liners" ? "short" : "warm",
    busySchedule: []
  };
}

async function loadConfigFile(file: string): Promise<ProfileConfig> {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf-8");
  } catch (e) {
    process.stderr.write(`[server] 无法读取 ${abs}: ${(e as Error)?.message ?? e}\n`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`[server] ${abs} 不是有效的 JSON: ${(e as Error)?.message ?? e}\n`);
    process.exit(1);
  }
  return validateConfig(parsed);
}

function validateConfig(raw: unknown): ProfileConfig {
  const c = raw as Partial<ProfileConfig> & { llm?: Partial<ProfileConfig["llm"]>; telegram?: Partial<ProfileConfig["telegram"]> };
  const errs: string[] = [];
  if (!c.name) errs.push("name");
  if (!c.age || c.age < 14 || c.age > 99) errs.push("age (14..99)");
  if (!c.nationality || (c.nationality !== "RU" && c.nationality !== "UA")) errs.push("nationality (RU|UA)");
  if (!c.tz) errs.push("tz");
  if (!c.mode || (c.mode !== "bot" && c.mode !== "userbot")) errs.push("mode (bot|userbot)");
  if (!c.stage) errs.push("stage");
  if (!c.llm?.presetId) errs.push("llm.presetId");
  if (!c.llm?.model) errs.push("llm.model");
  if (errs.length) {
    process.stderr.write(`[server] 配置无效，缺少的字段:\n  - ${errs.join("\n  - ")}\n`);
    process.stderr.write(`[server] 参考模板: girl-agent server --print-config\n`);
    process.exit(1);
  }
  const filled: ProfileConfig = {
    slug: c.slug || slugify(c.name!),
    name: c.name!,
    age: c.age!,
    nationality: c.nationality!,
    tz: c.tz!,
    mode: c.mode!,
    stage: c.stage!,
    llm: {
      presetId: c.llm!.presetId!,
      proto: (c.llm!.proto ?? findPreset(c.llm!.presetId!)?.proto ?? "openai") as LLMProto,
      baseURL: c.llm!.baseURL ?? findPreset(c.llm!.presetId!)?.baseURL,
      apiKey: c.llm!.apiKey ?? "",
      model: c.llm!.model!
    },
    telegram: c.telegram ?? {},
    ownerId: normalizeOwnerId(c.ownerId ?? process.env.GIRL_AGENT_OWNER_ID),
    privacy: c.privacy ?? "owner-only",
    createdAt: c.createdAt ?? new Date().toISOString(),
    sleepFrom: c.sleepFrom ?? 23,
    sleepTo: c.sleepTo ?? 8,
    nightWakeChance: c.nightWakeChance ?? 0.05,
    ignoreTendency: c.ignoreTendency ?? 35,
    communication: c.communication ?? COMMUNICATION_PRESETS[0]!.profile,
    vibe: c.vibe,
    personaNotes: c.personaNotes,
    busySchedule: c.busySchedule ?? []
  };
  return filled;
}

function parseTelegramProxy(raw: string | undefined): ProfileConfig["telegram"]["proxy"] | undefined {
  return parseTelegramProxyInput(raw);
}

// ---------------- ops scaffolds ----------------

function buildConfigTemplate(): string {
  const sample: ProfileConfig = {
    slug: "anya",
    name: "小安",
    age: 22,
    nationality: "RU",
    tz: "Europe/Moscow",
    mode: "bot",
    stage: "tg-given-cold",
    llm: {
      presetId: "claudehub",
      proto: "anthropic",
      baseURL: "https://api.claudehub.fun",
      apiKey: "REPLACE_ME",
      model: "claude-sonnet-4.6"
    },
    telegram: { botToken: "REPLACE_ME" },
    ownerId: undefined,
    privacy: "owner-only",
    createdAt: new Date().toISOString(),
    sleepFrom: 23,
    sleepTo: 8,
    nightWakeChance: 0.05,
    ignoreTendency: 35,
    communication: COMMUNICATION_PRESETS[0]!.profile,
    vibe: "warm",
    busySchedule: []
  };
  return JSON.stringify(sample, null, 2) + "\n";
}

function buildSystemdUnit(): string {
  const home = os.homedir();
  return `# /etc/systemd/system/girl-agent.service
# install: sudo cp this.service /etc/systemd/system/girl-agent.service
#          sudo systemctl daemon-reload
#          sudo systemctl enable --now girl-agent

[Unit]
Description=girl-agent (Telegram AI girl)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=%i
WorkingDirectory=${home}
ExecStart=${home}/.local/bin/girl-agent server --config ${home}/.config/girl-agent/bot.json --headless
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
# uncomment for env-driven setup:
# Environment=GIRL_AGENT_MODE=bot
# Environment=GIRL_AGENT_TOKEN=...
# Environment=GIRL_AGENT_API_PRESET=claudehub
# Environment=GIRL_AGENT_API_KEY=...

[Install]
WantedBy=multi-user.target
`;
}

function buildDockerArtifacts(): string {
  return `# === 单条命令 ===
docker run -it --rm \\
  -v girl-agent-data:/data \\
  -e GIRL_AGENT_DATA=/data \\
  ghcr.io/thesashadev/girl-agent:latest

# === 使用现成配置的无头模式 ===
docker run -d --name girl-agent --restart=unless-stopped \\
  -v girl-agent-data:/data \\
  -v "$PWD/bot.json:/config/bot.json:ro" \\
  -e GIRL_AGENT_DATA=/data \\
  ghcr.io/thesashadev/girl-agent:latest \\
  server --config /config/bot.json --headless

# === 仅使用环境变量（无配置文件） ===
docker run -d --name girl-agent --restart=unless-stopped \\
  -v girl-agent-data:/data \\
  -e GIRL_AGENT_DATA=/data \\
  -e GIRL_AGENT_MODE=bot \\
  -e GIRL_AGENT_TOKEN=... \\
  -e GIRL_AGENT_API_PRESET=claudehub \\
  -e GIRL_AGENT_API_KEY=... \\
  -e GIRL_AGENT_NAME='小安' \\
  -e GIRL_AGENT_AGE=22 \\
  ghcr.io/thesashadev/girl-agent:latest \\
  server --headless

# === docker-compose.yml ===
# version: "3.9"
# services:
#   girl-agent:
#     image: ghcr.io/thesashadev/girl-agent:latest
#     # 交互式 WebUI: command: [] 并设置 ports: ["3000:3000"]
#     command: ["server", "--config", "/config/bot.json", "--headless"]
#     environment:
#       GIRL_AGENT_DATA: /data
#       GIRL_AGENT_HOST: 0.0.0.0
#     volumes:
#       - girl-agent-data:/data
#       - ./bot.json:/config/bot.json:ro
#     restart: unless-stopped
# volumes:
#   girl-agent-data:
`;
}
