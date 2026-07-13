import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import FiltrosSedeAnio from './FiltrosSedeAnio';

export default function FiltrosSedeAnioMesPension({
  meta,
  sedeId,
  setSedeId,
  anio,
  setAnio,
  mesHasta,
  setMesHasta,
  compact,
}) {
  const opciones = meta?.meses_pension_opciones || [];

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
        label="Hasta mes"
        value={mesHasta}
        onChange={(e) => setMesHasta(e.target.value)}
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
