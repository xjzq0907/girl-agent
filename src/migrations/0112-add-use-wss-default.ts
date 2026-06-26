/**
 * Migration 0112: 确保配置中 useWSS=true（在默认切换到 WSS 之后）。
 *
 * 在 0.1.10 之前的版本中，telegram.useWSS 字段可能不存在或为 false。
 * 现在 WSS 默认启用。此迁移在现有配置中显式设置 useWSS=true，
 * 以便旧配置文件也能通过 WebSocket 工作。
 */

import type { Migration } from "./index.js";

export const migration0112: Migration = {
  id: "0112-add-use-wss-default",
  description: "在现有配置文件中默认启用 WSS",

  async migrate(ctx): Promise<typeof ctx.config> {
    if (ctx.config.telegram.useWSS === undefined || ctx.config.telegram.useWSS === false) {
      ctx.config.telegram.useWSS = true;
    }
    return ctx.config;
  }
};
