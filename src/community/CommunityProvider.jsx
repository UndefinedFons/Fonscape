import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const CommunityContext = createContext(null);

export function CommunityProvider({ children }) {
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [accountNotice, setAccountNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await api("/auth/session");
      setViewer(result.user);
      if (result.accountNotice) setAccountNotice(result.accountNotice);
    } catch {
      setViewer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 90000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const openAccount = useCallback((mode = "login") => {
    setAuthMode(mode);
    setAccountOpen(true);
  }, []);
  const markRepliesRead = useCallback(async (readThrough) => {
    await api("/me/notifications", { method: "PATCH", body: { readThrough } });
    setViewer((current) => current?.unreadReplies ? { ...current, unreadReplies: 0 } : current);
  }, []);
  const markAdminCommentsRead = useCallback(async (readThrough) => {
    await api("/me/admin-comments", { method: "PATCH", body: { readThrough } });
    setViewer((current) => current?.unreadAdminComments ? { ...current, unreadAdminComments: 0 } : current);
  }, []);

  const value = useMemo(() => ({
    viewer,
    loading,
    accountOpen,
    authMode,
    accountNotice,
    dismissAccountNotice: () => setAccountNotice(""),
    openAccount,
    closeAccount: () => setAccountOpen(false),
    setAuthMode,
    login: async (credentials) => {
      const result = await api("/auth/login", { method: "POST", body: credentials });
      setViewer(result.user);
      return result.user;
    },
    register: async (details) => {
      const result = await api("/auth/register", { method: "POST", body: details });
      setViewer(result.user);
      return result.user;
    },
    logout: async () => {
      await api("/auth/logout", { method: "POST" });
      setViewer(null);
    },
    updateViewer: setViewer,
    markRepliesRead,
    markAdminCommentsRead,
    refresh,
  }), [viewer, loading, accountOpen, authMode, accountNotice, openAccount, markRepliesRead, markAdminCommentsRead, refresh]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const value = useContext(CommunityContext);
  if (!value) throw new Error("useCommunity must be used inside CommunityProvider");
  return value;
}
