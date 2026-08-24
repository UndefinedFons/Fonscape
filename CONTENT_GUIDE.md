# Fonscape 内容撰写指南

文章、小诗与音乐手记都采用“单个 Markdown + Frontmatter + 自动扫描”。新增内容时只需在对应目录新建一个 `.md` 文件，不需要维护 JavaScript 索引，也不需要在 API 中再次登记评论或浏览量目标。

Frontmatter 使用简单的 `key: value` 写法。数组或对象必须写成合法 JSON，例如 `tags: ["阅读", "技术"]`。建议给包含空格、冒号或特殊符号的字符串加双引号。

## 新建文章

在 `src/content/posts/` 新建文件，例如 `my-note.md`：

```md
---
title: 我的笔记
category: 笔记
date: 2026-07-27T20:00
excerpt: 一段简短摘要。
tags: ["文学"]
featured: false
image: /assets/my-note.webp
coverMode: wide
---

这里直接撰写 Markdown 正文。
```

文件名会自动成为 `slug`；需要自定义地址时可填写 `slug`。必填字段为 `title`、`category`、`date`。

### 文章字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `category` | 是 | `随笔`、`小说`、`评谈`、`记录`、`笔记` 或 `指南` |
| `date` | 是 | 可被 JavaScript 解析的日期，建议使用 `YYYY-MM-DDTHH:mm` |
| `slug` | 否 | 自定义地址；默认取文件名，只能使用小写字母、数字、`/`、`_`、`-` |
| `excerpt` | 否 | 列表与详情页摘要；未填写时列表会尝试读取正文首段 |
| `tags` | 否 | JSON 字符串数组 |
| `series` | 否 | 系列名称 |
| `seriesOrder` | 否 | 系列内的章节顺序；相同或未填写时按日期排序 |
| `featured` | 否 | 是否置顶，默认 `false` |
| `featuredOrder` | 否 | 置顶顺序，必须是正整数；仅可在 `featured: true` 时使用 |
| `image` | 否 | 封面路径，例如 `/assets/my-note.webp` |
| `cardPosition` | 否 | 列表卡片图片焦点，例如 `50% 30%` |
| `coverMode` | 否 | 详情页封面模式：`wide`、`side` 或 `none` |
| `coverSide` | 否 | `side` 模式使用 `left` 或 `right`，默认 `left` |
| `coverPosition` | 否 | 详情页封面焦点；不影响图片自然比例 |
| `music` | 否 | 文章配乐对象，字段见下文 |
| `musicPlacement` | 否 | 默认显示在正文前；设为 `inline` 时由正文标记决定位置 |

文章封面替代文字会由标题自动生成，不要配置 `coverAlt`。未设置 `image` 时，列表会使用主题统一的无封面占位样式。

### 置顶与系列

- 只有 `featured: true` 的文章会进入置顶区域；没有置顶文章时保留空置顶卡片。
- `featuredOrder` 从小到大排序。编号允许留空，不必在删除一篇置顶文章后重新编号。
- 未填写 `featuredOrder` 的置顶文章排在有编号的文章之后，并按发布时间从早到晚排列。
- 同一 `series` 的文章会在详情页显示上一章与下一章；建议同时填写互不重复的 `seriesOrder`。

### 文章配乐

Frontmatter 中的对象必须写成一行合法 JSON：

```yaml
music: {"src":"/audio/example.mp3","cover":"/assets/example.webp","title":"曲名","artist":"音乐人"}
```

默认播放器位于文章信息与正文之间。需要放入正文时，增加 `musicPlacement: inline`，再将下列标记单独写在正文一行：

```text
[[article-music]]
```

内联播放器不会自动播放；浏览器也可能阻止详情页播放器的有声自动播放，此时读者可手动点击播放。

## 新建音乐手记

在 `src/content/music/` 新建文件，例如 `a-song.md`：

```md
---
title: 一首歌
kind: 歌曲
section: songs
date: 2026-07-27T20:00
excerpt: 关于这首歌的一段简介。
image: /assets/a-song.webp
url: https://example.com
action: 前往收听
sourceTitle: 曲名
sourceMeta: 音乐人
---

这里直接撰写 Markdown 正文。
```

`section` 可使用 `songs`、`artists` 或 `albums`，分别对应歌曲、音乐人和专辑。必填字段为 `title`、`kind`、`date`；`section` 未填写时默认为 `songs`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 手记标题 |
| `kind` | 是 | 内容类型，例如 `歌曲`、`音乐人`、`专辑` |
| `date` | 是 | 发布时间 |
| `section` | 否 | `songs`、`artists` 或 `albums` |
| `slug` | 否 | 自定义地址；默认取文件名 |
| `excerpt` | 否 | 手记摘要 |
| `image` | 否 | 封面路径 |
| `url` | 否 | 外部收听或资料地址 |
| `action` | 否 | 外部跳转按钮文字，默认“前往收听” |
| `sourceTitle` | 否 | 外部来源卡片标题，默认使用手记标题 |
| `sourceMeta` | 否 | 外部来源卡片副标题，默认使用 `kind` |

## 新建小诗

在 `src/content/poems/` 新建文件，例如 `a-poem.md`：

```md
---
title: 一首小诗
date: 2026-07-27T20:00
---

第一行
第二行

第四行
```

正文按行显示，空行也会保留。必填字段为 `title` 和 `date`。文件名默认成为 `slug`；如需自定义地址，可在 Frontmatter 中填写 `slug`。

可选字段 `note` 会显示在诗正文之后。小诗正文至少需要一行非空内容。

## Markdown 正文

文章与音乐手记正文支持 GFM Markdown，包括：

- 标题、段落、链接、引用、列表与任务列表
- 表格
- 带语言标记的 fenced code block
- 图片与图片标题

文章中的二级标题会自动编号；当二级标题达到两个时，会生成文章目录。不要手写章节编号或锚点。

图片建议放在 `public/assets/`，并在 Markdown 中使用从网站根目录开始的路径：

```md
![图片说明](/assets/example.webp "可选图片标题")
```

音频建议放在 `public/assets/audio/`，Frontmatter 中使用 `/assets/audio/example.mp3`。

## 自动扫描

构建时会自动扫描：

- `src/content/posts/*.md`
- `src/content/poems/*.md`
- `src/content/music/*.md`

安装、开发、构建、测试与检查命令会先由 `scripts/generate-content-targets.mjs` 生成前端与 API 共用的内容目标清单。Frontmatter 缺少必填字段、日期无效或 slug 重复时，命令会直接报错，避免错误内容进入线上。

新增、删除或重命名内容后只需运行：

```bash
pnpm check
```

内容目标会在安装、开发、构建、测试与检查命令前自动生成，不需要手工运行生成器或提交生成文件。推送到部署分支后，平台的 Git 集成会自动构建；不需要在数据库中再次发布文章。
