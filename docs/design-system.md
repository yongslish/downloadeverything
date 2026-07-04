# Downspace 设计规范 v1.0

日期:2026-07-02
状态:v1 冻结 · 后续变更需在文末变更管理登记

**配套**
- 产品定位与需求:[`product-requirements.md`](./product-requirements.md)
- 高保真 mockup(浏览器打开):[`mockups/index.html`](./mockups/index.html)

---

## 一、文档定位

这份文档同时承担三个角色:

1. **设计规范** —— Pixel 骨架 + Newspaper 骨架的所有 token、结构、组件、状态
2. **MRD 需求描述** —— 每一页需要展示什么内容、点击每个 nav 之后跳去哪、B 站 / 小红书内容如何差异化处理
3. **修复参照** —— 前端跑偏了、颜色乱了、DownBot 变形了,回来对照本文 + `mockups/`

**阅读顺序建议**:先看 §二(概览)→ §三(Token)→ §四(骨架)→ §六(页面清单)。要开发某个页面时,再回来看 §五(DownBot)、§七(交互)、§八(内容适配)。

---

## 二、双主题体系概览

Downspace v1 有两套主题,不是"皮肤 A / 皮肤 B",而是**性质不同**的两条路径:

### Pixel 骨架(默认)

一套结构 + 一套词汇 + **3 张可换皮肤**:
- **Pixel Retro**(默认)—— GameBoy 屏绿
- **Kawaii Sticker**(手账党)—— 米色暖调 + 咖啡棕描边
- **Y2K Candy**(小红书 Z 世代)—— 粉紫 + 星光装饰

皮肤切换只换 CSS 变量,**不换 HTML 结构**。用户在设置页可以随时切换。

### Newspaper 骨架(独立)

独立一套 HTML 结构 + 独立词汇(serif + 报社流程)。**不与 Pixel 共享皮肤机制**。

用户在设置页可以在"Pixel 系列 / Newspaper"之间选择;Pixel 系列内部可以再选具体皮肤。

### 为什么这样分

Pixel 三张皮肤都是"色板 + 装饰驱动"的识别度,可以共骨架;Newspaper 的识别度来自"serif + 报纸栏排版",无法通过换色板复现,所以独立成一支。详见 [`product-requirements.md`](./product-requirements.md) §八。

**已剔除**:Frosted Glass、Neon Cyber、Light Cyber(实验证明不适合)。**未列入 v1 但可扩展**:Cassette Deck、Deep Space Capsule。

---

## 三、设计 Token

### 3.1 Pixel Retro(默认皮肤,基线)

```css
--pxl-bg:              #E0F8D0;  /* GameBoy 屏绿,主背景 */
--pxl-bg-top:          #88C070;  /* 深绿,顶栏 / 底栏底色 */
--pxl-frame:           #081820;  /* 深绿黑,所有边框主色 */
--pxl-frame-mid:       #346856;  /* 深绿,次级边框 / 二级文字 */
--pxl-accent:          #88C070;  /* 浅绿,高亮 / 按钮悬浮 */
--pxl-text-primary:    #081820;
--pxl-text-secondary:  #346856;
--pxl-text-muted:      #88C070;
--pxl-danger:          #C13030;  /* 错误 / 未采纳 */
--pxl-surface-white:   #FFFFFF;  /* 卡片内白 */
```

顶栏装饰:`▓▒░ downspace ░▒▓`

### 3.2 Kawaii Sticker(Pixel 皮肤 · 手账风)

保留 Pixel 全部结构与词汇,仅替换以下变量:

```css
--pxl-bg:              #FFF6E9;  /* 米色 */
--pxl-bg-top:          #FFEBC8;  /* 深米色 for 顶栏底栏 */
--pxl-frame:           #3A2418;  /* 咖啡棕 */
--pxl-frame-mid:       #E0C89A;  /* 浅米,虚线用 */
--pxl-accent-1:        #FF8B7C;  /* 珊瑚 · 主强调 */
--pxl-accent-2:        #FFB89A;  /* 桃 · B站 pill */
--pxl-accent-3:        #B5E4C8;  /* 薄荷 · 小红书视频 pill */
--pxl-accent-4:        #A5D6FA;  /* 天蓝 · 小红书图文 pill */
--pxl-text-primary:    #3A2418;
--pxl-text-secondary:  #7A5A38;
```

顶栏装饰:`◕◡◕ downspace ◕◡◕`

### 3.3 Y2K Candy(Pixel 皮肤 · 千禧糖果)

```css
--pxl-bg:              #FFF0F7;
--pxl-bg-top:          #FFFFFF;
--pxl-frame:           #6B4EA8;  /* 深紫 */
--pxl-frame-mid:       #F8C8E0;
--pxl-accent-1:        #FF3F8F;  /* 热粉 · 主强调 */
--pxl-accent-2:        #FFD84A;  /* 黄 */
--pxl-accent-3:        #6BD5F0;  /* 天蓝 */
--pxl-accent-4:        #B49BF4;  /* 浅紫 */
--pxl-text-primary:    #2D1B3E;
--pxl-text-secondary:  #7A6BAA;
```

