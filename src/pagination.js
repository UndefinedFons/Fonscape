export const FULL_PAGINATION_THRESHOLD = 5;

export function getVisiblePaginationPages(page, totalPages) {
  if (totalPages <= FULL_PAGINATION_THRESHOLD) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  return [...new Set([1, page - 1, page, page + 1, totalPages]
    .filter((item) => item >= 1 && item <= totalPages))]
    .sort((a, b) => a - b);
}
