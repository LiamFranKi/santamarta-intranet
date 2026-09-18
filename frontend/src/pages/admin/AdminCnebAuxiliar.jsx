import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import CnebPiarMarca from '../../components/aula/CnebPiarMarca';

const LOGROS = [
  { v: 'si', label: 'Sí' },
  { v: 'en_proceso', label: 'En proc.' },
  { v: 'no', label: 'No' },
];

export default function AdminCnebAuxiliar({ apiBase = '/admin/cneb', sesionId, onVolver }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState({});
  const [notas, setNotas] = useState({});

  const load = useCallback(async () => {
    if (!sesionId) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`${apiBase}/auxiliar/${sesionId}`);
      setData(d);
      const next = {};
      const notes = {};
      (d.valores || []).forEach((v) => {
        next[`${v.matricula_id}_${v.cotejo_id}`] = v.logro || 'en_proceso';
        if (v.observacion && !notes[v.matricula_id]) notes[v.matricula_id] = v.observacion;
      });
      setGrid(next);
      setNotas(notes);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir el auxiliar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [apiBase, sesionId]);

  useEffect(() => {
    load();
  }, [load]);

  const setCelda = (matId, cotId, logro) => {
    setGrid((g) => ({ ...g, [`${matId}_${cotId}`]: logro }));
  };

  const guardar = async () => {
    const filas = [];
    (data?.alumnos || []).forEach((al) => {
      (data?.items || []).forEach((it) => {
        filas.push({
          cotejo_id: it.id,
          matricula_id: al.matricula_id,
          logro: grid[`${al.matricula_id}_${it.id}`] || 'en_proceso',
          observacion: notas[al.matricula_id] || '',
        });
      });
    });
    setSaving(true);
    try {
      await api.put(`${apiBase}/auxiliar/${sesionId}`, { filas });
      await Swal.fire({
        icon: 'success',
        title: 'Auxiliar guardado',
        text: 'No se modificaron notas 0–20 ni la libreta vigente.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    let si = 0;
    let no = 0;
    let ep = 0;
    Object.values(grid).forEach((v) => {
      if (v === 'si') si += 1;
      else if (v === 'no') no += 1;
      else ep += 1;
    });
    return { si, no, ep };
  }, [grid]);

  if (loading) return <p className="cneb-muted">Cargando registro auxiliar…</p>;
  if (!data) return null;

  if (!data.sesion?.grupo_id) {
    return (
      <section className="cneb-panel">
        <p className="cneb-muted">Esta sesión no tiene aula. Ábrala y asígnele un grupo para marcar el cotejo.</p>
        {onVolver ? (
          <button type="button" className="cneb-btn ghost" onClick={onVolver}>
            Volver
          </button>
        ) : null}
      </section>
    );
  }

  if (!(data.items || []).length) {
    return (
      <section className="cneb-panel">
        <p className="cneb-muted">Primero agregue ítems de cotejo en la sesión y luego vuelva a este registro.</p>
        {onVolver ? (
          <button type="button" className="cneb-btn ghost" onClick={onVolver}>
            Volver
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>Registro auxiliar</h2>
          <p>
            {data.sesion?.titulo || 'Sesión'} · Sí / En proceso / No por cada ítem. No es la letra
            AD/A/B/C del bimestre.
          </p>
        </div>
        <div className="cneb-map-actions">
          {onVolver ? (
            <button type="button" className="cneb-btn ghost" onClick={onVolver}>
              Volver
            </button>
          ) : null}
          <button type="button" className="cneb-btn primary" onClick={guardar} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar auxiliar'}
          </button>
        </div>
      </div>
      <div className="cneb-map-stats">
        <span>
          <strong>{stats.si}</strong> sí
        </span>
        <span>
          <strong>{stats.ep}</strong> en proceso
        </span>
        <span>
          <strong>{stats.no}</strong> no
        </span>
      </div>
      <div className="cneb-table-wrap">
        <table className="cneb-table">
          <thead>
            <tr>
              <th className="cneb-sticky">Estudiante</th>
              {(data.items || []).map((it) => (
                <th key={it.id} title={it.item}>
                  {String(it.item || '').slice(0, 42)}
                </th>
              ))}
              <th>Nota breve</th>
            </tr>
          </thead>
          <tbody>
            {(data.alumnos || []).map((al) => (
              <tr key={al.matricula_id}>
                <td className="cneb-sticky">
                  <strong>{al.nombre}</strong>
                  <CnebPiarMarca piar={al.piar} />
                </td>
                {(data.items || []).map((it) => (
                  <td key={it.id}>
                    <select
                      className={`cneb-logro cneb-logro--${grid[`${al.matricula_id}_${it.id}`] || 'en_proceso'}`}
                      value={grid[`${al.matricula_id}_${it.id}`] || 'en_proceso'}
                      onChange={(e) => setCelda(al.matricula_id, it.id, e.target.value)}
                      aria-label={`${al.nombre}: ${it.item}`}
                    >
                      {LOGROS.map((l) => (
                        <option key={l.v} value={l.v}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td>
                  <input
                    type="text"
                    maxLength={400}
                    className="cneb-obs"
                    value={notas[al.matricula_id] || ''}
                    onChange={(e) => setNotas((n) => ({ ...n, [al.matricula_id]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
