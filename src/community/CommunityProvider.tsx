import { siteConfig } from "../siteConfig.ts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api.ts";
import type { PublicUser } from "../types.ts";
import { invalidateAccountData } from "./accountData.ts";

export interface CommunityContextValue {
  viewer: PublicUser | null;
  loading: boolean;
  accountOpen: boolean;
  authMode: string;
  accountNotice: string;
  dismissAccountNotice: () => void;
  openAccount: (mode?: string) => void;
  closeAccount: () => void;
  setAuthMode: (mode: string) => void;
  login: (credentials: Record<string, unknown>) => Promise<PublicUser | null>;
  register: (details: Record<string, unknown>) => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  updateViewer: (user: PublicUser | null) => void;
  markReplyRead: (commentId: string) => Promise<void>;
  markAdminCommentRead: (commentId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export type AuthenticatedCommunityContext = CommunityContextValue & { viewer: PublicUser };

const CommunityContext = createContext<CommunityContextValue | null>(null);

export function CommunityProvider({ children }: { children?: ReactNode }) {
  const [viewer, setViewer] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState<boolean>(siteConfig.showCommunity as boolean);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [accountNotice, setAccountNotice] = useState("");
  const viewerId = useRef<string | null>(null);
  const updateViewer = useCallback((user: PublicUser | null) => {
    const nextId = user?.id || null;
    if (viewerId.current !== nextId) invalidateAccountData();
    viewerId.current = nextId;
    setViewer(user);
  }, []);

  const refresh = useCallback(async () => {
    if (!siteConfig.showCommunity) return;
    try {
      const result = await api("/auth/session");
      updateViewer(result.user);
      if (result.accountNotice) setAccountNotice(result.accountNotice);
    } catch {
      updateViewer(null);
    } finally {
      setLoading(false);
    }
  }, [updateViewer]);

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
  const markReplyRead = useCallback(async (commentId: string) => {
    await api(`/me/notifications/${encodeURIComponent(commentId)}`, { method: "PATCH" });
    invalidateAccountData();
    setViewer((current) => current?.unreadReplies ? { ...current, unreadReplies: Math.max(0, Number(current.unreadReplies) - 1) } : current);
  }, []);
  const markAdminCommentRead = useCallback(async (commentId: string) => {
    await api(`/me/admin-comments/${encodeURIComponent(commentId)}`, { method: "PATCH" });
    invalidateAccountData();
    setViewer((current) => current?.unreadAdminComments ? { ...current, unreadAdminComments: Math.max(0, Number(current.unreadAdminComments) - 1) } : current);
  }, []);

  const value = useMemo<CommunityContextValue>(() => ({
    viewer,
    loading,
    accountOpen,
    authMode,
    accountNotice,
    dismissAccountNotice: () => setAccountNotice(""),
    openAccount,
    closeAccount: () => setAccountOpen(false),
    setAuthMode,
    login: async (credentials: Record<string, unknown>) => {
      const result = await api("/auth/login", { method: "POST", body: credentials });
      invalidateAccountData();
      updateViewer(result.user);
      return result.user;
    },
    register: async (details: Record<string, unknown>) => {
      const result = await api("/auth/register", { method: "POST", body: details });
      invalidateAccountData();
      updateViewer(result.user);
      return result.user;
    },
    logout: async () => {
      await api("/auth/logout", { method: "POST" });
      invalidateAccountData();
      updateViewer(null);
    },
    updateViewer,
    markReplyRead,
    markAdminCommentRead,
    refresh,
  }), [viewer, loading, accountOpen, authMode, accountNotice, openAccount, updateViewer, markReplyRead, markAdminCommentRead, refresh]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

/** @returns {CommunityContextValue} */
export function useCommunity(): CommunityContextValue {
  const value = useContext(CommunityContext);
  if (!value) throw new Error("useCommunity must be used inside CommunityProvider");
  return value;
}
