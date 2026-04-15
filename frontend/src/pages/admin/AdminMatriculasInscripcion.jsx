import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminMatriculas.css';

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

const emptyApoderado = () => ({
  nro_documento: '',
  parentesco: 1,
  crear_si_no_existe: true,
  nombres: '',
  apellido_paterno: '',
  apellido_materno: '',
  fecha_nacimiento: '1980-01-01',
  email: '',
  telefono_celular: '',
  _cargado: false,
});

export default function AdminMatriculasInscripcion() {
  const navigate = useNavigate();
  const anioActual = new Date().getFullYear();
  const [anioFiltro, setAnioFiltro] = useState(anioActual);
  const [catalogo, setCatalogo] = useState(null);
  const [loadingCat, setLoadingCat] = useState(true);

  const [buscarDni, setBuscarDni] = useState('');
  const [alumnoExistente, setAlumnoExistente] = useState(null);
  const [esNuevo, setEsNuevo] = useState(true);

  const [alumno, setAlumno] = useState({
    nro_documento: '',
    apellido_paterno: '',
    apellido_materno: '',
    nombres: '',
    sexo: 0,
    fecha_nacimiento: '2015-01-01',
    email: '',
    domicilio: '',
    fecha_inscripcion: new Date().toISOString().slice(0, 10),
  });

  const [apoderados, setApoderados] = useState([emptyApoderado()]);

  const [grupoId, setGrupoId] = useState('');
  /** personalizado (por defecto) | tarifario */
  const [costoModo, setCostoModo] = useState('personalizado');
  const [costoId, setCostoId] = useState('');
  const [persMatricula, setPersMatricula] = useState('');
  const [persPension, setPersPension] = useState('');
  const [persAgenda, setPersAgenda] = useState('');
  const [estadoMat, setEstadoMat] = useState(0);
  const [modalidad, setModalidad] = useState('PRESENCIAL');
  const [fechaRegistro, setFechaRegistro] = useState(new Date().toISOString().slice(0, 10));
  const [registrarPagoMat, setRegistrarPagoMat] = useState(true);
  const [sending, setSending] = useState(false);

  const loadCatalogo = useCallback(async () => {
    setLoadingCat(true);
    try {
      const { data } = await api.get('/admin/usuarios/inscripcion-matricula/catalogo', {
        params: { anio: anioFiltro },
      });
      setCatalogo(data);
      if (data.grupos?.length) {
        setGrupoId(String(data.grupos[0].id));
      } else {
        setGrupoId('');
      }
      if (data.costos?.length) {
        const gen = data.costos.find((c) => String(c.tipo || '').toUpperCase() === 'GENERAL') || data.costos[0];
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
  }, [anioFiltro]);

  useEffect(() => {
    loadCatalogo();
  }, [loadCatalogo]);

  const buscarAlumnoPorDni = async () => {
    const dni = String(buscarDni || alumno.nro_documento || '').trim();
    if (!dni || dni.length < 4) {
      Swal.fire({ icon: 'info', text: 'Ingrese el DNI del alumno (código igual al DNI).' });
      return;
    }
    try {
      const { data } = await api.get('/admin/usuarios/alumnos/por-dni', { params: { dni } });
      if (data.encontrado && data.alumno) {
        setAlumnoExistente(data.alumno);
        setEsNuevo(false);
        setAlumno((prev) => ({
          ...prev,
          nro_documento: data.alumno.nro_documento || dni,
          apellido_paterno: data.alumno.apellido_paterno || '',
          apellido_materno: data.alumno.apellido_materno || '',
          nombres: data.alumno.nombres || '',
          fecha_nacimiento: (data.alumno.fecha_nacimiento || '2015-01-01').toString().slice(0, 10),
          email: data.alumno.email || '',
        }));
        Swal.fire({ icon: 'success', title: 'Alumno encontrado', text: 'Revise los datos y continúe con apoderados.', timer: 2200, showConfirmButton: false });
      } else {
        setAlumnoExistente(null);
        setEsNuevo(true);
        setAlumno((prev) => ({
          ...prev,
          nro_documento: dni,
        }));
        Swal.fire({
          icon: 'info',
          title: 'No registrado',
          text: 'No hay alumno con ese DNI. Complete los datos como alumno nuevo.',
        });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || e.message });
    }
  };

  const buscarApoderadoIdx = async (idx) => {
    const row = apoderados[idx];
    const dni = String(row.nro_documento || '').trim();
    if (!dni || dni.length < 4) return;
    try {
      const { data } = await api.get('/admin/usuarios/apoderados/por-dni', { params: { dni } });
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
          parentesco: parseInt(ap.parentesco, 10) >= 1 && parseInt(ap.parentesco, 10) <= 4 ? parseInt(ap.parentesco, 10) : next[idx].parentesco,
          crear_si_no_existe: false,
          _cargado: true,
        };
      } else {
        next[idx] = { ...next[idx], crear_si_no_existe: true, _cargado: true };
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
    const list = catalogo?.costos || [];
    const c =
      list.find((x) => String(x.id) === String(costoId)) ||
      list.find((x) => String(x.tipo || '').toUpperCase() === 'GENERAL') ||
      list[0];
    if (!c) {
      Swal.fire({ icon: 'info', text: 'No hay tarifas en el catálogo para copiar.' });
      return;
    }
    setPersMatricula(String(c.matricula ?? ''));
    setPersPension(String(c.pension ?? ''));
    setCostoModo('personalizado');
  };

  const enviar = async (e) => {
    e.preventDefault();
    const dni = String(alumno.nro_documento || '').trim();
    if (!dni || !alumno.apellido_paterno.trim() || !alumno.nombres.trim()) {
      Swal.fire({ icon: 'warning', text: 'Complete DNI, apellido paterno y nombres del alumno.' });
      return;
    }
    if (!grupoId) {
      Swal.fire({ icon: 'warning', text: 'Seleccione el grupo.' });
      return;
    }
    if (costoModo === 'tarifario') {
      if (!costoId) {
        Swal.fire({ icon: 'warning', text: 'Seleccione una tarifa del colegio o cambie a montos personalizados.' });
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
      const body = {
        alumno: {
          es_nuevo: esNuevo,
          id: esNuevo ? undefined : alumnoExistente?.id,
          nro_documento: dni,
          apellido_paterno: alumno.apellido_paterno.trim(),
          apellido_materno: alumno.apellido_materno.trim(),
          nombres: alumno.nombres.trim(),
          sexo: parseInt(alumno.sexo, 10) || 0,
          fecha_nacimiento: alumno.fecha_nacimiento,
          email: alumno.email.trim(),
          domicilio: alumno.domicilio.trim(),
          fecha_inscripcion: alumno.fecha_inscripcion,
        },
        apoderados: aps.map((r) => ({
          nro_documento: String(r.nro_documento).trim(),
          parentesco: parseInt(r.parentesco, 10) || 1,
          crear_si_no_existe: !!r.crear_si_no_existe,
          nombres: r.nombres,
          apellido_paterno: r.apellido_paterno,
          apellido_materno: r.apellido_materno,
          fecha_nacimiento: r.fecha_nacimiento,
          email: r.email,
          telefono_celular: r.telefono_celular,
        })),
        grupo_id: parseInt(grupoId, 10),
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
      Swal.fire({ icon: 'error', title: 'No se pudo completar', text: err.response?.data?.error || err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-mat-page">
      <header className="admin-mat-hero">
        <div>
          <h1 className="admin-mat-title">Nueva inscripción / matrícula</h1>
          <p className="admin-mat-sub">
            Busque por DNI o registre alumno nuevo. Vincule apoderados, grupo y costos (prioridad a montos personalizados;
            opcionalmente tarifa del colegio). Se generan las pensiones del año en pendiente y, si marca, la línea de matrícula.
          </p>
        </div>
        <div className="admin-mat-hero-tools">
          <label className="admin-mat-inline-label">
            Año académico
            <input
              type="number"
              className="admin-mat-input admin-mat-input--sm"
              value={anioFiltro}
              onChange={(e) => setAnioFiltro(parseInt(e.target.value, 10) || anioActual)}
              min={2000}
              max={2100}
            />
          </label>
          <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={loadCatalogo} disabled={loadingCat}>
            {loadingCat ? 'Cargando…' : 'Actualizar grupos'}
          </button>
        </div>
      </header>

      <form onSubmit={enviar} className="admin-mat-form">
        <section className="admin-mat-card admin-mat-card--alumno">
          <div className="admin-mat-card-head">
            <span className="admin-mat-badge admin-mat-badge--alumno">1</span>
            <div>
              <h2 className="admin-mat-card-title">Datos del alumno</h2>
              <p className="admin-mat-card-hint">El código de acceso coincide con el DNI. Busque antes de duplicar.</p>
            </div>
          </div>
          <div className="admin-mat-grid">
            <div className="admin-mat-field admin-mat-field--span2">
              <label>DNI (código)</label>
              <div className="admin-mat-row">
                <input
                  className="admin-mat-input"
                  value={buscarDni || alumno.nro_documento}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBuscarDni(v);
                    setAlumno((p) => ({ ...p, nro_documento: v }));
                  }}
                  placeholder="Número de documento"
                  disabled={!esNuevo && !!alumnoExistente}
                />
                <button type="button" className="admin-mat-btn admin-mat-btn--primary" onClick={buscarAlumnoPorDni}>
                  Buscar
                </button>
              </div>
            </div>
            <div className="admin-mat-field">
              <label>Apellido paterno *</label>
              <input
                className="admin-mat-input"
                required
                value={alumno.apellido_paterno}
                onChange={(e) => setAlumno((p) => ({ ...p, apellido_paterno: e.target.value }))}
              />
            </div>
            <div className="admin-mat-field">
              <label>Apellido materno</label>
              <input
                className="admin-mat-input"
                value={alumno.apellido_materno}
                onChange={(e) => setAlumno((p) => ({ ...p, apellido_materno: e.target.value }))}
              />
            </div>
            <div className="admin-mat-field">
              <label>Nombres *</label>
              <input
                className="admin-mat-input"
                required
                value={alumno.nombres}
                onChange={(e) => setAlumno((p) => ({ ...p, nombres: e.target.value }))}
              />
            </div>
            <div className="admin-mat-field">
              <label>Sexo</label>
              <select className="admin-mat-input" value={alumno.sexo} onChange={(e) => setAlumno((p) => ({ ...p, sexo: parseInt(e.target.value, 10) }))}>
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
              />
            </div>
            <div className="admin-mat-field">
              <label>Correo</label>
              <input
                type="email"
                className="admin-mat-input"
                value={alumno.email}
                onChange={(e) => setAlumno((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="admin-mat-field admin-mat-field--span2">
              <label>Domicilio</label>
              <input
                className="admin-mat-input"
                value={alumno.domicilio}
                onChange={(e) => setAlumno((p) => ({ ...p, domicilio: e.target.value }))}
              />
            </div>
            <div className="admin-mat-field">
              <label>Fecha de inscripción</label>
              <input
                type="date"
                className="admin-mat-input"
                value={alumno.fecha_inscripcion}
                onChange={(e) => setAlumno((p) => ({ ...p, fecha_inscripcion: e.target.value }))}
              />
            </div>
            {alumnoExistente && (
              <div className="admin-mat-banner admin-mat-banner--ok">
                Alumno existente #{alumnoExistente.id}: los datos se actualizarán al guardar.
              </div>
            )}
          </div>
        </section>

        <section className="admin-mat-card admin-mat-card--apoderados">
          <div className="admin-mat-card-head">
            <span className="admin-mat-badge admin-mat-badge--apoderados">2</span>
            <div>
              <h2 className="admin-mat-card-title">Apoderados</h2>
              <p className="admin-mat-card-hint">Busque por DNI para cargar datos o marque «crear nuevo» si no existe.</p>
            </div>
            <button type="button" className="admin-mat-btn admin-mat-btn--secondary admin-mat-btn--ml" onClick={addApoderado}>
              + Agregar apoderado
            </button>
          </div>

          {apoderados.map((row, idx) => (
            <div key={idx} className="admin-mat-apoderado-block">
              <div className="admin-mat-apoderado-head">
                <strong>Apoderado {idx + 1}</strong>
                {apoderados.length > 1 && (
                  <button type="button" className="admin-mat-btn admin-mat-btn--ghost admin-mat-btn--danger-text" onClick={() => removeApoderado(idx)}>
                    Quitar
                  </button>
                )}
              </div>
              <div className="admin-mat-grid">
                <div className="admin-mat-field admin-mat-field--span2">
                  <label>DNI</label>
                  <div className="admin-mat-row">
                    <input
                      className="admin-mat-input"
                      value={row.nro_documento}
                      onChange={(e) => updateApoderado(idx, 'nro_documento', e.target.value)}
                      placeholder="DNI del apoderado"
                    />
                    <button type="button" className="admin-mat-btn admin-mat-btn--secondary" onClick={() => buscarApoderadoIdx(idx)}>
                      Buscar
                    </button>
                  </div>
                </div>
                <div className="admin-mat-field">
                  <label>Parentesco</label>
                  <select
                    className="admin-mat-input"
                    value={row.parentesco}
                    onChange={(e) => updateApoderado(idx, 'parentesco', parseInt(e.target.value, 10))}
                  >
                    {PARENTESCO.map((p) => (
                      <option key={p.v} value={p.v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-mat-field admin-mat-check">
                  <label className="admin-mat-checkbox">
                    <input
                      type="checkbox"
                      checked={row.crear_si_no_existe}
                      onChange={(e) => updateApoderado(idx, 'crear_si_no_existe', e.target.checked)}
                    />
                    Crear ficha nueva si no existe en el colegio
                  </label>
                </div>
                <div className="admin-mat-field">
                  <label>Nombres</label>
                  <input className="admin-mat-input" value={row.nombres} onChange={(e) => updateApoderado(idx, 'nombres', e.target.value)} />
                </div>
                <div className="admin-mat-field">
                  <label>Apellido paterno</label>
                  <input
                    className="admin-mat-input"
                    value={row.apellido_paterno}
                    onChange={(e) => updateApoderado(idx, 'apellido_paterno', e.target.value)}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Apellido materno</label>
                  <input
                    className="admin-mat-input"
                    value={row.apellido_materno}
                    onChange={(e) => updateApoderado(idx, 'apellido_materno', e.target.value)}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Fecha nac.</label>
                  <input
                    type="date"
                    className="admin-mat-input"
                    value={row.fecha_nacimiento?.slice(0, 10) || '1980-01-01'}
                    onChange={(e) => updateApoderado(idx, 'fecha_nacimiento', e.target.value)}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Correo</label>
                  <input
                    type="email"
                    className="admin-mat-input"
                    value={row.email}
                    onChange={(e) => updateApoderado(idx, 'email', e.target.value)}
                  />
                </div>
                <div className="admin-mat-field">
                  <label>Teléfono</label>
                  <input
                    className="admin-mat-input"
                    value={row.telefono_celular}
                    onChange={(e) => updateApoderado(idx, 'telefono_celular', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="admin-mat-card admin-mat-card--academico">
          <div className="admin-mat-card-head">
            <span className="admin-mat-badge admin-mat-badge--academico">3</span>
            <div>
              <h2 className="admin-mat-card-title">Matrícula académica</h2>
              <p className="admin-mat-card-hint">Grupo según año {anioFiltro}, estado y modalidad.</p>
            </div>
          </div>
          <div className="admin-mat-grid">
            <div className="admin-mat-field admin-mat-field--span2">
              <label>Grupo (nivel · grado · sección · turno)</label>
              <select className="admin-mat-input" required value={grupoId} onChange={(e) => setGrupoId(e.target.value)} disabled={loadingCat || !catalogo?.grupos?.length}>
                <option value="">— Seleccione —</option>
                {(catalogo?.grupos || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {(g.nivel_nombre || '—').toUpperCase()} · {g.grado}° {g.seccion} · {g.turno_nombre || '—'} · {g.anio}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Estado</label>
              <select className="admin-mat-input" value={estadoMat} onChange={(e) => setEstadoMat(parseInt(e.target.value, 10))}>
                {ESTADOS_MAT.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Modalidad</label>
              <select className="admin-mat-input" value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
                {MODALIDADES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-mat-field">
              <label>Fecha de registro matrícula</label>
              <input type="date" className="admin-mat-input" value={fechaRegistro} onChange={(e) => setFechaRegistro(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="admin-mat-card admin-mat-card--costos">
          <div className="admin-mat-card-head">
            <span className="admin-mat-badge admin-mat-badge--costos">4</span>
            <div>
              <h2 className="admin-mat-card-title">Costos y tarifas</h2>
              <p className="admin-mat-card-hint">
                Por defecto use <strong>montos personalizados</strong> (se guarda un costo tipo PERSONAL en el colegio, como el sistema anterior). Si prefiere una tarifa ya
                cargada, elija «Tarifa del colegio».
              </p>
            </div>
          </div>

          <div className="admin-mat-costo-modo" role="radiogroup" aria-label="Tipo de costo">
            <button
              type="button"
              className={`admin-mat-costo-modo-btn ${costoModo === 'personalizado' ? 'is-active' : ''}`}
              onClick={() => setCostoModo('personalizado')}
            >
              Montos personalizados
            </button>
            <button
              type="button"
              className={`admin-mat-costo-modo-btn ${costoModo === 'tarifario' ? 'is-active' : ''}`}
              onClick={() => setCostoModo('tarifario')}
            >
              Tarifa del colegio (predeterminada)
            </button>
          </div>

          {costoModo === 'personalizado' ? (
            <div className="admin-mat-grid">
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
                  placeholder="Monto por mes"
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
                  placeholder="Opcional"
                />
              </div>
              <div className="admin-mat-field admin-mat-field--span2">
                <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={copiarTarifaAlModoPersonalizado}>
                  Rellenar desde tarifa general del colegio (referencia; puede editar después)
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-mat-grid">
              <div className="admin-mat-field admin-mat-field--span2">
                <label>Tarifa del colegio</label>
                <select
                  className="admin-mat-input"
                  required={costoModo === 'tarifario'}
                  value={costoId}
                  onChange={(e) => setCostoId(e.target.value)}
                  disabled={!catalogo?.costos?.length}
                >
                  <option value="">— Seleccione —</option>
                  {(catalogo?.costos || []).map((c) => (
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
            <span className="admin-mat-badge admin-mat-badge--pagos">5</span>
            <div>
              <h2 className="admin-mat-card-title">Pagos generados</h2>
              <p className="admin-mat-card-hint">
                Se crearán todas las pensiones del año en <strong>PENDIENTE</strong>. Opcional: línea de pago de matrícula (también pendiente de cobro).
              </p>
            </div>
          </div>
          <label className="admin-mat-checkbox admin-mat-checkbox--lg">
            <input type="checkbox" checked={registrarPagoMat} onChange={(e) => setRegistrarPagoMat(e.target.checked)} />
            Registrar línea de pago de matrícula (monto según costo; aparece en «Ver pagos» como pendiente)
          </label>
          {catalogo?.colegio_pensiones && (
            <p className="admin-mat-mini">
              Pensión mensual: {catalogo.colegio_pensiones.total_pensiones} cuotas · inicio índice {catalogo.colegio_pensiones.inicio_pensiones}
            </p>
          )}
        </section>

        <div className="admin-mat-actions">
          <button type="button" className="admin-mat-btn admin-mat-btn--ghost" onClick={() => navigate('/admin/dashboard')}>
            Cancelar
          </button>
          <button type="submit" className="admin-mat-btn admin-mat-btn--primary admin-mat-btn--lg" disabled={sending || loadingCat}>
            {sending ? 'Guardando…' : 'Registrar inscripción'}
          </button>
        </div>
      </form>
    </div>
  );
}
