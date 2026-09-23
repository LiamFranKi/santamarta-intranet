import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import GrupoAlumnosListaView from '../../components/grupoAlumnos/GrupoAlumnosListaView';
import { useGrupoReportesConducta } from '../../components/grupoReportes/useGrupoReportesConducta';
import GrupoHorarioCompletoModal from '../../components/grupoHorario/GrupoHorarioCompletoModal';
import AdminGrupoAsistenciaModal from '../../components/admin/AdminGrupoAsistenciaModal';
import AdminGrupoConductaModal from '../../components/admin/AdminGrupoConductaModal';
import ModalCopiarContenidoAsignatura from '../../components/admin/ModalCopiarContenidoAsignatura';
import ModalCriteriosIndicadoresAsignatura from '../../components/admin/ModalCriteriosIndicadoresAsignatura';
import ModalRegistrarNotasAsignatura from '../../components/admin/ModalRegistrarNotasAsignatura';
import LibretaInicialAreasModal from '../../components/libretaInicial/LibretaInicialAreasModal';
import LibretaInicialRegistroModal from '../../components/libretaInicial/LibretaInicialRegistroModal';
import { exportGrupoCarnetsPdfA4 } from '../../utils/carnetQrPdf';
import { generarPDFNotasTutoria } from '../../utils/pdfNotasTutoria';
import { opcionesGrupoMenuParaFila } from '../../utils/opcionesMenuGrupo';
import { abrirVerLibretasGrupo } from '../../utils/exportLibretasGrupoPdf';
import { ETIQUETA_CO_TUTOR, ETIQUETA_TUTOR, ERROR_TUTORES_MISMA_PERSONA } from '../../utils/tutoresGrupoTexto';
import { jsPDF } from 'jspdf';
import './AdminDocumentosGestion.css';
import './AdminAcademico.css';

/** SweetAlert2 siempre por encima de modales académico (overlay ~25000) y navbar (sidebar ~9999). Swal v11 ignora zIndex en .fire(). */
const SwalAcademico = Swal.mixin({
  target: document.body,
  customClass: { container: 'admin-academico-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '500000', 'important');
  },
});

/** Evita que el sidebar (z-index 9999) cubra el modal: render fuera de .dashboard-content. */
function ModalRoot({ open, onClose, children, wide, modalClassName }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('admin-academico-modal-open');
    return () => document.body.classList.remove('admin-academico-modal-open');
  }, [open]);

  if (!open) return null;
  const modalCls = [
    'admin-academico-modal',
    wide ? 'admin-academico-modal--wide' : '',
    modalClassName || ''
  ]
    .filter(Boolean)
    .join(' ');
  return createPortal(
    <div className="admin-academico-modal-overlay" onClick={onClose}>
      <div className={modalCls} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body
  );
}

function Btn({ children, onClick, variant, disabled }) {
  return (
    <button
      type="button"
      className={variant === 'ghost' ? 'dg-btn-ghost' : 'dg-btn-primary'}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function useSection() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const m = pathname.match(/\/admin\/academico\/([^/]+)/);
    return m ? m[1] : 'niveles';
  }, [pathname]);
}

export default function AdminAcademico() {
  const section = useSection();
  const asignaturasAccionesRef = useRef({ openNew: null });
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const loadMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/academico/meta');
      setMeta(data);
    } catch (e) {
      console.error(e);
      SwalAcademico.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar el catálogo base' });
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    document.body.classList.add('admin-academico-page');
    return () => document.body.classList.remove('admin-academico-page');
  }, []);

  const titles = {
    niveles: {
      title: 'Niveles',
      desc: 'Niveles de enseñanza (Inicial, Primaria, Secundaria, etc.)',
      icon: '🎓',
    },
    grados: {
      title: 'Grados',
      desc: `Aulas por año: grado, sección, turno, sede, ${ETIQUETA_TUTOR} y ${ETIQUETA_CO_TUTOR} (equivalente a grupos del año activo).`,
      icon: '🏫',
    },
    cursos: {
      title: 'Cursos',
      desc: 'Cursos o espacios curriculares (Matemática, Comunicación, etc.).',
      icon: '📚',
    },
    asignaturas: {
      title: 'Asignaturas',
      desc: 'Asignación docente por grupo y curso.',
      icon: '📋',
    },
    areas: {
      title: 'Áreas',
      desc: 'Áreas curriculares y su vínculo con cursos (para libretas y reportes).',
      icon: '🗂️',
    },
  };
  const info = titles[section] || titles.niveles;

  if (loadingMeta && !meta) {
    return (
      <div className="admin-academico-wrap">
        <p className="admin-aca-loading">Cargando catálogo académico…</p>
      </div>
    );
  }

  return (
    <div className="admin-academico-wrap dg-page">
      <header
        className={`admin-aca-hero${section === 'asignaturas' ? ' admin-aca-hero--with-action' : ''}`}
      >
        <div className="admin-aca-hero-icon" aria-hidden="true">
          {info.icon}
        </div>
        <div className="admin-aca-hero-text">
          <h1>{info.title}</h1>
          <p>{info.desc}</p>
        </div>
        {section === 'asignaturas' && (
          <button
            type="button"
            className="admin-academico-grupos-btn-nuevo admin-academico-asignaturas-header-btn"
            onClick={() => asignaturasAccionesRef.current?.openNew?.()}
          >
            + Nueva Asignatura
          </button>
        )}
      </header>

      <div className="admin-aca-help">
        <div className="admin-aca-help-icon" aria-hidden="true">
          💡
        </div>
        <div>
          <h2>{info.title}</h2>
          <p>Gestioná el catálogo académico. Los cambios impactan aulas, libretas y reportes.</p>
        </div>
      </div>

      {section === 'niveles' && <NivelesPanel onRefreshMeta={loadMeta} />}
      {section === 'grados' && <GruposPanel meta={meta} />}
      {section === 'cursos' && <CursosPanel meta={meta} />}
      {section === 'areas' && <AreasPanel meta={meta} />}
      {section === 'asignaturas' && (
        <AsignaturasPanel meta={meta} accionesRef={asignaturasAccionesRef} />
      )}
    </div>
  );
}

const NIVEL_FORM_DEFAULT = {
  nombre: '',
  abreviatura: '',
  codigo_modular: '',
  definicion_grado: '',
  grado_minimo: '',
  grado_maximo: '',
  tipo_calificacion: '',
  tipo_calificacion_final: '',
  nota_maxima: '',
  nota_minima: '',
  nota_aprobatoria: '',
  hora_entrada: '',
  tolerancia_minutos: ''
};

function nivelFormFromRow(r) {
  const o = { ...NIVEL_FORM_DEFAULT };
  if (!r) return o;
  for (const k of Object.keys(NIVEL_FORM_DEFAULT)) {
    if (r[k] === undefined || r[k] === null) continue;
    o[k] = String(r[k]);
  }
  return o;
}

