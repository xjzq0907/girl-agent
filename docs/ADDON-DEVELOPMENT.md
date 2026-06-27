# girl-agent 插件开发指南

## 概述

插件（addon）是一个文件夹，里面放的是用来修改 girl-agent 行为的文件：人设文件、配置覆盖、CSS 主题、脚本等。

打包好的插件会被压缩成 `.gaa` 文件（zip 压缩包）以便分发。

## 快速开始

```bash
# 1. 创建插件模板
npx girl-agent addon init my-addon

# 2. 编辑文件（见下文）

# 3. 打包成 .gaa
npx girl-agent addon pack my-addon
# → my-addon.gaa
```

## 插件文件夹结构

```
my-addon/
  manifest.json       # 元数据（必填）
  files/              # 要复制到 data/<slug>/ 的文件
    persona.md        # 人设
    speech.md         # 说话风格
    boundaries.md     # 行为边界
    communication.md  # 沟通风格
    ...               # 任意其他文件
  config.patch.json   # 合并到 profile config.json 的字段
  code.patch          # 针对 girl-agent 源码的 git diff 补丁
  theme.css           # WebUI 的 CSS 样式
  install.sh          # 安装后脚本（可选）
  README.md           # 文档（可选）
```

除 `manifest.json` 外的所有文件都是可选的 —— 按需添加。

## manifest.json

```json
{
  "id": "my-addon",
  "name": "插件名称",
  "description": "插件作用说明",
  "version": "1.0.0",
  "author": "username",
  "compatibility": ">=0.1.15",
  "tags": ["persona", "mod"],
  "dependencies": [],
  "settings": [],
  "icon": "https://...",
  "homepage": "https://..."
}
```

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一 ID（拉丁字母、连字符） |
| `name` | `string` | 人可读的名称 |
| `description` | `string` | 说明文字 |
| `version` | `string` | 版本号（semver） |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `author` | `string` | 作者 |
| `compatibility` | `string` | 兼容的 girl-agent semver 区间 |
| `tags` | `string[]` | 用于检索的标签 |
| `dependencies` | `string[]` | 依赖的其他插件 ID |
| `settings` | `array` | 自定义设置项（见下文） |
| `icon` | `string` | 图标 URL |
| `homepage` | `string` | 文档链接 |

## files/ —— 人设文件

`files/` 下的所有文件在安装时会被复制到 `data/<slug>/`。常用于：

- **persona.md** —— 人设描述
- **speech.md** —— 说话风格、口头禅、习惯
- **boundaries.md** —— 行为边界
- **communication.md** —— 沟通风格
- 任何其他用于记忆/prompt 的 `.md` 文件

### 示例：files/persona.md

```markdown
傲娇。表面冷淡但内心温柔。
喜欢动漫、漫画、视觉小说。
冬天喝可可，夏天在公园散步。
被叫「可爱」时会烦躁。
```

### 示例：files/speech.md

```markdown
句子短促、犀利。常用「哼」「那又怎样」「别想太多」。
在粗暴之后偶尔会软化。不使用 emoji。
```

## config.patch.json —— 配置覆盖

一个 JSON 对象，会与 profile 的 `config.json` 做深度合并。相同字段会被覆盖，其他字段保留。

### 示例：作息模式

```json
{
  "sleepFrom": 6,
  "sleepTo": 14,
  "nightWakeChance": 0.6
}
```

### 示例：行为模式

```json
{
  "ignoreTendency": 10,
  "communication": {
    "initiative": "high",
    "notifications": "frequent"
  }
}
```

### 可用的 config.json 字段

所有字段见 `src/types.ts` → `ProfileConfig`。常用字段：
- `sleepFrom`、`sleepTo` —— 睡眠时段（0–23）
- `nightWakeChance` —— 夜间被唤醒的概率（0–1）
- `ignoreTendency` —— 忽略倾向（0–100）
- `communication` —— 沟通风格（`notifications`、`messageStyle`、`initiative`、`lifeSharing`）

