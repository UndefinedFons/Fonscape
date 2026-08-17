import { useCallback, useEffect, useRef, useState } from "react";
import { paginationPositions } from "./routeState.js";

function useResponsivePageSize(desktopSize, mobileSize) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile ? mobileSize : desktopSize;
}
function useHorizontalScroller() {
  const ref = useRef(null);
  const dragRef = useRef({ active: false, moved: false, pointerId: null, startX: 0, startY: 0, startScrollLeft: 0, anchor: null });
  const onPointerDown = useCallback((event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const node = ref.current;
    if (!node || node.scrollWidth <= node.clientWidth) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: node.scrollLeft,
      anchor: event.target.closest?.("a[href]") || null,
    };
    node.classList.add("is-pointer-ready");
  }, []);
  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    const node = ref.current;
    if (!drag.active || !node || drag.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - drag.startX;
    const distanceY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(distanceX) < 9) return;
    if (!drag.moved && Math.abs(distanceX) <= Math.abs(distanceY)) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.anchor?.setAttribute("data-horizontal-drag", "true");
      node.setPointerCapture?.(event.pointerId);
    }
    node.classList.add("is-dragging");
    node.scrollLeft = drag.startScrollLeft - distanceX;
    event.preventDefault();
  }, []);
  const finishPointer = useCallback((event) => {
    const drag = dragRef.current;
    const node = ref.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    node?.releasePointerCapture?.(event.pointerId);
    node?.classList.remove("is-dragging", "is-pointer-ready");
  }, []);
  const onClickCapture = useCallback((event) => {
    if (!dragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.anchor?.removeAttribute("data-horizontal-drag");
    dragRef.current.moved = false;
  }, []);
  const onDragStart = useCallback((event) => event.preventDefault(), []);
  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    onClickCapture,
    onDragStart,
  };
}
function usePagination(items, pageSize, resetKey, family) {
  const storageKey = `${family}:${resetKey}:${pageSize}`;
  const storageKeyRef = useRef(storageKey);
  const [page, setPage] = useState(() => paginationPositions.get(storageKey) || 1);
  const [leaving, setLeaving] = useState(false);
  const topRef = useRef(null);
  const timerRef = useRef(null);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    setPage(paginationPositions.get(storageKey) || 1);
    setLeaving(false);
  }, [storageKey]);
  useEffect(() => { paginationPositions.set(storageKey, safePage); }, [storageKey, safePage]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const changePage = (nextPage) => {
    const next = Math.max(1, Math.min(totalPages, nextPage));
    if (next === safePage || leaving) return;
    setLeaving(true);
    timerRef.current = window.setTimeout(() => {
      setPage(next);
      paginationPositions.set(storageKey, next);
      setLeaving(false);
      window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, 150);
  };
  return { page: safePage, pageItems, totalPages, leaving, topRef, changePage };
}

export { useHorizontalScroller, usePagination, useResponsivePageSize };
