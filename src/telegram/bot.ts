import { Bot } from "grammy";
import path from "node:path";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { ProfileConfig } from "../types.js";
import type { IncomingMedia, IncomingMessage, TgAdapter } from "./index.js";
import { hasSpoilers, toHtmlWithSpoilers } from "./markdown.js";
import { normalizeBotReactionEmoji } from "./reactions.js";

export function makeBotAdapter(cfg: ProfileConfig): TgAdapter {
  const token = cfg.telegram.botToken;
  if (!token) throw new Error("BOT_TOKEN missing");
  const bot = new Bot(token, botConfig(cfg));
  let selfInfo: { username?: string; displayName?: string } = {};

  return {
    async start(onMessage) {
      bot.on("message", async (ctx) => {
        const media = await detectBotMedia(bot, token, ctx.message as any);
        const text = ctx.message.text ?? ctx.message.caption ?? "";
        if (!text && !media) return;
        const msg: IncomingMessage = {
          text,
          fromId: ctx.from?.id ?? 0,
          chatId: ctx.chat.id,
          messageId: ctx.message.message_id,
          isPrivate: ctx.chat.type === "private",
          fromName: ctx.from?.first_name,
          media,
          replyTo: botReplyContext(ctx.message as any),
          forward: botForwardContext(ctx.message as any)
        };
        await onMessage(msg);
      });
      // 用户对她消息的 emoji 反应 (Issue #76 / Task #16)。
      bot.on("message_reaction", async (ctx) => {
        const upd = ctx.update.message_reaction as any;
        if (!upd) return;
        const newEmoji = (upd.new_reaction ?? []).find((r: any) => r.type === "emoji")?.emoji;
        const oldEmoji = (upd.old_reaction ?? []).find((r: any) => r.type === "emoji")?.emoji;
        const removed = !newEmoji && !!oldEmoji;
        const emoji = newEmoji ?? oldEmoji;
        if (!emoji) return;
        const msg: IncomingMessage = {
          text: "",
          fromId: upd.user?.id ?? 0,
          chatId: upd.chat.id,
          messageId: upd.message_id,
          isPrivate: upd.chat.type === "private",
          fromName: upd.user?.first_name,
          emojiReaction: {
            emoji,
            targetMessageId: upd.message_id,
            removed
          }
        };
        await onMessage(msg).catch(() => {});
      });
      // 先执行 init() — 在 token 无效或网络被阻断时会快速失败。
      // 否则上面的 bot.start().catch 会默默吞掉错误，用户只能看到
      // "Telegram bot 已启动"，但实际上收不到任何更新。
      try {
        await bot.init();
      } catch (e) {
        throw new Error(`Telegram bot init failed: ${(e as Error)?.message ?? e}. 请检查 BOT_TOKEN (BotFather)、对 api.telegram.org 的访问，以及是否有其他 bot 实例占用了 long-polling。`);
      }
      const me = bot.botInfo;
      selfInfo = {
        username: me.username ?? undefined,
        displayName: [me.first_name, me.last_name].filter(Boolean).join(" ") || undefined
      };
      // 在后台启动 long-polling。如果它崩溃（Conflict / 401 / 网络问题）—
      // 写入 stderr，让用户能真正看到原因，而不是静默重启。
      // allowed_updates: 启用 message_reaction 和所有基础订阅。
      bot.start({
        drop_pending_updates: true,
        allowed_updates: ["message", "edited_message", "callback_query", "message_reaction"]
      }).catch((e: Error) => {
        process.stderr.write(`[bot] long-polling stopped: ${e?.message ?? e}\n`);
      });
    },
    async sendText(chatId, text) {
      if (hasSpoilers(text)) {
        try {
          const msg = await bot.api.sendMessage(chatId as number, toHtmlWithSpoilers(text), { parse_mode: "HTML" });
          return msg.message_id;
        } catch { /* fall through to plain text */ }
      }
      const msg = await bot.api.sendMessage(chatId as number, text);
      return msg.message_id;
    },
    async setTyping(chatId, on) {
      if (on) {
        try { await bot.api.sendChatAction(chatId as number, "typing"); } catch { /* */ }
      }
    },
    async setReaction(chatId, messageId, emoji) {
      // Telegram Bot API 只接受有限的 emoji 列表。如果收到不在
      // 列表中的（例如 😏、🙄、🥺）— 归一化为最接近的可用 emoji，否则 setMessageReaction
      // 会静默返回 400，用户侧不会看到反应。
      const normalized = normalizeBotReactionEmoji(emoji);
      if (!normalized) {
        process.stderr.write(`[bot] reaction "${emoji}" 不被 Bot API 支持且无替代 — 跳过\n`);
        return;
      }
      try {
        await bot.api.setMessageReaction(chatId as number, messageId, [
          { type: "emoji", emoji: normalized as any }
        ]);
      } catch (e) {
        // 不静默吞掉：写入 stderr，以便查看原因
        // （"chat not found"、"REACTION_INVALID"、"PEER_REACTIONS_DISABLED" 等）。
        process.stderr.write(`[bot] setMessageReaction("${normalized}", chat=${chatId}, msg=${messageId}) failed: ${(e as Error)?.message ?? e}\n`);
      }
    },
    async editText(chatId, messageId, newText) {
      try {
        if (hasSpoilers(newText)) {
          await bot.api.editMessageText(chatId as number, messageId, toHtmlWithSpoilers(newText), { parse_mode: "HTML" });
        } else {
          await bot.api.editMessageText(chatId as number, messageId, newText);
        }
      } catch { /* msg too old, deleted, no perms etc */ }
    },
    async sendSticker(chatId, fileId) {
      await bot.api.sendSticker(chatId as number, fileId);
    },
    getSelf() {
      return selfInfo;
    },
    async stop() {
      await bot.stop();
    }
  };
}

