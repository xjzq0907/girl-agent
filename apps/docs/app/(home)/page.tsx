import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Code2,
  HeartHandshake,
  MessagesSquare,
  Moon,
  Puzzle,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="container mx-auto flex flex-col gap-16 px-4 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-fd-border bg-fd-secondary/40 px-4 py-1 text-xs font-medium text-fd-muted-foreground">
          docs · girl-agent
        </span>
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
          Telegram 中的&nbsp;AI&nbsp;女友，
          <br />
          表现得像真人一&nbsp;样
        </h1>
        <p className="max-w-2xl text-lg text-fd-muted-foreground">
          小写字母开头，有时已读不回，会睡觉，会生气，记得昨天说过什么。没有「当然，我理解」，没有 markdown，没有 AI 腔调。从一行命令安装到引擎架构的完整指南。
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs/users/quick-start"
            className="inline-flex items-center gap-2 rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
          >
            5&nbsp;分钟快速开始 <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/docs/developers"
            className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-secondary px-5 py-2.5 text-sm font-medium transition hover:bg-fd-secondary/80"
          >
            开发者文档 <Code2 className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <TrackCard
          href="/docs/users"
          accent="from-pink-500/15 via-pink-500/5"
          icon={<Sparkles className="h-7 w-7" />}
          title="用户文档"
          subtitle="不用看代码也能用"
          description="一行命令安装，WebUI 配置向导，LLM 选择，沟通风格 profile，作息与睡眠。覆盖从启动到不踩坑的完整流程。"
          bullets={[
            "安装：一行命令，机器上不需要 Node",
            "WebUI 在 http://localhost:3000",
            "Bot 模式和 userbot（MTProto）",
            "Profile：可爱、二次元、话痨 等",
            "关系阶段和真实性模块",
          ]}
        />
        <TrackCard
          href="/docs/developers"
          accent="from-violet-500/15 via-violet-500/5"
          icon={<Code2 className="h-7 w-7" />}
          title="开发者文档"
          subtitle="看清引擎内部全貌"
          description="引擎架构：presence、behavior-tick、memory-palace、agenda、conflict。REST API、WebSocket、.gaa 插件格式、迁移、headless 模式。"
          bullets={[
            "分层架构与 runtime.ts",
            "REST API + WebSocket 日志",
            ".gaa 插件格式与 manifest",
            "Headless JSON-events 模式",
            "迁移、presets、MCP",
          ]}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Feature icon={<Bot />} title="Realism 引擎" desc="Presence、sleep、busy schedule、daily-life —— 不是一个大模型，而是一层一层状态叠加。" />
        <Feature icon={<HeartHandshake />} title="关系阶段" desc="9 个阶段，从「给了 TG」到「在一起很久」。每个阶段有自己的计数器和行为模式。" />
        <Feature icon={<MessagesSquare />} title="Anti-AI prompt" desc="禁止 markdown、「当然」、emoji 刷屏、句末反问。地道 Telegram 风格。" />
        <Feature icon={<Moon />} title="夜间会睡觉" desc="用 `:wake` 叫醒，否则回复概率低。明确的 sleep window。" />
        <Feature icon={<Puzzle />} title=".gaa 插件" desc="Zip 包，内含 manifest.json、文件、config 补丁、主题和 install 脚本。" />
        <Feature icon={<Workflow />} title="Server / headless" desc="systemd、Docker、CI/CD —— 无需 TTY，通过环境变量和 --print-config。" />
        <Feature icon={<Terminal />} title="CLI + WebUI" desc="React/Vite WebUI 在 3000 端口，配合 `npx girl-agent` 快速命令。" />
        <Feature icon={<Sparkles />} title="15+ LLM" desc="OpenAI、Anthropic、ClaudeHub、Groq、DeepSeek、Mistral、Gemini、xAI、Ollama 等。" />
        <Feature icon={<Code2 />} title="开源" desc="TypeScript、Node 18.18+、ESM、React、Grammy、telegram（MTProto）。" />
      </section>

      <section className="rounded-2xl border border-fd-border bg-fd-secondary/30 p-8">
        <h2 className="text-2xl font-semibold">一行命令安装</h2>
        <p className="mt-2 text-fd-muted-foreground">
          机器上无需 Node、无需 sudo、不与系统冲突。
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-fd-border bg-fd-card p-4 text-sm">
          <code>curl -fsSL https://raw.githubusercontent.com/TheSashaDev/girl-agent/master/scripts/install.sh | sh</code>
        </pre>
        <p className="mt-4 text-sm text-fd-muted-foreground">
          安装后运行 <code className="rounded bg-fd-secondary px-1 py-0.5">girl-agent</code> —— WebUI 会在{" "}
          <code className="rounded bg-fd-secondary px-1 py-0.5">http://localhost:3000</code> 打开。
        </p>
      </section>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-card p-5">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-fd-primary/10 text-fd-primary">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-fd-muted-foreground">{desc}</p>
    </div>
  );
}

function TrackCard({
  href,
  accent,
  icon,
  title,
  subtitle,
  description,
  bullets,
}: {
  href: string;
  accent: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border border-fd-border bg-gradient-to-br ${accent} to-transparent p-6 transition hover:border-fd-primary/40`}
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-fd-card text-fd-primary">
        {icon}
      </div>
      <div className="mb-1 text-xs uppercase tracking-wider text-fd-muted-foreground">{subtitle}</div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-fd-muted-foreground">{description}</p>
      <ul className="mt-4 space-y-1 text-sm">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-fd-primary">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-fd-primary group-hover:gap-2 transition-all">
        打开 <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
