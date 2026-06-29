import type { WebAdapter } from "../telegram/web-adapter.js";

/**
 * WebChatHub — 维护 profile slug → WebAdapter 的反查注册表。
 *
 * 当 RuntimeBus 启动一个 mode === "web" 的 profile 时，会把 Runtime 的
 * `tg`（即 WebAdapter 实例）注册到本 hub。之后 `/ws/chat/:slug` 的
 * upgrade handler 就能通过 `webChatHub.get(slug)` 拿到 adapter 并 attach socket。
 *
 * 类似地，stop 时 unregister。Runtime 实例本身仍由 RuntimeBus 管理——本 hub
 * 只持有对 adapter 的弱引用（不持有 Runtime）。
 */
export class WebChatHub {
  private bySlug = new Map<string, WebAdapter>();

  register(slug: string, adapter: WebAdapter): void {
    this.bySlug.set(slug, adapter);
  }

  unregister(slug: string): void {
    this.bySlug.delete(slug);
  }

  get(slug: string): WebAdapter | undefined {
    return this.bySlug.get(slug);
  }

  list(): string[] {
    return Array.from(this.bySlug.keys());
  }
}

export const webChatHub = new WebChatHub();
