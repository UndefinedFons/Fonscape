import { CopySimple } from "@phosphor-icons/react/CopySimple";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { useEffect, useState } from "react";
import { CommentsSection } from "../community/CommentsSection.jsx";
import { useCommunity } from "../community/CommunityProvider.jsx";
import { api } from "../community/api.js";
import { PageHero } from "../components/PageHero.jsx";
import { friendLinks, siteConfig } from "../content/index.js";

export function FriendRequestGuide() {
  const [values, setValues] = useState({ site: "", url: "", description: "", color: "#ffb7c5" });
  const [copyState, setCopyState] = useState("");
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const escapeValue = (value, fallback) => String(value || fallback).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const requestText = [
    "【友链申请】",
    `site: "${escapeValue(values.site, "我的博客")}"`,
    `url: "${escapeValue(values.url, "https://example.com")}"`,
    `desc: "${escapeValue(values.description, "向大家介绍你的站点")}"`,
    `color: "${escapeValue(values.color, "#ffb7c5")}"`,
  ].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requestText);
      setCopyState("已复制");
    } catch {
      setCopyState("复制失败");
    }
    window.setTimeout(() => setCopyState(""), 1600);
  };
  return <section className="friend-request material-panel" aria-labelledby="friend-request-title"><header><h2 id="friend-request-title">申请友链</h2><p>填写站点资料，复制生成的格式，再登录并粘贴到下方评论区。友链站长名称会使用你发表评论时的账户昵称。</p></header><div className="friend-request-body"><form onSubmit={(event) => event.preventDefault()}><label className="friend-request-wide"><span>站点名称</span><input value={values.site} onChange={update("site")} placeholder="我的博客" /></label><label className="friend-request-wide"><span>站点地址</span><input type="url" value={values.url} onChange={update("url")} placeholder="https://example.com" /></label><label className="friend-request-wide"><span>站点简介</span><input value={values.description} onChange={update("description")} placeholder="向大家介绍你的站点" /></label><label className="friend-request-wide friend-color-row"><span>主题色</span><span className="friend-color-input"><input type="color" value={values.color} onChange={update("color")} aria-label="选择主题色" /><input value={values.color} onChange={update("color")} pattern="#[0-9a-fA-F]{6}" aria-label="主题色十六进制值" /></span></label></form><div className="friend-request-preview"><div><strong>申请格式</strong><button type="button" onClick={copy} aria-live="polite"><CopySimple size={16} />{copyState || "复制格式"}</button></div><pre>{requestText}</pre><p>请将复制的内容粘贴到下方评论区；确认信息后，我会把入口加入友链。</p></div></div></section>;
}

function friendHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return value;
  }
}

function normalizeFriendColor(value) {
  return /^#[0-9a-f]{6}$/iu.test(String(value || "")) ? String(value).toLowerCase() : "#ffb7c5";
}

function friendCardStyle(value) {
  const color = normalizeFriendColor(value);
  return {
    "--friend-color": color,
  };
}

function friendAvatarSource(friend, viewer) {
  const userId = String(friend.userId || "").trim();
  if (!userId) return friend.avatar || "";
  if (String(viewer?.id || "") === userId && viewer.avatarUrl) return viewer.avatarUrl;
  return `/api/avatar/${encodeURIComponent(userId)}`;
}

function useFriendProfiles() {
  const [profiles, setProfiles] = useState({});
  useEffect(() => {
    const userIds = [...new Set(friendLinks.map((friend) => String(friend.userId || "").trim()).filter(Boolean))];
    if (!userIds.length) return undefined;
    const controller = new AbortController();
    Promise.all(userIds.map(async (userId) => {
      try {
        const result = await api(`/profile/${encodeURIComponent(userId)}`, { signal: controller.signal });
        return [userId, result.profile];
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!controller.signal.aborted) setProfiles(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => controller.abort();
  }, []);
  return profiles;
}

export function FriendsPage() {
  const { viewer } = useCommunity();
  const profiles = useFriendProfiles();
  return (
    <main>
      <PageHero kicker="FRIEND LINKS" title="友链" description={siteConfig.pages.friendsDescription} icon={LinkSimple} variant="friends" />
      <section className="friends-layout page-width">
        {friendLinks.length ? (
          <div className="friend-grid">
            {friendLinks.map((friend) => {
              const userId = String(friend.userId || "").trim();
              const accountProfile = String(viewer?.id || "") === userId ? viewer : profiles[userId];
              const avatarSource = accountProfile?.avatarUrl || friendAvatarSource(friend, viewer);
              const owner = accountProfile?.nickname || friend.owner;
              return <a className="friend-card" href={friend.url} target="_blank" rel="noreferrer" key={friend.url} aria-label={`打开${friend.name || "友链"}站点`} style={friendCardStyle(friend.color)}>
                <span className="friend-card-layout">
                  <span className="friend-card-avatar">{avatarSource ? <img src={avatarSource} alt="" loading="lazy" decoding="async" /> : <b aria-hidden="true">{friend.name?.trim().slice(0, 1) || "友"}</b>}</span>
                  <span className="friend-card-copy"><span className="friend-card-label">站点</span><strong>{friend.name}</strong><span className="friend-card-description"><small>简介</small><em>{friend.description}</em></span><span className="friend-card-owner"><LinkSimple size={15} weight="duotone" /><span><b>{friendHost(friend.url)}</b>{owner && <small>站长 · {owner}</small>}</span></span><span className="friend-card-meta"><i aria-hidden="true" /><span>{normalizeFriendColor(friend.color)}</span></span></span>
                </span>
              </a>
            })}
          </div>
        ) : <div className="friends-empty material-panel"><LinkSimple size={38} weight="duotone" /><h2>暂无友链</h2></div>}
        <FriendRequestGuide />
        <div className="material-panel comments-material-panel"><CommentsSection targetType="post" slug="site-friends" /></div>
      </section>
    </main>
  );
}
