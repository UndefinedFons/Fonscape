import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { XLogo } from "@phosphor-icons/react/XLogo";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { PageHero } from "../components/PageHero.jsx";
import { authorProfile, siteConfig } from "../content/index.js";
import { responsiveImageProps } from "../responsiveImages.ts";

function BilibiliLogo({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="m80 48-24-24M176 48l24-24" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    <rect x="24" y="56" width="208" height="152" rx="38" fill="currentColor" opacity=".14" />
    <rect x="24" y="56" width="208" height="152" rx="38" stroke="currentColor" strokeWidth="18" />
    <path d="M88 112v24M168 112v24" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
  </svg>;
}

const channelTypes = [
  { key: "github", eyebrow: "GITHUB", Icon: GithubLogo },
  { key: "bilibili", eyebrow: "BILIBILI", Icon: BilibiliLogo },
  { key: "x", eyebrow: "X", Icon: XLogo },
  { key: "email", eyebrow: "EMAIL", Icon: EnvelopeSimple },
];

export function resolveChannels(author) {
  const configured = author.channels || {};
  const legacyGithub = author.github || {};

  return channelTypes.flatMap(({ key, eyebrow, Icon }) => {
    const channel = key === "github" ? (configured.github || legacyGithub) : configured[key];
    if (!channel) return [];
    const address = key === "email" ? channel.address?.trim() : "";
    const href = key === "email" ? (address ? `mailto:${address}` : "") : channel.url?.trim();
    if (!href) return [];
    return [{ key, eyebrow, Icon, href, label: key === "email" ? address : (channel.label?.trim() || href) }];
  });
}

export function AboutPage() {
  const channels = resolveChannels(authorProfile);
  return <main className="about-page">
    <PageHero kicker="HELLO" title="关于我" description={siteConfig.about.heroDescription} icon={UserCircle} variant="about" />
    <section className="about-layout material-panel page-width">
      <aside className="about-profile">
        <div className="about-portrait">{authorProfile.avatar ? <img src={authorProfile.avatar} {...responsiveImageProps(authorProfile.avatar, "(max-width: 760px) min(70vw, 320px), 320px")} alt={authorProfile.avatarAlt} loading="lazy" decoding="async" /> : <span className="about-portrait-placeholder" role="img" aria-label={authorProfile.avatarAlt}><UserCircle size={112} weight="duotone" /></span>}</div>
        <div className="about-profile-copy">
          <span className="eyebrow">ABOUT ME</span>
          <h2>{authorProfile.name}</h2>
          <p>{authorProfile.tagline}</p>
          {authorProfile.interests.length > 0 && <div className="about-interest-list" aria-label="兴趣">{authorProfile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}
          {channels.length > 0 && <div className="about-channel-list" aria-label="个人渠道">
            {channels.map(({ key, eyebrow, Icon, href, label }) => <a key={key} className="about-channel" data-channel={key} href={href} target={key === "email" ? undefined : "_blank"} rel={key === "email" ? undefined : "noreferrer"} aria-label={key === "email" ? `发送邮件至 ${label}` : `访问 ${authorProfile.name} 的 ${eyebrow} 主页`}><span className="about-channel-icon"><Icon size={24} weight="duotone" /></span><span><small>{eyebrow}</small><strong>{label}</strong></span><ArrowRight size={16} /></a>)}
          </div>}
        </div>
      </aside>
      <article className={`about-story${siteConfig.about.paragraphs.length === 0 ? " about-story--compact" : ""}`}>
        <header><span className="eyebrow">{siteConfig.about.eyebrow}</span><h2>{siteConfig.about.greeting}</h2><p>{siteConfig.about.summary}</p></header>
        {siteConfig.about.paragraphs.length > 0 && <div className="prose-block">{siteConfig.about.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>}
      </article>
    </section>
    <div className="about-comments page-width"><div className="material-panel comments-material-panel"><CommentsSection targetType="post" slug="site-about" /></div></div>
  </main>;
}
