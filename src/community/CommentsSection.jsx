import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Check } from "@phosphor-icons/react/Check";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { CopySimple } from "@phosphor-icons/react/CopySimple";
import { Trash } from "@phosphor-icons/react/Trash";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import { Avatar } from "./Avatar.jsx";
import { api, formatCommunityTime } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";
import { friendEntryJson, parseFriendApplication } from "./friendApplication.js";
import { Pagination } from "../components/Pagination.jsx";

function readCommentTarget() {
  return new URLSearchParams(window.location.hash.split("?")[1] || "").get("comment") || "";
}

function consumeCommentTarget() {
  const rawHash = window.location.hash.slice(1);
  const separator = rawHash.indexOf("?");
  if (separator < 0) return;
  const hashPath = rawHash.slice(0, separator);
  const query = new URLSearchParams(rawHash.slice(separator + 1));
  if (!query.has("comment")) return;
  query.delete("comment");
  const nextHash = `${hashPath}${query.size ? `?${query.toString()}` : ""}`;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${nextHash}`);
}

function CommentComposer({ targetType, slug, parent, onCancel, onCreated }) {
  const { viewer, openAccount } = useCommunity();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scrollbar, setScrollbar] = useState({ visible: false, size: 100, top: 0 });
  const composerField = useRef(null);
  const scrollbarDrag = useRef(null);
  const pendingSubmission = useRef(null);
  const refreshScrollbar = useCallback((element = composerField.current) => {
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
  const containFocusedWheel = (event) => {
    const element = event.currentTarget;
    if (document.activeElement !== element) return;
    const maxScroll = element.scrollHeight - element.clientHeight;
    const atStart = element.scrollTop <= 0;
    const atEnd = element.scrollTop >= maxScroll - 1;
    if (maxScroll <= 1 || (event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) event.preventDefault();
  };
  const containFocusedTouch = (event) => {
    const element = event.currentTarget;
    if (document.activeElement === element && element.scrollHeight <= element.clientHeight + 1) event.preventDefault();
  };
  const moveScrollbar = (clientY) => {
    const drag = scrollbarDrag.current;
    const element = composerField.current;
    if (!drag || !element) return;
    const thumbTop = Math.max(0, Math.min(drag.range, clientY - drag.trackTop - drag.pointerOffset));
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = drag.range > 0 ? (thumbTop / drag.range) * maxScroll : 0;
    refreshScrollbar(element);
  };
  const startScrollbarDrag = (event) => {
    if (!scrollbar.visible || !composerField.current) return;
    event.preventDefault();
    const track = event.currentTarget;
    const thumb = track.firstElementChild;
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
    composerField.current.focus({ preventScroll: true });
    if (!onThumb) moveScrollbar(event.clientY);
  };
  const continueScrollbarDrag = (event) => {
    if (scrollbarDrag.current?.pointerId === event.pointerId) moveScrollbar(event.clientY);
  };
  const finishScrollbarDrag = (event) => {
    if (scrollbarDrag.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    scrollbarDrag.current = null;
  };
  if (!viewer) return <div className="comment-login-prompt"><div><strong>登录后参与讨论</strong><p>使用你的昵称与头像发表评论或回复。</p></div><button type="button" onClick={() => openAccount("login")}>登录并评论</button></div>;
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
      const result = await api("/comments", {
        method: "POST",
        body: {
          type: targetType,
          slug,
          body,
          parentId: parent?.id || null,
          clientMutationId: pendingSubmission.current.id,
        },
      });
      pendingSubmission.current = null;
      setBody("");
      requestAnimationFrame(() => resizeComposer(composerField.current, true));
      onCreated(result.comment);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };
  return <form className={`comment-composer${parent ? " comment-composer--reply" : ""}`} onSubmit={submit}><div className="comment-composer-head"><Avatar user={viewer} size="small" /><span>{parent ? `回复 ${parent.author.nickname}` : `以 ${viewer.nickname} 的身份评论`}</span>{onCancel && <button type="button" aria-label="取消回复" onClick={onCancel}><X size={16} /></button>}</div><div className="comment-textarea-shell"><textarea ref={composerField} value={body} onChange={(event) => { setBody(event.target.value); resizeComposer(event.currentTarget); }} onFocus={(event) => requestAnimationFrame(() => refreshScrollbar(event.target))} onBlur={() => setScrollbar((current) => ({ ...current, visible: false }))} onScroll={(event) => refreshScrollbar(event.currentTarget)} onWheel={containFocusedWheel} onTouchMove={containFocusedTouch} maxLength="500" rows={parent ? 2 : 3} placeholder={parent ? "写下回复…" : "在这里留下你的想法…"} required /><span className={`comment-textarea-scrollbar${scrollbar.visible ? " is-visible" : ""}`} style={{ "--comment-thumb-size": `${scrollbar.size}%`, "--comment-thumb-top": `${scrollbar.top}%` }} onPointerDown={startScrollbarDrag} onPointerMove={continueScrollbarDrag} onPointerUp={finishScrollbarDrag} onPointerCancel={finishScrollbarDrag} aria-hidden="true"><i /></span></div><div className="comment-composer-foot"><span>{body.length} / 500</span>{error && <p role="alert">{error}</p>}<button className="community-primary-button" type="submit" disabled={busy || !body.trim()}>{busy ? "发送中…" : "发表"}<PaperPlaneTilt size={16} /></button></div></form>;
}

const StableCommentComposer = memo(CommentComposer);

function ReplyEditor({ closing, immediateOpen, onClosed, children }) {
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

function CommentItemImpl({ comment, replies, targetType, slug, onRefresh, locatedCommentId, activeReplyId, closingReplyId, replySwitchInProgress, onReplyOpen, onReplyClose, onReplyClosed, friendApplicationEnabled = false, compact = false }) {
  const { viewer, openAccount } = useCommunity();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [copyState, setCopyState] = useState("");
  const friendApplication = useMemo(
    () => friendApplicationEnabled ? parseFriendApplication(comment.body) : null,
    [comment.body, friendApplicationEnabled],
  );
  const targetedReply = useRef(readCommentTarget()).current;
  const [repliesExpanded, setRepliesExpanded] = useState(() => replies.some((reply) => reply.id === targetedReply));
  const replying = activeReplyId === comment.id || closingReplyId === comment.id;
  const replyClosing = closingReplyId === comment.id;
  useEffect(() => {
    const revealTarget = (event) => {
      if (replies.some((reply) => reply.id === event.detail?.id)) setRepliesExpanded(true);
    };
    window.addEventListener("fonscape:locate-comment", revealTarget);
    return () => window.removeEventListener("fonscape:locate-comment", revealTarget);
  }, [replies]);
  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api(`/comments/${comment.id}`, { method: "DELETE" });
      onRefresh();
    } catch (error) { setMessage(error.message); }
  };
  const toggleReply = () => {
    if (!viewer) { openAccount("login"); return; }
    if (replying) onReplyClose(comment.id);
    else onReplyOpen(comment.id);
  };
  const copyFriendEntry = async () => {
    try {
      await navigator.clipboard.writeText(friendEntryJson(friendApplication, comment.author));
      setCopyState("已复制友链 JSON");
    } catch {
      setCopyState("复制失败，请重试");
    }
    window.setTimeout(() => setCopyState(""), 1800);
  };
  const childProps = { targetType, slug, onRefresh, locatedCommentId, activeReplyId, closingReplyId, replySwitchInProgress, onReplyOpen, onReplyClose, onReplyClosed, friendApplicationEnabled };
  const canCopyFriendEntry = viewer?.role === "admin" && friendApplication?.valid;
  return <li className={`comment-thread${compact ? " comment-thread--compact" : ""}`}><article id={`comment-${comment.id}`} tabIndex="-1" className={`comment-item${compact ? " comment-item--compact" : ""}${comment.id === locatedCommentId ? " is-located-comment" : ""}`}><Avatar user={comment.author} size="medium" /><div className="comment-main"><header><strong>{comment.author.nickname}</strong>{comment.author.role === "admin" && <span className="author-badge"><Check size={11} weight="bold" />博主</span>}<time>{formatCommunityTime(comment.createdAt)}</time>{comment.editedAt && <small>已编辑</small>}</header>{comment.replyTo && <span className="comment-reply-to">回复 @{comment.replyTo}</span>}<p className="comment-body">{comment.body}</p><div className="comment-actions"><button type="button" onClick={toggleReply} aria-expanded={activeReplyId === comment.id && !replyClosing}><ArrowBendUpLeft size={14} />回复</button>{comment.canDelete && <button type="button" className={confirmDelete ? "is-danger" : ""} onClick={remove} onBlur={() => setConfirmDelete(false)}><Trash size={14} />{confirmDelete ? "再次点击确认" : "删除"}</button>}{canCopyFriendEntry && <button type="button" onClick={copyFriendEntry} className={copyState === "复制失败，请重试" ? "is-danger" : ""} aria-label={copyState || "复制友链 JSON"} aria-live="polite"><CopySimple size={14} />{copyState || "复制友链 JSON"}</button>}</div>{message && <p className="comment-action-message" role="status">{message}</p>}{replying && <ReplyEditor closing={replyClosing} immediateOpen={replySwitchInProgress && !replyClosing} onClosed={() => onReplyClosed(comment.id)}><StableCommentComposer targetType={targetType} slug={slug} parent={comment} onCancel={() => onReplyClose(comment.id)} onCreated={(created) => { onReplyClose(comment.id); onRefresh(created); }} /></ReplyEditor>}</div></article>{replies.length > 0 && <div className="comment-replies-wrap"><ul className="comment-replies"><CommentItem comment={replies[0]} replies={[]} {...childProps} compact /></ul>{replies.length > 1 && <><div className={`comment-replies-extra${repliesExpanded ? " is-open" : ""}`} aria-hidden={!repliesExpanded} inert={repliesExpanded ? undefined : ""}><div><ul className="comment-replies">{replies.slice(1).map((reply) => <CommentItem key={reply.id} comment={reply} replies={[]} {...childProps} compact />)}</ul></div></div><button type="button" className="comment-replies-toggle" aria-expanded={repliesExpanded} onClick={() => setRepliesExpanded((value) => !value)}>{repliesExpanded ? <><CaretUp size={14} />收起回复</> : <><CaretDown size={14} />展开其余 {replies.length - 1} 条回复</>}</button></>}</div>}</li>;
}

function threadContainsId(props, id) {
  return Boolean(id && (props.comment.id === id || props.replies.some((reply) => reply.id === id)));
}

function commentItemPropsEqual(previous, next) {
  if (
    previous.comment !== next.comment
    || previous.replies !== next.replies
    || previous.targetType !== next.targetType
    || previous.slug !== next.slug
    || previous.onRefresh !== next.onRefresh
    || previous.onReplyOpen !== next.onReplyOpen
    || previous.onReplyClose !== next.onReplyClose
    || previous.onReplyClosed !== next.onReplyClosed
    || previous.friendApplicationEnabled !== next.friendApplicationEnabled
    || previous.compact !== next.compact
  ) return false;
  const changedIds = new Set([
    previous.locatedCommentId,
    next.locatedCommentId,
    previous.activeReplyId,
    next.activeReplyId,
    previous.closingReplyId,
    next.closingReplyId,
  ]);
  for (const id of changedIds) {
    if (threadContainsId(previous, id) || threadContainsId(next, id)) return false;
  }
  return previous.replySwitchInProgress === next.replySwitchInProgress
    || (!threadContainsId(previous, previous.activeReplyId) && !threadContainsId(next, next.activeReplyId));
}

const CommentItem = memo(CommentItemImpl, commentItemPropsEqual);

export function CommentsSection({ targetType, slug }) {
  const { viewer } = useCommunity();
  const [state, setState] = useState({ loading: true, loadingPage: false, error: "", retryPage: false, comments: [], total: 0, page: 1, totalPages: 1 });
  const locationTargetRef = useRef(readCommentTarget());
  const [locationTarget, setLocationTarget] = useState(locationTargetRef.current);
  const [locatedCommentId, setLocatedCommentId] = useState("");
  const [replyState, setReplyState] = useState({ activeId: "", closingId: "", switching: false });
  const pageTopRef = useRef(null);
  const pageSwitchRef = useRef(false);
  useEffect(() => {
    setReplyState({ activeId: "", closingId: "", switching: false });
  }, [targetType, slug]);
  const openReply = useCallback((commentId) => {
    setReplyState((current) => {
      if (!current.activeId) return { activeId: commentId, closingId: "", switching: false };
      if (current.activeId === commentId) return current;
      return { activeId: commentId, closingId: current.activeId, switching: true };
    });
  }, []);
  const closeReply = useCallback((commentId) => {
    setReplyState((current) => current.activeId === commentId && !current.closingId
      ? { activeId: commentId, closingId: commentId, switching: false }
      : current);
  }, []);
  const finishReplyClose = useCallback((commentId) => {
    setReplyState((current) => {
      if (current.closingId !== commentId) return current;
      return current.switching
        ? { activeId: current.activeId, closingId: "", switching: false }
        : { activeId: "", closingId: "", switching: false };
    });
  }, []);
  const loadPage = useCallback(async (requestedPage = 1, includeLocation = true, reset = false) => {
    setState((current) => ({
      ...current,
      loading: reset || current.comments.length === 0,
      loadingPage: !reset && current.comments.length > 0 && requestedPage !== current.page,
      error: "",
      retryPage: false,
    }));
    try {
      const query = new URLSearchParams({ type: targetType, slug, page: String(requestedPage) });
      if (includeLocation && locationTargetRef.current) query.set("comment", locationTargetRef.current);
      const result = await api(`/comments?${query}`);
      setState({
        loading: false,
        loadingPage: false,
        error: "",
        retryPage: false,
        comments: Array.isArray(result?.comments) ? result.comments : [],
        total: Number(result?.total || 0),
        page: Math.max(1, Number(result?.page || requestedPage)),
        totalPages: Math.max(1, Number(result?.totalPages || 1)),
      });
      return true;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, loadingPage: false, error: error?.message || "评论服务暂时不可用，请稍后再试。", retryPage: true }));
      return false;
    }
  }, [targetType, slug]);
  const changePage = useCallback(async (nextPage) => {
    if (pageSwitchRef.current || state.loadingPage || nextPage === state.page) return;
    const page = Math.max(1, Math.min(state.totalPages, nextPage));
    if (page === state.page) return;
    pageSwitchRef.current = true;
    locationTargetRef.current = "";
    setLocationTarget("");
    try {
      if (await loadPage(page, false)) requestAnimationFrame(() => pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally {
      pageSwitchRef.current = false;
    }
  }, [loadPage, state.loadingPage, state.page, state.totalPages]);
  const refreshComments = useCallback(() => {
    loadPage(state.page, false);
  }, [loadPage, state.page]);
  useEffect(() => {
    setState({ loading: true, loadingPage: false, error: "", retryPage: false, comments: [], total: 0, page: 1, totalPages: 1 });
    loadPage(1, true, true);
  }, [loadPage, viewer?.id]);
  useEffect(() => {
    const requestLocation = (event) => {
      const id = event.detail?.id || "";
      locationTargetRef.current = id;
      setLocationTarget(id);
      loadPage(1, true, true);
    };
    window.addEventListener("fonscape:locate-comment", requestLocation);
    return () => window.removeEventListener("fonscape:locate-comment", requestLocation);
  }, [loadPage]);
  useEffect(() => {
    if (!locatedCommentId) return undefined;
    const timer = window.setTimeout(() => setLocatedCommentId(""), 1900);
    return () => window.clearTimeout(timer);
  }, [locatedCommentId]);
  useEffect(() => {
    if (state.loading || !locationTarget) return undefined;
    let cancelled = false;
    let scrollFrame = 0;
    let missingFrames = 0;
    let stableLayoutFrames = 0;
    let lastAbsoluteTop = null;
    let lastDocumentHeight = null;
    let lastScrolledAbsoluteTop = null;
    let lastScrolledDocumentHeight = null;
    let lastScrollStartedAt = 0;
    let hasScrolled = false;
    let hasHighlighted = false;
    const startedAt = window.performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      consumeCommentTarget();
      locationTargetRef.current = "";
      setLocationTarget("");
    };
    const locate = (timestamp) => {
      if (cancelled) return;
      const target = document.getElementById(`comment-${locationTarget}`);
      const collapsedReplies = target?.closest(".comment-replies-extra:not(.is-open)");
      if (!target) {
        missingFrames += 1;
        if (missingFrames >= 75 || timestamp - startedAt >= 1600) finish();
        else scrollFrame = window.requestAnimationFrame(locate);
        return;
      }
      const rect = target.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top;
      const documentHeight = document.documentElement.scrollHeight;
      const layoutStable = !collapsedReplies
        && lastAbsoluteTop !== null
        && Math.abs(absoluteTop - lastAbsoluteTop) < 1
        && Math.abs(documentHeight - lastDocumentHeight) < 1;
      stableLayoutFrames = layoutStable ? stableLayoutFrames + 1 : 0;
      lastAbsoluteTop = absoluteTop;
      lastDocumentHeight = documentHeight;

      const layoutMovedSinceScroll = hasScrolled && (
        Math.abs(absoluteTop - lastScrolledAbsoluteTop) >= 1
        || Math.abs(documentHeight - lastScrolledDocumentHeight) >= 1
      );
      if (stableLayoutFrames >= 5 && (!hasScrolled || layoutMovedSinceScroll)) {
        target.focus({ preventScroll: true });
        const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
        const desiredTop = headerBottom + Math.max(20, Math.min(96, (window.innerHeight - headerBottom - Math.min(rect.height, 300)) / 3));
        window.scrollTo({
          top: Math.max(0, absoluteTop - desiredTop),
          behavior: reducedMotion ? "auto" : "smooth",
        });
        hasScrolled = true;
        lastScrollStartedAt = timestamp;
        lastScrolledAbsoluteTop = absoluteTop;
        lastScrolledDocumentHeight = documentHeight;
        stableLayoutFrames = 0;
      }

      if (hasScrolled) {
        const visibleRect = target.getBoundingClientRect();
        const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
        const highlightLead = Math.max(96, Math.min(220, window.innerHeight * 0.24));
        const targetIsNearViewport = visibleRect.bottom >= headerBottom - highlightLead && visibleRect.top <= window.innerHeight + highlightLead;
        if (targetIsNearViewport && !hasHighlighted) {
          hasHighlighted = true;
          setLocatedCommentId(locationTarget);
        }
        const visibleHeight = Math.max(0, Math.min(visibleRect.bottom, window.innerHeight - 16) - Math.max(visibleRect.top, headerBottom + 12));
        const targetIsVisible = visibleHeight >= Math.min(visibleRect.height, 72);
        if (targetIsVisible && timestamp - lastScrollStartedAt >= 1000 && stableLayoutFrames >= 5) {
          finish();
          return;
        }
      }
      if (timestamp - startedAt >= 5000) {
        finish();
        return;
      }
      scrollFrame = window.requestAnimationFrame(locate);
    };
    scrollFrame = window.requestAnimationFrame(locate);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [locationTarget, state.loading, targetType, slug]);
  const threads = useMemo(() => {
    const replies = new Map();
    state.comments.forEach((comment) => { if (comment.parentId) replies.set(comment.parentId, [...(replies.get(comment.parentId) || []), comment]); });
    return state.comments.filter((comment) => !comment.parentId).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).map((comment) => ({ comment, replies: (replies.get(comment.id) || []).sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)) }));
  }, [state.comments]);
  const replyProps = { activeReplyId: replyState.activeId, closingReplyId: replyState.closingId, replySwitchInProgress: replyState.switching, onReplyOpen: openReply, onReplyClose: closeReply, onReplyClosed: finishReplyClose, friendApplicationEnabled: targetType === "post" && slug === "site-friends" };
  const initialError = Boolean(state.error && state.comments.length === 0);
  return <section className="comments-section" aria-labelledby={`comments-${targetType}-${slug}`}><header className="comments-heading"><div><span className="comments-heading-icon" aria-hidden="true"><ChatCircleDots size={22} weight="duotone" /></span><h2 id={`comments-${targetType}-${slug}`}>评论</h2></div><span>{state.total} 条评论</span></header><StableCommentComposer targetType={targetType} slug={slug} onCreated={refreshComments} />{state.loading ? <div className="community-skeleton" aria-label="正在读取评论"><i /><i /><i /></div> : initialError ? <div className="comments-error"><WarningCircle size={23} /><p>{state.error}</p><button type="button" onClick={() => loadPage(state.page, Boolean(locationTargetRef.current))}>重试</button></div> : <>{state.error && <div className="comments-refresh-error" role="status"><WarningCircle size={18} /><span>{state.error}</span><button type="button" onClick={() => loadPage(state.page, false)}>重试</button></div>}<div ref={pageTopRef} key={state.page} className={`comments-page-list${state.loadingPage ? " is-loading" : ""}`} aria-busy={state.loadingPage || undefined}>{threads.length ? <ul className="comment-list">{threads.map(({ comment, replies }) => <CommentItem key={comment.id} comment={comment} replies={replies} targetType={targetType} slug={slug} onRefresh={refreshComments} locatedCommentId={locatedCommentId} {...replyProps} />)}</ul> : null}</div><Pagination page={state.page} totalPages={state.totalPages} onChange={changePage} ariaLabel="评论分页" className="comments-pagination" /></>}</section>;
}
