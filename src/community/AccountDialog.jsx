import { use, useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react/X";
import { AccountAuth } from "./AccountAuth.jsx";
import { AccountCenter } from "./AccountCenter.jsx";
import { useCommunity } from "./CommunityProvider.jsx";
import { loadSearchIndex } from "../content/index.js";
import { lockPageScroll } from "../lockPageScroll.js";

export function AccountDialog() {
  const indexedContent = use(loadSearchIndex());
  const contentLookup = useMemo(() => new Map(indexedContent.map((entry) => [`${entry.type}:${entry.key}`, entry])), [indexedContent]);
  const { accountOpen, closeAccount, viewer } = useCommunity();
  const closeButton = useRef(null);
  const exitTimer = useRef(null);
  const [rendered, setRendered] = useState(accountOpen);
  const [closing, setClosing] = useState(false);
  useEffect(() => rendered ? lockPageScroll() : undefined, [rendered]);
  useEffect(() => {
    window.clearTimeout(exitTimer.current);
    if (accountOpen) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }
    if (!rendered) return undefined;
    setClosing(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    exitTimer.current = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, delay);
    return () => window.clearTimeout(exitTimer.current);
  }, [accountOpen, rendered]);
  useEffect(() => {
    if (!accountOpen) return undefined;
    closeButton.current?.focus();
    const closeOnEscape = (event) => event.key === "Escape" && closeAccount();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen, closeAccount]);
  if (!rendered) return null;
  return <div className={`account-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && closeAccount()}><section className="account-dialog" role="dialog" aria-modal="true" aria-label={viewer ? "个人中心" : "账户登录"}><button ref={closeButton} className="account-dialog-close" type="button" aria-label="关闭" onClick={closeAccount}><X size={19} /></button>{viewer ? <AccountCenter contentLookup={contentLookup} /> : <AccountAuth />}</section></div>;
}
