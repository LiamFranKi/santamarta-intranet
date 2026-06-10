import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import FiltrosSedeAnio from './FiltrosSedeAnio';

export default function FiltrosSedeAnioConcepto({
  meta,
  sedeId,
  setSedeId,
  anio,
  setAnio,
  concepto,
  setConcepto,
  compact,
}) {
  const opciones = meta?.conceptos_opciones || [];

  return (
    <>
      <FiltrosSedeAnio
        meta={meta}
        sedeId={sedeId}
        setSedeId={setSedeId}
        anio={anio}
        setAnio={setAnio}
        compact={compact}
      />
      <TextField
        select
        size="small"
        label="Concepto"
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        className={compact ? 'rg-alum-field rg-alum-field--concepto-compact' : 'rg-alum-field'}
      >
        {opciones.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}
