import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

const BIMESTRES = [1, 2, 3, 4];

export default function AdminCnebUnidades({ nivel, etiquetaNivel }) {
  const [filas, setFilas] = useState({ 1: [''], 2: [''], 3: [''], 4: [''] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/cneb/unidades', { params: { nivel } });
      const next = { 1: [], 2: [], 3: [], 4: [] };
      (data.unidades || []).forEach((u) => {
        const b = Number(u.bimestre);
        if (next[b]) next[b].push(u.nombre);
      });
      BIMESTRES.forEach((b) => {
        if (!next[b].length) next[b] = [''];
      });
      setFilas(next);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron cargar las unidades',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [nivel]);

  useEffect(() => {
    load();
  }, [load]);

  const setNombre = (bimestre, index, value) => {
    setFilas((prev) => {
      const lista = [...(prev[bimestre] || [''])];
      lista[index] = value;
      return { ...prev, [bimestre]: lista };
    });
  };

  const agregar = (bimestre) => {
    setFilas((prev) => ({ ...prev, [bimestre]: [...(prev[bimestre] || ['']), ''] }));
  };

  const quitar = (bimestre, index) => {
    setFilas((prev) => {
      const lista = (prev[bimestre] || []).filter((_, i) => i !== index);
      return { ...prev, [bimestre]: lista.length ? lista : [''] };
    });
  };

  const guardar = async () => {
    const items = [];
    BIMESTRES.forEach((b) => {
      (filas[b] || []).forEach((nombre) => {
        if (String(nombre || '').trim()) items.push({ bimestre: b, nombre: String(nombre).trim() });
      });
    });
    setSaving(true);
    try {
      await api.put('/admin/cneb/unidades', { nivel, items });
      await Swal.fire({
        icon: 'success',
        title: 'Unidades guardadas',
        text: 'Quedan para todo el nivel. El maestro puede cambiarlas solo en su curso.',
      });
      await load();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron guardar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="cneb-muted">Cargando unidades…</p>;

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>Unidades de {etiquetaNivel(nivel)}</h2>
          <p>
            Lo normal es una unidad por bimestre. Si hace falta otra, agréguela. El aula ya la encuentra
            escrita; el maestro puede cambiarla en su curso sin modificar esta unidad madre.
          </p>
        </div>
        <button type="button" className="cneb-btn primary" onClick={guardar} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar unidades'}
        </button>
      </div>
      <div className="cneb-unidades">
        {BIMESTRES.map((b) => (
          <article key={b} className="cneb-unidad-card">
            <h3>{b}.º bimestre</h3>
            {(filas[b] || ['']).map((nombre, index) => (
              <div key={`${b}-${index}`} className="cneb-unidad-row">
                <input
                  type="text"
                  maxLength={220}
                  value={nombre}
                  placeholder="Nombre de la unidad"
                  onChange={(e) => setNombre(b, index, e.target.value)}
                />
                <button type="button" className="cneb-btn ghost" onClick={() => quitar(b, index)}>
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className="cneb-btn ghost" onClick={() => agregar(b)}>
              Otra unidad
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
