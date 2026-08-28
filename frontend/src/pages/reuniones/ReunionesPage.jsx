import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { esGestorReunionesFront, rutaBaseReuniones } from '../../utils/reunionesRutas';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
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

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
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
  const [filtro, setFiltro] = useState('proximas');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reuniones', { params: { filtro } });
      setItems(data.reuniones || []);
    } catch (e) {
      setItems([]);
      Swal.fire('Reuniones', e.response?.data?.error || 'No se pudieron cargar las reuniones.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <DashboardLayout>
      <div className="reuniones-page">
        <div className="re-hero">
          <div>
            <h1>Reuniones</h1>
            <p>
              Convocatoria y acta digital. La asistencia se marca el mismo día, cuando se abre la reunión.
              Si es virtual, se usa un enlace de Meet, Zoom u otra sala externa (no se crea videollamada aquí).
            </p>
          </div>
          <div className="re-hero-actions">
            {esGestor ? (
              <button type="button" className="re-btn re-btn-primary" onClick={() => navigate(`${base}/nueva`)}>
                Nueva reunión
              </button>
            ) : null}
          </div>
        </div>
        <div className="re-filters">
          {[
            ['proximas', 'Próximas'],
            ['hoy', 'Hoy'],
            ['todas', 'Todas'],
            ['pasadas', 'Pasadas'],
          ].map(([k, lab]) => (
            <button
              key={k}
              type="button"
              className={`re-chip ${filtro === k ? 'active' : ''}`}
              onClick={() => setFiltro(k)}
            >
              {lab}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="re-empty">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="re-empty">No hay reuniones en este filtro.</p>
        ) : (
          <div className="re-card-list">
            {items.map((r) => (
              <button key={r.id} type="button" className="re-card" onClick={() => navigate(`${base}/${r.id}`)}>
                <div className="re-card-top">
                  <div>
                    <h3>{r.titulo}</h3>
                    <div className="re-meta">
                      {fmtFecha(r.fecha)} · {r.hora_inicio || '—'}
                      {r.hora_fin ? ` – ${r.hora_fin}` : ''} · {MODALIDAD[r.modalidad] || r.modalidad}
                      {r.lugar ? ` · ${r.lugar}` : ''}
                    </div>
                    <div className="re-meta">
                      {r.total_invitados || 0} convocados
                      {r.estado === 'EN_CURSO' || r.estado === 'CERRADA'
                        ? ` · ${r.total_asistieron || 0} asistieron`
                        : ''}
                    </div>
                  </div>
                  <span className={`re-badge re-badge-${r.estado}`}>{ESTADOS[r.estado] || r.estado}</span>
                </div>
              </button>
            ))}
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
    <div className="re-field full">
      <label>Convocados (personas o un aula con alumnos, apoderados y/o docentes)</label>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o aula (mín. 2 letras). Ej. 3° A"
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
              {r.nombre_completo}
              <small>
                {etiquetaTipo(r.tipo)}
                {r.info_adicional ? ` · ${r.info_adicional}` : ''}
              </small>
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
          <span key={`u-${i.usuario_id}`} className="re-tag">
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
          <span key={`g-${g.grupo_id}`} className="re-tag">
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
    <div className="re-field full">
      <label>Quién puede abrir la reunión</label>
      <span className="re-hint">
        El administrador crea la convocatoria. Aquí asignas a un docente o personal para que el día de la reunión la abra, tome asistencia y redacte el acta.
      </span>
      {value ? (
        <div className="re-invitados">
          <span className="re-tag">
            {value.nombre_completo || value.nombre}
            <button type="button" aria-label="Quitar" onClick={() => onChange(null)}>×</button>
          </span>
        </div>
      ) : (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar personal o docente…" />
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
              {r.nombre_completo}
              <small>
                {etiquetaTipo(r.tipo)}
                {r.info_adicional ? ` · ${r.info_adicional}` : ''}
              </small>
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
    if (virtual && convocar && !String(form.enlace_videollamada || '').trim()) {
      Swal.fire('Reunión', 'Para modalidad virtual o híbrida indica el enlace de Meet, Zoom u otra sala.', 'warning');
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
          <div className="re-grid">
            <div className="re-field full">
              <label>Título</label>
              <input value={form.titulo} onChange={(e) => setCampo('titulo', e.target.value)} maxLength={255} />
            </div>
            <div className="re-field">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setCampo('fecha', e.target.value)} />
            </div>
            <div className="re-field">
              <label>Hora inicio</label>
              <input type="time" value={form.hora_inicio} onChange={(e) => setCampo('hora_inicio', e.target.value)} />
            </div>
            <div className="re-field">
              <label>Hora fin (opcional)</label>
              <input type="time" value={form.hora_fin} onChange={(e) => setCampo('hora_fin', e.target.value)} />
            </div>
            <div className="re-field">
              <label>Modalidad</label>
              <select value={form.modalidad} onChange={(e) => setCampo('modalidad', e.target.value)}>
                <option value="PRESENCIAL">Presencial</option>
                <option value="VIRTUAL">Virtual (enlace Meet / Zoom / etc.)</option>
                <option value="HIBRIDA">Híbrida</option>
              </select>
            </div>
            {presencial ? (
              <div className="re-field">
                <label>Lugar</label>
                <input
                  value={form.lugar}
                  onChange={(e) => setCampo('lugar', e.target.value)}
                  placeholder="Sala de profesores, dirección…"
                />
              </div>
            ) : null}
            {virtual ? (
              <div className="re-field full">
                <label>Enlace de videollamada (externo)</label>
                <input
                  value={form.enlace_videollamada}
                  onChange={(e) => setCampo('enlace_videollamada', e.target.value)}
                  placeholder="https://meet.google.com/… o https://zoom.us/j/…"
                />
                <span className="re-hint">No se crea una sala en el sistema: pega el link de Meet, Zoom, Teams u otra herramienta.</span>
              </div>
            ) : null}
            <div className="re-field full">
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
          </div>
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

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/reuniones/${reunionId}`);
      setPack(data);
      setActa(data.reunion?.acta || '');
      setAcuerdos(data.reunion?.acuerdos || '');
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

  const marcar = (usuarioId, asistencia) =>
    run(async () => {
      const { data } = await api.post(`/reuniones/${reunionId}/asistencia`, { usuario_id: usuarioId, asistencia });
      return data;
    });

  if (loading || !r) {
    return (
      <DashboardLayout>
        <p className="re-empty">Cargando reunión…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="reuniones-page">
        <div className="re-hero">
          <div>
            <h1>{r.titulo}</h1>
            <p>
              {fmtFecha(r.fecha)} · {String(r.hora_inicio || '').slice(0, 5)}
              {r.hora_fin ? ` – ${String(r.hora_fin).slice(0, 5)}` : ''} · {MODALIDAD[r.modalidad] || r.modalidad}
              {r.lugar ? ` · ${r.lugar}` : ''}
            </p>
          </div>
          <div className="re-hero-actions">
            <span className={`re-badge re-badge-${r.estado}`}>{ESTADOS[r.estado] || r.estado}</span>
            <button type="button" className="re-btn re-btn-ghost" onClick={() => navigate(base)}>
              Volver
            </button>
          </div>
        </div>

        {p.puede_asistir ? (
          <div className="re-asist-banner">
            <div>
              <strong>La reunión está abierta hoy.</strong>
              <div className="re-hint">Confirma tu presencia. La asistencia solo se registra el mismo día.</div>
            </div>
            <button type="button" className="re-btn re-btn-asistio" onClick={() => marcar(pack.mi_participacion?.usuario_id, 'ASISTIO')}>
              ASISTÍ
            </button>
          </div>
        ) : null}

        {r.estado === 'CONVOCADA' && !p.es_hoy ? (
          <p className="re-hint" style={{ marginBottom: '1rem' }}>
            La reunión se abre el día programado. Ese día el organizador la inicia y recién ahí se puede marcar ASISTÍ.
          </p>
        ) : null}

        {r.estado === 'CONVOCADA' && p.es_hoy && !p.puede_abrir ? (
          <p className="re-hint" style={{ marginBottom: '1rem' }}>
            Hoy es el día. Cuando el organizador abra la reunión podrás confirmar ASISTÍ.
          </p>
        ) : null}

        <div className="re-detalle" style={{ marginBottom: '1rem' }}>
          {r.descripcion ? (
            <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlReunion(r.descripcion) }} />
          ) : null}
          {pack.abrir ? (
            <p className="re-hint">
              Puede abrirla: <strong>{pack.abrir.nombre}</strong>
            </p>
          ) : null}
          {r.enlace_videollamada ? (
            <div>
              <strong>Videollamada (externa):</strong>
              <a className="re-link-ext" href={r.enlace_videollamada} target="_blank" rel="noopener noreferrer">
                {r.enlace_videollamada}
              </a>
            </div>
          ) : null}

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
              <button
                type="button"
                className="re-btn re-btn-asistio"
                onClick={() =>
                  run(async () => (await api.post(`/reuniones/${r.id}/abrir`)).data, 'Reunión abierta')
                }
              >
                Abrir reunión
              </button>
            ) : null}
            {p.puede_cerrar ? (
              <button type="button" className="re-btn re-btn-solid" onClick={() => run(async () => (await api.post(`/reuniones/${r.id}/cerrar`)).data, 'Cerrada')}>
                Cerrar reunión
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
          </div>
        </div>

        <div className="re-detalle" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Asistencia</h3>
          <table className="re-part-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                {p.puede_marcar_asistencia ? <th></th> : null}
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
                  {p.puede_marcar_asistencia ? (
                    <td>
                      <button type="button" className="re-chip" onClick={() => marcar(row.usuario_id, 'ASISTIO')}>
                        Presente
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.puede_acta || r.acta || r.acuerdos ? (
          <div className="re-detalle" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Acta</h3>
            {p.puede_acta ? (
              <>
                <div className="re-field full">
                  <label>Desarrollo / minuta</label>
                  <AdminMensajeQuillEditor value={acta} onChange={setActa} placeholder="Redacta el acta…" />
                </div>
                <div className="re-field full" style={{ marginTop: '0.75rem' }}>
                  <label>Acuerdos</label>
                  <AdminMensajeQuillEditor value={acuerdos} onChange={setAcuerdos} placeholder="Acuerdos y compromisos…" />
                </div>
                <div className="re-actions-row">
                  <button
                    type="button"
                    className="re-btn re-btn-solid"
                    onClick={() => run(async () => (await api.patch(`/reuniones/${r.id}/acta`, { acta, acuerdos })).data, 'Acta guardada')}
                  >
                    Guardar acta
                  </button>
                </div>
              </>
            ) : (
              <>
                {r.acta ? <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlReunion(r.acta) }} /> : null}
                {r.acuerdos ? (
                  <>
                    <strong>Acuerdos</strong>
                    <div className="re-html" dangerouslySetInnerHTML={{ __html: htmlReunion(r.acuerdos) }} />
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {(pack.archivos || []).length > 0 || p.puede_archivos ? (
          <div className="re-detalle">
            <h3 style={{ marginTop: 0 }}>Archivos</h3>
            {(pack.archivos || []).map((a) => (
              <div key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.nombre_original}
                </a>
              </div>
            ))}
            {p.puede_archivos && ['BORRADOR', 'CONVOCADA', 'EN_CURSO', 'CERRADA'].includes(r.estado) ? (
              <input
                type="file"
                style={{ marginTop: '0.75rem' }}
                onChange={async (e) => {
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
                }}
              />
            ) : null}
          </div>
        ) : null}
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
