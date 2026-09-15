import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { Check } from "@phosphor-icons/react/Check";
import { CopySimple } from "@phosphor-icons/react/CopySimple";
import { Trash } from "@phosphor-icons/react/Trash";
import { Avatar } from "./Avatar.jsx";
import { api, formatCommunityTime } from "./api.js";
import { useCommunity } from "./CommunityProvider.jsx";
import { friendEntryJson, parseFriendApplication } from "./friendApplication.js";
import { StableCommentComposer } from "./CommentComposer.jsx";
import { ReplyEditor } from "./ReplyEditor.jsx";
import { readCommentTarget } from "./commentUtils.js";

function CommentItemImpl({ comment, replies, targetType, slug, onRefresh, locatedCommentId, activeReplyId, closingReplyId, replySwitchInProgress, onReplyOpen, onReplyClose, onReplyClosed, friendApplicationEnabled = false, compact = false }) {
  const { viewer, openAccount } = useCommunity();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [copyState, setCopyState] = useState("");
  const friendApplication = useMemo(
    () => friendApplicationEnabled ? parseFriendApplication(comment.body) : null,
    [comment.body, friendApplicationEnabled],
  );
  const targetedReply = useRef(readCommentTarget()).current;
  const [repliesExpanded, setRepliesExpanded] = useState(() => replies.some((reply) => reply.id === targetedReply));
  const replying = activeReplyId === comment.id || closingReplyId === comment.id;
  const replyClosing = closingReplyId === comment.id;
  useEffect(() => {
    const revealTarget = (event) => {
      if (replies.some((reply) => reply.id === event.detail?.id)) setRepliesExpanded(true);
    };
    window.addEventListener("fonscape:locate-comment", revealTarget);
    return () => window.removeEventListener("fonscape:locate-comment", revealTarget);
  }, [replies]);
  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await api(`/comments/${comment.id}`, { method: "DELETE" });
      onRefresh();
    } catch (error) { setMessage(error.message); }
  };
  const toggleReply = () => {
    if (!viewer) { openAccount("login"); return; }
    if (replying) onReplyClose(comment.id);
    else onReplyOpen(comment.id);
  };
  const copyFriendEntry = async () => {
    try {
      await navigator.clipboard.writeText(friendEntryJson(friendApplication, comment.author));
      setCopyState("已复制友链 JSON");
    } catch {
      setCopyState("复制失败，请重试");
    }
    window.setTimeout(() => setCopyState(""), 1800);
  };
  const childProps = { targetType, slug, onRefresh, locatedCommentId, activeReplyId, closingReplyId, replySwitchInProgress, onReplyOpen, onReplyClose, onReplyClosed, friendApplicationEnabled };
  const canCopyFriendEntry = viewer?.role === "admin" && friendApplication?.valid;
  return <li className={`comment-thread${compact ? " comment-thread--compact" : ""}`}><article id={`comment-${comment.id}`} tabIndex="-1" className={`comment-item${compact ? " comment-item--compact" : ""}${comment.id === locatedCommentId ? " is-located-comment" : ""}`}><Avatar user={comment.author} size="medium" /><div className="comment-main"><header><strong>{comment.author.nickname}</strong>{comment.author.role === "admin" && <span className="author-badge"><Check size={11} weight="bold" />博主</span>}<time>{formatCommunityTime(comment.createdAt)}</time>{comment.editedAt && <small>已编辑</small>}</header>{comment.replyTo && <span className="comment-reply-to">回复 @{comment.replyTo}</span>}<p className="comment-body">{comment.body}</p><div className="comment-actions"><button type="button" onClick={toggleReply} aria-expanded={activeReplyId === comment.id && !replyClosing}><ArrowBendUpLeft size={14} />回复</button>{comment.canDelete && <button type="button" className={confirmDelete ? "is-danger" : ""} onClick={remove} onBlur={() => setConfirmDelete(false)}><Trash size={14} />{confirmDelete ? "再次点击确认" : "删除"}</button>}{canCopyFriendEntry && <button type="button" onClick={copyFriendEntry} className={copyState === "复制失败，请重试" ? "is-danger" : ""} aria-label={copyState || "复制友链 JSON"} aria-live="polite"><CopySimple size={14} />{copyState || "复制友链 JSON"}</button>}</div>{message && <p className="comment-action-message" role="status">{message}</p>}{replying && <ReplyEditor closing={replyClosing} immediateOpen={replySwitchInProgress && !replyClosing} onClosed={() => onReplyClosed(comment.id)}><StableCommentComposer targetType={targetType} slug={slug} parent={comment} onCancel={() => onReplyClose(comment.id)} onCreated={(created) => { onReplyClose(comment.id); onRefresh(created); }} /></ReplyEditor>}</div></article>{replies.length > 0 && <div className="comment-replies-wrap"><ul className="comment-replies"><CommentItem comment={replies[0]} replies={[]} {...childProps} compact /></ul>{replies.length > 1 && <><div className={`comment-replies-extra${repliesExpanded ? " is-open" : ""}`} aria-hidden={!repliesExpanded} inert={repliesExpanded ? undefined : ""}><div><ul className="comment-replies">{replies.slice(1).map((reply) => <CommentItem key={reply.id} comment={reply} replies={[]} {...childProps} compact />)}</ul></div></div><button type="button" className="comment-replies-toggle" aria-expanded={repliesExpanded} onClick={() => setRepliesExpanded((value) => !value)}>{repliesExpanded ? <><CaretUp size={14} />收起回复</> : <><CaretDown size={14} />展开其余 {replies.length - 1} 条回复</>}</button></>}</div>}</li>;
}

function threadContainsId(props, id) {
  return Boolean(id && (props.comment.id === id || props.replies.some((reply) => reply.id === id)));
}

function commentItemPropsEqual(previous, next) {
  if (
    previous.comment !== next.comment
    || previous.replies !== next.replies
    || previous.targetType !== next.targetType
    || previous.slug !== next.slug
    || previous.onRefresh !== next.onRefresh
    || previous.onReplyOpen !== next.onReplyOpen
    || previous.onReplyClose !== next.onReplyClose
    || previous.onReplyClosed !== next.onReplyClosed
    || previous.friendApplicationEnabled !== next.friendApplicationEnabled
    || previous.compact !== next.compact
  ) return false;
  const changedIds = new Set([
    previous.locatedCommentId,
    next.locatedCommentId,
    previous.activeReplyId,
    next.activeReplyId,
    previous.closingReplyId,
    next.closingReplyId,
  ]);
  for (const id of changedIds) {
    if (threadContainsId(previous, id) || threadContainsId(next, id)) return false;
  }
  return previous.replySwitchInProgress === next.replySwitchInProgress
    || (!threadContainsId(previous, previous.activeReplyId) && !threadContainsId(next, next.activeReplyId));
}

export const CommentItem = memo(CommentItemImpl, commentItemPropsEqual);
