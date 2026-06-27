import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s — girl-agent 文档",
    default: "girl-agent — 文档",
  },
  description:
    "girl-agent —— Telegram 中的 AI 女友。面向用户和开发者的文档：安装、配置、WebUI、插件、架构。",
  metadataBase: new URL("https://docs.girl-agent.com"),
  openGraph: {
    type: "website",
    url: "https://docs.girl-agent.com",
    siteName: "girl-agent docs",
    images: ["https://girl-agent.com/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://girl-agent.com/og-image.png"],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            options: {
              type: "static",
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
