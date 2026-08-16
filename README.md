# zh-2x-fonts

本项目列出所有「一个中文字符的宽度等于两个英文字符」的字体。

它可以用于使用基于 Web 的设计工具设计 TUI 界面。

## 字体来源

https://www.programmingfonts.org/

## 比较方式

比较以下两组字符的宽度是否相等。

S_ENGLISH = "11223344556677889900"
S_CHINESE = "一二三四五,.七八九。"

字体「合格」当且仅当同时满足：

1. **字形覆盖**：`S_CHINESE` 中的每个字符在该字体中都有字形（字体本身包含中文字形，而非依赖浏览器回退）。
2. **宽度相等**：`width(S_ENGLISH) === width(S_CHINESE)`（字体单位的精确整数相等）。

## 安装

需要 [Bun](https://bun.sh) ≥ 1.3。

```bash
bun install
```

## 命令行

列出所有符合中英倍宽条件的字体及其链接：

```bash
bun run list
```

输出示例：

```
QUALIFYING FONTS (11)

NAME                AUTHOR        DISTRIBUTION  WEBSITE                        PROGRAMMING FONTS
D2Coding            Yong-Rak...   FREE          https://github.com/naver/...   https://www.programmingfonts.org/#d2coding
...
```

选项：

| 标志 | 说明 |
|------|------|
| `--json` | 输出机器可读的 JSON（含 woff2 直链与 distribution） |
| `--refresh` | 忽略缓存，重新下载并测量全部字体 |

首次运行会从 programmingfonts.org 下载全部字体（约 20MB）并缓存到 `.cache/`，此后秒级完成。

## 预下载全部字体

`list` 与网页在首次运行时都会自动下载字体。也可以先手动预下载全部字体到本地缓存：

```bash
bun run fetch
```

- 只下载、不测量，完成后 `list` / `show` 全部走本地文件，离线、秒级。
- 字体下载到缓存目录（默认 `.cache/`，`.gitignore` 已忽略），**不提交进 git**，因此不存在再分发问题。
- 失败项会列出（如 `monolisa` 为商业字体，源站不提供 woff2）。

## known-fonts 分类

`known-fonts/<alias>.json` 记录了每个字体的元数据（每字体一个文件），供 CLI 与页面标注字体的再分发状态：

```json
{
  "name": "D2Coding",
  "license": "SIL OFL",
  "distribution": "free",
  "source": "https://www.programmingfonts.org/fonts/resources/d2coding/d2coding.woff2"
}
```

- `distribution` 为 `free`（可再分发）或 `commercial`（商业授权/不可再分发，如 MonoLisa、Cartograph、freeware 字体等）。
- 重新生成（依据源站 license 元数据 + `known-fonts-overrides.json` 覆盖）：

```bash
bun run known-fonts:update
```

- 手动修正某个字体的分类时，编辑 `known-fonts-overrides.json`（如 `{ "monofur": "free" }`）后再生成，避免被覆盖。

## 网页

启动本地服务器，在浏览器中直观对比每个合格字体的视觉效果：

```bash
bun run show
```

然后打开 http://localhost:3000 。

- 默认端口 `3000`，可用 `PORT` 环境变量修改。
- 页面为每个合格字体渲染统一的示例文本块，并附「官方网站」与 Programming Fonts 链接。
- 每个字体卡片带再分发徽标：「可再分发」（绿）或「商业授权·不可再分发」（灰）。
- 首次访问会触发全部字体的下载（约 20MB），此后读取缓存。

## 环境变量

| 变量 | 说明 |
|------|------|
| `ZHF_SOURCE_URL` | 字体元数据与字体文件的主来源（默认 `https://www.programmingfonts.org`） |
| `ZHF_FALLBACK_URL` | 备用来源（默认 GitHub raw；直连 GitHub 不可达时经代理生效） |
| `ZHF_CACHE_DIR` | 缓存目录（默认 `.cache`） |
| `HTTP_PROXY` / `HTTPS_PROXY` | 需要访问 GitHub 备用源时的代理设置，Bun 会自动读取 |

示例（经本地代理访问 GitHub 备用源）：

```bash
export HTTP_PROXY=http://127.0.0.1:6616
export HTTPS_PROXY=http://127.0.0.1:6616
bun run list
```

## 当前符合条件字体（11 个）

- Cilantro Code Mono
- D2Coding
- M PLUS 1 Code
- GNU Unifont
- UnifontEX
- Fairfax / Fairfax Hax / Fairfax HD / Fairfax Hax HD / Fairfax Serif / Fairfax Serif Hax

> 注：若某字体文件下载失败（网络波动），`list` 会将其归入 `download failed` 而非合格列表；重跑或使用 `--refresh` 即可。`monolisa` 为商业字体，源站不提供 woff2，属正常排除。

## 测试

```bash
bun test
```
