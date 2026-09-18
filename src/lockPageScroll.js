let lockCount = 0;
/** @type {{ scrollY: number, htmlScrollBehavior: string } | null} */
let saved = null;

function maintainLockedScrollPosition() {
  if (!saved || Math.abs(window.scrollY - saved.scrollY) <= 1) return;
  window.scrollTo({ top: saved.scrollY, behavior: "instant" });
}

export function lockPageScroll() {
  lockCount += 1;
  if (lockCount === 1) {
    const scrollY = window.scrollY;
    saved = {
      scrollY,
      htmlScrollBehavior: document.documentElement.style.scrollBehavior,
    };
    // The fixed backdrop owns dialog scrolling. Guard the page's scroll position
    // without changing overflow or positioning on sticky-layout ancestors.
    document.documentElement.style.scrollBehavior = "auto";
    window.addEventListener("scroll", maintainLockedScrollPosition, { passive: true });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !saved) return;
    const previous = saved;
    saved = null;
    window.removeEventListener("scroll", maintainLockedScrollPosition);
    document.documentElement.style.scrollBehavior = previous.htmlScrollBehavior;
    if (Math.abs(window.scrollY - previous.scrollY) > 1) {
      window.scrollTo({ top: previous.scrollY, behavior: "instant" });
    }
  };
}
