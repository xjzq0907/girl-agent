import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * 插件 (Addon) (.gaa 格式)。
 *
 * .gaa 文件是一个包含插件文件夹内容的 zip 压缩包。
 *
 * 插件文件夹结构：
 *   manifest.json      — 元数据（必需）
 *   files/             — 要复制到 data/<slug>/ 的文件 (persona.md, speech.md 等)
 *   config.patch.json  — 配置文件的 JSON 对象，用于合并
 *   theme.css          — WebUI 的 CSS 样式（用于主题插件）
 *   install.sh         — 安装后脚本（可选）
 *   README.md          — 文档（可选）
 */

export interface AddonManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  /** girl-agent 兼容性 semver 范围 */
  compatibility?: string;
  tags?: string[];
  /** 其他插件的 ID（依赖） */
  dependencies?: string[];
  /** 插件设置 — 用户在安装时/之后填写 */
  settings?: AddonSetting[];
  /** 预览 / 图标（URL 或相对路径） */
  icon?: string;
  homepage?: string;
}

export interface AddonSetting {
  /** 设置唯一键（拉丁字母，无空格） */
  key: string;
  /** 显示名称 */
  label: string;
  /** 描述 / 提示 */
  hint?: string;
  /** 字段类型 */
  type: "string" | "number" | "boolean" | "select";
  /** 默认值 */
  default?: string | number | boolean;
  /** type=select 的选项 */
  options?: { value: string; label: string }[];
  /** 是否必填 */
  required?: boolean;
}

export interface InstalledAddon {
  manifest: AddonManifest;
  enabled: boolean;
  installedAt: string;
  source: "registry" | "file" | "local";
  /** 用户设置值 */
  settingsValues?: Record<string, string | number | boolean>;
  /** files/ 中的文件列表（用于卸载时删除） */
  installedFiles?: string[];
}

export const REGISTRY_URL = process.env.GIRL_AGENT_ADDON_REGISTRY
  ?? "https://raw.githubusercontent.com/TheSashaDev/girl-agent-addons/main/index.json";

function addonsDir(): string {
  const root = process.env.GIRL_AGENT_DATA
    ? path.resolve(process.env.GIRL_AGENT_DATA, "..")
    : path.join(os.homedir(), ".local", "share", "girl-agent");
  return path.join(root, "addons");
}

async function ensureDir(): Promise<string> {
  const dir = addonsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readJsonOrEmpty<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

// ==================== installed.json ====================

export async function listInstalled(): Promise<InstalledAddon[]> {
  const dir = await ensureDir();
  const indexPath = path.join(dir, "installed.json");
  return await readJsonOrEmpty<InstalledAddon[]>(indexPath, []);
}

async function writeInstalled(list: InstalledAddon[]): Promise<void> {
  const dir = await ensureDir();
  await fs.writeFile(path.join(dir, "installed.json"), JSON.stringify(list, null, 2), "utf8");
}

// ==================== registry ====================

export async function fetchRegistry(): Promise<AddonManifest[]> {
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = await res.json() as { addons?: AddonManifest[] };
    if (!data || !Array.isArray(data.addons)) return [];
    return data.addons;
  } catch {
    return [];
  }
}

// ==================== .gaa pack / unpack ====================

/**
 * 解压 .gaa (zip) 文件到临时目录。
 * 返回解压后的文件夹路径。
 */
