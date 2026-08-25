<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Fonscape：兼顾高颜值界面、沉浸式阅读与简洁使用流程的 React 个人博客主题">
</p>

<p align="center">
  Fonscape 是一款面向个人写作者的 React 博客主题，提供可定制界面、Markdown 内容管理、沉浸式长文阅读，以及 Cloudflare 与 Vercel 一键部署。
</p>

<p align="center">
  <a href="https://fonstage.space/">在线示例</a> ·
  <a href="#开始使用">开始使用</a> ·
  <a href="./CONTENT_GUIDE.md">内容指南</a> ·
  <a href="./docs/CONFIGURATION.md">配置说明</a>
</p>

## 示例界面

以下截图来自 [Fonstage](https://fonstage.space/)，一个基于 Fonscape 构建的实际个人博客。桌面首页集中展示头图、导航、作者信息、置顶内容与近期文章。

<p align="center">
  <a href="https://fonstage.space/"><img src="./assets/readme/fonstage-desktop.webp" width="100%" alt="Fonstage 的 Fonscape 桌面首页，展示头图导航、作者卡、置顶文章和近期文章入口"></a>
</p>

在线示例还展示响应式布局、全局搜索、明暗主题、磨砂材质、文章目录、阅读进度和账户评论流程，以及小诗、音乐手记与友链等内容页面。

## 它如何工作

Fonscape 把公开内容与运行时数据分开管理：

| Git 仓库：公开、可审阅 | 站点数据库：运行时、每站独立 |
| --- | --- |
| 文章、小诗、音乐手记 | 账户、头像、会话 |
| 站点配置、正式友链 | 评论、回复通知、统计 |
| 图片、音频与部署配置 | 审核状态与防刷数据 |

构建时，主题自动扫描 Markdown 与 Frontmatter，生成前端和 API 共用的内容目标；部署后，Cloudflare Workers + D1 或 Vercel + Turso 负责各自的动态数据。仓库内容始终是发布内容的唯一来源。

## 设计重点

- **高颜值界面**：页面头图、明暗主题、可切换的磨砂材质与响应式布局采用统一视觉系统，并支持站点级自定义。
- **沉浸式长文阅读**：支持 GFM Markdown、代码高亮、表格、自动编号目录、阅读进度、图片灯箱、系列导航、可选文章配乐与分页。
- **简洁的写作与部署流程**：内容由 Markdown 与 Git 管理；Cloudflare 和 Vercel 提供一键部署，Fonscape Updater 在主题升级时保护站点配置、内容与个人资源。

## 开始使用

### 一键部署

[![Deploy to Cloudflare](./assets/readme/deploy-cloudflare.svg)](https://deploy.workers.cloudflare.com/?url=https://github.com/UndefinedFons/Fonscape)
[![Deploy with Vercel](./assets/readme/deploy-vercel.svg)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape&env=ADMIN_BOOTSTRAP_TOKEN&envDescription=%E8%AF%B7%E8%BE%93%E5%85%A5%E4%B8%80%E4%B8%AA%E7%94%B1%E4%BD%A0%E8%87%AA%E5%B7%B1%E7%94%9F%E6%88%90%E7%9A%84%E3%80%81%E6%97%A0%E9%BB%98%E8%AE%A4%E5%80%BC%E7%9A%84%E4%B8%80%E6%AC%A1%E6%80%A7%E7%AE%A1%E7%90%86%E5%91%98%E5%88%9D%E5%A7%8B%E5%8C%96%E4%BB%A4%E7%89%8C%E3%80%82Turso+%E6%95%B0%E6%8D%AE%E5%BA%93%E5%8F%98%E9%87%8F%E4%BC%9A%E7%94%B1+Marketplace+%E8%87%AA%E5%8A%A8%E6%B3%A8%E5%85%A5%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape%2Fblob%2Fmain%2Fdocs%2FDEPLOYMENT.md&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22database%22%2C%22integrationSlug%22%3A%22tursocloud%22%7D%5D&skippable-integrations=0)

两种部署方式均只需填写自行生成的 `ADMIN_BOOTSTRAP_TOKEN`。部署完成后，打开 `/admin/setup` 并使用同一令牌创建首位管理员；初始化成功后，该令牌将永久失效。平台差异和部署后检查见 [部署说明](./docs/DEPLOYMENT.md)。

### 本地运行

```bash
git clone https://github.com/UndefinedFons/Fonscape.git
cd Fonscape
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

站点资料、作者信息、页面文案和头图从 [`fonscape.config.js`](./fonscape.config.js) 读取。完成基础配置后，在 `src/content/posts/hello-world.md` 创建第一篇文章：

```md
---
title: Hello World
category: 记录
date: 2026-01-01T12:00
---

这里直接写 Markdown 正文。
```

提交或部署前运行：

```bash
pnpm check
```

文章、小诗与音乐手记的字段、置顶顺序、封面模式和富文本写法以 [内容指南](./CONTENT_GUIDE.md) 为准；站点资料、资源路径和环境变量见 [配置说明](./docs/CONFIGURATION.md)。

<details>
<summary>常用命令</summary>

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm build` | 生成生产构建 |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm check` | 校验内容、运行测试并完成生产构建 |
| `pnpm deploy` | 应用 D1 迁移并部署到 Cloudflare Workers |

</details>

## 安全升级主题

Updater 默认只预演，不会写入文件：

```bash
pnpm fonscape update
pnpm fonscape update --apply
pnpm check
```

它会区分用户文件、主题文件、合并文件与迁移历史，并在应用前生成本地备份。升级前请阅读目标 [Release](https://github.com/UndefinedFons/Fonscape/releases)、[更新日志](./CHANGELOG.md) 和 [升级说明](./docs/UPGRADING.md)。

## 文档

- [站点配置](./docs/CONFIGURATION.md)：站点资料、作者信息、页面头图、友链与资源路径。
- [内容撰写](./CONTENT_GUIDE.md)：文章、小诗、音乐手记与 Markdown 富文本。
- [部署说明](./docs/DEPLOYMENT.md)：Cloudflare、Vercel、首次管理员设置与部署后验证。
- [升级说明](./docs/UPGRADING.md)：Updater 预演、冲突处理、回滚与数据库迁移。
- [故障排查](./docs/TROUBLESHOOTING.md) 与 [运行维护](./MAINTENANCE.md)：常见失败、限频与容量约束。
- [参与贡献](./CONTRIBUTING.md)、[安全政策](./SECURITY.md) 与 [行为准则](./CODE_OF_CONDUCT.md)。

## 鸣谢

感谢以下项目对Fonscape开发提供的灵感与参考：

- [astro-koharu](https://github.com/cosZone/astro-koharu)
- [Firefly](https://github.com/CuteLeaf/Firefly)
- [XinghuisamaBlogs](https://github.com/heiehiehi/XinghuisamaBlogs)

## 许可

Fonscape 使用 [MIT License](./LICENSE) 开源。
