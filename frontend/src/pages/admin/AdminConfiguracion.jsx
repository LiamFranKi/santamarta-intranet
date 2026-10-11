import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModulos } from '../../context/ModulosContext';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import {
  REGLA_CONDUCTA_DEFAULT,
  normalizarReglaConducta,
  textoReglaCorta,
  ejemplosReglaBloque,
  CASILLEROS_CONDUCTA,
  LABELS_CASILLERO,
} from '../../utils/reglaConducta';
import { invalidarCacheLogo } from '../../utils/pdfReporteColegioLogo';
import { invalidarIdentidadColegio } from '../../utils/identidadColegio';
import AdminMascotaColegio from './AdminMascotaColegio';
import './AdminConfiguracion.css';

function ConfigTabIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  switch (name) {
    case 'general':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h5" />
        </svg>
      );
    case 'recaudo':
      return (
        <svg {...common}>
          <path d="M12 1v22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'anio':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'pagos':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case 'notas':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    case 'facturacion':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16l2-1 2 1 2-1 2 1 2-1 2 1V8z" />
          <path d="M14 2v6h6M8 13h6M8 17h4" />
        </svg>
      );
    case 'matricula':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'tutoria':
      return (
        <svg {...common}>
          <path d="M22 10L12 5 2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
        </svg>
      );
    case 'cajero':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case 'biblioteca':
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8M8 11h6" />
        </svg>
      );
    default:
      return null;
  }
}

const CONFIG_TABS = [
  {
    id: 'general',
    label: 'General',
    icon: 'general',
    tone: 'blue',
    helpTitle: 'Identidad del colegio',
    help: 'Nombre, código modular, resolución, texto del menú y logos. Guarde cada bloque con su propio botón.',
  },
  {
    id: 'recaudo',
    label: 'Recaudo',
    icon: 'recaudo',
    tone: 'amber',
    helpTitle: 'Datos de recaudo',
    help: 'Sucursal, cuenta y razón social usados en cobros. Guarde el bloque antes de cambiar de pestaña.',
  },
  {
    id: 'anio',
    label: 'Año académico',
    icon: 'anio',
    tone: 'teal',
    helpTitle: 'Año lectivo',
    help: 'Define el año activo del sistema y el de matrículas. Debajo puede configurar la estructura de temas del aula virtual. El reinicio de contraseñas es irreversible: usará el DNI.',
  },
  {
    id: 'pagos',
    label: 'Pagos',
    icon: 'pagos',
    tone: 'violet',
    helpTitle: 'Pensiones y vencimientos',
    help: 'Ciclo, cantidad de pensiones, moneda, bloqueo de deudores y fechas de vencimiento por mes.',
  },
  {
    id: 'notas',
    label: 'Notas',
    icon: 'notas',
    tone: 'sky',
    helpTitle: 'Evaluación',
    help: 'Ciclos de notas, conversión a letras (primaria) y rangos de apreciaciones para reportes.',
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    icon: 'facturacion',
    tone: 'indigo',
    helpTitle: 'Datos fiscales',
    help: 'RUC, razón social, dirección y enlace de consulta de comprobantes.',
  },
  {
    id: 'tutoria',
    label: 'Tutoría',
    icon: 'tutoria',
    tone: 'emerald',
    soloAdmin: true,
    helpTitle: 'Tutoría general',
    help: 'Personal con visión de todos los niveles en modo supervisión (solo lectura). No sustituye al tutor de aula.',
  },
  {
    id: 'cajero',
    label: 'Cajero',
    icon: 'cajero',
    tone: 'orange',
    soloAdmin: true,
    helpTitle: 'Caja chica',
    help: 'Lista de personal autorizado como cajero para registrar movimientos de caja chica.',
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    icon: 'biblioteca',
    tone: 'teal',
    soloAdmin: true,
    helpTitle: 'Función Biblioteca',
    help: 'Asigne personal que podrá dar de alta libros, prestar y cambiar estados. Admin y secretaría ya tienen este acceso.',
  },
];

/** Porcentajes de comisión: siempre 2 decimales (evita artefacto float 3.599999…). */
function formatComisionPct(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}

const QUILL_MODULES_MATRICULA = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

const QUILL_FORMATS_MATRICULA = [
  'header', 'bold', 'italic', 'underline', 'color', 'background',
  'list', 'bullet', 'align', 'link', 'image',
];

