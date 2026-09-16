import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

const DURACIONES = [45, 60, 90];

function partirMinutos(total) {
  const t = Math.max(20, parseInt(total, 10) || 60);
  if (t <= 45) return { inicio: 8, desarrollo: t - 15, cierre: 7 };
  if (t <= 60) return { inicio: 10, desarrollo: t - 20, cierre: 10 };
  return { inicio: 15, desarrollo: t - 30, cierre: 15 };
}

function etiquetaAula(g) {
  if (!g) return '';
  const gr = g.grado != null ? String(g.grado) : '';
  const sec = String(g.seccion || '').trim();
  return [gr, sec].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formVacio(nivel, ctx = null) {
  const duracion_min = 60;
  const corteCtx = ctx?.corte != null ? Number(ctx.corte) : NaN;
  return {
    id: null,
    titulo: '',
    proposito: '',
    ficha_estudiante: '',
    duracion_min,
    grupo_id: ctx?.grupo_id != null && ctx.grupo_id !== '' ? String(ctx.grupo_id) : '',
    asignatura_id: ctx?.asignatura_id != null ? ctx.asignatura_id : null,
    area_id: ctx?.area_id != null && ctx.area_id !== '' ? String(ctx.area_id) : '',
    competencia_id: '',
    corte: Number.isFinite(corteCtx) && corteCtx > 0 ? corteCtx : nivel === 'INICIAL' ? 5 : 1,
    fecha_sesion: hoyISO(),
    estado: 'borrador',
    desempeno_ids: [],
    momentos: { inicio: '', desarrollo: '', cierre: '' },
    minutos: partirMinutos(duracion_min),
    cotejo: [],
  };
}

function sumaMinutos(minutos) {
  return ['inicio', 'desarrollo', 'cierre'].reduce((a, k) => a + (parseInt(minutos?.[k], 10) || 0), 0);
}

export default function AdminCnebSesiones({
  nivel,
  areas,
  etiquetaNivel,
  apiBase = '/admin/cneb',
  embebido = false,
  contextoAula = null,
  sesionId = null,
  onCerrar = null,
  onGuardado = null,
}) {
  const [lista, setLista] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState(() => formVacio(nivel));
  const [editing, setEditing] = useState(false);

  const loadLista = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        api.get(`${apiBase}/sesiones`, { params: { nivel } }),
        api.get(`${apiBase}/sesiones/meta`, { params: { nivel } }),
      ]);
      setLista(sRes.data?.sesiones || []);
      setGrupos(mRes.data?.grupos || []);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron cargar las sesiones',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [nivel, apiBase]);

  useEffect(() => {
    loadLista();
    if (embebido) {
      if (sesionId) return;
      const f = formVacio(nivel, contextoAula);
      setForm(f);
      setEditing(true);
      return;
    }
    setEditing(false);
    setForm(formVacio(nivel));
  }, [nivel, loadLista, embebido, sesionId]);

  useEffect(() => {
    if (!embebido || !sesionId) return;
    abrir(sesionId);
    // abrir se redefine; solo al cambiar de sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embebido, sesionId]);

  const areaForm = useMemo(
    () => (areas || []).find((a) => String(a.id) === String(form.area_id)) || null,
    [areas, form.area_id]
  );
  const comps = areaForm?.competencias || [];
  const compForm = useMemo(
    () => comps.find((c) => String(c.id) === String(form.competencia_id)) || comps[0] || null,
    [comps, form.competencia_id]
  );

  const desempenosCorte = useMemo(() => {
    const all = compForm?.desempenos || [];
    if (nivel === 'INICIAL') {
      const filtrados = all.filter((d) => Number(d.edad) === Number(form.corte));
      return filtrados.length ? filtrados : all;
    }
    const filtrados = all.filter((d) => Number(d.grado) === Number(form.corte));
    return filtrados.length ? filtrados : all;
  }, [compForm, form.corte, nivel]);

  const cortes = useMemo(() => {
    if (nivel === 'PRIMARIA') return [1, 2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}.º` }));
    if (nivel === 'SECUNDARIA') return [1, 2, 3, 4, 5].map((n) => ({ v: n, label: `${n}.º` }));
    return [3, 4, 5].map((n) => ({ v: n, label: `${n} años` }));
  }, [nivel]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const onDuracion = (mins) => {
    const duracion_min = parseInt(mins, 10) || 60;
    patch({ duracion_min, minutos: partirMinutos(duracion_min) });
  };

  const onGrupo = (grupoId) => {
    const g = grupos.find((x) => String(x.id) === String(grupoId));
    const corte = g?.grado != null ? Number(g.grado) : form.corte;
    patch({ grupo_id: grupoId, corte: Number.isFinite(corte) ? corte : form.corte });
  };

  const onArea = (areaId) => {
    const a = (areas || []).find((x) => String(x.id) === String(areaId));
    const first = a?.competencias?.[0];
    patch({
      area_id: areaId,
      competencia_id: first ? String(first.id) : '',
      desempeno_ids: [],
    });
  };

  useEffect(() => {
    if (!embebido || form.id || form.competencia_id || !form.area_id) return;
    const a = (areas || []).find((x) => String(x.id) === String(form.area_id));
    const first = a?.competencias?.[0];
    if (first) patch({ competencia_id: String(first.id) });
  }, [embebido, form.id, form.area_id, form.competencia_id, areas]);

  const toggleDes = (id) => {
    const sid = String(id);
    patch({
      desempeno_ids: form.desempeno_ids.map(String).includes(sid)
        ? form.desempeno_ids.filter((x) => String(x) !== sid)
        : [...form.desempeno_ids, id],
    });
  };

  const abrirNueva = () => {
    setForm(formVacio(nivel, embebido ? contextoAula : null));
    setEditing(true);
  };

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`${apiBase}/sesiones/${id}`);
      const s = data.sesion;
      setForm({
        id: s.id,
        titulo: s.titulo || '',
        proposito: s.proposito || '',
        ficha_estudiante: s.ficha_estudiante || '',
        duracion_min: Number(s.duracion_min) || 60,
        grupo_id: s.grupo_id != null ? String(s.grupo_id) : '',
        asignatura_id: s.asignatura_id != null ? s.asignatura_id : null,
        area_id: s.area_id != null ? String(s.area_id) : '',
        competencia_id: s.competencia_id != null ? String(s.competencia_id) : '',
        corte: s.corte != null ? Number(s.corte) : nivel === 'INICIAL' ? 5 : 1,
        fecha_sesion: s.fecha_sesion ? String(s.fecha_sesion).slice(0, 10) : '',
        estado: s.estado || 'borrador',
        desempeno_ids: s.desempeno_ids || [],
        momentos: s.momentos || { inicio: '', desarrollo: '', cierre: '' },
        minutos: s.minutos || partirMinutos(s.duracion_min),
        cotejo: (s.cotejo || []).map((c) => ({ item: c.item, desempeno_id: c.desempeno_id })),
      });
      setEditing(true);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo abrir', text: e.response?.data?.error || e.message });
    }
  };

  const armarBorrador = async () => {
    const textos = desempenosCorte
      .filter((d) => form.desempeno_ids.map(String).includes(String(d.id)))
      .map((d) => d.texto);
    try {
      const { data } = await api.post(`${apiBase}/sesiones/borrador`, {
        titulo: form.titulo,
        proposito: form.proposito,
        competencia_nombre: compForm?.nombre,
        desempenos_texto: textos,
        duracion_min: form.duracion_min,
        corte_label: cortes.find((c) => c.v === Number(form.corte))?.label,
      });
      const b = data.borrador;
      aplicarBorrador(b, { forzarTitulo: !form.titulo.trim(), forzarProposito: !form.proposito });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo armar el borrador', text: e.response?.data?.error || e.message });
    }
  };

  const aplicarBorrador = (b, { forzarProposito = false, forzarTitulo = false } = {}) => {
    if (!b) return;
    patch({
      titulo: (forzarTitulo || !form.titulo) && b.titulo ? b.titulo : form.titulo,
      proposito: forzarProposito || !form.proposito ? b.proposito || form.proposito : form.proposito,
      ficha_estudiante: b.ficha || b.ficha_estudiante || form.ficha_estudiante,
      minutos: b.minutos || form.minutos,
      momentos: b.momentos || form.momentos,
      cotejo: (b.cotejo || []).map((item) => ({ item: typeof item === 'string' ? item : item.item })),
    });
  };

  const generarConIa = async () => {
    const textos = desempenosCorte
      .filter((d) => form.desempeno_ids.map(String).includes(String(d.id)))
      .map((d) => d.texto);
    if (!compForm?.nombre && !form.titulo.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Falta un ancla',
        text: 'Elija área y competencia del catálogo, o escriba un tema si es un taller interno.',
      });
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post(
        `${apiBase}/sesiones/generar-ia`,
        {
          sesion_id: form.id,
          nivel,
          titulo: form.titulo,
          proposito: form.proposito,
          competencia_nombre: compForm?.nombre || 'Taller interno (no SIAGIE)',
          area_nombre: areaForm?.nombre || 'Taller interno',
          capacidades: (compForm?.capacidades || []).map((c) => c.nombre),
          desempenos_texto: textos,
          duracion_min: form.duracion_min,
          corte_label: cortes.find((c) => c.v === Number(form.corte))?.label,
        },
        { timeout: 120000 }
      );
      aplicarBorrador(data.borrador, {
        forzarProposito: !form.proposito,
        forzarTitulo: !form.titulo.trim(),
      });
      await Swal.fire({
        icon: 'success',
        title: 'Borrador con IA',
        text: data.modelo
          ? `Modelo: ${data.modelo}. Revise tema, momentos y ficha antes de aprobar.`
          : 'Revise y ajuste el texto.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar con IA',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setGenerating(false);
    }
  };

  const guardar = async (estado) => {
    const suma = sumaMinutos(form.minutos);
    if (suma !== Number(form.duracion_min)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Los tiempos no cierran',
        text: `Inicio + desarrollo + cierre = ${suma} min. Debe ser ${form.duracion_min}.`,
      });
      return;
    }
    if (!String(form.titulo || '').trim()) {
      await Swal.fire({ icon: 'warning', title: 'Falta el título o tema de la sesión' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nivel,
        estado: estado || form.estado,
        cotejo: (form.cotejo || []).filter((c) => String(c.item || '').trim()),
      };
      if (form.id) await api.put(`${apiBase}/sesiones/${form.id}`, payload);
      else {
        const { data } = await api.post(`${apiBase}/sesiones`, payload);
        patch({ id: data.id });
      }
      await loadLista();
      if (typeof onGuardado === 'function') onGuardado();
      await Swal.fire({
        icon: 'success',
        title: estado === 'aprobada' ? 'Sesión aprobada' : 'Sesión guardada',
        text: 'Quedó en la base de datos. No se modificó el aula virtual ni la libreta.',
      });
      if (estado === 'aprobada') setEditing(false);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  };

  const descargarPdfSesion = async (id, opts = {}) => {
    if (!id) {
      await Swal.fire({ icon: 'warning', title: 'Guarde la sesión antes de descargar el PDF' });
      return;
    }
    const parte = opts.parte || 'sesion';
    const formato = opts.formato || 'colegio';
    try {
      const res = await api.get(`${apiBase}/sesiones/${id}/pdf`, {
        params: { parte, formato },
        responseType: 'blob',
        timeout: 60000,
      });
      const href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = parte === 'ficha' ? `ficha_cneb_${id}.pdf` : `sesion_cneb_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el PDF',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  const eliminar = async (id) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta sesión?',
      text: 'No afecta notas ni temas del aula virtual.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`${apiBase}/sesiones/${id}`);
      if (form.id === id) {
        setEditing(false);
        setForm(formVacio(nivel, embebido ? contextoAula : null));
        if (embebido && typeof onCerrar === 'function') onCerrar();
      }
      await loadLista();
      if (typeof onGuardado === 'function') onGuardado();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.response?.data?.error || e.message });
    }
  };

  const suma = sumaMinutos(form.minutos);
  const sumaOk = suma === Number(form.duracion_min);

  if (loading && !editing && !embebido) {
    return <p className="cneb-muted">Cargando sesiones…</p>;
  }

  if (!editing && !embebido) {
    return (
      <section className="cneb-panel">
        <div className="cneb-map-toolbar">
          <div>
            <h2>Sesiones de {etiquetaNivel(nivel)}</h2>
            <p>
              El docente (o coordinación) arma el inicio, el desarrollo y el cierre. Puede abrir para
              editar, descargar PDF o eliminar: no afecta notas ni el aula virtual.
            </p>
          </div>
          <button type="button" className="cneb-btn primary" onClick={abrirNueva}>
            Nueva sesión
          </button>
        </div>
        {lista.length === 0 ? (
          <div className="cneb-empty">Aún no hay sesiones en este nivel. Cree la primera con el catálogo oficial.</div>
        ) : (
          <div className="cneb-ses-list">
            {lista.map((s) => (
              <article key={s.id} className={`cneb-ses-card${s.estado === 'aprobada' ? ' is-ok' : ''}`}>
                <div>
                  <p className="cneb-kicker">{s.estado === 'aprobada' ? 'Aprobada' : 'Borrador'}</p>
                  <h3>{s.titulo}</h3>
                  <p>
                    {s.area_nombre || 'Taller interno'}
                    {s.grado != null ? ` · ${s.grado} ${s.seccion || ''}`.trim() : ''}
                    {` · ${s.duracion_min} min`}
                    {s.fecha_sesion ? ` · ${String(s.fecha_sesion).slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="cneb-map-actions">
                  <button type="button" className="cneb-btn ghost" onClick={() => abrir(s.id)}>
                    Editar
                  </button>
                  <button type="button" className="cneb-btn ghost" onClick={() => descargarPdfSesion(s.id)}>
                    PDF sesión
                  </button>
                  <button
                    type="button"
                    className="cneb-btn ghost"
                    onClick={() => descargarPdfSesion(s.id, { parte: 'ficha', formato: 'colegio' })}
                  >
                    Ficha
                  </button>
                  <button type="button" className="cneb-btn ghost" onClick={() => eliminar(s.id)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>{form.id ? 'Editar sesión' : 'Nueva sesión'}</h2>
          <p>
            Los tres momentos viven en la base. Puede editar, borrar o imprimir la ficha del
            estudiante (evidencia física). Si deja el área vacía, es un taller interno: cotejo en el
            registro, sin SIAGIE.
          </p>
        </div>
        <div className="cneb-map-actions">
          <button
            type="button"
            className="cneb-btn ghost"
            onClick={() => {
              if (embebido && typeof onCerrar === 'function') {
                onCerrar();
                return;
              }
              setEditing(false);
              setForm(formVacio(nivel));
            }}
          >
            {embebido ? 'Volver al aula' : 'Volver al listado'}
          </button>
          {form.id ? (
            <>
              <button type="button" className="cneb-btn ghost" onClick={() => descargarPdfSesion(form.id)}>
                PDF sesión
              </button>
              <button
                type="button"
                className="cneb-btn ghost"
                onClick={() => descargarPdfSesion(form.id, { parte: 'ficha', formato: 'colegio' })}
              >
                Ficha colegio
              </button>
              <button
                type="button"
                className="cneb-btn ghost"
                onClick={() => descargarPdfSesion(form.id, { parte: 'ficha', formato: 'minedu' })}
              >
                Ficha MINEDU
              </button>
              <button type="button" className="cneb-btn ghost" onClick={() => eliminar(form.id)}>
                Eliminar
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="cneb-ses-grid">
        <label className="cneb-select-wrap">
          <span>Aula</span>
          {embebido && contextoAula?.grupo_id ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={
                contextoAula.aula_label ||
                etiquetaAula(grupos.find((g) => String(g.id) === String(form.grupo_id))) ||
                'Esta aula'
              }
            />
          ) : (
            <select value={form.grupo_id} onChange={(e) => onGrupo(e.target.value)}>
              <option value="">Elegir aula…</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {etiquetaAula(g)}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Fecha</span>
          <input
            type="date"
            value={form.fecha_sesion}
            onChange={(e) => patch({ fecha_sesion: e.target.value })}
          />
        </label>
        <label className="cneb-select-wrap">
          <span>Duración</span>
          <select value={form.duracion_min} onChange={(e) => onDuracion(e.target.value)}>
            {DURACIONES.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <label className="cneb-select-wrap">
          <span>{nivel === 'INICIAL' ? 'Edad' : 'Grado'}</span>
          {embebido && contextoAula?.corte != null ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={cortes.find((c) => Number(c.v) === Number(form.corte))?.label || `${form.corte} años`}
            />
          ) : (
            <select value={form.corte} onChange={(e) => patch({ corte: Number(e.target.value), desempeno_ids: [] })}>
              {cortes.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Área CNEB</span>
          {embebido ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={
                contextoAula?.area_nombre ||
                areaForm?.nombre ||
                (!form.area_id ? 'Taller interno (no SIAGIE)' : 'Área')
              }
            />
          ) : (
            <select value={form.area_id} onChange={(e) => onArea(e.target.value)}>
              <option value="">Taller interno (no SIAGIE)</option>
              {(areas || [])
                .filter((a) => a.tipo !== 'transversal')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Competencia</span>
          <select
            value={form.competencia_id}
            onChange={(e) => patch({ competencia_id: e.target.value, desempeno_ids: [] })}
            disabled={!comps.length}
          >
            <option value="">Elegir competencia…</option>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="cneb-select-wrap cneb-full">
        <span>Tema / título</span>
        <input
          type="text"
          className="cneb-search cneb-input-wide"
          maxLength={220}
          placeholder="Puede dejarlo vacío: la IA propone el tema según la competencia"
          value={form.titulo}
          onChange={(e) => patch({ titulo: e.target.value })}
        />
      </label>
      <label className="cneb-select-wrap cneb-full">
        <span>Propósito</span>
        <textarea
          rows={2}
          value={form.proposito}
          onChange={(e) => patch({ proposito: e.target.value })}
          placeholder="Qué se espera que logren en esta sesión"
        />
      </label>
      {!form.area_id ? (
        <p className="cneb-muted">
          Sin área CNEB: el cotejo queda en el registro auxiliar y el consolidado del colegio. No
          entra al corte AD/A/B/C ni al informe / SIAGIE.
        </p>
      ) : null}

      <h3 className="cneb-uso-title">Desempeños a observar</h3>
      {desempenosCorte.length === 0 ? (
        <p className="cneb-muted">
          {nivel === 'INICIAL'
            ? 'Elija área y competencia. En Inicial los desempeños ya están por edad.'
            : 'En Primaria y Secundaria las competencias están listas; los desempeños por grado se completan en la siguiente carga. Puede escribir el cotejo a mano.'}
        </p>
      ) : (
        <div className="cneb-des-checks">
          {desempenosCorte.map((d) => (
            <label key={d.id} className="cneb-check">
              <input
                type="checkbox"
                checked={form.desempeno_ids.map(String).includes(String(d.id))}
                onChange={() => toggleDes(d.id)}
              />
              <span>{d.texto}</span>
            </label>
          ))}
        </div>
      )}

      <div className="cneb-map-actions" style={{ margin: '0.85rem 0' }}>
        <button type="button" className="cneb-btn ghost" onClick={armarBorrador}>
          Armar borrador
        </button>
        <button
          type="button"
          className="cneb-btn primary"
          onClick={generarConIa}
          disabled={generating}
        >
          {generating ? 'Generando con IA…' : 'Generar con IA'}
        </button>
        <span className={`cneb-suma${sumaOk ? ' is-ok' : ' is-bad'}`}>
          Minutos: {suma} / {form.duracion_min}
        </span>
      </div>

      {['inicio', 'desarrollo', 'cierre'].map((tipo) => (
        <div key={tipo} className="cneb-momento">
          <div className="cneb-momento-head">
            <h3>{tipo === 'inicio' ? 'Inicio' : tipo === 'desarrollo' ? 'Desarrollo' : 'Cierre'}</h3>
            <label>
              Min
              <input
                type="number"
                min="0"
                max="180"
                value={form.minutos[tipo]}
                onChange={(e) =>
                  patch({ minutos: { ...form.minutos, [tipo]: parseInt(e.target.value, 10) || 0 } })
                }
              />
            </label>
          </div>
          <textarea
            rows={5}
            value={form.momentos[tipo]}
            onChange={(e) => patch({ momentos: { ...form.momentos, [tipo]: e.target.value } })}
            placeholder={
              tipo === 'inicio'
                ? 'Motivación, saberes previos, problematización y propósito…'
                : tipo === 'desarrollo'
                  ? 'Actividades, materiales, evidencia…'
                  : 'Metacognición, recojo de evidencias…'
            }
          />
        </div>
      ))}

      <label className="cneb-select-wrap cneb-full">
        <span>Ficha del estudiante</span>
        <textarea
          rows={8}
          value={form.ficha_estudiante}
          onChange={(e) => patch({ ficha_estudiante: e.target.value })}
          placeholder="Nombre, fecha, consignas numeradas, espacio para dibujar o escribir…"
        />
      </label>
      <p className="cneb-muted">
        Texto para imprimir y archivar evidencia física. La IA lo propone; puede dejarlo con nuestro
        lenguaje de aula o descargar la versión con membrete MINEDU.
      </p>

      <h3 className="cneb-uso-title">Lista de cotejo</h3>
      <p className="cneb-muted">Ítems que el docente marcará al observar. Puede editarlos o añadir más.</p>
      {(form.cotejo || []).map((c, i) => (
        <div key={`cot-${i}`} className="cneb-cotejo-row">
          <input
            type="text"
            value={c.item}
            onChange={(e) => {
              const next = [...form.cotejo];
              next[i] = { ...next[i], item: e.target.value };
              patch({ cotejo: next });
            }}
          />
          <button
            type="button"
            className="cneb-btn ghost"
            onClick={() => patch({ cotejo: form.cotejo.filter((_, j) => j !== i) })}
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        className="cneb-btn ghost"
        onClick={() => patch({ cotejo: [...(form.cotejo || []), { item: '' }] })}
      >
        Añadir ítem
      </button>

      <div className="cneb-map-actions" style={{ marginTop: '1.2rem' }}>
        <button type="button" className="cneb-btn ghost" onClick={() => guardar('borrador')} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button type="button" className="cneb-btn primary" onClick={() => guardar('aprobada')} disabled={saving}>
          Aprobar sesión
        </button>
      </div>
    </section>
  );
}
