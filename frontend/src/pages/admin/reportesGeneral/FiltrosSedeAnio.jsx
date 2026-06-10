import React from 'react';
import { MenuItem, TextField } from '@mui/material';

export default function FiltrosSedeAnio({ meta, sedeId, setSedeId, anio, setAnio, compact, hideAnio }) {
  return (
    <>
      {(meta?.sedes || []).length > 0 && (
        <TextField
          select
          size="small"
          label="Sede"
          value={sedeId}
          onChange={(e) => setSedeId(e.target.value)}
          className={compact ? 'rg-alum-field rg-alum-field--sede-compact' : 'rg-alum-field'}
        >
          {(meta.sedes || []).map((s) => (
            <MenuItem key={s.id} value={String(s.id)}>
              {s.nombre}
            </MenuItem>
          ))}
        </TextField>
      )}
      {!hideAnio && (
        <TextField
          size="small"
          label="Año"
          type="number"
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          className="rg-alum-field rg-alum-field--anio"
          inputProps={{ min: 2000, max: 2100 }}
          required
        />
      )}
    </>
  );
}