function botReplyContext(message: any): IncomingMessage["replyTo"] {
  const reply = message.reply_to_message;
  if (!reply) return undefined;
  const text = reply.text ?? reply.caption ?? "";
  return {
    messageId: reply.message_id,
    text: text || undefined,
    fromId: reply.from?.id,
    fromName: reply.from?.first_name,
    media: detectBotMediaSync(reply)
  };
}

function botForwardContext(message: any): IncomingMessage["forward"] {
  const origin = message.forward_origin;
  if (!origin) return undefined;
  if (origin.type === "user") {
    return {
      fromId: origin.sender_user?.id,
      fromName: origin.sender_user?.first_name,
      date: typeof origin.date === "number" ? new Date(origin.date * 1000).toISOString() : undefined
    };
  }
  if (origin.type === "hidden_user") {
    return {
      fromName: origin.sender_user_name,
      date: typeof origin.date === "number" ? new Date(origin.date * 1000).toISOString() : undefined
    };
  }
  if (origin.type === "chat") {
    return {
      fromName: origin.sender_chat?.title,
      date: typeof origin.date === "number" ? new Date(origin.date * 1000).toISOString() : undefined
    };
  }
  if (origin.type === "channel") {
    return {
      messageId: origin.message_id,
      fromName: origin.chat?.title,
      date: typeof origin.date === "number" ? new Date(origin.date * 1000).toISOString() : undefined
    };
  }
  return undefined;
}

function detectBotMediaSync(message: any): IncomingMedia | undefined {
  const caption = message.caption || undefined;
  if (message.photo) return { kind: "photo", caption, fileId: message.photo.at(-1)?.file_id };
  if (message.voice) return { kind: "voice", caption, fileId: message.voice.file_id, mimeType: message.voice.mime_type };
  if (message.video_note) return { kind: "video_note", caption, fileId: message.video_note.file_id };
  if (message.video) return { kind: "video", caption, fileId: message.video.file_id, mimeType: message.video.mime_type };
  if (message.sticker) return { kind: "sticker", caption, fileId: message.sticker.file_id, emoji: message.sticker.emoji };
  if (message.document) return { kind: "document", caption, fileId: message.document.file_id, mimeType: message.document.mime_type };
  return undefined;
}

async function detectBotMedia(bot: Bot, token: string, message: any): Promise<IncomingMedia | undefined> {
  if (message.photo?.length) {
    const p = message.photo[message.photo.length - 1];
    const out: IncomingMedia = { kind: "photo", caption: message.caption, fileId: p.file_id, mimeType: "image/jpeg" };
    await hydrateBotImage(bot, token, out);
    return out;
  }
  if (message.voice) return { kind: "voice", caption: message.caption, fileId: message.voice.file_id, mimeType: message.voice.mime_type };
  if (message.video_note) return { kind: "video_note", fileId: message.video_note.file_id };
  if (message.video) return { kind: "video", caption: message.caption, fileId: message.video.file_id, mimeType: message.video.mime_type };
  if (message.sticker) {
    const out: IncomingMedia = { kind: "sticker", fileId: message.sticker.file_id, emoji: message.sticker.emoji, mimeType: message.sticker.mime_type };
    if (!message.sticker.is_animated && !message.sticker.is_video) await hydrateBotImage(bot, token, out);
    return out;
  }
  if (message.document) return { kind: "document", caption: message.caption, fileId: message.document.file_id, mimeType: message.document.mime_type };
  return undefined;
}

async function hydrateBotImage(bot: Bot, token: string, media: IncomingMedia): Promise<void> {
  if (!media.fileId) return;
  try {
    const file = await bot.api.getFile(media.fileId);
    if (!file.file_path) return;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    media.base64 = buf.toString("base64");
    media.mimeType = media.mimeType ?? mimeTypeForTelegramPath(file.file_path);
  } catch { /* ignore media download failures */ }
}

function mimeTypeForTelegramPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function botConfig(cfg: ProfileConfig): ConstructorParameters<typeof Bot>[1] {
  const client: NonNullable<ConstructorParameters<typeof Bot>[1]>["client"] = {};
  const apiRoot = normalizeBotApiRoot(cfg.telegram.botApi?.apiRoot ?? process.env.GIRL_AGENT_BOT_API_ROOT);
  if (apiRoot) client.apiRoot = apiRoot;
  const proxy = cfg.telegram.proxy;
  if (proxy) {
    if (proxy.MTProxy) {
      process.stderr.write("[bot] MTProxy 不被 Bot API 支持；请使用 socks5:// 或 botApi.apiRoot\n");
    } else {
      client.baseFetchConfig = {
        agent: new SocksProxyAgent(botSocksProxyUrl(proxy))
      } as NonNullable<typeof client.baseFetchConfig>;
    }
  }
  return Object.keys(client).length ? { client } : undefined;
}

function normalizeBotApiRoot(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return value.replace(/\/+$/, "");
}

function botSocksProxyUrl(proxy: NonNullable<ProfileConfig["telegram"]["proxy"]>): string {
  const proto = proxy.socksType === 4 ? "socks4" : "socks5";
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${proxy.password ? `:${encodeURIComponent(proxy.password)}` : ""}@`
    : "";
  return `${proto}://${auth}${proxy.ip}:${proxy.port}`;
}