顶栏装饰:`✧✦ downspace ✦✧`

### 3.4 Newspaper(独立主题)

```css
--nws-paper:           #F0E6D2;  /* 纸色 · 主背景 */
--nws-paper-dark:      #E5D9BE;  /* 边栏 / 页脚纸色 */
--nws-paper-white:     #FFFFFF;  /* 剪报白 */
--nws-ink:             #2A2418;  /* 墨色 · 主文字 / 主边框 */
--nws-ink-red:         #8B2A1E;  /* 红标 · 强调 / 时间戳 */
--nws-ink-muted:       #5A4834;  /* 次级文字 / italic */
--nws-ink-hint:        #8A7B6A;  /* 提示 / 分隔虚线 */
--nws-rule:            #C0B499;  /* 表格虚线分隔 */
```

无顶栏装饰(报头本身就是装饰)。

---

## 四、字体与字号阶梯

### 字族

| 主题 | 主字族 | 辅助字族 |
|---|---|---|
| Pixel 系列(全 3 皮肤) | `var(--font-mono)` 等宽 | 无 |
| Newspaper | `var(--font-serif)` 衬线 | `var(--font-mono)` 用于日期 / 时间戳 / 编号 / 版权 |

### 字号阶梯

Pixel 系列(全 3 皮肤共用):

| 用途 | 字号 | 字重 | letter-spacing |
|---|---|---|---|
| Big display(hero 主标题) | 22px | 500 | 1px |
| Section title | 16-17px | 500 | 0.5px |
| Body | 12-13px | 400 | 0.5px |
| Meta / label | 10-11px | 500 | 1.5-2.5px |
| Micro(顶栏 / 底栏) | 9-10px | 500 | 3px |

Newspaper:

| 用途 | 字号 | 字重 | 字族 | letter-spacing |
|---|---|---|---|---|
| Masthead 报头 | 30-32px | 500 | serif | 2px |
| Headline | 26px | 500 | serif | -0.3px |
| Byline / italic | 11px | 400 italic | serif | 0.5px |
| Body | 12-13px | 400 | serif | 0 |
| Label | 9-10px | 500 | mono | 2-3px |
| Timestamp / edition | 9-10px | 500 | mono | 1.5px |

---

## 五、骨架结构

### 5.1 Pixel 骨架 —— 5 个不可增减的槽位

```
┌── outer wrap (--pxl-bg + 4px --pxl-frame 边框)────────────┐
│                                                            │
│ ┌── [1] top-bar (--pxl-bg-top + 4px --pxl-frame 底) ────┐ │
│ │  [dot][dot][dot]  center: ▓▒░ downspace ░▒▓   [×]      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌── [2] nav (--pxl-bg + 3px --pxl-frame-mid 底) ────────┐ │
│ │  ► start  ◇ archive  ◇ tools  ◇ config    v0.1a       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌── [3] hero (padding 22px, grid 1fr 128px) ────────────┐ │
│ │  LEFT  · heading + support-line + url-input + pills    │ │
│ │  RIGHT · DownBot 100×128 sprite                        │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌── [4] cards (── save files ────) ─────────────────────┐ │
│ │  3 cards, 3px border, icon + title + meta              │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌── [5] bottom-bar (--pxl-bg-top + 4px --pxl-frame 顶)──┐ │
│ │  ▲▼ select  [A] confirm  [B] back  ▓▓▓▓░░ 68%          │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**规则**:任何变动都必须以 5 槽位为单位增减,不能改变槽位顺序。三张皮肤共用同一 DOM。

### 5.2 Newspaper 骨架

```
┌── outer wrap (纸色 + 1px 边框)─────────────────────────┐
│                                                          │
│ ┌── masthead (居中,双横线底) ─────────────────────────┐│
│ │        EST · MMXXVI                                   ││
│ │        The Downspace Herald    ← serif 32px          ││
│ │        "italic tagline"                                ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌── edition-strip ──────────────────────────────────────┐│
│ │  VOL. I · NO. 42 · WEDNESDAY EDITION · PRICE: FREE   ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌── article-header (虚线底) ────────────────────────────┐│
│ │  ━━ FEATURE STORY / IN PROGRESS ━━                   ││
│ │  大标题(serif 26px)                                  ││
│ │  By DownBot · Correspondent                           ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌── body (padding 14px,内容特定) ──────────────────────┐│
│ │  [见 §六 页面清单]                                    ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌── footer (--nws-paper-dark 底) ───────────────────────┐│
│ │  PRINTED LOCALLY · PAGE 1 OF 1                        ││
│ └───────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## 六、页面清单

