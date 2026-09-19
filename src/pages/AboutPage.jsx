import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { HandHeart } from "@phosphor-icons/react/HandHeart";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { XLogo } from "@phosphor-icons/react/XLogo";
import { useLayoutEffect, useRef } from "react";
import { CommentsPanel } from "../community/CommentsPanel.jsx";
import { authorProfile, siteConfig } from "../content/index.js";
import { ZoomableImage } from "../ZoomableImage.jsx";
import { useResponsiveImage } from "../useResponsiveImage.js";

function BilibiliLogo({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(0 12)">
      <path d="m80 48-24-24M176 48l24-24" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <rect x="24" y="56" width="208" height="152" rx="38" fill="currentColor" opacity=".14" />
      <rect x="24" y="56" width="208" height="152" rx="38" stroke="currentColor" strokeWidth="18" />
      <path d="M88 112v24M168 112v24" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    </g>
  </svg>;
}

const channelTypes = [
  { key: "github", eyebrow: "GITHUB", Icon: GithubLogo },
  { key: "x", eyebrow: "X", Icon: XLogo },
  { key: "bilibili", eyebrow: "BILIBILI", Icon: BilibiliLogo },
  { key: "email", eyebrow: "EMAIL", Icon: EnvelopeSimple },
];

const PROFILE_STICKY_MIN_HEIGHT_RATIO = 1.28;
const PROFILE_STICKY_MIN_HEIGHT_GAP = 180;

export function shouldUseStickyProfileLayout(profileHeight, storyHeight) {
  return storyHeight > profileHeight * PROFILE_STICKY_MIN_HEIGHT_RATIO
    && storyHeight - profileHeight > PROFILE_STICKY_MIN_HEIGHT_GAP;
}

export function resolveChannels(author) {
  const configured = author.channels || {};
  const legacyGithub = author.github || {};
  const authorName = author.name || "作者";

  return channelTypes.flatMap(({ key, eyebrow, Icon }) => {
    const channel = key === "github" ? (configured.github || legacyGithub) : configured[key];
    if (!channel) return [];
    const address = key === "email" ? channel.address?.trim() : "";
    const href = key === "email" ? (address ? `mailto:${address}` : "") : channel.url?.trim();
    if (!href) return [];
    return [{
      key,
      eyebrow,
      Icon,
      href,
      ariaLabel: key === "email" ? `发送邮件至 ${address}` : `访问 ${authorName} 的 ${eyebrow} 主页`,
    }];
  });
}

function useAdaptiveProfileLayout() {
  const layoutRef = useRef(null);
  const profileRef = useRef(null);
  const storyRef = useRef(null);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const scrollArea = profileRef.current;
    const profile = scrollArea?.parentElement;
    const content = scrollArea?.querySelector(".about-profile-content");
    const story = storyRef.current;
    if (!layout || !profile || !scrollArea || !content || !story || typeof window === "undefined") return undefined;
    scrollArea.scrollTop = 0;

    let frame = 0;
    let active = true;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!active) return;
        if (window.matchMedia?.("(max-width:760px)")?.matches) {
          layout.classList.remove("is-profile-sticky");
          profile.style.removeProperty("--about-sticky-top");
          scrollArea.scrollTop = 0;
          return;
        }

        const profileHeight = content.scrollHeight;
        const storyHeight = story.scrollHeight;
        const viewportHeight = window.innerHeight;
        const viewportEdgeClearance = 24;
        // Keep comparable columns in the centered flow layout. Sticky mode is
        // reserved for a story that is clearly taller by both measures.
        const shouldStick = shouldUseStickyProfileLayout(profileHeight, storyHeight);
        layout.classList.toggle("is-profile-sticky", shouldStick);
        if (!shouldStick) {
          profile.style.removeProperty("--about-sticky-top");
          scrollArea.scrollTop = 0;
          return;
        }

        // This decreases continuously as the profile grows, then stops at the
        // viewport edge clearance while the inner region takes over scrolling.
        const stickyTop = Math.max(viewportEdgeClearance, Math.round((viewportHeight - profileHeight) / 2));
        profile.style.setProperty("--about-sticky-top", `${stickyTop}px`);
      });
    };

    const resizeObserver = typeof window.ResizeObserver === "function"
      ? new window.ResizeObserver(measure)
      : null;
    resizeObserver?.observe(content);
    resizeObserver?.observe(story);
    window.addEventListener("resize", measure, { passive: true });
    measure();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { layoutRef, profileRef, storyRef };
}

export function AboutPage() {
  const channels = resolveChannels(authorProfile);
  const support = authorProfile.support || {};
  const hasChannels = Boolean(support.image || channels.length > 0);
  const portraitImage = useResponsiveImage(authorProfile.avatar, "(max-width: 760px) min(70vw, 320px), 320px");
  const { layoutRef, profileRef, storyRef } = useAdaptiveProfileLayout();
  return <>
    <section ref={layoutRef} className="about-layout material-panel page-width">
      <aside className="about-profile">
        <div ref={profileRef} className="about-profile-scroll">
          <div className="about-profile-content">
            <div className="about-portrait">{authorProfile.avatar ? <img {...portraitImage} alt={authorProfile.avatarAlt} loading="lazy" decoding="async" /> : <span className="about-portrait-placeholder" role="img" aria-label={authorProfile.avatarAlt}><UserCircle size={112} weight="duotone" /></span>}</div>
            <div className="about-profile-copy">
              <span className="eyebrow">ABOUT ME</span>
              <h2>{authorProfile.name}</h2>
              <p>{authorProfile.tagline}</p>
              {authorProfile.interests.length > 0 && <div className="about-interest-list" aria-label="兴趣">{authorProfile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}
              {hasChannels && <div className="about-channel-list" aria-label="个人渠道">
                {support.image && <ZoomableImage src={support.image} alt={support.imageAlt || `${authorProfile.name} 的赞赏码`} showLightboxCaption={false} triggerClassName="about-channel about-channel--support" triggerAriaLabel={`打开${support.imageAlt || `${authorProfile.name} 的赞赏码`}`} triggerContent={<span className="about-channel-icon about-channel-icon--support"><HandHeart size={24} weight="duotone" /></span>} />}
                {channels.map(({ key, Icon, href, ariaLabel }) => <a key={key} className="about-channel" data-channel={key} href={href} target={key === "email" ? undefined : "_blank"} rel={key === "email" ? undefined : "noreferrer"} aria-label={ariaLabel}><span className="about-channel-icon"><Icon size={24} weight="duotone" /></span></a>)}
              </div>}
            </div>
          </div>
        </div>
      </aside>
      <article ref={storyRef} className={`about-story${siteConfig.about.paragraphs.length === 0 ? " about-story--compact" : ""}`}>
        <header><span className="eyebrow">{siteConfig.about.eyebrow}</span><h2>{siteConfig.about.greeting}</h2><p>{siteConfig.about.summary}</p></header>
        {siteConfig.about.paragraphs.length > 0 && <div className="prose-block">{siteConfig.about.paragraphs.map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}</div>}
      </article>
    </section>
    <div className="about-comments page-width"><CommentsPanel targetType="post" slug="site-about" /></div>
  </>;
}
