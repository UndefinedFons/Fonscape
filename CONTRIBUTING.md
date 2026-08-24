# 参与贡献

感谢你帮助改进 Fonscape。提交前请先确认改动适合通用博客主题，并且不包含个人内容、生产配置、数据库标识或密钥。

## 提交问题

- Bug 使用 Bug 报告模板，提供版本、平台、复现步骤与已脱敏日志。
- 功能建议说明使用场景、期望行为和对现有部署方式的影响。
- 安全漏洞不要创建公开 Issue，请按 [`SECURITY.md`](./SECURITY.md) 私下报告。

较大的功能或结构调整建议先创建 Issue，确认方向后再实现。

## 本地开发

环境要求：Node.js 22、pnpm 11。

```bash
git clone https://github.com/UndefinedFons/Fonscape.git
cd Fonscape
pnpm install --frozen-lockfile
pnpm dev
```

从最新 `main` 创建语义清晰的分支，例如 `fix/avatar-validation` 或 `docs/cloudflare-setup`。

## 修改原则

- 保持改动聚焦，不夹带无关重构或格式化。
- 通用功能不能依赖某个站点的文章、头像、域名、账户或数据库。
- 已发布内容继续以 Git 仓库为准；不要把文章、小诗、音乐或已发布友链迁入 D1/Turso。
- 数据库结构变更只新增迁移文件，不改写已经发布的迁移。
- Cloudflare 与 Vercel 两条运行链路应保持可用；平台专属改动必须说明另一平台的行为。
- 不提交 `.env`、令牌、数据库地址、`database_id`、生产日志或用户数据。
- 前端改动应保留响应式、键盘操作、明暗主题、磨砂玻璃开关和 `prefers-reduced-motion` 行为。

## 内容与文档

示例只能使用虚构、通用内容。内容字段以 [`CONTENT_GUIDE.md`](./CONTENT_GUIDE.md) 为准，站点资料以 [`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) 为准。

新增、删除或重命名 Markdown 内容后运行：

```bash
pnpm check
```

内容目标会在命令前自动生成，不要手工编辑或提交 `functions/_generated/content-targets.js`。

## 验证

所有 Pull Request 至少运行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm exec wrangler deploy --dry-run --outdir .wrangler/worker-dry-run
```

前端或响应式改动还需检查手机与桌面视口，并在 Pull Request 中附上必要截图。后端或迁移改动应说明 Cloudflare D1 与 Turso 的验证范围。

## Pull Request

- 使用独立分支并填写 Pull Request 模板。
- 说明用户可见变化、测试结果、配置或迁移影响。
- 确认 changed files 中没有个人内容、构建产物、密钥或无关文件。
- 等待仓库的 `check` 工作流成功后再合并。

提交贡献即表示你同意按本仓库的 MIT License 发布相关改动，并遵守 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)。
