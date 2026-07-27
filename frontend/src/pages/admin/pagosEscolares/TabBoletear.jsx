import React, { useEffect, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import Swal from 'sweetalert2';
import api from '../../../services/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Timeout largo: boletear todos los grupos puede tardar varios minutos. */
const BOLETEAR_TIMEOUT_MS = 10 * 60 * 1000;

export default function TabBoletear() {
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [opcionesPago, setOpcionesPago] = useState([]);
  const [nroPago, setNroPago] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [cantidad, setCantidad] = useState('1');
  const [boleteandoGeneral, setBoleteandoGeneral] = useState(false);
  const [boleteandoMoras, setBoleteandoMoras] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingInit(true);
        const { data } = await api.get('/admin/pagos/bcp/config');
        if (cancelled) return;
        const total = data.total_pensiones || 10;
        const raw = Array.isArray(data.opciones_nro_pago) ? data.opciones_nro_pago : [];
        const mensualidades = raw.filter((o) => {
          const v = Number(o.value);
          return Number.isFinite(v) && v >= 1 && v <= total;
        });
        setOpcionesPago(mensualidades);
        if (mensualidades.length) setNroPago(String(mensualidades[0].value));
        setLoadError('');
      } catch (e) {
        if (!cancelled) {
          setLoadError(e.response?.data?.error || 'Error al cargar opciones de pago');
          Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar opciones de pago' });
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nroPagoVal =
    opcionesPago.some((o) => String(o.value) === String(nroPago)) ? nroPago : String(opcionesPago[0]?.value || '');

  const boletearGeneral = async () => {
    const confirm = await Swal.fire({
      icon: 'question',
      title: '¿Continuar?',
      text: 'Se registrarán "pagos temporales" y se marcarán las boletas de la mensualidad seleccionada (todos los grupos). ¿Desea continuar?',
      showCancelButton: true,
      confirmButtonText: 'Sí, boletear',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    setBoleteandoGeneral(true);
    Swal.fire({
      title: 'Boleteando…',
      text: 'Puede tardar varios minutos. No cierre esta ventana.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const { data } = await api.post(
        '/admin/pagos/boletear/general',
        { nro_pago: parseInt(nroPagoVal, 10) },
        { timeout: BOLETEAR_TIMEOUT_MS }
      );
      Swal.fire({
        icon: 'success',
        title: 'Boleteo completado',
        html: `<p>${data.mensaje || `Se boletearon ${data.boletas} pago(s).`}</p>
               ${data.pagos_creados ? `<p>Pagos temporales creados: <strong>${data.pagos_creados}</strong></p>` : ''}`,
      });
    } catch (e) {
      const msg =
        e.code === 'ECONNABORTED'
          ? 'La operación tardó demasiado. Espere e intente de nuevo; puede que parte ya se haya boleteado.'
          : e.response?.data?.error || 'No se pudo boletear pagos';
      Swal.fire({ icon: 'error', title: 'Boletear fallido', text: msg });
    } finally {
      setBoleteandoGeneral(false);
    }
  };

  const boletearMoras = async () => {
    setBoleteandoMoras(true);
    Swal.fire({
      title: 'Boleteando moras…',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const { data } = await api.post(
        '/admin/pagos/boletear/moras',
        {
          from,
          to,
          cantidad: parseInt(cantidad, 10) || 1,
        },
        { timeout: BOLETEAR_TIMEOUT_MS }
      );
      Swal.fire({
        icon: 'success',
        title: 'Moras boleteadas',
        text: data.mensaje || `Se boletearon ${data.boletas} mora(s).`,
      });
    } catch (e) {
      const msg =
        e.code === 'ECONNABORTED'
          ? 'La operación tardó demasiado. Intente de nuevo.'
          : e.response?.data?.error || 'No se pudo boletear moras';
      Swal.fire({ icon: 'error', title: 'Boletear moras fallido', text: msg });
    } finally {
      setBoleteandoMoras(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="pe-loading-inline">
        <CircularProgress size={22} />
        <span>Cargando opciones…</span>
      </div>
    );
  }

  if (!opcionesPago.length) {
    return (
      <div className="pe-empty-state">
        <p>{loadError || 'No hay mensualidades configuradas para boletear.'}</p>
      </div>
    );
  }

  return (
    <div className="pe-boletear">
      <div className="pe-card pe-card--pastel-amber">
        <h2 className="pe-card-title">Boletear pagos — todos los grupos</h2>
        <p className="pe-bcp-section-hint">
          Genera pagos temporales y marca las boletas de impresión para todas las matrículas del año activo
          (mensualidad seleccionada). No descarga ZIP: solo boletea.
        </p>
        <div className="pe-form-row pe-form-row--actions-end">
          <TextField
            select
            size="small"
            label="Mensualidad"
            value={nroPagoVal}
            onChange={(e) => setNroPago(e.target.value)}
            className="pe-field"
            fullWidth
          >
            {opcionesPago.map((o) => (
              <MenuItem key={o.value} value={String(o.value)}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <button
            type="button"
            className="pe-btn pe-btn--primary pe-btn--icon"
            disabled={boleteandoGeneral || !nroPagoVal}
            onClick={boletearGeneral}
          >
            <ReceiptLongOutlinedIcon fontSize="small" />
            {boleteandoGeneral ? 'Boleteando…' : 'Boletear pagos'}
          </button>
        </div>
      </div>

      <div className="pe-card pe-card--pastel-sky">
        <h2 className="pe-card-title">Boletear moras</h2>
        <p className="pe-bcp-section-hint">
          Se marcarán las moras de los pagos cancelados en el rango de fechas indicado (sin ZIP).
        </p>
        <div className="pe-form-row pe-form-row--wrap">
          <TextField
            type="date"
            size="small"
            label="Desde"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            type="date"
            size="small"
            label="Hasta"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            type="number"
            size="small"
            label="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            inputProps={{ min: 1 }}
            fullWidth
          />
          <button
            type="button"
            className="pe-btn pe-btn--primary pe-btn--icon"
            disabled={boleteandoMoras}
            onClick={boletearMoras}
          >
            <WarningAmberOutlinedIcon fontSize="small" />
            {boleteandoMoras ? 'Boleteando…' : 'Boletear moras'}
          </button>
        </div>
      </div>
    </div>
  );
}
