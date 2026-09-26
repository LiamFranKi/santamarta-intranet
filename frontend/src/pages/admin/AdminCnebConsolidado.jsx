import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import CnebPiarMarca from '../../components/aula/CnebPiarMarca';
import {
  areaIdDeCurso,
  asignaturaIdDeCurso,
  aulasDe,
  claveCurso,
  cursosDe,
  etiquetaGrado,
  gradosDe,
  textoErrorDescarga,
} from './cnebElegirAula';

const LOGROS = [
  { v: '', label: '—' },
  { v: 'si', label: 'Sí' },
  { v: 'en_proceso', label: 'En proc.' },
  { v: 'no', label: 'No' },
];
const LETRAS = ['', 'AD', 'A', 'B', 'C'];

function etiquetaAula(g) {
  if (!g) return '';
  return [g.grado != null ? String(g.grado) : '', String(g.seccion || '').trim()].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

function bimestreDeSesion(s) {
  const b = Number(s?.bimestre);
  return b >= 1 && b <= 4 ? b : 4;
}

export default function AdminCnebConsolidado({
  apiBase = '/admin/cneb',
  nivel,
  grupos = [],
  bimestreDefault = 4,
  etiquetaNivel,
  grupoInicial = '',
  areaId = null,
  asignaturaId = null,
  sesiones = [],
}) {
  const [gradoSel, setGradoSel] = useState('');
  const [aulaSel, setAulaSel] = useState('');
  const [cursoSel, setCursoSel] = useState('');
  const [sesionLocal, setSesionLocal] = useState('');
  const [grupoId, setGrupoId] = useState(grupoInicial ? String(grupoInicial) : '');
  const [bimestre, setBimestre] = useState(Number(bimestreDefault) || 4);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [cotejo, setCotejo] = useState({});
  const [letras, setLetras] = useState({});

  const grados = useMemo(() => gradosDe(grupos), [grupos]);
  const aulas = useMemo(() => aulasDe(grupos, gradoSel), [grupos, gradoSel]);
  const sesionesAula = useMemo(
    () =>
      (sesiones || []).filter(
        (s) => String(s.grupo_id) === String(aulaSel) && bimestreDeSesion(s) === Number(bimestre)
      ),
    [sesiones, aulaSel, bimestre]
  );
  const cursos = useMemo(() => cursosDe(sesionesAula), [sesionesAula]);
  const sesionesCurso = useMemo(
    () => sesionesAula.filter((s) => claveCurso(s) === cursoSel),
    [sesionesAula, cursoSel]
  );
  const sesionElegida = sesionLocal && sesionLocal !== 'todas' ? sesionLocal : '';
  const listoLocal = Boolean(gradoSel && aulaSel && cursoSel && sesionLocal);
  const areaEfectivo = grupoInicial ? areaId : areaIdDeCurso(cursoSel, sesionesCurso);
  const asignaturaEfectiva = grupoInicial ? asignaturaId : asignaturaIdDeCurso(cursoSel, sesionesCurso);
  const sesionEfectiva = grupoInicial ? '' : sesionElegida;

  useEffect(() => {
    if (grupoInicial) {
      setGrupoId(String(grupoInicial));
      return;
    }
    setGrupoId(listoLocal ? String(aulaSel) : '');
    if (!listoLocal) setData(null);
  }, [grupoInicial, aulaSel, listoLocal]);

  const load = useCallback(async () => {
    if (!grupoId || !nivel) return;
    if (!grupoInicial && !listoLocal) return;
    setLoading(true);
    try {
      const { data: d } = await api.get(`${apiBase}/consolidado`, {
        params: { nivel, grupo_id: grupoId, bimestre },
      });
      setData(d);
      const nextC = {};
      (d.valoresCotejo || []).forEach((v) => {
        nextC[`${v.matricula_id}_${v.cotejo_id}`] = v.logro || '';
      });
      const nextL = {};
      (d.valoresCorte || []).forEach((v) => {
        nextL[`${v.matricula_id}_${v.competencia_id}`] = v.letra || '';
      });
      setCotejo(nextC);
      setLetras(nextL);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar el consolidado',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [apiBase, nivel, grupoId, bimestre, grupoInicial, listoLocal]);

  useEffect(() => {
    load();
  }, [load]);

  const sesionesVista = useMemo(() => {
    const all = data?.sesiones || [];
    if (sesionEfectiva) return all.filter((s) => String(s.id) === String(sesionEfectiva));
    if (asignaturaEfectiva) return all.filter((s) => String(s.asignatura_id) === String(asignaturaEfectiva));
    if (areaEfectivo) return all.filter((s) => String(s.area_id) === String(areaEfectivo));
    return all;
  }, [data, sesionEfectiva, areaEfectivo, asignaturaEfectiva]);

  const competenciasVista = useMemo(() => {
    const all = data?.competencias || [];
    if (!areaEfectivo && !asignaturaEfectiva && !sesionEfectiva) return all;
    const ids = new Set(
      sesionesVista.map((s) => s.competencia_id).filter((id) => id != null && id !== '')
    );
    if (!ids.size) return [];
    const keys = new Set([...ids].map((id) => String(id)));
    return all.filter((c) => keys.has(String(c.id)));
  }, [data, sesionesVista, areaEfectivo, asignaturaEfectiva, sesionEfectiva]);

  const areasAgrupadas = useMemo(() => {
    const map = new Map();
    competenciasVista.forEach((c) => {
      const key = c.area_nombre || 'Área';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return [...map.entries()];
  }, [competenciasVista]);

  const guardar = async () => {
    const filas_cotejo = [];
    sesionesVista.forEach((s) => {
      (s.items || []).forEach((it) => {
        (data?.alumnos || []).forEach((al) => {
          const logro = cotejo[`${al.matricula_id}_${it.id}`];
          if (!logro) return;
          filas_cotejo.push({
            sesion_id: s.id,
            cotejo_id: it.id,
            matricula_id: al.matricula_id,
            logro,
          });
        });
      });
    });
    const items_corte = [];
    (data?.alumnos || []).forEach((al) => {
      competenciasVista.forEach((c) => {
        items_corte.push({
          matricula_id: al.matricula_id,
          competencia_id: c.id,
          letra: letras[`${al.matricula_id}_${c.id}`] || '',
        });
      });
    });
    setSaving(true);
    try {
      await api.put(`${apiBase}/consolidado`, {
        bimestre,
        grupo_id: Number(grupoId),
        filas_cotejo,
        items_corte,
      });
      await Swal.fire({
        icon: 'success',
        title: 'Consolidado guardado',
        text: 'Se actualizó el cotejo de las sesiones y el corte AD/A/B/C. No se tocaron notas 0–20.',
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

  const exportar = async () => {
    try {
      const g = grupos.find((x) => String(x.id) === String(grupoId));
      const res = await api.get(`${apiBase}/export/consolidado.xlsx`, {
        params: {
          nivel,
          grupo_id: grupoId,
          bimestre,
          grupo_label: etiquetaAula(g),
          ...(areaEfectivo ? { area_id: areaEfectivo } : {}),
          ...(asignaturaEfectiva ? { asignatura_id: asignaturaEfectiva } : {}),
          ...(sesionEfectiva ? { sesion_id: sesionEfectiva } : {}),
        },
        responseType: 'blob',
        timeout: 60000,
      });
      const href = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = href;
      a.download = `cneb_consolidado_${nivel}_b${bimestre}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el Excel',
        text: await textoErrorDescarga(e),
      });
    }
  };

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>Registro auxiliar consolidado · {etiquetaNivel ? etiquetaNivel(nivel) : nivel}</h2>
          <p>
            Una sola grilla del aula: a la izquierda el cotejo de cada sesión (incluye talleres
            internos); a la derecha el corte AD/A/B/C solo de las áreas oficiales del nivel, que es
            lo que viaja a SIAGIE.
          </p>
        </div>
        <div className="cneb-map-actions">
          <button type="button" className="cneb-btn ghost" onClick={exportar} disabled={!grupoId}>
            Descargar Excel
          </button>
          <button type="button" className="cneb-btn primary" onClick={guardar} disabled={saving || !data}>
            {saving ? 'Guardando…' : 'Guardar consolidado'}
          </button>
        </div>
      </div>
      <div className="cneb-elige">
        {grupoInicial ? null : (
          <>
            <label className="cneb-select-wrap">
              <span>Grado</span>
              <select
                value={gradoSel}
                onChange={(e) => {
                  setGradoSel(e.target.value);
                  setAulaSel('');
                  setCursoSel('');
                  setSesionLocal('');
                }}
              >
                <option value="">Elegir grado…</option>
                {grados.map((g) => (
                  <option key={g} value={g}>
                    {etiquetaGrado(nivel, g)}
                  </option>
                ))}
              </select>
            </label>
            <label className="cneb-select-wrap">
              <span>Aula</span>
              <select
                value={aulaSel}
                disabled={!gradoSel}
                onChange={(e) => {
                  setAulaSel(e.target.value);
                  setCursoSel('');
                  setSesionLocal('');
                }}
              >
                <option value="">Elegir aula…</option>
                {aulas.map((g) => (
                  <option key={g.id} value={g.id}>
                    {etiquetaAula(g)}
                  </option>
                ))}
              </select>
            </label>
            <label className="cneb-select-wrap">
              <span>Curso</span>
              <select
                value={cursoSel}
                disabled={!aulaSel}
                onChange={(e) => {
                  setCursoSel(e.target.value);
                  setSesionLocal('');
                }}
              >
                <option value="">Elegir curso…</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="cneb-select-wrap">
              <span>Sesión</span>
              <select value={sesionLocal} disabled={!cursoSel} onChange={(e) => setSesionLocal(e.target.value)}>
                <option value="">Elegir sesión…</option>
                <option value="todas">Todas las sesiones de este curso</option>
                {sesionesCurso.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titulo}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="cneb-select-wrap">
          <span>Bimestre (corte)</span>
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
        <p className="cneb-muted">Cargando consolidado…</p>
      ) : !grupoInicial && !listoLocal ? (
        <div className="cneb-empty">Elija el grado, el aula, el curso y la sesión para ver el consolidado.</div>
      ) : !grupoId ? (
        <div className="cneb-empty">Elija un aula.</div>
      ) : !(data?.alumnos || []).length ? (
        <div className="cneb-empty">No hay alumnos regulares en esta aula.</div>
      ) : !sesionesVista.length ? (
        <div className="cneb-empty">Aún no hay sesiones en esta aula. Créelas y vuelva al consolidado.</div>
      ) : (
        <div className="cneb-table-wrap">
          <table className="cneb-table cneb-table--corte cneb-table--cons">
            <thead>
              <tr>
                <th className="cneb-sticky" rowSpan={2}>
                  Estudiante
                </th>
                {sesionesVista.map((s) => (
                  <th key={`s-${s.id}`} colSpan={Math.max(1, (s.items || []).length)} title={s.area_nombre || ''}>
                    {s.titulo}
                    {s.fecha_sesion ? ` · ${String(s.fecha_sesion).slice(0, 10)}` : ''}
                  </th>
                ))}
                {areasAgrupadas.map(([area, comps]) => (
                  <th key={area} colSpan={comps.length} className="cneb-th-corte">
                    Corte · {area}
                  </th>
                ))}
              </tr>
              <tr>
                {sesionesVista.flatMap((s) => {
                  const items = s.items || [];
                  if (!items.length) {
                    return [
                      <th key={`sempty-${s.id}`} className="cneb-th-muted">
                        Sin cotejo
                      </th>,
                    ];
                  }
                  return items.map((it) => (
                    <th key={`i-${it.id}`} title={it.item}>
                      {String(it.item || '').slice(0, 28)}
                    </th>
                  ));
                })}
                {competenciasVista.map((c) => (
                  <th key={`c-${c.id}`} className="cneb-th-corte" title={c.nombre}>
                    {String(c.nombre || '').slice(0, 22)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.alumnos || []).map((al) => (
                <tr key={al.matricula_id}>
                  <td className="cneb-sticky">
                    <strong>{al.nombre}</strong>
                    <CnebPiarMarca piar={al.piar} />
                  </td>
                  {sesionesVista.flatMap((s) => {
                    const items = s.items || [];
                    if (!items.length) {
                      return [
                        <td key={`e-${s.id}-${al.matricula_id}`} className="cneb-muted">
                          —
                        </td>,
                      ];
                    }
                    return items.map((it) => {
                      const k = `${al.matricula_id}_${it.id}`;
                      return (
                        <td key={k}>
                          <select
                            className={`cneb-logro cneb-logro--${cotejo[k] || 'vacio'}`}
                            value={cotejo[k] || ''}
                            onChange={(e) => setCotejo((p) => ({ ...p, [k]: e.target.value }))}
                            aria-label={`${al.nombre}: ${it.item}`}
                          >
                            {LOGROS.map((l) => (
                              <option key={l.v || 'vacio'} value={l.v}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    });
                  })}
                  {competenciasVista.map((c) => {
                    const k = `${al.matricula_id}_${c.id}`;
                    return (
                      <td key={k}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
