import "../styles/music-queue.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { X } from "@phosphor-icons/react/X";
import { musicSession } from "../musicSession.ts";
import { useModalFocus } from "../useModalFocus.ts";
import { lockPageScroll } from "../lockPageScroll.ts";
import type { MusicSessionState } from "../musicSession.ts";

interface ScrollbarGeometry {
  maxScroll: number;
  trackHeight: number;
  thumbHeight: number;
}

interface PointerDrag {
  pointerId: number;
  grabOffset: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function MusicQueueDialog({ state, onClose }: { state: MusicSessionState; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const frame = useRef<number | null>(null);
  const drag = useRef<PointerDrag | null>(null);
  const geometry = useRef<ScrollbarGeometry>({ maxScroll: 0, trackHeight: 0, thumbHeight: 0 });
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  useModalFocus(dialog, true);
  useLayoutEffect(lockPageScroll, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    timer.current = window.setTimeout(onClose, 240);
  }, [onClose]);

  const updateScrollbar = useCallback(() => {
    const listNode = list.current;
    const railNode = scrollbar.current;
    const thumbNode = thumb.current;
    if (!listNode || !railNode || !thumbNode) return;

    const viewportHeight = listNode.clientHeight;
    const scrollHeight = listNode.scrollHeight;
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const trackHeight = railNode.clientHeight || viewportHeight;
    const thumbHeight = maxScroll > 0 && trackHeight > 0
      ? Math.min(trackHeight, Math.max(28, Math.round(trackHeight * viewportHeight / scrollHeight)))
      : trackHeight;
    const travel = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScroll > 0 ? listNode.scrollTop / maxScroll * travel : 0;

    geometry.current = { maxScroll, trackHeight, thumbHeight };
    railNode.dataset.overflow = String(maxScroll > 1);
    railNode.setAttribute("aria-valuemax", String(Math.round(maxScroll)));
    railNode.setAttribute("aria-valuenow", String(Math.round(listNode.scrollTop)));
    railNode.setAttribute("aria-valuetext", maxScroll > 0
      ? `播放队列滚动位置 ${Math.round(listNode.scrollTop / maxScroll * 100)}%`
      : "播放队列无需滚动");
    thumbNode.style.height = `${thumbHeight}px`;
    thumbNode.style.transform = `translate(-50%,${thumbTop}px)`;
  }, []);

  const scheduleScrollbarUpdate = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      updateScrollbar();
    });
  }, [updateScrollbar]);

  useLayoutEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
    updateScrollbar();
  }, [updateScrollbar]);

  useEffect(() => {
    const listNode = list.current;
    const dialogNode = dialog.current;
    if (!listNode || !dialogNode) return undefined;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleScrollbarUpdate);
    observer?.observe(listNode);
    observer?.observe(dialogNode);
    if (scrollbar.current) observer?.observe(scrollbar.current);
    scheduleScrollbarUpdate();
    return () => {
      observer?.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      drag.current = null;
    };
  }, [scheduleScrollbarUpdate, state.tracks]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setScrollFromPointer = useCallback((clientY: number, grabOffset: number) => {
    const listNode = list.current;
    const railNode = scrollbar.current;
    const { maxScroll, trackHeight, thumbHeight } = geometry.current;
    if (!listNode || !railNode || maxScroll <= 0) return;
    const availableTravel = Math.max(0, trackHeight - thumbHeight);
    if (!availableTravel) return;
    const trackTop = railNode.getBoundingClientRect().top;
    const thumbTop = clamp(clientY - trackTop - grabOffset, 0, availableTravel);
    listNode.scrollTop = thumbTop / availableTravel * maxScroll;
    scheduleScrollbarUpdate();
  }, [scheduleScrollbarUpdate]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || scrollbar.current?.dataset.overflow !== "true") return;
    const railNode = scrollbar.current;
    const thumbNode = thumb.current;
    if (!railNode || !thumbNode) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const thumbBounds = thumbNode.getBoundingClientRect();
    const onThumb = event.clientY >= thumbBounds.top && event.clientY <= thumbBounds.bottom;
    const grabOffset = onThumb ? event.clientY - thumbBounds.top : geometry.current.thumbHeight / 2;
    drag.current = { pointerId: event.pointerId, grabOffset };
    railNode.setPointerCapture?.(event.pointerId);
    if (!onThumb) setScrollFromPointer(event.clientY, grabOffset);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const currentDrag = drag.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setScrollFromPointer(event.clientY, currentDrag.grabOffset);
  };

  const stopPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    const railNode = scrollbar.current;
    if (railNode?.hasPointerCapture?.(event.pointerId)) railNode.releasePointerCapture(event.pointerId);
  };

  const handleScrollbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const listNode = list.current;
    if (!listNode || geometry.current.maxScroll <= 0) return;
    const pageStep = Math.max(40, Math.round(listNode.clientHeight * 0.88));
    let nextScroll: number | null = null;
    switch (event.key) {
      case "ArrowUp": nextScroll = listNode.scrollTop - 40; break;
      case "ArrowDown": nextScroll = listNode.scrollTop + 40; break;
      case "PageUp": nextScroll = listNode.scrollTop - pageStep; break;
      case "PageDown": nextScroll = listNode.scrollTop + pageStep; break;
      case "Home": nextScroll = 0; break;
      case "End": nextScroll = geometry.current.maxScroll; break;
      default: return;
    }
    event.preventDefault();
    listNode.scrollTop = clamp(nextScroll, 0, geometry.current.maxScroll);
    scheduleScrollbarUpdate();
  };

  return createPortal(<div className={`dialog-backdrop music-queue-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section ref={dialog} tabIndex={-1} className="music-queue-dialog search-dialog" id="music-stage-queue" role="dialog" aria-modal="true" aria-labelledby="music-queue-title">
      <header><div><span className="eyebrow">TRACK LIST</span><h2 id="music-queue-title">选择曲目 <small>{state.tracks.length}</small></h2></div><button aria-label="关闭曲目列表" onClick={close}><X size={21} /></button></header>
      <div className="music-queue-scroll-shell">
        <ol ref={list} className="music-track-list" id="music-track-list" aria-label="播放队列" onScroll={scheduleScrollbarUpdate}>
          {state.tracks.map((item, index) => <li key={`${item.source}-${item.id}-${index}`}><button aria-current={index === state.index ? "true" : undefined} onClick={() => { musicSession.selectTrack(index); close(); }}><span className="music-track-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.artist}</small></span>{index === state.index && <MusicNotes size={18} />}</button></li>)}
        </ol>
        <div
          ref={scrollbar}
          className="music-queue-scrollbar"
          role="scrollbar"
          aria-label="播放队列滚动条"
          aria-controls="music-track-list"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={0}
          aria-valuenow={0}
          aria-valuetext="播放队列无需滚动"
          data-overflow="false"
          tabIndex={0}
          onKeyDown={handleScrollbarKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointerDrag}
          onPointerCancel={stopPointerDrag}
          onLostPointerCapture={() => { drag.current = null; }}
        >
          <span ref={thumb} className="music-queue-scroll-thumb" aria-hidden="true" />
        </div>
      </div>
    </section>
  </div>, document.body);
}