以下每一页,列出:用途 / 何时进入 / 内容槽位 / 内容差异 / mockup 文件。

### 6.1 首页(`/`)

**用途**:粘贴链接、看到最近笔记
**进入方式**:打开 app / 点 Downspace logo / 点 nav `► start`

**Pixel 内容槽位**:
- [1] 顶栏:brand 装饰 + close 假按钮
- [2] Nav:`► start` 高亮
- [3] Hero:
  - Heading:"粘贴链接 ► 得到笔记"
  - Support 行:"support :: bilibili / xiaohongshu"
  - URL 输入框:`url:` 前缀 + placeholder `enter link_` + `▶ go` 按钮
  - Pills(三选一,视觉提示):
    - `B站`(--pxl-accent-3 皮肤对应色)
    - `小红书图文`(--pxl-accent-4)
    - `小红书视频`(--pxl-accent-2)
  - DownBot:**Idle** 状态
- [4] "── save files ──" + 3 张最近卡片
  - 建议 seed 数据至少 1 条 B 站 + 1 条小红书图文 + 1 条小红书视频
  - 每张卡:44px 平台色 header 块(带图标)+ 标题(单行截断)+ 来源/时长
- [5] 底栏

**Newspaper 版本**:见 [`mockups/newspaper-homepage.html`](./mockups/newspaper-homepage.html)

**Mockup 文件**:
- [`pixel-homepage.html`](./mockups/pixel-homepage.html)
- [`newspaper-homepage.html`](./mockups/newspaper-homepage.html)

---

### 6.2 处理页(`/processing/:id`)

**用途**:展示"系统正在理解什么",让等待有戏
**进入方式**:首页 `▶ go` 后 / 点未完成的历史笔记

**Pixel 内容槽位**:
- [1] 顶栏:装饰改为 `▓▒░ processing... ░▒▓`
- [2] Nav:`► loading` 高亮 · 右侧 `stage N / 6`
- [3] Header 区(取代首页 hero):
  - `▲ now loading ▲` 小标
  - 内容标题(如"深度学习入门到实践")
  - 来源 · 时长 · 作者(如"bilibili · 42:18 · 沐神")
- **BIG 像素场景**(替代 [4] 位置或与 [4] 并列):
  - 高约 150px,深绿底,像素街景 · DownBot **Working** 状态抱着键盘沿街道走
  - 尾巴留 3 个运动像素点(透明度递减)
  - 头顶泡泡框显示当前阶段文字(如"正在整理完整文本…")
- **Stage progress list**(白底 3px 边框卡):
  - `── stage progress ──` 标
  - 每个阶段:`[✓]/[►]/[ ]` + 阶段名 + 进度条 `▓▓░░░ done/42%/wait`
  - 当前阶段高亮:bg = `--pxl-bg`,上下 dashed 边
  - 已完成:muted 色
  - 未开始:extra muted
- [5] 底栏:`HP ▓▓▓▓░░░░ · stage N/6 · eta ≈ Xs`

**阶段词汇(内容类型差异)**:

**B 站视频**(6 阶段):
```
1. 抓取视频
2. 找到原生字幕     ← 有则跳到 4;无则走 3
3. 提取音频并 ASR
4. 整理完整文本
5. 生成学习笔记
6. 准备导出
```

**小红书图文**(6 阶段):
```
1. 抓取图文
2. 提取正文
3. 图片 OCR(如有)  ← 无图片则跳到 4
4. 整理完整文本
5. 生成学习笔记
6. 准备导出
```

**小红书视频**(6 阶段):
```
1. 抓取视频
2. 提取音频
3. ASR(本地 FunASR / 云端 Provider,视用户 config)
4. 整理完整文本
5. 生成学习笔记
6. 准备导出
```

**Newspaper 版本**:阶段词汇替换为编辑部术语 · DownBot 换黑白墨水线稿在打字机后校对

| Pixel 阶段词 | Newspaper 阶段词 |
|---|---|
| 抓取视频 / 图文 | 记者到岗 |
| 取标题和简介 | 素材归档 |
| 找到字幕 / OCR / ASR | 速记稿收齐 |
| 整理完整文本 | 校对整理中 |
| 生成学习笔记 | 主编审稿 |
| 准备导出 | 送印刷厂 |

底栏 `HP ▓▓░░` 替换为 `DEADLINE → ▓▓░░ · GOING TO PRESS IN Xs`

**Mockup 文件**:
- [`pixel-processing.html`](./mockups/pixel-processing.html)
- [`newspaper-processing.html`](./mockups/newspaper-processing.html)

---

### 6.3 结果页(`/note/:id`)

**用途**:展示学习笔记,时间戳可跳转到原文
**进入方式**:处理完成自动跳转 / 点历史列表任意条

