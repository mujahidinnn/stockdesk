import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 20;

/** Client-side slicing only. If the fetch itself gets slow, use a server-side .range() query. */
export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Snap back to the last valid page when filtering shrinks the list.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { paged, page, setPage, pageCount, pageSize, total: items.length };
}
