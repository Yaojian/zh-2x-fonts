# zh-2x-fonts 设计文档

日期：2026-08-16
状态：待评审

## 背景与目标

本仓库任务（README.md）：列出所有「一个中文字符的宽度等于两个英文字符」的字体，供基于 Web 的设计工具设计 TUI 界面时选用。

本项目构建一个应用，包含两部分：

1. **命令行（CLI）**：输出所有满足中英倍宽条件的编程字体及其链接（全英文输出）。
2. **网页**：用统一的示例文本块渲染每个合格字体，让用户直观对比并挑选字体。

判定依据为字体文件的真实度量（fontkit 解析），而非浏览器渲染结果。

## 数据源

- 字体元数据：`https://www.programmingfonts.org/fonts.json`（189 个字体，键为 alias，含 `name` / `author` / `website` / `variants` 等字段）。
- 字体文件：`https://www.programmingfonts.org/fonts/resources/<alias>/<alias>.woff2`（regular 变体）。
- 约束：本机直连 GitHub 不可达；若设置 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量，Bun `fetch` 会自动生效，可经代理访问 GitHub（已验证 `127.0.0.1:6616` 可通）。以 programmingfonts.org 为主来源，GitHub raw（`raw.githubusercontent.com/braver/programmingfonts/gh-pages/…`）作为代理可用时的备用源。网络较慢，下载需重试 + 本地缓存。

## 判定规则（核心）

比较两组字符的宽度：

- `S_ENGLISH = "11223344556677889900"`（20 个半宽字符）
- `S_CHINESE  = "一二三四五,.七八九。"`（8 个全宽汉字 + 2 个半宽标点 + 1 个全宽句号）

字体「合格」当且仅当同时满足：

1. **字形覆盖**：`S_CHINESE` 中每个字符在该字体的 cmap 中都有字形（`hasGlyphForCodePoint`）。
   - 该条件杜绝「字体本身没有中文字形、仅靠浏览器回退系统字体而误判合格」的情况。
2. **宽度相等**：`width(S_ENGLISH) === width(S_CHINESE)`，以字体单位精确相等判断（fontkit 读取 hmtx 的整数 advance）。

## 已验证事实（spike 结论）

- **fontkit 准确**：对有字形的字符，其 `advanceWidth` 与浏览器 canvas 渲染结果完全一致（已用 M+、D2Coding、Maple、Iosevka 交叉验证）。
- **Bun 兼容性**：Bun 的 `TextDecoder` 不支持 `x-mac-roman`，会让 fontkit 解析含该 cmap 子表的字体（如 APL2741）时抛错。需在导入 fontkit 前对全局 `TextDecoder` 打 shim：不支持编码回退到 utf-8（Unicode cmap 子表仍携带 CJK 映射，不影响判定）。
- **实测合格字体（10 个）**：
  - D2Coding、M PLUS 1 Code、GNU Unifont、UnifontEX；
  - Fairfax 家族 6 个变体：Fairfax / Fairfax Hax / Fairfax HD / Fairfax Hax HD / Fairfax Serif / Fairfax Serif Hax。
- **下载失败**：多数为瞬时超时，需重试；`monolisa` 无 woff2 文件（404，商业字体），跳过并标注为排除原因。

## 架构

### 目录结构

```
src/
  fonts.ts     常量（测试字符串、来源 URL、缓存目录）
  measure.ts   测量核心：Font 接口 + fontkit 适配 + 缓存/重试 + collect()
  cli.ts       命令行入口
  server.ts    Bun HTTP 服务（页面 + API）
fixtures/
  fairfax-hax.woff2   合格字体固定件（SIL OFL，附许可证文件）
  sinclair-ql.woff2   不合格字体固定件（CC BY-SA 3.0，附许可证文件）
test/
  measure.test.ts     单元测试（假 Font 对象）
  integration.test.ts 集成测试（真实固定件）
docs/superpowers/specs/   本设计文档
```

### 测量核心（src/measure.ts）

- `interface Font { hasGlyph(cp: number): boolean; advance(cp: number): number }`
- `openFont(buffer: Uint8Array): Font` —— fontkit 适配器（内部应用 TextDecoder shim）。
- `measureFont(f: Font): { en: number; cn: number; missing: string[]; qualifies: boolean }`
- 缓存：`.cache/fonts.json`、`.cache/<alias>.woff2`、`.cache/results.json`（`.cache` 已在 .gitignore 中）。
- `collectFonts(refresh?: boolean): FontResult[]`：下载全部字体（并发 + 重试 3 次）→ 逐个测量；失败项标注状态（`download-failed` / `parse-error`）。
- `FontResult`：`{ alias, name, author, website, en, cn, missing, qualifies, status }`。

### 命令行（src/cli.ts）— `bun run fonts:list`

全英文表格输出：

```
QUALIFYING FONTS (10)

Name          Author  Website                        Programming Fonts
D2Coding      NAVER   https://github.com/naver/...   https://www.programmingfonts.org/#d2coding
...
```

- `--json`：机器可读 JSON（含 woff2 直链）。
- Fairfax 6 个变体全部独立显示（用户决定）。
- 同时列出「已排除」字体及其排除原因（缺字形 / 宽度不符 / 下载失败）。

### 网页（src/server.ts）— `bun run dev`

- `GET /`：中文单页。
- `GET /api/fonts`：合格字体 JSON（含 name / author / website / programmingfonts 链接）。
- `GET /fonts/<alias>.woff2`：从 `.cache` 提供字体文件，首次按需下载（仅合格字体，共约 8.5MB）。
- 页面为每个合格字体渲染统一的示例文本块（见下），并提供链接（网站 / programmingfonts.org 页面）。

### 示例文本块（页面展示，用户授权自设计）

每个字体渲染同样内容，直观展示倍宽对齐效果：

```
你好，世界！Hello, World! 123
一二三四五六七八九 ABCDEFGHIJ
┌─ 状态：运行中 ▓▓▓░░ 80% ─────┐
│ 你好 World 123 !@#$%^&*()    │
└──────────────────────────────┘
```

### 错误处理

- 下载失败 / 解析失败：跳过该项并在结果中标注，CLI 与 API 均展示排除原因。
- 首次运行需下载全部字体（实测合计约 20MB：中位数 38KB，绝大多数 <100KB，CJK 大字体 0.5–2MB），耗时约 1–2 分钟；此后缓存命中，秒级完成。
- 单一字体下载失败不影响整体结果。

## 测试策略

- **单元测试（假 Font 对象，离线确定）**：合格 / 缺字形失败 / 非 2x 失败 / 半宽标点宽度差异失败 / 空字体。
- **集成测试（提交的固定件）**：
  - `fairfax-hax.woff2` → 合格；
  - `sinclair-ql.woff2` → 不合格（无 CJK 字形覆盖）。
- **许可证**：固定件为第三方字体，随附许可证文件（SIL OFL / CC BY-SA 3.0）。

## 依赖与脚本

- 运行时依赖：`fontkit`（移除验证阶段临时引入的 `harfbuzzjs`）。
- package.json scripts：
  - `dev` → `bun src/server.ts`
  - `fonts:list` → `bun src/cli.ts`
  - `test` → `bun test`

## 非目标

- 不下载非 regular 变体（italic/bold 等）。
- 不做浏览器渲染测量（回退行为不可预测，故采用字体文件度量）。
- 不支持编程字体源以外的字体集合。
- 不提供字体文件下载中转站（页面仅展示与链接）。
