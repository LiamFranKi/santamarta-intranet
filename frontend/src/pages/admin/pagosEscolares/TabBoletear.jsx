import React, { useEffect, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import Swal from 'sweetalert2';
import api from '../../../services/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function descargarBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

async function parseErrorBlob(e, fallback) {
  if (e.response?.data instanceof Blob) {
    try {
      const txt = await e.response.data.text();
      const j = JSON.parse(txt);
      return j.error || fallback;
    } catch {
      return fallback;
    }
  }
  return e.response?.data?.error || fallback;
}

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
      text: 'Se registrarán "pagos temporales" correspondientes a los datos seleccionados. ¿Desea continuar?',
      showCancelButton: true,
      confirmButtonText: 'Sí, boletear',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    setBoleteandoGeneral(true);
    try {
      const { data, headers } = await api.post(
        '/admin/pagos/boletear/general',
        { nro_pago: parseInt(nroPagoVal, 10) },
        { responseType: 'blob' }
      );
      const count = headers['x-boletas-count'] || '?';
      const filename = `boletas_${todayIso()}.zip`;
      descargarBlob(data, filename);
      Swal.fire({
        icon: 'success',
        title: 'ZIP generado',
        text: `Se incluyeron ${count} comprobante(s) JSON.`,
        timer: 3000,
        showConfirmButton: false,
      });
    } catch (e) {
      const msg = await parseErrorBlob(e, 'No se pudo boletear pagos');
      Swal.fire({ icon: 'error', title: 'Boletear fallido', text: msg });
    } finally {
      setBoleteandoGeneral(false);
    }
  };

  const boletearMoras = async () => {
    setBoleteandoMoras(true);
    try {
      const { data, headers } = await api.post(
        '/admin/pagos/boletear/moras',
        {
          from,
          to,
          cantidad: parseInt(cantidad, 10) || 1,
        },
        { responseType: 'blob' }
      );
      const count = headers['x-boletas-count'] || '?';
      const filename = `moras_${todayIso()}.zip`;
      descargarBlob(data, filename);
      Swal.fire({
        icon: 'success',
        title: 'ZIP generado',
        text: `Se incluyeron ${count} nota(s) de débito JSON.`,
        timer: 3000,
        showConfirmButton: false,
      });
    } catch (e) {
      const msg = await parseErrorBlob(e, 'No se pudo boletear moras');
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
      <div className="pe-card">
        <h2 className="pe-card-title">Boletear pagos — todos los grupos</h2>
        <p className="pe-bcp-section-hint">
          Genera pagos temporales y descarga un ZIP con los JSON de boleta para todas las matrículas del año activo
          (mensualidad seleccionada).
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
            {boleteandoGeneral ? 'Generando…' : 'Boletear pagos'}
          </button>
        </div>
      </div>

      <div className="pe-card">
        <h2 className="pe-card-title">Boletear moras — JSON</h2>
        <p className="pe-bcp-section-hint">
          Se imprimirán las moras de los pagos cancelados en el rango de fechas indicado.
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
            {boleteandoMoras ? 'Generando…' : 'Boletear moras'}
          </button>
        </div>
      </div>
    </div>
  );
}
