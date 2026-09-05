import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { BellRinging } from "@phosphor-icons/react/BellRinging";
import { Avatar } from "./Avatar.jsx";
import { useCommunity } from "./CommunityProvider.jsx";
import { cachedMyComments, cachedMyReplies, cachedReceivedComments, commentLinkProps, contentMeta, loadMyComments, loadMyReplies, loadReceivedComments } from "./accountData.js";
import { formatCommunityTime } from "./api.js";
import { useEffect, useState } from "react";

export function MyMessages({ contentLookup }) {
  const { viewer, closeAccount } = useCommunity();
  const cached = cachedMyComments(viewer.id);
  const [state, setState] = useState({ loading: !cached, error: "", comments: cached || [] });
  useEffect(() => {
    let alive = true;
    const cachedRequest = loadMyComments(viewer.id);
    cachedRequest.then((comments) => alive && setState({ loading: false, error: "", comments })).catch((error) => alive && setState({ loading: false, error: error.message, comments: [] }));
    return () => { alive = false; };
  }, [viewer.id]);
  if (state.loading) return <div className="community-skeleton" aria-label="正在读取我的消息"><i /><i /><i /></div>;
  if (state.error) return <p className="community-inline-error">{state.error}</p>;
  if (!state.comments.length) return <div className="account-empty"><ChatCircleDots size={30} weight="duotone" /><p>还没有发表过评论或回复。</p></div>;
  return <div className="account-comment-list">{state.comments.map((comment) => {
    const meta = contentMeta(comment, contentLookup);
    const deleted = comment.status === "deleted";
    const isReply = Boolean(comment.parentId);
    return <a key={comment.id} {...commentLinkProps(comment, closeAccount)}><div className="account-message-heading"><em>{meta.section} ·《{meta.title}》</em><b className={`account-message-kind${isReply ? " is-reply" : ""}`}>{isReply && <Avatar user={comment.replyToUser || { nickname: comment.replyTo || "该用户" }} size="small" className="account-message-target-avatar" />}{isReply ? `回复 @${comment.replyTo || "该用户"}` : "评论"}</b></div><span className="account-message-body">{deleted && comment.body === "[已删除]" ? "这条旧消息的原文已不可恢复。" : comment.body}</span><small>{formatCommunityTime(comment.createdAt)}<b className={`comment-state comment-state--${comment.status}`}>{comment.status === "published" ? "公开" : comment.status === "hidden" ? "已隐藏" : "已删除"}</b></small></a>;
  })}</div>;
}

export function MyReplies({ contentLookup }) {
  const { viewer, closeAccount, markReplyRead } = useCommunity();
  const cached = cachedMyReplies(viewer.id);
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
    const meta = contentMeta(reply, contentLookup);
    return <a className={reply.unread ? "is-unread" : ""} key={reply.id} {...commentLinkProps(reply, closeAccount, markReplyRead)}><Avatar user={reply.author} size="small" /><div><header><strong>{reply.author.nickname}</strong><span>回复了你</span>{reply.unread && <i>新消息</i>}</header><em>{meta.section} ·《{meta.title}》</em><p className="account-message-body">{reply.body}</p>{reply.repliedToBody && <blockquote>你的评论：{reply.repliedToBody}</blockquote>}<small>{formatCommunityTime(reply.createdAt)}</small></div></a>;
  })}</div>;
}

export function ReceivedComments({ contentLookup }) {
  const { viewer, closeAccount, markAdminCommentRead } = useCommunity();
  const cached = cachedReceivedComments(viewer.id);
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
    const meta = contentMeta(comment, contentLookup);
    return <a className={comment.unread ? "is-unread" : ""} key={comment.id} {...commentLinkProps(comment, closeAccount, markAdminCommentRead)}><Avatar user={comment.author} size="small" /><div><header><strong>{comment.author.nickname}</strong><span>留下了评论</span>{comment.unread && <i>新评论</i>}</header><em>{meta.section} ·《{meta.title}》</em><p className="account-message-body">{comment.body}</p><small>{formatCommunityTime(comment.createdAt)}</small></div></a>;
  })}</div>;
}
