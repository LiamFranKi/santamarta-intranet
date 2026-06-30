import React from 'react';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

export function FactModalCancel({ onClick, label = 'Cancelar', disabled }) {
  return (
    <button type="button" className="pe-btn pe-btn--ghost pe-btn--icon" onClick={onClick} disabled={disabled}>
      <CloseOutlinedIcon fontSize="small" />
      {label}
    </button>
  );
}

export function FactModalSave({ onClick, label = 'Guardar datos', disabled, loading }) {
  return (
    <button type="button" className="pe-btn pe-btn--primary pe-btn--icon" onClick={onClick} disabled={disabled || loading}>
      <SaveOutlinedIcon fontSize="small" />
      {loading ? 'Guardando…' : label}
    </button>
  );
}
