import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminMatriculas.css';

/** Sede por defecto alineada a `AdminMatriculasInscripcion`. */
const SEDE_ID_DEFAULT = '1';

function sedeIdNumericoSeguro(raw) {
  const n = parseInt(String(raw != null && raw !== '' ? raw : SEDE_ID_DEFAULT).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : parseInt(SEDE_ID_DEFAULT, 10);
}

/** Alineado a índices legado `TraitConstants::$ESTADOS_MATRICULA` */
const ESTADOS_MAT = [
  { v: 0, label: 'Regular' },
  { v: 1, label: 'Irregular' },
  { v: 2, label: 'Retirado' },
  { v: 3, label: 'Traslado' },
  { v: 4, label: 'Temporal' },
];

const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'SEMIPRESENCIAL'];
const SECCIONES_OPCIONES = ['Unica', 'A', 'B', 'C', 'D', 'E', 'F'];

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

function nombreAlumno(row) {
  const ap = (row?.apellido_paterno || '').trim();
  const am = (row?.apellido_materno || '').trim();
  const nom = (row?.nombres || '').trim();
  const full = [ap, am].filter(Boolean).join(' ');
  if (full && nom) return `${full}, ${nom}`;
  return `${full} ${nom}`.trim() || '—';
}

function normalizarSeccionUi(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Unica';
  const hit = SECCIONES_OPCIONES.find((opt) => opt.toUpperCase() === s.toUpperCase());
  return hit || s;
}

/**
 * Modal: nueva matrícula o edición completa (mismo formulario que inscripción existente).
 * @param {'create'|'edit'} [mode]
 * @param {number|null} [matriculaId] — obligatorio si mode === 'edit'
 */
