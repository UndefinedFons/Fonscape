# 更新日志

Fonscape 的公开版本变化记录在这里。版本号遵循语义化版本。

## [1.1.2] - 2026-08-24

### 修复

- Vercel 改用明确的单一函数入口与 API 重写规则，避免多段 `/api/*` 请求被平台当作不存在的路径；管理员初始化、账户与评论请求现在会真正到达 Turso 后端。
- 移除管理员令牌输入框下方多余的可见性说明，输入框仍保持可见且不会预填令牌。
- 友链申请格式不再显示 `owner` 字段，站长身份直接使用评论账户；管理员可从有效申请评论复制规范友链 JSON。
- 补充 1.1.0 升级到 1.1.1 时临时调用目标版本 Updater 的准确命令。

## [1.1.1] - 2026-08-24

### 改进

- 根目录 `fonscape.config.js`、`src/content/friends.json` 与 Markdown `content` 现在分别是站点设置、正式友链与富文本正文的唯一来源。
- 站点配置适配器移入主题拥有的 `src/siteConfig.js`，用户配置与主题实现不再混放。
- Updater 只接受带有 `.fonscape-version` 的正式版本；`--from` 仅用于核对 marker，不再承担无 marker 旧项目的兼容入口。
- 部署模板测试同时校验 Cloudflare 与 Vercel 按钮参数。
- `/admin/setup` 会在各部署平台自动进入一次性 Setup；已初始化站点及其他 `/admin` 路径直接返回首页。
- 修正用户资源目录：图片使用 `public/assets/`，音频使用唯一的 `public/audio/`，不再生成误导性的嵌套目录。

### 移除

- 移除旧 `src/content/site.js`、`avatarUserId`、内嵌友链和数组正文兼容层。
- 通过新迁移删除已停用的旧友链申请归档表；原始公开评论及账户数据保持不变。

## [1.1.0] - 2026-08-24

### 新增

- 增加根级站点配置、独立正式友链 JSON 与明确的用户/主题文件边界。
- 增加一次性 `/#/admin/setup` 页面；令牌由部署者手工输入、保持可见、无默认值，并在管理员创建后由数据库状态永久禁用。
- 增加友链申请评论解析和管理员内联复制 JSON；站长名称与用户 ID 直接来自评论账户。
- 增加基于稳定 SemVer 标签的安全 Updater，支持预演、三方合并、冲突材料、备份与回滚。
- 增加全站 100 MiB 头像容量保险丝，同时保留单头像 100 KiB 限制。

### 改进

- Cloudflare 一键部署自动使用 D1，Vercel 一键部署自动使用 Turso Marketplace；两种方式都只要求填写 `ADMIN_BOOTSTRAP_TOKEN`。
- 限频哈希密钥改为由 Web Crypto 生成并原子保存在站点数据库，不再要求部署者配置盐值。
- Markdown 内容目标会在安装、开发、构建、测试与检查前自动生成，无需手工维护生成文件。
- Turso 迁移使用原子写入批次、并发抢占与有界重试，并支持包含 Trigger body 的 SQL 迁移。
- 数据库迁移安全移除用户表中的废弃字段，并将旧友链申请记录完整保留为只读 legacy 数据。
- 默认主题资源移至 `public/fonscape/`；旧 `site.js`、`avatarUserId` 与内嵌友链继续兼容，避免升级改变既有站点。

### 移除

- 移除 `ADMIN_USERNAME`、`RATE_LIMIT_SALT` 及 Cloudflare 中不需要的 Turso 配置要求。
- 移除未使用的后台内容发布门面和旧友链自动审核/发布方向；公开内容继续由仓库文件管理。

### 升级说明

- 1.0.0 首次升级需从 `v1.1.0` 标签临时运行 Updater，并显式传入 `--from 1.0.0`。
- 数据库迁移只向前执行；升级前应备份数据库，并在隔离分支完成页面与运行数据检查。

## [1.0.0] - 2026-08-22

首个公开版本。

### 新增

- 响应式首页、文章、小诗、音乐、友链与关于页面。
- Markdown 内容自动扫描、GFM、代码高亮、表格、目录、阅读进度与分页。
- 账户、头像、评论、回复通知、友链申请与管理员审核流程。
- Cloudflare Workers + D1 与 Vercel + Turso 部署支持。
- 每站独立的运行时间、数据库迁移与低流量个人博客防刷限制。
- 开源贡献、安全报告、版本升级、配置与故障排查文档。

### 说明

- 生产使用前建议在独立预览环境验证主题配置、数据库与部署链路。

[1.1.2]: https://github.com/UndefinedFons/Fonscape/releases/tag/v1.1.2
[1.1.1]: https://github.com/UndefinedFons/Fonscape/releases/tag/v1.1.1
[1.1.0]: https://github.com/UndefinedFons/Fonscape/releases/tag/v1.1.0
[1.0.0]: https://github.com/UndefinedFons/Fonscape/releases/tag/v1.0.0
