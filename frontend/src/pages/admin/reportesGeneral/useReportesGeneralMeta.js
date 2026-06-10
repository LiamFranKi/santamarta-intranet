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

export function aplicarDefaultsSedeAnio(data, setters) {
  const d = data?.defaults || {};
  if (d.sede_id != null && setters.setSedeId) setters.setSedeId(String(d.sede_id));
  if (d.anio != null && setters.setAnio) setters.setAnio(String(d.anio));
  if (d.turno_id != null && setters.setTurnoId) setters.setTurnoId(String(d.turno_id));
}
