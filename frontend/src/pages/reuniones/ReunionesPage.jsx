import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { esGestorReunionesFront, rutaBaseReuniones } from '../../utils/reunionesRutas';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import ReunionFirmaModal from './ReunionFirmaModal';
import ReunionPizarra from './ReunionPizarra';
import ReunionVideoDaily from './ReunionVideoDaily';
import ReunionChat from './ReunionChat';
import ReunionActaViva from './ReunionActaViva';
import ReunionArchivosLista from './ReunionArchivoIcono';
import ReunionCronometro from './ReunionCronometro';
import VanguardRoomMarca from './VanguardRoomMarca';
import './ReunionesPage.css';

const ESTADOS = {
  BORRADOR: 'Borrador',
  CONVOCADA: 'Convocada',
  EN_CURSO: 'En curso',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const MODALIDAD = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HIBRIDA: 'Híbrida',
};

function IconoLapiz() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-1.66z" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function partesFecha(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  const mi = Number(m) - 1;
  return {
    dia: d || '—',
    mes: MESES_CORTOS[mi] || '',
    anio: y || '',
  };
}

function etiquetaTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ALUMNO') return 'Alumno';
  if (t === 'APODERADO') return 'Apoderado';
  if (t === 'DOCENTE') return 'Docente';
  if (t === 'GRUPO') return 'Aula';
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : 'Personal';
}

function etiquetaAudienciaGrupo(g) {
  const bits = [];
  if (g.alumnos) bits.push('alumnos');
  if (g.apoderados) bits.push('apoderados');
  if (g.docentes) bits.push('docentes');
  return bits.join(' + ') || 'elige destinatarios';
}

function htmlReunion(raw) {
  const s = String(raw || '');
  if (!s.trim()) return '';
  if (/<[a-z][\s\S]*>/i.test(s)) return procesarHTMLMensaje(s);
  return procesarHTMLMensaje(s.replace(/\n/g, '<br>'));
}

async function confirmarEliminarReunion(id) {
  const ok = await Swal.fire({
    title: '¿Eliminar esta reunión?',
    text: 'Se borra todo: convocados, acta, chat, pizarra, archivos y la sala de video. No se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar todo',
    cancelButtonText: 'No',
    confirmButtonColor: '#b91c1c',
  });
  if (!ok.isConfirmed) return false;
  await api.delete(`/reuniones/${id}`);
  return true;
}

function formularioVacio() {
  return {
    titulo: '',
    fecha: '',
    hora_inicio: '08:00',
    hora_fin: '',
    modalidad: 'PRESENCIAL',
    lugar: '',
    enlace_videollamada: '',
    descripcion: '',
  };
}

function ReunionesPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = rutaBaseReuniones(user?.tipo);
  const esGestor = esGestorReunionesFront(user?.tipo);

  if (id === 'nueva') {
    return <FormularioReunion base={base} esGestor={esGestor} />;
  }
  if (id) {
    return <DetalleReunion reunionId={id} base={base} />;
  }
  return <ListaReuniones base={base} esGestor={esGestor} navigate={navigate} />;
}

