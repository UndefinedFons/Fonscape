# Fonscape 内容撰写指南

文章、小诗与音乐手记都采用“单个 Markdown + Frontmatter + 自动扫描”。新增内容时只需新建一个 `.md` 文件，不需要维护 JavaScript 索引，也不需要在 API 中再次登记评论或浏览量目标。

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
---

这里直接撰写 Markdown 正文。
```

文件名会自动成为 `slug`；需要自定义地址时可在 Frontmatter 中填写 `slug`。必填字段为 `title`、`category`、`date`。

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
sourceUrl: https://example.com
sourceLabel: 前往收听
---

这里直接撰写 Markdown 正文。
```

`section` 可使用 `songs`、`artists` 或 `albums`，分别对应歌曲、音乐人和专辑。必填字段为 `title`、`kind`、`date`。

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

## 自动扫描

构建时会自动扫描：

- `src/content/posts/*.md`
- `src/content/poems/*.md`
- `src/content/music/*.md`

构建前会由 `scripts/generate-content-targets.mjs` 生成前端与 API 共用的内容目标清单。Frontmatter 缺少必填字段、日期无效、slug 重复或生成结果没有同步时，测试或生产构建会直接报错，避免错误内容进入线上。
