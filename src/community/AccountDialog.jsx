import { use, useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { Camera } from "@phosphor-icons/react/Camera";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { BellRinging } from "@phosphor-icons/react/BellRinging";
import { At } from "@phosphor-icons/react/At";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { X } from "@phosphor-icons/react/X";
import { Avatar } from "./Avatar.jsx";
import { AVATAR_MAX_BYTES, api, compressAvatar, contentHref, formatCommunityTime, validateAvatarFile } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";
import { loadSearchIndex } from "../content/index.js";
import { lockPageScroll } from "../lockPageScroll.js";

const commentsCache = new Map();
const commentsRequests = new Map();
const repliesCache = new Map();
const repliesRequests = new Map();
const receivedCommentsCache = new Map();
const receivedCommentsRequests = new Map();
let contentLookup = new Map();

function contentMeta(item) {
  if (item.contentType === "post") {
    if (item.contentSlug === "site-friends") return { title: "友链", section: "页面 · 友链" };
    if (item.contentSlug === "site-about") return { title: "关于我", section: "页面 · 关于" };
    const post = contentLookup.get(`post:${item.contentSlug}`);
    return { title: post?.title || item.contentSlug, section: `文章${post?.category ? ` · ${post.category}` : ""}` };
  }
  if (item.contentType === "poem") {
    const poem = contentLookup.get(`poem:${item.contentSlug}`);
    return { title: poem?.title || item.contentSlug, section: "小诗" };
  }
  const [section, slug] = String(item.contentSlug || "").split("/");
  const review = contentLookup.get(`music:${section}/${slug}`);
  return { title: item.contentTitle || review?.title || slug || item.contentSlug, section: `音乐 · ${review?.kind || "内容"}` };
}

function loadMyReplies(viewerId, refresh = false) {
  if (!refresh && repliesCache.has(viewerId)) return Promise.resolve(repliesCache.get(viewerId));
  if (repliesRequests.has(viewerId)) return repliesRequests.get(viewerId);
  const request = api("/me/replies").then((result) => {
    const feed = { items: result.replies || [] };
    repliesCache.set(viewerId, feed);
    repliesRequests.delete(viewerId);
    return feed;
  }).catch((error) => {
    repliesRequests.delete(viewerId);
    throw error;
  });
  repliesRequests.set(viewerId, request);
  return request;
}

function loadMyComments(viewerId, refresh = false) {
  if (!refresh && commentsCache.has(viewerId)) return Promise.resolve(commentsCache.get(viewerId));
  if (commentsRequests.has(viewerId)) return commentsRequests.get(viewerId);
  const request = api("/me/comments").then((result) => {
    commentsCache.set(viewerId, result.comments);
    commentsRequests.delete(viewerId);
    return result.comments;
  }).catch((error) => {
    commentsRequests.delete(viewerId);
    throw error;
  });
  commentsRequests.set(viewerId, request);
  return request;
}

function loadReceivedComments(viewerId, refresh = false) {
  if (!refresh && receivedCommentsCache.has(viewerId)) return Promise.resolve(receivedCommentsCache.get(viewerId));
  if (receivedCommentsRequests.has(viewerId)) return receivedCommentsRequests.get(viewerId);
  const request = api("/me/admin-comments").then((result) => {
    const feed = { items: result.comments || [] };
    receivedCommentsCache.set(viewerId, feed);
    receivedCommentsRequests.delete(viewerId);
    return feed;
  }).catch((error) => {
    receivedCommentsRequests.delete(viewerId);
    throw error;
  });
  receivedCommentsRequests.set(viewerId, request);
  return request;
}

function commentLinkProps(item, closeAccount, markRead) {
  const href = `${contentHref(item.contentType, item.contentSlug)}?comment=${encodeURIComponent(item.id)}`;
  return {
    href,
    onClick: (event) => {
      event.preventDefault();
      if (item.unread && markRead) Promise.resolve(markRead(item.id)).catch(() => {});
      closeAccount();
      const currentPath = window.location.hash.slice(1).split("?")[0];
      const nextPath = href.split("#")[1].split("?")[0];
      if (currentPath === nextPath) {
        window.history.replaceState(window.history.state, "", href);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("fonscape:locate-comment", { detail: { id: item.id } })), 320);
      } else {
        window.location.href = href;
      }
    },
  };
}

