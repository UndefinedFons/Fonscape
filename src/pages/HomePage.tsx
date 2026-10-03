import type { ImgHTMLAttributes } from "react";
import type { ContentStats, HomeMusic, HomePost, OnStatsTargets } from "../types.ts";
import { Article } from "@phosphor-icons/react/Article";
import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Eye } from "@phosphor-icons/react/Eye";
import { Feather } from "@phosphor-icons/react/Feather";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useState } from "react";
import { authorProfile, contentRoute, homeContent, loadFeaturedChunk, siteConfig } from "../content/index.ts";
import { ArticleCover } from "../components/Cards.tsx";
import { HeroShell } from "../components/PageHero.tsx";
import { useHorizontalScroller } from "../hooks.ts";
import { SpinnerGap } from "@phosphor-icons/react/SpinnerGap";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { musicSession } from "../musicSession.ts";
import { useMusicSession } from "../useMusicSession.ts";
import { parseMetingLibraryUrl } from "../musicSources.ts";
import { Disc } from "@phosphor-icons/react/Disc";
import { useResponsiveImage } from "../useResponsiveImage.ts";
import { getPostFirstParagraph } from "../richContent.ts";
import { responsiveImageProps, responsiveImageUrl } from "../responsiveImages.ts";
import { getSectionAvailability } from "../sectionAvailability.ts";
import { formatContentDate, getPostWordCount } from "../siteUtils.ts";
import { routeHref } from "../routes.ts";
const { recentPosts, latestPoems, latestMusic } = homeContent;
const sectionState = getSectionAvailability(siteConfig);
const showPoems = sectionState.poems;
const showMusic = sectionState.music;
const homeStatsCount = 1 + Number(showPoems) + Number(showMusic);

function HomeMusicCard({ entry }: { entry: HomeMusic }) {
  const image = useResponsiveImage(entry.image, "64px");
  const state = useMusicSession();
  const active = state.entry?.section === entry.section && state.entry?.slug === entry.slug;
  const playing = active && state.playing;
  const loading = active && state.status === "loading";
  const toggle = () => {
    if (active && state.status === "ready") musicSession.toggle();
    else if (!loading) void musicSession.load({ ...entry, firstParagraph: "", wordCount: 0 });
  };
  return <div className="home-music-card">
    <a href={contentRoute("music", entry)}>
      <div className="home-music-cover">{image.src ? <img {...image} alt={`${entry.sourceTitle || entry.title}的封面`} loading="lazy" decoding="async" /> : <Disc size={28} weight="duotone" />}</div>
      <span><strong>{entry.sourceTitle || entry.title}</strong>{entry.sourceMeta && <small>{entry.sourceMeta}</small>}</span>
    </a>
    {parseMetingLibraryUrl(entry.url) && <button className="home-music-play" aria-label={`${playing ? "暂停" : "播放"} ${entry.sourceTitle || entry.title}`} aria-pressed={playing || loading} aria-busy={loading} onClick={toggle}><span className={loading ? "is-loading" : ""} key={loading ? "loading" : String(playing)}>{loading ? <SpinnerGap size={17} /> : playing ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}</span></button>}
  </div>;
}

function applyFeaturedTone(image: HTMLImageElement) {
  const feature = image.closest<HTMLElement>(".home-refresh-feature");
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
    const mix = (average: number, fallback: number) => Math.round((average / count) * .32 + fallback * .68);
    feature.style.setProperty("--featured-tone", `${mix(red, 23)},${mix(green, 13)},${mix(blue, 30)}`);
  } catch {
    // The default tone remains available if a future cross-origin cover cannot be sampled.
  }
}

