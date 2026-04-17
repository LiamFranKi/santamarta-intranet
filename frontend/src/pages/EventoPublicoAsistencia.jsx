import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { fotoUsuarioAdmin } from '../utils/adminUsuariosFoto';
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
    if (!apoderadoSel || !alumnoSel || !token) return;
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
    if (!nombre) {
      setError('Indica tu nombre completo para visitante.');
      return;
    }
    setVisitanteSending(true);
    setError(null);
    try {
      await api.post(`/public/eventos/${encodeURIComponent(token)}/visitante`, {
        alumno_id: alumnoSel?.id ?? null,
        nombre_completo: nombre,
        telefono: visitante.telefono || null,
        correo: visitante.correo || null,
        parentesco: visitante.parentesco || null
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
    try {
      const d = new Date(evento.fecha_evento);
      return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return evento.fecha_evento;
    }
  }, [evento]);

  if (loading) {
    return (
      <div className="evento-publico-root">
        <div className="evento-loading">Cargando evento…</div>
      </div>
    );
  }

  if (error && !evento) {
    return (
      <div className="evento-publico-root">
        <div className="evento-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="evento-publico-root">
      <header className="evento-publico-header">
        <h1>{evento?.titulo || 'Evento'}</h1>
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
            <p className="evento-loading">Cargando alumnos…</p>
          ) : (
            <div className="evento-publico-grid">
              {alumnos.map((a, i) => {
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
            <p className="evento-loading">Cargando apoderados…</p>
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
                      onClick={() => setApoderadoSel(ap)}
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
                disabled={!apoderadoSel || apoderadoSel.ya_asistio || submitting}
                onClick={onYoAsisti}
              >
                {submitting ? 'Registrando…' : 'Yo asistí'}
              </button>

              <div className="evento-visitante-box">
                <h3>¿Eres visitante? (sin vínculo en lista)</h3>
                {visitanteOk ? (
                  <p style={{ margin: 0, color: '#1e5c3a', fontWeight: 600 }}>¡Gracias! Tu visita quedó registrada.</p>
                ) : (
                  <form onSubmit={enviarVisitante}>
                    <label>Nombre completo *</label>
                    <input
                      value={visitante.nombre_completo}
                      onChange={(e) => setVisitante((v) => ({ ...v, nombre_completo: e.target.value }))}
                      placeholder="Nombre y apellidos"
                      autoComplete="name"
                    />
                    <label>Teléfono</label>
                    <input
                      value={visitante.telefono}
                      onChange={(e) => setVisitante((v) => ({ ...v, telefono: e.target.value }))}
                      placeholder="Opcional"
                      inputMode="tel"
                    />
                    <label>Correo</label>
                    <input
                      type="email"
                      value={visitante.correo}
                      onChange={(e) => setVisitante((v) => ({ ...v, correo: e.target.value }))}
                      placeholder="Opcional"
                      autoComplete="email"
                    />
                    <label>Parentesco con el estudiante</label>
                    <input
                      value={visitante.parentesco}
                      onChange={(e) => setVisitante((v) => ({ ...v, parentesco: e.target.value }))}
                      placeholder="Opcional"
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
