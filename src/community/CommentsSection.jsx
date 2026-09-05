import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Pagination } from "../components/Pagination.jsx";
import { StableCommentComposer } from "./CommentComposer.jsx";
import { CommentItem } from "./CommentItem.jsx";
import { useCommentsSection } from "./useCommentsSection.js";

export function CommentsSection({ targetType, slug }) {
  const { state, threads, locatedCommentId, pageTopRef, replyProps, changePage, refreshComments, retry } = useCommentsSection({ targetType, slug });
  const initialError = Boolean(state.error && state.comments.length === 0);
  return <section className="comments-section" aria-labelledby={`comments-${targetType}-${slug}`}><header className="comments-heading"><div><span className="comments-heading-icon" aria-hidden="true"><ChatCircleDots size={22} weight="duotone" /></span><h2 id={`comments-${targetType}-${slug}`}>评论</h2></div><span>{state.total} 条评论</span></header><StableCommentComposer targetType={targetType} slug={slug} onCreated={refreshComments} />{state.loading ? <div className="community-skeleton" aria-label="正在读取评论"><i /><i /><i /></div> : initialError ? <div className="comments-error"><WarningCircle size={23} /><p>{state.error}</p><button type="button" onClick={retry}>重试</button></div> : <>{state.error && <div className="comments-refresh-error" role="status"><WarningCircle size={18} /><span>{state.error}</span><button type="button" onClick={retry}>重试</button></div>}<div ref={pageTopRef} key={state.page} className={`comments-page-list${state.loadingPage ? " is-loading" : ""}`} aria-busy={state.loadingPage || undefined}>{threads.length ? <ul className="comment-list">{threads.map(({ comment, replies }) => <CommentItem key={comment.id} comment={comment} replies={replies} targetType={targetType} slug={slug} onRefresh={refreshComments} locatedCommentId={locatedCommentId} {...replyProps} />)}</ul> : null}</div><Pagination page={state.page} totalPages={state.totalPages} onChange={changePage} ariaLabel="评论分页" className="comments-pagination" /></>}</section>;
}