export function HomePage({ stats, onStatsTargets }: { stats: ContentStats; onStatsTargets: OnStatsTargets }) {
  const [featuredPosts, setFeaturedPosts] = useState(() => [...homeContent.featuredPosts]);
  const [featuredState, setFeaturedState] = useState<{ current: number; previous: number | null }>({ current: 0, previous: null });
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const featuredCount = homeContent.featuredCount || featuredPosts.length;
  const featuredIndex = featuredCount ? featuredState.current % featuredCount : 0;
  const featuredPost = featuredPosts[featuredIndex] || null;
  const previousFeaturedPost = featuredState.previous === null || !featuredPosts.length
    ? null
    : featuredPosts[featuredState.previous % featuredPosts.length];
  const nextFeaturedPost = featuredPosts.length > 1
    ? featuredPosts[(featuredIndex + 1) % featuredPosts.length]
    : null;
  const articleScroller = useHorizontalScroller();
  const poemScroller = useHorizontalScroller();
  const musicScroller = useHorizontalScroller();
  useEffect(() => {
    onStatsTargets(featuredPosts.map((post) => ({ type: "post", slug: post.slug })));
  }, [featuredPosts, onStatsTargets]);
  useEffect(() => {
    if (featuredState.previous === null) return undefined;
    const timer = window.setTimeout(() => setFeaturedState((current) => ({ ...current, previous: null })), 560);
    return () => window.clearTimeout(timer);
  }, [featuredState.previous]);
  useEffect(() => {
    if (!nextFeaturedPost?.image) return;
    const source = nextFeaturedPost.image;
    const image = new Image();
    image.decoding = "async";
    const responsive = responsiveImageProps(source, "(max-width: 760px) calc(100vw - 24px), min(62vw, 760px)");
    if (responsive.srcSet) image.srcset = responsive.srcSet;
    if (responsive.sizes) image.sizes = responsive.sizes;
    image.src = responsiveImageUrl(source, 768);
  }, [nextFeaturedPost]);
  const showNextFeaturedPost = () => {
    if (featuredCount < 2 || featuredLoading) return;
    const next = (featuredState.current + 1) % featuredCount;
    if (next >= featuredPosts.length) {
      setFeaturedLoading(true);
      loadFeaturedChunk("post", Math.floor(next / homeContent.featuredChunkSize)).then((chunk) => {
        setFeaturedPosts((loaded) => loaded.length > next ? loaded : [...loaded, ...chunk]);
        setFeaturedState((current) => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? { current: next, previous: null }
          : { current: next, previous: current.current });
      }).catch(() => {}).finally(() => setFeaturedLoading(false));
      return;
    }
    setFeaturedState((current) => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? { current: next, previous: null }
      : { current: next, previous: current.current });
  };
  const renderFeaturedPost = (post: HomePost, phase: "current" | "outgoing") => <a key={post.slug} className={`home-refresh-feature is-${phase}`} href={contentRoute("post", post)} aria-hidden={phase === "outgoing" ? "true" : undefined} tabIndex={phase === "outgoing" ? -1 : undefined}>
    {post.image ? <img src={post.image} {...responsiveImageProps(post.image, "(max-width: 760px) calc(100vw - 24px), min(62vw, 760px)") as ImgHTMLAttributes<HTMLImageElement>} alt="" loading={phase === "current" ? "eager" : "lazy"} decoding="async" fetchPriority={phase === "current" ? "high" : "low"} onLoad={(event) => applyFeaturedTone(event.currentTarget)} style={{ objectPosition: post.cardPosition || "center" }} /> : <span className="home-refresh-feature-placeholder"><BookOpenText size={48} weight="duotone" /></span>}
    <span className="home-refresh-feature-shade" />
    <span className="home-refresh-feature-copy">
      <small>置顶阅读 · {post.category}</small>
      <strong>{post.title}</strong>
      <p>{post.excerpt || getPostFirstParagraph(post)}</p>
      <span className="home-refresh-feature-meta">
        <span><TextAa size={14} />{getPostWordCount(post)} 字</span>
        <span><Eye size={14} />{stats[post.slug]?.views || 0}</span>
        {siteConfig.showCommunity && <span><ChatCircleDots size={14} />{stats[post.slug]?.comments || 0}</span>}
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
          {featuredCount > 1 && featuredPost && <button type="button" className="home-refresh-feature-switch" onClick={showNextFeaturedPost} onPointerUp={(event) => event.currentTarget.blur()} aria-label={`下一篇置顶文章，当前第 ${featuredIndex + 1} 篇，共 ${featuredCount} 篇：《${featuredPost.title}》`} title="切换到下一篇置顶文章"><Article size={15} weight="bold" aria-hidden="true" /><span aria-hidden="true"><strong>{featuredIndex + 1}</strong><i>/</i>{featuredCount}</span></button>}
        </div>

        <aside className="home-refresh-profile material-panel" aria-labelledby="home-profile-name">
          <div className="home-refresh-profile-heading">
            <a href={routeHref("/about")} aria-label="查看关于我">{authorProfile.avatar ? <img src={authorProfile.avatarSmall || authorProfile.avatar} {...responsiveImageProps(authorProfile.avatarSmall || authorProfile.avatar, "132px") as ImgHTMLAttributes<HTMLImageElement>} alt={authorProfile.avatarAlt} width="132" height="132" loading="eager" decoding="async" /> : <span className="home-refresh-profile-avatar-placeholder" role="img" aria-label={authorProfile.avatarAlt}><UserCircle size={62} weight="duotone" /></span>}</a>
            <span><small>ABOUT ME</small><strong id="home-profile-name">{authorProfile.name}</strong><em>{authorProfile.tagline}</em></span>
          </div>
          <p>{authorProfile.introduction}</p>
          <div className="home-refresh-stats" style={{ "--home-stats-count": homeStatsCount }} aria-label={[`${homeContent.counts.post || 0} 篇文章`, showPoems && `${homeContent.counts.poem || 0} 首小诗`, showMusic && `${homeContent.counts.music || 0} 张音乐收藏`].filter(Boolean).join("，")}>
            <span><strong>{homeContent.counts.post || 0}</strong><small>文章</small></span>
            {showPoems && <span><strong>{homeContent.counts.poem || 0}</strong><small>小诗</small></span>}
            {showMusic && <span><strong>{homeContent.counts.music || 0}</strong><small>音乐</small></span>}
          </div>
        </aside>
      </section>

      <section className="home-refresh-section home-refresh-recent material-panel" aria-labelledby="home-recent-title">
        <header className="home-refresh-section-heading">
          <span><small>LATEST ARTICLES</small><h2 id="home-recent-title">近期文章</h2></span>
          <a href={routeHref("/posts")}>浏览文章</a>
        </header>
        {recentPosts.length ? <nav className="home-refresh-news-track" aria-label="近期文章，横向滑动查看更多" {...articleScroller}>
          {recentPosts.map((post) => <a className="home-refresh-news-card" href={contentRoute("post", post)} key={post.slug}>
            <ArticleCover post={post} className="home-refresh-news-cover" emptyClassName="is-placeholder" placeholderClassName="home-refresh-news-placeholder" sizes="(max-width: 760px) calc(100vw - 84px), 360px" />
            <span className="home-refresh-news-copy">
              <span className="home-refresh-news-meta"><small>{post.category}</small><time dateTime={post.date}>{formatContentDate(post.date).slice(0, 10)}</time></span>
              <strong>{post.title}</strong>
              <p>{post.excerpt || getPostFirstParagraph(post)}</p>
              <span className="home-refresh-news-foot"><small>{getPostWordCount(post)} 字</small><em>阅读</em></span>
            </span>
          </a>)}
        </nav> : <div className="home-refresh-empty home-refresh-news-empty" role="status"><BookOpenText size={30} weight="duotone" /><strong>暂无文章</strong></div>}
      </section>

      {(showPoems || showMusic) && <div className={`home-refresh-columns${showPoems && showMusic ? "" : " is-single"}`}>
        {showPoems && <section className="home-refresh-section home-refresh-poems material-panel" aria-labelledby="home-poems-title">
          <header className="home-refresh-section-heading">
            <span><small>SMALL POEMS</small><h2 id="home-poems-title">三行风与梦</h2></span>
            <a href={routeHref("/poems")}>走进诗页</a>
          </header>
          {latestPoems.length ? <div className="home-refresh-list home-refresh-mini-track" {...poemScroller}>
            {latestPoems.map((poem) => <a href={contentRoute("poem", poem)} key={poem.slug}>
              <Feather size={20} weight="duotone" />
              <span><small>小诗 · <time dateTime={poem.date}>{formatContentDate(poem.date).slice(0, 10)}</time></small><strong>{poem.title}</strong><small>{poem.previewLines.slice(0, 2).join(" / ")}</small></span>
            </a>)}
          </div> : <div className="home-refresh-empty" role="status"><Feather size={28} weight="duotone" /><strong>暂无小诗</strong></div>}
        </section>}

        {showMusic && <section className="home-refresh-section home-refresh-music material-panel" aria-labelledby="home-music-title">
          <header className="home-refresh-section-heading">
            <span><small>MUSIC ROOM</small><h2 id="home-music-title">耳边正在发生</h2></span>
            <a href={routeHref("/music")}>走进音乐</a>
          </header>
          {latestMusic.length ? <div className="home-refresh-list home-refresh-mini-track" {...musicScroller}>
            {latestMusic.map((entry) => <HomeMusicCard entry={entry} key={`${entry.section}-${entry.slug}`} />)}
          </div> : <div className="home-refresh-empty" role="status"><MusicNotes size={29} weight="duotone" /><strong>暂无音乐</strong></div>}
        </section>}
      </div>}
    </div>
  </main>;
}