**Pixel 内容槽位**:
- [1] 顶栏:装饰 `▓▒░ save file ░▒▓`
- [2] Nav:`► file.001` 高亮 · 右侧 `☆ clear!`
- Title 区:
  - `━━ file loaded ━━` 小标
  - 内容标题
  - 来源 · 时长 · 作者
  - 右侧三按钮:`.md`(主 CTA,深底)/ `obsidian` / `copy`
- Two panes(grid 1fr 1fr):
  - LEFT "── learning notes ──":
    - `◆ 一句话总结`
    - `◆ 核心观点`:每条 = 文字 + 时间戳标签(`03:24` 深绿底白字)
    - `◆ 行动建议`
  - RIGHT "── transcript.log ──":
    - 分段速记稿,每段 `MM:SS` 前缀(深绿底白字)
    - 当前定位段高亮:bg = `--pxl-bg`,左边 4px 粗边
- [5] 底栏:`▓▓▓▓▓ complete! · [A] 编辑 · [B] 返回 · [Y] 分享`

**内容类型差异**:

- **B 站视频 / 小红书视频**:时间戳完整可用,双栏"引用可跳转"
- **小红书图文**:**没有时间轴**
  - LEFT 引用格式改为 `[段 1]` 而非 `[MM:SS]`
  - RIGHT 改为 **原文段卡片**(每段一个白底卡),而非流式 transcript
  - 图片以缩略图形式嵌入段落间(点击放大)

**Newspaper 版本**:三栏头版排版:LEAD + STRUCTURE + SOURCE/EXPORT,底部速记稿双栏印刷体

**Mockup 文件**:
- [`pixel-result.html`](./mockups/pixel-result.html)
- [`newspaper-result.html`](./mockups/newspaper-result.html)

---

### 6.4 历史页(`/archive`)—— 点击 `◇ archive` 后进入

**用途**:所有历史笔记的完整列表,可搜索、筛选、批量导出

**Pixel 内容槽位**:
- [1] 顶栏:`▓▒░ archive ░▒▓`
- [2] Nav:`► archive` 高亮
- Header:
  - `━━ save files ━━` 标
  - Search input:`search:` 前缀 + placeholder `filter…`
  - Filter chips(可多选,选中变深):
    - `all` / `B 站` / `小红书图文` / `小红书视频` / `已导出` / `未导出`
- List area(垂直堆叠,每行一条):
  - 左边:平台色小方块(20×20) + 图标
  - 中间:标题 + 来源/时长 + 生成日期(YYYY-MM-DD)
  - 右边:三按钮 `open` / `.md` / `del`(hover 才显示)
  - 排序:生成日期倒序;可点表头切"按标题 / 按时长 / 按日期"
- [5] 底栏:`[◀ prev] page 1/3 [next ▶] · 12 saves total · storage ▓▓░░ 24%`

**Newspaper 版本**:骨架换成"合订本目录"—— 分月分区(每月一个 masthead),每条一行,像目录页

**Mockup 文件**:[`pixel-archive.html`](./mockups/pixel-archive.html)(v1.1 待补)

---

### 6.5 工具箱(`/tools`)—— 点击 `◇ tools` 后进入

**用途**:降级的老下载器功能,不进入学习笔记流水线,给"我只想下个字幕 / 转个字"这类小任务

**Pixel 内容槽位**:
- [1] 顶栏:`▓▒░ tools ░▒▓`
- [2] Nav:`► tools` 高亮
- 三个工具卡(垂直堆叠或 3 列,每卡独立 form):

**Tool 1 · 单独下载媒体**
- 输入:URL
- 选项:视频 / 音频 / 字幕(radio)
- 按钮:`▶ download`
- 结果:下载完成显示文件路径

**Tool 2 · 本地音视频转文字**
- 输入:文件拖拽区(mp4/mov/m4a/mp3/wav)
- 选项:ASR Provider(自动 / FunASR / 讯飞)
- 按钮:`▶ transcribe`
- 结果:显示转写文本 + `.srt / .vtt / .txt` 导出

**Tool 3 · 字幕格式转换**
- 输入:文件拖拽 / 粘贴文本
- 选项:输入格式 → 输出格式(SRT / VTT / TXT / JSON)
- 按钮:`▶ convert`

- [5] 底栏:同标准

**Newspaper 版本**:标题改成"业务副刊 · Supplement",三个工具改成"分类广告位"排版

**Mockup 文件**:[`pixel-tools.html`](./mockups/pixel-tools.html)(v1.1 待补)

---

### 6.6 设置(`/config`)—— 点击 `◇ config` 后进入

**用途**:所有全局设置

**Pixel 内容槽位**:
- [1] 顶栏:`▓▒░ config ░▒▓`
- [2] Nav:`► config` 高亮
- 分区(垂直,每分区 `── section ────` 分隔):