function AuthForm() {
  const { authMode, setAuthMode, login, register } = useCommunity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({ password: false, confirmation: false });
  useEffect(() => setVisiblePasswords({ password: false, confirmation: false }), [authMode]);
  const passwordField = (name, label, autoComplete) => {
    const visible = visiblePasswords[name];
    return <label><span>{label}</span><span className="community-input community-input--password"><LockKey size={18} /><input name={name === "confirmation" ? "passwordConfirmation" : "password"} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength="6" maxLength={authMode === "register" ? "20" : "128"} required placeholder={authMode === "register" ? (name === "confirmation" ? "再次输入密码" : "设置密码") : "输入你的密码"} /><button type="button" className="password-visibility-button" aria-label={visible ? `隐藏${label}` : `显示${label}`} aria-pressed={visible} onClick={() => setVisiblePasswords((current) => ({ ...current, [name]: !current[name] }))}>{visible ? <EyeSlash size={19} /> : <Eye size={19} />}</button></span></label>;
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (authMode === "register" && data.password !== data.passwordConfirmation) {
      setError("两次输入的密码不一致，请重新确认。");
      setBusy(false);
      return;
    }
    if (authMode === "register") {
      const username = String(data.username || "").trim();
      const password = String(data.password || "");
      const nickname = String(data.nickname || "").trim().replace(/\s+/gu, " ");
      if (!/^[A-Za-z0-9]{3,20}$/u.test(username)) {
        setError("账户名需为 3–20 位英文字母或数字。");
        setBusy(false);
        return;
      }
      if (!/^[A-Za-z0-9]{6,20}$/u.test(password)) {
        setError("密码需为 6–20 位英文字母或数字。");
        setBusy(false);
        return;
      }
      if (nickname.length < 1 || nickname.length > 10 || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(nickname)) {
        setError("昵称需为 1–10 个字符，可由任意语言的文字、字母或数字组成。");
        setBusy(false);
        return;
      }
    }
    delete data.passwordConfirmation;
    try {
      if (authMode === "register") await register(data);
      else await login(data);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="account-auth">
    <header className="account-auth-head"><div className="account-dialog-heading"><span className="account-dialog-icon"><UserCircle size={24} weight="duotone" /></span><div><small>FONSCAPE ACCOUNT</small><h2>{authMode === "register" ? "创建账户" : "欢迎回来"}</h2></div></div><div className="account-mode-tabs" data-active={authMode === "register" ? "right" : "left"} role="tablist" aria-label="账户操作"><button type="button" className={authMode === "login" ? "active" : ""} aria-selected={authMode === "login"} role="tab" onClick={() => { setAuthMode("login"); setError(""); }}>登录</button><button type="button" className={authMode === "register" ? "active" : ""} aria-selected={authMode === "register"} role="tab" onClick={() => { setAuthMode("register"); setError(""); }}>注册</button></div></header>
    <form className="community-form account-auth-form" onSubmit={submit}>
      {authMode === "register" && <label><span>昵称</span><span className="community-input"><UserCircle size={18} /><input name="nickname" autoComplete="nickname" minLength="1" maxLength="10" required placeholder="希望大家怎样称呼你" /></span></label>}
      <label><span>账户名</span><span className="community-input"><At size={18} /><input name="username" autoComplete="username" minLength="3" maxLength={authMode === "register" ? "20" : undefined} required placeholder={authMode === "register" ? "设置一个唯一账户名" : "输入你的账户名"} /></span></label>
      {passwordField("password", "密码", authMode === "register" ? "new-password" : "current-password")}
      {authMode === "register" && passwordField("confirmation", "确认密码", "new-password")}
      {error && <p className="community-form-error" role="alert">{error}</p>}
      <button className="community-primary-button" type="submit" disabled={busy}>{busy ? "请稍候…" : authMode === "register" ? "创建并登录" : "登录"}<ArrowRight size={17} /></button>
    </form>
  </div>;
}

function MyMessages() {
  const { viewer, closeAccount } = useCommunity();
  const cached = commentsCache.get(viewer.id);
  const [state, setState] = useState({ loading: !cached, error: "", comments: cached || [] });
  useEffect(() => {
    let alive = true;
    loadMyComments(viewer.id).then((comments) => alive && setState({ loading: false, error: "", comments })).catch((error) => alive && setState({ loading: false, error: error.message, comments: [] }));
    return () => { alive = false; };
  }, [viewer.id]);
  if (state.loading) return <div className="community-skeleton" aria-label="正在读取我的消息"><i /><i /><i /></div>;
  if (state.error) return <p className="community-inline-error">{state.error}</p>;
  if (!state.comments.length) return <div className="account-empty"><ChatCircleDots size={30} weight="duotone" /><p>还没有发表过评论或回复。</p></div>;
  return <div className="account-comment-list">{state.comments.map((comment) => {
    const meta = contentMeta(comment);
    const deleted = comment.status === "deleted";
    const isReply = Boolean(comment.parentId);
    return <a key={comment.id} {...commentLinkProps(comment, closeAccount)}><div className="account-message-heading"><em>{meta.section} ·《{meta.title}》</em><b className={`account-message-kind${isReply ? " is-reply" : ""}`}>{isReply && <Avatar user={comment.replyToUser || { nickname: comment.replyTo || "该用户" }} size="small" className="account-message-target-avatar" />}{isReply ? `回复 @${comment.replyTo || "该用户"}` : "评论"}</b></div><span className="account-message-body">{deleted && comment.body === "[已删除]" ? "这条旧消息的原文已不可恢复。" : comment.body}</span><small>{formatCommunityTime(comment.createdAt)}<b className={`comment-state comment-state--${comment.status}`}>{comment.status === "published" ? "公开" : comment.status === "hidden" ? "已隐藏" : "已删除"}</b></small></a>;
  })}</div>;
}

function MyReplies() {
  const { viewer, closeAccount, markReplyRead } = useCommunity();
  const cached = repliesCache.get(viewer.id);
  const [state, setState] = useState({ loading: !cached, error: "", replies: cached?.items || [] });
  useEffect(() => {
    let alive = true;
    loadMyReplies(viewer.id, true).then((feed) => {
      if (alive) setState({ loading: false, error: "", replies: feed.items });
    }).catch((error) => alive && setState({ loading: false, error: error.message, replies: [] }));
    return () => { alive = false; };
  }, [viewer.id]);
  if (state.loading) return <div className="community-skeleton" aria-label="正在读取收到的回复"><i /><i /><i /></div>;
  if (state.error) return <p className="community-inline-error">{state.error}</p>;
  if (!state.replies.length) return <div className="account-empty"><BellRinging size={30} weight="duotone" /><p>还没有收到回复。</p></div>;
  return <div className="account-reply-list">{state.replies.map((reply) => {
    const meta = contentMeta(reply);
    return <a className={reply.unread ? "is-unread" : ""} key={reply.id} {...commentLinkProps(reply, closeAccount, markReplyRead)}><Avatar user={reply.author} size="small" /><div><header><strong>{reply.author.nickname}</strong><span>回复了你</span>{reply.unread && <i>新消息</i>}</header><em>{meta.section} ·《{meta.title}》</em><p className="account-message-body">{reply.body}</p>{reply.repliedToBody && <blockquote>你的评论：{reply.repliedToBody}</blockquote>}<small>{formatCommunityTime(reply.createdAt)}</small></div></a>;
  })}</div>;
}

function ReceivedComments() {
  const { viewer, closeAccount, markAdminCommentRead } = useCommunity();
  const cached = receivedCommentsCache.get(viewer.id);
  const [state, setState] = useState({ loading: !cached, error: "", comments: cached?.items || [] });
  useEffect(() => {
    let alive = true;
    loadReceivedComments(viewer.id, true).then((feed) => {
      if (alive) setState({ loading: false, error: "", comments: feed.items });
    }).catch((error) => alive && setState({ loading: false, error: error.message, comments: [] }));
    return () => { alive = false; };
  }, [viewer.id]);
  if (state.loading) return <div className="community-skeleton" aria-label="正在读取收到的评论"><i /><i /><i /></div>;
  if (state.error) return <p className="community-inline-error">{state.error}</p>;
  if (!state.comments.length) return <div className="account-empty"><ChatCircleDots size={30} weight="duotone" /><p>还没有收到评论。</p></div>;
  return <div className="account-reply-list account-received-list">{state.comments.map((comment) => {
    const meta = contentMeta(comment);
    return <a className={comment.unread ? "is-unread" : ""} key={comment.id} {...commentLinkProps(comment, closeAccount, markAdminCommentRead)}><Avatar user={comment.author} size="small" /><div><header><strong>{comment.author.nickname}</strong><span>留下了评论</span>{comment.unread && <i>新评论</i>}</header><em>{meta.section} ·《{meta.title}》</em><p className="account-message-body">{comment.body}</p><small>{formatCommunityTime(comment.createdAt)}</small></div></a>;
  })}</div>;
}

function AccountCenter() {
  const { viewer, logout, updateViewer, closeAccount } = useCommunity();
  const adminTabs = viewer.role === "admin";
  const [tab, setTab] = useState("profile");
  const [nickname, setNickname] = useState(viewer.nickname);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [crop, setCrop] = useState(null);
  const uploadRef = useRef(null);
  const cropGesture = useRef(null);
  const cropCanvas = useRef(null);
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
  const cropUrl = crop?.url;
  const cropRotation = crop?.rotation;
  const cropStageAspect = crop?.stageAspect;
  useEffect(() => {
    if (!cropUrl || cropRotation == null || cropStageAspect == null || !cropCanvas.current) return undefined;
    const canvas = cropCanvas.current;
    const context = canvas.getContext("2d");
    const image = new Image();
    image.onload = () => {
      const width = 640;
      const height = Math.round(width / cropStageAspect);
      canvas.width = width; canvas.height = height;
      context.clearRect(0, 0, width, height);
      const quarterTurn = Math.abs(cropRotation % 180) === 90;
      const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
      const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
      const scale = Math.min(width / rotatedWidth, height / rotatedHeight);
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(cropRotation * Math.PI / 180);
      context.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      context.restore();
    };
    image.src = cropUrl;
    return () => { image.onload = null; };
  }, [cropUrl, cropRotation, cropStageAspect]);
  const imageBounds = (value) => {
    const quarterTurn = Math.abs(value.rotation % 180) === 90;
    const width = quarterTurn ? value.height : value.width;
    const height = quarterTurn ? value.width : value.height;
    const stageHeight = 1 / value.stageAspect;
    const scale = Math.min(1 / width, stageHeight / height);
    const imageWidth = width * scale;
    const imageHeight = height * scale;
    return { x: (1 - imageWidth) / 2, y: (stageHeight - imageHeight) / 2, width: imageWidth, height: imageHeight };
  };
  const rotateCrop = () => setCrop((value) => {
    if (!value) return value;
    const rotation = (value.rotation + 90) % 360;
    const orientedAspect = rotation % 180 === 90 ? value.height / value.width : value.width / value.height;
    const next = { ...value, rotation, stageAspect: Math.min(1.5, Math.max(.72, orientedAspect)) };
    const bounds = imageBounds(next);
    const size = Math.min(bounds.width, bounds.height);
    return { ...next, cropX: bounds.x + (bounds.width - size) / 2, cropY: bounds.y + (bounds.height - size) / 2, cropSize: size };
  });
  const startCropDrag = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropGesture.current = { mode: event.target.dataset.corner ? "resize" : "move", corner: event.target.dataset.corner || "", pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop: { ...crop } };
  };
  const moveCrop = (event) => {
    const gesture = cropGesture.current;
    if (!gesture) return;
    if (event.pointerType === "mouse" && event.buttons === 0) { cropGesture.current = null; return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - gesture.x) / bounds.width;
    const dy = (event.clientY - gesture.y) / bounds.width;
    const image = imageBounds(gesture.crop);
    if (gesture.mode === "resize") {
      const minimum = Math.min(image.width, image.height) * .2;
      const pointerX = gesture.crop.cropX + (event.clientX - gesture.x) / bounds.width + ({ nw: 0, sw: 0, ne: gesture.crop.cropSize, se: gesture.crop.cropSize }[gesture.corner] || 0);
      const pointerY = gesture.crop.cropY + (event.clientY - gesture.y) / bounds.width + ({ nw: 0, ne: 0, sw: gesture.crop.cropSize, se: gesture.crop.cropSize }[gesture.corner] || 0);
      const right = gesture.crop.cropX + gesture.crop.cropSize;
      const bottom = gesture.crop.cropY + gesture.crop.cropSize;
      let size; let cropX = gesture.crop.cropX; let cropY = gesture.crop.cropY;
      if (gesture.corner === "nw") { size = Math.min(right - pointerX, bottom - pointerY, right - image.x, bottom - image.y); cropX = right - size; cropY = bottom - size; }
      if (gesture.corner === "ne") { size = Math.min(pointerX - gesture.crop.cropX, bottom - pointerY, image.x + image.width - gesture.crop.cropX, bottom - image.y); cropY = bottom - size; }
      if (gesture.corner === "sw") { size = Math.min(right - pointerX, pointerY - gesture.crop.cropY, right - image.x, image.y + image.height - gesture.crop.cropY); cropX = right - size; }
      if (gesture.corner === "se") size = Math.min(pointerX - gesture.crop.cropX, pointerY - gesture.crop.cropY, image.x + image.width - gesture.crop.cropX, image.y + image.height - gesture.crop.cropY);
      size = Math.max(minimum, size || minimum);
      if (gesture.corner === "nw") { cropX = right - size; cropY = bottom - size; }
      if (gesture.corner === "ne") cropY = bottom - size;
      if (gesture.corner === "sw") cropX = right - size;
      setCrop((value) => ({ ...value, cropX, cropY, cropSize: size }));
    } else {
      setCrop((value) => ({ ...value,
        cropX: Math.min(image.x + image.width - gesture.crop.cropSize, Math.max(image.x, gesture.crop.cropX + dx)),
        cropY: Math.min(image.y + image.height - gesture.crop.cropSize, Math.max(image.y, gesture.crop.cropY + dy)),
      }));
    }
  };
  const endCropDrag = () => { cropGesture.current = null; };
  useEffect(() => {
    window.addEventListener("pointerup", endCropDrag, true);
    window.addEventListener("pointercancel", endCropDrag, true);
    window.addEventListener("blur", endCropDrag);
    return () => { window.removeEventListener("pointerup", endCropDrag, true); window.removeEventListener("pointercancel", endCropDrag, true); window.removeEventListener("blur", endCropDrag); };
  }, []);
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
    {crop && <section className="avatar-crop-panel" aria-label="裁剪和旋转头像"><header><strong>裁剪和旋转</strong><p>拖动方框调整位置，拖动任意角改变裁剪范围。</p></header><div className="avatar-crop-layout"><div className="avatar-crop-stage" style={{ aspectRatio: crop.stageAspect }} onPointerMove={moveCrop} onPointerUp={endCropDrag} onPointerCancel={endCropDrag}><canvas ref={cropCanvas} aria-label="待裁切头像预览" /><div className="avatar-crop-selection" style={{ left: `${crop.cropX * 100}%`, top: `${crop.cropY * crop.stageAspect * 100}%`, width: `${crop.cropSize * 100}%`, aspectRatio: "1 / 1" }} role="group" aria-label="头像裁剪区域" onPointerDown={startCropDrag} onLostPointerCapture={endCropDrag}><i data-corner="nw" /><i data-corner="ne" /><i data-corner="sw" /><i data-corner="se" /></div></div><button className="avatar-rotate-button" type="button" onClick={rotateCrop}><ArrowClockwise size={20} />旋转</button></div><footer><button type="button" onClick={() => setCrop(null)} disabled={busy}>取消</button><button type="button" className="community-primary-button" onClick={applyCrop} disabled={busy}>{busy ? "处理中…" : "使用这个范围"}</button></footer></section>}
    {!crop && <><div className={`account-mode-tabs account-mode-tabs--center${adminTabs ? " account-mode-tabs--admin" : ""}`} data-active={tab} role="tablist" aria-label="个人中心"><button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>个人资料</button><button type="button" role="tab" aria-selected={tab === "comments"} className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>我的消息</button>{adminTabs && <button type="button" role="tab" aria-selected={tab === "received"} className={tab === "received" ? "active" : ""} onClick={() => setTab("received")}><span>收到评论</span>{viewer.unreadAdminComments > 0 && <em>{viewer.unreadAdminComments > 99 ? "99+" : viewer.unreadAdminComments}</em>}</button>}<button type="button" role="tab" aria-selected={tab === "replies"} className={tab === "replies" ? "active" : ""} onClick={() => setTab("replies")}><span>收到回复</span>{viewer.unreadReplies > 0 && <em>{viewer.unreadReplies > 99 ? "99+" : viewer.unreadReplies}</em>}</button></div>
    <div className="account-tab-panel">
      {tab === "profile" ? <form className="community-form account-profile-form" onSubmit={saveProfile}><label><span>公开昵称</span><span className="community-input"><UserCircle size={18} /><input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength="1" maxLength="10" required /></span></label><label><span>登录账户</span><span className="community-input is-readonly"><At size={18} /><input value={viewer.username} readOnly /></span></label>{message && <p className="community-form-message" role="status">{message}</p>}<button className="account-nickname-save" type="submit" disabled={busy || nickname.trim() === viewer.nickname}>保存昵称</button></form> : tab === "comments" ? <MyMessages /> : tab === "received" ? <ReceivedComments /> : <MyReplies />}
    </div>
    <footer className="account-center-actions"><button type="button" onClick={signOut} disabled={busy}><SignOut size={17} />退出登录</button></footer></>}
  </>;
  return <div className={`account-center${crop ? " is-cropping" : ""}`}>
    <header className="account-profile-header"><div className="account-avatar-control"><Avatar user={viewer} size="large" /><button type="button" onClick={() => uploadRef.current?.click()} aria-label="更换头像" disabled={busy}><Camera size={17} /></button><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} hidden /></div><div><small>{viewer.role === "admin" ? "FONSCAPE ADMIN" : "FONSCAPE MEMBER"}</small><h2>{viewer.nickname}</h2><p>@{viewer.username}</p></div></header>
    {crop ? <div className="account-crop-scroll">{centerBody}</div> : centerBody}
  </div>;
}

export function AccountDialog() {
  const indexedContent = use(loadSearchIndex());
  contentLookup = new Map(indexedContent.map((entry) => [`${entry.type}:${entry.key}`, entry]));
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
  return <div className={`account-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && closeAccount()}><section className="account-dialog" role="dialog" aria-modal="true" aria-label={viewer ? "个人中心" : "账户登录"}><button ref={closeButton} className="account-dialog-close" type="button" aria-label="关闭" onClick={closeAccount}><X size={19} /></button>{viewer ? <AccountCenter /> : <AuthForm />}</section></div>;
}