function ListaReuniones({ base, esGestor, navigate }) {
  const { user } = useAuth();
  const uid = Number(user?.usuario_id ?? user?.id);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reuniones', { params: { filtro: 'todas' } });
      setItems(data.reuniones || []);
    } catch (e) {
      setItems([]);
      Swal.fire('Reuniones', e.response?.data?.error || 'No se pudieron cargar las reuniones.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (!needle) return true;
      const hay = [r.titulo, r.lugar, fmtFecha(r.fecha), ESTADOS[r.estado], r.hora_inicio, r.hora_fin]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, estadoFiltro]);

  return (
    <DashboardLayout>
      <div className="reuniones-page">
        <div className="re-hero">
          <div className="re-hero-brand">
            <VanguardRoomMarca invert />
            <p>Todas las convocatorias en un mismo lugar. Busca por título o filtra por estado.</p>
          </div>
          <div className="re-hero-actions">
            {esGestor ? (
              <button type="button" className="re-btn re-btn-primary" onClick={() => navigate(`${base}/nueva`)}>
                Nueva reunión
              </button>
            ) : null}
          </div>
        </div>
        <div className="re-toolbar">
          <label className="re-search">
            <span className="sr-only">Buscar reuniones</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, fecha o lugar…"
              autoComplete="off"
            />
          </label>
          <select
            className="re-select"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS).map(([k, lab]) => (
              <option key={k} value={k}>
                {lab}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="re-empty">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="re-empty">Aún no hay reuniones.</p>
        ) : visibles.length === 0 ? (
          <p className="re-empty">Ninguna reunión coincide con la búsqueda o el filtro.</p>
        ) : (
          <div className="re-lista-grid">
            {visibles.map((r) => {
              const f = partesFecha(r.fecha);
              return (
                <div key={r.id} className="re-tile-wrap">
                  <button
                    type="button"
                    className={`re-tile ${r.estado === 'EN_CURSO' ? 're-tile-viva' : ''}`}
                    onClick={() => navigate(`${base}/${r.id}`)}
                  >
                    <div className={`re-tile-fecha re-tile-fecha-${r.estado}`}>
                      <span className="re-tile-dia">{f.dia}</span>
                      <span className="re-tile-mes">{f.mes}</span>
                      <span className="re-tile-anio">{f.anio}</span>
                    </div>
                    <div className="re-tile-body">
                      <span className={`re-badge re-badge-${r.estado}`}>{ESTADOS[r.estado] || r.estado}</span>
                      <h3>{r.titulo}</h3>
                      <p className="re-tile-hora">
                        {r.hora_inicio || '—'}
                        {r.hora_fin ? ` – ${r.hora_fin}` : ''}
                      </p>
                    </div>
                  </button>
                  {esGestor || Number(r.creador_usuario_id) === uid ? (
                    <div className="re-card-ops">
                      {['BORRADOR', 'CONVOCADA', 'EN_CURSO'].includes(r.estado) ? (
                        <button
                          type="button"
                          className="re-card-edit"
                          title="Editar fecha, hora y datos"
                          aria-label="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`${base}/${r.id}/editar`);
                          }}
                        >
                          <IconoLapiz />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="re-card-del"
                        title="Eliminar reunión"
                        aria-label="Eliminar"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            if (await confirmarEliminarReunion(r.id)) cargar();
                          } catch (err) {
                            Swal.fire('Reunión', err.response?.data?.error || 'No se pudo eliminar.', 'error');
                          }
                        }}
                      >
                        <IconoBasura />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function BuscadorInvitados({ invitados, onChange, grupos, onGrupos }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [grupoPendiente, setGrupoPendiente] = useState(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setRes([]);
        return;
      }
      try {
        const { data } = await api.get('/reuniones/buscar-participantes', { params: { q } });
        setRes(data.resultados || []);
      } catch {
        setRes([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const yaEsta = (usuarioId) => invitados.some((i) => Number(i.usuario_id) === Number(usuarioId));

  const agregarGrupo = () => {
    if (!grupoPendiente) return;
    if (!grupoPendiente.alumnos && !grupoPendiente.apoderados && !grupoPendiente.docentes) {
      return;
    }
    const resto = grupos.filter((g) => Number(g.grupo_id) !== Number(grupoPendiente.grupo_id));
    onGrupos([...resto, grupoPendiente]);
    setGrupoPendiente(null);
  };

  return (
    <div className="re-buscador">
      <label>Convocados</label>
      <p className="re-hint">Personas o un aula (alumnos, apoderados y/o docentes). Escribe al menos 2 letras.</p>
      <input
        className="re-buscador-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar nombre o aula…  Ej. 3° A"
      />
      {res.length > 0 ? (
        <div className="re-search-drop">
          {res.map((r) => (
            <button
              key={r.usuario_id ? `u-${r.usuario_id}` : `g-${r.grupo_id}`}
              type="button"
              className="re-search-item"
              onClick={() => {
                if (r.tipo === 'GRUPO') {
                  setGrupoPendiente({
                    grupo_id: r.grupo_id,
                    nombre_completo: r.nombre_completo,
                    alumnos: true,
                    apoderados: false,
                    docentes: false,
                  });
                } else if (!yaEsta(r.usuario_id)) {
                  onChange([...invitados, r]);
                }
                setQ('');
                setRes([]);
              }}
            >
              <span className="re-search-name">{r.nombre_completo}</span>
              <span className="re-search-meta">
                {etiquetaTipo(r.tipo)}
                {r.info_adicional ? ` · ${r.info_adicional}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {grupoPendiente ? (
        <div className="re-grupo-picker">
          <strong>Aula {grupoPendiente.nombre_completo}</strong>
          <p className="re-hint">Elige a quién convocar de ese grupo (puedes combinar):</p>
          <label>
            <input
              type="checkbox"
              checked={!!grupoPendiente.alumnos}
              onChange={(e) => setGrupoPendiente({ ...grupoPendiente, alumnos: e.target.checked })}
            />
            Alumnos
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!grupoPendiente.apoderados}
              onChange={(e) => setGrupoPendiente({ ...grupoPendiente, apoderados: e.target.checked })}
            />
            Apoderados
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!grupoPendiente.docentes}
              onChange={(e) => setGrupoPendiente({ ...grupoPendiente, docentes: e.target.checked })}
            />
            Docentes (tutor y profesores del aula)
          </label>
          <div className="re-actions-row">
            <button type="button" className="re-btn re-btn-solid" onClick={agregarGrupo}>
              Agregar aula
            </button>
            <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={() => setGrupoPendiente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      <div className="re-invitados">
        {invitados.map((i) => (
          <span key={`u-${i.usuario_id}`} className="re-tag re-tag-lg">
            {i.nombre_completo}
            <button
              type="button"
              aria-label="Quitar"
              onClick={() => onChange(invitados.filter((x) => Number(x.usuario_id) !== Number(i.usuario_id)))}
            >
              ×
            </button>
          </span>
        ))}
        {grupos.map((g) => (
          <span key={`g-${g.grupo_id}`} className="re-tag re-tag-lg">
            Aula: {g.nombre_completo} · {etiquetaAudienciaGrupo(g)}
            <button
              type="button"
              aria-label="Quitar aula"
              onClick={() => onGrupos(grupos.filter((x) => Number(x.grupo_id) !== Number(g.grupo_id)))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function BuscadorQuienAbre({ value, onChange }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setRes([]);
        return;
      }
      try {
        const { data } = await api.get('/reuniones/buscar-participantes', { params: { q, solo: 'personal' } });
        setRes(data.resultados || []);
      } catch {
        setRes([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="re-buscador">
      <label>Quién puede abrir la reunión</label>
      <p className="re-hint">
        El administrador convoca. Aquí eliges a un docente o personal para que el día de la reunión la abra y redacte el acta.
      </p>
      {value ? (
        <div className="re-invitados">
          <span className="re-tag re-tag-lg">
            {value.nombre_completo || value.nombre}
            <button type="button" aria-label="Quitar" onClick={() => onChange(null)}>×</button>
          </span>
        </div>
      ) : (
        <input className="re-buscador-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar personal o docente…" />
      )}
      {!value && res.length > 0 ? (
        <div className="re-search-drop">
          {res.map((r) => (
            <button
              key={r.usuario_id}
              type="button"
              className="re-search-item"
              onClick={() => {
                onChange(r);
                setQ('');
                setRes([]);
              }}
            >
              <span className="re-search-name">{r.nombre_completo}</span>
              <span className="re-search-meta">
                {etiquetaTipo(r.tipo)}
                {r.info_adicional ? ` · ${r.info_adicional}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormularioReunion({ base, reunion, esGestor }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() =>
    reunion
      ? {
          titulo: reunion.titulo || '',
          fecha: String(reunion.fecha || '').slice(0, 10),
          hora_inicio: String(reunion.hora_inicio || '08:00').slice(0, 5),
          hora_fin: reunion.hora_fin ? String(reunion.hora_fin).slice(0, 5) : '',
          modalidad: reunion.modalidad || 'PRESENCIAL',
          lugar: reunion.lugar || '',
          enlace_videollamada: reunion.enlace_videollamada || '',
          descripcion: reunion.descripcion || '',
        }
      : formularioVacio()
  );
  const [invitados, setInvitados] = useState(
    (reunion?.participantes || []).filter((p) => p.rol !== 'CONVOCANTE').map((p) => ({
      usuario_id: p.usuario_id,
      nombre_completo: p.nombre,
      tipo: p.tipo,
    }))
  );
  const [grupos, setGrupos] = useState([]);
  const [quienAbre, setQuienAbre] = useState(() => {
    if (reunion?.abrir_usuario_id) {
      return {
        usuario_id: reunion.abrir_usuario_id,
        nombre_completo: reunion.abrir_nombre || 'Personal asignado',
      };
    }
    return null;
  });
  const [saving, setSaving] = useState(false);
  const virtual = form.modalidad === 'VIRTUAL' || form.modalidad === 'HIBRIDA';
  const presencial = form.modalidad === 'PRESENCIAL' || form.modalidad === 'HIBRIDA';

  const setCampo = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const payload = (convocar) => ({
    ...form,
    convocar,
    invitados: invitados.map((i) => ({ usuario_id: i.usuario_id })),
    grupos: grupos.map((g) => ({
      grupo_id: g.grupo_id,
      alumnos: !!g.alumnos,
      apoderados: !!g.apoderados,
      docentes: !!g.docentes,
    })),
    abrir_usuario_id: quienAbre ? quienAbre.usuario_id : null,
  });

  const guardar = async (convocar) => {
    if (!form.titulo.trim() || !form.fecha || !form.hora_inicio) {
      Swal.fire('Reunión', 'Completa título, fecha y hora de inicio.', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (reunion?.id) {
        await api.patch(`/reuniones/${reunion.id}`, payload(false));
        if (convocar && reunion.estado === 'BORRADOR') {
          await api.post(`/reuniones/${reunion.id}/convocar`);
        }
        navigate(`${base}/${reunion.id}`);
      } else {
        const { data } = await api.post('/reuniones', payload(convocar));
        navigate(`${base}/${data.reunion.id}`);
      }
    } catch (e) {
      Swal.fire('Reunión', e.response?.data?.error || 'No se pudo guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="reuniones-page">
        <div className="re-hero">
          <div>
            <h1>{reunion ? 'Editar reunión' : 'Nueva reunión'}</h1>
            <p>Por defecto es presencial. Si hay participantes a distancia, elige virtual o híbrida y pega el enlace de la sala.</p>
          </div>
          <button type="button" className="re-btn re-btn-ghost" onClick={() => navigate(base)}>
            Volver
          </button>
        </div>
        <div className="re-form">
          <div className="re-field">
            <label>Título</label>
            <input value={form.titulo} onChange={(e) => setCampo('titulo', e.target.value)} maxLength={255} />
          </div>
          <div className="re-row-3">
            <div className="re-field compact">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setCampo('fecha', e.target.value)} />
            </div>
            <div className="re-field compact">
              <label>Hora inicio</label>
              <input type="time" value={form.hora_inicio} onChange={(e) => setCampo('hora_inicio', e.target.value)} />
            </div>
            <div className="re-field compact">
              <label>Hora fin (referencial)</label>
              <input type="time" value={form.hora_fin} onChange={(e) => setCampo('hora_fin', e.target.value)} />
              <p className="re-hint">No cierra la reunión. Si se pasan de esa hora, sigue hasta que el anfitrión la cierre.</p>
            </div>
          </div>
          <div className={`re-row-mod ${form.modalidad === 'HIBRIDA' ? 'tres' : 'dos'}`}>
            <div className="re-field compact">
              <label>Modalidad</label>
              <select value={form.modalidad} onChange={(e) => setCampo('modalidad', e.target.value)}>
                <option value="PRESENCIAL">Presencial</option>
                <option value="VIRTUAL">Virtual</option>
                <option value="HIBRIDA">Híbrida</option>
              </select>
            </div>
            {presencial ? (
              <div className="re-field compact">
                <label>Lugar</label>
                <input
                  value={form.lugar}
                  onChange={(e) => setCampo('lugar', e.target.value)}
                  placeholder="Sala, dirección…"
                />
              </div>
            ) : null}
            {virtual ? (
              <div className="re-field compact">
                <label>Enlace (opcional)</label>
                <input
                  value={form.enlace_videollamada}
                  onChange={(e) => setCampo('enlace_videollamada', e.target.value)}
                  placeholder="Meet / Zoom de respaldo"
                />
              </div>
            ) : null}
          </div>
          <div className="re-field">
            <label>Agenda / descripción</label>
            <AdminMensajeQuillEditor
              value={form.descripcion}
              onChange={(v) => setCampo('descripcion', v)}
              placeholder="Agenda, puntos a tratar…"
            />
          </div>
          {esGestor ? (
            <>
              <BuscadorQuienAbre value={quienAbre} onChange={setQuienAbre} />
              <BuscadorInvitados invitados={invitados} onChange={setInvitados} grupos={grupos} onGrupos={setGrupos} />
            </>
          ) : null}
          <div className="re-actions-row">
            <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={() => guardar(false)} disabled={saving}>
              Guardar borrador
            </button>
            <button type="button" className="re-btn re-btn-solid" onClick={() => guardar(true)} disabled={saving}>
              {reunion && reunion.estado !== 'BORRADOR' ? 'Guardar cambios' : 'Convocar'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DetalleReunion({ reunionId, base }) {
  const navigate = useNavigate();
  const [pack, setPack] = useState(null);
  const [acta, setActa] = useState('');
  const [acuerdos, setAcuerdos] = useState('');
  const [loading, setLoading] = useState(true);
  const [pizarraAbierta, setPizarraAbierta] = useState(false);
  const [firmaAbierta, setFirmaAbierta] = useState(false);
  const [firmaParaSalir, setFirmaParaSalir] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [tab, setTab] = useState('chat');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/reuniones/${reunionId}`);
      setPack(data);
      setActa(data.reunion?.acta || '');
      setAcuerdos(data.reunion?.acuerdos || '');
      if (data.reunion?.estado === 'EN_CURSO') {
        try {
          const ent = await api.post(`/reuniones/${reunionId}/entrar`);
          setPack(ent.data);
        } catch {
          /* ya está cargado */
        }
      }
    } catch (e) {
      Swal.fire('Reunión', e.response?.data?.error || 'No se pudo abrir la reunión.', 'error');
      navigate(base);
    } finally {
      setLoading(false);
    }
  }, [reunionId, base, navigate]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const run = async (fn, okMsg) => {
    try {
      const data = await fn();
      if (data) setPack(data);
      if (okMsg) Swal.fire({ toast: true, position: 'top-end', timer: 1800, showConfirmButton: false, icon: 'success', title: okMsg });
    } catch (e) {
      Swal.fire('Reunión', e.response?.data?.error || 'No se pudo completar la acción.', 'error');
    }
  };

  const r = pack?.reunion;
  const p = pack?.permisos || {};
  const parts = pack?.participantes || [];
  const enCurso = r?.estado === 'EN_CURSO';
  const cerrada = r?.estado === 'CERRADA';

  const intentarSalir = () => {
    if (enCurso && !p.ya_firmo) {
      setFirmaParaSalir(true);
      setFirmaAbierta(true);
      return;
    }
    navigate(base);
  };

  const firmar = async (firma_data) => {
    setFirmando(true);
    try {
      const { data } = await api.post(`/reuniones/${reunionId}/firmar`, { firma_data });
      setPack(data);
      setFirmaAbierta(false);
      const salir = firmaParaSalir;
      setFirmaParaSalir(false);
      Swal.fire({ toast: true, position: 'top-end', timer: 1800, showConfirmButton: false, icon: 'success', title: 'Firma guardada' });
      if (salir) navigate(base);
    } catch (e) {
      Swal.fire('Firma', e.response?.data?.error || 'No se pudo guardar la firma.', 'error');
    } finally {
      setFirmando(false);
    }
  };

  const subirArchivo = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    try {
      const { data } = await api.post(`/reuniones/${r.id}/archivos`, fd);
      setPack(data);
    } catch (err) {
      Swal.fire('Archivo', err.response?.data?.error || 'No se pudo subir.', 'error');
    }
  };

  if (loading || !r) {
    return (
      <DashboardLayout>
        <p className="re-empty">Cargando reunión…</p>
      </DashboardLayout>
    );
  }

  const acciones = (
    <div className="re-actions-row">
      {p.puede_editar ? (
        <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={() => navigate(`${base}/${r.id}/editar`)}>
          Editar
        </button>
      ) : null}
      {p.puede_convocar ? (
        <button type="button" className="re-btn re-btn-solid" onClick={() => run(async () => (await api.post(`/reuniones/${r.id}/convocar`)).data, 'Convocada')}>
          Convocar
        </button>
      ) : null}
      {p.puede_abrir ? (
        <button type="button" className="re-btn re-btn-asistio" onClick={() => run(async () => (await api.post(`/reuniones/${r.id}/abrir`)).data, 'Reunión abierta')}>
          Abrir reunión
        </button>
      ) : null}
      {p.falta_firma_para_cerrar ? (
        <button type="button" className="re-btn re-btn-solid" onClick={() => setFirmaAbierta(true)}>
          Firmar para cerrar
        </button>
      ) : null}
      {p.puede_cerrar ? (
        <button type="button" className="re-btn re-btn-solid" onClick={() => run(async () => (await api.post(`/reuniones/${r.id}/cerrar`)).data, 'Cerrada')}>
          Cerrar reunión
        </button>
      ) : null}
      {p.puede_firmar ? (
        <button type="button" className="re-btn re-btn-asistio" onClick={() => setFirmaAbierta(true)}>
          Firmar sesión
        </button>
      ) : null}
      {p.ya_firmo && enCurso ? <span className="re-hint">Ya firmaste la sesión.</span> : null}
      {p.puede_pizarra && !enCurso ? (
        <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={() => setPizarraAbierta(true)}>
          Pizarra
        </button>
      ) : null}
      {p.puede_cancelar ? (
        <button
          type="button"
          className="re-btn re-btn-danger"
          onClick={async () => {
            const ok = await Swal.fire({
              title: '¿Cancelar esta reunión?',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'Sí, cancelar',
              cancelButtonText: 'No',
            });
            if (ok.isConfirmed) run(async () => (await api.post(`/reuniones/${r.id}/cancelar`)).data);
          }}
        >
          Cancelar
        </button>
      ) : null}
      {p.puede_eliminar ? (
        <button
          type="button"
          className="re-btn re-btn-danger"
          onClick={async () => {
            try {
              if (await confirmarEliminarReunion(r.id)) navigate(base);
            } catch (err) {
              Swal.fire('Reunión', err.response?.data?.error || 'No se pudo eliminar.', 'error');
            }
          }}
        >
          Eliminar
        </button>
      ) : null}
    </div>
  );

  const bloqueArchivos = (
    <ReunionArchivosLista archivos={pack.archivos} onSubir={subirArchivo} puedeSubir={!!p.puede_archivos} />
  );

  const bloqueActa = enCurso || p.puede_escribir_acta || r.acta || r.acuerdos || p.puede_acta ? (
    <ReunionActaViva
      reunionId={r.id}
      puedeEscribir={!!p.puede_escribir_acta}
      puedePermiso={!!p.puede_permiso_acta}
      actaInicial={acta}
      acuerdosInicial={acuerdos}
      editableInicial={!!p.acta_editable}
    />
  ) : null;

  const tablaAsistencia = (
    <div className="re-detalle" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>{cerrada ? 'Quién participó' : 'Asistencia'}</h3>
      {!cerrada ? <p className="re-hint">Se marca sola al entrar a la reunión el mismo día. Quien no entre queda ausente al cerrar.</p> : null}
      <table className="re-part-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Asistencia</th>
            <th>Firma</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((row) => (
            <tr key={row.usuario_id}>
              <td>
                {row.nombre}
                <div className="re-hint">{etiquetaTipo(row.tipo)}</div>
              </td>
              <td>
                {row.rol === 'CONVOCANTE' ? 'Convocante' : 'Invitado'}
                {pack.abrir && Number(pack.abrir.usuario_id) === Number(row.usuario_id) ? (
                  <div className="re-hint">Puede abrirla</div>
                ) : null}
              </td>
              <td>{row.asistencia === 'ASISTIO' ? 'Asistió' : row.asistencia === 'AUSENTE' ? 'Ausente' : row.asistencia === 'JUSTIFICADO' ? 'Justificado' : 'Pendiente'}</td>
              <td>
                {row.tiene_firma || row.firmado_en || row.firma_data ? (
                  <div className="re-firma-evidencia">
                    <span>Firmó</span>
                    {row.firma_data ? <img src={row.firma_data} alt={`Firma de ${row.nombre}`} className="re-firma-mini" /> : null}
                    {row.firmado_en ? <div className="re-hint">{String(row.firmado_en).slice(11, 16)}</div> : null}
                  </div>
                ) : (
                  'Pendiente'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DashboardLayout>
      <div className={`reuniones-page ${enCurso ? 'reuniones-page-live' : ''} ${cerrada ? 'reuniones-page-resumen' : ''}`}>
        {enCurso ? null : (
          <div className="re-hero">
            <div>
              <h1>{cerrada ? `Resumen · ${r.titulo}` : r.titulo}</h1>
              <p>
                {fmtFecha(r.fecha)} · {String(r.hora_inicio || '').slice(0, 5)}
                {r.hora_fin ? ` – ${String(r.hora_fin).slice(0, 5)}` : ''} · {MODALIDAD[r.modalidad] || r.modalidad}
                {r.lugar ? ` · ${r.lugar}` : ''}
              </p>
              {cerrada ? <p>Registro de lo trabajado: acuerdos, asistencia, firmas, chat y archivos.</p> : null}
            </div>
            <div className="re-hero-actions">
              <span className={`re-badge re-badge-${r.estado}`}>{ESTADOS[r.estado] || r.estado}</span>
              <button type="button" className="re-btn re-btn-ghost" onClick={intentarSalir}>
                Volver
              </button>
            </div>
          </div>
        )}

        {r.estado === 'CONVOCADA' && !p.es_hoy ? (
          <p className="re-hint" style={{ marginBottom: '1rem' }}>
            La reunión se abre el día programado. Ese día el organizador la inicia y al entrar se registra tu asistencia.
          </p>
        ) : null}

        {r.estado === 'CONVOCADA' && p.es_hoy && !p.puede_abrir ? (
          <p className="re-hint" style={{ marginBottom: '1rem' }}>
            Hoy es el día. Cuando el organizador abra la reunión podrás entrar; tu asistencia se marca sola.
          </p>
        ) : null}

        {enCurso ? (
          <div className="re-sala">
            <div className="re-sala-bar">
              <div className="re-sala-brand-wrap">
                <VanguardRoomMarca invert />
                <div className="re-sala-meet-meta">
                  <strong>{r.titulo}</strong>
                  <ReunionCronometro iniciadaEn={r.iniciada_en} />
                </div>
              </div>
              <div className="re-sala-bar-actions">
                <span className={`re-badge re-badge-${r.estado}`}>En curso</span>
                {p.puede_editar ? (
                  <button type="button" className="re-btn re-btn-ghost" onClick={() => navigate(`${base}/${r.id}/editar`)}>
                    Editar
                  </button>
                ) : null}
                <button type="button" className="re-btn re-btn-ghost" onClick={intentarSalir}>Salir</button>
                {!p.ya_firmo ? (
                  <button type="button" className="re-btn re-btn-asistio" onClick={() => { setFirmaParaSalir(false); setFirmaAbierta(true); }}>
                    Firmar
                  </button>
                ) : (
                  <span className="re-pill-ok">Firmaste</span>
                )}
                {p.falta_firma_para_cerrar ? (
                  <button type="button" className="re-btn re-btn-solid" onClick={() => setFirmaAbierta(true)}>Firmar para cerrar</button>
                ) : null}
                {p.puede_cerrar ? (
                  <button type="button" className="re-btn re-btn-solid" onClick={() => run(async () => (await api.post(`/reuniones/${r.id}/cerrar`)).data, 'Cerrada')}>
                    Cerrar
                  </button>
                ) : null}
              </div>
            </div>
            <div className="re-live">
              <div className="re-live-video">
                <ReunionVideoDaily reunionId={r.id} dailyListo={p.daily_configurado} />
              </div>
              <div className="re-live-side">
                <div className="re-tabs">
                  {[
                    ['chat', 'Chat'],
                    ['acta', 'Acta'],
                    ['archivos', 'Archivos'],
                    ['personas', 'Lista'],
                    ['pizarra', 'Pizarra'],
                  ].map(([id, label]) => (
                    <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="re-tab-body">
                  {tab === 'chat' ? (
                    <ReunionChat reunionId={r.id} yoId={pack.mi_participacion?.usuario_id} />
                  ) : null}
                  {tab === 'acta' ? bloqueActa : null}
                  {tab === 'archivos' ? bloqueArchivos : null}
                  {tab === 'personas' ? tablaAsistencia : null}
                  {tab === 'pizarra' ? (
                    <ReunionPizarra
                      reunionId={r.id}
                      inicial={pack.pizarra?.json}
                      onCerrar={() => setTab('chat')}
                      onGuardada={(data) => setPack(data)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="re-detalle" style={{ marginBottom: '1rem' }}>
              {r.descripcion ? <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlReunion(r.descripcion) }} /> : null}
              {pack.abrir ? (
                <p className="re-hint">
                  Puede abrirla: <strong>{pack.abrir.nombre}</strong>
                </p>
              ) : null}
              {r.enlace_videollamada && !enCurso ? (
                <div>
                  <strong>Videollamada (externa):</strong>
                  <a className="re-link-ext" href={r.enlace_videollamada} target="_blank" rel="noopener noreferrer">
                    {r.enlace_videollamada}
                  </a>
                </div>
              ) : null}
              {acciones}
            </div>
            {tablaAsistencia}
            {bloqueActa}
            {bloqueArchivos}
            {cerrada && pack.pizarra?.imagen_url ? (
              <div className="re-detalle">
                <h3 style={{ marginTop: 0 }}>Pizarra guardada</h3>
                <img src={pack.pizarra.imagen_url} alt="Pizarra" className="re-pizarra-foto" />
              </div>
            ) : null}
            {cerrada && p.puede_pizarra && pack.pizarra?.json ? (
              <div className="re-actions-row" style={{ marginBottom: '1rem' }}>
                <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={() => setPizarraAbierta(true)}>
                  Ver pizarra
                </button>
              </div>
            ) : null}
            {cerrada && pizarraAbierta ? (
              <ReunionPizarra reunionId={r.id} inicial={pack.pizarra?.json} soloLectura onCerrar={() => setPizarraAbierta(false)} />
            ) : null}
            {cerrada ? (
              <div className="re-detalle" style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginTop: 0 }}>Chat de la reunión</h3>
                <ReunionChat reunionId={r.id} yoId={pack.mi_participacion?.usuario_id} soloLectura />
              </div>
            ) : null}
          </>
        )}

        <ReunionFirmaModal
          abierto={firmaAbierta}
          onCerrar={() => { setFirmaAbierta(false); setFirmaParaSalir(false); }}
          onFirmar={firmar}
          guardando={firmando}
          obligatoria={firmaParaSalir || !!(enCurso && !p.ya_firmo && p.falta_firma_para_cerrar && firmaAbierta)}
        />
      </div>
    </DashboardLayout>
  );
}

function ReunionesRouter() {
  const { id, accion } = useParams();
  const { user } = useAuth();
  const esGestor = esGestorReunionesFront(user?.tipo);
  const base = rutaBaseReuniones(user?.tipo);

  if (accion === 'editar' && id) {
    return <FormularioEditar reunionId={id} base={base} esGestor={esGestor} />;
  }
  return <ReunionesPage />;
}

function FormularioEditar({ reunionId, base, esGestor }) {
  const [pack, setPack] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/reuniones/${reunionId}`);
        setPack(data);
      } catch {
        navigate(base);
      }
    })();
  }, [reunionId, base, navigate]);

  if (!pack) {
    return (
      <DashboardLayout>
        <p className="re-empty">Cargando…</p>
      </DashboardLayout>
    );
  }
  return (
    <FormularioReunion
      base={base}
      reunion={{
        ...pack.reunion,
        participantes: pack.participantes,
        abrir_usuario_id: pack.abrir?.usuario_id || pack.reunion.abrir_usuario_id,
        abrir_nombre: pack.abrir?.nombre,
      }}
      esGestor={esGestor}
    />
  );
}

export default ReunionesRouter;
export { ReunionesPage };
