let lockCount = 0;
let saved = null;

export function lockPageScroll() {
  lockCount += 1;
  if (lockCount === 1) {
    const scrollY = window.scrollY;
    saved = {
      scrollY,
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !saved) return;
    const previous = saved;
    saved = null;
    document.documentElement.style.overflow = previous.htmlOverflow;
    document.body.style.overflow = previous.bodyOverflow;
    if (Math.abs(window.scrollY - previous.scrollY) > 1) {
      window.scrollTo({ top: previous.scrollY, behavior: "instant" });
    }
  };
}