**§ Skin(皮肤)**
- 主骨架 radio:`● Pixel 系列` / `○ Newspaper`
- Pixel 系列下皮肤 radio:`● Pixel Retro` / `○ Kawaii Sticker` / `○ Y2K Candy`
- 每个 radio 旁边显示一小块预览色块

**§ DownBot**
- 名字改名 input(默认 `DownBot`,允许改成用户想要的名字)
- 预览:小尺寸角色 sprite

**§ ASR Provider**(BYOK 阶段用户自选)
- Radio:
  - `● 原生字幕优先 + 本地 FunASR 兜底`(默认,零成本)
  - `○ 讯飞大模型 API`(需 Key)
  - `○ 腾讯云 ASR`(需 Key)
  - `○ OpenAI Transcribe`(需 Key)
- 选中付费 Provider 后展开 Key input + "本地存储 · 不上传" 提示

**§ LLM(大模型)**
- Provider 下拉(Anthropic / OpenAI / 本地 …)
- Model 下拉(claude-opus-4-7 / claude-sonnet-4-6 / …)
- API Key input(local storage)

**§ Prompt 模板**
- 默认"学习笔记"模板:只读展示
- 自定义 textarea:可编辑并保存
- 已保存模板列表(可切换默认)
- **每份笔记必须保存所用 Prompt 版本 hash**(见 PRD §八)

**§ 导出**
- Obsidian vault 路径 input
- Notion API Key(占位 · v2 上线)

**§ 数据**
- 清空缓存(带二次确认)
- 导出全部笔记为 zip
- 关于 / 版本号 / 检查更新

- [5] 底栏:标准

**Mockup 文件**:[`pixel-config.html`](./mockups/pixel-config.html)(v1.1 待补)

---

## 七、DownBot 精灵表

**角色定位**:女性 · 活泼 · 无口头禅 · 品牌唯一吉祥物

**统一比例(Pixel 皮肤下)**:
- Sprite grid:25 列 × 32 行 · 每格 4px · 总尺寸 100×128px
- Chibi 比例:头 : 身 ≈ 1 : 1

### 7.1 五种情绪状态

| 状态 | 触发时机 | 关键差异 |
|---|---|---|
| **Idle** | 首页 · 空态 | 眼睛正视 · 手垂放两侧 |
| **Thinking** | 用户输入未提交 · 加载解析中 | 头微歪 · 一手托腮 · 头顶浮 `?` |
| **Working** | 处理页(所有阶段) | 戴耳机 · 抱键盘 · 手在敲击 |
| **Complete** | 结果页出现瞬间 · 完成庆祝 | 眼变 `^_^` · 抱笔记本 · 头顶星星 |
| **Error** | 网络错误 · 平台失效 · Provider fail | 单眼闭 · 一手挠头 · 汗滴 · `!` |

### 7.2 皮肤色板对应(sprite 内部像素)

| 部件 | Pixel 默认 | Kawaii | Y2K |
|---|---|---|---|
| 描边 | `#081820` | `#3A2418` | `#6B4EA8` |
| 头发 | `#346856` | `#FFB89A` | `#F8C8E0` |
| 面板 | `#E0F8D0` | `#FFF6E9` | `#FFF0F7` |
| 身体填充 | `#E0F8D0` | `#FFFFFF` | `#FFFFFF` |
| 心形 LED | `#346856` | `#FF8B7C` | `#FF3F8F` |
| 天线尖 · 外 | `#346856` | `#FF8B7C` | `#FF3F8F` |
| 天线尖 · 内 | `#88C070` | `#FFD57A` | `#FFD84A` |
| 裙 · 靴细节 | `#346856` / `#88C070` | `#A5D6FA` / `#FF8B7C` | `#B49BF4` / `#FF3F8F` |

### 7.3 Newspaper 里的 DownBot

**不是** pixel sprite,而是**黑白墨水线稿**:
- 头身比例同 chibi(1:1),但轮廓用手绘感的 serif-style 曲线
- 主线:`--nws-ink` #2A2418
- 阴影:细斜线 hatching(0.4px stroke,opacity 0.5)
- 装饰红:`--nws-ink-red` #8B2A1E(天线尖 LED / 心形 / 落款)
- 处理页:戴圆框眼镜,坐在打字机后 · 桌上有墨水瓶+鹅毛笔+咖啡杯
- 首页:idle 版,签名 `— d.bot —`

参见 [`mockups/newspaper-homepage.html`](./mockups/newspaper-homepage.html) 中的 SVG。

---

## 八、内容适配矩阵

产品支持 3 种内容源,每种在 pipeline 里的处理略有不同:

