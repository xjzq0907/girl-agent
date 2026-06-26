import type { MCPPreset } from "../types.js";

export const MCP_PRESETS: MCPPreset[] = [
  {
    id: "exa",
    name: "Exa Search",
    description: "通过 Exa 进行网络搜索。她可以搜梗、歌曲、潮流。",
    ready: true,
    secrets: [{ key: "EXA_API_KEY", label: "Exa API key" }],
    spawn: (s) => ({
      command: "npx",
      args: ["-y", "exa-mcp-server"],
      env: { EXA_API_KEY: s.EXA_API_KEY ?? "" }
    })
  },
  {
    id: "spotify",
    name: "Spotify (soon)",
    description: "喜欢的歌、正在听什么。",
    ready: false
  },
  {
    id: "instagram",
    name: "Instagram (soon)",
    description: "查看快拍/帖子作为对话背景。",
    ready: false
  },
  {
    id: "weather",
    name: "Weather (soon)",
    description: "她所在城市的天气，影响心情。",
    ready: false
  },
  {
    id: "calendar",
    name: "Calendar (soon)",
    description: "日程安排、学校/大学、周末计划。",
    ready: false
  }
];

export function findMcp(id: string): MCPPreset | undefined {
  return MCP_PRESETS.find(m => m.id === id);
}
