import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

const LETRAS = ['', 'AD', 'A', 'B', 'C'];

function etiquetaAula(g) {
  if (!g) return '';
  const gr = g.grado != null ? String(g.grado) : '';
  const sec = String(g.seccion || '').trim();
  return [gr, sec].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

async function descargarBlob(apiBase, url, params, filename) {
  const res = await api.get(`${apiBase}${url}`, {
    params,
    responseType: 'blob',
    timeout: 120000,
  });
  const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

async function descargarExcel(apiBase, params) {
  await descargarBlob(
    apiBase,
    '/export/siagie.xlsx',
    params,
    `cneb_calificativos_${params.nivel}_b${params.bimestre}.xlsx`
  );
}

export default function AdminCnebCorte({
  apiBase = '/admin/cneb',
  nivel,
  grupos = [],
  bimestreDefault = 4,
  etiquetaNivel,
}) {
  const [grupoId, setGrupoId] = useState(grupos[0] ? String(grupos[0].id) : '');
  const [bimestre, setBimestre] = useState(Number(bimestreDefault) || 4);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [letras, setLetras] = useState({});
  const [conclusiones, setConclusiones] = useState({});

  useEffect(() => {
    if (!grupoId && grupos[0]) setGrupoId(String(grupos[0].id));
  }, [grupos, grupoId]);

  const load = useCallback(async () => {
    if (!grupoId || !nivel) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`${apiBase}/corte`, {
        params: { nivel, grupo_id: grupoId, bimestre },
      });
      setData(d);
      const nextL = {};
      const nextC = {};
      (d.valores || []).forEach((v) => {
        nextL[`${v.matricula_id}_${v.competencia_id}`] = v.letra || '';
        if (v.conclusion && !nextC[v.matricula_id]) nextC[v.matricula_id] = v.conclusion;
      });
      setLetras(nextL);
      setConclusiones(nextC);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar el corte',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [apiBase, nivel, grupoId, bimestre]);

  useEffect(() => {
    load();
  }, [load]);

  const areasAgrupadas = useMemo(() => {
    const map = new Map();
    (data?.competencias || []).forEach((c) => {
      const key = c.area_nombre || 'Área';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return [...map.entries()];
  }, [data]);

  const guardar = async () => {
    const items = [];
    (data?.alumnos || []).forEach((al) => {
      (data?.competencias || []).forEach((c) => {
        const k = `${al.matricula_id}_${c.id}`;
        items.push({
          matricula_id: al.matricula_id,
          competencia_id: c.id,
          letra: letras[k] || '',
          conclusion: conclusiones[al.matricula_id] || '',
        });
      });
    });
    setSaving(true);
    try {
      await api.put(`${apiBase}/corte`, { bimestre, grupo_id: Number(grupoId), items });
      await Swal.fire({
        icon: 'success',
        title: 'Corte guardado',
        text: 'Calificativos AD/A/B/C del bimestre. No se convirtió ninguna nota 0–20.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar el corte',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const exportarInforme = async () => {
    try {
      const g = grupos.find((x) => String(x.id) === String(grupoId));
      await descargarBlob(
        apiBase,
        '/export/informe.pdf',
        { nivel, grupo_id: grupoId, bimestre, grupo_label: etiquetaAula(g) },
        `informe_cneb_${nivel}_b${bimestre}.pdf`
      );
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el informe',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  const exportar = async () => {
    try {
      const g = grupos.find((x) => String(x.id) === String(grupoId));
      await descargarExcel(apiBase, {
        nivel,
        grupo_id: grupoId,
        bimestre,
        grupo_label: etiquetaAula(g),
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el Excel',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>Corte bimestral · {etiquetaNivel ? etiquetaNivel(nivel) : nivel}</h2>
          <p>
            Letra por competencia (AD, A, B, C) y conclusión del periodo. El informe PDF usa el logo
            del colegio y la escala oficial CNEB; no sustituye el reporte de SIAGIE.
          </p>
        </div>
        <div className="cneb-map-actions">
          <button type="button" className="cneb-btn ghost" onClick={exportar} disabled={!grupoId}>
            Descargar Excel
          </button>
          <button type="button" className="cneb-btn ghost" onClick={exportarInforme} disabled={!grupoId}>
            Informe PDF
          </button>
          <button type="button" className="cneb-btn primary" onClick={guardar} disabled={saving || !data}>
            {saving ? 'Guardando…' : 'Guardar corte'}
          </button>
        </div>
      </div>
      <div className="cneb-ses-grid">
        <label className="cneb-select-wrap">
          <span>Aula</span>
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Elegir aula…</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {etiquetaAula(g)}
              </option>
            ))}
          </select>
        </label>
        <label className="cneb-select-wrap">
          <span>Bimestre</span>
          <select value={bimestre} onChange={(e) => setBimestre(Number(e.target.value))}>
            {[1, 2, 3, 4].map((b) => (
              <option key={b} value={b}>
                {b}.º bimestre
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p className="cneb-muted">Cargando corte…</p>
      ) : !grupoId ? (
        <div className="cneb-empty">Elija un aula para ver el corte.</div>
      ) : !(data?.alumnos || []).length ? (
        <div className="cneb-empty">No hay alumnos regulares en esta aula.</div>
      ) : (
        <div className="cneb-table-wrap">
          <table className="cneb-table cneb-table--corte">
            <thead>
              <tr>
                <th className="cneb-sticky" rowSpan={2}>
                  Estudiante
                </th>
                {areasAgrupadas.map(([area, comps]) => (
                  <th key={area} colSpan={comps.length}>
                    {area}
                  </th>
                ))}
                <th rowSpan={2}>Conclusión del periodo</th>
              </tr>
              <tr>
                {(data.competencias || []).map((c) => (
                  <th key={c.id} title={c.nombre}>
                    {String(c.nombre || '').slice(0, 28)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.alumnos || []).map((al) => (
                <tr key={al.matricula_id}>
                  <td className="cneb-sticky">
                    <strong>{al.nombre}</strong>
                  </td>
                  {(data.competencias || []).map((c) => {
                    const k = `${al.matricula_id}_${c.id}`;
                    return (
                      <td key={c.id}>
                        <select
                          className={`cneb-letra cneb-letra--${letras[k] || 'vacio'}`}
                          value={letras[k] || ''}
                          onChange={(e) => setLetras((p) => ({ ...p, [k]: e.target.value }))}
                          aria-label={`${al.nombre}: ${c.nombre}`}
                        >
                          {LETRAS.map((l) => (
                            <option key={l || 'vacio'} value={l}>
                              {l || '—'}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  <td>
                    <textarea
                      className="cneb-obs cneb-obs--area"
                      rows={2}
                      maxLength={800}
                      value={conclusiones[al.matricula_id] || ''}
                      onChange={(e) =>
                        setConclusiones((p) => ({ ...p, [al.matricula_id]: e.target.value }))
                      }
                      placeholder="Qué evidenció en este bimestre…"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
