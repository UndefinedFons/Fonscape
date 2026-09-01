/**
 * Load a message snapshot before advancing its best-effort read receipt. A
 * failed feed never sends a receipt, and a failed receipt never rejects or
 * replaces an already available feed.
 *
 * @template {object} T
 * @param {() => Promise<T & {readThrough?: number}>} loadFeed
 * @param {(readThrough: number) => Promise<unknown>} markRead
 * @param {number} unreadCount
 * @returns {Promise<T & {readThrough?: number}>}
 */
export async function loadFeedWithBestEffortReceipt(loadFeed, markRead, unreadCount) {
  const feed = await loadFeed();
  const readThrough = Number(feed?.readThrough || 0);
  if (unreadCount > 0 && readThrough > 0) {
    await Promise.resolve(markRead(readThrough)).catch(() => {});
  }
  return feed;
}
