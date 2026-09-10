import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './AgendaInterna.css';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const AVISO_CHIPS = [
  { n: 10, label: '10 días antes' },
  { n: 7, label: '7 días' },
  { n: 5, label: '5 días' },
  { n: 3, label: '3 días' },
  { n: 1, label: '1 día antes' },
];

const FORM_VACIO = {
  titulo: '',
  tipo: 'OPERATIVO',
  fecha_inicio: '',
  fecha_fin: '',
  rango: false,
  lugar: '',
  descripcion: '',
  aviso_dias: [7, 3, 1, 0],
  avisos_roles: ['ADMINISTRADOR', 'COORDINADOR', 'PROMOTORIA', 'DIRECTOR', 'DOCENTE'],
};

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtLargo(s) {
  const d = parseYmd(s);
  if (!d) return '—';
  return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtCorto(s) {
  const d = parseYmd(s);
  if (!d) return '—';
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

function textoCuenta(ev) {
  if (ev.estado === 'HECHO') return 'Hecho';
  if (ev.estado === 'CANCELADO') return 'Cancelado';
  const n = ev.dias_restantes;
  if (n == null) return '';
  if (n < 0) return n === -1 ? 'Venció ayer' : `Venció hace ${-n} días`;
  if (n === 0) return 'Vence hoy';
  if (n === 1) return 'Vence mañana';
  return `Faltan ${n} días`;
}

function celdasMes(anio, mes) {
  const first = new Date(anio, mes - 1, 1);
  const dow = first.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const start = new Date(anio, mes - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      ymd: ymdLocal(d),
      dia: d.getDate(),
      fuera: d.getMonth() !== mes - 1,
    };
  });
}

function eventoCubreDia(ev, ymd) {
  return ev.fecha_inicio <= ymd && ev.fecha_fin >= ymd;
}

function toastOk(titulo) {
  return Swal.fire({
    icon: 'success',
    title: titulo,
    timer: 1400,
    showConfirmButton: false,
  });
}

function toastErr(msg) {
  return Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: msg || 'Inténtalo de nuevo.' });
}

