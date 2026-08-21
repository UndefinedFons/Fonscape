# Fonscape 发布流程

本文供维护者发布新版本时使用。

## 版本规则

- 使用三段式数字版本号，例如 `v1.0.0` 标签。
- Release 名称仅使用对应版本号，例如 `1.0.0`。
- Release 标签必须指向已经通过检查的 `main` 提交。
- 每个版本都更新根目录 `CHANGELOG.md`，并在 Release 中列出升级注意事项。

## 发布清单

1. 从最新 `main` 创建独立发布分支。
2. 更新 `package.json` 版本与 `CHANGELOG.md`。
3. 对配置、部署或迁移变化同步更新对应文档。
4. 运行 `pnpm install --frozen-lockfile` 与 `pnpm check`。
5. 创建 Pull Request，等待 `check` 工作流成功并核对 changed files。
6. 合并到 `main` 后，以合并提交创建 `vX.Y.Z` 标签与 GitHub Release。
7. Release 标题使用纯版本号，并确认标签与 `package.json` 版本一致。
8. 从 Release 链接重新核对标签、提交、变更记录和升级说明。

不要从本地未合并提交、功能分支或测试部署创建正式标签。