## code.patch —— 源码补丁

`code.patch` 是标准的 `git diff` 补丁文件。安装插件时，会通过 `git apply` 应用到 girl-agent 项目根目录。可用于修复 bug 或修改内部逻辑。

### 如何创建 code.patch

1. clone 或打开 girl-agent
2. 在源码中做出需要的修改
3. 生成补丁：

```bash
git diff > code.patch
```

或者针对单个文件：

```bash
git diff src/engine/runtime.ts > code.patch
```

### 示例：修复 runtime.ts 中的 bug

假设需要修改最小回复延迟。先改源码，再 `git diff`：

```diff
diff --git a/src/engine/runtime.ts b/src/engine/runtime.ts
index abc1234..def5678 100644
--- a/src/engine/runtime.ts
+++ b/src/engine/runtime.ts
@@ -150,7 +150,7 @@ export class Runtime {
   private async scheduleReply(delay: number) {
-    const minDelay = 2000;
+    const minDelay = 500;
     const actual = Math.max(delay, minDelay);
```

插件结构：

```
fix-fast-reply/
  manifest.json
  code.patch
  README.md
```

**manifest.json：**
```json
{
  "id": "fix-fast-reply",
  "name": "快速回复",
  "description": "将最小回复延迟从 2 秒缩短到 0.5 秒",
  "version": "1.0.0",
  "tags": ["fix", "speed"],
  "compatibility": ">=0.1.15"
}
```

**注意：**
- 补丁通过 `git apply` 应用 —— 项目必须是 git 仓库
- 应用前会先用 `git apply --check` 检查 —— 不匹配则不会应用
- 补丁与具体代码版本绑定 —— 用 `compatibility` 字段声明适配的版本区间

## theme.css —— WebUI 主题

CSS 文件，包含 CSS 变量覆盖和/或额外的样式。

### 示例：theme.css

```css
:root {
  --ga-accent: #ff2bd6;
  --ga-accent-2: #00f0ff;
  --ga-bg: #0a0014;
  --ga-bg-glass: rgba(20, 0, 40, 0.55);
  --ga-text: #ffe2ff;
  --ga-border: rgba(255, 43, 214, 0.35);
}

.sidebar {
  border-right: 2px solid #ff2bd6;
}
```

### 可用的 CSS 变量

- `--ga-accent` —— 主强调色
- `--ga-accent-2` —— 次强调色
- `--ga-bg` —— 应用背景
- `--ga-bg-glass` —— 卡片背景（带透明度）
- `--ga-text` —— 主要文字色
- `--ga-text-dim` —— 弱化文字
- `--ga-border` —— 边框色
- `--ga-border-strong` —— 强调边框

## 设置项（settings）

插件可以通过 manifest.json 中的 `settings` 字段定义自定义设置项。用户可在 WebUI →「已安装」→「设置」中查看和编辑。

### 结构

```json
{
  "settings": [
    {
      "key": "sleepFrom",
      "label": "入睡时间",
      "hint": "小时（0–23）",
      "type": "number",
      "default": 6,
      "required": true
    },
    {
      "key": "mode",
      "label": "模式",
      "type": "select",
      "default": "normal",
      "options": [
        { "value": "normal", "label": "普通" },
        { "value": "turbo", "label": "极速" }
      ]
    },
    {
      "key": "enabled",
      "label": "启用该功能",
      "type": "boolean",
      "default": false
    }
  ]
}
```

### 字段类型

| 类型 | UI 元素 | 取值 |
|------|---------|------|
| `string` | 文本输入框 | `string` |
| `number` | 数字输入框 | `number` |
| `boolean` | 开关 | `true` / `false` |
| `select` | 下拉选择 | `options.value` 中的一个 |

## .gaa 格式

