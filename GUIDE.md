# Fonscape 使用指南

这份指南集中说明站点配置、内容撰写、部署、升级与故障排查。第一次使用时，先完成站点配置，再选择一键部署或本地运行。

## 站点配置

公开的站点资料统一写在仓库根目录的 `fonscape.config.js`；密钥与数据库连接只保存在部署平台。修改配置后运行 `pnpm check`，可以在部署前发现语法、内容与构建错误。

### 基本资料

| 配置 | 作用 |
| --- | --- |
| `language` | HTML 页面语言，例如 `zh-CN` |
| `title`、`description` | 浏览器标题、站点名称与通用简介 |
| `postCategories` | 文章页类型标签；省略时使用 `随笔`、`评谈`、`记录`、`笔记`、`指南` |
| `home.*` | 首页头图短标题、主标题与简介 |
| `author.*` | 作者名称、头像、签名、简介、兴趣与个人渠道 |
| `about.*` | 关于页标题、摘要与正文 |
| `pages.*Description` | 文章、小诗、音乐、友链页面简介 |
| `showPoems` | 是否在主导航、首页显示小诗板块，默认 `false` |
| `showMusic` | 是否在主导航、首页显示音乐板块，默认 `false` |
| `footer.owner` | 页脚版权所有者名称 |

`footer.themeName` 与 `footer.themeRepository` 用于显示 Fonscape 主题署名，应保留默认主题名称与仓库链接。页脚年份和站点运行时间会根据当前站点数据库中的建立时间自动生成。

配置值采用 JavaScript 语法。文本、颜色和路径需要放在引号中，对象字段之间用逗号分隔，例如 `"我的博客"`、`"#ffb7c5"`、`"/assets/home.jpg"`。

### 文章分类

每篇文章的 Frontmatter 都必须填写非空的 `category`；标签 `tags` 和系列 `series` 才是可选字段。

站点级的 `postCategories` 位于 `fonscape.config.js` 的根级 `siteConfig` 对象中，只控制文章页分类栏显示哪些标签及其顺序。主题会自动在最前面加入 `全部`；该名称由主题保留，不能作为自定义分类。分类名称会去除首尾空白、忽略空字符串并去重，文章内容中的其他分类不会自动生成新的标签：

```js
postCategories: ["随笔", "评谈", "记录", "笔记", "指南"],
```

例如，配置 `postCategories: ["摄影", "旅行"]` 后，要让文章出现在“摄影”标签下，其 Frontmatter 应填写 `category: "摄影"`。名称必须完全匹配；修改分类栏配置不会改写已有文章的 `category`。

省略站点配置中的 `postCategories` 时，分类栏使用上述五个默认分类；设为空数组 `[]` 时，分类栏只显示 `全部`。这两种设置都不影响文章的分类必填要求。自定义分类可以使用任意非空名称；文章已填写的分类若未列入分类栏配置，仍可在 `全部` 中浏览该文章。

### 小诗与音乐板块显示开关

两个开关位于仓库根目录 `fonscape.config.js` 的根级 `siteConfig` 对象中，与 `language`、`title`、`description` 同级。它们控制桌面和移动主导航、首页对应板块、首页统计项以及搜索范围；关闭的板块不会出现在“全部”搜索结果中。已有路由、详情页与内容文件不会被删除：

```js
showPoems: false,
showMusic: false,
```

各板块开关彼此独立，可按需自由组合；`true` 表示显示，`false` 表示隐藏。

### 个人渠道

关于页目前支持 GitHub、哔哩哔哩、X 与邮箱入口，对应配置位于 `author.channels`：

```js
channels: {
  github: { label: "@yourname", url: "https://github.com/yourname" },
  bilibili: { label: "@yourname", url: "https://space.bilibili.com/你的UID" },
  x: { label: "@yourname", url: "https://x.com/yourname" },
  email: { address: "hello@example.com" },
},
```

外部渠道的 `label` 是关于页显示的名称，`url` 填写完整链接；邮箱只填写 `address`，主题会直接显示邮箱地址并自动生成邮件链接。删除不需要的渠道对象，或把对应地址留空，即可隐藏该入口。

### 页面头图

