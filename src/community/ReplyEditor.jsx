import { useEffect, useLayoutEffect, useRef } from "react";

export function ReplyEditor({ closing, immediateOpen, onClosed, children }) {
  const editor = useRef(null);
  const content = useRef(null);
  const height = useRef(0);
  const closeCompleted = useRef(false);
  const onClosedRef = useRef(onClosed);

  useEffect(() => { onClosedRef.current = onClosed; }, [onClosed]);
  useLayoutEffect(() => {
    const editorNode = editor.current;
    const contentNode = content.current;
    if (!editorNode || !contentNode) return undefined;
    height.current = Math.ceil(contentNode.getBoundingClientRect().height) + 2;
    editorNode.style.setProperty("--reply-editor-height", `${height.current}px`);
    editorNode.getBoundingClientRect();
    if (immediateOpen) editorNode.classList.add("is-open");
    const openFrame = window.requestAnimationFrame(() => editorNode.classList.add("is-open", "is-revealed"));
    return () => {
      window.cancelAnimationFrame(openFrame);
    };
  }, [immediateOpen]);
  useLayoutEffect(() => {
    const editorNode = editor.current;
    if (!editorNode || !closing) return undefined;
    closeCompleted.current = false;
    editorNode.classList.remove("is-open", "is-revealed");
    const finish = () => {
      if (closeCompleted.current) return;
      closeCompleted.current = true;
      onClosedRef.current();
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transitionStyle = window.getComputedStyle(editorNode);
    const toMilliseconds = (value) => value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
    const durations = transitionStyle.transitionDuration.split(",").map((value) => toMilliseconds(value.trim()));
    const delays = transitionStyle.transitionDelay.split(",").map((value) => toMilliseconds(value.trim()));
    const transitionTime = durations.reduce((longest, duration, index) => Math.max(longest, duration + (delays[index] ?? delays.at(-1) ?? 0)), 0);
    const fallback = window.setTimeout(finish, reducedMotion ? 0 : Math.ceil(transitionTime) + 80);
    return () => window.clearTimeout(fallback);
  }, [closing]);
  const finishTransition = (event) => {
    if (!closing || event.target !== editor.current || event.propertyName !== "height" || closeCompleted.current) return;
    closeCompleted.current = true;
    onClosedRef.current();
  };
  return <div ref={editor} className={`comment-reply-editor${closing ? " is-closing" : ""}`} aria-hidden={closing} onTransitionEnd={finishTransition}><div ref={content}>{children}</div></div>;
}