| 维度 | B 站视频 | 小红书图文 | 小红书视频 |
|---|---|---|---|
| **抓取方式** | yt-dlp / API | HTML 抓取 + 图片下载 | 抓取 + 音频提取 |
| **原生字幕** | 常有(优先用) | 无 | 罕见 |
| **主要 pipeline** | 字幕优先 → ASR 兜底 | 正文 + 图片 OCR | 音频 → ASR |
| **时间戳可用** | ✓ 精确 | ✗ 无 | ✓ 相对短 |
| **典型时长** | 5-120 分钟 | 图文瞬时 | 15 秒-3 分钟 |
| **结果页原文形式** | 时间轴分段 transcript | 段落 + 内嵌图缩略图 | 时间轴分段(短) |
| **首页 pill 视觉** | Pixel: `--pxl-accent-3` / Newspaper: `— BILIBILI —` | Pixel: `--pxl-accent-4` / Newspaper: `— XIAOHONGSHU IMG —` | Pixel: `--pxl-accent-2` / Newspaper: `— XIAOHONGSHU VID —` |
| **成本估算** | 字幕命中 → 0 分钟 ASR;否则按时长计 | 0 分钟 ASR(可能 OCR API 少量费) | 100% 按时长计 ASR |

**未来扩展**(不在 v1):抖音、YouTube、微信公众号、播客

---

## 九、皮肤切换机制(前端实现指引)

### DOM 层
- 顶层 `<html>` 或 `<body>` 上挂 `data-skin="pixel-retro | kawaii | y2k"`,以及 `data-theme="pixel | newspaper"`
- 皮肤 DOM 结构 100% 相同,仅 CSS 变
- Theme 切换是不同 layout / route

### CSS 层
```css
[data-skin="pixel-retro"] { --pxl-bg: #E0F8D0; ... }
[data-skin="kawaii"]      { --pxl-bg: #FFF6E9; ... }
[data-skin="y2k"]         { --pxl-bg: #FFF0F7; ... }
```

### 顶栏装饰字符
建议 JS 根据 `data-skin` 动态替换,不放在 CSS `content:` 里(便于 i18n)。

### 持久化
用户偏好保存到 `localStorage.downspace.skin` 和 `localStorage.downspace.theme`。切换 <50ms,不需 refresh。

### DownBot sprite
每皮肤一个独立 SVG 文件(或用 CSS 变量控制所有 fill),放 `assets/downbot-{skin}.svg`。

---

## 十、交互与状态

### 10.1 通用交互

| 元素 | 状态 | 表现 |
|---|---|---|
| 按钮 | hover | 亮度 +10%(不用 filter,直接用第二档色) |
| 按钮 | active | 向下位移 1px + 边框反向 |
| 输入框 | focus | 边框从 `--pxl-frame-mid` 变 `--pxl-frame` |
| 卡片 | hover | 边框 mid → frame |
| 时间戳标签 | click | 定位到右栏对应段,加高亮 500ms |
| Nav 项 | click | 立即切页 · 当前项前缀变 `►` |

### 10.2 加载状态

- 首页点 `▶ go`:按钮变 `▲ launching...` · 300ms 后跳处理页
- 处理页详细见 §6.2
- 结果页出现瞬间:DownBot 从 Working 淡出 Complete,持续 800ms

### 10.3 错误状态

**输入无效链接**:
- 输入框边框变红(Pixel = `#C13030`,Newspaper = `--nws-ink-red`)
- 下方一行红字说明("这不像是 B 站或小红书链接")
- DownBot 换 **Thinking**(不用 Error,避免过度惩罚用户)

**处理失败**:
- DownBot 换 **Error** 状态
- 阶段清单当前项文字变红,右侧显示 `FAIL`
- 弹按钮:`▶ retry` / `? feedback` / `[B] back`
- 底栏 progress 变红

**Provider 无 Key**:
- 处理开始前弹 modal:"这个视频没有字幕,需要 ASR。你未配置任何 Provider,是否使用本地 FunASR?"
- `[Y] use funasr` / `[N] go config`

### 10.4 空状态

**首页 · 首次打开(0 笔记)**:
- "── save files ──" 区域改为 DownBot Idle sprite(放大到 128×160)+ 大字 "还没有笔记 · 粘贴链接开始"

**历史页 · 0 结果**:
- Filter 命中 0 时:显示 "没有匹配的存档 · 试试其他筛选"
- 库为空时:同首页空态

**Newspaper 空态**:显示 "This edition has no stories yet · Paste a link to begin publishing" (italic serif)

### 10.5 hover 提示

时间戳标签 hover 时,显示 tooltip "点击定位到原文 · MM:SS"
Nav 项 hover 时,显示 "→ 进入 X"
DownBot hover 时,轻微上下浮动(2px 循环),表示可交互 · 点击时 DownBot 眨眼 + 发一条随机小语("我在这里!" · "需要帮忙吗?")

---

## 十一、无障碍与性能边界