`.gaa` 文件就是一个标准的 **zip 压缩包**，里面是插件文件夹的内容。`.gaa` 这个扩展名代表 **G**irl **A**gent **A**ddon。

### 创建 .gaa

**CLI（推荐）：**
```bash
npx girl-agent addon pack my-addon
# → my-addon.gaa

npx girl-agent addon pack my-addon custom-name.gaa
# → custom-name.gaa
```

**手动打包（Linux/macOS）：**
```bash
cd my-addon
zip -r ../my-addon.gaa .
```

**手动打包（PowerShell/Windows）：**
```powershell
Compress-Archive -Path my-addon\* -DestinationPath my-addon.gaa
```

### 解压 .gaa

```bash
unzip my-addon.gaa -d my-addon/
```

## 安装插件

### 通过 WebUI

1. 切到「Addons」标签 → 「应用市场」
2. 从注册表：找到后点击「安装」
3. 通过 URL：粘贴 `.gaa` 链接或 `manifest.json` 链接 →「从 URL」
4. 从文件：点击「从 .gaa 文件」→ 选择文件

### 通过 API

```bash
# 从注册表安装
curl -X POST http://localhost:3000/api/addons/my-addon/install \
  -H "Content-Type: application/json" \
  -d '{"profileSlug": "alina"}'

# 从 URL 安装
curl -X POST http://localhost:3000/api/addons/install-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/my-addon.gaa", "profileSlug": "alina"}'

# 更新设置
curl -X PUT http://localhost:3000/api/addons/my-addon/settings \
  -H "Content-Type: application/json" \
  -d '{"values": {"sleepFrom": 4, "sleepTo": 12}}'
```

## 发布到注册表

1. 生成 `.gaa` 文件
2. 把 `.gaa` 上传到托管平台（GitHub Releases、自有服务器等）
3. 在 [TheSashaDev/girl-agent-addons](https://github.com/TheSashaDev/girl-agent-addons) 提一个 PR
4. 在 `index.json` 的 `addons` 数组中添加一条包含 `downloadUrl` 的记录：

```json
{
  "addons": [
    {
      "id": "my-addon",
      "name": "我的插件",
      "description": "说明",
      "version": "1.0.0",
      "author": "username",
      "tags": ["mod"],
      "downloadUrl": "https://github.com/.../releases/download/v1.0.0/my-addon.gaa"
    }
  ]
}
```

## 存储位置

- 已安装插件：`~/.local/share/girl-agent/addons/<id>/`
- 索引：`~/.local/share/girl-agent/addons/installed.json`
- 或 `$GIRL_AGENT_DATA/../addons/`

## 完整示例：人设插件

```
persona-tsundere/
  manifest.json
  files/
    persona.md
    speech.md
    boundaries.md
  config.patch.json
  README.md
```

**manifest.json：**
```json
{
  "id": "persona-tsundere",
  "name": "动漫傲娇",
  "description": "现成的人设：傲娇，从粗暴到温柔的剧烈切换。",
  "version": "1.0.0",
  "author": "girl-agent",
  "tags": ["persona", "anime"]
}
```

**files/persona.md：**
```markdown
傲娇，22 岁。表面冷淡但内心温柔。
喜欢动漫、漫画、视觉小说。
被叫「可爱」时会烦躁。
```

**files/speech.md：**
```markdown
句子短促、犀利。常用「哼」「那又怎样」「别想太多」。
在粗暴之后偶尔会软化。
```

**files/boundaries.md：**
```markdown
不主动调情。从不先表露心意。
被逼迫会离开一天。
```

**config.patch.json：**
```json
{
  "ignoreTendency": 55,
  "communication": {
    "messageStyle": "one-liners",
    "initiative": "low"
  }
}
```

**打包与安装：**
```bash
npx girl-agent addon pack persona-tsundere
# → persona-tsundere.gaa
# 然后在 WebUI 中：「从 .gaa 文件」→ 选择 persona-tsundere.gaa
```
