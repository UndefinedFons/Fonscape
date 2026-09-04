import { useEffect, useRef, useState } from "react";
import { At } from "@phosphor-icons/react/At";
import { Camera } from "@phosphor-icons/react/Camera";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { Avatar } from "./Avatar.jsx";
import { AVATAR_MAX_BYTES, api, compressAvatar, validateAvatarFile } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";
import { loadMyComments, loadMyReplies, loadReceivedComments } from "./accountData.js";
import { MyMessages, MyReplies, ReceivedComments } from "./AccountFeeds.jsx";
import { AvatarCropper } from "./AvatarCropper.jsx";

export function AccountCenter({ contentLookup }) {
  const { viewer, logout, updateViewer, closeAccount } = useCommunity();
  const adminTabs = viewer.role === "admin";
  const [tab, setTab] = useState("profile");
  const [nickname, setNickname] = useState(viewer.nickname);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [crop, setCrop] = useState(null);
  const uploadRef = useRef(null);
  useEffect(() => {
    loadMyComments(viewer.id).catch(() => {});
    loadMyReplies(viewer.id).catch(() => {});
    if (adminTabs) loadReceivedComments(viewer.id).catch(() => {});
  }, [adminTabs, viewer.id]);
  useEffect(() => () => { if (crop?.url) URL.revokeObjectURL(crop.url); }, [crop?.url]);
  const saveProfile = async (event) => {
    event.preventDefault();
    const normalizedNickname = nickname.trim().replace(/\s+/gu, " ");
    if (normalizedNickname.length < 1 || normalizedNickname.length > 10 || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(normalizedNickname)) {
      setMessage("昵称需为 1–10 个字符，可由任意语言的文字、字母或数字组成。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/me", { method: "PATCH", body: { nickname } });
      updateViewer(result.user);
      setMessage("昵称已更新。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const chooseAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await validateAvatarFile(file);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    setMessage("");
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const aspect = image.naturalWidth / image.naturalHeight;
      const stageAspect = Math.min(1.5, Math.max(.72, aspect));
      const stageHeight = 1 / stageAspect;
      const scale = Math.min(1 / image.naturalWidth, stageHeight / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      const size = Math.min(imageWidth, imageHeight);
      setCrop({ file, url, width: image.naturalWidth, height: image.naturalHeight, rotation: 0, stageAspect, cropX: (1 - size) / 2, cropY: (stageHeight - size) / 2, cropSize: size });
    };
    image.onerror = () => { URL.revokeObjectURL(url); setMessage("无法读取这张图片，请换一张重试。"); };
    image.src = url;
  };
  const applyCrop = async () => {
    if (!crop) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await compressAvatar(crop.file, crop);
      if (blob.type !== "image/webp" || !blob.size || blob.size > AVATAR_MAX_BYTES) {
        throw new Error("头像处理结果无效或超过 100 KB，请换一张图片重试。");
      }
      const result = await api("/me/avatar", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
      updateViewer(result.user);
      setMessage("头像已更新。");
      setCrop(null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try { await logout(); closeAccount(); } finally { setBusy(false); }
  };
  const centerBody = <>
    {crop && <AvatarCropper crop={crop} onChange={setCrop} onCancel={() => setCrop(null)} onApply={applyCrop} busy={busy} />}
    {!crop && <><div className={`account-mode-tabs account-mode-tabs--center${adminTabs ? " account-mode-tabs--admin" : ""}`} data-active={tab} role="tablist" aria-label="个人中心"><button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>个人资料</button><button type="button" role="tab" aria-selected={tab === "comments"} className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>我的消息</button>{adminTabs && <button type="button" role="tab" aria-selected={tab === "received"} className={tab === "received" ? "active" : ""} onClick={() => setTab("received")}><span>收到评论</span>{viewer.unreadAdminComments > 0 && <em>{viewer.unreadAdminComments > 99 ? "99+" : viewer.unreadAdminComments}</em>}</button>}<button type="button" role="tab" aria-selected={tab === "replies"} className={tab === "replies" ? "active" : ""} onClick={() => setTab("replies")}><span>收到回复</span>{viewer.unreadReplies > 0 && <em>{viewer.unreadReplies > 99 ? "99+" : viewer.unreadReplies}</em>}</button></div>
    <div className="account-tab-panel">
      {tab === "profile" ? <form className="community-form account-profile-form" onSubmit={saveProfile}><label><span>公开昵称</span><span className="community-input"><UserCircle size={18} /><input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength="1" maxLength="10" required /></span></label><label><span>登录账户</span><span className="community-input is-readonly"><At size={18} /><input value={viewer.username} readOnly /></span></label>{message && <p className="community-form-message" role="status">{message}</p>}<button className="account-nickname-save" type="submit" disabled={busy || nickname.trim() === viewer.nickname}>保存昵称</button></form> : tab === "comments" ? <MyMessages contentLookup={contentLookup} /> : tab === "received" ? <ReceivedComments contentLookup={contentLookup} /> : <MyReplies contentLookup={contentLookup} />}
    </div>
    <footer className="account-center-actions"><button type="button" onClick={signOut} disabled={busy}><SignOut size={17} />退出登录</button></footer></>}
  </>;
  return <div className={`account-center${crop ? " is-cropping" : ""}`}>
    <header className="account-profile-header"><div className="account-avatar-control"><Avatar user={viewer} size="large" /><button type="button" onClick={() => uploadRef.current?.click()} aria-label="更换头像" disabled={busy}><Camera size={17} /></button><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} hidden /></div><div><small>{viewer.role === "admin" ? "FONSCAPE ADMIN" : "FONSCAPE MEMBER"}</small><h2>{viewer.nickname}</h2><p>@{viewer.username}</p></div></header>
    {crop ? <div className="account-crop-scroll">{centerBody}</div> : centerBody}
  </div>;
}
