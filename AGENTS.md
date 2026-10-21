# Fonscape Agent 指南

本文件是 AI 编程 Agent（Codex、Claude Code 等）在 Fonscape 仓库中的工作入口，适用于主题开发和使用本主题的站点维护。

Fonscape（风栖）是基于 React、TypeScript 与 Vite 的博客主题，采用 CSS 样式体系和路径式 SPA 路由。公开内容由 Git 管理，构建时生成按需加载的内容分块；账户、评论与统计由 Cloudflare Workers + D1 或 Vercel + Turso 提供。

## 开始前

1. 确认当前仓库、分支与提交，检查工作区中的已有改动。维护上游主题时，从最新远端 `main` 的完整源码创建独立分支；维护已有站点时，以该站点的完整源码和维护约定为准。
2. 明确本次是内容编辑、站点配置、主题功能、部署还是升级，先查看相关实现与相邻用法。会改变任务范围、数据或发布行为的歧义应先确认；常规实现选择沿用项目惯例。
3. 阅读任务对应的指南章节：

   | 任务 | 必读入口 |
   | --- | --- |
   | 修改作者资料、分类、开关、头图或友链 | [站点配置](./GUIDE.md#站点配置) |
   | 新增或修改文章、小诗、音乐收藏 | [内容撰写](./GUIDE.md#内容撰写) |
   | 开发或修复主题功能 | [维护与功能扩展约束](./GUIDE.md#维护与功能扩展约束) |
   | 新增、修改或删除测试 | [测试](./GUIDE.md#测试) |
   | 调整平台适配、数据库或发布流程 | [部署](./GUIDE.md#部署)与[运行与维护](./GUIDE.md#运行与维护) |
   | 使用 Updater 更新站点 | [升级](./GUIDE.md#升级)与目标版本的 Release 说明 |

## 代码导航

按职责定位已有入口，再沿导入与调用关系追踪实现：

| 职责 | 入口 |
| --- | --- |
| 应用挂载、全局界面与弹窗 | `src/main.tsx`、`src/App.tsx` |
| 路由定义、导航与页面懒加载 | `src/routes.ts`、`src/routeState.ts`、`src/useAppRouting.ts`、`src/appRoutes.tsx` |
| 页面、共享组件与样式 | `src/pages/`、`src/components/`、`src/styles.css`、`src/styles/` |
| 详情页加载容器 | `src/components/RoutePageFrame.tsx` 的 `LoadingSurface` |
| 站点配置与类型 | `fonscape.config.js`、`src/siteConfig.ts`、`src/types.ts` |
| 内容集合与 Frontmatter 解析 | `content-repository.config.mjs` 的 `collections`、`src/content/frontmatter.ts`、`src/content/markdown.ts` |
| 内容生成与运行时加载 | `scripts/generate-content-targets.ts` 的 `generateContentArtifacts`、`src/content/index.ts` |
| 响应式图片 | `scripts/generate-responsive-images.ts`、`src/responsiveImages.ts`、`src/useResponsiveImage.ts` |
| 音乐元数据、播放状态与界面 | `scripts/music-metadata.ts`、`src/musicSources.ts`、`src/musicSession.ts`、`src/useMusicSession.ts`、`src/components/MusicStage.tsx` |
| 账户、评论与消息界面 | `src/community/`；API 调用入口为 `src/community/api.ts` |
| 共用 API、权限与防刷 | `functions/api/[[path]].ts` 的 `onRequest`、`functions/_lib/handlers/`、`functions/_lib/abuse.ts`、`functions/public-api.ts` |
| Cloudflare 与 Vercel 适配 | `worker/index.ts`、`api/fonscape.ts`、`server/turso-d1.ts` |
| 数据库迁移 | `migrations/`，按 SQL 文件名顺序执行 |
| Updater 与文件归属 | `scripts/fonscape-update.ts`、`scripts/fonscape-update/`、`fonscape.manifest.json` 的 `ownership` |
| 检查与构建预算 | `package.json` 的 `scripts`、`.github/workflows/check.yml`、`scripts/check-performance-budget.ts` |

文章、小诗、音乐的源目录由 `content-repository.config.mjs` 定义；正式友链保存在 `src/content/friends.json`，图片与音频分别放在 `public/assets/`、`public/audio/`。

## 修改边界

- 只修改需求涉及的文件与必要依赖，保留用户已有改动。不要用重置工作区、整目录替换或无关格式化完成局部任务。
- 通用主题能力在 Fonscape 上游实现；个人内容、资料、资产、域名、数据库标识和真实密钥留在站点自己的仓库或部署平台。公开示例和固定数据使用中性内容。
- 扩展功能前，遵守 [维护与功能扩展约束](./GUIDE.md#维护与功能扩展约束)。从现有入口扩展共享链路，匹配相邻模块的类型、导入、组件和样式约定。
- 内容与配置的字段以 GUIDE 为准。使用 Markdown + Frontmatter 和现有配置完成站点编辑，避免为单篇内容添加专用 UI 或另一份内容索引。
- 修改共用 API 时同时核对 Cloudflare 与 Vercel 适配。数据库操作遵守 [运行与维护](./GUIDE.md#运行与维护)，真实连接信息只在服务器端使用。
- 新增、移动或删除随主题交付的文件时，同步检查 `fonscape.manifest.json` 的归属。未登记路径会被 Updater 跳过；`AGENTS.md` 属于 `merge`，站点附加规则需随升级计划审查。
- 构建产物、缓存、Updater 备份与冲突材料不提交；实际忽略路径以 `.gitignore` 为准。修改生成逻辑时编辑生成器或源内容，再运行既有命令生成产物。

## 开发与验证

工具链版本读取 `package.json` 的 `engines`、`packageManager` 和工作流配置。安装依赖与提交前检查在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` 的实际步骤以 `package.json` 的 `scripts.check` 为准；PR 的完整检查以 `.github/workflows/check.yml` 为准。开发、预览与专项检查命令从 `package.json` 的 `scripts` 中按任务选择。

验证范围按 [维护与功能扩展约束](./GUIDE.md#维护与功能扩展约束)执行。涉及测试时，先阅读 [测试](./GUIDE.md#测试)并遵循其中的标准。纯文档修改需额外核对路径、命令和章节链接与当前源码一致。

记录实际运行的命令、结果与未完成的检查；检查失败时区分本次改动、已有问题与环境限制，不把未运行的检查写成通过。

## 提交、发布与升级

- 使用独立分支和 Pull Request，只提交本次目标文件。提交标题沿用仓库的 Conventional Commit 风格；PR 按 `.github/PULL_REQUEST_TEMPLATE.md` 说明改动与验证，合并前核对 changed files 和检查结果。
- 日常修改通过 PR 合并；只有用户明确要求发布 Release 或新版本时，才创建版本标签、调整发布版本和创建 GitHub Release。发布步骤见 GUIDE 的[主题维护者发布清单](./GUIDE.md#运行与维护)。Release 标题只使用版本标签，正文用中文概述并分条说明改动与验证。
- 维护已安装站点时，升级目标使用已发布的稳定 Release，按 [升级](./GUIDE.md#升级)执行 Updater 预演、审查与应用。不要用公共主题目录覆盖站点仓库；先备份运行时数据库，再按文件归属处理差异。
- 部署前读取该站点的工作流与平台配置，按 [部署](./GUIDE.md#部署)使用已启用的发布渠道，避免同一提交重复部署。仓库合并与生产部署分别核验：部署任务必须对应预期提交，再直接检查受影响页面与运行时。

## 文档与交付

README 负责项目介绍和开始使用，GUIDE 负责配置、内容、维护、部署与升级的完整规则，AGENTS 负责 Agent 的工作顺序和代码导航。变化影响哪一份文档，就更新那一份；详细规则通过章节链接引用。

文档描述当前功能与操作，不记录临时工作路径、当前线上提交或对话中的实现过程。版本差异与迁移说明放在对应 Release；版本、SHA、部署结果放在本次任务报告。

交付时说明改动、文件范围、验证结果和限制。提交到远端时附 PR 与提交；涉及部署或升级时附对应运行结果、验收页面和实际版本。
