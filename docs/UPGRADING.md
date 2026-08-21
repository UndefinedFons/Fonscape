# Fonscape 升级说明

Fonscape 使用语义化版本号：

- `MAJOR`：包含需要人工迁移的不兼容变化。
- `MINOR`：向后兼容的新功能。
- `PATCH`：向后兼容的修复。
- `Beta`：公开测试版本，升级前应先在预览环境验证。

每次升级先阅读目标版本的 GitHub Release 和 [`../CHANGELOG.md`](../CHANGELOG.md)。

## 升级前

1. 备份站点仓库，并确认工作区没有未提交修改。
2. 备份 D1 或 Turso 数据库。
3. 记录当前 Fonscape 版本、部署平台与数据库迁移状态。
4. 创建独立升级分支，不直接在生产分支操作。

GitHub 模板生成的新仓库拥有独立历史，不能假设它能像普通 fork 一样无冲突地合并主题仓库。推荐按 Release 的 changed files 将通用主题变更移植到升级分支，并保留自己的 `src/content/`、`public/` 资源、环境变量、数据库标识和域名配置。

## 数据库迁移

迁移文件位于 `migrations/`，按编号顺序累积。不要删除、重命名或改写已经在生产数据库执行过的迁移。

Cloudflare：

```bash
pnpm db:migrate:cloudflare
```

Vercel + Turso：

```bash
pnpm migrate:turso
pnpm migrate:turso --apply
```

第一条 Turso 命令只显示计划；确认目标数据库无误后再执行 `--apply`。

## 验证与发布

```bash
pnpm install --frozen-lockfile
pnpm check
```

随后在独立预览环境检查：

- 首页、文章、小诗、音乐、友链与关于页。
- 文章、小诗和音乐详情页。
- 登录、注册、评论、头像与管理员初始化状态。
- 当前站点的已有内容、运行时间和数据库数据未被其他站点替换。

验证通过后再通过 Pull Request 合并到生产分支。部署完成后核对生产构建对应的提交 SHA，并保留可回退的上一版本。

## 回退

前端或主题代码可回退到上一 Git 提交或 Worker/Vercel 部署。数据库迁移默认只向前兼容；不要通过删除表或回滚迁移文件来恢复旧结构。若升级包含数据迁移，应在 Release 中按该版本的专门说明处理。
