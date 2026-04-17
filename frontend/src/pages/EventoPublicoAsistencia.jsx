import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { fotoUsuarioAdmin } from '../utils/adminUsuariosFoto';
import { formatFechaLargaEsPe } from '../utils/fechaSoloDia';
import './EventoPublicoAsistencia.css';

const PASTEL_BACKGROUNDS = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
  'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
  'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
  'linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)'
];

function getInitials(nombre) {
  if (!nombre) return '?';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function buildFotoUrl(fotoRaw) {
  if (fotoRaw == null || String(fotoRaw).trim() === '') return null;
  const foto = String(fotoRaw).trim();
  if (foto.startsWith('http')) return foto;
  if (foto.startsWith('/Static/')) {
    return `https://nuevo.vanguardschools.edu.pe${foto}`;
  }
  if (foto.startsWith('/uploads/')) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}${foto}`;
  }
  return fotoUsuarioAdmin(foto);
}

function nombreCompletoPersona(p) {
  if (!p) return '';
  return [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ').trim();
}

function labelGrupo(g) {
  if (!g) return '';
  const sec = g.seccion ? ` ${g.seccion}` : '';
  return [g.nivel_nombre, g.curso_nombre, g.grado ? `${g.grado}°` : '', sec].filter(Boolean).join(' · ');
}

/** Orden alfabético por apellidos y nombres (es-PE), útil si la API devuelve otro orden. */
function sortAlumnosByApellido(list) {
  return [...list].sort((a, b) => {
    const cmp = (fa, fb) =>
      String(fa ?? '').localeCompare(String(fb ?? ''), 'es', { sensitivity: 'base' });
    let x = cmp(a.apellido_paterno, b.apellido_paterno);
    if (x !== 0) return x;
    x = cmp(a.apellido_materno, b.apellido_materno);
    if (x !== 0) return x;
    return cmp(a.nombres, b.nombres);
  });
}

/**
 * Registro público de asistencia a evento institucional (QR / token). Sin login.
 */
export default function EventoPublicoAsistencia() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evento, setEvento] = useState(null);
  const [grupos, setGrupos] = useState([]);

  const [step, setStep] = useState('grupos');
  const [grupoSel, setGrupoSel] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [alumnoSel, setAlumnoSel] = useState(null);

  const [apoderados, setApoderados] = useState([]);
  const [loadingApoderados, setLoadingApoderados] = useState(false);
  const [apoderadoSel, setApoderadoSel] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(null);

  const [visitante, setVisitante] = useState({
    nombre_completo: '',
    telefono: '',
    correo: '',
    parentesco: ''
  });
  const [visitanteSending, setVisitanteSending] = useState(false);
  const [visitanteOk, setVisitanteOk] = useState(false);

  const loadEvento = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/public/eventos/${encodeURIComponent(token)}`);
      setEvento(data.evento);
      setGrupos(data.grupos || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'No se pudo cargar el evento');
      setEvento(null);
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadEvento();
  }, [loadEvento]);

  const onElegirGrupo = async (g) => {
    setError(null);
    setGrupoSel(g);
    setAlumnoSel(null);
    setApoderadoSel(null);
    setAlumnos([]);
    setApoderados([]);
    setStep('alumnos');
    setLoadingAlumnos(true);
    try {
      const { data } = await api.get(
        `/public/eventos/${encodeURIComponent(token)}/grupos/${g.id}/alumnos`
      );
      setAlumnos(data.alumnos || []);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar los alumnos');
    } finally {
      setLoadingAlumnos(false);
    }
  };

  const onElegirAlumno = async (a) => {
    setError(null);
    setAlumnoSel(a);
    setApoderadoSel(null);
    setApoderados([]);
    setStep('apoderados');
    setLoadingApoderados(true);
    try {
      const { data } = await api.get(
        `/public/eventos/${encodeURIComponent(token)}/alumnos/${a.id}/apoderados`
      );
      setApoderados(data.apoderados || []);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar los apoderados');
    } finally {
      setLoadingApoderados(false);
    }
  };

  const onYoAsisti = async () => {
    if (!alumnoSel || !token) return;
    if (!apoderadoSel) {
      setError('Debe presionar el nombre del Apoderado');
      return;
    }
    if (apoderadoSel.ya_asistio) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(`/public/eventos/${encodeURIComponent(token)}/asistencia`, {
        alumno_id: alumnoSel.id,
        apoderado_id: apoderadoSel.id
      });
      const nombre = nombreCompletoPersona(data.apoderado);
      const fotoUrl = buildFotoUrl(data.apoderado?.foto);
      setWelcome({
        nombre,
        fotoUrl,
        initials: getInitials(nombre)
      });
      setApoderados((prev) =>
        prev.map((p) => (p.id === apoderadoSel.id ? { ...p, ya_asistio: true } : p))
      );
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'No se pudo registrar';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const enviarVisitante = async (e) => {
    e.preventDefault();
    const nombre = String(visitante.nombre_completo || '').trim();
    const tel = String(visitante.telefono || '').trim();
    const mail = String(visitante.correo || '').trim();
    const par = String(visitante.parentesco || '').trim();
    if (!nombre || !tel || !mail || !par) {
      setError('Completa todos los campos del visitante (nombre, teléfono, correo y parentesco).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    setVisitanteSending(true);
    setError(null);
    try {
      await api.post(`/public/eventos/${encodeURIComponent(token)}/visitante`, {
        alumno_id: alumnoSel?.id ?? null,
        nombre_completo: nombre,
        telefono: tel,
        correo: mail,
        parentesco: par
      });
      setVisitanteOk(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la visita');
    } finally {
      setVisitanteSending(false);
    }
  };

  const volver = () => {
    setError(null);
    if (step === 'apoderados') {
      setStep('alumnos');
      setApoderadoSel(null);
      setApoderados([]);
    } else if (step === 'alumnos') {
      setStep('grupos');
      setGrupoSel(null);
      setAlumnoSel(null);
      setAlumnos([]);
    }
  };

  const fechaTexto = useMemo(() => {
    if (!evento?.fecha_evento) return null;
    const t = formatFechaLargaEsPe(evento.fecha_evento);
    return t || evento.fecha_evento;
  }, [evento]);

  const alumnosOrdenados = useMemo(() => sortAlumnosByApellido(alumnos), [alumnos]);

  if (loading) {
    return (
      <div className="evento-publico-root">
        <div className="evento-publico-brand" aria-hidden>
          Sistema Vanguard Schools
        </div>
        <div className="evento-loading evento-loading--with-spinner">
          <div className="evento-spinner" aria-hidden />
          <p>Cargando evento…</p>
        </div>
      </div>
    );
  }

  if (error && !evento) {
    return (
      <div className="evento-publico-root">
        <div className="evento-publico-brand">Sistema Vanguard Schools</div>
        <div className="evento-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="evento-publico-root">
      <div className="evento-publico-brand">Sistema Vanguard Schools</div>
      <header className="evento-publico-header">
        <h1 className="evento-publico-event-title">{evento?.titulo || 'Evento'}</h1>
        {(fechaTexto || evento?.lugar || evento?.hora_inicio) && (
          <p className="evento-publico-meta">
            {fechaTexto && <span>{fechaTexto}</span>}
            {evento?.hora_inicio && (
              <span>
                {fechaTexto ? ' · ' : ''}
                {evento.hora_inicio}
                {evento.hora_fin ? ` – ${evento.hora_fin}` : ''}
              </span>
            )}
            {evento?.lugar && (
              <span>
                {(fechaTexto || evento?.hora_inicio) ? ' · ' : ''}
                {evento.lugar}
              </span>
            )}
          </p>
        )}
      </header>

      {error && (
        <div className="evento-error" style={{ marginBottom: 14 }} role="alert">
          {error}
        </div>
      )}

      {step !== 'grupos' && (
        <button type="button" className="evento-back-btn" onClick={volver}>
          ← Volver
        </button>
      )}

      {step === 'alumnos' && grupoSel && (
        <p className="evento-publico-meta" style={{ marginBottom: 12 }}>
          Grupo: {labelGrupo(grupoSel)}
        </p>
      )}
      {step === 'apoderados' && grupoSel && alumnoSel && (
        <p className="evento-publico-meta" style={{ marginBottom: 12 }}>
          {labelGrupo(grupoSel)} · {nombreCompletoPersona(alumnoSel)}
        </p>
      )}

      {step === 'grupos' && (
        <>
          <h2 className="evento-publico-section-title">Elige tu grupo</h2>
          <div className="evento-publico-grid">
            {grupos.map((g, i) => (
              <button
                key={g.id}
                type="button"
                className="evento-pastel-card"
                style={{ background: PASTEL_BACKGROUNDS[i % PASTEL_BACKGROUNDS.length] }}
                onClick={() => onElegirGrupo(g)}
              >
                <div className="evento-pastel-card-avatar placeholder" style={{ fontSize: '1.4rem' }}>
                  🏫
                </div>
                <div className="evento-pastel-card-body">
                  <div className="evento-pastel-card-title">{labelGrupo(g)}</div>
                  <p className="evento-pastel-card-sub">Toca para ver alumnos</p>
                </div>
              </button>
            ))}
          </div>
          {!grupos.length && <p style={{ color: '#5c6378' }}>No hay grupos configurados para este evento.</p>}
        </>
      )}

      {step === 'alumnos' && (
        <>
          <h2 className="evento-publico-section-title">Elige al estudiante</h2>
          {loadingAlumnos ? (
            <div className="evento-loading evento-loading--with-spinner">
              <div className="evento-spinner" aria-hidden />
              <p>Cargando estudiantes…</p>
            </div>
          ) : (
            <div className="evento-publico-grid">
              {alumnosOrdenados.map((a, i) => {
                const nombre = nombreCompletoPersona(a);
                const url = buildFotoUrl(a.foto);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="evento-pastel-card"
                    style={{ background: PASTEL_BACKGROUNDS[i % PASTEL_BACKGROUNDS.length] }}
                    onClick={() => onElegirAlumno(a)}
                  >
                    {url ? (
                      <img className="evento-pastel-card-avatar" src={url} alt="" />
                    ) : (
                      <div className="evento-pastel-card-avatar placeholder">{getInitials(nombre)}</div>
                    )}
                    <div className="evento-pastel-card-body">
                      <div className="evento-pastel-card-title">{nombre || 'Alumno'}</div>
                      <p className="evento-pastel-card-sub">Registrar asistencia</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {step === 'apoderados' && (
        <>
          <h2 className="evento-publico-section-title">¿Quién asiste?</h2>
          {loadingApoderados ? (
            <div className="evento-loading evento-loading--with-spinner">
              <div className="evento-spinner" aria-hidden />
              <p>Cargando apoderados…</p>
            </div>
          ) : (
            <>
              <div className="evento-publico-grid">
                {apoderados.map((ap, i) => {
                  const nombre = nombreCompletoPersona(ap);
                  const url = buildFotoUrl(ap.foto);
                  const selected = apoderadoSel?.id === ap.id;
                  return (
                    <button
                      key={ap.id}
                      type="button"
                      className="evento-pastel-card"
                      style={{
                        background: PASTEL_BACKGROUNDS[i % PASTEL_BACKGROUNDS.length],
                        outline: selected ? '3px solid rgba(124, 140, 255, 0.85)' : 'none'
                      }}
                      disabled={ap.ya_asistio}
                      onClick={() => {
                        setError(null);
                        setApoderadoSel(ap);
                      }}
                    >
                      {url ? (
                        <img className="evento-pastel-card-avatar" src={url} alt="" />
                      ) : (
                        <div className="evento-pastel-card-avatar placeholder">{getInitials(nombre)}</div>
                      )}
                      <div className="evento-pastel-card-body">
                        <div className="evento-pastel-card-title">{nombre || 'Apoderado'}</div>
                        <p className="evento-pastel-card-sub">
                          {ap.ya_asistio ? 'Ya registraste asistencia con este perfil' : 'Selecciona y confirma abajo'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="evento-yo-asisti"
                disabled={(apoderadoSel && apoderadoSel.ya_asistio) || submitting}
                onClick={onYoAsisti}
              >
                {submitting ? 'Registrando…' : 'Yo asistí'}
              </button>

              <div className="evento-visitante-box">
                <h3>¿Eres visitante? (sin vínculo en lista)</h3>
                <p className="evento-visitante-hint">Todos los campos son obligatorios para registrar tu visita.</p>
                {visitanteOk ? (
                  <p style={{ margin: 0, color: '#1e5c3a', fontWeight: 600 }}>¡Gracias! Tu visita quedó registrada.</p>
                ) : (
                  <form onSubmit={enviarVisitante} noValidate>
                    <label htmlFor="vis-nombre">Nombre completo *</label>
                    <input
                      id="vis-nombre"
                      required
                      value={visitante.nombre_completo}
                      onChange={(e) => setVisitante((v) => ({ ...v, nombre_completo: e.target.value }))}
                      placeholder="Nombre y apellidos"
                      autoComplete="name"
                    />
                    <label htmlFor="vis-tel">Teléfono *</label>
                    <input
                      id="vis-tel"
                      required
                      value={visitante.telefono}
                      onChange={(e) => setVisitante((v) => ({ ...v, telefono: e.target.value }))}
                      placeholder="Número de contacto"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                    <label htmlFor="vis-mail">Correo electrónico *</label>
                    <input
                      id="vis-mail"
                      type="email"
                      required
                      value={visitante.correo}
                      onChange={(e) => setVisitante((v) => ({ ...v, correo: e.target.value }))}
                      placeholder="correo@ejemplo.com"
                      autoComplete="email"
                    />
                    <label htmlFor="vis-par">Parentesco con el estudiante *</label>
                    <input
                      id="vis-par"
                      required
                      value={visitante.parentesco}
                      onChange={(e) => setVisitante((v) => ({ ...v, parentesco: e.target.value }))}
                      placeholder="Ej. tío, abuela, familiar"
                    />
                    <button type="submit" className="evento-visitante-submit" disabled={visitanteSending}>
                      {visitanteSending ? 'Enviando…' : 'Registrar visita'}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </>
      )}

      {welcome && (
        <div
          className="evento-welcome-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="evento-welcome-title"
          onClick={() => setWelcome(null)}
        >
          <div className="evento-welcome-card" onClick={(e) => e.stopPropagation()}>
            <div className="evento-welcome-sparkle" aria-hidden />
            <div className="evento-welcome-photo-wrap">
              <div className="evento-welcome-ring" aria-hidden />
              {welcome.fotoUrl ? (
                <img className="evento-welcome-photo" src={welcome.fotoUrl} alt="" />
              ) : (
                <div
                  className="evento-welcome-photo"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #e8ecff, #fce4ec)'
                  }}
                >
                  {welcome.initials}
                </div>
              )}
            </div>
            <h2 id="evento-welcome-title" className="evento-welcome-title">
              ¡Bienvenido!
            </h2>
            <p className="evento-welcome-name">{welcome.nombre}</p>
            <p style={{ position: 'relative', zIndex: 1, margin: '0 0 12px', fontSize: '0.95rem', color: '#5c6378' }}>
              Tu asistencia quedó registrada. Gracias por acompañarnos.
            </p>
            <button type="button" className="evento-welcome-close" onClick={() => setWelcome(null)}>
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
