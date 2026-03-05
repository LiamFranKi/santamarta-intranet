import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './AvataresDemo.css';

/**
 * Página de ejemplo: ver avatares masculino y femenino con sus accesorios.
 * Al hacer clic en cada accesorio se muestra la imagen combinada (base + accesorio).
 * Ruta: /demo-avatares (no está en ningún menú).
 */
function AvataresDemo() {
  const [bimestre, setBimestre] = useState(1);
  const [bases, setBases] = useState([]);
  const [accesoriosPorBase, setAccesoriosPorBase] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Por cada base: null = imagen base, number = id del accesorio seleccionado (imagen combinada)
  const [imagenSeleccionada, setImagenSeleccionada] = useState({});

  const cargarBases = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/alumno/avatares-bimestre/bases', { params: { bimestre } });
      const list = res.data.bases || [];
      setBases(list);
      setImagenSeleccionada({});
      const accMap = {};
      for (const base of list) {
        try {
          const accRes = await api.get(`/alumno/avatares-bimestre/bases/${base.id}/accesorios`);
          accMap[base.id] = accRes.data.accesorios || [];
        } catch {
          accMap[base.id] = [];
        }
      }
      setAccesoriosPorBase(accMap);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Solo alumnos pueden ver esta demo.');
      setBases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarBases(); }, [bimestre]);

  const getImagenUrl = (base, baseId) => {
    const accId = imagenSeleccionada[baseId];
    if (!accId) return base.imagen_base_url || null;
    const accesorios = accesoriosPorBase[baseId] || [];
    const acc = accesorios.find(a => a.id === accId);
    return acc?.imagen_combinada_url || base.imagen_base_url || null;
  };

  const sexoLabel = (sexo) => (sexo === 0 ? 'Masculino' : sexo === 1 ? 'Femenino' : 'N/A');

  if (loading) {
    return (
      <DashboardLayout>
        <div className="avatares-demo">
          <p>Cargando avatares...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="avatares-demo">
          <h1>Demo Avatares</h1>
          <p className="avatares-demo-error">{error}</p>
          <p className="avatares-demo-hint">Inicia sesión como alumno para ver esta página.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="avatares-demo">
        <h1 className="avatares-demo-titulo">Demo: Avatares y accesorios</h1>
        <p className="avatares-demo-desc">Haz clic en un accesorio para ver la imagen combinada (avatar + accesorio).</p>

        <div className="avatares-demo-bimestre">
          <label>Bimestre:</label>
          <select value={bimestre} onChange={(e) => setBimestre(Number(e.target.value))}>
            {[1, 2, 3, 4].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {bases.length === 0 ? (
          <p>No hay avatares configurados para este bimestre.</p>
        ) : (
          <div className="avatares-demo-grid">
            {bases.map((base) => {
              const imagenUrl = getImagenUrl(base, base.id);
              const accesorios = accesoriosPorBase[base.id] || [];
              const esFemenino = base.sexo === 1;
              return (
                <div
                  key={base.id}
                  className={`avatares-demo-card ${esFemenino ? 'avatares-demo-card-femenino' : 'avatares-demo-card-masculino'}`}
                >
                  <div className="avatares-demo-card-header">
                    <h2>{base.nombre || `Avatar Bimestre ${bimestre}`}</h2>
                    <span className="avatares-demo-badge">{sexoLabel(base.sexo)}</span>
                  </div>
                  <div className="avatares-demo-imagen-wrap">
                    {imagenUrl ? (
                      <img src={imagenUrl} alt={base.nombre} />
                    ) : (
                      <div className="avatares-demo-placeholder">Sin imagen</div>
                    )}
                  </div>
                  <div className="avatares-demo-actions">
                    <button
                      type="button"
                      className={`avatares-demo-btn ${!imagenSeleccionada[base.id] ? 'avatares-demo-btn-active' : ''}`}
                      onClick={() => setImagenSeleccionada((s) => ({ ...s, [base.id]: null }))}
                    >
                      Solo base
                    </button>
                    {accesorios.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        className={`avatares-demo-btn ${imagenSeleccionada[base.id] === acc.id ? 'avatares-demo-btn-active' : ''}`}
                        onClick={() => setImagenSeleccionada((s) => ({ ...s, [base.id]: acc.id }))}
                      >
                        {acc.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default AvataresDemo;
