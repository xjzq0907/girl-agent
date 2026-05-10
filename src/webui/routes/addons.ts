import { Router, HttpError } from "../http.js";
import { fetchRegistry, listInstalled, installFromManifest, uninstall, toggle, BUILTIN_ADDONS, validateManifest, type AddonManifest } from "../addons.js";
import { readConfig, writeConfig } from "../../storage/md.js";

export function registerAddonRoutes(r: Router): void {
  r.get("/api/addons", async () => {
    const [available, installed] = await Promise.all([fetchRegistry(), listInstalled()]);
    const installedIds = new Set(installed.map(a => a.manifest.id));
    return {
      available: available.map(m => ({ ...m, installed: installedIds.has(m.id) })),
      installed,
      builtin: BUILTIN_ADDONS.map(a => a.id)
    };
  });

  r.get("/api/addons/installed", async () => {
    return { installed: await listInstalled() };
  });

  r.post("/api/addons/:id/install", async ({ params, body }) => {
    const id = params.id ?? "";
    const data = body as { manifest?: AddonManifest; profileSlug?: string } | undefined;
    let manifest = data?.manifest;
    if (!manifest) {
      const list = await fetchRegistry();
      manifest = list.find(a => a.id === id);
      if (!manifest) throw new HttpError(404, "addon not found in registry");
    }
    validateManifest(manifest);
    if (manifest.id !== id) throw new HttpError(400, "id mismatch");

    // Apply addon to profile if applicable
    if (data?.profileSlug && (manifest.type === "persona" || manifest.type === "mod" || manifest.type === "mcp")) {
      const cfg = await readConfig(data.profileSlug);
      if (!cfg) throw new HttpError(404, "profile not found");
      if (manifest.configOverrides) {
        Object.assign(cfg, manifest.configOverrides);
      }
      if (manifest.type === "mcp" && manifest.mcp?.presetId) {
        const cur = cfg.mcp ?? [];
        if (!cur.find(m => m.id === manifest.mcp?.presetId)) {
          const secrets: Record<string, string> = {};
          for (const s of manifest.mcp.secrets ?? []) secrets[s.key] = "";
          cur.push({ id: manifest.mcp.presetId, secrets });
          cfg.mcp = cur;
        }
      }
      await writeConfig(cfg);
    }

    const installed = await installFromManifest(manifest, "registry");
    return { ok: true, installed };
  });

  r.delete("/api/addons/:id", async ({ params }) => {
    const ok = await uninstall(params.id ?? "");
    if (!ok) throw new HttpError(404, "addon not installed");
    return { ok: true };
  });

  r.put("/api/addons/:id/toggle", async ({ params, body }) => {
    const data = body as { enabled?: boolean } | undefined;
    const result = await toggle(params.id ?? "", !!data?.enabled);
    if (!result) throw new HttpError(404, "addon not installed");
    return { ok: true, addon: result };
  });
}
