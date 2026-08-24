# Fonscape（风栖）

一款清新、响应式、注重阅读体验的 React 个人博客主题模板。

Fonscape 基于 React 19 与 Vite 6 构建，以 Markdown 管理文章、小诗和音乐手记，并集成账户、评论与友链申请功能。主题界面、内容和部署配置均可由使用者独立定制。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/UndefinedFons/Fonscape)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape&env=ADMIN_BOOTSTRAP_TOKEN&envDescription=%E8%AF%B7%E8%BE%93%E5%85%A5%E4%B8%80%E4%B8%AA%E7%94%B1%E4%BD%A0%E8%87%AA%E5%B7%B1%E7%94%9F%E6%88%90%E7%9A%84%E3%80%81%E6%97%A0%E9%BB%98%E8%AE%A4%E5%80%BC%E7%9A%84%E4%B8%80%E6%AC%A1%E6%80%A7%E7%AE%A1%E7%90%86%E5%91%98%E5%88%9D%E5%A7%8B%E5%8C%96%E4%BB%A4%E7%89%8C%E3%80%82Turso+%E6%95%B0%E6%8D%AE%E5%BA%93%E5%8F%98%E9%87%8F%E4%BC%9A%E7%94%B1+Marketplace+%E8%87%AA%E5%8A%A8%E6%B3%A8%E5%85%A5%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2FUndefinedFons%2FFonscape%2Fblob%2Fmain%2Fdocs%2FDEPLOYMENT.md&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22database%22%2C%22integrationSlug%22%3A%22tursocloud%22%7D%5D&skippable-integrations=0)

[在线示例](https://fonstage.space/) · [部署说明](./docs/DEPLOYMENT.md) · [配置说明](./docs/CONFIGURATION.md) · [内容指南](./CONTENT_GUIDE.md)

## 功能

- 响应式首页、文章、小诗、音乐、友链与关于页面
- 明暗主题、全局磨砂玻璃开关、折叠导航与移动端菜单
- Markdown 内容自动扫描，支持 GFM、代码高亮、表格、文章目录、阅读进度与分页
- 文章封面灯箱、可选内置音乐、小诗与音乐手记独立详情页
- 账户、头像、评论、回复通知、管理员评论操作与数据库持久化防刷限制
- 前端内容以 Git 仓库为准，运行时数据与已发布内容相互分离
- 支持 Cloudflare Workers + D1，以及 Vercel + Turso

## 快速开始

环境要求：Node.js 22、pnpm 11。

```bash
git clone https://github.com/UndefinedFons/Fonscape.git
cd Fonscape
pnpm install --frozen-lockfile
pnpm dev
```

提交修改或部署前运行：

```bash
pnpm check
```

## 配置与内容

- 站名、作者、首页文案、页脚、栏目简介与各页面头图：`fonscape.config.js`
- 已发布友链：`src/content/friends.json`
- 文章：`src/content/posts/`
- 小诗：`src/content/poems/`
- 音乐手记：`src/content/music/`
- 图片：`public/assets/`
- 音频：`public/audio/`

内容采用 Markdown 与 Frontmatter；字段、置顶顺序和富文本写法见 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md)。

完整站点配置见 [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md)。其中包括站点资料、作者信息、各页面头图、页脚年份、友链与资源路径。每个部署都应使用自己的配置、数据库和密钥。

## 部署

Fonscape 支持两套彼此独立的运行方式：

- Cloudflare Workers + D1：Cloudflare 自动创建并绑定 D1、执行迁移并部署 Worker。
- Vercel + Turso：部署按钮通过 Turso Marketplace 自动创建数据库、注入连接变量，并在构建时执行迁移。

两种一键部署都只需要使用者填写一个自己生成的 `ADMIN_BOOTSTRAP_TOKEN`；输入框没有默认值。部署后打开 `/admin/setup`，网站会自动进入一次性设置页，在可见输入框中输入同一个令牌并创建首位管理员。数据库连接与内部限频密钥不需要手工填写，也不能提交到仓库。完整步骤见 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm build` | 构建生产文件到 `dist/` |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm check` | 校验内容、运行测试并完成生产构建 |
| `pnpm deploy` | 应用 D1 迁移并部署到 Cloudflare Workers |
| `pnpm migrate:turso --apply` | 手动部署时将迁移应用到 Turso；Vercel 会自动执行 |

运行维护与防刷默认值见 [`MAINTENANCE.md`](./MAINTENANCE.md)。

## 文档

- [站点配置](./docs/CONFIGURATION.md)
- [内容撰写](./CONTENT_GUIDE.md)
- [Cloudflare / Vercel 部署](./docs/DEPLOYMENT.md)
- [版本升级](./docs/UPGRADING.md)
- [故障排查](./docs/TROUBLESHOOTING.md)
- [参与贡献](./CONTRIBUTING.md)
- [安全政策](./SECURITY.md)
- [版本记录](./CHANGELOG.md)

Fonscape 当前版本为 `1.1.0`。版本号遵循三段式数字版本规则；升级前请先阅读对应 Release、[`CHANGELOG.md`](./CHANGELOG.md) 与 [Updater 说明](./docs/UPGRADING.md)。

## 许可

Fonscape 使用 [MIT License](./LICENSE) 开源。
