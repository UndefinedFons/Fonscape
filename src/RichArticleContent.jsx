import { useMemo, useState } from "react";
import { Check } from "@phosphor-icons/react/Check";
import { CopySimple } from "@phosphor-icons/react/CopySimple";
import { Quotes } from "@phosphor-icons/react/Quotes";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { detailImageSizes } from "./responsiveImages.ts";
import { getPostMarkdown, getPostOutline } from "./richContent.js";
import { ZoomableImage } from "./ZoomableImage.jsx";

const languageNames = {
  bash: "Terminal — bash",
  shell: "Terminal — shell",
  sh: "Terminal — sh",
  zsh: "Terminal — zsh",
  console: "Terminal",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "React JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "React TSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  python: "Python",
  py: "Python",
  markdown: "Markdown",
  md: "Markdown",
};

function CodeWindow({ children }) {
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || "";
  const language = className.match(/language-([\w-]+)/)?.[1] || "text";
  const code = String(codeElement?.props?.children ?? "").replace(/\n$/, "");
  const [copied, setCopied] = useState(false);
  const terminal = ["bash", "shell", "sh", "zsh", "console"].includes(language);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return <section className={terminal ? "code-window code-window--terminal" : "code-window"} aria-label={`${languageNames[language] || language} 代码块`}>
    <header className="code-window-bar">
      <span className="code-window-lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="code-window-title">{languageNames[language] || language.toUpperCase()}</span>
      <button type="button" onClick={copyCode} aria-label="复制代码">{copied ? <Check size={15} weight="bold" /> : <CopySimple size={15} />}<span>{copied ? "已复制" : "复制"}</span></button>
    </header>
    <div className="code-window-body">
      <Highlight theme={themes.vsDark} code={code} language={language === "text" ? "markup" : language}>
        {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => <code className={highlightClass} style={style}>
          {tokens.map((line, lineIndex) => {
            const lineProps = getLineProps({ line });
            return <span {...lineProps} className={`code-line ${lineProps.className || ""}`} key={lineIndex}>
              {tokens.length > 1 && <span className="code-line-number" aria-hidden="true">{lineIndex + 1}</span>}
              <span className="code-line-copy">{line.map((token, tokenIndex) => <span {...getTokenProps({ token })} key={tokenIndex} />)}</span>
            </span>;
          })}
        </code>}
      </Highlight>
    </div>
  </section>;
}

function RichImage({ src, alt = "", title }) {
  return <ZoomableImage src={src} alt={alt} caption={title} sizes={detailImageSizes} triggerClassName="article-inline-image" />;
}

const components = {
  pre: CodeWindow,
  code: ({ className, children }) => <code className={className}>{children}</code>,
  img: RichImage,
  table: ({ children }) => <div className="article-table-wrap" tabIndex="0"><table>{children}</table></div>,
  blockquote: ({ children }) => <blockquote><Quotes size={23} weight="duotone" aria-hidden="true" /><div>{children}</div></blockquote>,
  a: ({ href, children }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined}>{children}</a>,
};

export function RichArticleContent({ post, inlineMusicPlayer = null, inlineMusicPlayers = {} }) {
  const markdown = getPostMarkdown(post);
  const outline = useMemo(() => getPostOutline(post), [post]);
  const headings = useMemo(() => outline.filter((item) => !item.prologue), [outline]);
  const articleComponents = useMemo(() => ({
    ...components,
    h2: ({ children, node }) => {
      const heading = headings.find((item) => item.line === node?.position?.start?.line) || headings[0] || { id: "article-section-1", number: "01" };
      return <h2 id={heading.id}><span className="article-section-number">{heading.number}</span><span>{children}</span></h2>;
    },
    p: ({ children }) => {
      const marker = Array.isArray(children) ? children.join("") : children;
      if (typeof marker === "string" && marker.trim() === "[[article-music]]") return inlineMusicPlayer;
      const musicMarker = typeof marker === "string" ? /^\[\[article-music:([a-zA-Z0-9-]+)\]\]$/u.exec(marker.trim()) : null;
      if (musicMarker) return inlineMusicPlayers[musicMarker[1]] || null;
      return <p>{children}</p>;
    },
  }), [headings, inlineMusicPlayer, inlineMusicPlayers]);
  return <div className={`article-body rich-article${headings.length > 1 ? " has-outline" : ""}`}>
    <div className="article-prose">{outline[0]?.prologue && <span id="article-prologue" className="article-prologue-anchor" aria-hidden="true" />}<ReactMarkdown remarkPlugins={[remarkGfm]} components={articleComponents}>{markdown}</ReactMarkdown></div>
  </div>;
}
