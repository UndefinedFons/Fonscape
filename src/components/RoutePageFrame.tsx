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
  const stopHeight = useRef<(() => void) | null>(null);
  const cancelAnimations = useCallback(() => {
    stopHeight.current?.();
    stopHeight.current = null;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);
  useLayoutEffect(() => cancelAnimations, [cancelAnimations]);
  const onShown = useCallback(() => {
    cancelAnimations();
    const node = surface.current;
    if (!node) return;
    const measure = () => { pendingHeight.current = node.offsetHeight; };
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
    const options = { duration: 360, easing: "cubic-bezier(.16, 1, .3, 1)" };
    const toHeight = node.offsetHeight;
    if (fromHeight > 0 && toHeight > 0 && fromHeight !== toHeight) {
      const previousHeight = node.style.getPropertyValue("height");
      const previousPriority = node.style.getPropertyPriority("height");
      const previousOverflow = node.style.getPropertyValue("overflow");
      const overflowPriority = node.style.getPropertyPriority("overflow");
      let height = fromHeight;
      let velocity = 0;
      let lastTime = performance.now();
      let frame: number;
      const restore = () => {
        if (previousHeight) node.style.setProperty("height", previousHeight, previousPriority);
        else node.style.removeProperty("height");
        if (previousOverflow) node.style.setProperty("overflow", previousOverflow, overflowPriority);
        else node.style.removeProperty("overflow");
      };
      // A critically damped spring preserves velocity when fonts, comments or
      // images resize the content. It never restarts an easing curve mid-flight.
      const advance = (time: number) => {
        node.style.setProperty("height", "auto", "important");
        const target = node.offsetHeight;
        const seconds = Math.max(0, (time - lastTime) / 1000);
        lastTime = time;
        const stiffness = 24;
        const displacement = height - target;
        const coefficient = velocity + stiffness * displacement;
        const decay = Math.exp(-stiffness * seconds);
        height = target + (displacement + coefficient * seconds) * decay;
        velocity = (velocity - stiffness * coefficient * seconds) * decay;
        if (Math.abs(height - target) < 0.5 && Math.abs(velocity) < 5) {
          restore();
          stopHeight.current = null;
          return;
        }
        node.style.setProperty("height", `${height}px`);
        frame = requestAnimationFrame(advance);
      };
      node.style.setProperty("overflow", "clip");
      node.style.setProperty("height", `${height}px`);
      frame = requestAnimationFrame(advance);
      stopHeight.current = () => { cancelAnimationFrame(frame); restore(); };
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
