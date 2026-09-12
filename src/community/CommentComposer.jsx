import { memo, useCallback, useEffect, useRef, useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { X } from "@phosphor-icons/react/X";
import { Avatar } from "./Avatar.jsx";
import { api } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";

/**
 * @param {{
 *   targetType: string,
 *   slug: string,
 *   parent?: import("../types.js").PublicComment | null,
 *   onCancel?: (() => void) | null,
 *   onCreated: (comment: import("../types.js").PublicComment) => void,
 * }} props
 */
export function CommentComposer({ targetType, slug, parent, onCancel, onCreated }) {
  const { viewer, openAccount } = useCommunity();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scrollbar, setScrollbar] = useState(/** @type {{ visible: boolean, size: number, top: number }} */ ({ visible: false, size: 100, top: 0 }));
  const composerField = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const scrollbarDrag = useRef(/** @type {{ pointerId: number, trackTop: number, range: number, pointerOffset: number } | null} */ (null));
  const pendingSubmission = useRef(/** @type {{ fingerprint: string, id: string } | null} */ (null));
  const refreshScrollbar = useCallback((/** @type {HTMLTextAreaElement | null} */ element = composerField.current) => {
    if (!element) return;
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    const visible = maxScroll > 1;
    const size = visible ? Math.max(18, Math.min(100, (element.clientHeight / element.scrollHeight) * 100)) : 100;
    const progress = visible ? element.scrollTop / maxScroll : 0;
    const top = progress * (100 - size);
    setScrollbar((current) => (
      current.visible === visible && Math.abs(current.size - size) < 0.1 && Math.abs(current.top - top) < 0.1
        ? current
        : { visible, size, top }
    ));
  }, []);
  /** @param {HTMLTextAreaElement | null} element @param {boolean} [reset] */
  const resizeComposer = (element, reset = false) => {
    if (!element) return;
    if (reset) {
      element.style.height = "";
      element.style.overflowY = "hidden";
      refreshScrollbar(element);
      return;
    }
    if (element.closest(".comment-composer--reply")) {
      element.style.overflowY = "auto";
      refreshScrollbar(element);
      return;
    }
    const currentHeight = element.getBoundingClientRect().height;
    const maxHeight = Number.parseFloat(getComputedStyle(element).maxHeight) || Number.POSITIVE_INFINITY;
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    // Keep the document height stable while typing. The composer grows when
    // needed, but never collapses on each deletion; once capped, it scrolls
    // internally instead of moving the mobile viewport.
    if (nextHeight > currentHeight + 0.5) element.style.height = `${Math.ceil(nextHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight + 0.5 ? "auto" : "hidden";
    refreshScrollbar(element);
  };
  useEffect(() => {
    const refresh = () => refreshScrollbar();
    window.addEventListener("resize", refresh, { passive: true });
    return () => window.removeEventListener("resize", refresh);
  }, [refreshScrollbar]);
  /** @param {import("react").WheelEvent<HTMLTextAreaElement>} event */
  const containFocusedWheel = (event) => {
    const element = event.currentTarget;
    if (document.activeElement !== element) return;
    const maxScroll = element.scrollHeight - element.clientHeight;
    const atStart = element.scrollTop <= 0;
    const atEnd = element.scrollTop >= maxScroll - 1;
    if (maxScroll <= 1 || (event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) event.preventDefault();
  };
  /** @param {import("react").TouchEvent<HTMLTextAreaElement>} event */
  const containFocusedTouch = (event) => {
    const element = event.currentTarget;
    if (document.activeElement === element && element.scrollHeight <= element.clientHeight + 1) event.preventDefault();
  };
  /** @param {number} clientY */
  const moveScrollbar = (clientY) => {
    const drag = scrollbarDrag.current;
    const element = composerField.current;
    if (!drag || !element) return;
    const thumbTop = Math.max(0, Math.min(drag.range, clientY - drag.trackTop - drag.pointerOffset));
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = drag.range > 0 ? (thumbTop / drag.range) * maxScroll : 0;
    refreshScrollbar(element);
  };
  /** @param {import("react").PointerEvent<HTMLSpanElement>} event */
  const startScrollbarDrag = (event) => {
    const field = composerField.current;
    if (!scrollbar.visible || !field) return;
    event.preventDefault();
    const track = event.currentTarget;
    const thumb = /** @type {Element} */ (track.firstElementChild);
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const onThumb = event.target === thumb;
    scrollbarDrag.current = {
      pointerId: event.pointerId,
      trackTop: trackRect.top,
      range: Math.max(0, trackRect.height - thumbRect.height),
      pointerOffset: onThumb ? event.clientY - thumbRect.top : thumbRect.height / 2,
    };
    track.setPointerCapture(event.pointerId);
    field.focus({ preventScroll: true });
    if (!onThumb) moveScrollbar(event.clientY);
  };
  /** @param {import("react").PointerEvent<HTMLSpanElement>} event */
  const continueScrollbarDrag = (event) => {
    if (scrollbarDrag.current?.pointerId === event.pointerId) moveScrollbar(event.clientY);
  };
  /** @param {import("react").PointerEvent<HTMLSpanElement>} event */
  const finishScrollbarDrag = (event) => {
    if (scrollbarDrag.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    scrollbarDrag.current = null;
  };
  if (!viewer) return <div className="comment-login-prompt"><div><strong>登录后参与讨论</strong><p>使用你的昵称与头像发表评论或回复。</p></div><button type="button" onClick={() => openAccount("login")}>登录并评论</button></div>;
  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const normalizedBody = body.trim();
      const fingerprint = JSON.stringify([targetType, slug, parent?.id || null, normalizedBody]);
      if (pendingSubmission.current?.fingerprint !== fingerprint) {
        pendingSubmission.current = { fingerprint, id: crypto.randomUUID() };
      }
      const clientMutationId = pendingSubmission.current.id;
      const result = /** @type {import("../types.d.ts").CreateCommentResponse} */ (
        await api("/comments", {
          method: "POST",
          body: {
            type: targetType,
            slug,
            body,
            parentId: parent?.id || null,
            clientMutationId,
          },
        })
      );
      pendingSubmission.current = null;
      setBody("");
      requestAnimationFrame(() => resizeComposer(composerField.current, true));
      // The comment is already persisted once POST succeeds. Follow-up page
      // loading and locating are best-effort so they cannot turn that success
      // into a composer error.
      void Promise.resolve().then(() => onCreated(result.comment)).catch(() => {});
    } catch (/** @type {any} */ caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };
  return <form className={`comment-composer${parent ? " comment-composer--reply" : ""}`} onSubmit={submit}><div className="comment-composer-head"><Avatar user={viewer} size="small" /><span>{parent ? `回复 ${parent.author.nickname}` : `以 ${viewer.nickname} 的身份评论`}</span>{onCancel && <button type="button" aria-label="取消回复" onClick={onCancel}><X size={16} /></button>}</div><div className="comment-textarea-shell"><textarea ref={composerField} value={body} onChange={(event) => { setBody(event.target.value); resizeComposer(event.currentTarget); }} onFocus={(event) => requestAnimationFrame(() => refreshScrollbar(event.target))} onBlur={() => setScrollbar((current) => ({ ...current, visible: false }))} onScroll={(event) => refreshScrollbar(event.currentTarget)} onWheel={containFocusedWheel} onTouchMove={containFocusedTouch} maxLength={500} rows={parent ? 2 : 3} placeholder={parent ? "写下回复…" : "在这里留下你的想法…"} required /><span className={`comment-textarea-scrollbar${scrollbar.visible ? " is-visible" : ""}`} style={/** @type {import("react").CSSProperties} */ ({ "--comment-thumb-size": `${scrollbar.size}%`, "--comment-thumb-top": `${scrollbar.top}%` })} onPointerDown={startScrollbarDrag} onPointerMove={continueScrollbarDrag} onPointerUp={finishScrollbarDrag} onPointerCancel={finishScrollbarDrag} aria-hidden="true"><i /></span></div><div className="comment-composer-foot"><span>{body.length} / 500</span>{error && <p role="alert">{error}</p>}<button className="community-primary-button" type="submit" disabled={busy || !body.trim()}>{busy ? "发送中…" : "发表"}<PaperPlaneTilt size={16} /></button></div></form>;
}

export const StableCommentComposer = memo(CommentComposer);