- 所有文字对比度 ≥ WCAG AA 4.5:1(每个皮肤都需要 QA 验证)
- 支持 `prefers-reduced-motion:reduce` —— 关闭 DownBot 呼吸动画、Complete 星星动画、街景 loop
- 所有动画通过 CSS transition 或 Lottie,不用 GIF
- SVG sprite 内联,不请求;pixel bot < 4KB
- 主题切换即时,不 flash;首次 render 用 `<script>` 提前读取 `localStorage` 挂 `data-skin`,防 FOUC

---

## 十二、全交付快照清单

**Design 完备度 = 所有点击 / 触发之后的页面快照都有 mockup。**

在 vibe coding 时代,mockup 就是产品本身 —— 代码几乎没人看,PM 和用户只看快照。所以每一个"点击、触发、状态切换"之后能看到的页面,都应该有对应快照;这样在开发之前就能把产品最终形态钉死。

以下 25 个快照覆盖 v1 全交互路径。ID 用于跨文档引用(如 PRD 里可以写"跳转 CF-01 页面")。

| ID | 类型 · 页 · 状态 | 优先级 | 状态 | Mockup 文件 |
|---|---|---|---|---|
| **HP** | 首页 Homepage | | | |
| HP-01 | 默认 · 有 3 saves | P0 | ✅ v1.0 | [pixel-homepage.html](./mockups/pixel-homepage.html) |
| HP-02 | 空态 · 首次打开 · 0 saves | P0 | ✅ v1.1 | [pixel-homepage-empty.html](./mockups/pixel-homepage-empty.html) |
| HP-03 | URL 无效 · 红边框 + 红提示 + DownBot Thinking + 按钮禁用 | P1 | ✅ v1.2 | [pixel-homepage-invalid.html](./mockups/pixel-homepage-invalid.html) |
| **PR** | 处理页 Processing | | | |
| PR-01 | 默认 · Stage 4/6 · B 站 | P0 | ✅ v1.0 | [pixel-processing.html](./mockups/pixel-processing.html) |
| PR-02 | 失败态 · Stage 5 LLM Key 无效 · 保留已完成阶段 · 无费用 · retry / config / feedback | P1 | ✅ v1.2 | [pixel-processing-failed.html](./mockups/pixel-processing-failed.html) |
| PR-03 | 长任务 · DownBot 泡泡"我在努力,别急 ~" · 点她可再打招呼 · elapsed 计时 | P1 | ✅ v1.2 | [pixel-processing-long.html](./mockups/pixel-processing-long.html) |
| PR-04 | Stage 1(刚启动)· 平台识别中 · DownBot 抱 URL 便利贴跑 | P2 | ✅ v1.2 | [pixel-processing-early.html](./mockups/pixel-processing-early.html) |
| PR-05 | Provider missing 中断 modal | P0 | ✅ v1.1 | [pixel-processing-provider-modal.html](./mockups/pixel-processing-provider-modal.html) |
| **RS** | 结果页 Result | | | |
| RS-01 | B 站视频 · 双栏 + 时间戳 | P0 | ✅ v1.0 | [pixel-result.html](./mockups/pixel-result.html) |
| RS-02 | 小红书图文 · 无时间戳 · 段卡 + 图 | P0 | ✅ v1.1 | [pixel-result-xhs-image.html](./mockups/pixel-result-xhs-image.html) |
| RS-03 | 小红书视频 · 2:34 · 短时间戳密集(7 条 · 0:00 → 2:28)· 本地 FunASR 转录 | P1 | ✅ v1.2 | [pixel-result-xhs-video.html](./mockups/pixel-result-xhs-video.html) |
| RS-04 | 时间戳点击 · 双栏联动高亮 · 500ms | P0 | ✅ v1.1 | [pixel-result-timestamp-active.html](./mockups/pixel-result-timestamp-active.html) |
| RS-05 | 编辑模式 · 3 fields unsaved · 时间戳可微调 · transcript 只读 · save / cancel / revert | P1 | ✅ v1.2 | [pixel-result-edit.html](./mockups/pixel-result-edit.html) |
| **AR** | 归档页 Archive | | | |
| AR-01 | 默认 · 完整列表 · 12 saves · 搜索 / 筛选 / 排序 / 分页 · hover 展示行 actions | P0 | ✅ v1.2 | [pixel-archive.html](./mockups/pixel-archive.html) |
| AR-02 | 空态 · 0 saves · search/filter/sort 全 disabled · 大 DownBot 引导去 start | P1 | ✅ v1.2 | [pixel-archive-empty.html](./mockups/pixel-archive-empty.html) |
| AR-03 | 筛选态 · 只看小红书图文(5/12)· 黄底 clear 提示条 · 隐藏 7 条 | P1 | ✅ v1.2 | [pixel-archive-filtered.html](./mockups/pixel-archive-filtered.html) |
| **TL** | 工具箱 Tools | | | |
| TL-01 | 默认 · 3 工具卡 · 下载 / 本地 ASR / 字幕格式转换 · 每卡含完整表单 | P1 | ✅ v1.2 | [pixel-tools.html](./mockups/pixel-tools.html) |
| TL-02 | Tool 2 文件上传后 · 其他工具折叠 · 文件预览 + 处理预计(RTF · 时长 · 存储)+ remove | P1 | ✅ v1.2 | [pixel-tools-uploaded.html](./mockups/pixel-tools-uploaded.html) |
| **CF** | 设置 Config | | | |
| CF-01 | 默认 · 7 分区展开 | P0 | ✅ v1.1 | [pixel-config.html](./mockups/pixel-config.html) |
| **NP** | Newspaper 骨架 | | | |
| NP-01 | 首页 · Lead Story | P0 | ✅ v1.0 | [newspaper-homepage.html](./mockups/newspaper-homepage.html) |
| NP-02 | 处理页 · Going to Press | P0 | ✅ v1.0 | [newspaper-processing.html](./mockups/newspaper-processing.html) |
| NP-03 | 结果页 · Feature Story | P0 | ✅ v1.0 | [newspaper-result.html](./mockups/newspaper-result.html) |
| NP-04 | 空态 · Premiere Issue · "This edition has no stories yet" · d.bot 待岗 | P2 | ✅ v1.3 | [newspaper-homepage-empty.html](./mockups/newspaper-homepage-empty.html) |
| NP-05 | 归档 · Bound Volume Q3 · 按月分栏(Jul/Jun/May)· 目录页 § 编号 + p.页码 + 分类标 | P2 | ✅ v1.3 | [newspaper-archive.html](./mockups/newspaper-archive.html) |
| **IN** | 交互 · 特殊 | | | |
| IN-01 | 皮肤切换实时对照(3 皮肤同页) | P1 | ⏳ v1.2 | — |

