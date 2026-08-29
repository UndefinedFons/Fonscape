/**
 * Load a message feed independently from its best-effort read receipt. A
 * failed receipt must never reject or replace an already available feed.
 *
 * @template T
 * @param {() => Promise<T>} loadFeed
 * @param {() => Promise<unknown>} markRead
 * @param {number} unreadCount
 * @returns {Promise<T>}
 */
export function loadFeedWithBestEffortReceipt(loadFeed, markRead, unreadCount) {
  const feed = loadFeed();
  if (unreadCount > 0) Promise.resolve().then(markRead).catch(() => {});
  return feed;
}
