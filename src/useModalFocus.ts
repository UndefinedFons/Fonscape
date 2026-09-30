import { useLayoutEffect } from "react";
import type { RefObject } from "react";

const focusableSelector = "a[href], button, input, select, textarea, [tabindex]";
interface InertOwner {
  count: number;
  previous: boolean;
}
const inertOwners = new WeakMap<HTMLElement, InertOwner>();

function holdInert(element: HTMLElement): () => void {
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

function focusableWithin(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].map((element) => element).filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;
    for (let parent: Element | null = element; parent && parent !== dialog; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  });
}

export function containModalFocus(dialog: HTMLElement, restoreTarget: HTMLElement | null = null): () => void {
  const opener = restoreTarget || (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement : null);
  const releases: Array<() => void> = [];
  let branch: Element | null = dialog;
  while (branch && branch !== document.body && branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) releases.push(holdInert(sibling));
    }
    branch = branch.parentElement;
  }
  const focusFirst = () => (focusableWithin(dialog)[0] || dialog).focus({ preventScroll: true });
  focusFirst();
  const onKeyDown = (event: KeyboardEvent): void => {
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
  const onFocusIn = (event: FocusEvent): void => {
    if (!dialog.contains(event.target as Node)) focusFirst();
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

export function useModalFocus(
  dialogRef: RefObject<HTMLElement | null>,
  active: boolean,
  restoreRef: RefObject<HTMLElement | null> | null = null,
): void {
  useLayoutEffect(() => {
    if (active && dialogRef.current) return containModalFocus(dialogRef.current, restoreRef?.current);
    return undefined;
  }, [active, dialogRef, restoreRef]);
}