export default function NuevaMatriculaAlumnoExistenteModal({
  open,
  alumno,
  onClose,
  onRegistrado,
  mode = 'create',
  matriculaId = null,
}) {
  const anioActual = new Date().getFullYear();
  const isEdit = mode === 'edit' && matriculaId != null && Number(matriculaId) > 0;
  const hydratingRef = useRef(false);

  const [anioFiltro, setAnioFiltro] = useState(anioActual);
  const [sedeId, setSedeId] = useState(SEDE_ID_DEFAULT);
  const [catalogo, setCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('Unica');
  const [turnoId, setTurnoId] = useState('');

  const [costoModo, setCostoModo] = useState('personalizado');
  const [costoId, setCostoId] = useState('');
  const [persMatricula, setPersMatricula] = useState('');
  const [persPension, setPersPension] = useState('');
  const [persAgenda, setPersAgenda] = useState('');
  const [estadoMat, setEstadoMat] = useState(0);
  const [modalidad, setModalidad] = useState('PRESENCIAL');
  const [fechaRegistro, setFechaRegistro] = useState(() => new Date().toISOString().slice(0, 10));
  const [registrarPagoMat, setRegistrarPagoMat] = useState(true);
  const [sending, setSending] = useState(false);

  const niveles = useMemo(() => (Array.isArray(catalogo?.niveles) ? catalogo.niveles : []), [catalogo]);
  const turnos = useMemo(() => (Array.isArray(catalogo?.turnos) ? catalogo.turnos : []), [catalogo]);
  const costosGeneral = useMemo(() => {
    const list = catalogo?.costos || [];
    return list.filter((c) => String(c.tipo || '').toUpperCase().trim() === 'GENERAL');
  }, [catalogo?.costos]);

  const nivelSeleccionado = useMemo(() => niveles.find((n) => String(n.id) === String(nivelId)), [niveles, nivelId]);
  const opcionesGrado = useMemo(() => gradosParaNivel(nivelSeleccionado?.nombre), [nivelSeleccionado]);

  useEffect(() => {
    if (hydratingRef.current) return;
    if (!opcionesGrado.length) return;
    const valid = opcionesGrado.some((o) => String(o.v) === String(grado));
    if (!valid) setGrado(String(opcionesGrado[0].v));
  }, [nivelId, opcionesGrado, grado]);

  const loadCatalogo = useCallback(async () => {
    setLoadingCat(true);
    try {
      const { data } = await api.get('/admin/usuarios/inscripcion-matricula/catalogo', {
        params: { anio: anioFiltro, sede_id: sedeId || SEDE_ID_DEFAULT },
      });
      setCatalogo(data);
      if (data.niveles?.length) {
        const first = data.niveles[0];
        setNivelId(String(first.id));
        const g0 = gradosParaNivel(first.nombre)[0];
        setGrado(g0 ? String(g0.v) : '1');
      } else {
        setNivelId('');
        setGrado('');
      }
      if (data.turnos?.length) {
        setTurnoId(String(data.turnos[0].id));
      } else {
        setTurnoId('');
      }
      setSeccion((s) => {
        const v = String(s || '').trim();
        if (!v || !SECCIONES_OPCIONES.includes(v)) return 'Unica';
        return v;
      });
      const genList = (data.costos || []).filter((c) => String(c.tipo || '').toUpperCase().trim() === 'GENERAL');
      if (genList.length) {
        const gen = genList.find((c) => String(c.tipo || '').toUpperCase() === 'GENERAL') || genList[0];
        setCostoId(String(gen.id));
        setPersMatricula((prev) => (prev === '' ? String(gen.matricula ?? '') : prev));
        setPersPension((prev) => (prev === '' ? String(gen.pension ?? '') : prev));
      } else {
        setCostoId('');
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo cargar el catálogo', text: e.response?.data?.error || e.message });
    } finally {
      setLoadingCat(false);
    }
  }, [anioFiltro, sedeId]);

  useEffect(() => {
    if (!open || !alumno?.id || isEdit) return;
    setFechaRegistro(new Date().toISOString().slice(0, 10));
    setRegistrarPagoMat(true);
    loadCatalogo();
  }, [open, alumno?.id, isEdit, loadCatalogo]);

  useEffect(() => {
    if (!open || !alumno?.id || !isEdit || !matriculaId) return;
    let cancelled = false;
    (async () => {
      setLoadingInitial(true);
      try {
        const { data } = await api.get(`/admin/usuarios/alumnos/${alumno.id}/matriculas/${matriculaId}`);
        if (cancelled) return;
        const m = data.data?.matricula;
        if (!m) throw new Error('Sin datos');
        const g = m.grupo || {};
        const c = m.costo || {};
        const anio = Number(g.anio) || anioActual;
        const sede = g.sede_id != null ? String(g.sede_id) : SEDE_ID_DEFAULT;
        const { data: cat } = await api.get('/admin/usuarios/inscripcion-matricula/catalogo', {
          params: { anio, sede_id: sedeIdNumericoSeguro(sede) },
        });
        if (cancelled) return;
        hydratingRef.current = true;
        setAnioFiltro(anio);
        setSedeId(sede);
        setCatalogo(cat);
        setNivelId(String(g.nivel_id ?? ''));
        setGrado(String(g.grado ?? ''));
        setSeccion(normalizarSeccionUi(g.seccion));
        setTurnoId(String(g.turno_id ?? ''));
        setEstadoMat(Number.isFinite(Number(m.estado)) ? Number(m.estado) : 0);
        const modRaw = String(m.modalidad || 'PRESENCIAL').trim().toUpperCase().replace(/\s+/g, '_');
        setModalidad(MODALIDADES.includes(modRaw) ? modRaw : 'PRESENCIAL');
        setFechaRegistro((m.fecha_registro || '').toString().slice(0, 10) || new Date().toISOString().slice(0, 10));
        const tipoC = String(c.tipo || '').toUpperCase().trim();
        if (tipoC === 'GENERAL' && m.costo_id) {
          setCostoModo('tarifario');
          setCostoId(String(m.costo_id));
        } else {
          setCostoModo('personalizado');
          setCostoId('');
          setPersMatricula(c.matricula != null ? String(c.matricula) : '');
          setPersPension(c.pension != null ? String(c.pension) : '');
          setPersAgenda(c.agenda != null && c.agenda !== '' ? String(c.agenda) : '');
        }
        requestAnimationFrame(() => {
          hydratingRef.current = false;
        });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'No se pudo cargar la matrícula', text: e.response?.data?.error || e.message });
        onClose?.();
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, alumno?.id, isEdit, matriculaId, anioActual, onClose]);

  useEffect(() => {
    const list = catalogo?.sedes;
    if (!list?.length) return;
    const ids = new Set(list.map((s) => String(s.id)));
    if (!ids.has(String(sedeId))) {
      const next = ids.has(SEDE_ID_DEFAULT) ? SEDE_ID_DEFAULT : String(list[0].id);
      setSedeId(next);
    }
  }, [catalogo?.sedes, sedeId]);

  const copiarTarifaAlModoPersonalizado = () => {
    const c =
      costosGeneral.find((x) => String(x.id) === String(costoId)) ||
      costosGeneral.find((x) => String(x.tipo || '').toUpperCase() === 'GENERAL') ||
      costosGeneral[0];
    if (!c) {
      Swal.fire({ icon: 'info', text: 'No hay tarifas GENERAL en el catálogo para copiar.' });
      return;
    }
    setPersMatricula(String(c.matricula ?? ''));
    setPersPension(String(c.pension ?? ''));
    setCostoModo('personalizado');
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!alumno?.id) return;
    const sidMat = sedeIdNumericoSeguro(sedeId);
    const listaSedes = catalogo?.sedes || [];
    if (listaSedes.length > 0 && !listaSedes.some((s) => Number(s.id) === sidMat)) {
      Swal.fire({ icon: 'warning', text: 'Seleccione una sede válida (campus) en Matrícula académica.' });
      return;
    }
    if (!nivelId || !String(seccion || '').trim() || !turnoId) {
      Swal.fire({ icon: 'warning', text: 'Complete nivel, grado, sección y turno.' });
      return;
    }
    if (!fechaRegistro || !/^\d{4}-\d{2}-\d{2}$/.test(fechaRegistro)) {
      Swal.fire({ icon: 'warning', text: 'Indique una fecha de registro válida.' });
      return;
    }
    if (costoModo === 'tarifario') {
      if (!costoId) {
        Swal.fire({ icon: 'warning', text: 'Seleccione una tarifa GENERAL del colegio o use montos personalizados.' });
        return;
      }
    } else {
      const pm = parseFloat(String(persMatricula).replace(',', '.'));
      const pp = parseFloat(String(persPension).replace(',', '.'));
      if (!Number.isFinite(pm) || pm < 0) {
        Swal.fire({ icon: 'warning', text: 'Indique un monto de matrícula válido (≥ 0).' });
        return;
      }
      if (!Number.isFinite(pp) || pp <= 0) {
        Swal.fire({ icon: 'warning', text: 'La pensión mensual debe ser mayor a 0 para generar las cuotas.' });
        return;
      }
    }

    const body = {
      sede_id: sidMat,
      ubicacion_grupo: {
        nivel_id: parseInt(nivelId, 10),
        grado: parseInt(grado, 10),
        seccion: String(seccion || '').trim(),
        turno_id: parseInt(turnoId, 10),
        anio: anioFiltro,
        sede_id: sidMat,
      },
      costo_modo: costoModo,
      ...(costoModo === 'tarifario'
        ? { costo_id: parseInt(costoId, 10) }
        : {
            costo_personalizado: {
              matricula: parseFloat(String(persMatricula).replace(',', '.')) || 0,
              pension: parseFloat(String(persPension).replace(',', '.')) || 0,
              agenda: persAgenda !== '' ? parseFloat(String(persAgenda).replace(',', '.')) : 0,
            },
          }),
      estado_matricula: estadoMat,
      fecha_registro: fechaRegistro,
      modalidad,
      ...(!isEdit ? { registrar_linea_pago_matricula: registrarPagoMat } : {}),
    };

    setSending(true);
    try {
      if (isEdit) {
        await api.put(`/admin/usuarios/alumnos/${alumno.id}/matriculas/${matriculaId}`, body);
        await Swal.fire({
          icon: 'success',
          title: 'Matrícula actualizada',
          text:
            'Los cambios se guardaron. Las cuotas aún pendientes se actualizan al nuevo costo; no se crean líneas duplicadas ni se alteran cobros ya registrados.',
          confirmButtonText: 'Listo',
        });
      } else {
        const { data } = await api.post(`/admin/usuarios/alumnos/${alumno.id}/inscripcion-matricula`, body);
        await Swal.fire({
          icon: 'success',
          title: 'Matrícula registrada',
          html: `<p>${data.mensaje || 'OK'}</p><p class="swal2-small">Matrícula #${data.matricula_id}</p>`,
          confirmButtonText: 'Listo',
        });
      }
      onRegistrado?.(alumno?.id);
      onClose?.();
    } catch (err) {
      const d = err.response?.data;
      const codigo = d?.codigo;
      if (!isEdit && err.response?.status === 409 && codigo === 'MATRICULA_DUPLICADA_ANIO') {
        Swal.fire({
          icon: 'info',
          title: 'Matrícula no registrada',
          text: d?.error || 'Este alumno ya tiene matrícula en ese año académico.',
        });
      } else {
        Swal.fire({ icon: 'error', title: 'No se pudo completar', text: d?.error || err.message });
      }
    } finally {
      setSending(false);
    }
  };

  if (!open || !alumno) return null;

  const bloqueado = sending || loadingCat || loadingInitial;
  const tituloModal = isEdit ? 'Editar matrícula' : 'Registrar nueva matrícula';

  return createPortal(
    <div
      className="admin-usu-modal-overlay admin-usu-modal-overlay--nested"
      onClick={() => !sending && onClose()}
      role="presentation"
    >
      <div
        className="admin-usu-modal admin-usu-modal-wide"
        style={{ maxWidth: 920, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-nueva-mat-titulo"
      >
        <div className="admin-usu-modal-header">
          <h2 id="admin-nueva-mat-titulo">{tituloModal}</h2>
          <button type="button" className="admin-usu-modal-close" disabled={sending} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="admin-usu-modal-body" style={{ overflow: 'auto', flex: 1 }}>
          <p style={{ margin: '0 0 1rem', color: '#374151', fontWeight: 600 }}>{nombreAlumno(alumno)}</p>
          <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#6b7280' }}>
            {isEdit
              ? 'Modifique sede, año, grupo, costos y modalidad como en una matrícula nueva. Los pagos ya creados no se duplican; gestiónelos en «Ver pagos».'
              : 'Los datos del alumno y apoderados ya están registrados. Complete el grupo, costos y pagos a generar.'}
          </p>

          {loadingInitial ? (
            <p style={{ color: '#6b7280' }}>Cargando matrícula…</p>
          ) : (
            <form onSubmit={enviar} className="admin-mat-form" style={{ paddingBottom: 8 }}>
              <section className="admin-mat-card admin-mat-card--academico">
                <div className="admin-mat-card-head admin-mat-card-head--academico-stack">
                  <div className="admin-mat-card-head-main">
                    <span className="admin-mat-badge admin-mat-badge--academico">3</span>
                    <div>
                      <h2 className="admin-mat-card-title">Matrícula académica</h2>
                      <p className="admin-mat-card-hint">
                        Elija el año académico y la sede (campus); el grupo se crea en esa sede. Si el aula no existía, se crea sin tutor.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="admin-mat-row-3 admin-mat-catalogo-fila">
                  <div className="admin-mat-field">
                    <label htmlFor="admin-nueva-mat-anio">Año académico</label>
                    <input
                      id="admin-nueva-mat-anio"
                      type="number"
                      className="admin-mat-input admin-mat-input--year"
                      value={anioFiltro}
                      onChange={(e) => setAnioFiltro(parseInt(e.target.value, 10) || anioActual)}
                      min={2000}
                      max={2100}
                      disabled={bloqueado}
                    />
                  </div>
                  <div className="admin-mat-field">
                    <label htmlFor="admin-nueva-mat-sede">Sede (campus)</label>
                    <select
                      id="admin-nueva-mat-sede"
                      className="admin-mat-input"
                      value={sedeId}
                      onChange={(e) => setSedeId(e.target.value)}
                      disabled={bloqueado || !(catalogo?.sedes || []).length}
                      aria-label="Sede o campus físico"
                    >
                      {(catalogo?.sedes || []).map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-mat-field admin-mat-field--catalogo-btn">
                    <span className="admin-mat-catalogo-btn-label-spacer" aria-hidden="true">
                      &nbsp;
                    </span>
                    <button
                      type="button"
                      id="admin-nueva-mat-refresh-catalogo"
                      className="admin-mat-btn admin-mat-btn--secondary"
                      onClick={loadCatalogo}
                      disabled={bloqueado}
                      aria-label="Actualizar catálogo de niveles, turnos y tarifas según año y sede"
                    >
                      {loadingCat ? 'Cargando…' : 'Actualizar catálogo'}
                    </button>
                  </div>
                </div>
                <div className="admin-mat-row-3 admin-mat-row-3--matricula-superior">
                  <div className="admin-mat-field">
                    <label>Fecha de registro</label>
                    <input
                      type="date"
                      className="admin-mat-input"
                      value={fechaRegistro}
                      onChange={(e) => setFechaRegistro(e.target.value)}
                      disabled={bloqueado}
                      required
                    />
                  </div>
                  <div className="admin-mat-field" />
                  <div className="admin-mat-field" />
                </div>
                <div className="admin-mat-row-3 admin-mat-row-3--matricula-superior">
                  <div className="admin-mat-field">
                    <label>Nivel</label>
                    <select
                      className="admin-mat-input"
                      value={nivelId}
                      onChange={(e) => setNivelId(e.target.value)}
                      disabled={bloqueado || !niveles.length}
                      required
                    >
                      <option value="">—</option>
                      {niveles.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-mat-field">
                    <label>Grado</label>
                    <select className="admin-mat-input" value={grado} onChange={(e) => setGrado(e.target.value)} disabled={bloqueado} required>
                      {opcionesGrado.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-mat-field">
                    <label>Sección</label>
                    <select className="admin-mat-input" value={seccion} onChange={(e) => setSeccion(e.target.value)} disabled={bloqueado} required>
                      {SECCIONES_OPCIONES.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="admin-mat-row-3">
                  <div className="admin-mat-field">
                    <label>Turno</label>
                    <select
                      className="admin-mat-input"
                      value={turnoId}
                      onChange={(e) => setTurnoId(e.target.value)}
                      disabled={bloqueado || !turnos.length}
                      required
                    >
                      <option value="">—</option>
                      {turnos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-mat-field">
                    <label>Estado</label>
                    <select
                      className="admin-mat-input"
                      value={estadoMat}
                      onChange={(e) => setEstadoMat(parseInt(e.target.value, 10))}
                      disabled={bloqueado}
                    >
                      {ESTADOS_MAT.map((s) => (
                        <option key={s.v} value={s.v}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-mat-field">
                    <label>Modalidad</label>
                    <select className="admin-mat-input" value={modalidad} onChange={(e) => setModalidad(e.target.value)} disabled={bloqueado}>
                      {MODALIDADES.map((m) => (
                        <option key={m} value={m}>
                          {m.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="admin-mat-card admin-mat-card--costos">
                <div className="admin-mat-card-head">
                  <div className="admin-mat-card-head-main">
                    <span className="admin-mat-badge admin-mat-badge--costos">4</span>
                    <div>
                      <h2 className="admin-mat-card-title">Costos y tarifas</h2>
                      <p className="admin-mat-card-hint">
                        Tarifa del colegio: solo costos tipo <strong>GENERAL</strong>. Montos personalizados crean un costo PERSONAL para este alumno.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="admin-mat-costo-modo" role="radiogroup" aria-label="Tipo de costo">
                  <button
                    type="button"
                    className={`admin-mat-costo-modo-btn ${costoModo === 'personalizado' ? 'is-active' : ''}`}
                    onClick={() => setCostoModo('personalizado')}
                    disabled={bloqueado}
                  >
                    Montos personalizados
                  </button>
                  <button
                    type="button"
                    className={`admin-mat-costo-modo-btn ${costoModo === 'tarifario' ? 'is-active' : ''}`}
                    onClick={() => setCostoModo('tarifario')}
                    disabled={bloqueado}
                  >
                    Tarifa del colegio (GENERAL)
                  </button>
                </div>
                {costoModo === 'personalizado' ? (
                  <div className="admin-mat-costos-personal">
                    <div className="admin-mat-row-3">
                      <div className="admin-mat-field">
                        <label>Matrícula (S/)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="admin-mat-input"
                          value={persMatricula}
                          onChange={(e) => setPersMatricula(e.target.value)}
                          disabled={bloqueado}
                        />
                      </div>
                      <div className="admin-mat-field">
                        <label>Pensión mensual (S/) *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="admin-mat-input"
                          value={persPension}
                          onChange={(e) => setPersPension(e.target.value)}
                          disabled={bloqueado}
                        />
                      </div>
                      <div className="admin-mat-field">
                        <label>Agenda u otros (S/) — opcional</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="admin-mat-input"
                          value={persAgenda}
                          onChange={(e) => setPersAgenda(e.target.value)}
                          disabled={bloqueado}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="admin-mat-btn admin-mat-btn--ghost"
                      onClick={copiarTarifaAlModoPersonalizado}
                      disabled={bloqueado}
                    >
                      Rellenar montos desde una tarifa GENERAL (referencia)
                    </button>
                  </div>
                ) : (
                  <div className="admin-mat-grid">
                    <div className="admin-mat-field admin-mat-field--span2">
                      <label>Tarifa GENERAL del colegio</label>
                      <select
                        className="admin-mat-input"
                        required={costoModo === 'tarifario'}
                        value={costoId}
                        onChange={(e) => setCostoId(e.target.value)}
                        disabled={!costosGeneral.length || bloqueado}
                      >
                        <option value="">— Seleccione —</option>
                        {costosGeneral.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.descripcion || `Costo #${c.id}`} — Mat. S/ {Number(c.matricula).toFixed(2)} · Pens. S/ {Number(c.pension).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </section>

              {!isEdit && (
                <section className="admin-mat-card admin-mat-card--pagos">
                  <div className="admin-mat-card-head">
                    <div className="admin-mat-card-head-main">
                      <span className="admin-mat-badge admin-mat-badge--pagos">5</span>
                      <div>
                        <h2 className="admin-mat-card-title">Pagos generados</h2>
                        <p className="admin-mat-card-hint">
                          Se crearán todas las pensiones del año en <strong>PENDIENTE</strong>. Opcional: línea de pago de matrícula (también pendiente de cobro).
                        </p>
                      </div>
                    </div>
                  </div>
                  <label className="admin-mat-checkbox admin-mat-checkbox--lg">
                    <input
                      type="checkbox"
                      checked={registrarPagoMat}
                      onChange={(e) => setRegistrarPagoMat(e.target.checked)}
                      disabled={bloqueado}
                    />
                    Registrar línea de pago de matrícula (monto según costo; aparece en «Ver pagos» como pendiente)
                  </label>
                  {catalogo?.colegio_pensiones && (
                    <p className="admin-mat-mini">
                      Pensión mensual: {catalogo.colegio_pensiones.total_pensiones} cuotas · inicio índice {catalogo.colegio_pensiones.inicio_pensiones}
                    </p>
                  )}
                </section>
              )}

              {isEdit && (
                <section className="admin-mat-card admin-mat-card--pagos" style={{ opacity: 0.95 }}>
                  <div className="admin-mat-card-head">
                    <div className="admin-mat-card-head-main">
                      <span className="admin-mat-badge admin-mat-badge--pagos">5</span>
                      <div>
                        <h2 className="admin-mat-card-title">Pagos</h2>
                        <p className="admin-mat-card-hint">
                          Las cuotas y la matrícula pendiente ya generadas <strong>no se duplican</strong> al guardar. Use <strong>Ver pagos</strong> para cobros y ajustes.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <div className="admin-mat-actions-bar">
                <p className="admin-mat-actions-hint">
                  {isEdit
                    ? 'Al guardar se actualizan grupo, costo asociado y datos de matrícula. No se insertan pagos nuevos desde aquí.'
                    : 'Revise los datos antes de confirmar; la matrícula y los pagos pendientes se crean en un solo paso.'}
                </p>
                <div className="admin-mat-actions">
                  <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={onClose} disabled={sending}>
                    Cancelar
                  </button>
                  <button type="submit" className="admin-mat-btn admin-mat-btn--primary admin-mat-btn--lg" disabled={bloqueado}>
                    {sending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar inscripción'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
