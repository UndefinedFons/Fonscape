# Fonscape 故障排查

## 内容修改后没有更新

1. 确认文件位于 `src/content/posts/`、`src/content/poems/` 或 `src/content/music/`。
2. 运行 `pnpm check`；内容目标会在命令开始前自动生成，无需手工执行或提交生成文件。
3. 根据报错检查 Frontmatter、日期与重复 slug。
4. 在部署平台核对生产分支和最新构建提交。

## Frontmatter 报错

- 每一项必须包含冒号与冒号后的值，例如 `title: 示例标题`。
- 数组和对象必须使用合法 JSON；字符串使用双引号。
- `featuredOrder` 只能与 `featured: true` 同时使用，并且必须是正整数。
- 不要给文章配置 `coverAlt`。
- 分类使用 `随笔`、`小说`、`评谈`、`记录`、`笔记` 或 `指南`。

## Cloudflare 找不到 D1

- 在 Worker 设置中确认存在名为 `DB` 的 D1 绑定。
- 确认数据库属于当前 Cloudflare 账户和当前站点。
- 如果手动创建数据库，按控制台返回的信息补齐当前站点副本的绑定；不要复制示例站或其他博客的 `database_id`。
- 重新运行 `pnpm db:migrate:cloudflare`，再部署 Worker。

## Cloudflare 一次推送部署两次

Workers Builds 与仓库内 GitHub Actions 二选一：

- 通过 Deploy to Cloudflare 创建的站点使用 Workers Builds，并保持 `CLOUDFLARE_DEPLOY_ENABLED` 关闭。
- 手动配置 GitHub Actions 时才设置 `CLOUDFLARE_DEPLOY_ENABLED=true`。

## Vercel 页面正常但账户或评论不可用

1. 核对 Production 环境中的 `TURSO_DATABASE_URL` 与 `TURSO_AUTH_TOKEN`。
2. 运行 `pnpm migrate:turso` 查看未执行迁移。
3. 确认目标数据库后运行 `pnpm migrate:turso --apply`。
4. 确认 Turso Marketplace 集成仍连接到当前项目，并检查 `ADMIN_BOOTSTRAP_TOKEN` 是否仅设置在服务器端。

Preview 与 Production 应使用不同数据库；不要让预览部署写入正式站数据。

## 受保护操作返回限频或数据库错误

限频哈希密钥会在数据库中首次安全随机生成，不再读取 `RATE_LIMIT_SALT`。若注册、登录或评论等受保护写入返回数据库配置错误，先确认当前数据库已执行全部迁移，再检查运行时日志；不要自行添加旧变量。

默认限制见 [`../MAINTENANCE.md`](../MAINTENANCE.md)。

## 管理员无法初始化

- 新站点必须先打开 `/admin/setup`，使用当前部署的 `ADMIN_BOOTSTRAP_TOKEN` 创建首位管理员，之后才开放普通注册。
- 令牌输入框是可见文本且默认留空；请确认粘贴内容没有多余空格。
- 初始化成功后数据库会永久拒绝再次使用令牌，也可以从部署平台移除该变量。
- 不要把其他站点的管理员账户、数据库或初始化令牌复制过来。

## 运行时间不正确

访问 `/api/site/runtime` 检查 `launchedAt`。运行时间来自当前站点数据库中的首次建立记录：

- 新部署必须绑定新数据库。
- A、B 两个博客不能共用 D1 或 Turso。
- 复制主题仓库不会复制数据库；手工复用数据库会同时复用运行时间和其他运行时数据。

## 头像上传失败

- 输入文件支持 JPEG、PNG、WebP，原始文件上限为 10 MB。
- 浏览器裁切后保存为 WebP，数据库中的最终大小上限为 100 KiB。
- 全站头像总容量固定为 100 MiB；达到上限时接口返回 `avatar_capacity_reached`，可由已有头像的用户替换为更小图片，或由维护者清理异常、无主数据。
- 若图片细节过多导致多次压缩仍超过限制，请缩小裁切范围或换用更简洁的图片。

## 构建通过但线上仍是旧页面

- 核对部署平台显示的提交 SHA 是否等于生产分支最新提交。
- 确认没有同时连接另一个仓库或旧 Pages 项目。
- 强制刷新一次，排除旧标签页保留的 SPA 资源。
- Cloudflare 自定义域名应绑定当前 Worker；Vercel 域名应指向当前项目。

仍无法定位时，提交 Bug 报告并附上 Fonscape 版本、部署平台、可复现步骤和已脱敏日志。不要公开提交令牌、数据库地址、账户资料或评论数据。
