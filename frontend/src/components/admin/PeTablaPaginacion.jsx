import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../hooks/usePaginacionTabla';

/**
 * Controles de paginación unificados (20 / 50 / 100 filas).
 */
export default function PeTablaPaginacion({
  page,
  totalPages,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}) {
  if (!total) return null;

  return (
    <div className="pe-pagination">
      <div className="pe-pagination-size">
        <TextField
          select
          size="small"
          label="Ver"
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          className="pe-pagination-select"
        >
          {pageSizeOptions.map((n) => (
            <MenuItem key={n} value={n}>
              {n} filas
            </MenuItem>
          ))}
        </TextField>
      </div>
      <div className="pe-pagination-nav">
        <button
          type="button"
          className="pe-btn pe-btn--sm pe-btn--secondary"
          disabled={page <= 1 || disabled}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <span className="pe-pagination-info">
          Página {page} de {totalPages} — {total} registro(s)
        </span>
        <button
          type="button"
          className="pe-btn pe-btn--sm pe-btn--secondary"
          disabled={page >= totalPages || disabled}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
