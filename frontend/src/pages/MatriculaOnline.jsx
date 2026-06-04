import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import PsicologiaSignaturePad from '../components/PsicologiaSignaturePad';
import './MatriculaOnline.css';

function gradosParaNivel(nivelNombre) {
  const n = String(nivelNombre || '').toUpperCase();
  if (n.includes('INICIAL')) {
    return [
      { v: 3, label: '3 años' },
      { v: 4, label: '4 años' },
      { v: 5, label: '5 años' },
    ];
  }
  if (n.includes('SECUND')) {
    return [1, 2, 3, 4, 5].map((g) => ({ v: g, label: `${g}°` }));
  }
  return [1, 2, 3, 4, 5, 6].map((g) => ({ v: g, label: `${g}°` }));
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function buildDocUrl(url) {
  if (!url) return '#';
  if (url.startsWith('http')) return url;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}${url.startsWith('/') ? url : `/${url}`}`;
}

const emptyAlumno = () => ({
  nro_documento: '',
  apellido_paterno: '',
  apellido_materno: '',
  nombres: '',
  sexo: '',
  fecha_nacimiento: '',
  email: '',
  domicilio: '',
  seguro_id: '',
});

const emptyApoderado = () => ({
  nro_documento: '',
  parentesco: 1,
  nombres: '',
  apellido_paterno: '',
  apellido_materno: '',
  fecha_nacimiento: '',
  email: '',
  telefono_celular: '',
});

export default function MatriculaOnline() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [alumno, setAlumno] = useState(emptyAlumno());
  const [apoderado, setApoderado] = useState(emptyApoderado());
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [docsAceptados, setDocsAceptados] = useState({});
  const [fotoDni, setFotoDni] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [firmaDataUrl, setFirmaDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exito, setExito] = useState(null);
  const fotoInputRef = useRef(null);
  const [fotoDragOver, setFotoDragOver] = useState(false);

  const apiBaseUrl = useMemo(() => {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost) return 'http://localhost:5000';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}`;
  }, []);

  const logoUrl = useMemo(() => `${apiBaseUrl}/assets/logos/logo.png`, [apiBaseUrl]);

  const docsTotal = catalogo?.documentos?.length ?? 0;
  const docsAceptadosCount = useMemo(
    () => (catalogo?.documentos || []).filter((d) => docsAceptados[d.id]).length,
    [catalogo, docsAceptados]
  );
  const docsProgressPct = docsTotal > 0 ? Math.round((docsAceptadosCount / docsTotal) * 100) : 0;

  const loadCatalogo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/public/matricula-online');
      setCatalogo(data);
      if (data.niveles?.length) {
        setNivelId(String(data.niveles[0].id));
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'No se pudo cargar el formulario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogo();
  }, [loadCatalogo]);

  const nivelSel = useMemo(
    () => (catalogo?.niveles || []).find((n) => String(n.id) === String(nivelId)),
    [catalogo, nivelId]
  );

  const gradosOpciones = useMemo(() => gradosParaNivel(nivelSel?.nombre), [nivelSel]);

  useEffect(() => {
    if (gradosOpciones.length) {
      setGrado(String(gradosOpciones[0].v));
    } else {
      setGrado('');
    }
  }, [gradosOpciones]);

  const applyFotoFile = (file) => {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      setError('La foto DNI debe ser una imagen (JPG o PNG).');
      return;
    }
    setFotoDni(file);
    setFotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const onFotoChange = (e) => {
    applyFotoFile(e.target.files?.[0]);
  };

  const onFotoDrop = (e) => {
    e.preventDefault();
    setFotoDragOver(false);
    applyFotoFile(e.dataTransfer.files?.[0]);
  };

  const toggleDoc = (id) => {
    setDocsAceptados((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const validar = () => {
    if (!alumno.nro_documento.trim()) return 'Indique el DNI / código del alumno.';
    if (!alumno.apellido_paterno.trim()) return 'Indique el apellido paterno del alumno.';
    if (!alumno.apellido_materno.trim()) return 'Indique el apellido materno del alumno.';
    if (!alumno.nombres.trim()) return 'Indique los nombres del alumno.';
    if (!alumno.fecha_nacimiento) return 'Indique la fecha de nacimiento del alumno.';
    const sexo = parseInt(alumno.sexo, 10);
    if (sexo !== 1 && sexo !== 2) return 'Seleccione el sexo del alumno.';
    if (!alumno.seguro_id) return 'Seleccione el seguro del alumno.';
    if (!String(alumno.email || '').trim()) return 'Indique el correo electrónico del alumno.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(alumno.email).trim())) {
      return 'Indique un correo electrónico válido del alumno.';
    }
    if (!alumno.domicilio.trim()) return 'Indique el domicilio del alumno.';
    if (!nivelId || !grado) return 'Seleccione nivel y grado a postular.';
    if (!fotoDni) return 'Adjunte la foto del DNI del alumno.';
    if (!apoderado.nro_documento.trim()) return 'Indique el DNI del apoderado.';
    if (!apoderado.apellido_paterno.trim()) return 'Indique el apellido paterno del apoderado.';
    if (!apoderado.apellido_materno.trim()) return 'Indique el apellido materno del apoderado.';
    if (!apoderado.nombres.trim()) return 'Indique los nombres del apoderado.';
    if (!apoderado.fecha_nacimiento) return 'Indique la fecha de nacimiento del apoderado.';
    if (!apoderado.email.trim()) return 'Indique el correo del apoderado.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(apoderado.email.trim())) {
      return 'Indique un correo electrónico válido del apoderado.';
    }
    if (!apoderado.telefono_celular.trim()) return 'Indique el teléfono celular del apoderado.';
    if (!firmaDataUrl) return 'Debe firmar en el recuadro de firma.';
    const docs = catalogo?.documentos || [];
    for (const d of docs) {
      if (!docsAceptados[d.id]) {
        return `Debe aceptar el documento: ${d.titulo}`;
      }
    }
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const msg = validar();
    if (msg) {
      setError(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        alumno: {
          ...alumno,
          sexo: parseInt(alumno.sexo, 10),
          seguro_id: parseInt(alumno.seguro_id, 10),
        },
        apoderado: {
          ...apoderado,
          parentesco: parseInt(apoderado.parentesco, 10) || 1,
        },
        nivel_id: parseInt(nivelId, 10),
        grado: parseInt(grado, 10),
        documentos_aceptados: Object.keys(docsAceptados)
          .filter((k) => docsAceptados[k])
          .map((k) => parseInt(k, 10)),
      };

      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      fd.append('foto_dni', fotoDni);
      const firmaBlob = dataUrlToBlob(firmaDataUrl);
      fd.append('firma', firmaBlob, 'firma.png');

      const { data } = await api.post('/public/matricula-online', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setExito(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al enviar la matrícula');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="matricula-online-page">
        <div className="matricula-online-card matricula-online-card--center">
          <div className="matricula-online-spinner" aria-hidden />
          <p>Cargando formulario…</p>
        </div>
      </div>
    );
  }

  if (!catalogo?.habilitado) {
    return (
      <div className="matricula-online-page">
        <div className="matricula-online-card matricula-online-card--center">
          <div className="matricula-online-icon">🔒</div>
          <h1>Formulario no disponible</h1>
          <p>La matrícula online no está habilitada en este momento. Contacte al colegio.</p>
        </div>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="matricula-online-page">
        <div className="matricula-online-card matricula-online-card--success matricula-online-card--center">
          <div className="matricula-online-icon matricula-online-icon--ok">✓</div>
          <h1>¡Solicitud registrada!</h1>
          <p>{exito.mensaje}</p>
          <p className="matricula-online-muted">
            Proceso de matrícula <strong>{exito.anio_matricula}</strong>
            {exito.grado_label ? <> · Grado: <strong>{exito.grado_label}</strong></> : null}
          </p>
          <p className="matricula-online-muted">Revise su bandeja de correo (incluida spam).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="matricula-online-page">
      <header className="matricula-online-header">
        <div className="matricula-online-header-inner">
          <img
            src={logoUrl}
            alt="Vanguard Schools"
            className="matricula-online-logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="matricula-online-badge">Matrícula {catalogo.anio_matricula}</span>
          <h1>{catalogo.titulo || 'Matrícula online'}</h1>
          <p>{catalogo.colegio_nombre}</p>
        </div>
      </header>

      <main className="matricula-online-main">
        {error && (
          <div className="matricula-online-alert" role="alert">
            {error}
          </div>
        )}

        <form className="matricula-online-form" onSubmit={onSubmit} noValidate>
          {/* Documentos */}
          {catalogo.documentos?.length > 0 && (
            <section className="matricula-online-section matricula-online-section--docs">
              <div className="mat-docs-header">
                <div className="mat-docs-header-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div className="mat-docs-header-text">
                  <h2>Documentos institucionales</h2>
                  <p className="matricula-online-hint mat-docs-header-hint">
                    Lea cada documento, ábralo con el enlace y marque su aceptación para continuar.
                  </p>
                </div>
                <div className="mat-docs-counter" aria-live="polite">
                  <span className="mat-docs-counter-num">{docsAceptadosCount}</span>
                  <span className="mat-docs-counter-sep">/</span>
                  <span className="mat-docs-counter-total">{docsTotal}</span>
                  <span className="mat-docs-counter-label">aceptados</span>
                </div>
              </div>

              <div className="mat-docs-progress" role="progressbar" aria-valuenow={docsProgressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="mat-docs-progress-fill" style={{ width: `${docsProgressPct}%` }} />
              </div>

              <ul className="matricula-online-docs">
                {catalogo.documentos.map((d, idx) => {
                  const aceptado = !!docsAceptados[d.id];
                  return (
                    <li key={d.id}>
                      <label
                        className={`mat-doc-card${aceptado ? ' mat-doc-card--accepted' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="mat-doc-card-checkbox"
                          checked={aceptado}
                          onChange={() => toggleDoc(d.id)}
                        />
                        <span className="mat-doc-card-check" aria-hidden>
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                        <span className="mat-doc-card-pdf" aria-hidden>PDF</span>
                        <span className="mat-doc-card-body">
                          <span className="mat-doc-card-index">Documento {idx + 1}</span>
                          <strong className="mat-doc-card-title">{d.titulo}</strong>
                          <span className="mat-doc-card-legal">
                            Reconozco haber leído y aceptado este documento.
                          </span>
                        </span>
                        <a
                          href={buildDocUrl(d.archivo_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mat-doc-card-open"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                            <path d="M11 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                            <path d="M13 3h4v4M10 10l7-7" />
                          </svg>
                          Ver PDF
                        </a>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {docsAceptadosCount < docsTotal && (
                <p className="mat-docs-footer-hint">
                  Debe aceptar los {docsTotal} documentos para enviar la matrícula.
                </p>
              )}
              {docsAceptadosCount === docsTotal && docsTotal > 0 && (
                <p className="mat-docs-footer-ok">✓ Todos los documentos han sido aceptados</p>
              )}
            </section>
          )}

          {/* Alumno */}
          <section className="matricula-online-section matricula-online-section--alumno">
            <h2>Datos del alumno</h2>
            <p className="matricula-online-hint">Todos los campos marcados con * son obligatorios.</p>
            <div className="matricula-online-grid matricula-online-grid--3">
              <div className="matricula-online-field">
                <label>DNI / Código *</label>
                <input
                  required
                  value={alumno.nro_documento}
                  onChange={(e) => setAlumno((p) => ({ ...p, nro_documento: e.target.value }))}
                  placeholder="Número de documento"
                />
              </div>
              <div className="matricula-online-field">
                <label>Sexo *</label>
                <select
                  required
                  value={alumno.sexo}
                  onChange={(e) => setAlumno((p) => ({ ...p, sexo: parseInt(e.target.value, 10) }))}
                >
                  <option value="">— Seleccione —</option>
                  <option value={1}>Femenino</option>
                  <option value={2}>Masculino</option>
                </select>
              </div>
              <div className="matricula-online-field">
                <label>Fecha de nacimiento *</label>
                <input
                  type="date"
                  required
                  value={alumno.fecha_nacimiento}
                  onChange={(e) => setAlumno((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Apellido paterno *</label>
                <input
                  required
                  value={alumno.apellido_paterno}
                  onChange={(e) => setAlumno((p) => ({ ...p, apellido_paterno: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Apellido materno *</label>
                <input
                  required
                  value={alumno.apellido_materno}
                  onChange={(e) => setAlumno((p) => ({ ...p, apellido_materno: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Nombres *</label>
                <input
                  required
                  value={alumno.nombres}
                  onChange={(e) => setAlumno((p) => ({ ...p, nombres: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Seguro *</label>
                <select
                  required
                  value={alumno.seguro_id}
                  onChange={(e) => setAlumno((p) => ({ ...p, seguro_id: e.target.value }))}
                >
                  <option value="">— Seleccione —</option>
                  {(catalogo.seguros || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="matricula-online-field">
                <label>Correo electrónico *</label>
                <input
                  type="email"
                  required
                  value={alumno.email}
                  onChange={(e) => setAlumno((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Domicilio *</label>
                <input
                  required
                  value={alumno.domicilio}
                  onChange={(e) => setAlumno((p) => ({ ...p, domicilio: e.target.value }))}
                />
              </div>
            </div>

            <div className="matricula-online-grid--2-center">
              <div className="matricula-online-grid matricula-online-grid--2">
                <div className="matricula-online-field">
                  <label>Nivel a postular *</label>
                  <select
                    required
                    value={nivelId}
                    onChange={(e) => setNivelId(e.target.value)}
                  >
                    {(catalogo.niveles || []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="matricula-online-field">
                  <label>Grado a postular *</label>
                  <select required value={grado} onChange={(e) => setGrado(e.target.value)}>
                    {gradosOpciones.map((g) => (
                      <option key={g.v} value={g.v}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mat-foto-upload-wrap">
              <label className="mat-foto-upload-label">Foto del DNI del alumno *</label>
              <div
                className={`mat-foto-upload${fotoDragOver ? ' mat-foto-upload--drag' : ''}${fotoPreview ? ' mat-foto-upload--has-preview' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fotoInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fotoInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setFotoDragOver(true);
                }}
                onDragLeave={() => setFotoDragOver(false)}
                onDrop={onFotoDrop}
              >
                <input ref={fotoInputRef} type="file" accept="image/*" hidden onChange={onFotoChange} />
                {fotoPreview ? (
                  <div className="mat-foto-upload-preview">
                    <img src={fotoPreview} alt="Vista previa DNI" />
                    <span className="mat-foto-upload-change">Clic para cambiar imagen</span>
                  </div>
                ) : (
                  <div className="mat-foto-upload-empty">
                    <div className="mat-foto-upload-icon" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <circle cx="12" cy="11" r="3" />
                        <path d="M8 19l2-2h4l2 2" />
                      </svg>
                    </div>
                    <strong>Subir foto del DNI</strong>
                    <span>Arrastre una imagen aquí o haga clic para seleccionar</span>
                    <span className="mat-foto-upload-formats">JPG, PNG · máx. 8 MB</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Apoderado */}
          <section className="matricula-online-section matricula-online-section--apoderado">
            <h2>Apoderado</h2>
            <p className="matricula-online-hint">Todos los campos marcados con * son obligatorios.</p>
            <div className="matricula-online-grid matricula-online-grid--3">
              <div className="matricula-online-field">
                <label>Tipo documento *</label>
                <select disabled value={1}>
                  <option value={1}>DNI</option>
                </select>
              </div>
              <div className="matricula-online-field">
                <label>Núm. documento *</label>
                <input
                  required
                  value={apoderado.nro_documento}
                  onChange={(e) => setApoderado((p) => ({ ...p, nro_documento: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Fecha nacimiento *</label>
                <input
                  type="date"
                  required
                  value={apoderado.fecha_nacimiento}
                  onChange={(e) => setApoderado((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Apellido paterno *</label>
                <input
                  required
                  value={apoderado.apellido_paterno}
                  onChange={(e) => setApoderado((p) => ({ ...p, apellido_paterno: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Apellido materno *</label>
                <input
                  required
                  value={apoderado.apellido_materno}
                  onChange={(e) => setApoderado((p) => ({ ...p, apellido_materno: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Nombres *</label>
                <input
                  required
                  value={apoderado.nombres}
                  onChange={(e) => setApoderado((p) => ({ ...p, nombres: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Parentesco *</label>
                <select
                  required
                  value={apoderado.parentesco}
                  onChange={(e) => setApoderado((p) => ({ ...p, parentesco: parseInt(e.target.value, 10) }))}
                >
                  {(catalogo.parentesco || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="matricula-online-field">
                <label>Correo *</label>
                <input
                  type="email"
                  required
                  value={apoderado.email}
                  onChange={(e) => setApoderado((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="matricula-online-field">
                <label>Teléfono celular *</label>
                <input
                  required
                  value={apoderado.telefono_celular}
                  onChange={(e) => setApoderado((p) => ({ ...p, telefono_celular: e.target.value }))}
                />
              </div>
            </div>
          </section>

          {/* Firma */}
          <section className="matricula-online-section matricula-online-section--firma">
            <div className="mat-firma-header">
              <div className="mat-firma-header-icon" aria-hidden>✍</div>
              <div>
                <h2>Firma del apoderado</h2>
                <p className="matricula-online-hint mat-firma-hint">
                  Dibuje su firma manuscrita en el recuadro. Es obligatorio para completar la matrícula.
                </p>
              </div>
            </div>
            <div className={`mat-firma-pad-box${firmaDataUrl ? ' mat-firma-pad-box--signed' : ''}`}>
              <PsicologiaSignaturePad width={520} height={160} onChange={setFirmaDataUrl} disabled={submitting} />
              {firmaDataUrl && (
                <p className="mat-firma-ok">✓ Firma registrada — puede limpiar y volver a firmar si lo necesita</p>
              )}
            </div>
          </section>

          <div className="matricula-online-actions">
            <button type="submit" className="matricula-online-submit" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar matrícula online'}
            </button>
          </div>
        </form>
      </main>

      <footer className="matricula-online-footer">
        <p>{catalogo.colegio_nombre} · Matrícula online {catalogo.anio_matricula}</p>
      </footer>
    </div>
  );
}