export async function unpackGaa(gaaPath: string): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `gaa-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await execFileAsync("unzip", ["-o", "-q", gaaPath, "-d", tmpDir]);
  // 检查 — 如果压缩包只包含一个子文件夹，进入该文件夹
  const entries = await fs.readdir(tmpDir);
  if (entries.length === 1) {
    const sub = path.join(tmpDir, entries[0]!);
    const st = await fs.stat(sub);
    if (st.isDirectory()) {
      const innerManifest = path.join(sub, "manifest.json");
      try {
        await fs.access(innerManifest);
        return sub;
      } catch { /* manifest 在根目录 */ }
    }
  }
  return tmpDir;
}

/**
 * 将插件文件夹打包为 .gaa 文件。
 * 返回创建的 .gaa 文件路径。
 */
export async function packGaa(addonDir: string, outputPath?: string): Promise<string> {
  const manifestPath = path.join(addonDir, "manifest.json");
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as AddonManifest;
  validateManifest(manifest);

  const out = outputPath ?? path.join(process.cwd(), `${manifest.id}.gaa`);

  // 删除旧文件（如果存在）
  try { await fs.unlink(out); } catch { /* ok */ }

  const dirName = path.basename(addonDir);
  const parentDir = path.dirname(addonDir);
  await execFileAsync("zip", ["-r", "-q", out, dirName], { cwd: parentDir });

  return out;
}

// ==================== install / uninstall ====================

import { readConfig, writeConfig, writeMd } from "../storage/md.js";

/**
 * 从解压后的文件夹安装插件。
 * 应用文件、config.patch.json、主题。
 */
export async function installFromDir(
  addonDir: string,
  profileSlug?: string,
  source: "registry" | "file" | "local" = "local"
): Promise<{ addon: InstalledAddon; applied: string[] }> {
  const manifestPath = path.join(addonDir, "manifest.json");
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as AddonManifest;
  validateManifest(manifest);

  const applied: string[] = [];
  const installedFiles: string[] = [];

  // 1. 将 files/ 中的文件复制到配置文件
  const filesDir = path.join(addonDir, "files");
  try {
    const fileStat = await fs.stat(filesDir);
    if (fileStat.isDirectory() && profileSlug) {
      const fileEntries = await walkDir(filesDir);
      for (const relPath of fileEntries) {
        const content = await fs.readFile(path.join(filesDir, relPath), "utf8");
        await writeMd(profileSlug, relPath, content);
        installedFiles.push(relPath);
      }
      if (fileEntries.length) applied.push(`${fileEntries.length} 个文件已复制`);
    }
  } catch { /* 没有 files/ 目录 — 没问题 */ }

  // 2. 应用 config.patch.json
  const patchPath = path.join(addonDir, "config.patch.json");
  try {
    const patchRaw = await fs.readFile(patchPath, "utf8");
    const patch = JSON.parse(patchRaw) as Record<string, unknown>;
    if (profileSlug) {
      const cfg = await readConfig(profileSlug);
      if (cfg) {
        deepMerge(cfg as unknown as Record<string, unknown>, patch);
        await writeConfig(cfg);
        applied.push(`config (${Object.keys(patch).length} 个字段)`);
      }
    }
  } catch { /* 没有 config.patch.json — 没问题 */ }

  // 3. 应用 code.patch (git apply)
  const codePatchPath = path.join(addonDir, "code.patch");
  try {
    const patchContent = await fs.readFile(codePatchPath, "utf8");
    if (patchContent.trim()) {
      const projectRoot = path.resolve(import.meta.url.replace("file://", ""), "../../../");
      try {
        await execFileAsync("git", ["apply", "--check", codePatchPath], { cwd: projectRoot });
        await execFileAsync("git", ["apply", codePatchPath], { cwd: projectRoot });
        applied.push("code.patch 已应用");
      } catch (e) {
        applied.push(`code.patch: ${(e as Error)?.message ?? "应用错误"}`);
      }
    }
  } catch { /* 没有 code.patch — 没问题 */ }

  // 4. 保存主题 (theme.css)
  const themePath = path.join(addonDir, "theme.css");
  try {
    const css = await fs.readFile(themePath, "utf8");
    const dir = await ensureDir();
    await fs.writeFile(path.join(dir, `theme-${manifest.id}.css`), css, "utf8");
    applied.push("主题已安装");
  } catch { /* 没有 theme.css — 没问题 */ }

  // 5. 将 .gaa 副本保存到 addons/
  const dir = await ensureDir();
  const addonStorePath = path.join(dir, manifest.id);
  await fs.mkdir(addonStorePath, { recursive: true });
  // 复制 manifest
  await fs.copyFile(manifestPath, path.join(addonStorePath, "manifest.json"));
  // 复制全部内容
  const allFiles = await walkDir(addonDir);
  for (const f of allFiles) {
    if (f === "manifest.json") continue;
    const src = path.join(addonDir, f);
    const dst = path.join(addonStorePath, f);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  // 5. 写入 installed.json
  const list = await listInstalled();
  const item: InstalledAddon = {
    manifest,
    enabled: true,
    installedAt: new Date().toISOString(),
    source,
    installedFiles: installedFiles.length ? installedFiles : undefined
  };
  const existingIdx = list.findIndex(a => a.manifest.id === manifest.id);
  if (existingIdx >= 0) list[existingIdx] = item;
  else list.push(item);
  await writeInstalled(list);

  return { addon: item, applied };
}

/**
 * 安装 .gaa 文件。
 */
export async function installFromGaa(
  gaaPath: string,
  profileSlug?: string
): Promise<{ addon: InstalledAddon; applied: string[] }> {
  const dir = await unpackGaa(gaaPath);
  try {
    return await installFromDir(dir, profileSlug, "file");
  } finally {
    // 清理临时目录
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 从注册表安装插件（从注册表 URL 下载 .gaa）。
 */
export async function installFromRegistry(
  id: string,
  registryManifest: AddonManifest & { downloadUrl?: string },
  profileSlug?: string
): Promise<{ addon: InstalledAddon; applied: string[] }> {
  const url = registryManifest.downloadUrl;
  if (!url) {
    // 如果没有 downloadUrl — 这是旧版清单，按 JSON 方式安装
    const list = await listInstalled();
    const item: InstalledAddon = {
      manifest: registryManifest,
      enabled: true,
      installedAt: new Date().toISOString(),
      source: "registry"
    };
    const existingIdx = list.findIndex(a => a.manifest.id === id);
    if (existingIdx >= 0) list[existingIdx] = item;
    else list.push(item);
    await writeInstalled(list);
    return { addon: item, applied: [] };
  }

  // 下载 .gaa
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`下载插件失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpGaa = path.join(os.tmpdir(), `${id}-${Date.now()}.gaa`);
  await fs.writeFile(tmpGaa, buf);
  try {
    return await installFromGaa(tmpGaa, profileSlug);
  } finally {
    await fs.unlink(tmpGaa).catch(() => {});
  }
}

