import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Paginación cliente para grillas admin.
 * @param {Array} items Lista completa (ya filtrada si aplica)
 * @param {Array} resetDeps Cambios que reinician a página 1 (ej. filtro, fechas)
 */
export function usePaginacionTabla(items, resetDeps = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, total, ...resetDeps]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize, totalPages]);

  const safePage = Math.min(page, totalPages);

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    paginated,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  };
}
