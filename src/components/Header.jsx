import { flushSync } from "react-dom";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { List } from "@phosphor-icons/react/List";
import { ListNumbers } from "@phosphor-icons/react/ListNumbers";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Moon } from "@phosphor-icons/react/Moon";
import { Sun } from "@phosphor-icons/react/Sun";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { UserCircleCheck } from "@phosphor-icons/react/UserCircleCheck";
import { X } from "@phosphor-icons/react/X";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { navItems } from "../content/index.js";
import { getDetailReadingTarget } from "../detailReading.js";

function useDetailReadingProgress(route) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const readingTarget = getDetailReadingTarget(route);
    if (!readingTarget) {
      setProgress(0);
      return undefined;
    }

    let articleBody = null;
    let frame = 0;
    let resizeObserver = null;
    let lastProgress = -1;

    const update = () => {
      frame = 0;
      const nextArticleBody = document.querySelector(readingTarget);
      if (nextArticleBody !== articleBody) {
        resizeObserver?.disconnect();
        articleBody = nextArticleBody;
        if (articleBody && typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(scheduleUpdate);
          resizeObserver.observe(articleBody);
        }
      }
      if (!articleBody) {
        if (lastProgress !== 0) {
          lastProgress = 0;
          setProgress(0);
        }
        return;
      }

      const rect = articleBody.getBoundingClientRect();
      const bodyTop = rect.top + window.scrollY;
      const bodyBottom = rect.bottom + window.scrollY;
      const readingInset = Math.min(96, window.innerHeight * .14);
      const start = Math.max(0, bodyTop - readingInset);
      const end = bodyBottom - window.innerHeight;
      const nextProgress = end <= start
        ? (window.scrollY > start ? 100 : 0)
        : Math.min(100, Math.max(0, ((window.scrollY - start) / (end - start)) * 100));
      const roundedProgress = Math.round(nextProgress * 100) / 100;
      if (roundedProgress !== lastProgress) {
        lastProgress = roundedProgress;
        setProgress(roundedProgress);
      }
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const mutationObserver = new MutationObserver(scheduleUpdate);
    const routeView = document.querySelector(".route-view");
    if (routeView) mutationObserver.observe(routeView, { childList: true, subtree: true });
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [route]);

  return progress;
}

export function ArticleOutlinePopover({ items, open, activeId, onSelect }) {
  const activeItem = items.find((item) => item.id === activeId) || items[0];
  return <aside className={`article-outline${open ? " is-open" : ""}`} aria-hidden={!open}><header><List size={18} weight="duotone" /><span>文章导览</span><small>{activeItem?.number || "00"} / {String(items.length - (items[0]?.prologue ? 1 : 0)).padStart(2, "0")}</small></header><nav aria-label="文章章节导览">{items.map((item) => <button type="button" key={item.id} className={item.id === activeId ? "active" : ""} aria-current={item.id === activeId ? "location" : undefined} tabIndex={open ? 0 : -1} onClick={() => onSelect(item)}><span>{item.number}</span><b>{item.title}</b></button>)}</nav></aside>;
}

