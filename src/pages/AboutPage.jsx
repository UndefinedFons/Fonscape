import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { PageHero } from "../components/PageHero.jsx";
import { authorProfile, siteConfig } from "../content/index.js";

export function AboutPage() {
  const github = authorProfile.github;
  return <main className="about-page">
    <PageHero kicker="HELLO" title="关于我" description={siteConfig.about.heroDescription} icon={UserCircle} variant="about" />
    <section className="about-layout material-panel page-width">
      <aside className="about-profile">
        <div className="about-portrait">{authorProfile.avatar ? <img src={authorProfile.avatar} alt={authorProfile.avatarAlt} loading="lazy" decoding="async" /> : <span className="about-portrait-placeholder" role="img" aria-label={authorProfile.avatarAlt}><UserCircle size={112} weight="duotone" /></span>}</div>
        <div className="about-profile-copy">
          <span className="eyebrow">ABOUT ME</span>
          <h2>{authorProfile.name}</h2>
          <p>{authorProfile.tagline}</p>
          {authorProfile.interests.length > 0 && <div className="about-interest-list" aria-label="兴趣">{authorProfile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}
          {github.url && <a className="about-github" href={github.url} target="_blank" rel="noreferrer" aria-label={`访问 ${authorProfile.name} 的 GitHub 主页`}><GithubLogo size={24} weight="duotone" /><span><small>FIND ME ON GITHUB</small><strong>{github.label || github.url}</strong></span><ArrowRight size={16} /></a>}
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
