# 安全政策

## 支持版本

| 版本 | 安全更新 |
| --- | --- |
| `0.1.x` | 支持 |
| 更早版本 | 不支持 |

Fonscape 仍处于 Beta 阶段。安全修复会优先进入当前维护分支，并在 Release 与 `CHANGELOG.md` 中说明。

## 私下报告漏洞

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/UndefinedFons/Fonscape/security/advisories/new) 私下提交安全问题，不要为尚未修复的漏洞创建公开 Issue。

报告中请尽量提供：

- 受影响的 Fonscape 版本和提交 SHA。
- Cloudflare Workers + D1 或 Vercel + Turso 环境。
- 可复现步骤、影响范围与预期行为。
- 已脱敏的请求、响应或日志。
- 已知缓解措施。

不要提交访问令牌、Cookie、数据库凭据、真实账户资料、评论内容或其他站点的运行时数据。维护者会在 7 天内确认收到报告，并在验证后同步修复进度。

## 范围

安全报告可包括：

- 登录、注册、会话、管理员初始化与权限绕过。
- 评论、头像、友链申请与审核接口。
- 防刷、容量限制与输入验证绕过。
- D1、Turso、Worker、Vercel 适配器或部署工作流中的数据隔离问题。
- 依赖或构建链引入的可利用漏洞。

普通功能缺陷、样式问题和使用问题请使用 Issue 模板。