export function Header({ route, theme, menuOpen, onMenu, onTheme, onSearch, onSearchIntent, onSettings, onSettingsIntent, viewer, onAccount, onAccountIntent, hasArticleOutline, articleOutlineOpen, onArticleOutline, onCloseArticleOutline }) {
  const navRef = useRef(null);
  const headerCenterRef = useRef(null);
  const detailReadingTarget = getDetailReadingTarget(route);
  const detailReadingProgress = useDetailReadingProgress(route);
  const [indicator, setIndicator] = useState({ x: 0, ready: false });
  const [collapsed, setCollapsed] = useState(false);
  const [morphing, setMorphing] = useState("");
  const morphTimerRef = useRef(null);
  const morphAnimationRef = useRef([]);
  const cancelMorphAnimations = () => {
    morphAnimationRef.current.forEach((animation) => animation?.cancel());
    morphAnimationRef.current = [];
  };
  useEffect(() => () => {
    window.clearTimeout(morphTimerRef.current);
    cancelMorphAnimations();
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const updateIndicator = () => {
      const activeLink = nav.querySelector("a.active");
      if (!activeLink) return;
      setIndicator({ x: activeLink.offsetLeft + (activeLink.offsetWidth - 24) / 2, ready: true });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(nav);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [route, menuOpen]);

  const morphHeader = (toCollapsed) => {
    window.clearTimeout(morphTimerRef.current);
    cancelMorphAnimations();
    if (toCollapsed && menuOpen) onMenu();
    if (toCollapsed) onCloseArticleOutline();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMorphing("");
      setCollapsed(toCollapsed);
      return;
    }
    const headerCenter = headerCenterRef.current;
    if (!headerCenter) return;
    const nav = headerCenter.querySelector(".main-nav");
    const actions = headerCenter.querySelector(".header-actions");
    const restore = headerCenter.querySelector(".nav-morph-restore-button");
    const firstRect = headerCenter.getBoundingClientRect();
    const firstStyle = getComputedStyle(headerCenter);
    const first = {
      width: firstRect.width,
      height: firstRect.height,
      transform: firstStyle.transform,
      paddingLeft: firstStyle.paddingLeft,
      paddingRight: firstStyle.paddingRight,
      borderRadius: firstStyle.borderRadius,
      borderColor: firstStyle.borderColor,
      boxShadow: firstStyle.boxShadow,
    };
    const compactHeader = window.matchMedia("(max-width:760px)").matches;
    const contentDuration = compactHeader ? 120 : 180;
    const shellDuration = compactHeader ? 420 : 540;
    const shellEasing = compactHeader ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.45,0,.55,1)";
    const contentOutFrames = [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-2px)" }];
    if (toCollapsed) {
      flushSync(() => setMorphing("collapsing"));
      const contentAnimations = [];
      if (nav) contentAnimations.push(nav.animate(contentOutFrames, { duration: contentDuration, easing: "cubic-bezier(.4,0,1,1)", fill: "both" }));
      if (actions) contentAnimations.push(actions.animate(contentOutFrames, { duration: contentDuration, easing: "cubic-bezier(.4,0,1,1)", fill: "both" }));
      morphAnimationRef.current = contentAnimations;
      morphTimerRef.current = window.setTimeout(() => {
        flushSync(() => setCollapsed(true));
        const lastRect = headerCenter.getBoundingClientRect();
        const lastStyle = getComputedStyle(headerCenter);
        const shellAnimation = headerCenter.animate([
          { width: `${first.width}px`, height: `${first.height}px`, transform: first.transform, paddingLeft: first.paddingLeft, paddingRight: first.paddingRight, borderRadius: first.borderRadius, borderColor: first.borderColor, boxShadow: first.boxShadow },
          { width: `${lastRect.width}px`, height: `${lastRect.height}px`, transform: lastStyle.transform, paddingLeft: lastStyle.paddingLeft, paddingRight: lastStyle.paddingRight, borderRadius: lastStyle.borderRadius, borderColor: lastStyle.borderColor, boxShadow: lastStyle.boxShadow },
        ], { duration: shellDuration, easing: shellEasing, fill: "both" });
        morphAnimationRef.current.push(shellAnimation);
        if (restore) morphAnimationRef.current.push(restore.animate([
          { opacity: 0 },
          { opacity: .62 },
        ], { duration: shellDuration, easing: shellEasing, fill: "both" }));
        morphTimerRef.current = window.setTimeout(() => {
          setMorphing("");
          requestAnimationFrame(cancelMorphAnimations);
        }, shellDuration + 30);
      }, contentDuration);
      return;
    }
    flushSync(() => {
      setMorphing("restoring");
      setCollapsed(false);
    });
    const lastRect = headerCenter.getBoundingClientRect();
    const lastStyle = getComputedStyle(headerCenter);
    const duration = shellDuration;
    const easing = shellEasing;
    const firstShellFrame = { width: `${first.width}px`, height: `${first.height}px`, transform: first.transform, paddingLeft: first.paddingLeft, paddingRight: first.paddingRight, borderRadius: first.borderRadius, borderColor: first.borderColor, boxShadow: first.boxShadow };
    const lastShellFrame = { width: `${lastRect.width}px`, height: `${lastRect.height}px`, transform: lastStyle.transform, paddingLeft: lastStyle.paddingLeft, paddingRight: lastStyle.paddingRight, borderRadius: lastStyle.borderRadius, borderColor: lastStyle.borderColor, boxShadow: lastStyle.boxShadow };
    const shellAnimation = headerCenter.animate([firstShellFrame, lastShellFrame], { duration, easing, fill: "both" });
    const contentFrames = [{ opacity: 0, transform: "translateY(-2px)" }, { opacity: 1, transform: "translateY(0)" }];
    const contentTiming = { duration: contentDuration, delay: shellDuration, easing: "cubic-bezier(0,0,.2,1)", fill: "both" };
    const animations = [shellAnimation];
    if (nav) animations.push(nav.animate(contentFrames, contentTiming));
    if (actions) animations.push(actions.animate(contentFrames, contentTiming));
    if (restore) animations.push(restore.animate(
      [{ opacity: .62, offset: 0 }, { opacity: .34, offset: .28 }, { opacity: 0, offset: .58 }, { opacity: 0, offset: 1 }],
      { duration, easing: "linear", fill: "both" },
    ));
    morphAnimationRef.current = animations;
    morphTimerRef.current = window.setTimeout(() => {
      setMorphing("");
      requestAnimationFrame(cancelMorphAnimations);
    }, shellDuration + contentDuration + 30);
  };
  const collapseHeader = () => morphHeader(true);
  const restoreHeader = () => morphHeader(false);
  return <header className={`site-header${hasArticleOutline ? " has-article-outline" : ""}${collapsed ? " is-collapsed" : ""}`}>
    <div ref={headerCenterRef} className={`header-center material-panel${detailReadingTarget ? " has-article-reading-progress" : ""}${morphing ? ` is-morphing is-${morphing}` : ""}`} style={{ "--article-reading-progress": `${detailReadingProgress}%`, "--article-reading-progress-opacity": detailReadingProgress > 0 ? 1 : 0 }}>
      <nav ref={navRef} className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="主导航">
        <span className={indicator.ready ? "nav-active-indicator is-ready" : "nav-active-indicator"} style={{ "--indicator-x": `${indicator.x}px` }} aria-hidden="true" />
        {navItems.map(([path, label]) => {
          const active = path === "/" ? route === "/" : route === path || route.startsWith(`${path}/`) || (path === "/posts" && route.startsWith("/post/")) || (path === "/poems" && route.startsWith("/poem/"));
          return <a key={path} className={active ? "active" : ""} href={`#${path}`}>{label}</a>;
        })}
      </nav>
      <div className="header-actions">
        <button className="icon-button" onClick={onSearch} onPointerEnter={onSearchIntent} onFocus={onSearchIntent} aria-label="打开搜索"><MagnifyingGlass size={21} /></button>
        <button className={`icon-button account-nav-button${viewer ? " is-signed-in" : " is-signed-out"}`} onClick={onAccount} onPointerEnter={onAccountIntent} onFocus={onAccountIntent} aria-label={viewer ? `打开 ${viewer.nickname} 的个人中心${viewer.unreadReplies || viewer.unreadAdminComments ? `，有 ${Number(viewer.unreadReplies || 0) + Number(viewer.unreadAdminComments || 0)} 条未读消息` : ""}` : "登录或注册"}>{viewer ? <UserCircleCheck size={22} weight="duotone" /> : <UserCircle size={22} />}{Number(viewer?.unreadReplies || 0) + Number(viewer?.unreadAdminComments || 0) > 0 && <span className="account-notification-dot" aria-hidden="true" />}</button>
        <button className="icon-button theme-button" onClick={onTheme} aria-label="切换主题">{theme === "light" ? <Moon size={21} /> : <Sun size={21} />}</button>
        <button className="icon-button menu-button" onClick={onMenu} aria-label={menuOpen ? "关闭菜单" : "打开菜单"}>{menuOpen ? <X size={21} /> : <List size={21} />}</button>
        <button className={`icon-button article-outline-nav-button${hasArticleOutline ? " is-available" : ""}`} onClick={hasArticleOutline ? onArticleOutline : undefined} aria-label={hasArticleOutline ? (articleOutlineOpen ? "关闭文章导览" : "打开文章导览") : undefined} aria-expanded={hasArticleOutline ? articleOutlineOpen : undefined} aria-hidden={!hasArticleOutline} tabIndex={hasArticleOutline ? 0 : -1}><span className="icon-swap" key={articleOutlineOpen ? "close" : "outline"}>{articleOutlineOpen ? <X size={21} /> : <ListNumbers size={21} />}</span></button>
        <button className="icon-button settings-button" onClick={onSettings} onPointerEnter={onSettingsIntent} onFocus={onSettingsIntent} aria-label="打开显示设置"><GearSix size={21} /></button>
        <button className="icon-button nav-collapse-button" onClick={collapseHeader} aria-label="收纳导航栏" aria-hidden={collapsed || Boolean(morphing)} tabIndex={!collapsed && !morphing ? 0 : -1} disabled={collapsed || Boolean(morphing)} hidden={collapsed && !morphing}><CaretUp size={21} weight="bold" /></button>
      </div>
      <button className="nav-morph-restore-button" type="button" onClick={restoreHeader} aria-label="展开导航栏" aria-hidden={!collapsed || Boolean(morphing)} tabIndex={collapsed && !morphing ? 0 : -1} disabled={!collapsed || Boolean(morphing)} hidden={!collapsed && morphing !== "restoring"}><CaretDown size={18} weight="bold" /></button>
    </div>
  </header>;
}
