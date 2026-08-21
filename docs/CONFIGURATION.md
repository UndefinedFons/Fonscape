# Fonscape 配置说明

Fonscape 把可公开的站点资料放在仓库中，把密钥与数据库连接放在部署平台。每个站点都应使用自己的仓库副本、运行时数据库和环境变量。

## 站点资料

编辑 `src/content/site.js` 中的 `siteConfig`：

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
home: Object.freeze({
  image: "/assets/home-hero.webp",
  glassImage: "/assets/home-hero-soft.webp",
  position: "center",
  mobilePosition: "60% center",
  size: "cover",
})
```

- `image`：普通页面头图。
- `glassImage`：开启全局磨砂玻璃时用于背景取色的图片；可与 `image` 相同。
- `position`：桌面与平板焦点，对应 CSS `background-position`。
- `mobilePosition`：移动端焦点。
- `size`：通常使用 `cover`。

默认头图是 `public/assets/hero-white.svg`。替换图片时将文件放入 `public/assets/`，并使用 `/assets/...` 路径。

## 友链

已发布友链由 `src/content/site.js` 中的 `friendLinks` 数组维护：

```js
export const friendLinks = [
  {
    name: "示例站点",
    url: "https://example.com",
    description: "站点简介",
    owner: "站长名称",
    avatar: "/assets/friend-example.webp",
    color: "#d98ab0",
  },
];
```

`avatarUserId` 仅用于需要从当前站点账户系统同步头像的场景。普通静态友链使用 `avatar` 即可。不要把其他 Fonscape 站点的用户 ID 或运行时数据复制到新站点。

## 内容与资源

| 内容 | 路径 |
| --- | --- |
| 文章 | `src/content/posts/*.md` |
| 小诗 | `src/content/poems/*.md` |
| 音乐手记 | `src/content/music/*.md` |
| 图片 | `public/assets/` |
| 音频 | `public/audio/` |

字段与 Markdown 写法见 [`../CONTENT_GUIDE.md`](../CONTENT_GUIDE.md)。新增或删除内容后运行 `pnpm generate:content-targets`，再运行 `pnpm check`。

## 环境变量

密钥不得写入 `site.js`、`.env.example` 或其他已跟踪文件。按照 `.env.example` 在部署平台设置：

| 变量 | 平台 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | 两者 | 唯一允许完成管理员初始化的用户名 |
| `ADMIN_BOOTSTRAP_TOKEN` | 两者 | 一次性管理员初始化令牌；初始化后移除 |
| `RATE_LIMIT_SALT` | 两者 | 当前站点独有的限频哈希盐 |
| `TURSO_DATABASE_URL` | Vercel | 当前站点的 Turso 数据库地址 |
| `TURSO_AUTH_TOKEN` | Vercel | 当前站点的 Turso 数据库令牌 |

Cloudflare 使用 `wrangler.jsonc` 的 `DB` 绑定连接 D1，不使用 Turso 变量。详细步骤见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

## 修改后检查

```bash
pnpm check
```

如果修改了头图或站点资料，再运行 `pnpm preview`，至少检查一个手机宽度和一个桌面宽度。真实部署还应确认 `/api/site/runtime` 返回当前站点自己的运行时间。
