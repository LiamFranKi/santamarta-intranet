import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminMatriculas.css';

/** Institución única (no multi-colegio en este despliegue). El servidor usa el mismo id. */
const COLEGIO_ID_DEFAULT = 1;
/** Sede física por defecto (tabla `sedes`, p. ej. San Martín id=1). */
const SEDE_ID_DEFAULT = '1';

const PARENTESCO = [
  { v: 1, label: 'Padre / tutor' },
  { v: 2, label: 'Madre' },
  { v: 3, label: 'Hermano / otro familiar' },
  { v: 4, label: 'Otro apoderado' },
];

const ESTADOS_MAT = [
  { v: 0, label: 'Regular' },
  { v: 1, label: 'Irregular' },
  { v: 4, label: 'Temporal' },
];

const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'SEMIPRESENCIAL'];

/** Sección / letra de grupo (misma fila que nivel y grado). */
const SECCIONES_OPCIONES = ['Unica', 'A', 'B', 'C', 'D', 'E', 'F'];

/** Grados según nombre de nivel (misma lógica que negocio escolar). */
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

const emptyApoderado = () => ({
  nro_documento: '',
  parentesco: 1,
  nombres: '',
  apellido_paterno: '',
  apellido_materno: '',
  fecha_nacimiento: '1980-01-01',
  email: '',
  telefono_celular: '',
});

