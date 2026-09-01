import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../services/api';
import ReunionPersonalPicker from '../reuniones/ReunionPersonalPicker';
import ReunionFirmaModal from '../reuniones/ReunionFirmaModal';
import '../reuniones/ReunionesPage.css';
import '../reuniones/ReunionSalaLayout.css';

const TIPOS = {
  DOCENTE: 'Docente',
  TUTOR: 'Tutor',
  MANTENIMIENTO: 'Mantenimiento',
  OTRO: 'Otro personal',
};

const ESTADOS = {
  PROGRAMADA: 'Programada',
  EN_CURSO: 'En curso',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

function fmtFecha(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!d) return iso || '—';
  return `${d}/${m}/${y}`;
}

function IconoBasura() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

function nuevaClaveChecklist() {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function SupervisionVisitas({ canCrear, canConfig }) {
  const [params, setParams] = useSearchParams();
  const visitaParam = params.get('visita');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [vista, setVista] = useState(visitaParam ? 'detalle' : 'lista');
  const [pack, setPack] = useState(null);
  const [formAbierto, setFormAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/supervision/visitas');
      setItems(data.visitas || []);
    } catch (e) {
      setItems([]);
      const msg = e.response?.data?.error || 'No se pudieron cargar las supervisiones.';
      if (!/075|visitas/i.test(msg)) Swal.fire('Supervisión', msg, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirDetalle = useCallback(
    async (id) => {
      try {
        const { data } = await api.get(`/supervision/visitas/${id}`);
        setPack(data);
        setVista('detalle');
        setFormAbierto(false);
        const next = new URLSearchParams(params);
        next.set('visita', String(id));
        setParams(next, { replace: true });
      } catch (e) {
        Swal.fire('Supervisión', e.response?.data?.error || 'No se pudo abrir.', 'error');
      }
    },
    [params, setParams]
  );

  useEffect(() => {
    if (visitaParam) abrirDetalle(visitaParam);
    // solo al montar / cambiar id en URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitaParam]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (tipoFiltro && r.tipo !== tipoFiltro) return false;
      if (!needle) return true;
      const hay = [r.titulo, r.lugar, r.nombres_supervisados, fmtFecha(r.fecha), ESTADOS[r.estado], TIPOS[r.tipo]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, estadoFiltro, tipoFiltro]);

  const volverLista = () => {
    setVista('lista');
    setPack(null);
    const next = new URLSearchParams(params);
    next.delete('visita');
    setParams(next, { replace: true });
    cargar();
  };

  if (formAbierto) {
    return (
      <FormularioVisita
        onCancel={() => setFormAbierto(false)}
        onCreada={(data) => {
          setFormAbierto(false);
          setPack(data);
          setVista('detalle');
          const next = new URLSearchParams(params);
          next.set('visita', String(data.visita.id));
          setParams(next, { replace: true });
          cargar();
        }}
      />
    );
  }

  if (vista === 'detalle' && pack) {
    return <DetalleVisita pack={pack} setPack={setPack} onVolver={volverLista} />;
  }

  return (
    <div className="reuniones-page" style={{ maxWidth: '100%' }}>
      <div className="re-toolbar">
        <label className="re-search">
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, persona o fecha…"
          />
        </label>
        <select className="re-select" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, lab]) => (
            <option key={k} value={k}>{lab}</option>
          ))}
        </select>
        <select className="re-select" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([k, lab]) => (
            <option key={k} value={k}>{lab}</option>
          ))}
        </select>
        {canCrear ? (
          <button type="button" className="re-btn re-btn-solid" onClick={() => setFormAbierto(true)}>
            + Nueva supervisión
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="re-empty">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="re-empty">
          {canCrear ? 'Aún no hay supervisiones. Programa una visita y las personas recibirán el aviso.' : 'No tienes supervisiones asignadas.'}
        </p>
      ) : visibles.length === 0 ? (
        <p className="re-empty">Ninguna supervisión coincide con la búsqueda o el filtro.</p>
      ) : (
        <div className="re-lista-grid">
          {visibles.map((r) => (
            <div key={r.id} className="re-tile-wrap">
              <button
                type="button"
                className={`re-tile re-tile-${r.estado === 'EN_CURSO' ? 'EN_CURSO' : r.estado === 'CERRADA' ? 'CERRADA' : 'CONVOCADA'}`}
                onClick={() => abrirDetalle(r.id)}
              >
                <div className={`re-tile-fecha re-tile-fecha-${r.estado === 'EN_CURSO' ? 'EN_CURSO' : r.estado === 'CERRADA' ? 'CERRADA' : 'CONVOCADA'}`}>
                  <span className="re-tile-dia">{String(r.fecha || '').slice(8, 10)}</span>
                  <span className="re-tile-mes">{['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][Number(String(r.fecha || '').slice(5, 7)) - 1] || ''}</span>
                  <span className="re-tile-anio">{String(r.fecha || '').slice(0, 4)}</span>
                </div>
                <div className="re-tile-body">
                  <span className={`re-badge re-badge-${r.estado === 'PROGRAMADA' ? 'CONVOCADA' : r.estado}`}>{ESTADOS[r.estado] || r.estado}</span>
                  <h3>{r.titulo}</h3>
                  <p className="re-tile-hora">
                    {TIPOS[r.tipo] || r.tipo}
                    {r.hora_inicio ? ` · ${r.hora_inicio}` : ''}
                    {r.nombres_supervisados ? ` · ${r.nombres_supervisados}` : ''}
                  </p>
                </div>
              </button>
              {canConfig ? (
                <div className="re-card-ops">
                  <button
                    type="button"
                    className="re-card-del"
                    title="Eliminar"
                    aria-label="Eliminar"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await Swal.fire({
                        title: '¿Eliminar esta supervisión?',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, eliminar',
                      });
                      if (!ok.isConfirmed) return;
                      try {
                        await api.delete(`/supervision/visitas/${r.id}`);
                        cargar();
                      } catch (err) {
                        Swal.fire('Supervisión', err.response?.data?.error || 'No se pudo eliminar.', 'error');
                      }
                    }}
                  >
                    <IconoBasura />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormularioVisita({ onCancel, onCreada }) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('DOCENTE');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('');
  const [lugar, setLugar] = useState('');
  const [personas, setPersonas] = useState([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!titulo.trim() || !fecha || !personas.length) {
      Swal.fire('Supervisión', 'Completa título, fecha y al menos una persona.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/supervision/visitas', {
        titulo: titulo.trim(),
        tipo,
        fecha,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        lugar,
        supervisados: personas.map((p) => ({ usuario_id: p.usuario_id })),
      });
      Swal.fire({ toast: true, position: 'top-end', timer: 1800, showConfirmButton: false, icon: 'success', title: 'Aviso enviado' });
      onCreada(data);
    } catch (e) {
      Swal.fire('Supervisión', e.response?.data?.error || 'No se pudo programar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reuniones-page" style={{ maxWidth: 720 }}>
      <div className="re-hero">
        <div>
          <h1>Nueva supervisión</h1>
          <p>Se crea como aviso: las personas elegidas reciben notificación y lo ven en el calendario.</p>
        </div>
        <button type="button" className="re-btn re-btn-ghost" onClick={onCancel}>Volver</button>
      </div>
      <div className="re-field" style={{ marginBottom: '0.85rem' }}>
        <label>Título</label>
        <input className="re-buscador-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Visita al aula 3° A" />
      </div>
      <div className="re-row-mod tres" style={{ marginBottom: '0.85rem' }}>
        <div className="re-field">
          <label>Tipo</label>
          <select className="re-buscador-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS).map(([k, lab]) => (
              <option key={k} value={k}>{lab}</option>
            ))}
          </select>
        </div>
        <div className="re-field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="re-field">
          <label>Hora</label>
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </div>
      </div>
      <div className="re-row-mod dos" style={{ marginBottom: '0.85rem' }}>
        <div className="re-field">
          <label>Hora fin (opcional)</label>
          <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>
        <div className="re-field">
          <label>Lugar</label>
          <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Aula, patio, portería…" />
        </div>
      </div>
      <div className="re-buscador">
        <div className="re-buscador-head">
          <div>
            <label>Personas a supervisar</label>
            <p className="re-hint">Puedes marcar varias. Cada una recibirá el aviso y firmará por su lado.</p>
          </div>
          <button type="button" className="re-btn re-btn-solid re-btn-personal" onClick={() => setModal(true)}>
            Elegir personal
          </button>
        </div>
        <div className="re-invitados">
          {personas.map((p) => (
            <span key={p.usuario_id} className="re-tag re-tag-lg">
              {p.nombre_completo}
              <button type="button" aria-label="Quitar" onClick={() => setPersonas(personas.filter((x) => Number(x.usuario_id) !== Number(p.usuario_id)))}>×</button>
            </span>
          ))}
        </div>
      </div>
      <div className="re-actions-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="re-btn re-btn-solid" disabled={saving} onClick={guardar}>
          {saving ? 'Guardando…' : 'Programar y avisar'}
        </button>
        <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <ReunionPersonalPicker
        abierto={modal}
        endpoint="/supervision/personal"
        invitadosIds={personas.map((p) => p.usuario_id)}
        onCerrar={() => setModal(false)}
        onAgregar={(nuevos) => {
          const ids = new Set(personas.map((p) => Number(p.usuario_id)));
          const extra = (nuevos || []).filter((p) => !ids.has(Number(p.usuario_id)));
          if (extra.length) setPersonas([...personas, ...extra]);
        }}
      />
    </div>
  );
}

function DetalleVisita({ pack, setPack, onVolver }) {
  const v = pack.visita;
  const p = pack.permisos || {};
  const personas = pack.personas || [];
  const supervisados = personas.filter((x) => x.rol === 'SUPERVISADO');
  const supervisores = personas.filter((x) => x.rol === 'SUPERVISOR');
  const [checklist, setChecklist] = useState(() => v.checklist || []);
  const [observaciones, setObservaciones] = useState(v.observaciones || '');
  const [acuerdos, setAcuerdos] = useState(v.acuerdos || '');
  const [miComentario, setMiComentario] = useState(pack.mi_participacion?.comentario || '');
  const [firmaAbierta, setFirmaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setChecklist(v.checklist || []);
    setObservaciones(v.observaciones || '');
    setAcuerdos(v.acuerdos || '');
    setMiComentario(pack.mi_participacion?.comentario || '');
  }, [v.id, v.checklist, v.observaciones, v.acuerdos, pack.mi_participacion?.comentario]);

  const guardarRegistro = async () => {
    const listos = (checklist || []).filter((c) => String(c.label || '').trim());
    if ((checklist || []).length && !listos.length) {
      Swal.fire('Supervisión', 'Escribe el nombre de al menos un criterio de observación.', 'warning');
      return;
    }
    setGuardando(true);
    try {
      const { data } = await api.patch(`/supervision/visitas/${v.id}`, {
        checklist: listos,
        observaciones,
        acuerdos,
      });
      setPack(data);
      Swal.fire({ toast: true, position: 'top-end', timer: 1600, showConfirmButton: false, icon: 'success', title: 'Guardado' });
    } catch (e) {
      Swal.fire('Supervisión', e.response?.data?.error || 'No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const guardarComentario = async () => {
    try {
      const { data } = await api.post(`/supervision/visitas/${v.id}/comentario`, { comentario: miComentario });
      setPack(data);
      Swal.fire({ toast: true, position: 'top-end', timer: 1600, showConfirmButton: false, icon: 'success', title: 'Alcance guardado' });
    } catch (e) {
      Swal.fire('Supervisión', e.response?.data?.error || 'No se pudo guardar tu alcance.', 'error');
    }
  };

  const firmar = async (firma_data) => {
    try {
      const { data } = await api.post(`/supervision/visitas/${v.id}/firmar`, { firma_data });
      setPack(data);
      setFirmaAbierta(false);
      Swal.fire({ toast: true, position: 'top-end', timer: 1600, showConfirmButton: false, icon: 'success', title: 'Firma guardada' });
    } catch (e) {
      Swal.fire('Firma', e.response?.data?.error || 'No se pudo firmar.', 'error');
    }
  };

  const cerrar = async () => {
    const ok = await Swal.fire({
      title: '¿Cerrar esta supervisión?',
      text: 'Nadie podrá editar, comentar ni firmar después.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
    });
    if (!ok.isConfirmed) return;
    try {
      const { data } = await api.post(`/supervision/visitas/${v.id}/cerrar`);
      setPack(data);
    } catch (e) {
      Swal.fire('Supervisión', e.response?.data?.error || 'No se pudo cerrar.', 'error');
    }
  };

  const actualizarItem = (idx, patch) => {
    setChecklist(checklist.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const agregarItem = () => {
    setChecklist([
      ...checklist,
      { key: nuevaClaveChecklist(), label: '', marcado: false, nota: '' },
    ]);
  };

  const quitarItem = async (idx) => {
    const item = checklist[idx];
    if (item?.label || item?.nota) {
      const ok = await Swal.fire({
        title: '¿Quitar este ítem?',
        text: item.label || 'Ítem de observación',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Quitar',
        cancelButtonText: 'Cancelar',
      });
      if (!ok.isConfirmed) return;
    }
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  const soloLecturaRegistro = !p.puede_editar;

  return (
    <div className="reuniones-page" style={{ maxWidth: 860 }}>
      <div className="re-hero">
        <div>
          <h1>{v.titulo}</h1>
          <p>
            {fmtFecha(v.fecha)}
            {v.hora_inicio ? ` · ${v.hora_inicio}` : ''}
            {v.lugar ? ` · ${v.lugar}` : ''} · {TIPOS[v.tipo] || v.tipo}
            {supervisores.length ? ` · Supervisor: ${supervisores.map((s) => s.nombre).join(', ')}` : ''}
          </p>
        </div>
        <div className="re-hero-actions">
          <span className={`re-badge re-badge-${v.estado === 'PROGRAMADA' ? 'CONVOCADA' : v.estado}`}>{ESTADOS[v.estado]}</span>
          <button type="button" className="re-btn re-btn-ghost" onClick={onVolver}>Volver</button>
        </div>
      </div>

      {v.estado === 'CERRADA' ? (
        <p className="re-hint" style={{ marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
          Esta supervisión está cerrada. Ya no se puede editar, comentar ni firmar.
        </p>
      ) : null}

      {p.es_supervisado && v.estado !== 'CERRADA' && v.estado !== 'CANCELADA' ? (
        <p className="re-hint" style={{ marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
          Puedes leer lo que registró el supervisor. Tu parte es el alcance / comentario y la firma.
        </p>
      ) : null}

      <div className="re-detalle" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Lista de observación</h3>
        {p.puede_editar ? (
          <p className="re-hint">Puedes cambiar los criterios, agregar o quitar ítems y anotar en cada uno.</p>
        ) : null}
        {(checklist || []).map((item, idx) => (
          <div key={item.key || idx} className="sup-obs-item">
            <input
              type="checkbox"
              checked={!!item.marcado}
              disabled={soloLecturaRegistro}
              onChange={(e) => actualizarItem(idx, { marcado: e.target.checked })}
              aria-label={item.label || `Ítem ${idx + 1}`}
            />
            <div className="sup-obs-item-body">
              {p.puede_editar ? (
                <>
                  <input
                    className="sup-obs-label-input"
                    value={item.label || ''}
                    placeholder="Criterio de observación"
                    onChange={(e) => actualizarItem(idx, { label: e.target.value })}
                  />
                  <textarea
                    className="sup-obs-nota"
                    rows={4}
                    value={item.nota || ''}
                    placeholder="Nota (opcional)"
                    onChange={(e) => actualizarItem(idx, { nota: e.target.value })}
                  />
                  <button type="button" className="sup-obs-quitar" onClick={() => quitarItem(idx)}>
                    Quitar ítem
                  </button>
                </>
              ) : (
                <>
                  <strong>{item.label || '—'}</strong>
                  {item.nota ? <p className="sup-obs-readonly">{item.nota}</p> : null}
                </>
              )}
            </div>
          </div>
        ))}
        {p.puede_editar ? (
          <button type="button" className="re-btn re-btn-ghost sup-obs-agregar" onClick={agregarItem}>
            + Agregar ítem
          </button>
        ) : null}

        {p.puede_editar ? (
          <>
            <label className="re-field" style={{ marginTop: '0.85rem' }}>
              Observaciones
              <textarea rows={4} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </label>
            <label className="re-field" style={{ marginTop: '0.65rem' }}>
              Acuerdos
              <textarea rows={4} value={acuerdos} onChange={(e) => setAcuerdos(e.target.value)} />
            </label>
            <div className="re-actions-row" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="re-btn re-btn-solid" disabled={guardando} onClick={guardarRegistro}>
                Guardar registro
              </button>
              {p.puede_cerrar ? (
                <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={cerrar}>
                  Cerrar supervisión
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="re-field" style={{ marginTop: '0.85rem' }}>
              <span>Observaciones</span>
              <p className="sup-obs-readonly">{String(observaciones || '').trim() || 'Sin observaciones.'}</p>
            </div>
            <div className="re-field" style={{ marginTop: '0.65rem' }}>
              <span>Acuerdos</span>
              <p className="sup-obs-readonly">{String(acuerdos || '').trim() || 'Sin acuerdos.'}</p>
            </div>
          </>
        )}
      </div>

      {supervisados.map((per) => {
        const esMia = Number(pack.mi_participacion?.usuario_id) === Number(per.usuario_id);
        return (
          <div key={per.usuario_id} className="re-detalle" style={{ marginBottom: '0.85rem' }}>
            <h3 style={{ marginTop: 0 }}>{per.nombre}</h3>
            <p className="re-hint">{per.tiene_firma ? 'Ya firmó' : 'Pendiente de firma'}</p>
            {esMia && p.puede_comentar ? (
              <>
                <label className="re-field">
                  Tu alcance / comentario
                  <textarea rows={5} value={miComentario} onChange={(e) => setMiComentario(e.target.value)} />
                </label>
                <div className="re-actions-row" style={{ marginTop: '0.55rem' }}>
                  <button type="button" className="re-btn re-btn-solid" onClick={guardarComentario}>Guardar alcance</button>
                  {p.puede_firmar ? (
                    <button type="button" className="re-btn re-btn-asistio" onClick={() => setFirmaAbierta(true)}>Firmar</button>
                  ) : null}
                </div>
              </>
            ) : (
              <p>{per.comentario || 'Sin alcance todavía.'}</p>
            )}
            {per.firma_data ? <img src={per.firma_data} alt={`Firma de ${per.nombre}`} className="re-firma-mini" /> : null}
          </div>
        );
      })}

      <ReunionFirmaModal
        abierto={firmaAbierta}
        onCerrar={() => setFirmaAbierta(false)}
        onFirmar={firmar}
        titulo="Firmar la supervisión"
        hint="Con tu firma dejas constancia de que leíste lo registrado y estás al tanto."
      />
    </div>
  );
}
