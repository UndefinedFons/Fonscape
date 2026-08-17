import { Article } from "@phosphor-icons/react/Article";
import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Disc } from "@phosphor-icons/react/Disc";
import { Eye } from "@phosphor-icons/react/Eye";
import { Feather } from "@phosphor-icons/react/Feather";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import { authorProfile, musicReviews, poems, posts, siteConfig } from "../content/index.js";
import { ArticleCover } from "../components/Cards.jsx";
import { HeroShell } from "../components/PageHero.jsx";
import { useHorizontalScroller } from "../hooks.js";
import { getPostFirstParagraph } from "../richContent.js";
import { formatContentDate, getPostWordCount } from "../siteUtils.js";
import { getHomeContent } from "./homeContent.js";

const { featuredPosts, recentPosts, latestPoems, latestMusic, musicCount } = getHomeContent(posts, poems, musicReviews);

function applyFeaturedTone(image) {
  const feature = image.closest(".home-refresh-feature");
  if (!feature) return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 200) continue;
      const pixelRed = pixels[index];
      const pixelGreen = pixels[index + 1];
      const pixelBlue = pixels[index + 2];
      const brightness = (pixelRed + pixelGreen + pixelBlue) / 3;
      const chroma = Math.max(pixelRed, pixelGreen, pixelBlue) - Math.min(pixelRed, pixelGreen, pixelBlue);
      if ((brightness > 238 && chroma < 18) || brightness < 12) continue;
      red += pixelRed;
      green += pixelGreen;
      blue += pixelBlue;
      count += 1;
    }
    if (!count) return;
    const mix = (average, fallback) => Math.round((average / count) * .32 + fallback * .68);
    feature.style.setProperty("--featured-tone", `${mix(red, 23)},${mix(green, 13)},${mix(blue, 30)}`);
  } catch {
    // The default tone remains available if a future cross-origin cover cannot be sampled.
  }
}

