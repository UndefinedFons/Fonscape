# Fonscape 部署说明

Fonscape 的 Vite 构建输出位于 `dist/`。文章、小诗、音乐与已发布友链始终以仓库文件为准；运行时数据库只保存账户、评论、会话、统计、审核和限频数据。

## Cloudflare Workers + D1

`worker/index.js` 处理动态请求，Workers Static Assets 提供前端文件，`wrangler.jsonc` 通过 `DB` 绑定 D1。纯净版配置不包含现有数据库 ID，部署时应创建并绑定当前站点自己的数据库。站点会从该数据库最早的迁移时间确定当前实例的建立时间，并保存独立的运行时间记录；后续内容部署不会重置计时。

### 推荐：Deploy to Cloudflare

点击 README 顶部的 **Deploy to Cloudflare**。Cloudflare 会把 Fonscape 复制到使用者自己的 Git 仓库，根据 `wrangler.jsonc` 自动创建并绑定 D1，并使用仓库的 `deploy` 脚本先应用迁移、再部署 Worker。设置页面只需确认项目名称，并填写当前站点自己的 `ADMIN_USERNAME`、`ADMIN_BOOTSTRAP_TOKEN` 与 `RATE_LIMIT_SALT`。

每次部署都必须使用当前站点自己的仓库、Worker 与数据库。不要把另一个 Fonscape 站点生成的 `database_id`、环境变量、管理员令牌或域名配置复制过来。部署完成后，直接在新仓库的 `src/content/` 中撰写内容并推送到 `main`，Workers Builds 会自动重新构建与发布。

完成后，Workers Builds 会接管该副本的 Git 自动部署。不要再同时启用仓库内的 GitHub Actions，以免一次推送触发两次生产部署。

### 手动部署

1. 复制 `.env.example` 所列变量，为当前站点生成独立的 `ADMIN_BOOTSTRAP_TOKEN` 与 `RATE_LIMIT_SALT`。
2. 运行 `pnpm check`。
3. 运行 `pnpm deploy`，依次应用 D1 迁移并部署 Worker。
4. 完成管理员初始化后，移除一次性的 `ADMIN_BOOTSTRAP_TOKEN`。
5. 如需自定义域名，在 Cloudflare 控制台为本 Worker 添加 Custom Domain。

`wrangler.jsonc` 还配置了每日维护任务，用于清理过期会话与陈旧限频窗口，并校准容量计数。

## Vercel + Turso

1. 创建独立的 Turso 数据库。
2. 点击 README 顶部的 **Deploy with Vercel**；Vercel 会复制仓库，并在导入页面要求填写 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`ADMIN_USERNAME`、`ADMIN_BOOTSTRAP_TOKEN` 和 `RATE_LIMIT_SALT`。
3. 在复制后的仓库中运行 `pnpm migrate:turso` 查看迁移计划，确认目标数据库后运行一次 `pnpm migrate:turso --apply`。迁移完成后无需重新构建，账户与评论接口会直接使用新结构。

不使用部署按钮时，也可在 Vercel 控制台直接导入仓库并填写相同变量。Vercel 的 Git 集成会自动为后续提交生成预览并部署生产分支。

不要在共享的 Preview 与 Production 数据库上自动运行同一套迁移；两种环境应使用独立数据库。真实密钥只能存放在部署平台的服务器端环境变量中。

## Git 自动部署

手动复制仓库且未使用 Workers Builds 时，可启用仓库内置的 Cloudflare GitHub Actions。它默认处于安全停用状态，避免刚复制主题、尚未配置密钥时产生失败部署。完成数据库创建与首次迁移后，在自己的 GitHub 仓库中设置：

- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- Repository variable：`CLOUDFLARE_DEPLOY_ENABLED=true`

此后推送或合并到 `main` 即可自动运行检查并部署 Cloudflare Worker。若已经通过 Deploy to Cloudflare 配置了 Workers Builds，请保持此变量关闭。Vercel 可直接导入仓库并使用平台的 Git 自动部署。两种方式都只发布当前仓库版本，不应连接其他站点的 Worker、数据库或域名。
