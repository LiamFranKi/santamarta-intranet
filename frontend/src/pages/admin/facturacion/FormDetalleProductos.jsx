import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';

function importeLinea(d) {
  return (parseFloat(d.cantidad) || 0) * (parseFloat(d.precio) || 0);
}

export default function FormDetalleProductos({
  catalogo = [],
  catalogoMap = {},
  detalles = [],
  onChangeDetalle,
  onAddLinea,
  onRemoveLinea,
  mostrarStock = true,
  tituloBoton = '+ Agregar Elemento',
}) {
  return (
    <div className="fact-detalle-wrap">
      <button type="button" className="fact-btn-add" onClick={onAddLinea}>
        <AddIcon fontSize="small" />
        {tituloBoton.replace(/^\+ /, '')}
      </button>

      <div className="fact-detalle-table-wrap">
        <table className="fact-detalle-table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Concepto</th>
              {mostrarStock && <th className="fact-col-num">Stock</th>}
              <th className="fact-col-num">Cant.</th>
              <th className="fact-col-num">P. unit.</th>
              <th className="fact-col-num">Importe</th>
              <th className="fact-col-accion" />
            </tr>
          </thead>
          <tbody>
            {detalles.length === 0 ? (
              <tr>
                <td colSpan={mostrarStock ? 7 : 6} className="fact-detalle-empty">
                  Agregue al menos un producto.
                </td>
              </tr>
            ) : (
              detalles.map((d, idx) => (
                <tr key={idx}>
                  <td>
                    <TextField
                      select
                      size="small"
                      value={d.categoria_id || ''}
                      onChange={(e) => onChangeDetalle(idx, { categoria_id: e.target.value })}
                      fullWidth
                      variant="outlined"
                      className="fact-cell-input"
                    >
                      <MenuItem value="">—</MenuItem>
                      {catalogo.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.nombre}
                        </MenuItem>
                      ))}
                    </TextField>
                  </td>
                  <td>
                    <TextField
                      select
                      size="small"
                      value={d.concepto_id || ''}
                      onChange={(e) => onChangeDetalle(idx, { concepto_id: e.target.value })}
                      fullWidth
                      variant="outlined"
                      className="fact-cell-input"
                    >
                      <MenuItem value="">—</MenuItem>
                      {(catalogoMap[d.categoria_id]?.conceptos || []).map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.descripcion}
                        </MenuItem>
                      ))}
                    </TextField>
                  </td>
                  {mostrarStock && (
                    <td className="fact-col-num fact-cell-readonly">
                      {d.stock != null ? d.stock : '—'}
                    </td>
                  )}
                  <td className="fact-col-num">
                    <TextField
                      size="small"
                      type="number"
                      value={d.cantidad}
                      onChange={(e) => onChangeDetalle(idx, { cantidad: e.target.value })}
                      inputProps={{ min: 0, step: 'any' }}
                      variant="outlined"
                      className="fact-cell-input fact-cell-input--num"
                    />
                  </td>
                  <td className="fact-col-num">
                    <TextField
                      size="small"
                      type="number"
                      value={d.precio}
                      onChange={(e) => onChangeDetalle(idx, { precio: e.target.value })}
                      inputProps={{ min: 0, step: 'any' }}
                      variant="outlined"
                      className="fact-cell-input fact-cell-input--num"
                    />
                  </td>
                  <td className="fact-col-num fact-cell-readonly fact-importe">
                    {importeLinea(d).toFixed(2)}
                  </td>
                  <td className="fact-col-accion">
                    <button
                      type="button"
                      className="fact-btn-remove"
                      onClick={() => onRemoveLinea(idx)}
                      title="Quitar línea"
                      disabled={detalles.length <= 1}
                    >
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TotalesFacturacion({
  subtotal,
  comision = 0,
  mostrarComision = false,
  tipoTarjeta = 'CREDITO',
  onTipoTarjetaChange,
  pctDebito = 0,
  pctCredito = 0,
}) {
  const total = subtotal + (parseFloat(comision) || 0);
  const pctActivo = tipoTarjeta === 'DEBITO' ? pctDebito : pctCredito;

  return (
    <div className="fact-totals">
      <div className="fact-totals-row">
        <span>TOTAL</span>
        <strong>S/ {subtotal.toFixed(2)}</strong>
      </div>
      {mostrarComision && (
        <>
          <div className="fact-totals-row fact-totals-row--tarjeta">
            <span>Tipo tarjeta</span>
            <TextField
              select
              size="small"
              value={tipoTarjeta}
              onChange={(e) => onTipoTarjetaChange?.(e.target.value)}
              className="fact-totals-select"
            >
              <MenuItem value="CREDITO">Crédito ({pctCredito}%)</MenuItem>
              <MenuItem value="DEBITO">Débito ({pctDebito}%)</MenuItem>
            </TextField>
          </div>
          <div className="fact-totals-row fact-totals-row--readonly">
            <span>COMISIÓN TARJETA ({pctActivo}%)</span>
            <strong>S/ {(parseFloat(comision) || 0).toFixed(2)}</strong>
          </div>
        </>
      )}
      <div className="fact-totals-row fact-totals-row--final">
        <span>TOTAL A PAGAR</span>
        <strong>S/ {total.toFixed(2)}</strong>
      </div>
    </div>
  );
}
