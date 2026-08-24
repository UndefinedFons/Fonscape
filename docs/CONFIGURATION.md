# Fonscape 配置说明

Fonscape 把可公开的站点资料放在仓库中，把密钥与数据库连接放在部署平台。每个站点都应使用自己的仓库副本、运行时数据库和环境变量。

## 站点资料

编辑仓库根目录的 `fonscape.config.js`：

| 配置 | 作用 |
| --- | --- |
| `language` | HTML 页面语言，例如 `zh-CN` |
| `title` | 浏览器标题与站点名称 |
| `description` | 站点通用简介 |
| `home.eyebrow` | 首页头图上方短标题 |
| `home.title` | 首页头图主标题 |
| `home.description` | 首页头图简介 |
| `author.name` | 作者显示名 |
| `author.avatar` | 作者头像路径；留空时显示默认图标 |
| `author.avatarAlt` | 头像替代文字 |
| `author.tagline` | 作者短签名 |
| `author.introduction` | 首页作者卡片简介 |
| `author.interests` | 关于页兴趣标签数组 |
| `author.github.label` | GitHub 链接显示文字 |
| `author.github.url` | GitHub 个人主页；留空时不显示入口 |
| `about.*` | 关于页头图、标题、摘要与正文段落 |
| `pages.*Description` | 文章、小诗、音乐、友链页面简介 |
| `footer.owner` | 页脚版权所有者名称 |

`footer.themeName` 与 `footer.themeRepository` 用于显示主题署名。默认值会把页脚的 `Fonscape` 链接到主题仓库，使用主题时应保留该署名与链接。

页脚年份和“本站已运行”时间不需要手工共用一个固定日期。后端会在当前站点自己的数据库中记录首次建立时间；当前年份晚于建立年份时，页脚自动显示 `建立年份-当前年份`。

## 页面头图

`siteConfig.heroes` 包含 `home`、`posts`、`poems`、`music`、`friends`、`about` 六个页面。每项支持：

```js
home: {
  image: "/assets/home-hero.webp",
  position: "center",
  mobilePosition: "60% center",
  size: "cover",
}
```

- `image`：普通页面头图。
- `position`：桌面与平板焦点，对应 CSS `background-position`。
- `mobilePosition`：移动端焦点。
- `size`：通常使用 `cover`。

默认头图是主题资源 `public/fonscape/hero-white.svg`。自定义图片文件放入使用者目录 `public/assets/`，配置值必须保留引号并写成 `"/assets/..."`；不要把仓库目录写成 `public/assets/...`。升级器不会覆盖该目录。

## 友链

已发布友链由 `src/content/friends.json` 数组维护：

```json
[
  {
    "name": "示例站点",
    "url": "https://example.com",
    "description": "站点简介",
    "owner": "站长名称",
    "avatar": "/assets/friend-example.webp",
    "color": "#d98ab0"
  }
]
```

`userId` 用于从当前站点账户系统同步头像与昵称。普通静态友链也可使用 `avatar`。不要把其他 Fonscape 站点的用户 ID 或运行时数据复制到新站点。

## 内容与资源

| 内容 | 路径 |
| --- | --- |
| 文章 | `src/content/posts/*.md` |
| 小诗 | `src/content/poems/*.md` |
| 音乐手记 | `src/content/music/*.md` |
| 图片 | `public/assets/` |
| 音频 | `public/audio/` |

字段与 Markdown 写法见 [`../CONTENT_GUIDE.md`](../CONTENT_GUIDE.md)。内容目标会在 `pnpm install`、`pnpm dev`、`pnpm build`、`pnpm test` 与 `pnpm check` 前自动生成，无需手工运行或提交生成文件。

## 环境变量

密钥不得写入 `fonscape.config.js`、`.env.example` 或其他已跟踪文件。按照 `.env.example` 在部署平台设置：

| 变量 | 平台 | 说明 |
| --- | --- | --- |
| `ADMIN_BOOTSTRAP_TOKEN` | 两者 | 唯一需要手工填写的值；无默认值，在 `/admin/setup` 自动进入的可见设置页中使用一次 |
| `TURSO_DATABASE_URL` | Vercel | 由 Turso Marketplace 自动注入，不手工填写 |
| `TURSO_AUTH_TOKEN` | Vercel | 由 Turso Marketplace 自动注入，不手工填写 |

Cloudflare 使用 `wrangler.jsonc` 的 `DB` 绑定连接自动创建的 D1，不使用 Turso 变量。限频哈希密钥由服务端在数据库中首次安全随机生成，不需要 `RATE_LIMIT_SALT`。详细步骤见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

每个头像在数据库中的上限是 100 KiB，整个站点的头像总容量固定为 100 MiB。这两项是数据库约束，不增加环境变量。

## 修改后检查

```bash
pnpm check
```

如果修改了头图或站点资料，再运行 `pnpm preview`，至少检查一个手机宽度和一个桌面宽度。真实部署还应确认 `/api/site/runtime` 返回当前站点自己的运行时间。
