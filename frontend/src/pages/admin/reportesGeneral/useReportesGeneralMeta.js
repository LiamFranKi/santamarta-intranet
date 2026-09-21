import { useEffect, useRef, useState } from 'react';
import api from '../../../services/api';
import Swal from 'sweetalert2';

/**
 * Catálogos compartidos (sedes, niveles, turnos, defaults).
 * @param {(meta: object) => void} [onDefaults] — aplica sede/año/turno por defecto una vez.
 */
export default function useReportesGeneralMeta(onDefaults) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const defaultsAppliedRef = useRef(false);
  const onDefaultsRef = useRef(onDefaults);
  onDefaultsRef.current = onDefaults;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/admin/reportes/general/meta');
        if (cancelled) return;
        setMeta(data);
        if (onDefaultsRef.current && !defaultsAppliedRef.current) {
          defaultsAppliedRef.current = true;
          onDefaultsRef.current(data);
        }
      } catch (e) {
        if (!cancelled) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e.response?.data?.error || 'No se pudieron cargar los filtros.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { meta, loading };
}

export function anioTrabajoFiltro(anio, meta) {
  const n = parseInt(anio, 10);
  if (Number.isFinite(n) && n >= 2000) return n;
  const activo = parseInt(meta?.anio_activo ?? meta?.defaults?.anio, 10);
  const cal = new Date().getFullYear();
  if (Number.isFinite(activo) && activo >= 2000) return Math.max(activo, cal);
  return cal;
}

export function aplicarDefaultsSedeAnio(data, setters) {
  const d = data?.defaults || {};
  if (d.sede_id != null && setters.setSedeId) setters.setSedeId(String(d.sede_id));
  if (setters.setAnio) {
    const raw = d.anio != null ? parseInt(d.anio, 10) : parseInt(data?.anio_activo, 10);
    const cal = new Date().getFullYear();
    const y = Number.isFinite(raw) && raw >= 2000 ? Math.max(raw, cal) : cal;
    setters.setAnio(String(y));
  }
  if (d.turno_id != null && setters.setTurnoId) setters.setTurnoId(String(d.turno_id));
}
