/**
 * 数据迁移系统。
 *
 * 每个迁移都是一个包含 id（语义化版本）、description 和 migrate() 函数的对象。
 * migrate() 接收配置文件路径和 config，可以修改磁盘上的文件。
 *
 * 迁移按 id 升序执行。已应用的迁移会被跳过
 * （通过 DATA_ROOT 中的 .migrations.json 跟踪）。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProfileConfig } from "../types.js";
import type { LLMClient } from "../llm/index.js";
import { DATA_ROOT, listProfiles, readConfig, writeConfig, profileDir } from "../storage/md.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface MigrationInputField {
  key: string;
  label: string;
  secret?: boolean;
}

export interface MigrationContext {
  profilePath: string;
  config: ProfileConfig;
  llm?: LLMClient;
  log: (msg: string) => void;
}

export interface Migration {
  id: string;
  description: string;
  needsLLM?: boolean;
  needsInput?: MigrationInputField[];
  migrate(ctx: MigrationContext): Promise<ProfileConfig>;
}

const MIGRATIONS_FILE = () => path.join(DATA_ROOT, ".migrations.json");

interface MigrationState {
  appliedMigrations: string[];
  lastRunVersion: string;
  lastRunAt: string;
}

async function readMigrationState(): Promise<MigrationState> {
  try {
    const raw = await fs.readFile(MIGRATIONS_FILE(), "utf8");
    return JSON.parse(raw) as MigrationState;
  } catch {
    return { appliedMigrations: [], lastRunVersion: "0.0.0", lastRunAt: "" };
  }
}

async function writeMigrationState(state: MigrationState): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(MIGRATIONS_FILE(), JSON.stringify(state, null, 2), "utf8");
}

// --- 迁移注册表（按升序在此处添加新的迁移） ---
import { migration0112 } from "./0112-add-use-wss-default.js";
import { migration0113 } from "./0113-ensure-communication-md.js";
import { migration0114 } from "./0114-memory-palace.js";

export const ALL_MIGRATIONS: Migration[] = [
  migration0112,
  migration0113,
  migration0114,
];

/**
 * 返回尚未应用的迁移列表。
 */
export async function pendingMigrations(): Promise<Migration[]> {
  const state = await readMigrationState();
  return ALL_MIGRATIONS.filter(m => !state.appliedMigrations.includes(m.id));
}

export interface MigrationWarning {
  migrationId: string;
  description: string;
  missingInputs: MigrationInputField[];
}

export interface UpdateResult {
  profilesUpdated: number;
  migrationsApplied: string[];
  warnings: MigrationWarning[];
  errors: { profile: string; migration: string; error: string }[];
}

/**
 * 对所有配置文件运行所有待定迁移。
 */
export async function runMigrations(opts?: {
  verbose?: boolean;
  llmFactory?: (cfg: ProfileConfig) => LLMClient | undefined;
}): Promise<UpdateResult> {
  const pending = await pendingMigrations();
  const log = opts?.verbose ? (msg: string) => process.stderr.write(msg + "\n") : () => {};

  if (pending.length === 0) {
    log("所有迁移已应用，数据是最新的。");
    return { profilesUpdated: 0, migrationsApplied: [], warnings: [], errors: [] };
  }

  const profiles = await listProfiles();
  const state = await readMigrationState();
  const result: UpdateResult = { profilesUpdated: 0, migrationsApplied: [], warnings: [], errors: [] };

  for (const migration of pending) {
    log(`\n[migration] ${migration.id}: ${migration.description}`);
    let profilesAffected = 0;

    for (const slug of profiles) {
      const cfg = await readConfig(slug);
      if (!cfg) {
        log(`  跳过 ${slug}：无法读取 config.json`);
        continue;
      }

      if (migration.needsInput?.length) {
        const missing = migration.needsInput.filter(field => {
          const val = (cfg as unknown as Record<string, unknown>)[field.key];
          return val === undefined || val === null || val === "";
        });
        if (missing.length > 0) {
          result.warnings.push({
            migrationId: migration.id,
            description: migration.description,
            missingInputs: missing
          });
          log(`  ⚠ ${slug}：需要输入：${missing.map(f => f.label).join(", ")}`);
        }
      }

      let llm: LLMClient | undefined;
      if (migration.needsLLM && opts?.llmFactory) {
        try {
          llm = opts.llmFactory(cfg);
        } catch (e) {
          log(`  ${slug}：无法创建 LLM：${(e as Error).message}`);
        }
      }

      try {
        const updated = await migration.migrate({
          profilePath: profileDir(slug),
          config: cfg,
          llm,
          log: (msg: string) => log(`  ${slug}: ${msg}`)
        });
        await writeConfig(updated);
        profilesAffected++;
        log(`  ${slug}：成功`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log(`  ${slug}：错误 — ${errMsg}`);
        result.errors.push({ profile: slug, migration: migration.id, error: errMsg });
      }
    }

    state.appliedMigrations.push(migration.id);
    result.migrationsApplied.push(migration.id);
    result.profilesUpdated = Math.max(result.profilesUpdated, profilesAffected);
    log(`  已应用于 ${profilesAffected} 个配置文件`);
  }

  state.lastRunVersion = currentVersion();
  state.lastRunAt = new Date().toISOString();
  await writeMigrationState(state);

  return result;
}

/**
 * 检查是否有待定迁移。可在运行环境启动时调用。
 */
export async function checkForPendingMigrations(): Promise<boolean> {
  const pending = await pendingMigrations();
  return pending.length > 0;
}

export function formatUpdateWarnings(warnings: MigrationWarning[]): string {
  if (!warnings.length) return "";
  const lines = ["[updater] ⚠ 完成更新需要："];
  for (const w of warnings) {
    for (const field of w.missingInputs) {
      const secret = field.secret ? "（密钥）" : "";
      lines.push(`  • ${field.label}${secret} — 需要用于：${w.description}`);
    }
  }
  return lines.join("\n");
}

function currentVersion(): string {
  try {
    const here = fileURLToPath(import.meta.url);
    let dir = path.dirname(here);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, "package.json");
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string };
        if (pkg.name === "@thesashadev/girl-agent" && pkg.version) return pkg.version;
      } catch { /* next */ }
      dir = path.dirname(dir);
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}