**进度**
- v1.0 交付 6 / 25 = **24%**(基线全链路 · 每主题一条完整通路)
- v1.1 补齐 5 / 25 → 累计 **11 / 25 = 44%**(所有 P0 覆盖完毕)
- v1.2 批 1 补齐 4 / 25 → 累计 **15 / 25 = 60%**(HP-03 · PR-02 · AR-01 · TL-01)
- v1.2 批 2 补齐 7 / 25 → 累计 **22 / 25 = 88%**(PR-03/04 · RS-03/05 · AR-02/03 · TL-02)
- v1.3 补齐 2 / 25 → 累计 **24 / 25 = 96%**(NP-04 · NP-05 · Newspaper 变体全)
- **v1.4 剩余** → **25 / 25 = 100%**(仅 IN-01 皮肤对照 · 已可开工 · 不阻塞)

**优先级说明**
- **P0** — 无 mockup 则前端无法开发的关键状态(主态、内容变体、中断态、Config 主页)
- **P1** — 前端可先"参照 P0 类比实现",但 QA 需要 mockup 作为验收基准
- **P2** — 有余力再做,主要是 Newspaper 变体和小交互

**优先级不代表实现顺序**,只代表 mockup 补齐顺序。开发时按功能路径推进,遇到某个状态就翻对应 mockup。

---

## 十三、变更管理

**任何改动需在此追加一行,不删旧行。**

- **2026-07-02** · v1.0 初始版本 · Pixel 骨架 + 3 皮肤 + Newspaper 独立骨架冻结 · 6 页 mockup 交付
- **2026-07-02** · v1.1 补齐 5 个 P0 快照 · HP-02(空态)· PR-05(Provider modal)· RS-02(小红书图文)· RS-04(时间戳联动)· CF-01(设置页)· 新增 §十二 全交付快照清单 · 覆盖率 27% → 44%
- **2026-07-02** · v1.2 部分补齐 4 个 P1 快照 · HP-03(URL 无效)· PR-02(处理失败态)· AR-01(归档默认)· TL-01(工具箱默认)· 覆盖率 44% → 60% · 剩余 5 张 v1.2 待续
- **2026-07-02** · Backlog 新增 · 用户参考 "NOW SHOWING · FABLE 5" 提出**arcade marquee 真像素方向**(点阵 LED 显示屏 + 半色调网点 + 发光字体),明确"记 backlog 不改现有"。适用场景:营销落地页 / 独立处理页 / 完成庆祝页。不占 v1 皮肤名额,列为 **v2 探索方向**
- **2026-07-02** · v1.2 批 2 + v1.3 一次性补齐 7 个快照 · PR-03(长任务泡泡)· PR-04(Stage 1)· RS-03(小红书视频)· RS-05(编辑模式)· AR-02(归档空态)· AR-03(归档筛选)· TL-02(文件上传后)· NP-04(Newspaper 空态)· NP-05(Newspaper Bound Volume 归档)· 覆盖率 60% → 96% · **Pixel 全链路完备 · Newspaper 变体全 · 开发可 kick-off**
