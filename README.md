<p align="center">
  Fonscape 是一款面向个人写作者的 React 博客主题，提供可定制界面、Markdown 内容管理、长文阅读、评论消息追溯，以及 Cloudflare 与 Vercel 一键部署。
</p>

<p align="center">
  <a href="https://fonstage.space/">在线示例</a> ·
  <a href="#开始使用">开始使用</a> ·
  <a href="./GUIDE.md">使用指南</a>
</p>

## 示例界面

以下截图来自 [Fonstage](https://fonstage.space/)，一个基于 Fonscape 构建的实际个人博客。桌面首页集中展示头图、导航、作者信息与置顶内容。

<p align="center">
  <a href="https://fonstage.space/"><img src="./.github/assets/fonstage-desktop.webp" width="100%" alt="Fonstage 的 Fonscape 桌面首页，展示头图导航、作者卡与置顶文章"></a>
</p>

在线示例还展示响应式布局、全局搜索、明暗主题、磨砂材质、文章目录、阅读进度和账户评论流程，以及小诗、音乐手记与友链等内容页面。

## 它如何工作

Fonscape 把公开内容与运行时数据分开管理：

| Git 仓库：公开、可审阅 | 站点数据库：运行时、每站独立 |
| --- | --- |
| 文章、小诗、音乐手记 | 账户、头像、会话 |
| 站点配置、正式友链 | 评论、回复通知、统计 |
| 图片、音频与部署配置 | 审核状态与防刷数据 |

构建时，主题自动扫描 Markdown 与 Frontmatter，生成前端和 API 共用的内容目标，并把列表、搜索索引、详情正文与响应式图片清单拆成按需加载的固定分块；部署后，Cloudflare Workers + D1 或 Vercel + Turso 负责各自的动态数据。仓库内容始终是发布内容的唯一来源。

## 核心体验

- **一致的视觉系统**：页面头图、明暗主题、可切换的磨砂材质与响应式布局保持统一，并支持站点级自定义。
- **沉浸式长文阅读**：支持 GFM Markdown、代码高亮、表格、自动编号目录、阅读进度、图片灯箱、系列导航、可选文章配乐与分页。
- **可选的内容板块**：文章作为基础板块；小诗与音乐可由站点作者分别决定是否开启，导航、首页与搜索范围会随配置同步调整。
- **评论消息追溯**：“我的消息”“收到评论”和“收到回复”保留内容来源与回复上下文，点击消息可返回对应页面并定位原评论。
- **简洁的写作与部署流程**：内容由 Markdown 与 Git 管理；Cloudflare 和 Vercel 提供一键部署，Fonscape Updater 在主题升级时保护站点配置、内容与个人资源。
- **渐进式静态约束**：保留 JavaScript 源码的可读性，同时由 TypeScript 检查配置、内容解析、路由状态等核心数据边界，降低二次开发中的接口漂移。

## 开始使用

### 一键部署

[![Deploy to Cloudflare](./.github/assets/deploy-cloudflare-light.svg)](https://deploy.workers.cloudflare.com/?url=https://github.com/UndefinedFons/Fonscape)
[![Deploy with Vercel](./.github/assets/deploy-vercel-light.svg)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape&env=ADMIN_BOOTSTRAP_TOKEN&envDescription=%E8%AF%B7%E8%BE%93%E5%85%A5%E4%B8%80%E4%B8%AA%E7%94%B1%E4%BD%A0%E8%87%AA%E5%B7%B1%E7%94%9F%E6%88%90%E7%9A%84%E3%80%81%E6%97%A0%E9%BB%98%E8%AE%A4%E5%80%BC%E7%9A%84%E4%B8%80%E6%AC%A1%E6%80%A7%E7%AE%A1%E7%90%86%E5%91%98%E5%88%9D%E5%A7%8B%E5%8C%96%E4%BB%A4%E7%89%8C%E3%80%82Turso+%E6%95%B0%E6%8D%AE%E5%BA%93%E5%8F%98%E9%87%8F%E4%BC%9A%E7%94%B1+Marketplace+%E8%87%AA%E5%8A%A8%E6%B3%A8%E5%85%A5%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape%2Fblob%2Fmain%2FGUIDE.md&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22database%22%2C%22integrationSlug%22%3A%22tursocloud%22%7D%5D&skippable-integrations=0)

只需要一个 GitHub 账号即可跑通部署全流程：Cloudflare 与 Vercel 都支持使用 GitHub 登录，点击按钮后可依次完成授权、项目创建和首次部署，不必预先准备另一套平台登录信息。

两种部署方式的表单都只要求填写自行生成的 `ADMIN_BOOTSTRAP_TOKEN`。部署完成后，打开 `/admin/setup` 并使用同一令牌创建首位管理员；初始化成功后，该令牌将永久失效。平台差异和部署后检查见 [使用指南](./GUIDE.md#部署)。

### 本地运行

```bash
git clone https://github.com/UndefinedFons/Fonscape.git
cd Fonscape
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

站点资料、作者信息、页面文案、内容板块显示开关和头图从 [`fonscape.config.js`](./fonscape.config.js) 读取。小诗与音乐默认隐藏；如需显示，可在仓库根目录配置：

```js
showPoems: true,
showMusic: false,
```

各板块开关可按需自由组合，显示范围见 [使用指南](./GUIDE.md#小诗与音乐板块显示开关)。

文章默认提供随笔、评谈、记录、笔记与指南五个分类；名称、数量和顺序可通过 `postCategories` 自定义。配置方法与文章 `category` 的对应规则见 [文章分类](./GUIDE.md#文章分类)。

完成基础配置后，在 `src/content/posts/hello-world.md` 创建第一篇文章：

```md
---
title: "Hello World"
category: "记录"
date: "2026-01-01T12:00"
---

这里直接写 Markdown 正文。
```

提交或部署前运行：

```bash
pnpm check
```

文章、小诗与音乐手记的字段、站点资料、资源路径和环境变量统一收录在 [使用指南](./GUIDE.md)。

开发新板块、设置项或图片入口时，请同时遵守 [维护与功能扩展约束](./GUIDE.md#维护与功能扩展约束)，让功能接入统一内容分块、性能预算与共享组件体系，避免形成平行架构和重复逻辑。

<details>
<summary>常用命令</summary>

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm build` | 生成生产构建 |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm test:e2e` | 运行精简的评论关键路径浏览器测试 |
| `pnpm lint` | 检查 JavaScript、React 与 Hooks 的正确性规则 |
| `pnpm typecheck` | 检查核心 JavaScript 数据边界的静态类型 |
| `pnpm check` | 校验内容、运行测试与类型检查，并完成生产构建 |
| `pnpm deploy` | 应用 D1 迁移并部署到 Cloudflare Workers |

</details>

## 安全升级主题

Updater 默认只预演，不会写入文件：

```bash
pnpm fonscape update
pnpm fonscape update --apply
pnpm check
```

它会区分用户文件、主题文件、合并文件与迁移历史，并在应用前生成本地备份。完整流程见 [使用指南](./GUIDE.md#升级)；版本变化与特殊注意事项见 [Releases](https://github.com/UndefinedFons/Fonscape/releases)。

## 鸣谢

感谢以下项目对Fonscape开发提供的灵感与参考：

- [astro-koharu](https://github.com/cosZone/astro-koharu)
- [Firefly](https://github.com/CuteLeaf/Firefly)
- [XinghuisamaBlogs](https://github.com/heiehiehi/XinghuisamaBlogs)

## 许可

Fonscape 使用 [MIT License](./LICENSE) 开源。
