import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react/X";
import { responsiveImageProps } from "./responsiveImages.ts";

export function ZoomableImage({
  src,
  alt = "",
  caption,
  showLightboxCaption = true,
  className = "",
  triggerClassName = "",
  style,
  loading = "lazy",
  triggerContent,
  triggerAriaLabel,
  sizes,
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const openRef = useRef(false);
  const closingRef = useRef(false);

  const closeLightbox = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      openRef.current = false;
      closingRef.current = false;
      setOpen(false);
      setClosing(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }, 280);
  }, []);
  useEffect(() => { setFailed(false); }, [src]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeLightbox();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(closeTimerRef.current);
    };
  }, [open, closeLightbox]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`zoomable-image-trigger ${triggerClassName}${failed ? " is-broken" : ""}`.trim()}
      onClick={() => { if (!failed) { openRef.current = true; closingRef.current = false; setClosing(false); setOpen(true); } }}
      disabled={failed}
      aria-label={triggerAriaLabel || `放大查看${alt ? `：${alt}` : "图片"}`}
    >
      {triggerContent || (failed ? <span className="article-image-error">图片地址无效，请返回编辑区重新插入图片。</span> : <img className={className} src={src} {...(sizes ? responsiveImageProps(src, sizes) : {})} alt={alt} style={style} loading={loading} decoding="async" onError={() => setFailed(true)} />)}
      {caption && <span className="article-image-caption">{caption}</span>}
    </button>
    {open && createPortal(
      <div className={`image-lightbox${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={alt || "图片放大预览"} onMouseDown={(event) => event.target === event.currentTarget && closeLightbox()}>
        <button ref={closeRef} type="button" className="image-lightbox-close" onClick={closeLightbox} aria-label="关闭图片预览"><X size={22} weight="bold" /></button>
        <figure>
          <img src={src} alt={alt} />
          {showLightboxCaption && (caption || alt) && <figcaption>{caption || alt}</figcaption>}
        </figure>
      </div>,
      document.body,
    )}
  </>;
}