`siteConfig.heroes` 包含 `home`、`posts`、`poems`、`music`、`friends` 与 `about` 六个页面：

```js
home: {
  image: "/assets/home-hero.webp",
  position: "center",
  mobilePosition: "60% center",
  size: "cover",
}
```

- `image`：普通页面头图。
- `glassImage`：可选的预模糊背景图；省略时主题会自动柔化普通头图。
- `position`：桌面与平板的图片焦点。
- `mobilePosition`：手机端的图片焦点。
- `size`：通常使用 `cover`。

自定义图片放在 `public/assets/`，配置路径从网站根目录开始写，例如 `public/assets/home.jpg` 对应 `"/assets/home.jpg"`。文件名大小写必须与仓库中的文件一致。每个位置只需提供一张质量足够的原图；Fonscape 会按头像、卡片、正文和头图等实际渲染角色选择尺寸，每张原图最多生成 5 个响应式候选，并让手机、平板、桌面和高分屏浏览器选择合适文件。PNG 衍生图保持无损，其他格式采用高质量编码；如果衍生图没有比原图更小，主题会自动丢弃它。原图始终作为兜底，衍生图位于忽略提交的构建目录，不需要手工维护，也不会替换原图。

头像只需配置 `author.avatar`，主题会按实际渲染角色自动生成响应式尺寸。

#### 图片焦点位置

`position`、`mobilePosition` 和文章的 `cardPosition` 使用相同的方向顺序：第一个值控制水平方向（左右），第二个值控制垂直方向（上下）。水平方向的 `0%`、`50%`、`100%` 分别对应左、中、右；垂直方向分别对应上、中、下。

例如 `"50% 30%"` 表示水平居中、垂直偏上；`"60% center"` 表示水平略偏右、垂直居中。单独填写 `"center"` 表示两个方向都居中。

### 友链

已发布友链保存在 `src/content/friends.json`：

```json
[
  {
    "name": "示例站点",
    "url": "https://example.com",
    "description": "站点简介",
    "owner": "站长名称",
    "avatar": "/assets/friend-example.webp",
    "color": "#d98ab0"
  }
]
```

账户用户的友链可以填写 `userId`，让头像与昵称从当前站点账户同步；普通静态友链使用 `avatar`。

### 内容与资源路径

| 内容 | 路径 |
| --- | --- |
| 文章 | `src/content/posts/*.md` |
| 小诗 | `src/content/poems/*.md` |
| 音乐手记 | `src/content/music/*.md` |
| 图片 | `public/assets/` |
| 音频 | `public/audio/` |

### 环境变量

| 变量 | 平台 | 说明 |
| --- | --- | --- |
| `ADMIN_BOOTSTRAP_TOKEN` | Cloudflare、Vercel | 自行生成且没有默认值，仅用于创建首位管理员 |
| `TURSO_DATABASE_URL` | Vercel | 由 Turso Marketplace 自动注入 |
| `TURSO_AUTH_TOKEN` | Vercel | 由 Turso Marketplace 自动注入 |

Cloudflare 通过 `wrangler.jsonc` 中的 `DB` 绑定连接 D1。真实密钥不得写入 `fonscape.config.js`、`.env.example` 或其他已跟踪文件。

## 内容撰写

文章、小诗与音乐手记都采用“单个 Markdown + Frontmatter + 自动扫描”。新增内容时只需在对应目录新建一个 `.md` 文件，不需要维护 JavaScript 索引，也不需要在 API 中再次登记评论或浏览量目标。

Frontmatter 使用 `key: value` 写法。字符串统一使用双引号；布尔值、数字与 `null` 不加引号；数组和对象必须写成合法 JSON，例如 `tags: ["阅读", "技术"]`。

### 新建文章

在 `src/content/posts/` 新建文件，例如 `my-note.md`：

```md
---
title: "我的笔记"
category: "笔记"
date: "2026-07-27T20:00"
slug: "my-note"
excerpt: "一段简短摘要。"
tags: ["文学", "随想"]
series: "阅读札记"
seriesOrder: 1
featured: true
featuredOrder: 10
image: "/assets/my-note.webp"
cardPosition: "50% 35%"
music: {"src":"/audio/example.mp3","cover":"/assets/example.webp","title":"曲名","artist":"音乐人"}
musicPlacement: "inline"
---

这里直接撰写 Markdown 正文。需要在正文中显示配乐播放器时，将下列标记单独写在一行：

[[article-music]]
```