/** Legacy: tipo_calificacion 0 = cualitativa, 1 = cuantitativa */
function parseTipoCal(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function labelTipoCalificacion(r) {
  const t = parseTipoCal(r.tipo_calificacion);
  if (t === 0) return 'Cualitativa';
  if (t === 1) return 'Cuantitativa';
  return '—';
}

/** Legacy: tipo_calificacion_final 0 = promedio, 1 = porcentual (solo relevante si es cuantitativa) */
function labelTipoCalificacionFinal(r) {
  const t = parseTipoCal(r.tipo_calificacion_final);
  if (t === 0) return 'Promedio';
  if (t === 1) return 'Porcentual';
  return '—';
}

function esCuantitativa(r) {
  return parseTipoCal(r.tipo_calificacion) === 1;
}

function esCuantitativaForm(form) {
  return parseTipoCal(form.tipo_calificacion) === 1;
}

/** Listas mín/máx: valores 1–10; en pantalla se muestran como 01–10 */
const OPCIONES_GRADO_ANIO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Solo GRADOS o AÑOS y el rango (ej. Grados · 01–06) */
function construirDefinicionGrado(modoRango, gmin, gmax) {
  const m = modoRango === 'años' ? 'Años' : 'Grados';
  return `${m} · ${pad2(gmin)}–${pad2(gmax)}`;
}

function inferModoRangoFromRow(r) {
  const d = String(r.definicion_grado || '');
  if (/^\s*años\b/i.test(d) || /\bAños\s*·/i.test(d)) return 'años';
  if (/^\s*grados\b/i.test(d) || /\bGrados\s*·/i.test(d)) return 'grados';
  const gmin = parseInt(r.grado_minimo, 10);
  const gmax = parseInt(r.grado_maximo, 10);
  if (
    Number.isFinite(gmin) &&
    Number.isFinite(gmax) &&
    gmin >= 3 &&
    gmin <= 5 &&
    gmax >= 3 &&
    gmax <= 5
  ) {
    return 'años';
  }
  return 'grados';
}

function NivelModalFormBody({ modal, form, setForm, nivelUi, onModoRangoChange, onCancel, onGuardar }) {
  const cuant = esCuantitativaForm(form);

  return (
    <>
      <div className="admin-academico-nivel-form-card">
        <h3 className="admin-academico-nivel-form-card__title">
          {modal?.edit ? 'Editar nivel' : 'Nuevo nivel'}
        </h3>
        <p className="admin-academico-nivel-form-card__lead">
          Indique nombre, abreviatura y código; defina si el nivel es por <strong>GRADOS</strong> o por <strong>AÑOS</strong> con
          mínimo y máximo; calificación y asistencia.
        </p>

        <div className="admin-academico-nivel-form-grid">
          <div className="admin-academico-nivel-form-row-3">
            <div className="admin-academico-nivel-form-field">
              <label>
                nombre <span className="admin-academico-nivel-form-req">*</span>
              </label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Primaria"
              />
            </div>
            <div className="admin-academico-nivel-form-field">
              <label>abreviatura</label>
              <input
                value={form.abreviatura}
                onChange={(e) => setForm({ ...form, abreviatura: e.target.value })}
                placeholder="ej. PRI"
              />
            </div>
            <div className="admin-academico-nivel-form-field">
              <label>código modular</label>
              <input
                value={form.codigo_modular}
                onChange={(e) => setForm({ ...form, codigo_modular: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="admin-academico-nivel-form-row-definicion">
            <div className="admin-academico-nivel-form-field">
              <label>
                definición <span className="admin-academico-nivel-form-req">*</span>
              </label>
              <select value={nivelUi.modoRango} onChange={(e) => onModoRangoChange(e.target.value)}>
                <option value="grados">GRADOS</option>
                <option value="años">AÑOS</option>
              </select>
            </div>
            <div className="admin-academico-nivel-form-field">
              <label>
                mínimo <span className="admin-academico-nivel-form-req">*</span>
              </label>
              <select
                value={form.grado_minimo}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const gmin = parseInt(v, 10);
                    const gmax = parseInt(f.grado_maximo, 10);
                    if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmin > gmax) {
                      return { ...f, grado_minimo: v, grado_maximo: v };
                    }
                    return { ...f, grado_minimo: v };
                  });
                }}
              >
                {OPCIONES_GRADO_ANIO.map((n) => (
                  <option key={`min-${n}`} value={String(n)}>
                    {pad2(n)}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-academico-nivel-form-field">
              <label>
                máximo <span className="admin-academico-nivel-form-req">*</span>
              </label>
              <select
                value={form.grado_maximo}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const gmax = parseInt(v, 10);
                    const gmin = parseInt(f.grado_minimo, 10);
                    if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmin > gmax) {
                      return { ...f, grado_maximo: v, grado_minimo: v };
                    }
                    return { ...f, grado_maximo: v };
                  });
                }}
              >
                {OPCIONES_GRADO_ANIO.map((n) => (
                  <option key={`max-${n}`} value={String(n)}>
                    {pad2(n)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-academico-nivel-form-row-2-cal">
            <div className="admin-academico-nivel-form-field">
              <label>
                tipo de calificación <span className="admin-academico-nivel-form-req">*</span>
              </label>
              <select
                value={form.tipo_calificacion === '' ? '' : String(form.tipo_calificacion)}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
                    ...f,
                    tipo_calificacion: v,
                    ...(v === '0'
                      ? {
                          tipo_calificacion_final: '',
                          nota_maxima: '',
                          nota_minima: '',
                          nota_aprobatoria: ''
                        }
                      : {
                          tipo_calificacion_final: f.tipo_calificacion_final || '0',
                          nota_maxima: f.nota_maxima || '20',
                          nota_minima: f.nota_minima || '0',
                          nota_aprobatoria: f.nota_aprobatoria || '11'
                        })
                  }));
                }}
              >
                <option value="">— Seleccione —</option>
                <option value="0">Cualitativa</option>
                <option value="1">Cuantitativa</option>
              </select>
            </div>
            <div className="admin-academico-nivel-form-field">
              <label>tipo de calificación final</label>
              <select
                value={
                  cuant
                    ? form.tipo_calificacion_final === ''
                      ? '0'
                      : String(form.tipo_calificacion_final)
                    : ''
                }
                onChange={(e) => setForm({ ...form, tipo_calificacion_final: e.target.value })}
                disabled={!cuant}
              >
                {cuant ? (
                  <>
                    <option value="0">Promedio</option>
                    <option value="1">Porcentaje</option>
                  </>
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
          </div>

          {cuant && (
            <div className="admin-academico-nivel-form-row-3-notas">
              <div className="admin-academico-nivel-form-field">
                <label>nota máxima</label>
                <input
                  value={form.nota_maxima}
                  onChange={(e) => setForm({ ...form, nota_maxima: e.target.value })}
                  inputMode="decimal"
                  placeholder="20"
                />
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>nota mínima</label>
                <input
                  value={form.nota_minima}
                  onChange={(e) => setForm({ ...form, nota_minima: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>nota aprobatoria</label>
                <input
                  value={form.nota_aprobatoria}
                  onChange={(e) => setForm({ ...form, nota_aprobatoria: e.target.value })}
                  inputMode="decimal"
                  placeholder="11"
                />
              </div>
            </div>
          )}

          <p className="admin-academico-nivel-form-section-title admin-academico-nivel-form-section-title--asist">
            Asistencia
          </p>

          <div className="admin-academico-nivel-form-field">
            <label>hora de entrada</label>
            <input
              type="time"
              step={1}
              value={
                form.hora_entrada && form.hora_entrada.length >= 5
                  ? form.hora_entrada.slice(0, 5)
                  : form.hora_entrada || ''
              }
              onChange={(e) => {
                const t = e.target.value;
                setForm({ ...form, hora_entrada: t ? `${t}:00` : '' });
              }}
            />
            <p className="admin-academico-nivel-form-micro">Formato HH:MM:SS.</p>
          </div>
          <div className="admin-academico-nivel-form-field">
            <label>tolerancia (minutos)</label>
            <input
              type="number"
              min={0}
              value={form.tolerancia_minutos}
              onChange={(e) => setForm({ ...form, tolerancia_minutos: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="admin-academico-modal-actions">
        <Btn variant="ghost" onClick={onCancel}>
          Cancelar
        </Btn>
        <Btn onClick={onGuardar}>Guardar</Btn>
      </div>
    </>
  );
}

/** Fondos pasteles suaves + borde (Niveles, Grados/grupos, etc.) */
const PASTEL_CARD_THEMES = [
  { bg: '#eff6ff', border: '#bfdbfe' },
  { bg: '#ecfdf5', border: '#a7f3d0' },
  { bg: '#fffbeb', border: '#fde68a' },
  { bg: '#fdf2f8', border: '#fbcfe8' },
  { bg: '#f5f3ff', border: '#ddd6fe' },
  { bg: '#fff7ed', border: '#fed7aa' }
];

const SECCIONES_GRUPO = [
  { v: 'UNICA', l: 'Única' },
  { v: 'A', l: 'A' },
  { v: 'B', l: 'B' },
  { v: 'C', l: 'C' },
  { v: 'D', l: 'D' },
  { v: 'E', l: 'E' },
  { v: 'F', l: 'F' }
];

function gradosDisponiblesPorNivel(nivelId, niveles) {
  const n = (niveles || []).find((x) => String(x.id) === String(nivelId));
  if (!n) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let min = parseInt(n.grado_minimo, 10);
  let max = parseInt(n.grado_maximo, 10);
  if (!Number.isFinite(min)) min = 1;
  if (!Number.isFinite(max)) max = 10;
  if (min > max) [min, max] = [max, min];
  const arr = [];
  for (let i = min; i <= max; i += 1) arr.push(i);
  return arr.length ? arr : [1];
}

/** Orden fijo: Inicial → Primaria → Secundaria (resto al final por nombre). */
function ordenNivelEducativo(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 0;
  if (n.includes('primaria')) return 1;
  if (n.includes('secundaria')) return 2;
  return 50;
}

function ordenarNivelesInicialPrimariaSecundaria(niveles) {
  return [...(niveles || [])].sort((a, b) => {
    const oa = ordenNivelEducativo(a.nombre);
    const ob = ordenNivelEducativo(b.nombre);
    if (oa !== ob) return oa - ob;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });
}

/** Grupos en selects/modales: Inicial → Primaria → Secundaria, luego grado y sección. */
function ordenarGruposInicialPrimariaSecundaria(grupos) {
  return [...(grupos || [])].sort((a, b) => {
    const oa = ordenNivelEducativo(a.nivel_nombre);
    const ob = ordenNivelEducativo(b.nivel_nombre);
    if (oa !== ob) return oa - ob;
    const ga = parseInt(a.grado, 10) || 0;
    const gb = parseInt(b.grado, 10) || 0;
    if (ga !== gb) return ga - gb;
    return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es');
  });
}

function etiquetaSeccionGrupo(sec) {
  const u = String(sec || '').toUpperCase();
  if (u === 'UNICA' || u === 'ÚNICA') return 'Única';
  return String(sec || '').toUpperCase();
}

function IconoLapiz() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7 21l-4 1 1-4L17 3z" />
    </svg>
  );
}

function IconoPapelera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

const OPCIONES_GRUPO_MENU = [
  { key: 'lista_alumnos', label: 'Lista de Alumnos', icon: '👥' },
  { key: 'ver_horario', label: 'Ver Horario', icon: '🗓️' },
  { key: 'registro_asistencia', label: 'Registro de Asistencia', icon: '📝' },
  { key: 'imprimir_qr', label: 'Imprimir QR', icon: '🧾' },
  { key: 'ver_nomina', label: 'Ver Nómina', icon: '📄' },
  { key: 'registro_notas', label: 'Registro de Notas', icon: '📚' },
  { key: 'registrar_conducta', label: 'Registrar Conducta', icon: '📝' },
  { key: 'recomendaciones', label: 'Recomendaciones', icon: '💡' },
  { key: 'reporte_incidencias', label: 'Incidencia', icon: '📌' },
  { key: 'reporte_estrellas', label: 'Estrellas', icon: '⭐' },
  { key: 'reporte_presentacion', label: 'Presentación', icon: '📉' },
  { key: 'editar', label: 'Editar', icon: '✏️' },
  { key: 'eliminar', label: 'Eliminar', icon: '🗑️', danger: true }
];

/** Ítems del menú Opciones en tarjetas de grupo para perfil PSICOLOGA (solo lectura académica). */
const KEYS_OPCIONES_GRUPO_PSICOLOGA = new Set([
  'lista_alumnos',
  'reporte_incidencias',
  'reporte_estrellas',
  'reporte_presentacion',
  'ver_horario',
  'ver_nomina',
]);

/** Menú Opciones de grado en portal (evita recorte por overflow del dashboard). */
function GrupoOpcionesMenuPortal({ open, anchorEl, onClose, children }) {
  const [pos, setPos] = useState({ top: 8, left: 8, width: 260, maxH: 420 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return undefined;
    const place = () => {
      const r = anchorEl.getBoundingClientRect();
      const w = Math.max(240, Math.min(280, r.width));
      let left = r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      const gap = 6;
      const top = r.bottom + gap;
      const maxH = Math.max(120, Math.min(480, window.innerHeight - top - 8));
      setPos({ top, left, width: w, maxH });
    };
    place();
    const t = window.setTimeout(place, 0);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorEl]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <>
      <div
        className="admin-academico-grupo-card__dropdown-backdrop"
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="admin-academico-grupo-card__dropdown admin-academico-grupo-card__dropdown--portal"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxH,
          overflowY: 'auto',
          zIndex: 10060,
        }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

function NivelesPanel({ onRefreshMeta }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => ({ ...NIVEL_FORM_DEFAULT }));
  const [nivelUi, setNivelUi] = useState({ modoRango: 'grados' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/niveles');
      setRows(data.niveles || []);
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setNivelUi({ modoRango: 'grados' });
    setForm({
      ...NIVEL_FORM_DEFAULT,
      hora_entrada: '08:00:00',
      tolerancia_minutos: '5',
      grado_minimo: '1',
      grado_maximo: '6',
      tipo_calificacion: '1',
      tipo_calificacion_final: '0',
      nota_maxima: '20',
      nota_minima: '0',
      nota_aprobatoria: '11'
    });
    setModal('new');
  };

  const openEdit = (r) => {
    const modoRango = inferModoRangoFromRow(r);
    setNivelUi({ modoRango });
    const f = nivelFormFromRow(r);
    const clamp = (v) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return '1';
      return String(Math.min(10, Math.max(1, n)));
    };
    f.grado_minimo = clamp(f.grado_minimo);
    f.grado_maximo = clamp(f.grado_maximo);
    const gmin = parseInt(f.grado_minimo, 10);
    const gmax = parseInt(f.grado_maximo, 10);
    if (gmin > gmax) {
      f.grado_maximo = f.grado_minimo;
    }
    setForm(f);
    setModal({ edit: r });
  };

  const handleModoRangoChange = (modo) => {
    setNivelUi({ modoRango: modo });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      SwalAcademico.fire({ icon: 'warning', title: 'Indique el nombre' });
      return;
    }
    const gmin = parseInt(form.grado_minimo, 10);
    const gmax = parseInt(form.grado_maximo, 10);
    if (
      !Number.isFinite(gmin) ||
      !Number.isFinite(gmax) ||
      gmin > gmax ||
      gmin < 1 ||
      gmax > 10
    ) {
      SwalAcademico.fire({ icon: 'warning', title: 'Revise mínimo y máximo (01 a 10)' });
      return;
    }
    if (form.tipo_calificacion === '' || form.tipo_calificacion == null) {
      SwalAcademico.fire({ icon: 'warning', title: 'Seleccione el tipo de calificación' });
      return;
    }
    const nombreNivel = String(form.nombre || '').toUpperCase();
    const nivelCneb =
      nombreNivel.includes('SECUNDARIA') || nombreNivel.includes('PRIMARIA') || nombreNivel.includes('INICIAL');
    const tipoAntes = modal?.edit != null ? String(modal.edit.tipo_calificacion ?? '') : null;
    const tipoAhora = String(form.tipo_calificacion);
    if (nivelCneb && tipoAntes != null && tipoAntes !== '' && tipoAntes !== tipoAhora) {
      const aCuali = tipoAhora === '0';
      const ok = await SwalAcademico.fire({
        icon: 'question',
        title: 'CNEB cambia con el tipo',
        text: aCuali
          ? 'Este nivel pasará a cualitativo y quedará con CNEB en el aula. Las notas y las sesiones se quedan guardadas.'
          : 'Este nivel pasará a cuantitativo: números y la boleta de antes. CNEB se desmarca. No se borra nada.',
        showCancelButton: true,
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar',
      });
      if (!ok.isConfirmed) return;
    }
    const cuant = esCuantitativaForm(form);
    const body = {
      ...form,
      definicion_grado: construirDefinicionGrado(nivelUi.modoRango, gmin, gmax),
      tipo_calificacion_final: cuant ? form.tipo_calificacion_final : '',
      nota_maxima: cuant ? form.nota_maxima : '',
      nota_minima: cuant ? form.nota_minima : '',
      nota_aprobatoria: cuant ? form.nota_aprobatoria : ''
    };
    try {
      if (modal?.edit) {
        await api.put(`/admin/academico/niveles/${modal.edit.id}`, body);
        SwalAcademico.fire({ icon: 'success', title: 'Actualizado', timer: 1400, showConfirmButton: false });
      } else {
        await api.post('/admin/academico/niveles', body);
        SwalAcademico.fire({ icon: 'success', title: 'Creado', timer: 1400, showConfirmButton: false });
      }
      setModal(null);
      await load();
      onRefreshMeta();
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (r) => {
    const ok = await SwalAcademico.fire({
      icon: 'question',
      title: '¿Eliminar nivel?',
      text: r.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/niveles/${r.id}`);
      await load();
      onRefreshMeta();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  return (
    <section className="dg-section">
      <div className="dg-section-title">
        <span>Listado</span>
        <Btn onClick={openNew}>+ Nuevo nivel</Btn>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="admin-academico-niveles-empty">No hay niveles registrados. Use «+ Nuevo nivel» para crear uno.</p>
      ) : (
        <div className="admin-academico-niveles-grid">
          {rows.map((r, idx) => {
            const cuant = esCuantitativa(r);
            const theme = PASTEL_CARD_THEMES[idx % PASTEL_CARD_THEMES.length];
            const tieneNotasNum =
              cuant &&
              [r.nota_aprobatoria, r.nota_maxima, r.nota_minima].some(
                (v) => v != null && v !== ''
              );
            return (
              <article
                key={r.id}
                className="admin-academico-nivel-card admin-academico-nivel-card--compact"
                style={{ background: theme.bg, borderColor: theme.border }}
              >
                <div className="admin-academico-nivel-card__head">
                  <div className="admin-academico-nivel-card__titles">
                    <h3 className="admin-academico-nivel-card__nombre">{r.nombre || 'Sin nombre'}</h3>
                    {r.abreviatura ? (
                      <p className="admin-academico-nivel-card__sub">{r.abreviatura}</p>
                    ) : null}
                  </div>
                </div>

                <div className="admin-academico-nivel-card__body">
                  <p className="admin-academico-nivel-card__line">
                    <span className="admin-academico-nivel-card__line-label">Calificación</span>{' '}
                    <span className="admin-academico-nivel-card__line-val">{labelTipoCalificacion(r)}</span>
                  </p>
                  {!cuant && (
                    <p className="admin-academico-nivel-card__hint">Letras A–D (sin notas numéricas)</p>
                  )}
                  {cuant && (
                    <p className="admin-academico-nivel-card__line admin-academico-nivel-card__line--dense">
                      <span className="admin-academico-nivel-card__line-label">Final</span>{' '}
                      <span className="admin-academico-nivel-card__line-val">{labelTipoCalificacionFinal(r)}</span>
                      {tieneNotasNum && (
                        <span className="admin-academico-nivel-card__notas-inline">
                          {r.nota_aprobatoria != null && r.nota_aprobatoria !== '' && (
                            <span>
                              · Aprob. <strong>{r.nota_aprobatoria}</strong>
                            </span>
                          )}
                          {r.nota_maxima != null && r.nota_maxima !== '' && (
                            <span>
                              · Máx. <strong>{r.nota_maxima}</strong>
                            </span>
                          )}
                          {r.nota_minima != null && r.nota_minima !== '' && (
                            <span>
                              · Mín. <strong>{r.nota_minima}</strong>
                            </span>
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="admin-academico-nivel-card__foot">
                  <div className="admin-academico-nivel-card__actions">
                    <button
                      type="button"
                      className="admin-academico-nivel-card__icon-btn admin-academico-nivel-card__icon-btn--edit"
                      title="Editar"
                      aria-label="Editar nivel"
                      onClick={() => openEdit(r)}
                    >
                      <IconoLapiz />
                    </button>
                    <button
                      type="button"
                      className="admin-academico-nivel-card__icon-btn admin-academico-nivel-card__icon-btn--del"
                      title="Eliminar"
                      aria-label="Eliminar nivel"
                      onClick={() => eliminar(r)}
                    >
                      <IconoPapelera />
                    </button>
                  </div>
                  <div className="admin-academico-nivel-card__foot-meta">
                    <span className="admin-academico-nivel-card__clock" title="Hora de entrada (asistencia)">
                      Entrada {r.hora_entrada || '—'}
                    </span>
                    <span className="admin-academico-nivel-card__id">ID {r.id}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ModalRoot
        open={!!modal}
        onClose={() => setModal(null)}
        wide
        modalClassName="admin-academico-modal--nivel-form"
      >
        <NivelModalFormBody
          modal={modal}
          form={form}
          setForm={setForm}
          nivelUi={nivelUi}
          onModoRangoChange={handleModoRangoChange}
          onCancel={() => setModal(null)}
          onGuardar={guardar}
        />
      </ModalRoot>
    </section>
  );
}

function GruposPanel({ meta }) {
  const { user } = useAuth();
  const esPsicologa = user?.tipo === 'PSICOLOGA';
  const vistaSoloLecturaGrados = esPsicologa;
  const ocultarMutacionGrado = esPsicologa;
  const opcionesGrupoMenuVisibles = useMemo(
    () => {
      if (esPsicologa) {
        return OPCIONES_GRUPO_MENU.filter((op) => KEYS_OPCIONES_GRUPO_PSICOLOGA.has(op.key));
      }
      return OPCIONES_GRUPO_MENU;
    },
    [esPsicologa]
  );
  const anioDef = meta?.anio_activo || new Date().getFullYear();
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioDef);
  const [filtroNivelId, setFiltroNivelId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [menuGrupoId, setMenuGrupoId] = useState(null);
  const [menuGrupoAnchor, setMenuGrupoAnchor] = useState(null);
  const [listaAlumnosGrupoRow, setListaAlumnosGrupoRow] = useState(null);
  const [horarioModalGrupo, setHorarioModalGrupo] = useState(null);
  const [grupoAsistenciaAdmin, setGrupoAsistenciaAdmin] = useState(null);
  const [grupoConductaAdmin, setGrupoConductaAdmin] = useState(null);
  const [mostrarModalRecomendacionesAdmin, setMostrarModalRecomendacionesAdmin] = useState(false);
  const [grupoRecomendacionesAdmin, setGrupoRecomendacionesAdmin] = useState(null);
  const [recomendacionesCicloAdmin, setRecomendacionesCicloAdmin] = useState(1);
  const [recomendacionesAlumnosAdmin, setRecomendacionesAlumnosAdmin] = useState([]);
  const [loadingRecomendacionesAdmin, setLoadingRecomendacionesAdmin] = useState(false);
  const [guardandoRecomendacionesAdmin, setGuardandoRecomendacionesAdmin] = useState(false);

  const reportesConducta = useGrupoReportesConducta({
    apiPathPrefix: 'docente/grupos',
    anioFallback: anio,
  });

  const personalLista = useMemo(() => {
    const base = meta?.personal?.length ? meta.personal : meta?.docentes || [];
    const byId = new Map();
    for (const p of base) {
      const id = String(p?.id ?? '');
      if (!id || byId.has(id)) continue;
      byId.set(id, p);
    }
    return [...byId.values()];
  }, [meta]);
  const nivelesLista = useMemo(
    () => ordenarNivelesInicialPrimariaSecundaria(meta?.niveles),
    [meta]
  );

  const añosSelect = useMemo(() => {
    const arr = [];
    for (let y = anioDef + 3; y >= anioDef - 10; y -= 1) arr.push(y);
    return arr;
  }, [anioDef]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { anio };
      if (filtroNivelId) params.nivel_id = filtroNivelId;
      const { data } = await api.get('/admin/academico/grupos', { params });
      setRows(data.grupos || []);
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    } finally {
      setLoading(false);
    }
  }, [anio, filtroNivelId]);

  useEffect(() => {
    load();
  }, [load]);

  const cerrarMenuGrupo = useCallback(() => {
    setMenuGrupoId(null);
    setMenuGrupoAnchor(null);
  }, []);

  useEffect(() => {
    if (menuGrupoId == null) return;
    const close = (e) => {
      if (e.target?.closest?.('.admin-academico-grupo-card__menu')) return;
      if (e.target?.closest?.('.admin-academico-grupo-card__dropdown--portal')) return;
      cerrarMenuGrupo();
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuGrupoId, cerrarMenuGrupo]);

  const gradosOpciones = useMemo(() => {
    const base = gradosDisponiblesPorNivel(form.nivel_id, nivelesLista);
    const g = parseInt(form.grado, 10);
    if (Number.isFinite(g) && !base.includes(g)) {
      return [...base, g].sort((a, b) => a - b);
    }
    return base;
  }, [form.nivel_id, form.grado, nivelesLista]);

  const filasGruposOrdenadas = useMemo(() => {
    return [...rows].sort((a, b) => {
      const oa = ordenNivelEducativo(a.nivel_nombre);
      const ob = ordenNivelEducativo(b.nivel_nombre);
      if (oa !== ob) return oa - ob;
      const ga = parseInt(a.grado, 10) || 0;
      const gb = parseInt(b.grado, 10) || 0;
      if (ga !== gb) return ga - gb;
      return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es');
    });
  }, [rows]);

  const verTodo = () => {
    setFiltroNivelId('');
    setAnio(anioDef);
  };

  const openNew = () => {
    const nid = nivelesLista[0]?.id || '';
    const gs = gradosDisponiblesPorNivel(nid, nivelesLista);
    setForm({
      anio: String(anioActual),
      nivel_id: nid,
      grado: String(gs[0] ?? 1),
      seccion: 'UNICA',
      turno_id: meta?.turnos?.[0]?.id || '',
      sede_id: meta?.sedes?.[0]?.id || '',
      tutor_id: '',
      tutor_id_2: ''
    });
    setModal('new');
  };

  const openEdit = (r) => {
    let sec = String(r.seccion || '').toUpperCase();
    if (sec === 'ÚNICA' || sec === 'UNICA') sec = 'UNICA';
    setForm({
      anio: String(r.anio),
      nivel_id: r.nivel_id,
      grado: String(r.grado),
      seccion: SECCIONES_GRUPO.some((s) => s.v === sec) ? sec : 'A',
      turno_id: r.turno_id,
      sede_id: r.sede_id,
      tutor_id: r.tutor_id || '',
      tutor_id_2: r.tutor_id_2 || ''
    });
    setModal({ edit: r });
  };

  const onNivelFormChange = (nivelId) => {
    const gs = gradosDisponiblesPorNivel(nivelId, nivelesLista);
    setForm((f) => ({
      ...f,
      nivel_id: nivelId,
      grado: String(gs.includes(parseInt(f.grado, 10)) ? parseInt(f.grado, 10) : gs[0])
    }));
  };

  const guardar = async () => {
    const t1 = form.tutor_id ? String(form.tutor_id) : '';
    const t2 = form.tutor_id_2 ? String(form.tutor_id_2) : '';
    if (t1 && t2 && t1 === t2) {
      SwalAcademico.fire({ icon: 'warning', text: ERROR_TUTORES_MISMA_PERSONA });
      return;
    }
    try {
      const body = {
        sede_id: form.sede_id,
        nivel_id: form.nivel_id,
        grado: parseInt(form.grado, 10),
        seccion: form.seccion,
        turno_id: form.turno_id,
        anio: parseInt(form.anio, 10),
        tutor_id: form.tutor_id,
        tutor_id_2: form.tutor_id_2
      };
      if (modal?.edit) {
        await api.put(`/admin/academico/grupos/${modal.edit.id}`, body);
      } else {
        await api.post('/admin/academico/grupos', body);
      }
      setModal(null);
      await load();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (r) => {
    const ok = await SwalAcademico.fire({
      icon: 'warning',
      title: '¿Eliminar grupo?',
      text: `${r.nivel_nombre} ${r.grado}° ${r.seccion}`,
      showCancelButton: true
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/grupos/${r.id}`);
      await load();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const cerrarModalRecomendacionesAdmin = () => {
    setMostrarModalRecomendacionesAdmin(false);
    setGrupoRecomendacionesAdmin(null);
    setRecomendacionesAlumnosAdmin([]);
  };

  const cargarRecomendacionesAdmin = async (grupoId, ciclo) => {
    if (!grupoId) return;
    try {
      setLoadingRecomendacionesAdmin(true);
      const res = await api.get(`/admin/academico/grupos/${grupoId}/recomendaciones`, { params: { ciclo } });
      setRecomendacionesAlumnosAdmin(res.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando recomendaciones:', error);
      SwalAcademico.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'No se pudieron cargar' });
      setRecomendacionesAlumnosAdmin([]);
    } finally {
      setLoadingRecomendacionesAdmin(false);
    }
  };

  const handleCambiarCicloRecomendacionesAdmin = (ciclo) => {
    setRecomendacionesCicloAdmin(ciclo);
    if (grupoRecomendacionesAdmin) {
      cargarRecomendacionesAdmin(grupoRecomendacionesAdmin.id, ciclo);
    }
  };

  const handleRecomendacionChangeAdmin = (matriculaId, valor) => {
    setRecomendacionesAlumnosAdmin((prev) =>
      prev.map((a) => (a.matricula_id === matriculaId ? { ...a, recomendacion: valor } : a))
    );
  };

  const handleGuardarRecomendacionesAdmin = async () => {
    if (!grupoRecomendacionesAdmin) return;
    try {
      setGuardandoRecomendacionesAdmin(true);
      const rec = {};
      recomendacionesAlumnosAdmin.forEach((a) => {
        rec[a.matricula_id] = a.recomendacion || '';
      });
      await api.post(`/admin/academico/grupos/${grupoRecomendacionesAdmin.id}/recomendaciones`, {
        ciclo: recomendacionesCicloAdmin,
        recomendaciones: rec,
      });
      SwalAcademico.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Recomendaciones guardadas correctamente',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error guardando recomendaciones:', error);
      SwalAcademico.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar',
      });
    } finally {
      setGuardandoRecomendacionesAdmin(false);
    }
  };

  const exportarPDFRecomendacionesAdmin = async () => {
    if (!recomendacionesAlumnosAdmin.length) {
      SwalAcademico.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const grupoNombre = grupoRecomendacionesAdmin
      ? `${grupoRecomendacionesAdmin.grado}° ${grupoRecomendacionesAdmin.seccion} - ${grupoRecomendacionesAdmin.nivel_nombre}`
      : '';
    let yPos = 0;
    const colorPrimario = [102, 126, 234];
    const colorBlanco = [255, 255, 255];

    try {
      const { cargarLogoPngDataUrl } = await import('../../utils/pdfReporteColegioLogo');
      const dataUrl = await cargarLogoPngDataUrl('/icons/logoboleta.png');
      if (dataUrl) doc.addImage(dataUrl, 'PNG', margin, 4, 24, 24);
    } catch (e) {
      /* ignorar */
    }

    doc.setFillColor(...colorPrimario);
    doc.rect(0, 0, pageWidth, 36, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorBlanco);
    doc.text('APRECIACIONES / RECOMENDACIONES', margin + 30, 14);
    doc.setFontSize(10);
    doc.setTextColor(240, 240, 240);
    doc.text(
      `Grupo: ${grupoNombre}  |  Bimestre: ${recomendacionesCicloAdmin}  |  Año: ${grupoRecomendacionesAdmin?.anio || ''}`,
      margin + 30,
      24
    );
    yPos = 42;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    recomendacionesAlumnosAdmin.forEach((a) => {
      if (yPos > pageHeight - 35) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${a.numero}. ${a.nombre_completo}`, margin, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const texto = (a.recomendacion || '').trim() || '(Sin recomendación)';
      const lineas = doc.splitTextToSize(texto, pageWidth - 2 * margin);
      lineas.forEach((l) => {
        doc.text(l, margin + 5, yPos);
        yPos += 5;
      });
      yPos += 5;
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, margin, pageHeight - 8);
    doc.save(`Recomendaciones_${grupoNombre.replace(/\s+/g, '_')}_B${recomendacionesCicloAdmin}.pdf`);
    SwalAcademico.fire({
      icon: 'success',
      title: 'PDF generado',
      text: 'El reporte se descargó correctamente',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  const accionGrupoMenu = async (accion, row) => {
    if (accion === 'editar') {
      if (ocultarMutacionGrado) return;
      openEdit(row);
      return;
    }
    if (accion === 'eliminar') {
      if (ocultarMutacionGrado) return;
      await eliminar(row);
      return;
    }
    if (accion === 'lista_alumnos') {
      cerrarMenuGrupo();
      setHorarioModalGrupo(null);
      setListaAlumnosGrupoRow(row);
      return;
    }
    if (accion === 'reporte_incidencias') {
      const meta = {
        id: row.id,
        grado: row.grado,
        seccion: row.seccion,
        nivel_nombre: row.nivel_nombre,
        turno_nombre: row.turno_nombre,
        anio: row.anio != null ? row.anio : anio,
      };
      reportesConducta.openIncidenciasGrupo(meta);
      return;
    }
    if (accion === 'reporte_estrellas') {
      const meta = {
        id: row.id,
        grado: row.grado,
        seccion: row.seccion,
        nivel_nombre: row.nivel_nombre,
        turno_nombre: row.turno_nombre,
        anio: row.anio != null ? row.anio : anio,
      };
      reportesConducta.openEstrellasGrupo(meta);
      return;
    }
    if (accion === 'reporte_presentacion') {
      const meta = {
        id: row.id,
        grado: row.grado,
        seccion: row.seccion,
        nivel_nombre: row.nivel_nombre,
        turno_nombre: row.turno_nombre,
        anio: row.anio != null ? row.anio : anio,
      };
      reportesConducta.openDescuentosPresentacion(meta);
      return;
    }
    if (accion === 'ver_horario') {
      cerrarMenuGrupo();
      setHorarioModalGrupo(row);
      return;
    }
    if (accion === 'registro_asistencia') {
      if (vistaSoloLecturaGrados) return;
      setGrupoAsistenciaAdmin(row);
      return;
    }
    if (accion === 'ver_nomina') {
      cerrarMenuGrupo();
      try {
        const { elegirFormatoExportNomina, exportarExcelNominaGrupo } = await import(
          '../../utils/excelNominaAlumnosGrupo'
        );
        const { generarPdfNominaUnGrupo } = await import('../../utils/pdfNominaAlumnosGrupo');
        const formato = await elegirFormatoExportNomina(SwalAcademico);
        if (!formato) return;

        SwalAcademico.fire({
          title: formato === 'excel' ? 'Generando Excel…' : 'Generando PDF…',
          allowOutsideClick: false,
          didOpen: () => {
            SwalAcademico.showLoading();
          },
        });
        const { data } = await api.get(`/docente/grupos/${row.id}/alumnos`);
        const alumnos = data.alumnos || [];
        if (!alumnos.length) {
          SwalAcademico.close();
          await SwalAcademico.fire({
            icon: 'info',
            title: 'Sin alumnos',
            text: 'Este grupo no tiene alumnos matriculados para exportar.',
          });
          return;
        }
        const grupoNombre = `${row.grado}° ${etiquetaSeccionGrupo(row.seccion)} - ${row.nivel_nombre || ''} - ${row.turno_nombre || ''}`.replace(/\s*-\s*$/, '').trim();
        const anioGrupo = row.anio != null ? parseInt(row.anio, 10) : parseInt(anio, 10);

        if (formato === 'excel') {
          await exportarExcelNominaGrupo({
            titulo: 'REGISTRO ACADÉMICO',
            subtitulo: grupoNombre,
            filas: alumnos,
            filename: `Nomina_${grupoNombre.replace(/\s+/g, '_')}`,
          });
          SwalAcademico.close();
          await SwalAcademico.fire({
            icon: 'success',
            title: 'Excel generado',
            text: 'La nómina se ha descargado correctamente',
            timer: 2000,
            showConfirmButton: false,
          });
          return;
        }

        await generarPdfNominaUnGrupo({
          titulo: grupoNombre,
          filas: alumnos,
          anio: Number.isFinite(anioGrupo) ? anioGrupo : undefined,
        });
        SwalAcademico.close();
        await SwalAcademico.fire({
          icon: 'success',
          title: 'PDF generado',
          text: 'La nómina se ha descargado correctamente',
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (e) {
        SwalAcademico.close();
        await SwalAcademico.fire({
          icon: 'error',
          title: 'Error',
          text: e.response?.data?.error || e.message || 'No se pudo exportar la nómina',
        });
      }
      return;
    }
    if (accion === 'imprimir_qr') {
      if (vistaSoloLecturaGrados) return;
      cerrarMenuGrupo();
      try {
        SwalAcademico.fire({
          title: 'Generando carnets…',
          allowOutsideClick: false,
          didOpen: () => {
            SwalAcademico.showLoading();
          },
        });
        const { data } = await api.get(`/admin/academico/grupos/${row.id}/qr-carnets`);
        SwalAcademico.close();
        const carnets = data.carnets || [];
        const totalMatriculas = typeof data.total_matriculas === 'number' ? data.total_matriculas : null;
        if (!carnets.length) {
          await SwalAcademico.fire({
            icon: totalMatriculas > 0 ? 'warning' : 'info',
            title: totalMatriculas > 0 ? 'No se generaron carnets' : 'Sin alumnos',
            text:
              totalMatriculas > 0
                ? `El grupo tiene ${totalMatriculas} matrícula(s), pero no se pudo armar ningún carnet (revisar datos de alumnos/apoderados o logs del servidor).`
                : 'Este grupo no tiene matrículas regulares para imprimir QR.',
          });
          return;
        }
        const sec = String(etiquetaSeccionGrupo(row.seccion)).replace(/\s+/g, '_');
        const fileBase = `Carnets_QR_${String(row.nivel_nombre || 'Grupo').replace(/\s+/g, '_')}_${row.grado}_${sec}`;
        await exportGrupoCarnetsPdfA4(carnets, { fileBase });
        await SwalAcademico.fire({
          icon: 'success',
          title: 'PDF listo',
          text: `Se exportaron ${carnets.length} carnet(es) en A4 (2×4 por hoja). Cada código corresponde al alumno del carnet.`,
        });
      } catch (e) {
        SwalAcademico.close();
        await SwalAcademico.fire({
          icon: 'error',
          title: 'Error',
          text: e.response?.data?.error || e.message || 'No se pudo generar el PDF',
        });
      }
      return;
    }
    if (accion === 'registro_notas') {
      if (vistaSoloLecturaGrados) return;
      cerrarMenuGrupo();
      const anioEsperado = row.anio != null ? parseInt(row.anio, 10) : parseInt(anio, 10);
      if (!Number.isFinite(anioEsperado)) {
        await SwalAcademico.fire({ icon: 'error', title: 'Error', text: 'No se pudo determinar el año del grupo.' });
        return;
      }
      const añosParaExport = [...new Set([...añosSelect, anioEsperado])].sort((a, b) => b - a);
      const optsAnio = añosParaExport
        .map((y) => `<option value="${y}"${y === anioEsperado ? ' selected' : ''}>${y}</option>`)
        .join('');
      const { isConfirmed, value } = await SwalAcademico.fire({
        title: 'Exportar Notas',
        width: 'min(46rem, calc(100vw - 2rem))',
        padding: '1.4rem 1.85rem 1.1rem',
        customClass: {
          popup: 'admin-academico-sw-export-notas',
          htmlContainer: 'admin-academico-sw-export-notas-html',
        },
        html: `
          <div class="admin-academico-export-notas-body">
            <p class="admin-academico-export-notas-lead">Seleccione el año escolar y el bimestre a exportar.</p>
            <div class="admin-academico-export-notas-field">
              <label for="swal-notas-anio">Año</label>
              <select id="swal-notas-anio" class="swal2-select admin-academico-export-notas-select">${optsAnio}</select>
            </div>
            <div class="admin-academico-export-notas-field">
              <label for="swal-notas-ciclo">Bimestre</label>
              <select id="swal-notas-ciclo" class="swal2-select admin-academico-export-notas-select">
                <option value="1">I Bimestre</option>
                <option value="2">II Bimestre</option>
                <option value="3">III Bimestre</option>
                <option value="4">IV Bimestre</option>
              </select>
            </div>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Generar PDF',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
          const anioSel = parseInt(document.getElementById('swal-notas-anio')?.value, 10);
          const cicloSel = parseInt(document.getElementById('swal-notas-ciclo')?.value, 10) || 1;
          if (!Number.isFinite(anioSel)) {
            SwalAcademico.showValidationMessage('Seleccione un año válido');
            return false;
          }
          if (anioSel !== anioEsperado) {
            SwalAcademico.showValidationMessage(`El año debe ser ${anioEsperado} (año de esta aula en el catálogo).`);
            return false;
          }
          return { anio: anioSel, ciclo: cicloSel };
        },
      });
      if (!isConfirmed || !value) return;
      try {
        const response = await api.get(`/admin/academico/grupos/${row.id}/notas-todos`, {
          params: { ciclo: value.ciclo, anio: value.anio },
        });
        const cursosData = response.data?.cursos || [];
        const grupoInfo = response.data?.grupo || row;
        if (cursosData.length === 0) {
          await SwalAcademico.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay cursos con notas para este grupo',
            confirmButtonText: 'Entendido',
          });
          return;
        }
        const ok = generarPDFNotasTutoria(cursosData, grupoInfo);
        if (ok) {
          await SwalAcademico.fire({
            icon: 'success',
            title: '¡PDF Generado!',
            text: `Se descargó el reporte de notas de ${cursosData.length} curso(s)`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            zIndex: 100001,
          });
        }
      } catch (error) {
        console.error('Error generando PDF de notas:', error);
        await SwalAcademico.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'No se pudo generar el PDF de notas',
          confirmButtonText: 'Entendido',
        });
      }
      return;
    }
    if (accion === 'ver_libretas') {
      cerrarMenuGrupo();
      await abrirVerLibretasGrupo(row, {
        alumnosApiUrl: `/docente/grupos/${row.id}/alumnos`,
        anioEsperado: row.anio != null ? parseInt(row.anio, 10) : parseInt(anio, 10),
        añosDisponibles: añosSelect,
        SwalInst: SwalAcademico,
      });
      return;
    }
    if (accion === 'registrar_conducta') {
      if (vistaSoloLecturaGrados) return;
      cerrarMenuGrupo();
      setGrupoConductaAdmin(row);
      return;
    }
    if (accion === 'recomendaciones') {
      if (vistaSoloLecturaGrados) return;
      cerrarMenuGrupo();
      setGrupoRecomendacionesAdmin(row);
      setMostrarModalRecomendacionesAdmin(true);
      setRecomendacionesCicloAdmin(1);
      await cargarRecomendacionesAdmin(row.id, 1);
      return;
    }
    const titulos = {
      lista_alumnos: 'Lista de Alumnos',
      ver_horario: 'Ver Horario',
      registro_asistencia: 'Registro de Asistencia',
      imprimir_qr: 'Imprimir QR',
      registro_notas: 'Registro de Notas',
      registrar_conducta: 'Registrar Conducta',
      recomendaciones: 'Recomendaciones'
    };
    await SwalAcademico.fire({
      icon: 'info',
      title: titulos[accion] || 'Opción',
      text: `Esta opción para ${row.nivel_nombre} ${row.grado}° ${etiquetaSeccionGrupo(row.seccion)} se activará en el siguiente paso.`
    });
  };

  if (listaAlumnosGrupoRow) {
    return (
      <>
        <section className="dg-section admin-academico-grupos-section">
          <GrupoAlumnosListaView
            grupoId={listaAlumnosGrupoRow.id}
            grupoInfo={{
              id: listaAlumnosGrupoRow.id,
              grado: listaAlumnosGrupoRow.grado,
              seccion: listaAlumnosGrupoRow.seccion,
              nivel_nombre: listaAlumnosGrupoRow.nivel_nombre,
              turno_nombre: listaAlumnosGrupoRow.turno_nombre,
              total_alumnos: listaAlumnosGrupoRow.matriculas_count,
              anio: listaAlumnosGrupoRow.anio,
            }}
            onVolver={() => setListaAlumnosGrupoRow(null)}
            psicologiaLinkMode="admin"
            menuAcademicoAlumno
            puedeEliminarIncidencias={!vistaSoloLecturaGrados}
          />
        </section>
        {reportesConducta.ReportesModals}
      </>
    );
  }

  return (
    <>
    <section className="dg-section admin-academico-grupos-section">
      <div className="admin-academico-grupos-toolbar">
        <div className="admin-academico-grupos-filters">
          <label className="admin-academico-grupos-filter-field">
            <span>Año</span>
            <select value={anio} onChange={(e) => setAnio(parseInt(e.target.value, 10) || anioDef)}>
              {añosSelect.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-academico-grupos-filter-field">
            <span>Nivel</span>
            <select value={filtroNivelId} onChange={(e) => setFiltroNivelId(e.target.value)}>
              <option value="">Todos los niveles</option>
              {nivelesLista.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dg-btn-ghost admin-academico-grupos-ver-todo" onClick={verTodo}>
            Ver todo
          </button>
        </div>
        {!esPsicologa && (
          <button type="button" className="admin-academico-grupos-btn-nuevo" onClick={openNew}>
            + Nuevo grado
          </button>
        )}
      </div>

      {loading ? (
        <p className="admin-academico-grupos-loading">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="admin-academico-niveles-empty">
          {esPsicologa
            ? 'No hay grupos para este año y filtros.'
            : 'No hay grupos para este año y filtros. Use «+ Nuevo grado».'}
        </p>
      ) : (
        <div className="admin-academico-grupos-grid">
          {filasGruposOrdenadas.map((r, idx) => {
            const theme = PASTEL_CARD_THEMES[idx % PASTEL_CARD_THEMES.length];
            const nMat = r.matriculas_count != null ? Number(r.matriculas_count) : 0;
            return (
              <article
                key={r.id}
                className="admin-academico-grupo-card"
                style={{ background: theme.bg, borderColor: theme.border }}
              >
                <div className="admin-academico-grupo-card__title-row">
                  <span className="admin-academico-grupo-card__nivel">{r.nivel_nombre || '—'}</span>
                  <span className="admin-academico-grupo-card__title-sep" aria-hidden>
                    ·
                  </span>
                  <span className="admin-academico-grupo-card__grado-seccion-inline">
                    {r.grado}° {etiquetaSeccionGrupo(r.seccion)}
                  </span>
                </div>
                <p className="admin-academico-grupo-card__line">
                  <span className="admin-academico-grupo-card__k">Turno</span>
                  <span className="admin-academico-grupo-card__v">{r.turno_nombre || '—'}</span>
                </p>
                <p className="admin-academico-grupo-card__line">
                  <span className="admin-academico-grupo-card__k">{ETIQUETA_TUTOR}</span>
                  <span className="admin-academico-grupo-card__v">
                    {(r.maestro_tutor_nombre || r.tutor_nombre || '').trim() || '—'}
                  </span>
                </p>
                <p className="admin-academico-grupo-card__line">
                  <span className="admin-academico-grupo-card__k">{ETIQUETA_CO_TUTOR}</span>
                  <span className="admin-academico-grupo-card__v">{(r.tutor2_nombre || '').trim() || '—'}</span>
                </p>
                <div className="admin-academico-grupo-card__alumnos">
                  <span className="admin-academico-grupo-card__alumnos-label">Alumnos matriculados</span>
                  <span className="admin-academico-grupo-card__alumnos-num">{nMat}</span>
                </div>
                <div className="admin-academico-grupo-card__foot">
                  <div
                    className="admin-academico-grupo-card__menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="admin-academico-grupo-card__opciones"
                      aria-expanded={menuGrupoId === r.id}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuGrupoId === r.id) {
                          cerrarMenuGrupo();
                        } else {
                          setMenuGrupoId(r.id);
                          setMenuGrupoAnchor(e.currentTarget);
                        }
                      }}
                    >
                      Opciones
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(() => {
        const rowMenu = menuGrupoId != null ? rows.find((x) => x.id === menuGrupoId) : null;
        if (!rowMenu || !menuGrupoAnchor) return null;
        return (
          <GrupoOpcionesMenuPortal
            open
            anchorEl={menuGrupoAnchor}
            onClose={cerrarMenuGrupo}
          >
            {opcionesGrupoMenuParaFila(rowMenu, opcionesGrupoMenuVisibles).map((op) => (
              <button
                key={op.key}
                type="button"
                role="menuitem"
                className={`admin-academico-grupo-card__dropdown-item${op.danger ? ' admin-academico-grupo-card__dropdown-item--danger' : ''}`}
                onClick={async () => {
                  cerrarMenuGrupo();
                  await accionGrupoMenu(op.key, rowMenu);
                }}
              >
                <span className="admin-academico-grupo-card__dropdown-icon" aria-hidden>
                  {op.icon}
                </span>
                {op.label}
              </button>
            ))}
          </GrupoOpcionesMenuPortal>
        );
      })()}

      <ModalRoot
        open={!!(modal && meta)}
        onClose={() => setModal(null)}
        wide
        modalClassName="admin-academico-modal--grupo-form"
      >
        <div className="admin-academico-grupo-form-card">
          <h3 className="admin-academico-nivel-form-card__title">
            {modal?.edit ? 'Editar grupo' : 'Nuevo grado'}
          </h3>
          <p className="admin-academico-nivel-form-card__lead">
            Sede, nivel y aula (grado, sección, turno); año, {ETIQUETA_TUTOR} y {ETIQUETA_CO_TUTOR}.
          </p>
          <div className="admin-academico-nivel-form-grid">
            <div className="admin-academico-grupo-form-row-sede-nivel">
              <div className="admin-academico-nivel-form-field">
                <label>
                  sede <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.sede_id} onChange={(e) => setForm({ ...form, sede_id: e.target.value })}>
                  {(meta?.sedes || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>
                  nivel <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.nivel_id} onChange={(e) => onNivelFormChange(e.target.value)}>
                  {nivelesLista.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-academico-nivel-form-row-3">
              <div className="admin-academico-nivel-form-field">
                <label>
                  grado <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.grado} onChange={(e) => setForm({ ...form, grado: e.target.value })}>
                  {gradosOpciones.map((g) => (
                    <option key={g} value={String(g)}>
                      {g}°
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>
                  sección <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.seccion} onChange={(e) => setForm({ ...form, seccion: e.target.value })}>
                  {SECCIONES_GRUPO.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>
                  turno <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.turno_id} onChange={(e) => setForm({ ...form, turno_id: e.target.value })}>
                  {(meta?.turnos || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-academico-grupo-form-row-anio-tutor">
              <div className="admin-academico-nivel-form-field">
                <label>
                  año <span className="admin-academico-nivel-form-req">*</span>
                </label>
                <select value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })}>
                  {añosSelect.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>{ETIQUETA_TUTOR}</label>
                <select value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {personalLista
                    .filter((d) => String(d.id) !== String(form.tutor_id_2 || ''))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="admin-academico-nivel-form-field">
                <label>{ETIQUETA_CO_TUTOR}</label>
                <select value={form.tutor_id_2} onChange={(e) => setForm({ ...form, tutor_id_2: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {personalLista
                    .filter((d) => String(d.id) !== String(form.tutor_id || ''))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>
              Cancelar
            </Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </div>
      </ModalRoot>
      {horarioModalGrupo ? (
        <GrupoHorarioCompletoModal
          grupo={{
            id: horarioModalGrupo.id,
            grado: horarioModalGrupo.grado,
            seccion: horarioModalGrupo.seccion,
            nivel_nombre: horarioModalGrupo.nivel_nombre,
            anio: horarioModalGrupo.anio
          }}
          onClose={() => setHorarioModalGrupo(null)}
        />
      ) : null}
      <AdminGrupoAsistenciaModal
        open={!!grupoAsistenciaAdmin && !vistaSoloLecturaGrados}
        grupo={grupoAsistenciaAdmin}
        onClose={() => setGrupoAsistenciaAdmin(null)}
      />
      <AdminGrupoConductaModal
        open={!!grupoConductaAdmin && !vistaSoloLecturaGrados}
        grupo={grupoConductaAdmin}
        onClose={() => setGrupoConductaAdmin(null)}
      />
      {mostrarModalRecomendacionesAdmin && grupoRecomendacionesAdmin
        ? createPortal(
            <div
              className="modal-registro-asistencia-overlay"
              onClick={cerrarModalRecomendacionesAdmin}
              role="presentation"
            >
              <div
                className="modal-registro-asistencia-container"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div className="modal-registro-asistencia-header">
                  <h2>💬 Apreciaciones / Recomendaciones</h2>
                  <button
                    className="modal-registro-asistencia-close"
                    onClick={cerrarModalRecomendacionesAdmin}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-registro-asistencia-filters">
                  <label htmlFor="admin-rec-ciclo">Bimestre:</label>
                  <select
                    id="admin-rec-ciclo"
                    value={recomendacionesCicloAdmin}
                    onChange={(e) => handleCambiarCicloRecomendacionesAdmin(parseInt(e.target.value, 10))}
                    disabled={loadingRecomendacionesAdmin}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '2px solid #e5e7eb',
                      borderRadius: 8,
                      fontSize: '1rem',
                      background: 'white',
                      minWidth: 100,
                    }}
                  >
                    {[1, 2, 3, 4].map((b) => (
                      <option key={b} value={b}>
                        Bimestre {b}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-imprimir-asistencia"
                    onClick={exportarPDFRecomendacionesAdmin}
                    disabled={loadingRecomendacionesAdmin || !recomendacionesAlumnosAdmin.length}
                  >
                    🖨️ Exportar PDF
                  </button>
                </div>
                <div className="modal-registro-asistencia-table-wrap">
                  {loadingRecomendacionesAdmin ? (
                    <div className="modal-registro-asistencia-loading">
                      <div className="loading-spinner" />
                      <p>Cargando...</p>
                    </div>
                  ) : (
                    <table className="tabla-registro-asistencia">
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>N°</th>
                          <th>APELLIDOS Y NOMBRES</th>
                          <th>RECOMENDACIÓN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recomendacionesAlumnosAdmin.map((a) => (
                          <tr key={a.matricula_id}>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                            <td>{a.nombre_completo}</td>
                            <td>
                              <textarea
                                className="input-recomendacion"
                                value={a.recomendacion || ''}
                                onChange={(e) => handleRecomendacionChangeAdmin(a.matricula_id, e.target.value)}
                                rows={3}
                                placeholder="Escribe la recomendación..."
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="modal-registro-asistencia-footer">
                  <button
                    type="button"
                    className="btn-guardar-asistencias"
                    onClick={handleGuardarRecomendacionesAdmin}
                    disabled={loadingRecomendacionesAdmin || guardandoRecomendacionesAdmin}
                  >
                    {guardandoRecomendacionesAdmin ? 'Guardando...' : 'Guardar Datos'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
    {reportesConducta.ReportesModals}
    </>
  );
}

const OPCIONES_CURSO_MENU = [
  { key: 'editar', label: 'Editar curso', icon: '✏️' },
  { key: 'eliminar', label: 'Eliminar curso', icon: '🗑️', danger: true },
];

function CursosPanel({ meta }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    nivel_id: '',
    nombre: '',
    abreviatura: '',
    descripcion: '',
    imagen: '',
    link_libro: ''
  });
  const [menuCursoRow, setMenuCursoRow] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const [menuCoords, setMenuCoords] = useState(null);
  const menuPortalRef = useRef(null);
  const [filtroNivelId, setFiltroNivelId] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const nivelesLista = useMemo(
    () => ordenarNivelesInicialPrimariaSecundaria(meta?.niveles),
    [meta]
  );

  const cursosFiltrados = useMemo(() => {
    let list = rows;
    if (filtroNivelId) {
      list = list.filter((r) => String(r.nivel_id) === String(filtroNivelId));
    }
    const q = filtroBusqueda.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const nom = String(r.nombre || '').toLowerCase();
        const abr = String(r.abreviatura || '').toLowerCase();
        const desc = String(r.descripcion || '').toLowerCase();
        return nom.includes(q) || abr.includes(q) || desc.includes(q);
      });
    }
    return list;
  }, [rows, filtroNivelId, filtroBusqueda]);

  const hayFiltrosActivos = Boolean(filtroNivelId || filtroBusqueda.trim());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/cursos');
      setRows(data.cursos || []);
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cursoTieneNivel =
    meta?.schema?.cursos_nivel_id ??
    (rows.length === 0 || rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'nivel_id')));

  const cerrarMenuCurso = useCallback(() => {
    setMenuCursoRow(null);
    setMenuAnchorRect(null);
    setMenuCoords(null);
  }, []);

  const abrirMenuCurso = useCallback((e, row) => {
    e.stopPropagation();
    if (menuCursoRow?.id === row.id) {
      cerrarMenuCurso();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 220;
    setMenuAnchorRect(rect);
    setMenuCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8)),
      minWidth: menuW,
    });
    setMenuCursoRow(row);
  }, [menuCursoRow?.id, cerrarMenuCurso]);

  useEffect(() => {
    if (!menuCursoRow || !menuAnchorRect || !menuPortalRef.current) return undefined;
    const menuRect = menuPortalRef.current.getBoundingClientRect();
    const menuW = menuRect.width || menuCoords?.minWidth || 220;
    const menuH = menuRect.height || 88;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferBelow = menuAnchorRect.bottom + gap;
    const preferAbove = menuAnchorRect.top - menuH - gap;
    const top =
      preferBelow + menuH > vh - 8 && preferAbove >= 8
        ? preferAbove
        : Math.max(8, Math.min(preferBelow, vh - menuH - 8));
    const left = Math.max(8, Math.min(menuAnchorRect.right - menuW, vw - menuW - 8));
    setMenuCoords((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left, minWidth: menuW }
    );
  }, [menuCursoRow, menuAnchorRect]);

  useEffect(() => {
    if (!menuCursoRow) return undefined;
    const close = (ev) => {
      if (ev.target?.closest?.('.admin-academico-asignaturas-dropdown-portal')) return;
      if (ev.target?.closest?.('.admin-academico-cursos-opciones-btn')) return;
      cerrarMenuCurso();
    };
    const onScroll = () => cerrarMenuCurso();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuCursoRow, cerrarMenuCurso]);

  const abrirEditarCurso = (r) => {
    setForm({
      nivel_id: r.nivel_id != null ? String(r.nivel_id) : meta?.niveles?.[0]?.id || '',
      nombre: r.nombre || '',
      abreviatura: r.abreviatura || '',
      descripcion: r.descripcion || '',
      imagen: r.imagen || '',
      link_libro: r.link_libro || ''
    });
    setModal({ edit: r });
  };

  const abrirNuevoCurso = () => {
    setForm({
      nivel_id: meta?.niveles?.[0]?.id || '',
      nombre: '',
      abreviatura: '',
      descripcion: '',
      imagen: '',
      link_libro: ''
    });
    setModal('new');
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      SwalAcademico.fire({ icon: 'warning', title: 'Nombre requerido' });
      return;
    }
    if (cursoTieneNivel && !String(form.nivel_id || '').trim()) {
      SwalAcademico.fire({ icon: 'warning', title: 'Seleccione el nivel del curso' });
      return;
    }
    try {
      if (modal?.edit) {
        await api.put(`/admin/academico/cursos/${modal.edit.id}`, form);
      } else {
        await api.post('/admin/academico/cursos', form);
      }
      setModal(null);
      await load();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminar = async (r) => {
    const ok = await SwalAcademico.fire({ icon: 'question', title: '¿Eliminar curso?', text: r.nombre, showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/cursos/${r.id}`);
      await load();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const accionCursoMenu = (key, row) => {
    cerrarMenuCurso();
    if (key === 'editar') abrirEditarCurso(row);
    else if (key === 'eliminar') eliminar(row);
  };

  const colCount = (cursoTieneNivel ? 1 : 0) + 4;

  return (
    <section className="dg-section">
      <div className="admin-academico-areas-toolbar dg-section-title">
        <span className="admin-academico-areas-toolbar__title">Cursos</span>
        <div className="admin-academico-areas-toolbar__actions">
          {cursoTieneNivel && (
            <label className="admin-academico-areas-filter-field">
              <span>Nivel</span>
              <select
                value={filtroNivelId}
                onChange={(e) => setFiltroNivelId(e.target.value)}
                aria-label="Filtrar por nivel"
              >
                <option value="">Todos los niveles</option>
                {nivelesLista.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-academico-areas-filter-field admin-academico-areas-filter-field--search">
            <span>Buscar</span>
            <input
              type="search"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Nombre, abreviatura o descripción…"
              aria-label="Buscar curso"
            />
          </label>
          <Btn onClick={abrirNuevoCurso}>+ Nuevo curso</Btn>
        </div>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap admin-academico-areas-table-wrap">
          <table className="admin-academico-table admin-academico-areas-table admin-academico-cursos-table">
            <thead>
              <tr>
                {cursoTieneNivel && <th>Nivel</th>}
                <th>Nombre</th>
                <th>Abreviatura</th>
                <th>Descripción</th>
                <th className="admin-academico-areas-th-opciones">Opciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="admin-academico-areas-empty">
                    No hay cursos registrados. Use «+ Nuevo curso» para crear uno.
                  </td>
                </tr>
              ) : cursosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="admin-academico-areas-empty">
                    Ningún curso coincide con los filtros.
                    {hayFiltrosActivos ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="admin-academico-areas-clear-filters"
                          onClick={() => {
                            setFiltroNivelId('');
                            setFiltroBusqueda('');
                          }}
                        >
                          Ver todos
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ) : (
                cursosFiltrados.map((r) => (
                  <tr key={r.id}>
                    {cursoTieneNivel && <td>{r.nivel_nombre || '—'}</td>}
                    <td>{r.nombre}</td>
                    <td>{r.abreviatura || '—'}</td>
                    <td className="admin-academico-cursos-descripcion" title={r.descripcion || ''}>
                      {r.descripcion || '—'}
                    </td>
                    <td className="admin-academico-areas-td-opciones">
                      <button
                        type="button"
                        className="admin-academico-grupo-card__opciones admin-academico-areas-opciones-btn admin-academico-cursos-opciones-btn"
                        aria-expanded={menuCursoRow?.id === r.id}
                        aria-haspopup="menu"
                        onClick={(e) => abrirMenuCurso(e, r)}
                      >
                        Opciones
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {menuCursoRow &&
        menuCoords &&
        createPortal(
          <div
            ref={menuPortalRef}
            className="admin-academico-asignaturas-dropdown-portal"
            role="menu"
            style={{
              top: menuCoords.top,
              left: menuCoords.left,
              minWidth: menuCoords.minWidth,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {OPCIONES_CURSO_MENU.map((op) => (
              <button
                key={op.key}
                type="button"
                role="menuitem"
                className={`admin-academico-asignaturas-dropdown-item${op.danger ? ' admin-academico-asignaturas-dropdown-item--danger' : ''}`}
                onClick={() => accionCursoMenu(op.key, menuCursoRow)}
              >
                <span className="admin-academico-grupo-card__dropdown-icon" aria-hidden>
                  {op.icon}
                </span>
                {op.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      <ModalRoot open={!!modal} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar curso' : 'Nuevo curso'}</h3>
          <p className="admin-academico-hint">En el sistema anterior cada curso pertenece a un nivel. La descripción es opcional.</p>
          <div className="admin-academico-modal-grid">
            {cursoTieneNivel && (
              <div className="admin-academico-field admin-academico-field--full">
                <label>Nivel *</label>
                <select value={form.nivel_id} onChange={(e) => setForm({ ...form, nivel_id: e.target.value })}>
                  {(meta?.niveles || []).map((n) => (
                    <option key={n.id} value={n.id}>{n.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="admin-academico-field admin-academico-field--full">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="admin-academico-field">
              <label>Abreviatura</label>
              <input value={form.abreviatura} onChange={(e) => setForm({ ...form, abreviatura: e.target.value })} />
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Descripción</label>
              <textarea
                className="admin-academico-textarea"
                rows={2}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={guardar}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>
    </section>
  );
}

const OPCIONES_AREA_MENU = [
  { key: 'lista_cursos', label: 'Lista de Cursos', icon: '📚' },
  { key: 'editar', label: 'Editar área', icon: '✏️' },
  { key: 'eliminar', label: 'Eliminar área', icon: '🗑️', danger: true },
];

function AreasPanel({ meta }) {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalArea, setModalArea] = useState(null);
  const [areaForm, setAreaForm] = useState({ nombre: '', nivel_id: '' });
  const [menuAreaRow, setMenuAreaRow] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const [menuCoords, setMenuCoords] = useState(null);
  const menuPortalRef = useRef(null);
  const [linkModal, setLinkModal] = useState(null);
  const [cursosDisponiblesArea, setCursosDisponiblesArea] = useState([]);
  const [infoAreaCursos, setInfoAreaCursos] = useState(null);
  const [selectedCursoIds, setSelectedCursoIds] = useState([]);
  const [busquedaCursosArea, setBusquedaCursosArea] = useState('');
  const [loadingCursosArea, setLoadingCursosArea] = useState(false);
  const [savingCursosArea, setSavingCursosArea] = useState(false);
  const [areasCursosTieneConflictos, setAreasCursosTieneConflictos] = useState(false);
  const [filtroNivelId, setFiltroNivelId] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const nivelesLista = useMemo(
    () => ordenarNivelesInicialPrimariaSecundaria(meta?.niveles),
    [meta]
  );

  const areasFiltradas = useMemo(() => {
    let list = areas;
    if (filtroNivelId) {
      list = list.filter((a) => String(a.nivel_id) === String(filtroNivelId));
    }
    const q = filtroBusqueda.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const nomArea = String(a.nombre || '').toLowerCase();
        const nomCursos = String(a.cursos_nombres || '').toLowerCase();
        return nomArea.includes(q) || nomCursos.includes(q);
      });
    }
    return list;
  }, [areas, filtroNivelId, filtroBusqueda]);

  const hayFiltrosActivos = Boolean(filtroNivelId || filtroBusqueda.trim());

  const loadAreas = useCallback(async () => {
    const { data } = await api.get('/admin/academico/areas');
    setAreas(data.areas || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadAreas();
      } catch (e) {
        SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAreas]);

  const areaTieneNivel =
    meta?.schema?.areas_nivel_id ??
    (areas.length === 0 || areas.some((a) => Object.prototype.hasOwnProperty.call(a, 'nivel_id')));

  const cerrarMenuArea = useCallback(() => {
    setMenuAreaRow(null);
    setMenuAnchorRect(null);
    setMenuCoords(null);
  }, []);

  const abrirMenuArea = useCallback((e, row) => {
    e.stopPropagation();
    if (menuAreaRow?.id === row.id) {
      cerrarMenuArea();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 220;
    setMenuAnchorRect(rect);
    setMenuCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8)),
      minWidth: menuW,
    });
    setMenuAreaRow(row);
  }, [menuAreaRow?.id, cerrarMenuArea]);

  useEffect(() => {
    if (!menuAreaRow || !menuAnchorRect || !menuPortalRef.current) return undefined;
    const menuRect = menuPortalRef.current.getBoundingClientRect();
    const menuW = menuRect.width || menuCoords?.minWidth || 220;
    const menuH = menuRect.height || 120;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferBelow = menuAnchorRect.bottom + gap;
    const preferAbove = menuAnchorRect.top - menuH - gap;
    const top =
      preferBelow + menuH > vh - 8 && preferAbove >= 8
        ? preferAbove
        : Math.max(8, Math.min(preferBelow, vh - menuH - 8));
    const left = Math.max(8, Math.min(menuAnchorRect.right - menuW, vw - menuW - 8));
    setMenuCoords((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left, minWidth: menuW }
    );
  }, [menuAreaRow, menuAnchorRect]);

  useEffect(() => {
    if (!menuAreaRow) return undefined;
    const close = (ev) => {
      if (ev.target?.closest?.('.admin-academico-asignaturas-dropdown-portal')) return;
      if (ev.target?.closest?.('.admin-academico-areas-opciones-btn')) return;
      cerrarMenuArea();
    };
    const onScroll = () => cerrarMenuArea();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuAreaRow, cerrarMenuArea]);

  const abrirEditarArea = (a) => {
    setAreaForm({
      nombre: a.nombre || '',
      nivel_id: a.nivel_id != null ? String(a.nivel_id) : meta?.niveles?.[0]?.id != null ? String(meta.niveles[0].id) : '',
    });
    setModalArea({ edit: a });
  };

  const guardarArea = async () => {
    if (!areaForm.nombre.trim()) return;
    if (areaTieneNivel && !String(areaForm.nivel_id || '').trim()) {
      SwalAcademico.fire({ icon: 'warning', title: 'Seleccione el nivel del área' });
      return;
    }
    try {
      const body = { nombre: areaForm.nombre.trim(), nivel_id: areaForm.nivel_id };
      if (modalArea?.edit) {
        await api.put(`/admin/academico/areas/${modalArea.edit.id}`, body);
      } else {
        await api.post('/admin/academico/areas', body);
      }
      setModalArea(null);
      await loadAreas();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const openListaCursos = async (area) => {
    setLinkModal(area);
    setBusquedaCursosArea('');
    setLoadingCursosArea(true);
    setCursosDisponiblesArea([]);
    setInfoAreaCursos(null);
    setSelectedCursoIds([]);
    setAreasCursosTieneConflictos(false);
    try {
      const { data } = await api.get(`/admin/academico/areas/${area.id}/cursos-disponibles`);
      setInfoAreaCursos(data.area || area);
      setCursosDisponiblesArea(data.cursos || []);
      setSelectedCursoIds((data.curso_ids_seleccionados || []).map((id) => String(id)));
      setAreasCursosTieneConflictos(Boolean(data.tiene_conflictos));
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudieron cargar los cursos' });
      setLinkModal(null);
    } finally {
      setLoadingCursosArea(false);
    }
  };

  const cursosFiltradosArea = useMemo(() => {
    const q = busquedaCursosArea.trim().toLowerCase();
    if (!q) return cursosDisponiblesArea;
    return cursosDisponiblesArea.filter((c) => {
      const nom = String(c.nombre || '').toLowerCase();
      const abr = String(c.abreviatura || '').toLowerCase();
      return nom.includes(q) || abr.includes(q);
    });
  }, [cursosDisponiblesArea, busquedaCursosArea]);

  const toggleCursoArea = (cursoId) => {
    const sid = String(cursoId);
    setSelectedCursoIds((prev) =>
      prev.map(String).includes(sid) ? prev.filter((x) => String(x) !== sid) : [...prev, sid]
    );
  };

  const marcarTodosCursosArea = () => {
    const ids = cursosFiltradosArea.map((c) => String(c.id));
    setSelectedCursoIds((prev) => [...new Set([...prev.map(String), ...ids])]);
  };

  const desmarcarTodosCursosArea = () => {
    const filtrados = new Set(cursosFiltradosArea.map((c) => String(c.id)));
    setSelectedCursoIds((prev) => prev.filter((id) => !filtrados.has(String(id))));
  };

  const guardarCursosArea = async () => {
    if (!linkModal) return;
    setSavingCursosArea(true);
    try {
      await api.put(`/admin/academico/areas/${linkModal.id}/cursos`, {
        curso_ids: selectedCursoIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n)),
      });
      await loadAreas();
      setLinkModal(null);
      SwalAcademico.fire({ icon: 'success', title: 'Cursos guardados', timer: 1400, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudieron guardar los cursos' });
    } finally {
      setSavingCursosArea(false);
    }
  };

  const eliminarArea = async (a) => {
    const ok = await SwalAcademico.fire({ icon: 'question', title: '¿Eliminar área?', text: a.nombre, showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/areas/${a.id}`);
      await loadAreas();
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const accionAreaMenu = (key, row) => {
    cerrarMenuArea();
    if (key === 'lista_cursos') openListaCursos(row);
    else if (key === 'editar') abrirEditarArea(row);
    else if (key === 'eliminar') eliminarArea(row);
  };

  return (
    <section className="dg-section">
      <div className="admin-academico-areas-toolbar dg-section-title">
        <span className="admin-academico-areas-toolbar__title">Áreas curriculares</span>
        <div className="admin-academico-areas-toolbar__actions">
          {areaTieneNivel && (
            <label className="admin-academico-areas-filter-field">
              <span>Nivel</span>
              <select
                value={filtroNivelId}
                onChange={(e) => setFiltroNivelId(e.target.value)}
                aria-label="Filtrar por nivel"
              >
                <option value="">Todos los niveles</option>
                {nivelesLista.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-academico-areas-filter-field admin-academico-areas-filter-field--search">
            <span>Buscar</span>
            <input
              type="search"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Nombre de área o curso…"
              aria-label="Buscar por nombre de área o curso"
            />
          </label>
          <Btn
            onClick={() => {
              setAreaForm({ nombre: '', nivel_id: meta?.niveles?.[0]?.id != null ? String(meta.niveles[0].id) : '' });
              setModalArea('new');
            }}
          >
            + Nueva área
          </Btn>
        </div>
      </div>
      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="admin-academico-table-wrap admin-academico-areas-table-wrap">
          <table className="admin-academico-table admin-academico-areas-table">
            <thead>
              <tr>
                {areaTieneNivel && <th>Nivel</th>}
                <th>Nombre</th>
                <th>Cursos</th>
                <th className="admin-academico-areas-th-opciones">Opciones</th>
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 ? (
                <tr>
                  <td colSpan={areaTieneNivel ? 4 : 3} className="admin-academico-areas-empty">
                    No hay áreas registradas. Use «+ Nueva área» para crear una.
                  </td>
                </tr>
              ) : areasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={areaTieneNivel ? 4 : 3} className="admin-academico-areas-empty">
                    Ningún área coincide con los filtros.
                    {hayFiltrosActivos ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="admin-academico-areas-clear-filters"
                          onClick={() => {
                            setFiltroNivelId('');
                            setFiltroBusqueda('');
                          }}
                        >
                          Ver todas
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ) : (
                areasFiltradas.map((a) => (
                  <tr key={a.id}>
                    {areaTieneNivel && <td>{a.nivel_nombre || '—'}</td>}
                    <td>{a.nombre}</td>
                    <td>
                      <span className="admin-academico-areas-cursos-badge">
                        {Number(a.cursos_count) || 0}
                      </span>
                    </td>
                    <td className="admin-academico-areas-td-opciones">
                      <button
                        type="button"
                        className="admin-academico-grupo-card__opciones admin-academico-areas-opciones-btn"
                        aria-expanded={menuAreaRow?.id === a.id}
                        aria-haspopup="menu"
                        onClick={(e) => abrirMenuArea(e, a)}
                      >
                        Opciones
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {menuAreaRow &&
        menuCoords &&
        createPortal(
          <div
            ref={menuPortalRef}
            className="admin-academico-asignaturas-dropdown-portal"
            role="menu"
            style={{
              top: menuCoords.top,
              left: menuCoords.left,
              minWidth: menuCoords.minWidth,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {OPCIONES_AREA_MENU.map((op) => (
              <button
                key={op.key}
                type="button"
                role="menuitem"
                className={`admin-academico-asignaturas-dropdown-item${op.danger ? ' admin-academico-asignaturas-dropdown-item--danger' : ''}`}
                onClick={() => accionAreaMenu(op.key, menuAreaRow)}
              >
                <span className="admin-academico-grupo-card__dropdown-icon" aria-hidden>
                  {op.icon}
                </span>
                {op.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      <ModalRoot open={!!modalArea} onClose={() => setModalArea(null)}>
        <>
          <h3>{modalArea?.edit ? 'Editar área' : 'Nueva área'}</h3>
          <p className="admin-academico-hint">En el sistema anterior cada área está asociada a un nivel.</p>
          {areaTieneNivel && (
            <div className="admin-academico-field">
              <label>Nivel *</label>
              <select value={areaForm.nivel_id} onChange={(e) => setAreaForm({ ...areaForm, nivel_id: e.target.value })}>
                {(meta?.niveles || []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="admin-academico-field">
            <label>Nombre *</label>
            <input value={areaForm.nombre} onChange={(e) => setAreaForm({ ...areaForm, nombre: e.target.value })} />
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModalArea(null)}>Cancelar</Btn>
            <Btn onClick={guardarArea}>Guardar</Btn>
          </div>
        </>
      </ModalRoot>

      <ModalRoot open={!!linkModal} onClose={() => setLinkModal(null)} wide modalClassName="admin-academico-areas-cursos-modal">
        <>
          <h3>Lista de cursos — {linkModal?.nombre}</h3>
          <p className="admin-academico-hint">
            Cursos del mismo nivel que el área. Los vinculados a esta área aparecen marcados. Al guardar, un curso solo puede quedar en un área.
          </p>
          {areasCursosTieneConflictos ? (
            <p className="admin-academico-areas-cursos-warn">
              Hay cursos marcados que también figuran en otra área (datos del sistema anterior). Al guardar aquí se reasignan solo a esta área.
            </p>
          ) : null}
          {loadingCursosArea ? (
            <p className="admin-academico-asignaturas-cursos-empty">Cargando cursos…</p>
          ) : cursosDisponiblesArea.length === 0 ? (
            <p className="admin-academico-asignaturas-cursos-empty">
              No hay cursos disponibles
              {infoAreaCursos?.nivel_nombre ? ` en el nivel «${infoAreaCursos.nivel_nombre}»` : ''}
              {' '}para vincular a esta área.
            </p>
          ) : (
            <>
              <p className="admin-academico-asignaturas-cursos-meta">
                Nivel: <strong>{infoAreaCursos?.nivel_nombre || linkModal?.nivel_nombre || '—'}</strong>
                {' · '}
                {cursosDisponiblesArea.length} curso{cursosDisponiblesArea.length !== 1 ? 's' : ''} elegible
                {cursosDisponiblesArea.length !== 1 ? 's' : ''}
              </p>
              <div className="admin-academico-areas-cursos-toolbar">
                <input
                  type="search"
                  className="admin-academico-areas-cursos-search"
                  placeholder="Buscar curso…"
                  value={busquedaCursosArea}
                  onChange={(e) => setBusquedaCursosArea(e.target.value)}
                  aria-label="Buscar curso"
                />
                <div className="admin-academico-areas-cursos-toolbar-actions">
                  <Btn variant="ghost" type="button" onClick={marcarTodosCursosArea} disabled={cursosFiltradosArea.length === 0}>
                    Marcar todos
                  </Btn>
                  <Btn variant="ghost" type="button" onClick={desmarcarTodosCursosArea} disabled={cursosFiltradosArea.length === 0}>
                    Desmarcar todos
                  </Btn>
                </div>
              </div>
              {cursosFiltradosArea.length === 0 ? (
                <p className="admin-academico-asignaturas-cursos-empty">Ningún curso coincide con la búsqueda.</p>
              ) : (
                <div
                  className="admin-academico-areas-cursos-list"
                  role="group"
                  aria-label="Cursos del área. Pulse para seleccionar o quitar."
                >
                  {cursosFiltradosArea.map((c) => {
                    const selected =
                      selectedCursoIds.map(String).includes(String(c.id)) || Number(c.selected) === 1;
                    const enOtraArea = Number(c.en_otra_area) === 1;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`admin-academico-asignaturas-curso-tab admin-academico-areas-curso-tab${
                          selected ? ' admin-academico-areas-curso-tab--selected' : ''
                        }${enOtraArea ? ' admin-academico-areas-curso-tab--conflicto' : ''}`}
                        aria-pressed={selected}
                        onClick={() => toggleCursoArea(c.id)}
                      >
                        <span className="admin-academico-asignaturas-curso-tab__nombre">{c.nombre}</span>
                        {c.abreviatura ? (
                          <span className="admin-academico-areas-curso-tab__abr">{c.abreviatura}</span>
                        ) : null}
                        {enOtraArea && c.otras_areas_nombres ? (
                          <span className="admin-academico-areas-curso-tab__otra-area">
                            También en: {c.otras_areas_nombres}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedCursoIds.length > 0 && (
                <p className="admin-academico-asignaturas-cursos-selected">
                  {selectedCursoIds.length} curso{selectedCursoIds.length !== 1 ? 's' : ''} seleccionado
                  {selectedCursoIds.length !== 1 ? 's' : ''}
                </p>
              )}
            </>
          )}
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setLinkModal(null)} disabled={savingCursosArea}>Cancelar</Btn>
            <Btn onClick={guardarCursosArea} disabled={loadingCursosArea || savingCursosArea}>
              {savingCursosArea ? 'Guardando…' : 'Guardar cursos'}
            </Btn>
          </div>
        </>
      </ModalRoot>
    </section>
  );
}

function buildFiltrosAsignaturasDefault(meta, nivelesLista) {
  const anio = new Date().getFullYear();
  const sedes = meta?.sedes || [];
  const sede =
    sedes.find((s) => Number(s.id) === 1) ||
    sedes.find((s) => String(s.id) === '1') ||
    sedes[0];
  const turnos = meta?.turnos || [];
  const turno =
    turnos.find((t) => /mañana|manana/i.test(String(t.nombre || '').trim())) || turnos[0];
  const nivel = nivelesLista[0];
  const nivel_id = nivel ? String(nivel.id) : '';
  const grados = gradosDisponiblesPorNivel(nivel_id, nivelesLista);
  return {
    anio,
    sede_id: sede ? String(sede.id) : '',
    nivel_id,
    grado: grados[0] != null ? String(grados[0]) : '',
    seccion: SECCIONES_GRUPO[0]?.v || 'UNICA',
    turno_id: turno ? String(turno.id) : '',
  };
}

const OPCIONES_ASIGNATURA_MENU = [
  { key: 'criterios', label: 'Criterios / Indicadores', icon: '📋' },
  { key: 'aula_virtual', label: 'Aula Virtual', icon: '🎓' },
  { key: 'lista_alumnos', label: 'Lista de Alumnos', icon: '👥' },
  { key: 'copiar_contenido', label: 'Copiar Contenido', icon: '📑' },
  { key: 'registrar_notas', label: 'Registrar Notas', icon: '📝' },
  { key: 'registrar_asistencia', label: 'Registrar Asistencia', icon: '✅' },
  { key: 'editar', label: 'Editar Asignatura', icon: '✏️' },
  { key: 'eliminar', label: 'Borrar Asignatura', icon: '🗑️', danger: true },
];

function etiquetaGrupoAsignatura(r) {
  const nivel = String(r.nivel_nombre || '').trim().toUpperCase() || '—';
  const grado = r.grado != null ? `${r.grado}°` : '';
  const sec = etiquetaSeccionGrupo(r.seccion);
  const anioTxt = r.anio != null ? ` - ${r.anio}` : '';
  return `${nivel} - ${grado} ${sec}${anioTxt}`.replace(/\s+/g, ' ').trim();
}

function esNivelInicialPorId(nivelId, nivelesLista) {
  if (nivelId == null || nivelId === '') return false;
  const n = (nivelesLista || []).find((x) => String(x.id) === String(nivelId));
  if (!n) return false;
  if (n.tipo_calificacion === 0 || n.tipo_calificacion === '0') return true;
  if (n.tipo_calificacion === 1 || n.tipo_calificacion === '1') return false;
  return String(n.nombre || '').toUpperCase().includes('INICIAL');
}

function grupoLibretaDesdeResultados(filtrosAplicados, rows) {
  if (!filtrosAplicados || !rows?.length) return null;
  const ids = [...new Set(rows.map((r) => r.grupo_id).filter(Boolean))];
  if (ids.length !== 1) return { conflicto: ids.length > 1 };
  const r = rows.find((x) => x.grupo_id === ids[0]) || rows[0];
  return {
    id: r.grupo_id,
    grado: r.grado,
    seccion: r.seccion,
    nivel_nombre: r.nivel_nombre,
    turno_nombre: r.turno_nombre,
    anio: r.anio != null ? r.anio : filtrosAplicados.anio,
  };
}

function AsignaturasPanel({ meta, accionesRef }) {
  const navigate = useNavigate();
  const anioDef = meta?.anio_activo || new Date().getFullYear();
  const nivelesLista = useMemo(
    () => ordenarNivelesInicialPrimariaSecundaria(meta?.niveles),
    [meta]
  );
  const añosSelect = useMemo(() => {
    const arr = [];
    const base = new Date().getFullYear();
    for (let y = base + 3; y >= base - 10; y -= 1) arr.push(y);
    if (!arr.includes(anioDef)) arr.push(anioDef);
    return arr.sort((a, b) => b - a);
  }, [anioDef]);

  const [filtros, setFiltros] = useState(null);
  const [filtrosAplicados, setFiltrosAplicados] = useState(null);
  const [rows, setRows] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [menuAsignaturaRow, setMenuAsignaturaRow] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const [menuCoords, setMenuCoords] = useState(null);
  const menuPortalRef = useRef(null);
  const [listaAlumnosGrupoRow, setListaAlumnosGrupoRow] = useState(null);
  const [grupoAsistenciaAdmin, setGrupoAsistenciaAdmin] = useState(null);
  const [copiarContenidoAsignaturaId, setCopiarContenidoAsignaturaId] = useState(null);
  const [registrarNotasAsignaturaId, setRegistrarNotasAsignaturaId] = useState(null);
  const [criteriosAsignaturaId, setCriteriosAsignaturaId] = useState(null);
  const [modalLibretaAreas, setModalLibretaAreas] = useState(null);
  const [modalLibretaRegistro, setModalLibretaRegistro] = useState(null);
  const [cursosDisponibles, setCursosDisponibles] = useState([]);
  const [loadingCursosDisponibles, setLoadingCursosDisponibles] = useState(false);
  const [infoCursosGrupo, setInfoCursosGrupo] = useState(null);

  const gruposOrdenados = useMemo(() => ordenarGruposInicialPrimariaSecundaria(grupos), [grupos]);

  const gradosFiltro = useMemo(
    () => gradosDisponiblesPorNivel(filtros?.nivel_id, nivelesLista),
    [filtros?.nivel_id, nivelesLista]
  );

  const esInicialBuscado = useMemo(
    () => buscado && esNivelInicialPorId(filtrosAplicados?.nivel_id, nivelesLista),
    [buscado, filtrosAplicados?.nivel_id, nivelesLista]
  );

  const libretaGrupo = useMemo(
    () => (esInicialBuscado ? grupoLibretaDesdeResultados(filtrosAplicados, rows) : null),
    [esInicialBuscado, filtrosAplicados, rows]
  );

  const opcionesMenuVisibles = useMemo(() => {
    let ops = OPCIONES_ASIGNATURA_MENU;
    if (esInicialBuscado) {
      ops = ops.filter((op) => op.key !== 'criterios' && op.key !== 'registrar_notas');
    }
    return ops;
  }, [esInicialBuscado]);

  const loadGruposModal = useCallback(async (anio) => {
    const { data } = await api.get('/admin/academico/grupos', { params: { anio } });
    return ordenarGruposInicialPrimariaSecundaria(data.grupos || []);
  }, []);

  const loadCursosDisponibles = useCallback(async (grupoId, excludeAsignaturaId = null) => {
    if (!grupoId) {
      setCursosDisponibles([]);
      setInfoCursosGrupo(null);
      return;
    }
    setLoadingCursosDisponibles(true);
    try {
      const params = {};
      if (excludeAsignaturaId) params.exclude_asignatura_id = excludeAsignaturaId;
      const { data } = await api.get(`/admin/academico/grupos/${grupoId}/cursos-disponibles`, {
        params,
      });
      setCursosDisponibles(data.cursos || []);
      setInfoCursosGrupo(data.grupo || null);
    } catch (e) {
      setCursosDisponibles([]);
      setInfoCursosGrupo(null);
      SwalAcademico.fire({
        icon: 'error',
        text: e.response?.data?.error || 'No se pudieron cargar los cursos disponibles',
      });
    } finally {
      setLoadingCursosDisponibles(false);
    }
  }, []);

  const load = useCallback(async (paramsIn) => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/academico/asignaturas', { params: paramsIn });
      setRows(data.asignaturas || []);
      setBuscado(true);
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error al buscar asignaturas' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!meta) return;
    setFiltros((prev) => prev || buildFiltrosAsignaturasDefault(meta, nivelesLista));
  }, [meta, nivelesLista]);

  const cerrarMenuAsignatura = useCallback(() => {
    setMenuAsignaturaRow(null);
    setMenuAnchorRect(null);
    setMenuCoords(null);
  }, []);

  const abrirMenuAsignatura = useCallback((e, row) => {
    e.stopPropagation();
    if (menuAsignaturaRow?.id === row.id) {
      cerrarMenuAsignatura();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 248;
    setMenuAnchorRect(rect);
    setMenuCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8)),
      minWidth: menuW,
    });
    setMenuAsignaturaRow(row);
  }, [menuAsignaturaRow?.id, cerrarMenuAsignatura]);

  useEffect(() => {
    if (!menuAsignaturaRow || !menuAnchorRect || !menuPortalRef.current) return undefined;
    const menuRect = menuPortalRef.current.getBoundingClientRect();
    const menuW = menuRect.width || menuCoords?.minWidth || 248;
    const menuH = menuRect.height || 120;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferBelow = menuAnchorRect.bottom + gap;
    const preferAbove = menuAnchorRect.top - menuH - gap;
    const top =
      preferBelow + menuH > vh - 8 && preferAbove >= 8
        ? preferAbove
        : Math.max(8, Math.min(preferBelow, vh - menuH - 8));
    const left = Math.max(8, Math.min(menuAnchorRect.right - menuW, vw - menuW - 8));
    setMenuCoords((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left, minWidth: menuW }
    );
  }, [menuAsignaturaRow, menuAnchorRect]);

  useEffect(() => {
    if (!menuAsignaturaRow) return undefined;
    const close = (ev) => {
      if (ev.target?.closest?.('.admin-academico-asignaturas-dropdown-portal')) return;
      if (ev.target?.closest?.('.admin-academico-asignaturas-opciones-btn')) return;
      cerrarMenuAsignatura();
    };
    const onScroll = () => cerrarMenuAsignatura();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuAsignaturaRow, cerrarMenuAsignatura]);

  const onBuscar = () => {
    if (!filtros) return;
    const p = { anio: filtros.anio };
    if (filtros.sede_id) p.sede_id = filtros.sede_id;
    if (filtros.nivel_id) p.nivel_id = filtros.nivel_id;
    if (filtros.grado !== '') p.grado = filtros.grado;
    if (filtros.seccion) p.seccion = filtros.seccion;
    if (filtros.turno_id) p.turno_id = filtros.turno_id;
    setFiltrosAplicados(p);
    load(p);
  };

  const openNew = useCallback(async () => {
    if (!filtros) return;
    try {
      const lista = await loadGruposModal(filtros.anio);
      setGrupos(lista);
      const primerGrupo = lista[0]?.id || '';
      const primerDocente = meta?.docentes?.[0]?.id || '';
      setForm({
        grupo_id: primerGrupo ? String(primerGrupo) : '',
        personal_id: primerDocente ? String(primerDocente) : '',
        curso_ids: [],
        curso_id: '',
      });
      setModal('new');
      if (primerGrupo) {
        await loadCursosDisponibles(primerGrupo);
      } else {
        setCursosDisponibles([]);
        setInfoCursosGrupo(null);
      }
    } catch {
      SwalAcademico.fire({ icon: 'error', text: 'No se pudieron cargar los grupos' });
    }
  }, [filtros, loadGruposModal, loadCursosDisponibles, meta?.docentes]);

  useEffect(() => {
    if (!accionesRef) return undefined;
    accionesRef.current = { openNew };
    return () => {
      accionesRef.current = { openNew: null };
    };
  }, [accionesRef, openNew]);

  const openEdit = async (r) => {
    const anioG = r.anio != null ? r.anio : filtros?.anio;
    try {
      const lista = await loadGruposModal(anioG);
      setGrupos(lista);
      setForm({
        grupo_id: String(r.grupo_id),
        curso_id: String(r.curso_id),
        personal_id: String(r.personal_id),
        curso_ids: [],
      });
      setModal({ edit: r });
      await loadCursosDisponibles(r.grupo_id, r.id);
    } catch {
      SwalAcademico.fire({ icon: 'error', text: 'No se pudieron cargar los datos del formulario' });
    }
  };

  const onGrupoModalChange = async (grupoId) => {
    setForm((f) => ({
      ...f,
      grupo_id: grupoId,
      curso_ids: [],
      curso_id: '',
    }));
    await loadCursosDisponibles(grupoId, modal?.edit?.id || null);
  };

  const toggleCursoNuevo = (cursoId) => {
    const idStr = String(cursoId);
    setForm((f) => {
      const set = new Set((f.curso_ids || []).map(String));
      if (set.has(idStr)) set.delete(idStr);
      else set.add(idStr);
      return { ...f, curso_ids: [...set] };
    });
  };

  const guardar = async () => {
    const grupo_id = parseInt(form.grupo_id, 10);
    const personal_id = parseInt(form.personal_id, 10);
    if (!grupo_id || !personal_id) {
      SwalAcademico.fire({ icon: 'warning', title: 'Complete grupo y docente' });
      return;
    }
    try {
      if (modal?.edit) {
        const curso_id = parseInt(form.curso_id, 10);
        if (!curso_id) {
          SwalAcademico.fire({ icon: 'warning', title: 'Seleccione un curso' });
          return;
        }
        await api.put(`/admin/academico/asignaturas/${modal.edit.id}`, {
          grupo_id,
          curso_id,
          personal_id,
        });
        setModal(null);
        if (filtrosAplicados) await load(filtrosAplicados);
        SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
        return;
      }

      const curso_ids = (form.curso_ids || [])
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isFinite(n));
      if (!curso_ids.length) {
        SwalAcademico.fire({
          icon: 'warning',
          title: 'Seleccione al menos un curso',
          text: 'Marque los cursos que dictará el docente en este grupo.',
        });
        return;
      }

      const { data } = await api.post('/admin/academico/asignaturas', {
        grupo_id,
        personal_id,
        curso_ids,
      });

      setModal(null);
      if (filtrosAplicados) await load(filtrosAplicados);

      const n = data.creadas || curso_ids.length;
      const extra =
        data.omitidos?.length || data.errores?.length
          ? ` (${data.omitidos?.length || 0} omitidos, ${data.errores?.length || 0} con error)`
          : '';
      SwalAcademico.fire({
        icon: 'success',
        title: n === 1 ? 'Asignatura creada' : `${n} asignaturas creadas`,
        text: extra ? extra.replace(/^\s/, '') : undefined,
        timer: data.omitidos?.length ? undefined : 1400,
        showConfirmButton: !!data.omitidos?.length,
      });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminar = async (r) => {
    const ok = await SwalAcademico.fire({
      icon: 'warning',
      title: '¿Borrar asignatura?',
      html: `${r.nivel_nombre} ${r.grado}° ${r.seccion} — ${r.curso_nombre}`,
      showCancelButton: true
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/academico/asignaturas/${r.id}`);
      if (filtrosAplicados) await load(filtrosAplicados);
      SwalAcademico.fire({ icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e) {
      SwalAcademico.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar (puede haber notas o contenidos).' });
    }
  };

  const grupoRowDesdeAsignatura = (r) => ({
    id: r.grupo_id,
    grado: r.grado,
    seccion: r.seccion,
    nivel_nombre: r.nivel_nombre,
    turno_nombre: r.turno_nombre,
    anio: r.anio != null ? r.anio : filtros.anio,
  });

  const accionAsignaturaMenu = async (accion, row) => {
    cerrarMenuAsignatura();
    if (accion === 'editar') {
      openEdit(row);
      return;
    }
    if (accion === 'eliminar') {
      await eliminar(row);
      return;
    }
    if (accion === 'lista_alumnos') {
      setListaAlumnosGrupoRow(grupoRowDesdeAsignatura(row));
      return;
    }
    if (accion === 'registrar_asistencia') {
      setGrupoAsistenciaAdmin(grupoRowDesdeAsignatura(row));
      return;
    }
    if (accion === 'aula_virtual') {
      navigate(`/docente/cursos/${row.id}/aula`, {
        state: { adminReturnTo: '/admin/academico/asignaturas' },
      });
      return;
    }
    if (accion === 'copiar_contenido') {
      setCopiarContenidoAsignaturaId(row.id);
      return;
    }
    if (accion === 'registrar_notas') {
      setRegistrarNotasAsignaturaId(row.id);
      return;
    }
    if (accion === 'criterios') {
      setCriteriosAsignaturaId(row.id);
      return;
    }
  };

  if (listaAlumnosGrupoRow) {
    return (
      <>
        <section className="dg-section admin-academico-asignaturas-section">
          <GrupoAlumnosListaView
            grupoId={listaAlumnosGrupoRow.id}
            grupoInfo={{
              id: listaAlumnosGrupoRow.id,
              grado: listaAlumnosGrupoRow.grado,
              seccion: listaAlumnosGrupoRow.seccion,
              nivel_nombre: listaAlumnosGrupoRow.nivel_nombre,
              turno_nombre: listaAlumnosGrupoRow.turno_nombre,
              anio: listaAlumnosGrupoRow.anio,
            }}
            onVolver={() => setListaAlumnosGrupoRow(null)}
            psicologiaLinkMode="admin"
            menuAcademicoAlumno
            puedeEliminarIncidencias
          />
        </section>
        <AdminGrupoAsistenciaModal
          open={!!grupoAsistenciaAdmin}
          grupo={grupoAsistenciaAdmin}
          onClose={() => setGrupoAsistenciaAdmin(null)}
        />
        <ModalCopiarContenidoAsignatura
          open={copiarContenidoAsignaturaId != null}
          asignaturaId={copiarContenidoAsignaturaId}
          onClose={() => setCopiarContenidoAsignaturaId(null)}
          onCopied={() => {
            if (filtrosAplicados) load(filtrosAplicados);
          }}
        />
        <ModalRegistrarNotasAsignatura
          open={registrarNotasAsignaturaId != null}
          asignaturaId={registrarNotasAsignaturaId}
          onClose={() => setRegistrarNotasAsignaturaId(null)}
          onGuardado={() => {
            if (filtrosAplicados) load(filtrosAplicados);
          }}
        />
        <ModalCriteriosIndicadoresAsignatura
          open={criteriosAsignaturaId != null}
          asignaturaId={criteriosAsignaturaId}
          onClose={() => setCriteriosAsignaturaId(null)}
        />
      </>
    );
  }

  if (!filtros) {
    return (
      <section className="dg-section admin-academico-asignaturas-section">
        <p className="admin-academico-grupos-loading">Cargando filtros…</p>
      </section>
    );
  }

  return (
    <section className="dg-section admin-academico-asignaturas-section">
      <div className="admin-academico-asignaturas-filters-bar">
          {(meta?.sedes || []).length > 0 && (
            <label className="admin-academico-grupos-filter-field">
              <span>Colegio / Sede</span>
              <select
                value={filtros.sede_id}
                onChange={(e) => setFiltros((f) => ({ ...f, sede_id: e.target.value }))}
              >
                {(meta?.sedes || []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-academico-grupos-filter-field">
            <span>Nivel</span>
            <select
              value={filtros.nivel_id}
              onChange={(e) => {
                const nivel_id = e.target.value;
                const gs = gradosDisponiblesPorNivel(nivel_id, nivelesLista);
                setFiltros((f) => ({
                  ...f,
                  nivel_id,
                  grado: gs[0] != null ? String(gs[0]) : '',
                }));
              }}
            >
              {nivelesLista.map((n) => (
                <option key={n.id} value={String(n.id)}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-academico-grupos-filter-field admin-academico-asignaturas-filter-grado">
            <span>Grado</span>
            <select
              value={filtros.grado}
              onChange={(e) => setFiltros((f) => ({ ...f, grado: e.target.value }))}
            >
              {gradosFiltro.map((g) => (
                <option key={g} value={String(g)}>
                  {g}°
                </option>
              ))}
            </select>
          </label>
          <label className="admin-academico-grupos-filter-field admin-academico-asignaturas-filter-seccion">
            <span>Sección</span>
            <select
              value={filtros.seccion}
              onChange={(e) => setFiltros((f) => ({ ...f, seccion: e.target.value }))}
            >
              {SECCIONES_GRUPO.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </label>
          {(meta?.turnos || []).length > 0 && (
            <label className="admin-academico-grupos-filter-field">
              <span>Turno</span>
              <select
                value={filtros.turno_id}
                onChange={(e) => setFiltros((f) => ({ ...f, turno_id: e.target.value }))}
              >
                {(meta?.turnos || []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-academico-grupos-filter-field admin-academico-asignaturas-filter-anio">
            <span>Año</span>
            <select
              value={filtros.anio}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  anio: parseInt(e.target.value, 10) || new Date().getFullYear(),
                }))
              }
            >
              {añosSelect.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dg-btn-primary admin-academico-asignaturas-btn-buscar" onClick={onBuscar}>
            Buscar
          </button>
      </div>

      {loading ? (
        <p className="admin-academico-grupos-loading">Buscando…</p>
      ) : !buscado ? (
        <p className="admin-academico-asignaturas-hint">
          Elija los filtros y pulse <strong>Buscar</strong> para listar las asignaturas del año.
        </p>
      ) : rows.length === 0 ? (
        <p className="admin-academico-niveles-empty">No hay asignaturas con esos filtros.</p>
      ) : (
        <div className="admin-academico-asignaturas-table-block">
          {false && esInicialBuscado && (
            <div className="admin-academico-libreta-inicial-toolbar" role="region" aria-label="Libreta Inicial">
              {libretaGrupo?.conflicto ? (
                <p className="admin-academico-libreta-inicial-warn">
                  Hay más de un aula en el resultado. Refine sección y turno en los filtros para usar la libreta.
                </p>
              ) : libretaGrupo?.id ? (
                <p className="admin-academico-libreta-inicial-meta">
                  {libretaGrupo.nivel_nombre} {libretaGrupo.grado}° {etiquetaSeccionGrupo(libretaGrupo.seccion)}
                  {libretaGrupo.turno_nombre ? ` · ${libretaGrupo.turno_nombre}` : ''}
                  {libretaGrupo.anio ? ` (${libretaGrupo.anio})` : ''}
                </p>
              ) : null}
              <div className="admin-academico-libreta-inicial-toolbar-actions">
                <button
                  type="button"
                  className="admin-academico-grupos-btn-nuevo admin-academico-libreta-inicial-btn"
                  disabled={!libretaGrupo?.id}
                  onClick={() => libretaGrupo?.id && setModalLibretaAreas(libretaGrupo)}
                >
                  Ver indicadores
                </button>
                <button
                  type="button"
                  className="admin-academico-grupos-btn-nuevo admin-academico-libreta-inicial-btn admin-academico-libreta-inicial-btn--sec"
                  disabled={!libretaGrupo?.id}
                  onClick={() => libretaGrupo?.id && setModalLibretaRegistro(libretaGrupo)}
                >
                  Registrar notas
                </button>
              </div>
            </div>
          )}
          <div className="admin-academico-table-wrap admin-academico-asignaturas-table-wrap">
            <table className="admin-academico-table admin-academico-asignaturas-table">
            <thead>
              <tr>
                <th>Docente</th>
                <th>Curso</th>
                <th>Grupo (Nivel - Grado - Sección)</th>
                <th className="admin-academico-asignaturas-th-opciones">Opciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.docente_nombre || '—'}</td>
                  <td>{r.curso_nombre || '—'}</td>
                  <td>{etiquetaGrupoAsignatura(r)}</td>
                  <td className="admin-academico-asignaturas-td-opciones">
                    <button
                      type="button"
                      className="admin-academico-grupo-card__opciones admin-academico-asignaturas-opciones-btn"
                      aria-expanded={menuAsignaturaRow?.id === r.id}
                      aria-haspopup="menu"
                      onClick={(e) => abrirMenuAsignatura(e, r)}
                    >
                      Opciones
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {menuAsignaturaRow &&
        menuCoords &&
        createPortal(
          <div
            ref={menuPortalRef}
            className="admin-academico-asignaturas-dropdown-portal"
            role="menu"
            style={{
              top: menuCoords.top,
              left: menuCoords.left,
              minWidth: menuCoords.minWidth,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {opcionesMenuVisibles.map((op) => (
              <button
                key={op.key}
                type="button"
                role="menuitem"
                className={`admin-academico-asignaturas-dropdown-item${op.danger ? ' admin-academico-asignaturas-dropdown-item--danger' : ''}`}
                onClick={() => accionAsignaturaMenu(op.key, menuAsignaturaRow)}
              >
                <span className="admin-academico-grupo-card__dropdown-icon" aria-hidden>
                  {op.icon}
                </span>
                {op.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      <AdminGrupoAsistenciaModal
        open={!!grupoAsistenciaAdmin}
        grupo={grupoAsistenciaAdmin}
        onClose={() => setGrupoAsistenciaAdmin(null)}
      />

      <ModalRoot open={!!(modal && meta)} onClose={() => setModal(null)} wide>
        <>
          <h3>{modal?.edit ? 'Editar asignatura' : 'Nueva asignatura'}</h3>
          <p className="admin-academico-hint">
            {modal?.edit
              ? 'Una asignatura por curso. Solo se listan cursos del nivel del grupo que aún no tienen docente en ese aula (salvo el curso actual).'
              : 'Elija el grupo y el docente; marque uno o más cursos del mismo nivel que aún no tengan docente en ese grupo.'}
          </p>
          <div className="admin-academico-modal-grid">
            <div className="admin-academico-field admin-academico-field--full">
              <label>Grupo</label>
              <select
                value={form.grupo_id || ''}
                onChange={(e) => onGrupoModalChange(e.target.value)}
              >
                {gruposOrdenados.length === 0 && <option value="">— Sin grupos —</option>}
                {gruposOrdenados.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nivel_nombre} {g.grado}° {etiquetaSeccionGrupo(g.seccion)}
                    {g.turno_nombre ? ` · ${g.turno_nombre}` : ''}
                    {g.anio ? ` (${g.anio})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>Docente</label>
              <select
                value={form.personal_id || ''}
                onChange={(e) => setForm({ ...form, personal_id: e.target.value })}
              >
                {(meta?.docentes || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div className="admin-academico-field admin-academico-field--full">
              <label>{modal?.edit ? 'Curso' : 'Cursos'}</label>
              {!form.grupo_id ? (
                <p className="admin-academico-asignaturas-cursos-empty">Seleccione un grupo primero.</p>
              ) : loadingCursosDisponibles ? (
                <p className="admin-academico-asignaturas-cursos-empty">Cargando cursos…</p>
              ) : modal?.edit ? (
                <select
                  value={form.curso_id || ''}
                  onChange={(e) => setForm({ ...form, curso_id: e.target.value })}
                >
                  {cursosDisponibles.length === 0 && <option value="">— Sin cursos —</option>}
                  {cursosDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.asignado_actual ? ' (actual)' : ''}
                    </option>
                  ))}
                </select>
              ) : cursosDisponibles.length === 0 ? (
                <p className="admin-academico-asignaturas-cursos-empty">
                  No hay cursos libres en el nivel
                  {infoCursosGrupo?.nivel_nombre ? ` «${infoCursosGrupo.nivel_nombre}»` : ''}
                  {' '}para este grupo. Todos ya tienen docente asignado.
                </p>
              ) : (
                <>
                  <p className="admin-academico-asignaturas-cursos-meta">
                    Nivel: <strong>{infoCursosGrupo?.nivel_nombre || '—'}</strong>
                    {' · '}
                    {cursosDisponibles.length} curso{cursosDisponibles.length !== 1 ? 's' : ''} disponible
                    {cursosDisponibles.length !== 1 ? 's' : ''}
                  </p>
                  <div
                    className="admin-academico-asignaturas-cursos-list"
                    role="group"
                    aria-label="Cursos a asignar. Pulse para seleccionar o quitar."
                  >
                    {cursosDisponibles.map((c) => {
                      const selected = (form.curso_ids || []).map(String).includes(String(c.id));
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`admin-academico-asignaturas-curso-tab${selected ? ' admin-academico-asignaturas-curso-tab--selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => toggleCursoNuevo(c.id)}
                        >
                          <span className="admin-academico-asignaturas-curso-tab__nombre">{c.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                  {(form.curso_ids || []).length > 0 && (
                    <p className="admin-academico-asignaturas-cursos-selected">
                      {(form.curso_ids || []).length} curso{(form.curso_ids || []).length !== 1 ? 's' : ''} seleccionado
                      {(form.curso_ids || []).length !== 1 ? 's' : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="admin-academico-modal-actions">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn
              onClick={guardar}
              disabled={
                !form.grupo_id ||
                !form.personal_id ||
                loadingCursosDisponibles ||
                (!modal?.edit && cursosDisponibles.length === 0)
              }
            >
              {modal?.edit ? 'Guardar' : 'Crear asignatura(s)'}
            </Btn>
          </div>
        </>
      </ModalRoot>
      <ModalCopiarContenidoAsignatura
        open={copiarContenidoAsignaturaId != null}
        asignaturaId={copiarContenidoAsignaturaId}
        onClose={() => setCopiarContenidoAsignaturaId(null)}
        onCopied={() => {
          if (filtrosAplicados) load(filtrosAplicados);
        }}
      />
      <ModalRegistrarNotasAsignatura
        open={registrarNotasAsignaturaId != null}
        asignaturaId={registrarNotasAsignaturaId}
        onClose={() => setRegistrarNotasAsignaturaId(null)}
        onGuardado={() => {
          if (filtrosAplicados) load(filtrosAplicados);
        }}
      />
      <ModalCriteriosIndicadoresAsignatura
        open={criteriosAsignaturaId != null}
        asignaturaId={criteriosAsignaturaId}
        onClose={() => setCriteriosAsignaturaId(null)}
      />
      {modalLibretaAreas && (
        <LibretaInicialAreasModal grupo={modalLibretaAreas} onClose={() => setModalLibretaAreas(null)} />
      )}
      {modalLibretaRegistro && (
        <LibretaInicialRegistroModal grupo={modalLibretaRegistro} onClose={() => setModalLibretaRegistro(null)} />
      )}
    </section>
  );
}
