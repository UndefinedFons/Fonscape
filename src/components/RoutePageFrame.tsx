import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

function LoadingPlaceholder({ onShown }: { onShown: () => (() => void) | void }) {
  useEffect(onShown, [onShown]);
  return <div className="route-loading-content" role="status" aria-label="正在加载内容">
    <div className="dialog-skeleton-content" aria-hidden="true">
      <span className="dialog-skeleton-line dialog-skeleton-line--title" />
      <span className="dialog-skeleton-line dialog-skeleton-line--wide" />
      <span className="dialog-skeleton-line dialog-skeleton-line--medium" />
      <span className="dialog-skeleton-block" />
    </div>
  </div>;
}

function ContentReady({ onReady }: { onReady: () => void }) {
  useLayoutEffect(onReady, [onReady]);
  return null;
}

interface LoadingSurfaceProps {
  as: "main" | "article" | "section";
  className?: string;
  before?: ReactNode;
  children: ReactNode;
}

/** The surface owns both pending and loaded content; only its contents transition. */
export function LoadingSurface({ as: Container, className, before, children }: LoadingSurfaceProps) {
  const surface = useRef<HTMLElement>(null);
  const pendingHeight = useRef<number | null>(null);
  const animations = useRef<Animation[]>([]);
  const cancelAnimations = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);
  useLayoutEffect(() => cancelAnimations, [cancelAnimations]);
  const onShown = useCallback(() => {
    cancelAnimations();
    const node = surface.current;
    if (!node) return;
    const measure = () => { pendingHeight.current = node.getBoundingClientRect().height; };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [cancelAnimations]);
  const onReady = useCallback(() => {
    const node = surface.current;
    const fromHeight = pendingHeight.current;
    pendingHeight.current = null;
    if (!node || fromHeight === null || typeof node.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimations();
    const options = { duration: 240, easing: "ease-out" };
    const toHeight = node.getBoundingClientRect().height;
    if (fromHeight > 0 && toHeight > 0 && fromHeight !== toHeight) {
      animations.current.push(node.animate([{ height: `${fromHeight}px`, overflow: "clip" }, { height: `${toHeight}px`, overflow: "clip" }], options));
    }
    for (const child of node.children) {
      if (!child.hasAttribute("data-loading-persistent")) {
        animations.current.push(child.animate([{ opacity: 0 }, { opacity: 1 }], options));
      }
    }
  }, [cancelAnimations]);
  return <Container ref={surface} className={className}>{before}
    <Suspense fallback={<LoadingPlaceholder onShown={onShown} />}><ContentReady onReady={onReady} />{children}</Suspense>
  </Container>;
}

interface DetailPageFrameProps {
  kind: "post" | "poem" | "music";
  onReturn: () => void;
  children: ReactNode;
  afterContent?: ReactNode;
}

export function DetailPageFrame({ kind, onReturn, children, afterContent }: DetailPageFrameProps) {
  const back = <button className="back-button" data-loading-persistent onClick={onReturn}><ArrowLeft size={17} />返回</button>;
  if (kind === "poem") return <main className="poem-page page-width">{back}
    <LoadingSurface as="article">{children}</LoadingSurface>
    <Suspense fallback={null}>{afterContent}</Suspense>
  </main>;
  const className = `article-page${kind === "music" ? " music-detail-page" : ""} material-panel page-width`;
  return <LoadingSurface as="main" className={className} before={back}>{children}</LoadingSurface>;
}

export function AdminSetupFrame({ children }: { children: ReactNode }) {
  return <main className="admin-setup-page"><LoadingSurface as="section" className="admin-setup-panel material-panel">{children}</LoadingSurface></main>;
}