/** Texto plano legacy → HTML mínimo para Quill */
function ensureHtmlForQuill(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (/^<[a-z]/i.test(t)) return t;
  return `<p>${t.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
}

const CICLOS = [
  { value: 0, label: 'Mensual' },
  { value: 1, label: 'Bimestral' },
  { value: 2, label: 'Trimestral' },
  { value: 3, label: 'Cuatrimestral' },
  { value: 4, label: 'Semestral' },
  { value: 5, label: 'Anual' }
];

// IMPORTANTE: Los valores deben ser 0-based (0, 1, 2, ...) para coincidir con el sistema anterior
// El sistema anterior usa el índice del array MESES como valor guardado en BD
// Array: ['Enero', 'Febrero', 'Marzo', ...] donde índice 0=Enero, 1=Febrero, 2=Marzo
const MESES = [
  { value: 0, label: 'Enero' },
  { value: 1, label: 'Febrero' },
  { value: 2, label: 'Marzo' },
  { value: 3, label: 'Abril' },
  { value: 4, label: 'Mayo' },
  { value: 5, label: 'Junio' },
  { value: 6, label: 'Julio' },
  { value: 7, label: 'Agosto' },
  { value: 8, label: 'Septiembre' },
  { value: 9, label: 'Octubre' },
  { value: 10, label: 'Noviembre' },
  { value: 11, label: 'Diciembre' }
];

function PanelTutoriaGeneral() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = useCallback(
    () => api.get('/admin/tutoria-general/personal').then((r) => setList(r.data.personal || [])),
    []
  );

  useEffect(() => {
    load().catch((e) => {
      if (e.response?.status !== 403) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
      }
    });
  }, [load]);

  const buscar = () =>
    api
      .get('/admin/tutoria-general/personal-candidatos', { params: { q } })
      .then((r) => setCandidatos(r.data.personal || []));

  const add = async (personalId) => {
    try {
      await api.post('/admin/tutoria-general/personal', { personal_id: personalId });
      await load();
      Swal.fire({ icon: 'success', title: 'Asignada', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  const del = async (id) => {
    const ok = await Swal.fire({
      title: '¿Quitar tutora general?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/tutoria-general/personal/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  return (
    <div>
      <p className="config-section-desc">
        Personal autorizado para <strong>Tutoría General</strong>: ve todos los niveles en modo supervisión (solo lectura).
        No reemplaza el rol de tutor de aula. Solo el perfil Administrador puede gestionar esta lista.
      </p>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1rem' }}>Tutoras generales actuales</h3>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombre</th>
              <th style={{ width: 120 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: '#6b7280' }}>
                  No hay tutoras generales asignadas.
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id}>
                  <td>{row.dni || row.nro_documento || '—'}</td>
                  <td style={{ textAlign: 'left' }}>
                    {row.nombres} {row.apellidos}
                  </td>
                  <td>
                    <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(row.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1.25rem' }}>Añadir personal</h3>
      <div className="admin-usu-toolbar" style={{ marginBottom: 12 }}>
        <input
          className="admin-usu-grow"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por DNI o nombre"
        />
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={buscar}>
          Buscar
        </button>
      </div>
      <ul className="admin-sup-lista-candidatos">
        {candidatos.map((p) => (
          <li key={p.personal_id}>
            <strong>{p.dni || p.nro_documento}</strong> — {p.nombres} {p.apellidos}{' '}
            <button
              type="button"
              className="admin-usu-btn admin-usu-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => add(p.personal_id)}
            >
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelBibliotecaPersonal() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = useCallback(
    () => api.get('/admin/biblioteca-personal').then((r) => setList(r.data.personal || [])),
    []
  );

  useEffect(() => {
    load().catch((e) => {
      if (e.response?.status !== 403) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
      }
    });
  }, [load]);

  const buscar = () =>
    api
      .get('/admin/biblioteca-personal/candidatos', { params: { q } })
      .then((r) => setCandidatos(r.data.personal || []));

  const add = async (personalId) => {
    try {
      await api.post('/admin/biblioteca-personal', { personal_id: personalId });
      await load();
      Swal.fire({ icon: 'success', title: 'Asignado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  const del = async (id) => {
    const ok = await Swal.fire({
      title: '¿Quitar función Biblioteca?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/biblioteca-personal/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  return (
    <div>
      <p className="config-section-desc">
        Personal con función <strong>Biblioteca</strong>: puede cargar libros, prestar, entregar reservas y liberar
        ejemplares no recogidos. Administrador y Secretaría ya tienen este permiso. Solo el Administrador gestiona esta lista.
      </p>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1rem' }}>
        Bibliotecarios actuales
      </h3>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombre</th>
              <th style={{ width: 120 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: '#6b7280' }}>
                  No hay personal asignado.
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id}>
                  <td>{row.dni || row.nro_documento || '—'}</td>
                  <td style={{ textAlign: 'left' }}>
                    {row.nombres} {row.apellidos}
                  </td>
                  <td>
                    <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(row.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1.25rem' }}>
        Añadir personal
      </h3>
      <div className="admin-usu-toolbar" style={{ marginBottom: 12 }}>
        <input
          className="admin-usu-grow"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por DNI o nombre"
        />
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={buscar}>
          Buscar
        </button>
      </div>
      <ul className="admin-sup-lista-candidatos">
        {candidatos.map((p) => (
          <li key={p.personal_id}>
            <strong>{p.dni || p.nro_documento}</strong> — {p.nombres} {p.apellidos}{' '}
            <button
              type="button"
              className="admin-usu-btn admin-usu-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => add(p.personal_id)}
            >
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatriculaDestinatarios({ value, onChange }) {
  const [personal, setPersonal] = useState([]);
  const [q, setQ] = useState('');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.get('/admin/configuracion/matricula-personal')
      .then(({ data }) => {
        if (cancel) return;
        setPersonal(data.personal || []);
        if (!String(value || '').trim() && (data.seleccionados || []).length) {
          onChange((data.seleccionados || []).join(','));
        }
        setListo(true);
      })
      .catch(() => { if (!cancel) setListo(true); });
    return () => { cancel = true; };
  }, []);

  const elegidos = new Set(
    String(value || '').split(',').map((n) => parseInt(n, 10)).filter(Boolean)
  );
  const filtrados = personal.filter((p) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return `${p.nombre} ${p.email} ${p.cargo} ${p.tipo}`.toLowerCase().includes(t);
  });

  const toggle = (id) => {
    const next = new Set(elegidos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next].join(','));
  };

  return (
    <div className="form-group full-width">
      <label>Notificación al colegio</label>
      <p className="config-mat-lead">Marque al personal que recibirá el aviso institucional, con los datos, la foto del DNI y la firma.</p>
      <input
        type="search"
        className="config-mat-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o correo…"
      />
      <div className="config-mat-list">
        {!listo && <p className="config-mat-empty">Cargando personal…</p>}
        {listo && !filtrados.length && <p className="config-mat-empty">No hay personal con correo.</p>}
        {filtrados.map((p) => (
          <label key={p.id} className={`config-mat-row ${elegidos.has(p.id) ? 'is-on' : ''}`}>
            <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => toggle(p.id)} />
            <span>
              <strong>{p.nombre}</strong>
              <em>{p.cargo || p.tipo} · {p.email}</em>
            </span>
          </label>
        ))}
      </div>
      <small>{elegidos.size} seleccionado{elegidos.size === 1 ? '' : 's'}.</small>
    </div>
  );
}

function PanelCajerosCajaChica() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const load = useCallback(
    () => api.get('/admin/caja-chica-cajeros/personal').then((r) => setList(r.data.personal || [])),
    []
  );

  useEffect(() => {
    load().catch((e) => {
      if (e.response?.status !== 403) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
      }
    });
  }, [load]);

  const buscar = () =>
    api
      .get('/admin/caja-chica-cajeros/personal-candidatos', { params: { q } })
      .then((r) => setCandidatos(r.data.personal || []));

  const add = async (personalId) => {
    try {
      await api.post('/admin/caja-chica-cajeros/personal', { personal_id: personalId });
      await load();
      Swal.fire({ icon: 'success', title: 'Asignado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  const del = async (id) => {
    const ok = await Swal.fire({
      title: '¿Quitar cajero?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/caja-chica-cajeros/personal/${id}`);
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error, 'error');
    }
  };

  return (
    <div>
      <p className="config-section-desc">
        Personal autorizado como <strong>Cajero</strong> de <strong>Caja Chica</strong>: pueden operar las cuentas con
        visibilidad «Pública (cajero)». Las cuentas «Privada (solo admin)» siguen siendo solo del Administrador. Solo el
        perfil Administrador gestiona esta lista.
      </p>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1rem' }}>
        Cajeros actuales
      </h3>
      <div className="admin-usu-table-scroll">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombre</th>
              <th style={{ width: 120 }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: '#6b7280' }}>
                  No hay cajeros asignados.
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id}>
                  <td>{row.dni || row.nro_documento || '—'}</td>
                  <td style={{ textAlign: 'left' }}>
                    {row.nombres} {row.apellidos}
                    {row.usuario_tipo ? (
                      <span style={{ color: '#6b7280', fontSize: '0.8rem' }}> · {row.usuario_tipo}</span>
                    ) : null}
                  </td>
                  <td>
                    <button type="button" className="admin-usu-btn admin-usu-btn-danger" onClick={() => del(row.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <h3 className="section-title" style={{ fontSize: '1.05rem', marginTop: '1.25rem' }}>
        Añadir personal
      </h3>
      <div className="admin-usu-toolbar" style={{ marginBottom: 12 }}>
        <input
          className="admin-usu-grow"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por DNI o nombre"
        />
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={buscar}>
          Buscar
        </button>
      </div>
      <ul className="admin-sup-lista-candidatos">
        {candidatos.map((p) => (
          <li key={p.personal_id}>
            <strong>{p.dni || p.nro_documento}</strong> — {p.nombres} {p.apellidos}
            {p.tipo ? <span style={{ color: '#6b7280' }}> ({p.tipo})</span> : null}{' '}
            <button
              type="button"
              className="admin-usu-btn admin-usu-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => add(p.personal_id)}
            >
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminConfiguracion() {
  const { user } = useAuth();
  const { activo } = useModulos();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limpiezaAnio, setLimpiezaAnio] = useState('');
  const [limpiezaConfirmar, setLimpiezaConfirmar] = useState('');
  const [limpiezaPreview, setLimpiezaPreview] = useState(null);
  const [limpiezaCargando, setLimpiezaCargando] = useState(false);
  const [limpiezaMsg, setLimpiezaMsg] = useState('');
  const [limpiezaError, setLimpiezaError] = useState('');
  const [limpiezaJob, setLimpiezaJob] = useState('');
  const [limpiezaProgreso, setLimpiezaProgreso] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const quillMatriculaRef = useRef(null);
  const quillMatriculaInternoRef = useRef(null);
  const quillModulesMatricula = useMemo(() => QUILL_MODULES_MATRICULA, []);
  const visibleTabs = useMemo(
    () =>
      CONFIG_TABS.filter((tab) => {
        if (tab.id === 'matricula') return false;
        if (tab.oculto) return false;
        if (!activo(`config.${tab.id}`)) return false;
        if (user?.tipo === 'COORDINADOR') return tab.id === 'pagos';
        if (tab.soloAdmin && user?.tipo !== 'ADMINISTRADOR') return false;
        return true;
      }),
    [user?.tipo, activo]
  );

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  useEffect(() => {
    if (!limpiezaJob) return undefined;
    let vivo = true;
    const leer = async () => {
      try {
        const { data } = await api.get('/admin/configuracion/limpieza-anio/progreso', { params: { id: limpiezaJob } });
        if (!vivo) return;
        setLimpiezaProgreso(data);
        if (!data.listo) return;
        setLimpiezaJob('');
        setLimpiezaCargando(false);
        if (data.error) {
          setLimpiezaError(data.error);
          return;
        }
        const b = data.resultado?.borrados || {};
        setLimpiezaMsg(`Listo. ${b.publicaciones || 0} publicaciones, ${b.chat || 0} chats, ${b.archivos || 0} archivos (${((b.bytes || 0) / (1024 * 1024)).toFixed(1)} MB).`);
        setLimpiezaPreview(null);
        setLimpiezaConfirmar('');
        setTimeout(() => setLimpiezaProgreso(null), 1100);
      } catch (err) {
        if (!vivo) return;
        setLimpiezaError(err.response?.data?.error || 'No se pudo seguir la limpieza.');
        setLimpiezaCargando(false);
        setLimpiezaJob('');
      }
    };
    leer();
    const timer = setInterval(leer, 450);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [limpiezaJob]);
  const [config, setConfig] = useState({
    // Información General
    titulo_intranet: '',
    codigo_modular: '',
    resolucion_creacion: '',
    texto_intranet: '',
    telefono_colegio: '',
    correo_contacto: '',
    direccion_contacto: '',
    titulo_formulario_matricula: '',
    
    // Información Recaudo
    recaudo_nro_sucursal: '',
    recaudo_nro_cuenta: '',
    recaudo_razon_social: '',
    
    // Datos UGEL/DRE
    ugel_codigo: '',
    ugel_nombre: '',
    
    // Año Académico
    anio_activo: '',
    anio_matriculas: '',
    
    // Pagos
    ciclo_pensiones: 0,
    inicio_pensiones: 0, // 0-based: 0=Enero, 1=Febrero, 2=Marzo, ...
    total_pensiones: 10,
    moneda: 'S/.',
    monto_adicional: 0,
    bloquear_deudores: 'NO',
    bloquear_deudores_hasta_mes: '',
    
    // Notas
    ciclo_notas: 0,
    inicio_notas: 1,
    total_notas: 4,
    rangos_ciclos_notas: {},
    
    // Apreciaciones
    rangos_mensajes: [],
    
    // Conversión a Letras - Primaria
    rangos_letras_primaria: [],
    
    // Vencimiento de Pensiones
    pensiones_vencimiento: {},
    dias_tolerancia: 0,
    
    // Comisión Pago con Tarjeta
    comision_tarjeta_debito: '0.00',
    comision_tarjeta_credito: '0.00',
    
    // Exámenes Bloques
    clave_bloques: '',
    
    // Facturación
    ruc: '',
    razon_social: '',
    direccion: '',
    link_consulta_facturas: '',
    
    // Matrícula Online
    email_notificacion_matricula_online: '',
    remitente_emails: '',
    email_matricula_apoderado: '',
    email_matricula_interno: '',
    email_matricula_interno_asunto: '',
    enable_enrollment_form: 'NO',
    
    // Otros
    show_birthday_window: 'NO',
    
    // Archivos
    login_fondo: null,
    logo_colegio: null,
    logo_blanco: null,
    logo_minedu: null,
    libreta_logo: null,
    libreta_fondo: null,
    boleta_logo: null,
    icono_app: null,
    regla_conducta: { ...REGLA_CONDUCTA_DEFAULT },
  });

  const [archivosPreview, setArchivosPreview] = useState({
    login_fondo: null,
    logo_colegio: null,
    logo_blanco: null,
    logo_minedu: null,
    libreta_logo: null,
    libreta_fondo: null,
    boleta_logo: null,
    icono_app: null
  });

  const [estructuraTemas, setEstructuraTemas] = useState({
    temas_b1: 0,
    temas_b2: 0,
    temas_b3: 0,
    temas_b4: 0,
    activo: 1,
  });
  const [guardandoEstructura, setGuardandoEstructura] = useState(false);
  const [aplicandoEstructura, setAplicandoEstructura] = useState(false);

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  useEffect(() => {
    if (user?.tipo === 'COORDINADOR') setActiveTab('pagos');
  }, [user?.tipo]);

  const cargarConfiguracion = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/configuracion');
      const data = response.data;
      
      // Asegurar que inicio_pensiones sea un número
      // El valor viene de la BD como número, pero puede venir como string
      let inicioPensiones = 1;
      if (data.inicio_pensiones !== undefined && data.inicio_pensiones !== null && data.inicio_pensiones !== '') {
        inicioPensiones = parseInt(data.inicio_pensiones, 10);
        // Validar que sea un número válido entre 0 y 11 (0-based: 0=Enero, 11=Diciembre)
        if (isNaN(inicioPensiones) || inicioPensiones < 0 || inicioPensiones > 11) {
          console.warn('inicio_pensiones inválido:', data.inicio_pensiones, 'usando valor por defecto 0');
          inicioPensiones = 0;
        }
      }
      console.log('inicio_pensiones cargado:', data.inicio_pensiones, '-> parseado:', inicioPensiones);
      
      // Asegurar que rangos_letras_primaria sea un array
      let rangosLetrasPrimaria = [];
      if (data.rangos_letras_primaria) {
        if (Array.isArray(data.rangos_letras_primaria)) {
          rangosLetrasPrimaria = data.rangos_letras_primaria;
        } else if (typeof data.rangos_letras_primaria === 'string') {
          try {
            const parsed = JSON.parse(data.rangos_letras_primaria);
            rangosLetrasPrimaria = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.warn('Error parseando rangos_letras_primaria:', e);
            rangosLetrasPrimaria = [];
          }
        }
      }
      
      // Debug: verificar qué se está recibiendo
      console.log('rangos_letras_primaria recibido:', data.rangos_letras_primaria);
      console.log('rangos_letras_primaria procesado:', rangosLetrasPrimaria);

      // bloquear_deudores_hasta_mes: null/vacío = sin límite (0-11, mismo criterio que inicio_pensiones)
      let bloquearDeudoresHastaMes = '';
      if (data.bloquear_deudores_hasta_mes !== undefined && data.bloquear_deudores_hasta_mes !== null && data.bloquear_deudores_hasta_mes !== '') {
        const parsed = parseInt(data.bloquear_deudores_hasta_mes, 10);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 11) {
          bloquearDeudoresHastaMes = parsed;
        }
      }

      // Separar data para evitar que sobrescriba rangos_letras_primaria e inicio_pensiones
      const { rangos_letras_primaria: _, inicio_pensiones: __, inicio_notas: ___, bloquear_deudores_hasta_mes: __bdhm, regla_conducta: __rc, ...restData } = data;
      
      // Asegurar que inicio_notas también sea un número
      let inicioNotas = 1;
      if (data.inicio_notas !== undefined && data.inicio_notas !== null && data.inicio_notas !== '') {
        inicioNotas = parseInt(data.inicio_notas, 10);
        // Validar que sea un número válido entre 0 y 11 (0-based: 0=Enero, 11=Diciembre)
        if (isNaN(inicioNotas) || inicioNotas < 0 || inicioNotas > 11) {
          console.warn('inicio_notas inválido:', data.inicio_notas, 'usando valor por defecto 0');
          inicioNotas = 0;
        }
      }
      console.log('inicio_notas cargado:', data.inicio_notas, '-> parseado:', inicioNotas);
      
      // Verificar que restData no contenga inicio_pensiones
      if (restData.inicio_pensiones !== undefined) {
        console.warn('⚠️ restData todavía contiene inicio_pensiones:', restData.inicio_pensiones);
        delete restData.inicio_pensiones;
      }
      if (restData.inicio_notas !== undefined) {
        console.warn('⚠️ restData todavía contiene inicio_notas:', restData.inicio_notas);
        delete restData.inicio_notas;
      }
      
      if (restData.bloquear_deudores_hasta_mes !== undefined) {
        delete restData.bloquear_deudores_hasta_mes;
      }
      
      // Crear el objeto de configuración con los valores parseados explícitamente
      const configData = {
        ...restData,
        inicio_pensiones: Number(inicioPensiones), // Forzar a número
        inicio_notas: Number(inicioNotas), // Forzar a número
        bloquear_deudores_hasta_mes: bloquearDeudoresHastaMes,
        rangos_letras_primaria: rangosLetrasPrimaria,
        email_matricula_apoderado: ensureHtmlForQuill(restData.email_matricula_apoderado || ''),
        email_matricula_interno: ensureHtmlForQuill(restData.email_matricula_interno || ''),
        email_matricula_interno_asunto: restData.email_matricula_interno_asunto || '',
        comision_tarjeta_debito: formatComisionPct(restData.comision_tarjeta_debito),
        comision_tarjeta_credito: formatComisionPct(restData.comision_tarjeta_credito),
        regla_conducta: normalizarReglaConducta(data.regla_conducta),
        login_fondo: null,
        logo_colegio: null,
        logo_blanco: null,
        logo_minedu: null,
        libreta_logo: null,
        libreta_fondo: null,
        boleta_logo: null,
        icono_app: null
      };
      
      // Debug final: verificar qué se estableció en el estado
      console.log('=== DEBUG FINAL FRONTEND ===');
      console.log('Estado config establecido - inicio_pensiones:', configData.inicio_pensiones, 'tipo:', typeof configData.inicio_pensiones);
      console.log('Estado config establecido - inicio_notas:', configData.inicio_notas, 'tipo:', typeof configData.inicio_notas);
      console.log('Mes correspondiente a inicio_pensiones:', MESES.find(m => m.value === configData.inicio_pensiones)?.label || 'NO ENCONTRADO');
      console.log('Todos los valores de data.inicio_pensiones:', {
        raw: data.inicio_pensiones,
        tipo: typeof data.inicio_pensiones,
        parseado: inicioPensiones,
        final: configData.inicio_pensiones
      });
      
      setConfig(configData);

      // Cargar previews de archivos existentes
      setArchivosPreview({
        login_fondo: data.login_fondo,
        logo_colegio: data.logo_colegio,
        logo_blanco: data.logo_blanco,
        logo_minedu: data.logo_minedu,
        libreta_logo: data.libreta_logo,
        libreta_fondo: data.libreta_fondo,
        boleta_logo: data.boleta_logo,
        icono_app: data.icono_app
      });

      try {
        const est = await api.get('/admin/configuracion/estructura-temas');
        const e = est.data?.estructura || {};
        setEstructuraTemas({
          temas_b1: Number(e.temas_b1) || 0,
          temas_b2: Number(e.temas_b2) || 0,
          temas_b3: Number(e.temas_b3) || 0,
          temas_b4: Number(e.temas_b4) || 0,
          activo: e.activo === 0 || e.activo === '0' || e.activo === false ? 0 : 1,
        });
      } catch (eEst) {
        console.warn('Estructura de temas no disponible:', eEst.response?.data?.error || eEst.message);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo cargar la configuración'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Campos numéricos que deben manejarse como números
    const numericFields = ['inicio_pensiones', 'inicio_notas', 'total_pensiones', 'total_notas', 
                          'ciclo_pensiones', 'ciclo_notas', 'dias_tolerancia', 'anio_activo', 'anio_matriculas'];
    const floatFields = ['monto_adicional', 'comision_tarjeta_debito', 'comision_tarjeta_credito'];
    const comisionPctFields = ['comision_tarjeta_debito', 'comision_tarjeta_credito'];
    
    let processedValue = type === 'checkbox' ? checked : value;
    
    if (comisionPctFields.includes(name) && type !== 'checkbox') {
      // Permitir teclear; se normaliza a 2 decimales en onBlur
      processedValue = value;
    } else if (floatFields.includes(name) && type !== 'checkbox') {
      if (value === '' || value === null || value === undefined) {
        processedValue = 0;
      } else {
        const numValue = parseFloat(value);
        processedValue = Number.isNaN(numValue) ? value : numValue;
      }
    } else if (numericFields.includes(name) && type !== 'checkbox') {
      if (value === '' || value === null || value === undefined) {
                  processedValue = name === 'inicio_pensiones' || name === 'inicio_notas' ? 0 : 0;
      } else {
        const numValue = parseInt(value, 10);
        processedValue = isNaN(numValue) ? value : numValue;
      }
    }
    
    setConfig(prev => ({
      ...prev,
      [name]: processedValue
    }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      if (name === 'icono_app' && files[0].type !== 'image/png' && !/\.png$/i.test(files[0].name)) {
        Swal.fire('Error', 'El icono de la aplicación debe ser un PNG.', 'error');
        e.target.value = '';
        return;
      }
      setConfig(prev => ({
        ...prev,
        [name]: files[0]
      }));

      // Crear preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setArchivosPreview(prev => ({
          ...prev,
          [name]: event.target.result
        }));
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const handleRangoMensajeChange = (index, field, value) => {
    const nuevosRangos = [...config.rangos_mensajes];
    if (!nuevosRangos[index]) {
      nuevosRangos[index] = { rango: '', mensaje: '' };
    }
    nuevosRangos[index][field] = value;
    setConfig(prev => ({ ...prev, rangos_mensajes: nuevosRangos }));
  };

  const agregarRangoMensaje = () => {
    setConfig(prev => ({
      ...prev,
      rangos_mensajes: [...prev.rangos_mensajes, { rango: '', mensaje: '' }]
    }));
  };

  const eliminarRangoMensaje = (index) => {
    const nuevosRangos = config.rangos_mensajes.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, rangos_mensajes: nuevosRangos }));
  };

  const handleRangoLetraPrimariaChange = (index, field, value) => {
    const nuevosRangos = [...config.rangos_letras_primaria];
    if (!nuevosRangos[index]) {
      nuevosRangos[index] = { rango: '', letra: '' };
    }
    nuevosRangos[index][field] = value;
    setConfig(prev => ({ ...prev, rangos_letras_primaria: nuevosRangos }));
  };

  const agregarRangoLetraPrimaria = () => {
    setConfig(prev => ({
      ...prev,
      rangos_letras_primaria: [...prev.rangos_letras_primaria, { rango: '', letra: '' }]
    }));
  };

  const eliminarRangoLetraPrimaria = (index) => {
    const nuevosRangos = config.rangos_letras_primaria.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, rangos_letras_primaria: nuevosRangos }));
  };

  const handleRangoCicloNotaChange = (ciclo, field, value) => {
    setConfig(prev => ({
      ...prev,
      rangos_ciclos_notas: {
        ...prev.rangos_ciclos_notas,
        [ciclo]: {
          ...prev.rangos_ciclos_notas[ciclo],
          [field]: value
        }
      }
    }));
  };

  const handleMatriculaMensajeChange = (html) => {
    setConfig((prev) => ({ ...prev, email_matricula_apoderado: html }));
  };

  const handleMatriculaInternoChange = (html) => {
    setConfig((prev) => ({ ...prev, email_matricula_interno: html }));
  };

  const handleVencimientoPensionChange = (pension, value) => {
    setConfig(prev => ({
      ...prev,
      pensiones_vencimiento: {
        ...prev.pensiones_vencimiento,
        [pension]: value
      }
    }));
  };

  // Regenerar filas de rangos por ciclo cuando cambian total_notas o ciclo_notas.
  // No depender de rangos_ciclos_notas aquí: cada setConfig creaba un objeto nuevo, disparaba el
  // efecto de nuevo y producía un bucle infinito de renders.
  useEffect(() => {
    setConfig((prev) => {
      const total = parseInt(prev.total_notas, 10) || 4;
      const prevR = prev.rangos_ciclos_notas || {};
      const nuevosRangos = {};
      for (let i = 1; i <= total; i++) {
        if (!prevR[i]) {
          nuevosRangos[i] = { inicio: '', final: '' };
        } else {
          nuevosRangos[i] = prevR[i];
        }
      }
      return { ...prev, rangos_ciclos_notas: nuevosRangos };
    });
  }, [config.total_notas, config.ciclo_notas]);

  useEffect(() => {
    if (loading || activeTab !== 'matricula') return;
    const timer = window.setTimeout(() => {
      if (!quillMatriculaRef.current) return;
      const quill = quillMatriculaRef.current.getEditor();
      const toolbar = quill.getModule('toolbar');
      if (!toolbar) return;
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no puede ser mayor a 5 MB', 'error');
            return;
          }
          if (!file.type.startsWith('image/')) {
            Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
            return;
          }
          try {
            const formData = new FormData();
            formData.append('imagen', file);
            const response = await api.post('/docente/mensajes/subir-imagen', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            const imagenUrl = response.data?.url;
            if (!imagenUrl) throw new Error('Sin URL');
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading, activeTab]);

  // Función genérica para guardar una sección específica
  const handleSaveSection = async (fields, sectionName) => {
    try {
      setSaving(true);
      
      const formData = new FormData();
      
      // Agregar solo los campos especificados
      fields.forEach(field => {
        if (field === 'login_fondo' || field === 'logo_colegio' || field === 'logo_blanco' || field === 'logo_minedu' || field === 'libreta_logo' || field === 'libreta_fondo' || field === 'boleta_logo' || field === 'icono_app') {
          // Archivos - solo agregar si hay un archivo nuevo seleccionado
          if (config[field] && config[field] instanceof File) {
            formData.append(field, config[field]);
          }
        } else {
          // Campos de texto/objetos
          const value = config[field];
          if (value !== undefined && value !== null) {
            // Campos numéricos que deben enviarse como números (no strings)
            const numericFields = ['inicio_pensiones', 'inicio_notas', 'total_pensiones', 'total_notas', 
                                  'ciclo_pensiones', 'ciclo_notas', 'dias_tolerancia',
                                  'anio_activo', 'anio_matriculas'];
            const floatFields = ['monto_adicional', 'comision_tarjeta_debito', 'comision_tarjeta_credito'];
            
            if (floatFields.includes(field)) {
              const numValue = parseFloat(
                field === 'comision_tarjeta_debito' || field === 'comision_tarjeta_credito'
                  ? formatComisionPct(value)
                  : value
              );
              if (!Number.isNaN(numValue)) {
                formData.append(
                  field,
                  field === 'comision_tarjeta_debito' || field === 'comision_tarjeta_credito'
                    ? formatComisionPct(numValue)
                    : numValue
                );
              } else {
                formData.append(field, value);
              }
            } else if (numericFields.includes(field)) {
              // Enviar como número explícitamente
              const numValue = Number(value);
              if (!isNaN(numValue)) {
                formData.append(field, numValue);
                console.log(`📤 Enviando campo numérico ${field}:`, numValue, 'tipo:', typeof numValue);
              } else {
                formData.append(field, value);
                console.warn(`⚠️ Campo numérico ${field} no es válido, enviando valor original:`, value);
              }
            } else if (typeof value === 'object' && !Array.isArray(value)) {
              formData.append(field, JSON.stringify(value));
            } else if (Array.isArray(value)) {
              formData.append(field, JSON.stringify(value));
            } else if (field === 'email_matricula_apoderado' || field === 'email_matricula_interno') {
              formData.append(field, procesarHTMLMensaje(String(value || '')));
            } else {
              formData.append(field, value);
            }
          }
        }
      });

      await api.put('/admin/configuracion', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (fields.includes('logo_colegio') || fields.includes('logo_blanco') || fields.includes('logo_minedu') || fields.includes('boleta_logo') || fields.includes('icono_app') || fields.includes('libreta_logo') || fields.includes('libreta_fondo')) {
        invalidarCacheLogo();
        invalidarIdentidadColegio();
      }

      Swal.fire({
        icon: 'success',
        title: 'Éxito',
        text: `${sectionName} guardado correctamente`
      });

      // Recargar configuración para obtener URLs actualizadas
      await cargarConfiguracion();
    } catch (error) {
      console.error('Error guardando configuración:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || `No se pudo guardar ${sectionName}`
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReglaConductaBloqueChange = (casillero, field, value) => {
    setConfig((prev) => {
      const r = normalizarReglaConducta(prev.regla_conducta);
      return {
        ...prev,
        regla_conducta: {
          ...r,
          [casillero]: { ...r[casillero], [field]: value },
        },
      };
    });
  };

  const handleReglaConductaPromedioChange = (checked) => {
    setConfig((prev) => ({
      ...prev,
      regla_conducta: normalizarReglaConducta({
        ...prev.regla_conducta,
        redondear_promedio: checked,
      }),
    }));
  };

  const handleSaveConducta = async () => {
    const regla = normalizarReglaConducta(config.regla_conducta);
    const confirm = await Swal.fire({
      icon: 'question',
      title: 'Guardar regla de conducta',
      html:
        '<p style="text-align:left;margin:0;color:#b45309;font-weight:650;">Al guardar se recalcularán las notas de conducta de <strong>todos los alumnos del año activo</strong> (4 bimestres).</p>',
      showCancelButton: true,
      confirmButtonText: 'Guardar y recalcular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0ea5e9',
    });
    if (!confirm.isConfirmed) return;
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('regla_conducta', JSON.stringify(regla));
      const { data } = await api.put('/admin/configuracion', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      const rec = data?.conducta_recalculada;
      const extra = rec?.error
        ? ` La regla se guardó, pero el recálculo falló: ${rec.error}`
        : rec
          ? ` Se actualizaron ${rec.matriculas || 0} alumnos (${rec.notas || 0} notas, año ${rec.anio || ''}).`
          : '';
      Swal.fire({
        icon: rec?.error ? 'warning' : 'success',
        title: rec?.error ? 'Regla guardada' : 'Conducta actualizada',
        text: `${textoReglaCorta(regla)}${extra}`,
      });
      await cargarConfiguracion();
    } catch (error) {
      console.error('Error guardando regla de conducta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar la regla de conducta',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarEstructuraTemas = async () => {
    setGuardandoEstructura(true);
    try {
      const { data } = await api.put('/admin/configuracion/estructura-temas', estructuraTemas);
      const e = data.estructura || estructuraTemas;
      setEstructuraTemas({
        temas_b1: Number(e.temas_b1) || 0,
        temas_b2: Number(e.temas_b2) || 0,
        temas_b3: Number(e.temas_b3) || 0,
        temas_b4: Number(e.temas_b4) || 0,
        activo: e.activo === 0 || e.activo === '0' || e.activo === false ? 0 : 1,
      });
      const activa = e.activo === 0 || e.activo === '0' || e.activo === false ? 0 : 1;
      Swal.fire({
        icon: 'success',
        title: 'Estructura guardada',
        text: activa
          ? 'Las asignaturas nuevas nacerán con estos huecos. Use Aplicar estructura para las que ya existen.'
          : 'Estructura desactivada. El aula queda en blanco: cada docente llena sus temas. No se generan huecos.',
        timer: 3200,
        showConfirmButton: false,
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar la estructura',
      });
    } finally {
      setGuardandoEstructura(false);
    }
  };

  const handleAplicarEstructuraTemas = async () => {
    const result = await Swal.fire({
      icon: 'warning',
      title: '¿Aplicar estructura ahora?',
      html: '<p>Se revisarán <strong>todas las asignaturas del año activo</strong>.</p><p>Solo se crearán filas vacías que falten (Tema/Ficha). <strong>No se borra ni se pisa</strong> lo que el maestro ya subió.</p>',
      showCancelButton: true,
      confirmButtonText: 'Sí, aplicar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    setAplicandoEstructura(true);
    try {
      const { data } = await api.post('/admin/configuracion/estructura-temas/aplicar');
      Swal.fire({
        icon: 'success',
        title: 'Listo',
        text: data.mensaje || 'Estructura aplicada',
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo aplicar la estructura',
      });
    } finally {
      setAplicandoEstructura(false);
    }
  };

  const handleReiniciarAccesos = async () => {
    const result = await Swal.fire({
      title: '⚠️ ¿Está seguro?',
      html: '<p style="text-align: left; margin-bottom: 1rem;">Esta acción reiniciará las contraseñas de <strong>TODOS los usuarios</strong> (excepto administradores):</p><ul style="text-align: left; margin-left: 1.5rem;"><li>Alumnos</li><li>Apoderados</li><li>Docentes</li><li>Personal administrativo</li></ul><p style="text-align: left; margin-top: 1rem; color: #dc2626;"><strong>Las contraseñas se establecerán como el número de DNI de cada usuario.</strong></p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, reiniciar contraseñas',
      cancelButtonText: 'Cancelar',
      width: '500px'
    });

    if (result.isConfirmed) {
      try {
        const { data } = await api.post('/admin/configuracion/reiniciar-accesos');
        const s = data.stats || {};
        Swal.fire({
          icon: 'success',
          title: 'Éxito',
          html: `Contraseñas reiniciadas al DNI (SHA1).<br>
            Alumnos: <strong>${s.alumnos ?? 0}</strong> ·
            Apoderados: <strong>${s.apoderados ?? 0}</strong> ·
            Personal/docentes: <strong>${s.personal ?? 0}</strong>
            ${s.omitidos ? `<br><small>Sin DNI (omitidos): ${s.omitidos}</small>` : ''}`,
        });
      } catch (error) {
        console.error('Error reiniciando accesos:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudieron reiniciar los accesos'
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="admin-configuracion admin-configuracion--loading">
        <div className="config-loading-card">
          <div className="config-loading-spinner" aria-hidden />
          <p>Cargando configuración…</p>
        </div>
      </div>
    );
  }

  const cicloLabel = CICLOS.find(c => c.value === parseInt(config.ciclo_notas))?.label || 'Ciclo';
  const totalNotas = parseInt(config.total_notas) || 4;
  const opcionesPago = ['Matrícula', ...Array.from({ length: parseInt(config.total_pensiones) || 10 }, (_, i) => `Pensión ${i + 1}`)];
  const tabActiva = visibleTabs.find((t) => t.id === activeTab) || visibleTabs[0];

  return (
    <div className="admin-configuracion">
      {limpiezaProgreso && (
        <div className="limpieza-velo" role="status" aria-live="polite">
          <div className="limpieza-caja">
            <p className="limpieza-kicker">Limpiando {limpiezaAnio}</p>
            <strong>{limpiezaProgreso.etapa || 'En proceso…'}</strong>
            <div className="limpieza-barra" aria-valuemin="0" aria-valuemax="100" aria-valuenow={limpiezaProgreso.pct || 0}>
              <span style={{ width: `${Math.min(100, limpiezaProgreso.pct || 0)}%` }} />
            </div>
            <b>{Math.min(100, limpiezaProgreso.pct || 0)}%</b>
            <ul>
              {['Chat', 'Avisos', 'Auditoría', 'Publicaciones', 'Fotos del disco'].map((nombre, i) => {
                const n = i + 1;
                const paso = limpiezaProgreso.paso || 0;
                const hecho = paso > n || limpiezaProgreso.listo;
                const activo = paso === n && !limpiezaProgreso.listo;
                return <li key={nombre} className={hecho ? 'is-done' : activo ? 'is-on' : ''}>{hecho ? '✓' : activo ? '…' : '○'} {nombre}</li>;
              })}
            </ul>
            {limpiezaProgreso.error && (
              <button type="button" className="btn-warning btn-warning--inline" onClick={() => setLimpiezaProgreso(null)}>Cerrar</button>
            )}
          </div>
        </div>
      )}
      <header className="config-hero">
        <div className="config-hero-icon" aria-hidden="true">
          <ConfigTabIcon name="general" />
        </div>
        <div className="config-hero-text">
          <h1>Configuración General</h1>
          <p>
            Ajustes del colegio por sección: identidad, cobros, año lectivo, notas, facturación y más.
            Cada tarjeta guarda solo sus campos.
          </p>
          <div className="config-hero-meta">
            {config.titulo_intranet ? (
              <span className="config-hero-chip">{config.titulo_intranet}</span>
            ) : null}
            {config.anio_activo ? (
              <span className="config-hero-chip">Año activo {config.anio_activo}</span>
            ) : null}
            {config.codigo_modular ? (
              <span className="config-hero-chip">Cód. {config.codigo_modular}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className={`config-help config-help--${tabActiva?.tone || 'blue'}`}>
        <div className="config-help-icon" aria-hidden="true">
          <ConfigTabIcon name={tabActiva?.icon || 'general'} />
        </div>
        <div>
          <h2>{tabActiva?.helpTitle || 'Sección'}</h2>
          <p>{tabActiva?.help}</p>
        </div>
      </div>

      <nav className="config-tabs" role="tablist" aria-label="Secciones de configuración">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`config-tab config-tab--${tab.tone}${activeTab === tab.id ? ' config-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="config-tab-icon" aria-hidden="true">
              <ConfigTabIcon name={tab.icon} />
            </span>
            <span className="config-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="config-tab-panel" data-tone={tabActiva?.tone || 'blue'}>
          {activeTab === 'general' && (
          <>
          <div className="config-panel-card">
            <div className="config-panel-card-header">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="general" /></span>
              Información general
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Título / Nombre del Colegio</label>
                <input
                  type="text"
                  name="titulo_intranet"
                  value={config.titulo_intranet}
                  onChange={handleInputChange}
                  placeholder="Título del intranet"
                />
              </div>
              <div className="form-group">
                <label>Código Modular</label>
                <input
                  type="text"
                  name="codigo_modular"
                  value={config.codigo_modular}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Resolución de Creación</label>
                <input
                  type="text"
                  name="resolucion_creacion"
                  value={config.resolucion_creacion}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Texto Intranet</label>
                <input
                  type="text"
                  name="texto_intranet"
                  value={config.texto_intranet}
                  onChange={handleInputChange}
                />
                <small>Es el nombre junto al logo en el menú, en la pantalla de ingreso, en la pestaña del navegador y el nombre al instalar la aplicación. Si lo deja vacío, se muestra VanguardNet.</small>
              </div>
              <div className="form-group">
                <label>Teléfonos de contacto</label>
                <input
                  type="text"
                  name="telefono_colegio"
                  value={config.telefono_colegio}
                  onChange={handleInputChange}
                  placeholder="Tel: 045 502 100 / 022 084 833"
                />
                <small>Lo que se ve hoy en la página web es 922 084 833 - 947 345 887 - 947 346 735. El correo de matrícula, si esto queda vacío, sigue con Tel: 045 502 100 / 022 084 833. Si escribe un texto aquí, la web y el correo de matrícula usan ese mismo texto.</small>
              </div>
              <div className="form-group">
                <label>Correo de contacto</label>
                <input
                  type="email"
                  name="correo_contacto"
                  value={config.correo_contacto}
                  onChange={handleInputChange}
                  placeholder="admin@vanguardschools.edu.pe"
                />
                <small>Lo que se ve hoy en la web y en el correo de matrícula es admin@vanguardschools.edu.pe. Si escribe otro, la web y ese correo usan el nuevo.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Dirección de contacto</label>
                <input
                  type="text"
                  name="direccion_contacto"
                  value={config.direccion_contacto}
                  onChange={handleInputChange}
                  placeholder="Jr. Toribio de Luzuriaga Mz F lote 18 y 19 - SMP."
                />
                <small>Es la dirección del pie del correo de matrícula y de la página web. No usa la dirección de Facturación. Hoy dice: Jr. Toribio de Luzuriaga Mz F lote 18 y 19 - SMP. Si lo deja vacío, se mantiene esa.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Logo a color</label>
                {archivosPreview.logo_colegio && (
                  <div className="file-preview">
                    <img src={archivosPreview.logo_colegio} alt="Logo a color actual" />
                  </div>
                )}
                <input
                  type="file"
                  name="logo_colegio"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Vista del logo que se usa hoy. Va en el login, reportes, correos y boletas de pago. En la libreta se usa si no hay un logo de libreta. Suba un PNG o JPG para reemplazarlo. Si no sube uno, se mantiene este.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Logo blanco</label>
                {archivosPreview.logo_blanco && (
                  <div className="file-preview file-preview--menu">
                    <img src={archivosPreview.logo_blanco} alt="Logo blanco actual" />
                  </div>
                )}
                <input
                  type="file"
                  name="logo_blanco"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Vista sobre el azul del menú, como se ve en la barra. Suba la versión en blanco. Si no sube uno, se mantiene este.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Icono de la aplicación</label>
                {archivosPreview.icono_app && (
                  <div className="file-preview">
                    <img src={archivosPreview.icono_app} alt="Icono de la aplicación" />
                  </div>
                )}
                <input
                  type="file"
                  name="icono_app"
                  accept=".png,image/png"
                  onChange={handleFileChange}
                />
                <small>Un solo PNG cuadrado de 512×512, fondo transparente y el dibujo centrado, sin pegarlo a los bordes. De este archivo salen el icono de la pestaña, el de instalar en iPhone, iPad, tablet, Android y computadora, la pantalla de inicio y las notificaciones. Si no sube uno, se mantienen los iconos actuales.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Logo de la libreta</label>
                {archivosPreview.libreta_logo && (
                  <div className="file-preview">
                    <img src={archivosPreview.libreta_logo} alt="Logo de la libreta" />
                  </div>
                )}
                <input
                  type="file"
                  name="libreta_logo"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Esquina de la libreta de notas. Si no sube uno, la libreta usa el logo a color. No usa un archivo fijo del sistema.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Fondo de la libreta</label>
                {archivosPreview.libreta_fondo && (
                  <div className="file-preview">
                    <img src={archivosPreview.libreta_fondo} alt="Fondo de la libreta" />
                  </div>
                )}
                <input
                  type="file"
                  name="libreta_fondo"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Marca de agua al centro de la libreta. Si no sube una, se usa el logo de la libreta o, si tampoco hay, el logo a color.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Sello MINEDU</label>
                {archivosPreview.logo_minedu && (
                  <div className="file-preview">
                    <img src={archivosPreview.logo_minedu} alt="Sello MINEDU actual" />
                  </div>
                )}
                <input
                  type="file"
                  name="logo_minedu"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Solo en los PDF de CNEB, al lado del logo del colegio. Si no sube uno, se mantiene este sello.</small>
              </div>
              <div className="form-group form-group--full">
                <label>Logo de CV y carnet</label>
                {archivosPreview.boleta_logo && (
                  <div className="file-preview">
                    <img src={archivosPreview.boleta_logo} alt="Logo de CV y carnet actual" />
                  </div>
                )}
                <input
                  type="file"
                  name="boleta_logo"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <small>Escudo o logo institucional. Sale en el currículum del personal y en el carnet QR del alumno. Las boletas lo usan solo si no hay logo a color. Suba un PNG o JPG para cambiarlo. Si no sube uno, se mantiene el actual.</small>
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'titulo_intranet', 'codigo_modular', 'resolucion_creacion',
                  'texto_intranet', 'telefono_colegio', 'correo_contacto', 'direccion_contacto',
                  'logo_colegio', 'logo_blanco', 'logo_minedu', 'boleta_logo', 'icono_app', 'libreta_logo', 'libreta_fondo'
                ], 'Información General')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            </div>
          </div>

          <div className="config-panel-card config-panel-card--spaced">
            <div className="config-panel-card-header">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="notas" /></span>
              Conducta
            </div>
            <div className="config-section">
              <div className="conducta-casilleros">
                {CASILLEROS_CONDUCTA.map((key) => {
                  const bloque = config.regla_conducta?.[key] || {};
                  return (
                    <div key={key} className="conducta-casillero">
                      <h4 className="conducta-casillero-title">{LABELS_CASILLERO[key]}</h4>
                      <div className="conducta-casillero-fields">
                        <div className="form-group">
                          <label>Nota máxima</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="1"
                            value={bloque.max ?? 20}
                            onChange={(e) => handleReglaConductaBloqueChange(key, 'max', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Nota mínima</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="1"
                            value={bloque.min ?? 6}
                            onChange={(e) => handleReglaConductaBloqueChange(key, 'min', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Descuento</label>
                          <input
                            type="number"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={bloque.descuento ?? 0.5}
                            onChange={(e) => handleReglaConductaBloqueChange(key, 'descuento', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="conducta-ejemplos conducta-ejemplos--mini">
                        {ejemplosReglaBloque({
                          ...bloque,
                          redondear: !!config.regla_conducta?.redondear_promedio,
                        }).slice(0, 4).map((ej) => (
                          <span key={`${key}-${ej.registros}`}>
                            {ej.registros}→<strong>{ej.nota}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="config-check-label">
                  <input
                    type="checkbox"
                    checked={!!config.regla_conducta?.redondear_promedio}
                    onChange={(e) => handleReglaConductaPromedioChange(e.target.checked)}
                  />
                  Redondear .5 hacia arriba
                </label>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={handleSaveConducta}
                  disabled={saving}
                  className="btn-submit-card"
                >
                  {saving ? 'Guardando y recalculando…' : 'Guardar y recalcular conducta'}
                </button>
              </div>
            </div>
          </div>

          <AdminMascotaColegio />

          <div className="config-panel-card config-panel-card--spaced">
            <div className="config-panel-card-header config-panel-card-header--violet">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="pagos" /></span>
              Comisión pago con tarjeta
            </div>
            <div className="config-section">
              <p className="config-section-hint">
                Porcentajes usados automáticamente en ventas al calcular la comisión de tarjeta.
              </p>
              <div className="form-grid form-grid--narrow">
                <div className="form-group">
                  <label>Tarjeta de Débito %</label>
                  <input
                    type="number"
                    name="comision_tarjeta_debito"
                    value={config.comision_tarjeta_debito}
                    onChange={handleInputChange}
                    onBlur={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        comision_tarjeta_debito: formatComisionPct(e.target.value)
                      }))
                    }
                    step="0.01"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Tarjeta de Crédito %</label>
                  <input
                    type="number"
                    name="comision_tarjeta_credito"
                    value={config.comision_tarjeta_credito}
                    onChange={handleInputChange}
                    onBlur={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        comision_tarjeta_credito: formatComisionPct(e.target.value)
                      }))
                    }
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={() => handleSaveSection(['comision_tarjeta_debito', 'comision_tarjeta_credito'], 'Comisión tarjeta')}
                  disabled={saving}
                  className="btn-submit-card"
                >
                  {saving ? 'Guardando…' : 'Guardar comisión'}
                </button>
              </div>
            </div>
          </div>
          </>
          )}

          {activeTab === 'recaudo' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--amber">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="recaudo" /></span>
              Información de recaudo
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>N° de Sucursal</label>
                <input
                  type="text"
                  name="recaudo_nro_sucursal"
                  value={config.recaudo_nro_sucursal}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>N° de Cuenta</label>
                <input
                  type="text"
                  name="recaudo_nro_cuenta"
                  value={config.recaudo_nro_cuenta}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Razón Social</label>
                <input
                  type="text"
                  name="recaudo_razon_social"
                  value={config.recaudo_razon_social}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'recaudo_nro_sucursal', 'recaudo_nro_cuenta', 'recaudo_razon_social'
                ], 'Información Recaudo')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            </div>
          </div>
          )}

          {/* Logo y fondo de la libreta están en Información general. */}
          {false && (
          <div className="config-panel-card config-panel-card--hidden">
            <div className="config-panel-card-header config-panel-card-header--amber">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="notas" /></span>
              Diseño libreta de notas
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Logo</label>
                {archivosPreview.libreta_logo && (
                  <div className="file-preview">
                    <img src={archivosPreview.libreta_logo} alt="Preview" />
                  </div>
                )}
                <input
                  type="file"
                  name="libreta_logo"
                  accept=".jpg,.jpeg"
                  onChange={handleFileChange}
                />
                <small>Solo archivos .jpg</small>
              </div>
              <div className="form-group">
                <label>Fondo</label>
                {archivosPreview.libreta_fondo && (
                  <div className="file-preview">
                    <img src={archivosPreview.libreta_fondo} alt="Preview" />
                  </div>
                )}
                <input
                  type="file"
                  name="libreta_fondo"
                  accept=".jpg,.jpeg"
                  onChange={handleFileChange}
                />
                <small>Solo archivos .jpg</small>
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'libreta_logo', 'libreta_fondo'
                ], 'Diseño Libreta de Notas')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            </div>
          </div>
          )}

          {activeTab === 'anio' && (
          <>
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--teal">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="anio" /></span>
              Año académico
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Año Activo</label>
                <input
                  type="number"
                  name="anio_activo"
                  value={config.anio_activo}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Año Matrículas</label>
                <input
                  type="number"
                  name="anio_matriculas"
                  value={config.anio_matriculas}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Mostrar ventana de cumpleaños</label>
                <select
                  name="show_birthday_window"
                  value={config.show_birthday_window}
                  onChange={handleInputChange}
                >
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </div>
            </div>

            <div className="config-subsection config-subsection--danger">
              <h3 className="config-subsection-title">Reiniciar contraseñas de usuarios</h3>
              <p className="config-subsection-desc">
                Reinicia las contraseñas de todos los usuarios (excepto administradores) y las establece como su número de DNI.
              </p>
              <button
                type="button"
                onClick={handleReiniciarAccesos}
                className="btn-warning btn-warning--inline"
              >
                Reiniciar contraseñas
              </button>
            </div>

            <div className="config-subsection">
              <h3 className="config-subsection-title" style={{ color: '#0f766e' }}>Estructura de temas</h3>
              <p className="config-subsection-desc">
                Si está activada, se crean automáticamente los huecos (Tema 1 con Ficha 1, etc.).
                Si está desactivada, el aula queda en blanco y cada docente llena lo suyo.
              </p>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="estructura-temas-activo">Activar estructura automática</label>
                  <select
                    id="estructura-temas-activo"
                    value={estructuraTemas.activo === 0 ? '0' : '1'}
                    onChange={(e) => {
                      setEstructuraTemas((prev) => ({
                        ...prev,
                        activo: e.target.value === '0' ? 0 : 1,
                      }));
                    }}
                  >
                    <option value="1">SI — generar temas y fichas</option>
                    <option value="0">NO — dejar el aula en blanco</option>
                  </select>
                </div>
              </div>
              <p className="config-subsection-desc">
                Indique cuántos temas hay en cada bimestre. Cero = no generar huecos en ese bimestre. Máximo 20.
              </p>
              <div className="form-grid">
                {[1, 2, 3, 4].map((bim) => (
                  <div className="form-group" key={bim}>
                    <label htmlFor={`estructura-temas-b${bim}`}>Temas bimestre {bim}</label>
                    <input
                      id={`estructura-temas-b${bim}`}
                      type="number"
                      min="0"
                      max="20"
                      disabled={estructuraTemas.activo === 0}
                      value={estructuraTemas[`temas_b${bim}`]}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setEstructuraTemas((prev) => ({
                          ...prev,
                          [`temas_b${bim}`]: Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0,
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="card-actions" style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn-submit-card"
                  onClick={handleGuardarEstructuraTemas}
                  disabled={guardandoEstructura || aplicandoEstructura}
                >
                  {guardandoEstructura ? 'Guardando…' : 'Guardar estructura'}
                </button>
                <button
                  type="button"
                  className="btn-warning btn-warning--inline"
                  onClick={handleAplicarEstructuraTemas}
                  disabled={guardandoEstructura || aplicandoEstructura || estructuraTemas.activo === 0}
                  title={estructuraTemas.activo === 0 ? 'Active la estructura para aplicar huecos' : undefined}
                >
                  {aplicandoEstructura ? 'Aplicando…' : 'Aplicar estructura'}
                </button>
              </div>
            </div>

            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'anio_activo', 'anio_matriculas', 'show_birthday_window'
                ], 'Año Académico')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
            </div>
          </div>
          {user?.tipo === 'ADMINISTRADOR' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--teal">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="anio" /></span>
              Limpiar un año cerrado
            </div>
            <div className="config-section">
              <div className="config-subsection config-subsection--danger">
                <h3 className="config-subsection-title">Muro, chat y avisos</h3>
                <p className="config-subsection-desc">
                  Borra de ese año las publicaciones y sus fotos, el chat, los avisos y el registro de auditoría.
                  También libera esos archivos en el disco. No toca notas, matrículas, pagos, fotos de perfil,
                  la biblioteca ni los PDF de los temas.
                </p>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="limpieza-anio">Año a limpiar</label>
                    <input
                      id="limpieza-anio"
                      type="number"
                      min="2000"
                      max="2100"
                      value={limpiezaAnio}
                      onChange={(e) => {
                        setLimpiezaAnio(e.target.value);
                        setLimpiezaPreview(null);
                        setLimpiezaMsg('');
                        setLimpiezaError('');
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="limpieza-confirmar">Escribe el año para confirmar</label>
                    <input
                      id="limpieza-confirmar"
                      type="text"
                      value={limpiezaConfirmar}
                      onChange={(e) => setLimpiezaConfirmar(e.target.value)}
                      placeholder={limpiezaAnio || 'Ej. 2025'}
                    />
                  </div>
                </div>
                {limpiezaError && <p className="config-subsection-desc" style={{ color: '#9b1c1c' }}>{limpiezaError}</p>}
                {limpiezaMsg && <p className="config-subsection-desc" style={{ color: '#166534' }}>{limpiezaMsg}</p>}
                {limpiezaPreview && (
                  <p className="config-subsection-desc">
                    Año {limpiezaPreview.anio}: {limpiezaPreview.publicaciones} publicaciones, {limpiezaPreview.chat} mensajes de chat, {limpiezaPreview.notificaciones} avisos
                    y {limpiezaPreview.auditoria} registros de auditoría. Las fotos de esas publicaciones se borran al limpiar. Los PDF de temas no se tocan.
                  </p>
                )}
                <div className="card-actions" style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  <button
                    type="button"
                    className="btn-submit-card"
                    disabled={limpiezaCargando || !limpiezaAnio}
                    onClick={async () => {
                      setLimpiezaCargando(true);
                      setLimpiezaError('');
                      setLimpiezaMsg('');
                      try {
                        const { data } = await api.get('/admin/configuracion/limpieza-anio', { params: { anio: limpiezaAnio } });
                        setLimpiezaPreview(data);
                      } catch (err) {
                        setLimpiezaPreview(null);
                        setLimpiezaError(err.response?.data?.error || 'No se pudo calcular.');
                      } finally {
                        setLimpiezaCargando(false);
                      }
                    }}
                  >
                    {limpiezaCargando ? 'Calculando…' : 'Ver qué se borraría'}
                  </button>
                  <button
                    type="button"
                    className="btn-warning btn-warning--inline"
                    disabled={limpiezaCargando || !limpiezaPreview || String(limpiezaConfirmar).trim() !== String(limpiezaAnio)}
                    onClick={async () => {
                      const ok = await Swal.fire({
                        icon: 'warning',
                        title: `Limpiar ${limpiezaAnio}`,
                        text: 'Se borran publicaciones, chat, avisos y auditoría de ese año, y las fotos de esas publicaciones. No se puede deshacer.',
                        showCancelButton: true,
                        confirmButtonText: 'Limpiar',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#9b1c1c',
                      });
                      if (!ok.isConfirmed) return;
                      setLimpiezaCargando(true);
                      setLimpiezaError('');
                      setLimpiezaMsg('');
                      setLimpiezaProgreso({ pct: 2, paso: 0, etapa: 'Preparando…', listo: false });
                      try {
                        const { data } = await api.post('/admin/configuracion/limpieza-anio', {
                          anio: parseInt(limpiezaAnio, 10),
                          confirmar: String(limpiezaConfirmar).trim(),
                        });
                        setLimpiezaJob(data.id);
                      } catch (err) {
                        setLimpiezaError(err.response?.data?.error || 'No se pudo limpiar.');
                        setLimpiezaProgreso(null);
                        setLimpiezaCargando(false);
                      }
                    }}
                  >
                    Limpiar este año
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}
          </>
          )}

          {activeTab === 'pagos' && (
          <>
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--violet">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="pagos" /></span>
              Pagos
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Ciclo de Pensiones</label>
                <select
                  name="ciclo_pensiones"
                  value={config.ciclo_pensiones}
                  onChange={handleInputChange}
                >
                  {CICLOS.map(ciclo => (
                    <option key={ciclo.value} value={ciclo.value}>{ciclo.label}</option>
                  ))}
                </select>
              </div>
              {config.ciclo_pensiones === 0 && (
                <div className="form-group">
                  <label>Inicio de Cobros</label>
                  <select
                    name="inicio_pensiones"
                    value={String(Number(config.inicio_pensiones) ?? 0)}
                    onChange={handleInputChange}
                  >
                    {MESES.map(mes => (
                      <option key={mes.value} value={String(mes.value)}>{mes.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Total Pensiones</label>
                <input
                  type="number"
                  name="total_pensiones"
                  value={config.total_pensiones}
                  onChange={handleInputChange}
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Moneda</label>
                <input
                  type="text"
                  name="moneda"
                  value={config.moneda}
                  onChange={handleInputChange}
                  placeholder="S/., US$"
                />
              </div>
              <div className="form-group">
                <label>Monto Adicional S/.</label>
                <input
                  type="number"
                  name="monto_adicional"
                  value={config.monto_adicional}
                  onChange={handleInputChange}
                  step="0.01"
                />
              </div>
              <div className="form-group">
                <label>Bloquear Deudores</label>
                <select
                  name="bloquear_deudores"
                  value={config.bloquear_deudores}
                  onChange={handleInputChange}
                >
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </div>
              {config.bloquear_deudores === 'SI' && (
                <div className="form-group">
                  <label>Bloquear deudores hasta el mes de</label>
                  <select
                    name="bloquear_deudores_hasta_mes"
                    value={config.bloquear_deudores_hasta_mes === '' || config.bloquear_deudores_hasta_mes === null || config.bloquear_deudores_hasta_mes === undefined ? '' : config.bloquear_deudores_hasta_mes}
                    onChange={handleInputChange}
                  >
                    <option value="">Sin límite (todas las pensiones vencidas)</option>
                    {MESES.map((mes) => (
                      <option key={mes.value} value={mes.value}>{mes.label}</option>
                    ))}
                  </select>
                  <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>
                    Si elige un mes, solo bloquea quien debe pensiones hasta ese mes. Ej.: en agosto, con corte junio, quien debe solo julio puede ingresar.
                  </small>
                </div>
              )}
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'ciclo_pensiones', 'inicio_pensiones', 'total_pensiones',
                  'moneda', 'monto_adicional', 'bloquear_deudores', 'bloquear_deudores_hasta_mes'
                ], 'Pagos')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar pagos'}
              </button>
            </div>
            </div>
          </div>

          <div className="config-panel-card config-panel-card--spaced">
            <div className="config-panel-card-header config-panel-card-header--violet">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="pagos" /></span>
              Vencimiento de pensiones
            </div>
            <div className="config-section">
            <div className="config-table-wrap">
            <table className="rangos-table rangos-table--vencimientos">
              <tbody>
                <tr>
                  <th>Matrícula</th>
                  <td>
                    <input
                      type="text"
                      placeholder="dd-mm"
                      value={config.pensiones_vencimiento[-1] || ''}
                      onChange={(e) => handleVencimientoPensionChange(-1, e.target.value)}
                    />
                  </td>
                </tr>
                {opcionesPago.slice(1).map((pago, index) => (
                  <tr key={index}>
                    <th>{pago}</th>
                    <td>
                      <input
                        type="text"
                        placeholder="dd-mm"
                        value={config.pensiones_vencimiento[index + 1] || ''}
                        onChange={(e) => handleVencimientoPensionChange(index + 1, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Días de tolerancia</label>
                <input
                  type="number"
                  name="dias_tolerancia"
                  value={config.dias_tolerancia}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'pensiones_vencimiento', 'dias_tolerancia'
                ], 'Vencimiento de Pensiones')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar vencimientos'}
              </button>
            </div>
            </div>
          </div>
          </>
          )}

          {activeTab === 'notas' && (
          <>
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--sky">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="notas" /></span>
              Notas
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Ciclo de Notas</label>
                <select
                  name="ciclo_notas"
                  value={config.ciclo_notas}
                  onChange={handleInputChange}
                >
                  {CICLOS.map(ciclo => (
                    <option key={ciclo.value} value={ciclo.value}>{ciclo.label}</option>
                  ))}
                </select>
              </div>
              {config.ciclo_notas === 0 && (
                <div className="form-group">
                  <label>Inicio de Registro</label>
                  <select
                    name="inicio_notas"
                    value={String(Number(config.inicio_notas) ?? 0)}
                    onChange={handleInputChange}
                  >
                    {MESES.map(mes => (
                      <option key={mes.value} value={String(mes.value)}>{mes.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Total Ciclos</label>
                <input
                  type="number"
                  name="total_notas"
                  value={config.total_notas}
                  onChange={handleInputChange}
                  min="1"
                />
              </div>
            </div>
            {config.ciclo_notas !== 0 && (
              <div className="rangos-ciclos-notas">
                <h3>Rangos de ciclos de notas</h3>
                <div className="config-table-wrap">
                <table className="rangos-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Inicio</th>
                      <th>Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: totalNotas }, (_, i) => i + 1).map(ciclo => (
                      <tr key={ciclo}>
                        <th>{cicloLabel} {ciclo}</th>
                        <td>
                          <input
                            type="text"
                            placeholder="dd-mm"
                            value={config.rangos_ciclos_notas[ciclo]?.inicio || ''}
                            onChange={(e) => handleRangoCicloNotaChange(ciclo, 'inicio', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="dd-mm"
                            value={config.rangos_ciclos_notas[ciclo]?.final || ''}
                            onChange={(e) => handleRangoCicloNotaChange(ciclo, 'final', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'ciclo_notas', 'inicio_notas', 'total_notas', 'rangos_ciclos_notas'
                ], 'Notas')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar notas'}
              </button>
            </div>
            </div>
          </div>

          <div className="config-panel-card config-panel-card--spaced">
            <div className="config-panel-card-header config-panel-card-header--sky">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="notas" /></span>
              Conversión a letras
            </div>
            <div className="config-section">
            <button type="button" onClick={agregarRangoLetraPrimaria} className="btn-add">
              Agregar rango
            </button>
            <div className="config-table-wrap">
            <table className="rangos-table">
              <thead>
                <tr>
                  <th>Rango</th>
                  <th>Letra</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {config.rangos_letras_primaria.map((rango, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        value={rango.rango || ''}
                        onChange={(e) => handleRangoLetraPrimariaChange(index, 'rango', e.target.value)}
                        placeholder="Rango"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={rango.letra || ''}
                        onChange={(e) => handleRangoLetraPrimariaChange(index, 'letra', e.target.value)}
                        placeholder="Letra"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => eliminarRangoLetraPrimaria(index)}
                        className="btn-delete"
                        aria-label="Eliminar"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'rangos_letras_primaria'
                ], 'Conversión a Notas a Letras')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar conversión'}
              </button>
            </div>
            </div>
          </div>
          </>
          )}

          {/* APRECIACIONES — oculto; las tutoras ingresan apreciaciones manualmente */}
          {false && (
          <div className="config-panel-card config-panel-card--hidden">
            <div className="config-panel-card-header config-panel-card-header--sky">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="notas" /></span>
              Apreciaciones
            </div>
            <div className="config-section">
            <button type="button" onClick={agregarRangoMensaje} className="btn-add">
              ➕ Agregar Nuevo
            </button>
            <table className="rangos-table">
              <thead>
                <tr>
                  <th>Rango / Letra</th>
                  <th>Apreciación</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {config.rangos_mensajes.map((rango, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        value={rango.rango || ''}
                        onChange={(e) => handleRangoMensajeChange(index, 'rango', e.target.value)}
                        placeholder="Rango"
                        style={{ width: '90px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={rango.mensaje || ''}
                        onChange={(e) => handleRangoMensajeChange(index, 'mensaje', e.target.value)}
                        placeholder="Mensaje"
                        style={{ width: '300px' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => eliminarRangoMensaje(index)}
                        className="btn-delete"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'rangos_mensajes'
                ], 'Apreciaciones')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            </div>
          </div>
          )}

          {activeTab === 'facturacion' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--indigo">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="facturacion" /></span>
              Facturación
            </div>
            <div className="config-section">
            <div className="form-grid">
              <div className="form-group">
                <label>RUC</label>
                <input
                  type="text"
                  name="ruc"
                  value={config.ruc}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Razón Social</label>
                <input
                  type="text"
                  name="razon_social"
                  value={config.razon_social}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Dirección</label>
                <input
                  type="text"
                  name="direccion"
                  value={config.direccion}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>Link Consulta Boletas</label>
                <input
                  type="text"
                  name="link_consulta_facturas"
                  value={config.link_consulta_facturas}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'ruc', 'razon_social', 'direccion', 'link_consulta_facturas'
                ], 'Facturación')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar facturación'}
              </button>
            </div>
            </div>
          </div>
          )}

          {activeTab === 'matricula' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--rose">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="matricula" /></span>
              Matrícula online
            </div>
            <div className="config-section">
              <p className="config-section-desc">
                Formulario público en <strong>/matricula_online</strong>. Al enviar, se crea matrícula <strong>Temporal</strong> (sin pagos) para el año «Año Matrículas + 1».
              </p>
            <div className="form-grid form-grid--matricula">
              <div className="form-group">
                <label>Habilitar formulario</label>
                <select
                  name="enable_enrollment_form"
                  value={config.enable_enrollment_form}
                  onChange={handleInputChange}
                >
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </div>
              <div className="form-group">
                <label>Remitente de emails</label>
                <input
                  type="text"
                  name="remitente_emails"
                  value={config.remitente_emails}
                  onChange={handleInputChange}
                  placeholder="Nombre del colegio"
                />
              </div>
              <MatriculaDestinatarios
                value={config.matricula_online_personal_ids || ''}
                onChange={(ids) => setConfig((prev) => ({ ...prev, matricula_online_personal_ids: ids }))}
              />
              <div className="form-group full-width">
                <label>Mensaje para el apoderado</label>
                <div className="config-quill-wrap">
                  <ReactQuill
                    ref={quillMatriculaRef}
                    theme="snow"
                    value={config.email_matricula_apoderado || ''}
                    onChange={handleMatriculaMensajeChange}
                    modules={quillModulesMatricula}
                    formats={QUILL_FORMATS_MATRICULA}
                    placeholder="Estimado/a {{nombre_apoderado}}, hemos recibido la matrícula de {{nombre_alumno}}..."
                    className="config-quill-editor"
                  />
                </div>
                <small>
                  Intro del correo al apoderado (el sistema añade el marco visual y el resumen de datos).
                  Etiquetas: <code>{'{{nombre_apoderado}}'}</code>, <code>{'{{nombre_alumno}}'}</code>,{' '}
                  <code>{'{{nivel}}'}</code>, <code>{'{{grado}}'}</code>, <code>{'{{anio_matricula}}'}</code>,{' '}
                  <code>{'{{fecha_registro}}'}</code>, <code>{'{{colegio}}'}</code>, <code>{'{{seguro}}'}</code>.
                  Si deja vacío, se usa el texto predeterminado.
                </small>
              </div>
            </div>
            <div className="card-actions">
              <button 
                type="button" 
                onClick={() => handleSaveSection([
                  'enable_enrollment_form', 'remitente_emails',
                  'matricula_online_personal_ids', 'email_matricula_apoderado'
                ], 'Matrícula Online')}
                disabled={saving}
                className="btn-submit-card"
              >
                {saving ? 'Guardando…' : 'Guardar matrícula online'}
              </button>
            </div>
            </div>
          </div>
          )}

          {activeTab === 'tutoria' && user?.tipo === 'ADMINISTRADOR' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--emerald">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="tutoria" /></span>
              Tutoría general
            </div>
            <div className="config-section">
              <PanelTutoriaGeneral />
            </div>
          </div>
          )}

          {activeTab === 'cajero' && user?.tipo === 'ADMINISTRADOR' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--orange">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="cajero" /></span>
              Cajero — Caja chica
            </div>
            <div className="config-section">
              <PanelCajerosCajaChica />
            </div>
          </div>
          )}

          {activeTab === 'biblioteca' && user?.tipo === 'ADMINISTRADOR' && (
          <div className="config-panel-card">
            <div className="config-panel-card-header config-panel-card-header--teal">
              <span className="config-panel-card-ico" aria-hidden="true"><ConfigTabIcon name="biblioteca" /></span>
              Biblioteca — personal autorizado
            </div>
            <div className="config-section">
              <PanelBibliotecaPersonal />
            </div>
          </div>
          )}

      </div>
    </div>
  );
}

export default AdminConfiguracion;