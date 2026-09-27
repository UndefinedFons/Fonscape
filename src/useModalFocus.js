import { useLayoutEffect } from "react";

const focusableSelector = "a[href], button, input, select, textarea, [tabindex]";
/** @type {WeakMap<HTMLElement, { count: number, previous: boolean }>} */
const inertOwners = new WeakMap();

/** @param {HTMLElement} element */
function holdInert(element) {
  let owner = inertOwners.get(element);
  if (!owner) {
    owner = { count: 0, previous: Boolean(element.inert) };
    inertOwners.set(element, owner);
  }
  owner.count += 1;
  element.inert = true;
  return () => {
    owner.count -= 1;
    if (owner.count === 0) {
      element.inert = owner.previous;
      inertOwners.delete(element);
    }
  };
}

/** @param {HTMLElement} dialog */
function focusableWithin(dialog) {
  return [...dialog.querySelectorAll(focusableSelector)].map((element) => /** @type {HTMLElement} */ (element)).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;
    for (let parent = /** @type {Element | null} */ (element); parent && parent !== dialog; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

/** @param {HTMLElement} dialog @param {HTMLElement | null} [restoreTarget] */
export function containModalFocus(dialog, restoreTarget = null) {
  const opener = restoreTarget || (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement : null);
  /** @type {Array<() => void>} */
  const releases = [];
  let branch = /** @type {Element | null} */ (dialog);
  while (branch && branch !== document.body && branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) releases.push(holdInert(sibling));
    }
    branch = branch.parentElement;
  }
  const focusFirst = () => (focusableWithin(dialog)[0] || dialog).focus({ preventScroll: true });
  focusFirst();
  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const focusable = focusableWithin(dialog);
    const first = focusable[0] || dialog;
    const last = focusable.at(-1) || dialog;
    const current = document.activeElement;
    if (!dialog.contains(current) || current === dialog || (event.shiftKey ? current === first : current === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };
  /** @param {FocusEvent} event */
  const onFocusIn = (event) => {
    if (!dialog.contains(/** @type {Node} */ (event.target))) focusFirst();
  };
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocusIn, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocusIn, true);
    for (const release of releases.reverse()) release();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
}

/** @param {import("react").RefObject<HTMLElement | null>} dialogRef
 * @param {boolean} active
 * @param {import("react").RefObject<HTMLElement | null> | null} [restoreRef]
 */
export function useModalFocus(dialogRef, active, restoreRef = null) {
  useLayoutEffect(() => {
    if (active && dialogRef.current) return containModalFocus(dialogRef.current, restoreRef?.current);
    return undefined;
  }, [active, dialogRef, restoreRef]);
}
