interface CollectionLoadStatusProps {
  error: boolean;
  retrying: boolean;
  retry: () => void;
}

/** Keep loaded cards available when a later content request fails. */
export function CollectionLoadStatus({ error, retrying, retry }: CollectionLoadStatusProps) {
  if (!error) return null;
  return <div className="collection-load-status" role="status"><span>部分内容加载失败，列表尚未完整。</span><button type="button" onClick={retry} disabled={retrying}>{retrying ? "正在重试…" : "重新加载"}</button></div>;
}
