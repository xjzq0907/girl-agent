import type { Migration } from "./index.js";
import { migrateExistingMemoryToPalace } from "../engine/memory-palace.js";

export const migration0114: Migration = {
  id: "0114-memory-palace",
  description: "将现有内存文件迁移到 Memory Palace 结构",

  async migrate(ctx): Promise<typeof ctx.config> {
    const made = await migrateExistingMemoryToPalace(ctx.config);
    if (made > 0) ctx.log(`memory palace drawers: +${made}`);
    return ctx.config;
  }
};