文件名会自动成为 `slug`；需要自定义地址时可填写 `slug`。必填字段为 `title`、`category`、`date`。

#### 文章字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `category` | 是 | `postCategories` 中配置的任意分类名称 |
| `date` | 是 | 可被 JavaScript 解析的日期，建议使用 `YYYY-MM-DDTHH:mm` |
| `slug` | 否 | 自定义地址；默认取文件名，只能使用小写字母、数字、`/`、`_`、`-` |
| `excerpt` | 否 | 列表与详情页摘要；未填写时列表会尝试读取正文首段 |
| `tags` | 否 | JSON 字符串数组 |
| `series` | 否 | 系列名称 |
| `seriesOrder` | 否 | 系列内的章节顺序；相同或未填写时按日期排序 |
| `featured` | 否 | 是否置顶，默认 `false` |
| `featuredOrder` | 否 | 置顶顺序，必须是正整数；仅可在 `featured: true` 时使用 |
| `image` | 否 | 封面路径，例如 `/assets/my-note.webp` |
| `cardPosition` | 否 | 列表卡片的[图片焦点位置](#图片焦点位置)，按“水平 垂直”填写，例如 `50% 30%` |
| `coverMode` | 否 | 详情页封面模式：`wide` 或 `none`，默认 `wide` |
| `music` | 否 | 文章配乐对象，字段见下文 |
| `musicPlacement` | 否 | 默认显示在正文前；设为 `inline` 时由正文标记决定位置 |

未设置 `image` 时，列表会使用主题统一的无封面占位样式。

#### 置顶与系列

- 只有 `featured: true` 的文章会进入置顶区域；没有置顶文章时保留空置顶卡片。
- `featuredOrder` 从小到大排序。编号允许留空，不必在删除一篇置顶文章后重新编号。
- 未填写 `featuredOrder` 的置顶文章排在有编号的文章之后，并按发布时间从早到晚排列。
- 同一 `series` 的文章会在详情页显示上一章与下一章；建议同时填写互不重复的 `seriesOrder`。

#### 文章配乐

Frontmatter 中的对象必须写成一行合法 JSON：

```yaml
music: {"src":"/audio/example.mp3","cover":"/assets/example.webp","title":"曲名","artist":"音乐人"}
```

默认播放器位于文章信息与正文之间。需要放入正文时，增加 `musicPlacement: "inline"`，再将下列标记单独写在正文一行：

```text
[[article-music]]
```

内联播放器不会自动播放；浏览器也可能阻止详情页播放器的有声自动播放，此时读者可手动点击播放。

### 新建音乐手记

在 `src/content/music/` 新建文件，例如 `a-song.md`：

```md
---
title: "一首歌"
kind: "歌曲"
section: "songs"
date: "2026-07-27T20:00"
excerpt: "关于这首歌的一段简介。"
image: "/assets/a-song.webp"
url: "https://example.com"
action: "前往收听"
sourceTitle: "曲名"
sourceMeta: "音乐人"
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

### 新建小诗

在 `src/content/poems/` 新建文件，例如 `a-poem.md`：

```md
---
title: "一首小诗"
date: "2026-07-27T20:00"
---

第一行
第二行

第四行
```

正文按行显示，空行也会保留。必填字段为 `title` 和 `date`。文件名默认成为 `slug`；如需自定义地址，可在 Frontmatter 中填写 `slug`。

可选字段 `note` 会显示在诗正文之后。小诗正文至少需要一行非空内容。

### Markdown 正文

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

音频放在 `public/audio/`，Frontmatter 中使用 `/audio/example.mp3`。

### 自动扫描

构建时会自动扫描：

- `src/content/posts/*.md`
- `src/content/poems/*.md`
- `src/content/music/*.md`

安装、开发、构建、测试与检查命令会先由 `scripts/generate-content-targets.mjs` 生成前端与 API 共用的内容目标清单。Frontmatter 缺少必填字段、日期无效或 slug 重复时，命令会直接报错，避免错误内容进入线上。

生成器只把首页需要的少量摘要和各板块计数放进主题入口；列表、筛选与搜索索引按固定大小分块，详情正文按单条内容独立加载，响应式图片清单也按块加载。性能预算约束入口主题包和每个分块，不约束全站内容总数；内容增加时增长的是分块数量，不会在达到某个总条目数后阻止继续发布。分块规则以 `scripts/generate-content-targets.mjs` 中的 `CONTENT_PAGE_CHUNK_SIZE`、`CONTENT_INDEX_CHUNK_SIZE` 和 `scripts/generate-responsive-images.mjs` 中的 `fullManifestChunkSize` 为准。

新增、删除或重命名内容后只需运行：

```bash
pnpm check
```

内容目标会在安装、开发、构建、测试与检查命令前自动生成，不需要手工运行生成器或提交生成文件。推送到部署分支后，平台的 Git 集成会自动构建；不需要在数据库中再次发布文章。

## 维护与功能扩展约束

新增前端板块、设置项或内容类型时，应继续沿用 Fonscape 已有的数据、组件和性能边界，不另建一套平行实现：

- 新内容类型接入统一 collection manifest、固定分块、按需正文、搜索与统计目标链路；首页只读取小型 `home` 子集。新增第四类及后续类型时，应通过 collection 配置扩展生成器，而不是复制文章、小诗或音乐的加载代码。
- 新图片入口必须登记到现有角色化响应式图片生成器。单张原图的衍生候选不得超过 5 个；不要为某个新页面另写一套图片副本或全量清单，也不要把内容总量塞回入口 JS、CSS 或 HTML 预算。
- 新设置项必须有明确且可验证的运行时消费者，并同步更新类型、文档和测试。没有实际效果、与默认行为完全等价或只作为另一个字段隐式后备的设置不应加入。
- 新 UI 优先复用现有路由加载、请求缓存、错误处理、状态管理、组件和样式材料。禁止通过复制页面、复制 API 分支或长期叠加一套独立 CSS 布局来绕开已有结构。
- 新布局或实现取代旧版本时，应在同一改动中删除已不可达的选择器、分支与仅锁定旧源码形状的测试；以用户行为、公共 API 或构建产物契约承接必要回归，不把废弃实现长期留在主题包中。
- 性能约束按“固定主题入口预算 + 单个内容分块预算 + 单图候选上限”执行，而不是给可增长的内容总量设置低的固定上限。新增功能必须继续通过 0、50、500、2000 条混合内容规模测试。
- 提交前至少运行 `pnpm check`；涉及响应式布局时核验手机、平板和桌面，涉及交互时补充行为测试。重构 API 分发或其他共享基础设施前，应先建立覆盖现有兼容行为的测试矩阵。

这些约束的目标是让功能真正融入项目，而不是在已有代码旁边持续堆叠重复逻辑。若一个改动需要绕过多条共享链路，应该先调整共用抽象，再接入新功能。

## 部署

Fonscape 目前支持 Cloudflare Workers + D1 与 Vercel + Turso。只需准备一个 GitHub 账号，即可通过任一平台的 GitHub 登录完成授权和部署；部署表单只要求填写自行生成的 `ADMIN_BOOTSTRAP_TOKEN`。部署完成后打开 `/admin/setup`，使用同一令牌创建首位管理员。初始化成功后，数据库会永久拒绝再次使用该令牌。

### Cloudflare Workers + D1

点击 README 中的 **Deploy to Cloudflare**。平台会复制仓库、创建并绑定 D1，然后通过仓库的 `deploy` 脚本应用迁移并部署 Worker。部署完成后，Workers Builds 会负责后续 Git 提交的自动构建。

手动部署时：

```bash
wrangler secret put ADMIN_BOOTSTRAP_TOKEN
pnpm check
pnpm deploy
```

如需自定义域名，在 Cloudflare 控制台为当前 Worker 添加 Custom Domain。Workers Builds 与仓库内的 Cloudflare GitHub Actions 只启用一种，避免同一次提交触发两次生产部署。

### Vercel + Turso

点击 README 中的 **Deploy with Vercel**。部署流程会添加 Turso Cloud 的数据库集成并自动注入数据库连接；在部署表单中填写 `ADMIN_BOOTSTRAP_TOKEN` 即可。Vercel 使用 `pnpm build:vercel` 在构建前应用数据库迁移，并通过 Git 集成部署后续提交。

Production 与 Preview 应使用不同数据库，真实密钥只保存在平台的服务器端环境变量中。

### Cloudflare GitHub Actions

手动复制仓库且没有使用 Workers Builds 时，可以在仓库中设置：

- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- Repository variable：`CLOUDFLARE_DEPLOY_ENABLED=true`

之后推送或合并到 `main` 会自动检查并部署 Cloudflare Worker。

Checks 与部署工作流会在安装依赖后恢复响应式图片缓存。缓存只包含 `public/fonscape/generated-images/` 与可丢弃的构建缓存目录 `.fonscape-cache/responsive-images/`，不会缓存 `dist`、密钥或运行时数据库。首次运行是冷缓存，生成器会完整生成图片；后续命中热缓存时仍会执行完整的 `pnpm check`，由生成器验证并复用已有候选与无体积收益的生成结果。缓存未命中或恢复失败时会正常生成图片。缓存键会随运行环境、Node/pnpm 工具链、生成器辅助代码、锁文件，以及原图、站点配置和内容输入变化而失效；内容或图片编辑会通过同一工具链范围内的恢复前缀尽量复用仍然有效的候选。

### 部署后检查

1. 直接访问并刷新首页、文章、小诗、音乐、友链与关于页。
2. 确认 `/api/site/runtime` 返回当前站点的建立时间。
3. 创建首位管理员后再次打开 `/admin/setup`，应自动回到首页。
4. 检查登录、评论、头像与回复通知是否写入当前站点数据库。
5. 推送一项临时内容改动，确认 Git 集成部署了对应提交。

确认管理员创建成功后，可以从部署平台移除 `ADMIN_BOOTSTRAP_TOKEN`。

## 升级

升级前提交或备份站点改动，并单独备份 D1 或 Turso 数据库。Updater 默认只显示计划，不写入文件：

```bash
pnpm fonscape update
pnpm fonscape update --apply
pnpm install --frozen-lockfile
pnpm check
```

Updater 会保护站点配置、Markdown 内容、友链、图片、音频与真实环境变量，并在应用前把将要改写的文件备份到 `.fonscape-update/backups/`。升级到指定版本时使用 `--to <目标版本>`。

需要让目标版本重新接管全部主题文件时，先预演主题校准：

```bash
pnpm fonscape update --to <目标版本> --reconcile-theme
pnpm fonscape update --to <目标版本> --reconcile-theme --apply
```

<details>
<summary>冲突处理与回滚</summary>

无法自动合并的文件会写入 `.fonscape-update/conflicts/`，本轮不会修改站点文件。完成审核后，可通过 `--resolutions <目录>` 使用手工合并结果；也可以对本轮计划中的具体文件使用 `--keep <路径>` 保留站点版本，或使用 `--take-incoming <路径>` 采用目标版本。

应用后如需恢复文件：

```bash
pnpm fonscape update --rollback .fonscape-update/backups/<备份目录>
```

文件回滚不会撤销数据库迁移。

</details>

数据库迁移按文件名顺序追加。Cloudflare 使用 `pnpm db:migrate:cloudflare`；Vercel + Turso 先运行 `pnpm migrate:turso` 查看计划，确认数据库后再运行 `pnpm migrate:turso --apply`。

升级完成后，在相同的桌面与手机视口核对站点资料、个人内容、资源、数据库数据和主要页面。目标版本的变化与特殊注意事项以 [GitHub Releases](https://github.com/UndefinedFons/Fonscape/releases) 为准。

## 故障排查

### 内容或配置没有更新

1. 确认文件位于本指南列出的内容或资源目录。
2. 运行 `pnpm check`，根据报错检查 JavaScript 语法、Frontmatter、日期与重复 slug。
3. 核对部署平台显示的提交 SHA 是否等于生产分支最新提交。
4. 强制刷新浏览器，并确认域名指向当前 Worker 或 Vercel 项目。

### Cloudflare 找不到 D1

确认当前 Worker 存在名为 `DB` 的 D1 绑定，并且数据库属于当前 Cloudflare 账户和当前站点。补齐绑定后重新运行 `pnpm db:migrate:cloudflare`，再部署 Worker。

### Vercel 页面可访问，但账户或评论不可用

确认 Turso Marketplace 仍连接到当前项目，再运行 `pnpm migrate:turso` 查看未执行迁移。Production 与 Preview 数据库不得共用。

### 管理员无法初始化

确认 `/admin/setup` 中使用的是当前部署的 `ADMIN_BOOTSTRAP_TOKEN`，输入内容没有多余空格。创建首位管理员后，初始化页会自动失效。

### 头像上传失败

输入文件支持 JPEG、PNG 与 WebP，原始文件上限为 10 MB。浏览器裁切后会保存为 WebP；如果细节过多导致压缩后仍超过限制，请缩小裁切范围或更换图片。

仍无法定位时，请提交 Bug 报告并附上 Fonscape 版本、部署平台、复现步骤和脱敏日志。不要公开令牌、数据库地址、账户资料或评论数据。

## 运行与维护

- 仓库保存已发布内容、正式友链与资源；D1 或 Turso 保存账户、评论、会话、统计、审核和限频数据。
- 数据库迁移只追加到 `migrations/`，已经执行的迁移文件不得删除、重命名或改写。
- 当前限频与容量默认值以 `functions/_lib/abuse.js` 中的 `DEFAULT_ABUSE_LIMITS` 为准。
- 评论频率保护保留账户短周期与每日上限、IP 短周期上限、全站每小时与每日上限；单个内容页面不再额外叠加小时窗口。相同正文可以再次发布，但仍受上述时间窗口、原子写入和所有容量熔断约束；管理员只绕过已登录账户操作的频率限制。客户端为一次评论提交保留同一个幂等标识，网络响应丢失后的重试只返回首次写入的评论，不重复占用限频额度。
- 删除评论和通知已读回执不占用账号资料修改限频；通知只有在用户点击具体消息后才标记该条为已读，打开通知列表或切换板块不会批量标记。
- 评论区按创建时间从新到旧按评论串分页，每页显示 20 条根评论，并附带这些根评论的全部公开回复；接口同时返回准确的评论总数和页数，页码切换不会拆散父评论与回复，带 `comment` 参数的链接会定位到评论所在页。
- 浏览量是低价值统计：浏览器会在同一会话内避免重复上报，后端只保留全站小时写入熔断，不为每个内容目标再建立一行限频状态；统计自增使用一次带返回值的原子写入。
- 评论容量与公开统计由数据库聚合表和触发器维护；`account_usage` 保留为低成本的单账户评论存储熔断，`comment_target_usage` 同时承担页面评论统计与容量判断，内容列表只按当前可见条目查询统计，不随全站评论总量扫描。
- 普通 API 写请求的后台维护只清理过期会话和陈旧限频行，不扫描评论表。Cloudflare 的定时任务每周执行一次完整聚合对账，作为迁移、人工数据库操作或异常中断后的恢复手段；正常正确性仍由同一事务内的触发器保证。
- 头像输入与存储限制以 `functions/api/[[path]].js` 中的 `AVATAR_MAX_BYTES`、`AVATAR_TOTAL_MAX_BYTES` 为准。
- 主题改动在合并前运行 `pnpm check`，关键评论路径另运行 `pnpm test:e2e`；涉及布局时检查桌面、平板、手机与窄屏，数据库迁移先在独立测试数据库演练。

<details>
<summary>主题维护者发布清单</summary>

1. 从最新 `main` 创建独立发布分支。
2. 更新 `package.json`、`.fonscape-version` 与 `fonscape.manifest.json`，并确认版本一致。
3. 从上一正式版本验证 Updater 的预演、应用与回滚。
4. 在带有自定义内容和配置的独立站点验证升级，不覆盖用户文件。
5. 运行 `pnpm install --frozen-lockfile` 与 `pnpm check`。
6. 通过 Pull Request 合并，确认检查成功且 changed files 符合预期。
7. 在合并提交上创建版本标签和中文 GitHub Release，并核对标签、提交与变更说明。

</details>
