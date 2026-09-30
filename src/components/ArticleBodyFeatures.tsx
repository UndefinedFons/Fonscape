import { Children, cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { Info } from "@phosphor-icons/react/Info";
import { Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { Quotes } from "@phosphor-icons/react/Quotes";
import { ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { WarningOctagon } from "@phosphor-icons/react/WarningOctagon";
import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { Mermaid, RenderResult } from "mermaid";
import { parseAlertMarker, stripAlertMarker } from "../content/richFeatures.ts";
import { sanitizeMermaidSvg } from "../content/mermaidSvg.ts";

type AlertType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const ALERT_ICONS: Record<AlertType, PhosphorIcon> = {
  NOTE: Info,
  TIP: Lightbulb,
  IMPORTANT: ShieldWarning,
  WARNING: WarningOctagon,
  CAUTION: WarningCircle,
};
const MAX_MERMAID_SOURCE_LENGTH = 12000;
interface MarkdownNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: MarkdownNode[];
}
let mermaidModulePromise: Promise<Mermaid> | undefined;
let mermaidRenderQueue: Promise<unknown> = Promise.resolve();

function getFirstBlockquoteText(node: MarkdownNode | null | undefined): string {
  const firstParagraph = node?.children?.find((child) => child?.type === "element" && child?.tagName === "p");
  if (!Array.isArray(firstParagraph?.children)) return "";
  return firstParagraph.children.map((child) => child?.type === "text" ? child.value : "").join("");
}

export function getArticleAlert(node: unknown) {
  return parseAlertMarker(getFirstBlockquoteText(node as MarkdownNode | null | undefined));
}

function removeAlertFromChildren(children: ReactNode): ReactNode[] {
  const items = Children.toArray(children);
  const firstIndex = items.findIndex((item) => isValidElement(item));
  const first = firstIndex >= 0 ? items[firstIndex] : null;
  if (!isValidElement<{ children?: ReactNode }>(first)) return items;
  const firstChildren = Children.toArray(first.props.children);
  let markerRemoved = false;
  const nextChildren = firstChildren.flatMap((child) => {
    if (typeof child !== "string" || markerRemoved) return [child];
    const next = stripAlertMarker(child);
    markerRemoved = next !== child;
    return next ? [next] : [];
  });
  if (!markerRemoved) return items;
  const nextFirst = cloneElement<{ children?: ReactNode }>(first, {}, nextChildren);
  return items.map((item, index) => index === firstIndex ? nextFirst : item);
}

export function ArticleBlockquote({ children, node }: { children?: ReactNode; node?: unknown }) {
  const alert = getArticleAlert(node);
  if (!alert) {
    return <blockquote className="article-callout article-quote"><header><Quotes size={20} weight="duotone" aria-hidden="true" /></header><div>{children}</div></blockquote>;
  }
  const Icon = ALERT_ICONS[alert.type] || Info;
  const body = removeAlertFromChildren(children);
  return <blockquote className={`article-callout article-callout--${alert.className}`} aria-label={alert.label}>
    <header><Icon size={20} weight="duotone" aria-hidden="true" /><strong>{alert.label}</strong></header>
    <div>{body}</div>
  </blockquote>;
}

function loadMermaid(): Promise<Mermaid> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => module.default || module);
    mermaidModulePromise = mermaidModulePromise.catch((error) => {
      mermaidModulePromise = undefined;
      throw error;
    });
  }
  return mermaidModulePromise;
}

function readThemeColor(name: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getMermaidThemeVariables() {
  const accent = readThemeColor("--accent", "#ad467c");
  const surfaceSoft = readThemeColor("--surface-soft", "#f7eaf4");
  const text = readThemeColor("--text", "#50335f");
  const muted = readThemeColor("--muted", "#745f80");
  const line = readThemeColor("--line", "#dfc9dd");
  return {
    background: surfaceSoft,
    primaryColor: surfaceSoft,
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: surfaceSoft,
    secondaryTextColor: text,
    secondaryBorderColor: line,
    tertiaryColor: surfaceSoft,
    tertiaryTextColor: muted,
    tertiaryBorderColor: line,
    lineColor: accent,
    arrowheadColor: accent,
    textColor: text,
    nodeBkg: surfaceSoft,
    mainBkg: surfaceSoft,
    nodeBorder: line,
    clusterBkg: surfaceSoft,
    clusterBorder: line,
    defaultLinkColor: accent,
    titleColor: text,
    edgeLabelBackground: surfaceSoft,
    nodeTextColor: text,
    noteBkgColor: surfaceSoft,
    noteTextColor: text,
    noteBorderColor: line,
    actorBorder: accent,
    actorBkg: surfaceSoft,
    actorTextColor: text,
    actorLineColor: line,
    signalColor: accent,
    signalTextColor: text,
    labelBoxBkgColor: surfaceSoft,
    labelBoxBorderColor: line,
    labelTextColor: text,
    loopTextColor: text,
    activationBorderColor: line,
    activationBkgColor: surfaceSoft,
    sequenceNumberColor: accent,
    rectBkgColor: surfaceSoft,
    sectionBkgColor: surfaceSoft,
    altSectionBkgColor: surfaceSoft,
    gridColor: line,
    fontFamily: '"Noto Sans SC", sans-serif',
    radius: 8,
    strokeWidth: 1.2,
  };
}

function currentDocumentTheme(): "dark" | "light" {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function useDocumentTheme(): "dark" | "light" {
  const [theme, setTheme] = useState(currentDocumentTheme);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(currentDocumentTheme());
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function renderMermaid(mermaid: Mermaid, id: string, source: string, themeVariables: ReturnType<typeof getMermaidThemeVariables>): Promise<RenderResult> {
  const task = mermaidRenderQueue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
      maxEdges: 1000,
      htmlLabels: false,
      theme: "base",
      themeVariables,
      flowchart: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
    });
    return mermaid.render(id, source);
  });
  mermaidRenderQueue = task.catch(() => undefined);
  return task;
}

/**
 * Mermaid is intentionally loaded only from a real mermaid fenced block.
 * Mermaid's strict security mode and a final SVG scrub keep source labels from
 * becoming executable markup when repository content is changed.
 *
 */
export function MermaidDiagram({ source }: { source: string }) {
  const theme = useDocumentTheme();
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/gu, "");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; svg: string }>({ status: "loading", svg: "" });
  useEffect(() => {
    let active = true;
    const render = async () => {
      if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
        if (active) setState({ status: "error", svg: "" });
        return;
      }
      try {
        const mermaid = await loadMermaid();
        const result = await renderMermaid(mermaid, `fonscape-mermaid-${generatedId}`, source, getMermaidThemeVariables());
        const svg = sanitizeMermaidSvg(result?.svg);
        if (!svg) throw new Error("Mermaid SVG 无效。");
        if (active) setState({ status: "ready", svg });
      } catch {
        if (active) setState({ status: "error", svg: "" });
      }
    };
    setState((current) => current.status === "ready" ? current : { status: "loading", svg: "" });
    render();
    return () => { active = false; };
  }, [generatedId, source, theme]);

  if (state.status === "ready") {
    return <div className="mermaid-diagram mermaid-diagram--ready" role="img" aria-label="Mermaid 图表" tabIndex={0} dangerouslySetInnerHTML={{ __html: state.svg }} />;
  }
  return <figure className={`mermaid-diagram mermaid-diagram--${state.status}`}>
    <pre className="mermaid-source"><code>{source}</code></pre>
    <figcaption>{state.status === "loading" ? "正在绘制图表…" : "图表渲染失败，已显示源代码。"}</figcaption>
  </figure>;
}
