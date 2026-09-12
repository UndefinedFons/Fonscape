import { siteConfig } from "../siteConfig.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

/**
 * @typedef {object} CommunityContextValue
 * @property {import("../types.js").PublicUser | null} viewer
 * @property {boolean} loading
 * @property {boolean} accountOpen
 * @property {string} authMode
 * @property {string} accountNotice
 * @property {() => void} dismissAccountNotice
 * @property {(mode?: string) => void} openAccount
 * @property {() => void} closeAccount
 * @property {(mode: string) => void} setAuthMode
 * @property {(credentials: Record<string, unknown>) => Promise<import("../types.js").PublicUser | null>} login
 * @property {(details: Record<string, unknown>) => Promise<import("../types.js").PublicUser | null>} register
 * @property {() => Promise<void>} logout
 * @property {(user: import("../types.js").PublicUser | null) => void} updateViewer
 * @property {(commentId: string) => Promise<void>} markReplyRead
 * @property {(commentId: string) => Promise<void>} markAdminCommentRead
 * @property {() => Promise<void>} refresh
 */

const CommunityContext = createContext(/** @type {CommunityContextValue | null} */ (null));

/** @param {{ children?: import("react").ReactNode }} props */
export function CommunityProvider({ children }) {
  const [viewer, setViewer] = useState(/** @type {import("../types.js").PublicUser | null} */ (null));
  const [loading, setLoading] = useState(/** @type {boolean} */ (siteConfig.showCommunity));
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [accountNotice, setAccountNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!siteConfig.showCommunity) return;
    try {
      const result = /** @type {import("../types.d.ts").SessionResponse} */ (await api("/auth/session"));
      setViewer(result.user);
      if (result.accountNotice) setAccountNotice(result.accountNotice);
    } catch {
      setViewer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!siteConfig.showCommunity) return undefined;
    refresh();
    const timer = window.setInterval(refresh, 90000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const openAccount = useCallback((mode = "login") => {
    if (!siteConfig.showCommunity) return;
    setAuthMode(mode);
    setAccountOpen(true);
  }, []);
  const markReplyRead = useCallback(async (/** @type {string} */ commentId) => {
    await api(`/me/notifications/${encodeURIComponent(commentId)}`, { method: "PATCH" });
    setViewer((current) => current?.unreadReplies ? { ...current, unreadReplies: Math.max(0, Number(current.unreadReplies) - 1) } : current);
  }, []);
  const markAdminCommentRead = useCallback(async (/** @type {string} */ commentId) => {
    await api(`/me/admin-comments/${encodeURIComponent(commentId)}`, { method: "PATCH" });
    setViewer((current) => current?.unreadAdminComments ? { ...current, unreadAdminComments: Math.max(0, Number(current.unreadAdminComments) - 1) } : current);
  }, []);

  const value = useMemo(/** @returns {CommunityContextValue} */ () => ({
    viewer,
    loading,
    accountOpen,
    authMode,
    accountNotice,
    dismissAccountNotice: () => setAccountNotice(""),
    openAccount,
    closeAccount: () => setAccountOpen(false),
    setAuthMode,
    login: async (/** @type {Record<string, unknown>} */ credentials) => {
      const result = /** @type {import("../types.d.ts").SessionResponse} */ (
        await api("/auth/login", { method: "POST", body: credentials })
      );
      setViewer(result.user);
      return result.user;
    },
    register: async (/** @type {Record<string, unknown>} */ details) => {
      const result = /** @type {import("../types.d.ts").SessionResponse} */ (
        await api("/auth/register", { method: "POST", body: details })
      );
      setViewer(result.user);
      return result.user;
    },
    logout: async () => {
      await api("/auth/logout", { method: "POST" });
      setViewer(null);
    },
    updateViewer: setViewer,
    markReplyRead,
    markAdminCommentRead,
    refresh,
  }), [viewer, loading, accountOpen, authMode, accountNotice, openAccount, markReplyRead, markAdminCommentRead, refresh]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

/** @returns {CommunityContextValue} */
export function useCommunity() {
  const value = useContext(CommunityContext);
  if (!value) throw new Error("useCommunity must be used inside CommunityProvider");
  return value;
}
