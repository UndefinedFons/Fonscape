# Fonscape 部署说明

Fonscape 的 Vite 构建输出位于 `dist/`。文章、小诗、音乐与已发布友链始终以仓库文件为准；运行时数据库只保存账户、评论、会话、统计、审核和限频数据。

## Cloudflare Workers + D1

`worker/index.js` 处理动态请求，Workers Static Assets 提供前端文件，`wrangler.jsonc` 通过 `DB` 绑定 D1。纯净版配置不包含现有数据库 ID，部署时应创建并绑定当前站点自己的数据库。站点会从该数据库最早的迁移时间确定当前实例的建立时间，并保存独立的运行时间记录；后续内容部署不会重置计时。

### 推荐：Deploy to Cloudflare

点击 README 顶部的 **Deploy to Cloudflare**。Cloudflare 会按 [Deploy Button 资源自动配置机制](https://developers.cloudflare.com/workers/platform/deploy-buttons/)把 Fonscape 复制到使用者自己的 Git 仓库，根据 `wrangler.jsonc` 自动创建并绑定 D1，并使用仓库的 `deploy` 脚本先应用迁移、再部署 Worker。除项目与资源名称外，唯一需要使用者填写的值是当前站点自己的 `ADMIN_BOOTSTRAP_TOKEN`；它没有默认值。

每次部署都必须使用当前站点自己的仓库、Worker 与数据库。不要把另一个 Fonscape 站点生成的 `database_id`、环境变量、管理员令牌或域名配置复制过来。部署完成后，直接在新仓库的 `src/content/` 中撰写内容并推送到 `main`，Workers Builds 会自动重新构建与发布。

完成后，Workers Builds 会接管该副本的 Git 自动部署。不要再同时启用仓库内的 GitHub Actions，以免一次推送触发两次生产部署。

### 手动部署

1. 为当前站点生成独立的 `ADMIN_BOOTSTRAP_TOKEN`，通过 `wrangler secret put ADMIN_BOOTSTRAP_TOKEN` 保存；不要把真实值写入仓库。
2. 运行 `pnpm check`。
3. 运行 `pnpm deploy`，依次应用 D1 迁移并部署 Worker。
4. 打开 `/admin/setup`（会自动转到 `/#/admin/setup`），在可见输入框中输入令牌并创建首位管理员。数据库会永久记录初始化已完成；之后再次访问 Setup 或任何其他 `/admin` 路径都会回到首页，即使环境变量仍存在，该令牌也不能再次使用。
5. 如需自定义域名，在 Cloudflare 控制台为本 Worker 添加 Custom Domain。

`wrangler.jsonc` 还配置了每日维护任务，用于清理过期会话与陈旧限频窗口，并校准容量计数。

## Vercel + Turso

1. 点击 README 顶部的 **Deploy with Vercel**。部署按钮会把 [Turso Cloud](https://vercel.com/marketplace/tursocloud) 的 `database` 产品作为不可跳过的 Marketplace 集成，创建数据库并自动注入 `TURSO_DATABASE_URL` 与 `TURSO_AUTH_TOKEN`。
2. 只填写自己生成的 `ADMIN_BOOTSTRAP_TOKEN`；该字段没有默认值。不需要手工填写数据库地址、数据库令牌、管理员用户名或限频盐。
3. Vercel 使用 `pnpm build:vercel`，在构建前自动执行数据库迁移。迁移脚本以数据库记录抢占每一项迁移，并在写锁冲突时重试，多个并发构建不会重复执行同一项迁移。
4. 部署完成后打开 `/admin/setup`（会自动转到 `/#/admin/setup`），在可见输入框中输入同一个令牌并创建首位管理员；初始化完成后再次访问会回到首页。

不使用部署按钮时，先在 Vercel Marketplace 为项目添加 Turso Cloud 数据库，再在项目环境变量中加入 `ADMIN_BOOTSTRAP_TOKEN`。Vercel 的 Git 集成会自动为后续提交生成预览并部署生产分支。

不要在共享的 Preview 与 Production 数据库上自动运行同一套迁移；两种环境应使用独立数据库。真实密钥只能存放在部署平台的服务器端环境变量中。

## Git 自动部署

手动复制仓库且未使用 Workers Builds 时，可启用仓库内置的 Cloudflare GitHub Actions。它默认处于安全停用状态，避免刚复制主题、尚未配置密钥时产生失败部署。完成数据库创建与首次迁移后，在自己的 GitHub 仓库中设置：

- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- Repository variable：`CLOUDFLARE_DEPLOY_ENABLED=true`

此后推送或合并到 `main` 即可自动运行检查并部署 Cloudflare Worker。若已经通过 Deploy to Cloudflare 配置了 Workers Builds，请保持此变量关闭。Vercel 可直接导入仓库并使用平台的 Git 自动部署。两种方式都只发布当前仓库版本，不应连接其他站点的 Worker、数据库或域名。

## 部署后验证

完成首次部署后检查：

1. 首页、文章、小诗、音乐、友链和关于页可以直接访问并刷新。
2. `/api/site/runtime` 返回当前站点自己的 `launchedAt`，页脚从本次部署建立的数据库开始计时。
3. 使用一次性初始化令牌创建管理员后，初始化页显示已完成，令牌不能再次使用。
4. 登录、评论、头像与回复通知写入当前站点数据库。
5. 在自己的仓库新增一篇临时 Markdown 内容并推送，确认 Git 集成自动部署该提交；验证后再删除临时内容。
6. Cloudflare 只启用 Workers Builds 或 GitHub Actions 其中之一；Vercel 的 Production 与 Preview 不共用数据库。

确认管理员建立成功后可以从部署平台移除 `ADMIN_BOOTSTRAP_TOKEN`；即使暂时保留，数据库状态也会拒绝再次初始化。所有真实密钥都必须限制在部署平台服务器端。

配置字段见 [`CONFIGURATION.md`](./CONFIGURATION.md)，常见失败原因见 [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)。
