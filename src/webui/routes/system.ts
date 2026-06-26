import { Router, HttpError } from "../http.js";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { DATA_ROOT } from "../../storage/md.js";

let cachedVersion: string | null = null;

async function readPackageVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  // 相对于当前文件查找 package.json。dist/cli.js → ../package.json
  const candidates: string[] = [];
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(path.resolve(path.dirname(here), "..", "package.json"));
    candidates.push(path.resolve(path.dirname(here), "..", "..", "package.json"));
    candidates.push(path.resolve(path.dirname(here), "..", "..", "..", "package.json"));
  } catch { /* ignore */ }
  candidates.push(path.resolve(process.cwd(), "package.json"));
  for (const c of candidates) {
    try {
      const raw = await fs.readFile(c, "utf8");
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === "@thesashadev/girl-agent" && parsed.version) {
        cachedVersion = parsed.version;
        return parsed.version;
      }
    } catch { /* try next */ }
  }
  return "0.0.0";
}

export function registerSystemRoutes(r: Router): void {
  r.get("/api/system/version", async () => {
    const current = await readPackageVersion();
    return { current, latest: null };
  });

  r.get("/api/system/diagnostics", async () => {
    const ifaces = os.networkInterfaces();
    const ipv4: string[] = [];
    for (const k of Object.keys(ifaces)) {
      for (const i of ifaces[k] ?? []) {
        if (i.family === "IPv4" && !i.internal) ipv4.push(i.address);
      }
    }
    return {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      hostname: os.hostname(),
      uptime: process.uptime(),
      dataRoot: DATA_ROOT,
      ipv4,
      memTotalMB: Math.round(os.totalmem() / 1024 / 1024)
    };
  });

  r.get("/api/system/health", async () => ({ ok: true, t: Date.now() }));

  r.post("/api/system/update", async ({ body }) => {
    const data = body as { dryRun?: boolean } | undefined;
    if (!data || data.dryRun !== false) {
      return {
        ok: false,
        message: "通过 WebUI 更新暂不可用。请手动运行: npm i -g @thesashadev/girl-agent 或 docker pull ghcr.io/thesashadev/girl-agent:latest"
      };
    }
    throw new HttpError(501, "in-place update not implemented");
  });
}
