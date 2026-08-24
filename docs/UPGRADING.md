# Fonscape 升级说明

Fonscape 使用 `主版本.次版本.修订号` 三段式数字版本号，例如 `1.1.0`：

- 第一位数字：存在需要人工迁移的不兼容变化时增加。
- 第二位数字：增加向后兼容的新功能时增加。
- 第三位数字：发布向后兼容的修复时增加。

每次升级先阅读目标版本的 GitHub Release 和 [`../CHANGELOG.md`](../CHANGELOG.md)。

## 升级前

1. 提交或另行保存站点改动，并确认工作区没有未提交修改。
2. 备份 D1 或 Turso 数据库。
3. 记录当前 Fonscape 版本、部署平台与数据库迁移状态。
4. 创建独立升级分支，不直接在生产分支操作。

GitHub 模板生成的新仓库拥有独立历史，不能假设它能像普通 fork 一样无冲突地合并主题仓库。Fonscape 1.1.0 起提供安全升级器，使用版本标签中的原始主题作为三方合并基线。

## 安全升级器

升级器默认只预演，不写文件。它按照 [`../fonscape.manifest.json`](../fonscape.manifest.json) 区分四类路径：

- 用户文件：站点配置、Markdown、正式友链、图片、音频和环境文件，已有内容永不覆盖。
- 新用户脚手架：仅在旧版本和当前站点都没有该文件时补入空白模板；1.1.0 仅包含根配置与 `friends.json`。
- 合并文件：`package.json`、部署配置和工作流等，保留站点值并吸收可安全合并的主题变化。
- 主题文件：未被站点修改时直接升级；双方都修改时尝试三方合并。

精确的 `.env.example` 是公开部署模板，按合并文件参与三方升级；`.env` 与其他 `.env.*` 文件仍属于用户所有，升级器不会覆盖它们。

从 1.1.0 及更高版本升级时，`.fonscape-version` 必须记录已安装的主题版本：

1.1.0 自带的 Updater 会保护 1.1.1 已移除的旧配置文件，因此 1.1.0 → 1.1.1 这一次过渡需要临时运行目标版本的 Updater：

```bash
pnpm dlx github:UndefinedFons/Fonscape#v1.1.1 update --from 1.1.0 --to 1.1.1
pnpm dlx github:UndefinedFons/Fonscape#v1.1.1 update --from 1.1.0 --to 1.1.1 --apply
```

到达 1.1.1 后，后续版本继续使用站点内置命令：

```bash
pnpm fonscape update
pnpm fonscape update --apply
```

不指定 `--to` 时只选择最新的稳定三段式版本标签，不采用预发布标签，也不允许降级。站点缺少 `.fonscape-version` 时升级器始终停止，即使提供 `--from` 也不会猜测或初始化来源版本。已有 marker 时，显式 `--from` 可用于一致性校验，但必须与 marker 完全一致；升级器还会校验来源/目标目录的 `package.json` 版本与请求版本、目标 manifest 版本一致。

预演后若确认某个主题或合并文件必须继续使用站点当前版本，可显式保留；该选项可重复，并会作为提醒打印在最终计划中：

```bash
pnpm fonscape update --to 1.2.0 --keep src/styles.css --keep index.html
```

`--keep` 只能引用本轮计划中实际将更新或冲突的文件，拼错或无关路径会直接报错。保留主题文件可能跳过新版本依赖的功能，应用前必须结合构建和页面检查判断；它主要用于经过审查的站点定制与零视觉变化升级。

若冲突文件应直接采用目标版本，可重复使用 `--take-incoming`：

```bash
pnpm fonscape update --to 1.2.0 \
  --take-incoming src/components/Example.jsx \
  --take-incoming src/styles.css
```

它只能指定本轮仍未解决的冲突；incoming 有文件时写入目标内容，incoming 已删除时删除站点文件。选择按 `--keep`、`--take-incoming`、`--resolutions` 的顺序处理，因此可以为不同文件组合这些选项；已由 `--keep` 处理的路径会使同名 `--take-incoming` 报错，同名 incoming 选择若在 resolutions 目录中也有结果同样会报错，避免多个选择静默覆盖彼此。

### 冲突与回滚

只要有一个文件无法安全合并，本轮就不会写入任何计划中的站点文件。升级器会在 `.fonscape-update/conflicts/<来源>-to-<目标>/` 保存 `base`、`current`、`incoming` 和待处理的 `resolved` 材料。清理 `resolved` 文件中的 Git 冲突标记后，使用升级器报告的目录继续：

```bash
pnpm fonscape update --to 1.2.0 --apply \
  --resolutions .fonscape-update/conflicts/1.1.0-to-1.2.0/resolved
```

二进制冲突需把最终选择的文件放入对应 `resolved` 路径；若确认应删除该文件，则创建同路径并追加 `.fonscape-delete` 的标记文件。

应用前会在 `.fonscape-update/backups/` 备份所有将被改写或删除的文件。验证失败时可回滚：

```bash
pnpm fonscape update --rollback .fonscape-update/backups/<备份目录>
```

应用与回滚会共用升级锁；备份目录、备份 metadata 或备份文件不完整时，回滚会在写入前停止。

文件回滚不回滚数据库迁移，所以升级前仍必须单独备份 D1 或 Turso。

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
- 升级前后的关键页面在相同桌面与手机视口下没有意外的像素变化。

验证通过后再通过 Pull Request 合并到生产分支。部署完成后核对生产构建对应的提交 SHA，并保留可回退的上一版本。

## 回退

前端或主题代码可回退到上一 Git 提交或 Worker/Vercel 部署。数据库迁移默认只向前兼容；不要通过删除表或回滚迁移文件来恢复旧结构。若升级包含数据迁移，应在 Release 中按该版本的专门说明处理。
