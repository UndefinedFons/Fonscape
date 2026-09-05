import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";
import { consumeCommentTarget, groupCommentThreads, readCommentTarget } from "./commentUtils.js";

function initialCommentState() {
  return { loading: true, loadingPage: false, refreshing: false, error: "", retryPage: false, comments: [], total: 0, page: 1, totalPages: 1 };
}

export function useCommentsSection({ targetType, slug }) {
  const { viewer } = useCommunity();
  const viewerId = viewer?.id || "";
  const [state, setState] = useState(initialCommentState);
  const targetKey = `${targetType}:${slug}:${viewerId}`;
  const targetKeyRef = useRef(targetKey);
  targetKeyRef.current = targetKey;
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const locationTargetRef = useRef(readCommentTarget());
  const [locationTarget, setLocationTarget] = useState(locationTargetRef.current);
  const [locatedCommentId, setLocatedCommentId] = useState("");
  const [replyState, setReplyState] = useState({ activeId: "", closingId: "", switching: false });
  const pageTopRef = useRef(null);
  const pageSwitchRef = useRef(null);
  const pageRef = useRef(state.page);
  const totalPagesRef = useRef(state.totalPages);
  const loadingPageRef = useRef(state.loadingPage);
  pageRef.current = state.page;
  totalPagesRef.current = state.totalPages;
  loadingPageRef.current = state.loadingPage;
  const expansionRequestRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const nextLocationTarget = readCommentTarget();
    requestIdRef.current += 1;
    locationTargetRef.current = nextLocationTarget;
    setLocationTarget(nextLocationTarget);
    setLocatedCommentId("");
    expansionRequestRef.current = "";
    pageSwitchRef.current = null;
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

  /**
   * Fetch one comment page. A background request keeps the current list
   * mounted until its replacement is ready, while an initial request may
   * clear the list to show its skeleton.
   */
  const loadPage = useCallback(async (requestedPage = 1, includeLocation = true, options = {}) => {
    const { clear = false, background = false } = options;
    const requestId = ++requestIdRef.current;
    const requestTargetKey = `${targetType}:${slug}:${viewerId}`;
    const isCurrentRequest = () => mountedRef.current
      && requestId === requestIdRef.current
      && targetKeyRef.current === requestTargetKey;
    setState((current) => {
      const comments = clear ? [] : current.comments;
      return {
        ...current,
        loading: comments.length === 0,
        loadingPage: !background && !clear && comments.length > 0 && requestedPage !== current.page,
        refreshing: true,
        error: "",
        retryPage: false,
      };
    });
    try {
      const query = new URLSearchParams({ type: targetType, slug, page: String(requestedPage) });
      if (includeLocation && locationTargetRef.current) query.set("comment", locationTargetRef.current);
      const result = await api(`/comments?${query}`);
      if (!isCurrentRequest()) return false;
      setState({
        loading: false,
        loadingPage: false,
        refreshing: false,
        error: "",
        retryPage: false,
        comments: Array.isArray(result?.comments) ? result.comments : [],
        total: Number(result?.total || 0),
        page: Math.max(1, Number(result?.page || requestedPage)),
        totalPages: Math.max(1, Number(result?.totalPages || 1)),
      });
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      setState((current) => ({
        ...current,
        loading: false,
        loadingPage: false,
        refreshing: false,
        error: error?.message || "评论服务暂时不可用，请稍后再试。",
        retryPage: requestedPage,
      }));
      return false;
    }
  }, [slug, targetType, viewerId]);

  const changePage = useCallback(async (nextPage) => {
    const pageTargetKey = `${targetType}:${slug}:${viewerId}`;
    if (!mountedRef.current || targetKeyRef.current !== pageTargetKey) return;
    if (pageSwitchRef.current || loadingPageRef.current || nextPage === pageRef.current) return;
    const page = Math.max(1, Math.min(totalPagesRef.current, nextPage));
    if (page === pageRef.current) return;
    const switchToken = Symbol("comment-page-switch");
    pageSwitchRef.current = switchToken;
    locationTargetRef.current = "";
    setLocationTarget("");
    setLocatedCommentId("");
    expansionRequestRef.current = "";
    try {
      if (await loadPage(page, false) && mountedRef.current && targetKeyRef.current === pageTargetKey && pageSwitchRef.current === switchToken) {
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        requestAnimationFrame(() => pageTopRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
      }
    } finally {
      if (pageSwitchRef.current === switchToken) pageSwitchRef.current = null;
    }
  }, [loadPage, slug, targetType, viewerId]);

  const refreshComments = useCallback((createdComment) => {
    const refreshTargetKey = `${targetType}:${slug}:${viewerId}`;
    if (!mountedRef.current || targetKeyRef.current !== refreshTargetKey || pageSwitchRef.current) return;
    const createdId = typeof createdComment?.id === "string" ? createdComment.id.trim() : "";
    if (createdId) {
      locationTargetRef.current = createdId;
      setLocationTarget(createdId);
      setLocatedCommentId("");
      expansionRequestRef.current = "";
      void loadPage(1, true, { background: true });
      return;
    }
    locationTargetRef.current = "";
    setLocationTarget("");
    setLocatedCommentId("");
    expansionRequestRef.current = "";
    consumeCommentTarget();
    void loadPage(pageRef.current, false, { background: true });
  }, [loadPage, slug, targetType, viewerId]);

  useEffect(() => {
    setState(initialCommentState());
    void loadPage(1, true, { clear: true });
  }, [loadPage]);

  useEffect(() => {
    const requestLocation = (event) => {
      if (event.detail?.expandOnly) return;
      const locationTargetKey = `${targetType}:${slug}:${viewerId}`;
      if (!mountedRef.current || targetKeyRef.current !== locationTargetKey) return;
      const id = event.detail?.id || "";
      if (!id) return;
      locationTargetRef.current = id;
      setLocationTarget(id);
      setLocatedCommentId("");
      expansionRequestRef.current = "";
      void loadPage(1, true, { background: true });
    };
    window.addEventListener("fonscape:locate-comment", requestLocation);
    return () => window.removeEventListener("fonscape:locate-comment", requestLocation);
  }, [loadPage, slug, targetType, viewerId]);

  useEffect(() => {
    if (!locatedCommentId) return undefined;
    const timer = window.setTimeout(() => setLocatedCommentId(""), 1900);
    return () => window.clearTimeout(timer);
  }, [locatedCommentId]);

  useEffect(() => {
    if (state.loading || state.refreshing || state.error || !locationTarget) return undefined;
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
      expansionRequestRef.current = "";
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
      if (collapsedReplies) {
        if (expansionRequestRef.current !== locationTarget) {
          expansionRequestRef.current = locationTarget;
          window.dispatchEvent(new CustomEvent("fonscape:locate-comment", { detail: { id: locationTarget, expandOnly: true } }));
        }
        if (timestamp - startedAt >= 5000) finish();
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
  }, [locationTarget, state.error, state.loading, state.refreshing, targetType, slug]);

  const threads = useMemo(() => groupCommentThreads(state.comments), [state.comments]);
  const replyProps = useMemo(() => ({
    activeReplyId: replyState.activeId,
    closingReplyId: replyState.closingId,
    replySwitchInProgress: replyState.switching,
    onReplyOpen: openReply,
    onReplyClose: closeReply,
    onReplyClosed: finishReplyClose,
    friendApplicationEnabled: targetType === "post" && slug === "site-friends",
  }), [closeReply, finishReplyClose, openReply, replyState, slug, targetType]);
  const retry = useCallback(() => {
    const requestedPage = Number.isFinite(state.retryPage) ? state.retryPage : state.page;
    void loadPage(requestedPage, Boolean(locationTargetRef.current), { background: state.comments.length > 0 });
  }, [loadPage, state.comments.length, state.page, state.retryPage]);

  return {
    state,
    threads,
    locatedCommentId,
    pageTopRef,
    replyProps,
    loadPage,
    changePage,
    refreshComments,
    retry,
    locationTargetRef,
  };
}