export default function AgendaInterna() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const hoy = useMemo(() => ymdLocal(new Date()), []);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { anio: n.getFullYear(), mes: n.getMonth() + 1 };
  });
  const [meta, setMeta] = useState({ tipos: [], avisos_roles: [], puede_gestionar: false });
  const [eventos, setEventos] = useState([]);
  const [resumen, setResumen] = useState({ pendientes: 0, hoy: 0, vencidos: 0, proximos: 0 });
  const [proximos, setProximos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('PENDIENTE');
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  const puedeGestionar = meta.puede_gestionar === true;
  const celdas = useMemo(() => celdasMes(cursor.anio, cursor.mes), [cursor]);

  const porDia = useMemo(() => {
    const map = {};
    for (const ev of eventos) {
      for (const c of celdas) {
        if (eventoCubreDia(ev, c.ymd)) {
          if (!map[c.ymd]) map[c.ymd] = [];
          map[c.ymd].push(ev);
        }
      }
    }
    return map;
  }, [eventos, celdas]);

  const cargarMeta = useCallback(async () => {
    const res = await api.get('/agenda-interna/meta');
    setMeta({
      tipos: res.data.tipos || [],
      avisos_roles: res.data.avisos_roles || [],
      puede_gestionar: !!res.data.puede_gestionar,
    });
  }, []);

  const cargarMes = useCallback(async () => {
    const res = await api.get('/agenda-interna/eventos', {
      params: {
        anio: cursor.anio,
        mes: cursor.mes,
        estado: filtroEstado || undefined,
        tipo: filtroTipo || undefined,
      },
    });
    setEventos(res.data.eventos || []);
    setResumen(res.data.resumen || { pendientes: 0, hoy: 0, vencidos: 0, proximos: 0 });
    if (res.data.puede_gestionar != null) {
      setMeta((m) => ({ ...m, puede_gestionar: !!res.data.puede_gestionar }));
    }
  }, [cursor, filtroEstado, filtroTipo]);

  const cargarProximos = useCallback(async () => {
    const res = await api.get('/agenda-interna/proximos');
    setProximos(res.data.eventos || []);
  }, []);

  const recargar = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([cargarMes(), cargarProximos()]);
    } catch (e) {
      const msg = e.response?.data?.error || 'No se pudo cargar la agenda.';
      toastErr(msg);
    } finally {
      setLoading(false);
    }
  }, [cargarMes, cargarProximos]);

  useEffect(() => {
    cargarMeta().catch(() => {});
  }, [cargarMeta]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const abrirEvento = useCallback(async (id) => {
    try {
      const res = await api.get(`/agenda-interna/eventos/${id}`);
      const ev = res.data.evento;
      const d = parseYmd(ev?.fecha_fin || ev?.fecha_inicio);
      if (d) setCursor({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
      setSelected(ev);
      setPanel('detalle');
    } catch {
      toastErr('No se encontró ese aviso.');
    }
  }, []);

  useEffect(() => {
    if (!panel) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  useEffect(() => {
    const id = parseInt(searchParams.get('id'), 10);
    if (Number.isFinite(id) && id > 0) {
      abrirEvento(id);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, abrirEvento]);

  const abrirCrear = (ymd) => {
    if (!puedeGestionar) return;
    setForm({
      ...FORM_VACIO,
      fecha_inicio: ymd || hoy,
      fecha_fin: ymd || hoy,
    });
    setSelected(null);
    setPanel('form');
  };

  const abrirEditar = (ev) => {
    setForm({
      titulo: ev.titulo || '',
      tipo: ev.tipo || 'OPERATIVO',
      fecha_inicio: ev.fecha_inicio,
      fecha_fin: ev.fecha_fin,
      rango: ev.fecha_inicio !== ev.fecha_fin,
      lugar: ev.lugar || '',
      descripcion: ev.descripcion || '',
      aviso_dias: ev.aviso_dias?.length ? ev.aviso_dias : [7, 3, 1, 0],
      avisos_roles: ev.avisos_roles?.length ? ev.avisos_roles : FORM_VACIO.avisos_roles,
    });
    setSelected(ev);
    setPanel('form');
  };

  const cerrarPanel = () => {
    setPanel(null);
    setSelected(null);
  };

  const toggleChip = (campo, valor) => {
    setForm((f) => {
      const set = new Set(f[campo]);
      if (set.has(valor)) set.delete(valor);
      else set.add(valor);
      const next = campo === 'aviso_dias'
        ? [...set].sort((a, b) => b - a)
        : FORM_VACIO.avisos_roles.filter((r) => set.has(r));
      return { ...f, [campo]: next };
    });
  };

  const esEdicion = !!(selected?.id && panel === 'form' && selected.estado);

  const guardarLimpio = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toastErr('Ponle un título al aviso.');
      return;
    }
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.rango ? (form.fecha_fin || form.fecha_inicio) : form.fecha_inicio,
      lugar: form.lugar,
      descripcion: form.descripcion,
      aviso_dias: [...new Set([...(form.aviso_dias || []), 0])],
      avisos_roles: form.avisos_roles.length ? form.avisos_roles : FORM_VACIO.avisos_roles,
    };
    try {
      let saved;
      if (esEdicion) {
        const res = await api.put(`/agenda-interna/eventos/${selected.id}`, payload);
        saved = res.data.evento;
        await toastOk('Aviso actualizado');
      } else {
        const res = await api.post('/agenda-interna/eventos', payload);
        saved = res.data.evento;
        await toastOk('Aviso creado. Ya avisamos en la campanita.');
      }
      await recargar();
      setSelected(saved);
      setPanel('detalle');
    } catch (err) {
      toastErr(err.response?.data?.error);
    } finally {
      setSaving(false);
    }
  };

  const marcarHecho = async (ev) => {
    try {
      const res = await api.patch(`/agenda-interna/eventos/${ev.id}/hecho`);
      await toastOk('Listo, ya no aprieta');
      await recargar();
      setSelected(res.data.evento);
    } catch (err) {
      toastErr(err.response?.data?.error);
    }
  };

  const reabrir = async (ev) => {
    try {
      const res = await api.patch(`/agenda-interna/eventos/${ev.id}/reabrir`);
      await recargar();
      setSelected(res.data.evento);
    } catch (err) {
      toastErr(err.response?.data?.error);
    }
  };

  const eliminar = async (ev) => {
    const ok = await Swal.fire({
      title: '¿Eliminar este aviso?',
      text: ev.titulo,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/agenda-interna/eventos/${ev.id}`);
      await toastOk('Eliminado');
      cerrarPanel();
      await recargar();
    } catch (err) {
      toastErr(err.response?.data?.error);
    }
  };

  const onClickDia = (celda) => {
    const lista = porDia[celda.ymd] || [];
    if (lista.length === 1) {
      setSelected(lista[0]);
      setPanel('detalle');
      return;
    }
    if (lista.length > 1) {
      setSelected({ _dia: celda.ymd, _lista: lista });
      setPanel('dia');
      return;
    }
    if (puedeGestionar && !celda.fuera) abrirCrear(celda.ymd);
  };

  const tituloMes = `${MESES[cursor.mes - 1]} ${cursor.anio}`;
  const soloLectura = user?.tipo === 'DOCENTE';

  return (
    <DashboardLayout>
      <div className="ai-page">
        <header className="ai-hero">
          <div className="ai-hero-icon" aria-hidden>🗓️</div>
          <div className="ai-hero-text">
            <h1>Agenda interna</h1>
            <p>
              Avisos del colegio: fumigación, plazos, inspecciones. No se publica en la web.
              {soloLectura ? ' Aquí solo consultas; si falta algo, avisa a coordinación.' : ' Crea un aviso en segundos y la campanita cuenta los días.'}
            </p>
            <div className="ai-hero-meta">
              <span className="ai-chip">{resumen.pendientes} pendientes</span>
              <span className="ai-chip ai-chip--hoy">{resumen.hoy} hoy</span>
              <span className="ai-chip ai-chip--warn">{resumen.vencidos} vencidos</span>
            </div>
          </div>
          {puedeGestionar && (
            <button type="button" className="ai-btn-crear" onClick={() => abrirCrear(hoy)}>
              + Crear aviso
            </button>
          )}
        </header>

        <div className="ai-toolbar">
          <div className="ai-mes-nav">
            <button type="button" onClick={() => setCursor((c) => {
              const d = new Date(c.anio, c.mes - 2, 1);
              return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
            })} aria-label="Mes anterior">‹</button>
            <strong>{tituloMes}</strong>
            <button type="button" onClick={() => setCursor((c) => {
              const d = new Date(c.anio, c.mes, 1);
              return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
            })} aria-label="Mes siguiente">›</button>
            <button
              type="button"
              className="ai-hoy-btn"
              onClick={() => {
                const n = new Date();
                setCursor({ anio: n.getFullYear(), mes: n.getMonth() + 1 });
              }}
            >
              Hoy
            </button>
          </div>
          <label className="ai-filter">
            Tipo
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {(meta.tipos || []).map((t) => (
                <option key={t.codigo} value={t.codigo}>{t.icono} {t.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="ai-filter">
            Estado
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="PENDIENTE">Pendientes</option>
              <option value="HECHO">Hechos</option>
              <option value="">Todos</option>
            </select>
          </label>
        </div>

        <div className="ai-layout">
          <section className="ai-cal-card">
            <div className="ai-cal-head">
              {DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}
            </div>
            {loading ? (
              <p className="ai-loading">Cargando el mes…</p>
            ) : (
              <div className="ai-cal-grid">
                {celdas.map((c) => {
                  const lista = porDia[c.ymd] || [];
                  const esHoy = c.ymd === hoy;
                  return (
                    <button
                      key={c.ymd}
                      type="button"
                      className={`ai-day${c.fuera ? ' is-out' : ''}${esHoy ? ' is-today' : ''}${lista.some((e) => e.urgencia === 'vencido') ? ' has-overdue' : ''}`}
                      onClick={() => onClickDia(c)}
                    >
                      <span className="ai-day-num">{c.dia}</span>
                      <span className="ai-day-dots">
                        {lista.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className="ai-pill"
                            style={{ background: ev.tipo_color, opacity: ev.estado === 'HECHO' ? 0.45 : 1 }}
                            title={ev.titulo}
                          >
                            {ev.titulo}
                          </span>
                        ))}
                        {lista.length > 3 && <span className="ai-more">+{lista.length - 3}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="ai-side">
            <h2>Próximos</h2>
            <p className="ai-side-lead">Lo que hay que mirar ya. El rojo no espera.</p>
            {proximos.length === 0 ? (
              <div className="ai-empty">
                <span aria-hidden>✨</span>
                <p>Nada pendiente. Cuando crees un aviso, aparece aquí con la cuenta regresiva.</p>
              </div>
            ) : (
              <ul className="ai-prox-list">
                {proximos.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" className={`ai-prox ai-prox--${ev.urgencia}`} onClick={() => { setSelected(ev); setPanel('detalle'); }}>
                      <span className="ai-prox-icon" style={{ background: `${ev.tipo_color}22`, color: ev.tipo_color }}>{ev.tipo_icono}</span>
                      <span className="ai-prox-body">
                        <strong>{ev.titulo}</strong>
                        <em>{textoCuenta(ev)} · {fmtCorto(ev.fecha_fin)}</em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {panel && (
        <div className="ai-overlay" role="presentation" onClick={cerrarPanel}>
          <div className="ai-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ai-drawer-close" onClick={cerrarPanel} aria-label="Cerrar">×</button>

            {panel === 'dia' && selected?._lista && (
              <>
                <h3 className="ai-drawer-title">{fmtLargo(selected._dia)}</h3>
                <ul className="ai-dia-list">
                  {selected._lista.map((ev) => (
                    <li key={ev.id}>
                      <button type="button" className="ai-prox" onClick={() => { setSelected(ev); setPanel('detalle'); }}>
                        <span className="ai-prox-icon" style={{ background: `${ev.tipo_color}22` }}>{ev.tipo_icono}</span>
                        <span className="ai-prox-body">
                          <strong>{ev.titulo}</strong>
                          <em>{textoCuenta(ev)}</em>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {puedeGestionar && (
                  <button type="button" className="ai-btn-primary" onClick={() => abrirCrear(selected._dia)}>
                    + Aviso este día
                  </button>
                )}
              </>
            )}

            {panel === 'detalle' && selected?.id && (
              <DetalleAviso
                ev={selected}
                puedeGestionar={puedeGestionar}
                onEditar={() => abrirEditar(selected)}
                onHecho={() => marcarHecho(selected)}
                onReabrir={() => reabrir(selected)}
                onEliminar={() => eliminar(selected)}
              />
            )}

            {panel === 'form' && (
              <form className="ai-form" onSubmit={guardarLimpio}>
                <h3 className="ai-drawer-title">{esEdicion ? 'Editar aviso' : 'Nuevo aviso'}</h3>
                <p className="ai-form-lead">Título, fecha y listo. Lo demás es opcional.</p>

                <label>
                  ¿Qué hay que hacer?
                  <input
                    autoFocus
                    maxLength={160}
                    placeholder="Ej. Fumigación de pabellón A"
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  />
                </label>

                <div className="ai-tipos">
                  {(meta.tipos || []).map((t) => (
                    <button
                      key={t.codigo}
                      type="button"
                      className={`ai-tipo${form.tipo === t.codigo ? ' is-on' : ''}`}
                      style={form.tipo === t.codigo ? { borderColor: t.color, background: `${t.color}18` } : undefined}
                      onClick={() => setForm((f) => ({ ...f, tipo: t.codigo }))}
                    >
                      <span>{t.icono}</span>
                      {t.etiqueta}
                    </button>
                  ))}
                </div>

                <div className="ai-fechas">
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={form.fecha_inicio}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        fecha_inicio: e.target.value,
                        fecha_fin: f.rango ? f.fecha_fin : e.target.value,
                      }))}
                    />
                  </label>
                  <label className="ai-check">
                    <input
                      type="checkbox"
                      checked={form.rango}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        rango: e.target.checked,
                        fecha_fin: e.target.checked ? (f.fecha_fin || f.fecha_inicio) : f.fecha_inicio,
                      }))}
                    />
                    Varios días
                  </label>
                  {form.rango && (
                    <label>
                      Hasta
                      <input
                        type="date"
                        value={form.fecha_fin}
                        min={form.fecha_inicio}
                        onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                      />
                    </label>
                  )}
                </div>

                <label>
                  Lugar <span>(opcional)</span>
                  <input
                    maxLength={160}
                    placeholder="Pabellón, almacén…"
                    value={form.lugar}
                    onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                  />
                </label>

                <label>
                  Nota <span>(opcional)</span>
                  <textarea
                    rows={3}
                    placeholder="Detalle corto para quien reciba el aviso"
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  />
                </label>

                <fieldset>
                  <legend>¿A quién avisamos?</legend>
                  <div className="ai-chips">
                    {(meta.avisos_roles || []).map((r) => (
                      <button
                        key={r.codigo}
                        type="button"
                        className={`ai-chip-btn${form.avisos_roles.includes(r.codigo) ? ' is-on' : ''}`}
                        onClick={() => toggleChip('avisos_roles', r.codigo)}
                      >
                        {r.etiqueta}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Recordatorios extra (el día y al vencer siempre se avisa)</legend>
                  <div className="ai-chips">
                    {AVISO_CHIPS.map((c) => (
                      <button
                        key={c.n}
                        type="button"
                        className={`ai-chip-btn${form.aviso_dias.includes(c.n) ? ' is-on' : ''}`}
                        onClick={() => toggleChip('aviso_dias', c.n)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <button type="submit" className="ai-btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear y avisar'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function DetalleAviso({ ev, puedeGestionar, onEditar, onHecho, onReabrir, onEliminar }) {
  const rango = ev.fecha_inicio !== ev.fecha_fin;
  return (
    <div className="ai-detalle">
      <div className="ai-detalle-kicker" style={{ color: ev.tipo_color }}>
        {ev.tipo_icono} {ev.tipo_etiqueta}
      </div>
      <h3 className="ai-drawer-title">{ev.titulo}</h3>
      <div className={`ai-count ai-count--${ev.urgencia}`}>
        <strong>{textoCuenta(ev)}</strong>
        <span>{rango ? `${fmtCorto(ev.fecha_inicio)} → ${fmtLargo(ev.fecha_fin)}` : fmtLargo(ev.fecha_fin)}</span>
      </div>
      {ev.lugar ? <p className="ai-lugar">📍 {ev.lugar}</p> : null}
      {ev.descripcion ? <p className="ai-nota">{ev.descripcion}</p> : null}
      <p className="ai-meta-line">
        Creado por {ev.creador_nombre || 'el equipo'}
        {ev.estado === 'HECHO' && ev.hecho_nombre ? ` · cerrado por ${ev.hecho_nombre}` : ''}
      </p>
      {puedeGestionar && (
        <div className="ai-detalle-actions">
          {ev.estado === 'PENDIENTE' ? (
            <button type="button" className="ai-btn-primary" onClick={onHecho}>Marcar hecho</button>
          ) : (
            <button type="button" className="ai-btn-ghost" onClick={onReabrir}>Reabrir</button>
          )}
          <button type="button" className="ai-btn-ghost" onClick={onEditar}>Editar</button>
          <button type="button" className="ai-btn-danger" onClick={onEliminar}>Eliminar</button>
        </div>
      )}
    </div>
  );
}