export default function AdminMatriculasInscripcion() {
  const navigate = useNavigate();
  const anioActual = new Date().getFullYear();
  const [anioFiltro, setAnioFiltro] = useState(anioActual);
  const [catalogo, setCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(true);
  /** Sede física (campus): San Martín, Los Olivos, etc. Por defecto id 1. */
  const [sedeId, setSedeId] = useState(SEDE_ID_DEFAULT);

  const [alumnoYaExiste, setAlumnoYaExiste] = useState(false);

  const [alumno, setAlumno] = useState({
    nro_documento: '',
    apellido_paterno: '',
    apellido_materno: '',
    nombres: '',
    sexo: 0,
    fecha_nacimiento: '2015-01-01',
    email: '',
    domicilio: '',
  });

  const [apoderados, setApoderados] = useState([emptyApoderado()]);

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
  const [registrarPagoMat, setRegistrarPagoMat] = useState(true);
  const [sending, setSending] = useState(false);

  const niveles = catalogo?.niveles || [];
  const turnos = catalogo?.turnos || [];
  const costosGeneral = useMemo(() => {
    const list = catalogo?.costos || [];
    return list.filter((c) => String(c.tipo || '').toUpperCase().trim() === 'GENERAL');
  }, [catalogo?.costos]);

  const nivelSeleccionado = useMemo(() => niveles.find((n) => String(n.id) === String(nivelId)), [niveles, nivelId]);
  const opcionesGrado = useMemo(() => gradosParaNivel(nivelSeleccionado?.nombre), [nivelSeleccionado]);

  const colegioEfectivo = useMemo(() => String(COLEGIO_ID_DEFAULT), []);

  useEffect(() => {
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
    loadCatalogo();
  }, [loadCatalogo]);

  /** Ajustar sede si el catálogo no incluye el id actual (por defecto se prefiere id 1). */
  useEffect(() => {
    const list = catalogo?.sedes;
    if (!list?.length) return;
    const ids = new Set(list.map((s) => String(s.id)));
    if (!ids.has(String(sedeId))) {
      const next = ids.has(SEDE_ID_DEFAULT) ? SEDE_ID_DEFAULT : String(list[0].id);
      setSedeId(next);
    }
  }, [catalogo?.sedes, sedeId]);

  const verificarDniAlumnoBlur = async () => {
    const dni = String(alumno.nro_documento || '').trim();
    if (!dni || dni.length < 4) {
      setAlumnoYaExiste(false);
      return;
    }
    if (!colegioEfectivo) return;
    try {
      const { data } = await api.get('/admin/usuarios/alumnos/por-dni', {
        params: { dni, ...(colegioEfectivo ? { colegio_id: colegioEfectivo } : {}) },
      });
      if (data.encontrado && data.alumno) {
        setAlumnoYaExiste(true);
        Swal.fire({
          icon: 'warning',
          title: 'DNI ya registrado',
          text: 'Este código de alumno ya existe. Búsquelo en Alumnos y use «Registrar nueva matrícula» desde el historial de matrículas.',
        });
      } else {
        setAlumnoYaExiste(false);
      }
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || e.message });
    }
  };

  const buscarApoderadoBlur = async (idx) => {
    const row = apoderados[idx];
    const dni = String(row.nro_documento || '').trim();
    if (!dni || dni.length < 4) return;
    if (!colegioEfectivo) return;
    try {
      const { data } = await api.get('/admin/usuarios/apoderados/por-dni', {
        params: { dni, ...(colegioEfectivo ? { colegio_id: colegioEfectivo } : {}) },
      });
      const next = [...apoderados];
      if (data.encontrado && data.apoderado) {
        const ap = data.apoderado;
        next[idx] = {
          ...next[idx],
          nro_documento: ap.nro_documento || dni,
          nombres: ap.nombres || '',
          apellido_paterno: ap.apellido_paterno || '',
          apellido_materno: ap.apellido_materno || '',
          email: ap.email || '',
          telefono_celular: ap.telefono_celular || '',
          fecha_nacimiento: (ap.fecha_nacimiento || '1980-01-01').toString().slice(0, 10),
          parentesco:
            parseInt(ap.parentesco, 10) >= 1 && parseInt(ap.parentesco, 10) <= 4 ? parseInt(ap.parentesco, 10) : next[idx].parentesco,
        };
      }
      setApoderados(next);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || e.message });
    }
  };

  const addApoderado = () => setApoderados((a) => [...a, emptyApoderado()]);

  const removeApoderado = (idx) => {
    if (apoderados.length <= 1) return;
    setApoderados((a) => a.filter((_, i) => i !== idx));
  };

  const updateApoderado = (idx, field, value) => {
    setApoderados((rows) => {
      const next = [...rows];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const copiarTarifaAlModoPersonalizado = () => {
    const c =
      costosGeneral.find((x) => String(x.id) === String(costoId)) || costosGeneral.find((x) => String(x.tipo || '').toUpperCase() === 'GENERAL') || costosGeneral[0];
    if (!c) {
      Swal.fire({ icon: 'info', text: 'No hay tarifas GENERAL en el catálogo para copiar.' });
      return;
    }
    setPersMatricula(String(c.matricula ?? ''));
    setPersPension(String(c.pension ?? ''));
    setCostoModo('personalizado');
  };

  const camposBloqueados = alumnoYaExiste || loadingCat;

  const enviar = async (e) => {
    e.preventDefault();
    if (alumnoYaExiste) {
      Swal.fire({ icon: 'warning', text: 'No puede inscribir un DNI que ya existe como alumno.' });
      return;
    }
    const cid = COLEGIO_ID_DEFAULT;
    const sidMat = parseInt(sedeId, 10);
    if (!Number.isFinite(sidMat) || sidMat <= 0) {
      Swal.fire({ icon: 'warning', text: 'Seleccione la sede (campus: San Martín, Los Olivos, etc.).' });
      return;
    }
    const dni = String(alumno.nro_documento || '').trim();
    if (!dni || !alumno.apellido_paterno.trim() || !alumno.nombres.trim()) {
      Swal.fire({ icon: 'warning', text: 'Complete DNI, apellido paterno y nombres del alumno.' });
      return;
    }
    if (!nivelId || !String(seccion || '').trim() || !turnoId) {
      Swal.fire({ icon: 'warning', text: 'Complete nivel, grado, sección y turno.' });
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
    const aps = apoderados.filter((r) => String(r.nro_documento || '').trim());
    if (!aps.length) {
      Swal.fire({ icon: 'warning', text: 'Agregue al menos un apoderado con DNI.' });
      return;
    }

    setSending(true);
    try {
      const fechaHoy = new Date().toISOString().slice(0, 10);
      const body = {
        colegio_id: cid,
        alumno: {
          nro_documento: dni,
          apellido_paterno: alumno.apellido_paterno.trim(),
          apellido_materno: alumno.apellido_materno.trim(),
          nombres: alumno.nombres.trim(),
          sexo: parseInt(alumno.sexo, 10) || 0,
          fecha_nacimiento: alumno.fecha_nacimiento,
          email: alumno.email.trim(),
          domicilio: alumno.domicilio.trim(),
          fecha_inscripcion: fechaHoy,
        },
        ubicacion_grupo: {
          nivel_id: parseInt(nivelId, 10),
          grado: parseInt(grado, 10),
          seccion: String(seccion || '').trim(),
          turno_id: parseInt(turnoId, 10),
          anio: anioFiltro,
          sede_id: sidMat,
        },
        apoderados: aps.map((r) => ({
          nro_documento: String(r.nro_documento).trim(),
          parentesco: parseInt(r.parentesco, 10) || 1,
          nombres: r.nombres,
          apellido_paterno: r.apellido_paterno,
          apellido_materno: r.apellido_materno,
          fecha_nacimiento: r.fecha_nacimiento,
          email: r.email,
          telefono_celular: r.telefono_celular,
        })),
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
        fecha_registro: fechaHoy,
        modalidad,
        registrar_linea_pago_matricula: registrarPagoMat,
      };

      const { data } = await api.post('/admin/usuarios/inscripcion-matricula', body);
      await Swal.fire({
        icon: 'success',
        title: 'Inscripción registrada',
        html: `<p>${data.mensaje || 'OK'}</p><p class="swal2-small">Alumno #${data.alumno_id} · Matrícula #${data.matricula_id}</p>`,
        confirmButtonText: 'Ir a Alumnos',
      });
      navigate('/admin/usuarios/alumnos');
    } catch (err) {
      const data = err.response?.data;
      const codigo = data?.codigo;
      if (codigo === 'ALUMNO_YA_EXISTE') {
        Swal.fire({ icon: 'info', title: 'No se puede continuar aquí', text: data?.error || 'El DNI ya está registrado.' });
        setAlumnoYaExiste(true);
      } else if (err.response?.status === 409 && codigo === 'MATRICULA_DUPLICADA_ANIO') {
        Swal.fire({
          icon: 'info',
          title: 'Matrícula no registrada',
          text: data?.error || 'Este alumno ya tiene matrícula en ese año académico.',
        });
      } else {
        Swal.fire({ icon: 'error', title: 'No se pudo completar', text: data?.error || err.message });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-mat-page">
      <header className="admin-mat-hero">
        <div className="admin-mat-hero-intro">
          <p className="admin-mat-kicker">Administración · Inscripciones</p>
          <h1 className="admin-mat-title">Inscripción de alumno nuevo</h1>
          <p className="admin-mat-sub">
            Solo para estudiantes que aún no existen en el sistema. Si el DNI ya está registrado, use Alumnos → historial → «Registrar nueva matrícula». Se generan pensiones
            pendientes y, si lo indica, la línea de matrícula.
          </p>
        </div>
        <aside className="admin-mat-context-card" aria-label="Año académico">
          <div className="admin-mat-context-card__head">
            <span className="admin-mat-context-icon" aria-hidden="true" />
            <div>
              <strong className="admin-mat-context-title">Año lectivo</strong>
              <p className="admin-mat-context-desc">Nivel, grado, sección y turno aplican a este año.</p>
            </div>
          </div>
          <div className="admin-mat-context-card__row">
            <label className="admin-mat-field-compact">
              <span>Año académico</span>
              <input
                type="number"
                className="admin-mat-input admin-mat-input--year"
                value={anioFiltro}
                onChange={(e) => setAnioFiltro(parseInt(e.target.value, 10) || anioActual)}
                min={2000}
                max={2100}
              />
            </label>
            <button type="button" className="admin-mat-btn admin-mat-btn--context" onClick={loadCatalogo} disabled={loadingCat}>
              {loadingCat ? (
                <>
                  <span className="admin-mat-spinner" aria-hidden="true" />
                  Cargando…
                </>
              ) : (
                'Actualizar catálogo'
              )}
            </button>
          </div>
        </aside>
      </header>

      <form onSubmit={enviar} className="admin-mat-form">
        {alumnoYaExiste && (
          <div className="admin-mat-alert admin-mat-alert--danger">
            Este DNI ya corresponde a un alumno del colegio. No puede usar este formulario: vaya a <strong>Alumnos</strong>, busque al estudiante y use{' '}
            <strong>Registrar nueva matrícula</strong> desde el historial.
          </div>
        )}

        <section className="admin-mat-card admin-mat-card--alumno">
          <div className="admin-mat-card-head">
            <div className="admin-mat-card-head-main">
              <span className="admin-mat-badge admin-mat-badge--alumno">1</span>
              <div>
                <h2 className="admin-mat-card-title">Datos del alumno</h2>
                <p className="admin-mat-card-hint">Escriba el DNI; al salir del campo se verifica si ya existe. El acceso al aula usará el DNI como código inicial.</p>
              </div>
            </div>
          </div>
          <div className="admin-mat-grid">
            <div className="admin-mat-field">
              <label>DNI (código) *</label>
              <input
                className="admin-mat-input"
                value={alumno.nro_documento}
                onChange={(e) => {
                  setAlumnoYaExiste(false);
                  setAlumno((p) => ({ ...p, nro_documento: e.target.value }));
                }}
                onBlur={verificarDniAlumnoBlur}
                placeholder="Número de documento"
                disabled={loadingCat}
                autoComplete="off"
              />
            </div>
            <div className="admin-mat-field">
              <label>Apellido paterno *</label>
              <input
                className="admin-mat-input"
                required
                value={alumno.apellido_paterno}
                onChange={(e) => setAlumno((p) => ({ ...p, apellido_paterno: e.target.value }))}
                disabled={camposBloqueados}
              />
            </div>
            <div className="admin-mat-field">
              <label>Apellido materno</label>
              <input
                className="admin-mat-input"
                value={alumno.apellido_materno}
                onChange={(e) => setAlumno((p) => ({ ...p, apellido_materno: e.target.value }))}
                disabled={camposBloqueados}
              />
            </div>
            <div className="admin-mat-field">
              <label>Nombres *</label>
              <input
                className="admin-mat-input"
                required
                value={alumno.nombres}
                onChange={(e) => setAlumno((p) => ({ ...p, nombres: e.target.value }))}
                disabled={camposBloqueados}
              />
            </div>
            <div className="admin-mat-field">
              <label>Sexo</label>
              <select
                className="admin-mat-input"
                value={alumno.sexo}
                onChange={(e) => setAlumno((p) => ({ ...p, sexo: parseInt(e.target.value, 10) }))}
                disabled={camposBloqueados}
              >
                <option value={0}>—</option>
                <option value={1}>Femenino</option>
                <option value={2}>Masculino</option>
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Fecha de nacimiento</label>
              <input
                type="date"
                className="admin-mat-input"
                value={alumno.fecha_nacimiento}
                onChange={(e) => setAlumno((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                disabled={camposBloqueados}
              />
            </div>
            <div className="admin-mat-row-2 admin-mat-row-2--equal">
              <div className="admin-mat-field">
                <label>Correo</label>
                <input
                  type="email"
                  className="admin-mat-input"
                  value={alumno.email}
                  onChange={(e) => setAlumno((p) => ({ ...p, email: e.target.value }))}
                  disabled={camposBloqueados}
                />
              </div>
              <div className="admin-mat-field">
                <label>Domicilio</label>
                <input
                  className="admin-mat-input"
                  value={alumno.domicilio}
                  onChange={(e) => setAlumno((p) => ({ ...p, domicilio: e.target.value }))}
                  disabled={camposBloqueados}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="admin-mat-card admin-mat-card--apoderados">
          <div className="admin-mat-card-head admin-mat-card-head--with-action">
            <div className="admin-mat-card-head-main">
              <span className="admin-mat-badge admin-mat-badge--apoderados">2</span>
              <div>
                <h2 className="admin-mat-card-title">Apoderados</h2>
                <p className="admin-mat-card-hint">Al salir del DNI se cargan los datos si el apoderado ya existe; si no, complételos para crear la ficha.</p>
              </div>
            </div>
            <button type="button" className="admin-mat-btn admin-mat-btn--secondary" onClick={addApoderado} disabled={camposBloqueados}>
              + Agregar apoderado
            </button>
          </div>

          {apoderados.map((row, idx) => (
            <div key={idx} className="admin-mat-apoderado-block">
              <div className="admin-mat-apoderado-head">
                <strong>Apoderado {idx + 1}</strong>
                {apoderados.length > 1 && (
                  <button
                    type="button"
                    className="admin-mat-btn admin-mat-btn--ghost admin-mat-btn--danger-text"
                    onClick={() => removeApoderado(idx)}
                    disabled={camposBloqueados}
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="admin-mat-row-2 admin-mat-row-2--equal">
                <div className="admin-mat-field">
                  <label>DNI</label>
                  <input
                    className="admin-mat-input"
                    value={row.nro_documento}
                    onChange={(e) => updateApoderado(idx, 'nro_documento', e.target.value)}
                    onBlur={() => buscarApoderadoBlur(idx)}
                    placeholder="DNI"
                    disabled={camposBloqueados}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Parentesco</label>
                  <select
                    className="admin-mat-input"
                    value={row.parentesco}
                    onChange={(e) => updateApoderado(idx, 'parentesco', parseInt(e.target.value, 10))}
                    disabled={camposBloqueados}
                  >
                    {PARENTESCO.map((p) => (
                      <option key={p.v} value={p.v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-mat-row-3">
                <div className="admin-mat-field">
                  <label>Nombres</label>
                  <input
                    className="admin-mat-input"
                    value={row.nombres}
                    onChange={(e) => updateApoderado(idx, 'nombres', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Apellido paterno</label>
                  <input
                    className="admin-mat-input"
                    value={row.apellido_paterno}
                    onChange={(e) => updateApoderado(idx, 'apellido_paterno', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Apellido materno</label>
                  <input
                    className="admin-mat-input"
                    value={row.apellido_materno}
                    onChange={(e) => updateApoderado(idx, 'apellido_materno', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
              </div>
              <div className="admin-mat-row-3">
                <div className="admin-mat-field">
                  <label>Fecha nac.</label>
                  <input
                    type="date"
                    className="admin-mat-input"
                    value={row.fecha_nacimiento?.slice(0, 10) || '1980-01-01'}
                    onChange={(e) => updateApoderado(idx, 'fecha_nacimiento', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Correo</label>
                  <input
                    type="email"
                    className="admin-mat-input"
                    value={row.email}
                    onChange={(e) => updateApoderado(idx, 'email', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Teléfono</label>
                  <input
                    className="admin-mat-input"
                    value={row.telefono_celular}
                    onChange={(e) => updateApoderado(idx, 'telefono_celular', e.target.value)}
                    disabled={camposBloqueados}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="admin-mat-card admin-mat-card--academico">
          <div className="admin-mat-card-head admin-mat-card-head--academico">
            <div className="admin-mat-card-head-main">
              <span className="admin-mat-badge admin-mat-badge--academico">3</span>
              <div>
                <h2 className="admin-mat-card-title">Matrícula académica</h2>
                <p className="admin-mat-card-hint">
                  Año {anioFiltro}. Elija la sede (campus); el grupo se crea en esa sede. Si el aula no existía, se crea sin tutor (asigne tutor después en administración de grupos).
                </p>
              </div>
            </div>
            <div className="admin-mat-sede-en-cabecera">
              <label htmlFor="admin-mat-sede">Sede (campus)</label>
              <select
                id="admin-mat-sede"
                className="admin-mat-input"
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                disabled={loadingCat || !(catalogo?.sedes || []).length}
                aria-label="Sede o campus físico"
              >
                {(catalogo?.sedes || []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-mat-row-3 admin-mat-row-3--matricula-superior">
            <div className="admin-mat-field">
              <label>Nivel</label>
              <select
                className="admin-mat-input"
                value={nivelId}
                onChange={(e) => setNivelId(e.target.value)}
                disabled={loadingCat || !niveles.length || camposBloqueados}
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
              <select className="admin-mat-input" value={grado} onChange={(e) => setGrado(e.target.value)} disabled={camposBloqueados} required>
                {opcionesGrado.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Sección</label>
              <select className="admin-mat-input" value={seccion} onChange={(e) => setSeccion(e.target.value)} disabled={camposBloqueados} required>
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
                disabled={loadingCat || !turnos.length || camposBloqueados}
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
              <select className="admin-mat-input" value={estadoMat} onChange={(e) => setEstadoMat(parseInt(e.target.value, 10))} disabled={camposBloqueados}>
                {ESTADOS_MAT.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Modalidad</label>
              <select className="admin-mat-input" value={modalidad} onChange={(e) => setModalidad(e.target.value)} disabled={camposBloqueados}>
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
              disabled={camposBloqueados}
            >
              Montos personalizados
            </button>
            <button
              type="button"
              className={`admin-mat-costo-modo-btn ${costoModo === 'tarifario' ? 'is-active' : ''}`}
              onClick={() => setCostoModo('tarifario')}
              disabled={camposBloqueados}
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
                    placeholder="0.00"
                    disabled={camposBloqueados}
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
                    disabled={camposBloqueados}
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
                    placeholder="0"
                    disabled={camposBloqueados}
                  />
                </div>
              </div>
              <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={copiarTarifaAlModoPersonalizado} disabled={camposBloqueados}>
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
                  disabled={!costosGeneral.length || camposBloqueados}
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
            <input type="checkbox" checked={registrarPagoMat} onChange={(e) => setRegistrarPagoMat(e.target.checked)} disabled={camposBloqueados} />
            Registrar línea de pago de matrícula (monto según costo; aparece en «Ver pagos» como pendiente)
          </label>
          {catalogo?.colegio_pensiones && (
            <p className="admin-mat-mini">
              Pensión mensual: {catalogo.colegio_pensiones.total_pensiones} cuotas · inicio índice {catalogo.colegio_pensiones.inicio_pensiones}
            </p>
          )}
        </section>

        <div className="admin-mat-actions-bar">
          <p className="admin-mat-actions-hint">Revise los datos antes de confirmar; la matrícula y los pagos pendientes se crean en un solo paso.</p>
          <div className="admin-mat-actions">
            <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={() => navigate('/admin/dashboard')}>
              Cancelar
            </button>
            <button type="submit" className="admin-mat-btn admin-mat-btn--primary admin-mat-btn--lg" disabled={sending || loadingCat || alumnoYaExiste}>
              {sending ? 'Guardando…' : 'Registrar inscripción'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