export function HomePage({ stats }) {
  const [featuredState, setFeaturedState] = useState({ current: 0, previous: null });
  const featuredIndex = featuredPosts.length ? featuredState.current % featuredPosts.length : 0;
  const featuredPost = featuredPosts[featuredIndex] || null;
  const previousFeaturedPost = featuredState.previous === null || !featuredPosts.length
    ? null
    : featuredPosts[featuredState.previous % featuredPosts.length];
  const articleScroller = useHorizontalScroller();
  const poemScroller = useHorizontalScroller();
  const musicScroller = useHorizontalScroller();
  useEffect(() => {
    if (featuredState.previous === null) return undefined;
    const timer = window.setTimeout(() => setFeaturedState((current) => ({ ...current, previous: null })), 560);
    return () => window.clearTimeout(timer);
  }, [featuredState.current, featuredState.previous]);
  useEffect(() => {
    if (featuredPosts.length < 2) return;
    const nextPost = featuredPosts[(featuredIndex + 1) % featuredPosts.length];
    if (!nextPost.image) return;
    const image = new Image();
    image.decoding = "async";
    image.src = nextPost.image;
  }, [featuredIndex]);
  const showNextFeaturedPost = () => setFeaturedState((current) => {
    if (featuredPosts.length < 2) return current;
    const next = (current.current + 1) % featuredPosts.length;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return { current: next, previous: null };
    return { current: next, previous: current.current };
  });
  const renderFeaturedPost = (post, phase) => <a key={post.slug} className={`home-refresh-feature is-${phase}`} href={`#/post/${post.slug}`} aria-hidden={phase === "outgoing" ? "true" : undefined} tabIndex={phase === "outgoing" ? -1 : undefined}>
    {post.image ? <img src={post.image} alt="" loading={phase === "current" ? "eager" : "lazy"} decoding="async" fetchPriority={phase === "current" ? "high" : "auto"} onLoad={(event) => applyFeaturedTone(event.currentTarget)} style={{ objectPosition: post.cardPosition || post.coverPosition || "center" }} /> : <span className="home-refresh-feature-placeholder"><BookOpenText size={48} weight="duotone" /></span>}
    <span className="home-refresh-feature-shade" />
    <span className="home-refresh-feature-copy">
      <small>置顶阅读 · {post.category}</small>
      <strong>{post.title}</strong>
      <p>{post.excerpt || getPostFirstParagraph(post)}</p>
      <span className="home-refresh-feature-meta">
        <span><TextAa size={14} />{getPostWordCount(post)} 字</span>
        <span><Eye size={14} />{stats[post.slug]?.views || 0}</span>
        <span><ChatCircleDots size={14} />{stats[post.slug]?.comments || 0}</span>
        <b>阅读全文</b>
      </span>
    </span>
  </a>;
  return <main className="home-page home-refresh-page">
    <HeroShell variant="home" labelledBy="home-title" copyClassName="home-refresh-hero-copy">
      <span className="eyebrow">{siteConfig.home.eyebrow}</span>
      <h1 id="home-title">{siteConfig.home.title}</h1>
      <span className="home-hero-mark" aria-hidden="true" />
      <p>{siteConfig.home.description}</p>
    </HeroShell>

    <div className="home-refresh-content page-width">
      <section className="home-refresh-lead" aria-label="置顶阅读与个人简介">
        <div className={`home-refresh-feature-slot${featuredPost ? "" : " is-empty"}`}>
          {previousFeaturedPost && renderFeaturedPost(previousFeaturedPost, "outgoing")}
          {featuredPost ? renderFeaturedPost(featuredPost, "current") : <div className="home-refresh-feature home-refresh-feature-empty material-panel is-current" role="status">
            <span className="home-refresh-feature-empty-icon" aria-hidden="true"><BookOpenText size={48} weight="duotone" /></span>
            <strong>暂无置顶文章</strong>
          </div>}
          {featuredPosts.length > 1 && <button type="button" className="home-refresh-feature-switch" onClick={showNextFeaturedPost} onPointerUp={(event) => event.currentTarget.blur()} aria-label={`下一篇置顶文章，当前第 ${featuredIndex + 1} 篇，共 ${featuredPosts.length} 篇：《${featuredPost.title}》`} title="切换到下一篇置顶文章"><Article size={15} weight="bold" aria-hidden="true" /><span aria-hidden="true"><strong>{featuredIndex + 1}</strong><i>/</i>{featuredPosts.length}</span></button>}
        </div>

        <aside className="home-refresh-profile material-panel" aria-labelledby="home-profile-name">
          <div className="home-refresh-profile-heading">
            <a href="#/about" aria-label="查看关于我">{authorProfile.avatar ? <img src={authorProfile.avatar} alt={authorProfile.avatarAlt} width="132" height="132" loading="eager" decoding="async" /> : <span className="home-refresh-profile-avatar-placeholder" role="img" aria-label={authorProfile.avatarAlt}><UserCircle size={62} weight="duotone" /></span>}</a>
            <span><small>ABOUT ME</small><strong id="home-profile-name">{authorProfile.name}</strong><em>{authorProfile.tagline}</em></span>
          </div>
          <p>{authorProfile.introduction}</p>
          <div className="home-refresh-stats" aria-label={`${posts.length} 篇文章，${poems.length} 首小诗，${musicCount} 篇音乐手记`}>
            <span><strong>{posts.length}</strong><small>文章</small></span>
            <span><strong>{poems.length}</strong><small>小诗</small></span>
            <span><strong>{musicCount}</strong><small>音乐</small></span>
          </div>
        </aside>
      </section>

      <section className="home-refresh-section home-refresh-recent material-panel" aria-labelledby="home-recent-title">
        <header className="home-refresh-section-heading">
          <span><small>LATEST ARTICLES</small><h2 id="home-recent-title">近期文章</h2></span>
          <a href="#/posts">浏览文章</a>
        </header>
        {recentPosts.length ? <nav className="home-refresh-news-track" aria-label="近期文章，横向滑动查看更多" {...articleScroller}>
          {recentPosts.map((post) => <a className="home-refresh-news-card" href={`#/post/${post.slug}`} key={post.slug}>
            <ArticleCover post={post} className="home-refresh-news-cover" emptyClassName="is-placeholder" placeholderClassName="home-refresh-news-placeholder" />
            <span className="home-refresh-news-copy">
              <span className="home-refresh-news-meta"><small>{post.category}</small><time dateTime={post.date}>{formatContentDate(post.date).slice(0, 10)}</time></span>
              <strong>{post.title}</strong>
              <p>{post.excerpt || getPostFirstParagraph(post)}</p>
              <span className="home-refresh-news-foot"><small>{getPostWordCount(post)} 字</small><em>阅读</em></span>
            </span>
          </a>)}
        </nav> : <div className="home-refresh-empty home-refresh-news-empty" role="status"><BookOpenText size={30} weight="duotone" /><strong>暂无文章</strong></div>}
      </section>

      <div className="home-refresh-columns">
        <section className="home-refresh-section home-refresh-poems material-panel" aria-labelledby="home-poems-title">
          <header className="home-refresh-section-heading">
            <span><small>SMALL POEMS</small><h2 id="home-poems-title">三行风与梦</h2></span>
            <a href="#/poems">走进诗页</a>
          </header>
          {latestPoems.length ? <div className="home-refresh-list home-refresh-mini-track" {...poemScroller}>
            {latestPoems.map((poem) => <a href={`#/poem/${poem.slug}`} key={poem.slug}>
              <Feather size={20} weight="duotone" />
              <span><small>小诗 · <time dateTime={poem.date}>{formatContentDate(poem.date).slice(0, 10)}</time></small><strong>{poem.title}</strong><small>{poem.lines.slice(0, 2).join(" / ")}</small></span>
            </a>)}
          </div> : <div className="home-refresh-empty" role="status"><Feather size={28} weight="duotone" /><strong>暂无小诗</strong></div>}
        </section>

        <section className="home-refresh-section home-refresh-music material-panel" aria-labelledby="home-music-title">
          <header className="home-refresh-section-heading">
            <span><small>MUSIC NOTES</small><h2 id="home-music-title">耳边正在发生</h2></span>
            <a href="#/music">音乐手记</a>
          </header>
          {latestMusic.length ? <div className="home-refresh-list home-refresh-mini-track" {...musicScroller}>
            {latestMusic.map((entry) => <a href={`#/music/${entry.section}/${entry.slug}`} key={`${entry.section}-${entry.slug}`}>
              <Disc size={21} weight="duotone" />
              <span><small>{entry.kind} · {formatContentDate(entry.date).slice(0, 10)}</small><strong>{entry.title}</strong></span>
            </a>)}
          </div> : <div className="home-refresh-empty" role="status"><MusicNotes size={29} weight="duotone" /><strong>暂无音乐</strong></div>}
        </section>
      </div>
    </div>
  </main>;
}