export async function uninstall(id: string): Promise<boolean> {
  const list = await listInstalled();
  const next = list.filter(a => a.manifest.id !== id);
  if (next.length === list.length) return false;

  // 删除插件存储
  const dir = addonsDir();
  const addonStore = path.join(dir, id);
  await fs.rm(addonStore, { recursive: true, force: true }).catch(() => {});

  // 删除主题（如果存在）
  const themePath = path.join(dir, `theme-${id}.css`);
  await fs.unlink(themePath).catch(() => {});

  await writeInstalled(next);
  return true;
}

export async function toggle(id: string, enabled: boolean): Promise<InstalledAddon | null> {
  const list = await listInstalled();
  const item = list.find(a => a.manifest.id === id);
  if (!item) return null;
  item.enabled = enabled;
  await writeInstalled(list);
  return item;
}

export async function updateSettings(id: string, values: Record<string, string | number | boolean>): Promise<InstalledAddon | null> {
  const list = await listInstalled();
  const item = list.find(a => a.manifest.id === id);
  if (!item) return null;
  item.settingsValues = { ...(item.settingsValues ?? {}), ...values };
  await writeInstalled(list);
  return item;
}

// ==================== validate ====================

export function validateManifest(m: unknown): asserts m is AddonManifest {
  if (!m || typeof m !== "object") throw new Error("manifest must be object");
  const x = m as Record<string, unknown>;
  if (typeof x.id !== "string" || !x.id) throw new Error("manifest.id required");
  if (typeof x.name !== "string" || !x.name) throw new Error("manifest.name required");
  if (typeof x.description !== "string") throw new Error("manifest.description required");
  if (typeof x.version !== "string") throw new Error("manifest.version required");
}

// ==================== helpers ====================

/** 递归遍历目录，返回文件的相对路径。 */
async function walkDir(dir: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      result.push(...await walkDir(path.join(dir, e.name), rel));
    } else {
      result.push(rel);
    }
  }
  return result;
}

/** 深度合并对象（source 覆盖 target）。 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      target[key] = sv;
    }
  }
}

/**
 * 获取插件的 README.md 内容（如果存在）。
 */
export async function getAddonReadme(id: string): Promise<string | null> {
  const dir = addonsDir();
  const readmePath = path.join(dir, id, "README.md");
  try {
    return await fs.readFile(readmePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * 获取插件文件列表。
 */
export async function getAddonFiles(id: string): Promise<string[]> {
  const dir = addonsDir();
  const addonDir = path.join(dir, id);
  try {
    return await walkDir(addonDir);
  } catch {
    return [];
  }
}
