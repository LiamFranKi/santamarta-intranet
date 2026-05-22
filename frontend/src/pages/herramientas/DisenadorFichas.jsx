import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import '../VocabulariosPage.css';
import './DisenadorFichas.css';

/** Gemini + PDF en servidor pueden tardar más de 30 s (timeout global de api.js). */
const GENERAR_FICHA_TIMEOUT_MS = 180000;

function originServidor() {
  const base = api.defaults?.baseURL || '';
  if (base) return String(base).replace(/\/api\/?$/i, '');
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5000';
  return `${protocol}//${hostname}`;
}

const ARCHIVO_MASCOTA_DEFECTO = 'vanguarcito.png';

function urlMascotaVanguarcitoPorDefecto() {
  return `${originServidor()}/assets/fichas-ia/${ARCHIVO_MASCOTA_DEFECTO}`;
}

function urlMascotaVanguarcito(config) {
  return config?.mascota_vanguarcito_url || urlMascotaVanguarcitoPorDefecto();
}

/** Robot del login y menú (emoji 🤖), no es un archivo en el proyecto. */
function MascotaVanguarcitoVisual({ src, classNameImg, classNameEmoji = 'fia-mascota-emoji' }) {
  const [sinImagen, setSinImagen] = useState(false);

  useEffect(() => {
    setSinImagen(false);
  }, [src]);

  if (sinImagen) {
    return (
      <span className={classNameEmoji} aria-hidden>
        🤖
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={classNameImg}
      onError={() => setSinImagen(true)}
    />
  );
}

function enlazarFallbackEmojiEnSwal() {
  const img = Swal.getPopup()?.querySelector('.fia-swal-mascota');
  if (!img || img.dataset.fiaFallback) return;
  img.dataset.fiaFallback = '1';
  img.onerror = () => {
    const span = document.createElement('span');
    span.className = 'fia-swal-mascota-emoji';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = '🤖';
    img.replaceWith(span);
  };
}

function abrirSwalGenerandoFicha(mascotaUrl, conIa) {
  const texto = conIa
    ? 'Vanguarcito organiza la teoría y los ejercicios. Luego el servidor genera tu PDF.'
    : 'Maquetando tu ficha desde el formulario (sin IA).';
  const hint = conIa ? 'Puede tardar 1–2 minutos · no cierre esta ventana' : 'Hasta 1 minuto · no cierre esta ventana';

  Swal.fire({
    html: `
      <div class="fia-swal-carga">
        <div class="fia-swal-mascota-wrap">
          <div class="fia-swal-aura" aria-hidden="true"></div>
          <img src="${mascotaUrl}" alt="Vanguarcito trabajando" class="fia-swal-mascota" />
        </div>
        <h3 class="fia-swal-titulo">${conIa ? 'Vanguarcito está creando tu ficha' : 'Generando tu ficha'}</h3>
        <p class="fia-swal-texto">${texto}</p>
        <div class="fia-swal-bar"><div class="fia-swal-bar-inner"></div></div>
        <p class="fia-swal-hint">${hint}</p>
        <p class="fia-swal-dots" style="margin-top:0.5rem;font-size:1.2rem;color:#3b82f6">
          <span>●</span><span> ●</span><span> ●</span>
        </p>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false,
    customClass: { popup: 'fia-swal-popup' },
    didOpen: () => {
      const loader = Swal.getContainer()?.querySelector('.swal2-loader');
      if (loader) loader.style.display = 'none';
      enlazarFallbackEmojiEnSwal();
    },
  });
}

const ESTADO_LABEL = {
  BORRADOR: 'Borrador',
  EXTRAYENDO: 'Extrayendo PDF…',
  IA_PROCESANDO: 'Vanguarcito…',
  MAQUETANDO: 'Maquetando…',
  LISTO: 'Listo',
  ERROR: 'Error',
  PUBLICADO: 'Publicado',
  CANCELADO: 'Cancelado',
};

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function opcionGrupoLabel(o) {
  const sec = (o.seccion || '').trim();
  const parteSec = sec ? ` · Sec. ${sec}` : '';
  return `${o.nivel_nombre} — ${o.grado}°${parteSec}`;
}

const ESTILOS_FICHA_FALLBACK = [
  {
    codigo: 'general',
    nombre: 'General (ciencias, comunicación, personal social…)',
    descripcion: 'Preguntas, tablas, dibujo y V/F en la misma ficha.',
  },
  {
    codigo: 'matematica',
    nombre: 'Matemática / Números',
    descripcion: 'Mínimo 10 ejercicios: operaciones, problemas y completar.',
  },
];

const PATRON_MATEMATICA =
  /matem|n[uú]mer|numeraci|aritm|álgebra|algebra|geometr|razonamiento\s*matem|estad[ií]stica|medida|fracci|decimal|porcentaje/i;

function detectarEstiloPorCurso(nombreCurso) {
  return PATRON_MATEMATICA.test(String(nombreCurso || '')) ? 'matematica' : 'general';
}

function etiquetaEstilo(codigo) {
  const e = ESTILOS_FICHA_FALLBACK.find((x) => x.codigo === codigo);
  return e?.nombre || (codigo === 'matematica' ? 'Matemática' : 'General');
}

async function abrirPreviewHtml(id) {
  try {
    const res = await api.get(`/fichas-ia/trabajos/${id}/preview-html`, { responseType: 'text' });
    const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo abrir la vista previa',
      text: e.response?.data?.error || e.message || '',
    });
  }
}

export default function DisenadorFichas() {
  const { user } = useAuth();
  const esAdmin = user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA';

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(() => ({
    vanguarcito_disponible: false,
    verificacion: null,
    tiene_clave_servidor: false,
    mascota_vanguarcito_url: urlMascotaVanguarcitoPorDefecto(),
  }));
  const [trabajos, setTrabajos] = useState([]);
  const [opcionesGrupo, setOpcionesGrupo] = useState([]);
  const [cursosGrupo, setCursosGrupo] = useState([]);
  const [cursosFiltro, setCursosFiltro] = useState([]);

  const [filtroGrupoId, setFiltroGrupoId] = useState('');
  const [filtroAsignaturaId, setFiltroAsignaturaId] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [form, setForm] = useState({
    grupo_id: '',
    asignatura_id: '',
    titulo: '',
    unidad: '1',
    instrucciones_ia: '',
    puntos_clave: '',
    usar_ia: true,
    estilo_ficha: 'auto',
  });
  const [archivoPdf, setArchivoPdf] = useState(null);

  const puedeEditarFila = (row) => Boolean(row.puede_editar) || esAdmin;

  const cargarCursos = useCallback(async (grupoId, destino) => {
    if (!grupoId) {
      if (destino === 'form') setCursosGrupo([]);
      else setCursosFiltro([]);
      return;
    }
    try {
      const res = await api.get(`/fichas-ia/meta/grupos/${grupoId}/cursos`);
      const list = res.data.cursos || [];
      if (destino === 'form') setCursosGrupo(list);
      else setCursosFiltro(list);
    } catch {
      if (destino === 'form') setCursosGrupo([]);
      else setCursosFiltro([]);
    }
  }, []);

  const cargarTrabajos = useCallback(async () => {
    const params = {};
    if (filtroGrupoId) params.grupo_id = filtroGrupoId;
    if (filtroAsignaturaId) params.asignatura_id = filtroAsignaturaId;
    const res = await api.get('/fichas-ia/trabajos', { params });
    setTrabajos(res.data?.data || []);
  }, [filtroGrupoId, filtroAsignaturaId]);

  const refrescar = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, grupos] = await Promise.all([
        api.get('/fichas-ia/config', { params: { verificar: '1' } }),
        api.get('/fichas-ia/meta/grupos'),
      ]);
      const cfgData = cfg.data || {};
      setOpcionesGrupo(grupos.data?.opciones || []);
      const ver = cfgData.verificacion;
      const vanguarcitoOk = Boolean(
        cfgData.vanguarcito_disponible ?? (ver?.ok && cfgData.tiene_clave_servidor)
      );
      setConfig({
        ...cfgData,
        vanguarcito_disponible: vanguarcitoOk,
        mascota_vanguarcito_url:
          cfgData.mascota_vanguarcito_url || urlMascotaVanguarcitoPorDefecto(),
      });
      if (!vanguarcitoOk) {
        setForm((f) => ({ ...f, usar_ia: false }));
      }
      await cargarTrabajos();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar el módulo', 'error');
    } finally {
      setLoading(false);
    }
  }, [cargarTrabajos]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  useEffect(() => {
    cargarCursos(filtroGrupoId, 'filtro');
    setFiltroAsignaturaId('');
  }, [filtroGrupoId, cargarCursos]);

  useEffect(() => {
    if (modalOpen && form.grupo_id) {
      cargarCursos(form.grupo_id, 'form');
    }
  }, [modalOpen, form.grupo_id, cargarCursos]);

  useEffect(() => {
    if (loading) return;
    cargarTrabajos().catch(() => {});
  }, [filtroGrupoId, filtroAsignaturaId, loading, cargarTrabajos]);

  const abrirModal = async (row = null) => {
    setEditItem(row);
    setArchivoPdf(null);
    let puntos = '';
    let instrucciones = '';
    if (row?.id) {
      try {
        const det = await api.get(`/fichas-ia/trabajos/${row.id}`);
        for (const sec of det.data?.secciones || []) {
          if (!sec?.contenido_json) continue;
          try {
            const j = JSON.parse(sec.contenido_json);
            if (sec.titulo === 'Puntos clave') puntos = j.puntos_clave || '';
            if (sec.titulo === 'Instrucciones docente') instrucciones = j.instrucciones_ia || '';
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    setForm({
      grupo_id: row?.grupo_id ? String(row.grupo_id) : opcionesGrupo[0] ? String(opcionesGrupo[0].grupo_id) : '',
      asignatura_id: row?.asignatura_id ? String(row.asignatura_id) : '',
      titulo: row?.titulo || '',
      unidad: row?.unidad || '1',
      instrucciones_ia: instrucciones,
      puntos_clave: puntos,
      usar_ia: config.vanguarcito_disponible,
      estilo_ficha: row?.estilo_ficha || 'auto',
    });
    setModalOpen(true);
  };

  const cursoSeleccionado = cursosGrupo.find((c) => String(c.asignatura_id) === String(form.asignatura_id));
  const estiloResuelto =
    form.estilo_ficha === 'auto'
      ? detectarEstiloPorCurso(cursoSeleccionado?.curso_nombre)
      : form.estilo_ficha === 'matematica'
        ? 'matematica'
        : 'general';
  const estilosOpciones = config.estilos_ficha?.length ? config.estilos_ficha : ESTILOS_FICHA_FALLBACK;

  const guardarYGenerar = async (soloGuardar = false) => {
    if (!form.titulo.trim()) {
      Swal.fire({ icon: 'warning', title: 'Indique el título de la ficha' });
      return;
    }
    if (!form.grupo_id) {
      Swal.fire({ icon: 'warning', title: 'Elija el grupo (nivel, grado y sección)' });
      return;
    }

    setGenerando(true);
    try {
      let trabajoId = editItem?.id;

      if (editItem) {
        await api.put(`/fichas-ia/trabajos/${editItem.id}`, {
          titulo: form.titulo.trim(),
          grupo_id: form.grupo_id,
          asignatura_id: form.asignatura_id || '',
          unidad: form.unidad.trim(),
          puntos_clave: form.puntos_clave.trim(),
          instrucciones_ia: form.instrucciones_ia.trim(),
          estilo_ficha: form.estilo_ficha,
        });
        if (soloGuardar) {
          Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
          setModalOpen(false);
          await cargarTrabajos();
          return;
        }
      } else {
        const fd = new FormData();
        fd.append('titulo', form.titulo.trim());
        fd.append('grupo_id', form.grupo_id);
        if (form.asignatura_id) fd.append('asignatura_id', form.asignatura_id);
        fd.append('unidad', form.unidad.trim());
        fd.append('puntos_clave', form.puntos_clave.trim());
        fd.append('instrucciones_ia', form.instrucciones_ia.trim());
        fd.append('estilo_ficha', form.estilo_ficha || 'auto');
        fd.append('usar_ia', form.usar_ia && config.vanguarcito_disponible ? '1' : '0');
        if (archivoPdf) fd.append('archivo_pdf', archivoPdf);

        const { data: creado } = await api.post('/fichas-ia/trabajos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        trabajoId = creado.trabajo_id;
      }

      abrirSwalGenerandoFicha(
        urlMascotaVanguarcito(config),
        form.usar_ia && config.vanguarcito_disponible
      );

      const { data: gen } = await api.post(
        `/fichas-ia/trabajos/${trabajoId}/generar`,
        { usar_ia: form.usar_ia && config.vanguarcito_disponible },
        { timeout: GENERAR_FICHA_TIMEOUT_MS }
      );

      Swal.close();
      setModalOpen(false);
      await cargarTrabajos();

      if (gen?.aviso_ia) {
        await Swal.fire({
          icon: 'warning',
          title: 'Ficha creada sin Vanguarcito',
          text: `Se usó el formulario automático (no la IA).\n\nMotivo:\n${gen.aviso_ia}`,
          confirmButtonText: 'Entendido',
        });
      }

      await Swal.fire({
        icon: gen?.aviso_ia ? 'info' : 'success',
        title: gen?.uso_vanguarcito ? 'Ficha lista (con Vanguarcito)' : 'Ficha lista',
        showCancelButton: true,
        confirmButtonText: 'Vista previa',
        cancelButtonText: 'Cerrar',
      }).then((r) => {
        if (r.isConfirmed) abrirPreviewHtml(trabajoId);
      });
    } catch (err) {
      Swal.close();
      const esTimeout =
        err.code === 'ECONNABORTED' || String(err.message || '').includes('timeout');
      const det = err.response?.data?.error || err.message || 'No se pudo completar';
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar la ficha',
        text: esTimeout
          ? 'La generación tardó más de lo esperado. Espere 1 minuto, recargue la página y revise si la ficha quedó en Listo o Maquetando; si sigue atascada, regenere de nuevo.'
          : det.includes('429') || det.includes('límite')
            ? `${det} Puede desmarcar «Usar Vanguarcito» e intentar de nuevo.`
            : det,
      });
      await cargarTrabajos();
    } finally {
      setGenerando(false);
    }
  };

  const regenerar = async (row) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Regenerar esta ficha con Vanguarcito?',
      text: 'Se volverá a procesar el contenido y el PDF.',
      showCancelButton: true,
      confirmButtonText: 'Regenerar',
    });
    if (!ok.isConfirmed) return;
    setGenerando(true);
    try {
      abrirSwalGenerandoFicha(urlMascotaVanguarcito(config), config.vanguarcito_disponible);
      await api.post(
        `/fichas-ia/trabajos/${row.id}/generar`,
        { usar_ia: config.vanguarcito_disponible },
        { timeout: GENERAR_FICHA_TIMEOUT_MS }
      );
      Swal.close();
      Swal.fire({ icon: 'success', title: 'Regenerada', timer: 1500, showConfirmButton: false });
      await cargarTrabajos();
    } catch (e) {
      Swal.close();
      Swal.fire('Error', e.response?.data?.error || 'No se pudo regenerar', 'error');
    } finally {
      setGenerando(false);
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Eliminar esta ficha?',
      text: row.titulo,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/fichas-ia/trabajos/${row.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1400, showConfirmButton: false });
      await cargarTrabajos();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || '', 'error');
    }
  };

  const verPreview = (row) => {
    abrirPreviewHtml(row.id);
  };

  const descargarPdf = async (row) => {
    try {
      const res = await api.get(`/fichas-ia/trabajos/${row.id}/descargar-pdf`, { responseType: 'blob' });
      const nombre =
        row.archivo_generado_nombre || res.headers['content-disposition']?.match(/filename="?([^"]+)"?/)?.[1] || `ficha-${row.id}.pdf`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el PDF',
        text: e.response?.data?.error || e.message || '',
      });
    }
  };

  const sinGrupos = !loading && opcionesGrupo.length === 0;

  return (
    <DashboardLayout>
      <div className="voc-page">
        <header className="voc-page-header fia-hero">
          <div className="fia-hero-text">
            <h1>Fichas IA</h1>
            <p>
              Biblioteca de fichas del colegio (teoría + ficha de aplicación). Vanguarcito estructura el contenido;
              la plantilla Vanguard aplica diseño, logo y mascotas en el PDF.
            </p>
            {!config.tiene_clave_servidor ? (
            <div className="voc-alert">
              <strong>Sin clave en el servidor.</strong> El prepago en Google AI Studio no basta: debe agregar{' '}
              <code>GOOGLE_AI_API_KEY</code> en <code>backend/.env</code> del VPS (clave del proyecto{' '}
              <em>sistema-intranet</em>) y ejecutar <code>pm2 restart all</code>.
            </div>
          ) : config.verificacion && !config.verificacion.ok ? (
            <div className="voc-alert">
              <strong>Vanguarcito no conecta.</strong> {config.verificacion.mensaje}
              {config.verificacion.ayuda && (
                <>
                  <br />
                  <span style={{ fontSize: '0.9em' }}>{config.verificacion.ayuda}</span>
                </>
              )}
              {config.verificacion.clave_sufijo && (
                <>
                  <br />
                  <span style={{ fontSize: '0.85em' }}>Clave en servidor (sufijo): {config.verificacion.clave_sufijo}</span>
                </>
              )}
            </div>
          ) : config.vanguarcito_disponible ? (
            <div className="voc-alert" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
              Vanguarcito conectado — puede usarlo al crear o regenerar fichas.
            </div>
          ) : (
            <div className="voc-alert">Comprobando Vanguarcito…</div>
          )}
            <details className="fia-tips">
              <summary>💡 ¿Dónde más usar Vanguarcito sin gastar mucho en IA?</summary>
              <ul>
                <li>
                  <strong>Fichas IA (aquí):</strong> solo al crear o regenerar; reutilice la misma ficha y edite
                  puntos clave en lugar de regenerar todo.
                </li>
                <li>
                  <strong>Sin IA:</strong> desmarque «Usar Vanguarcito» — la plantilla y mascotas en el PDF siguen
                  igual; no consume Gemini.
                </li>
                <li>
                  <strong>Docentes:</strong> mensaje de bienvenida en dashboard, tooltip en menú Fichas IA, PDF con
                  mascotas (ya incluido).
                </li>
                <li>
                  <strong>Alumnos:</strong> mascotas en fichas impresas y, a futuro, resúmenes cortos bajo demanda (no
                  automáticos).
                </li>
                <li>
                  <strong>Evitar costo:</strong> no regenerar en bucle; un PDF de apoyo claro reduce tokens; use
                  instrucciones del docente en lugar de pedir todo de nuevo a la IA.
                </li>
              </ul>
            </details>
          </div>
          <div className="fia-hero-mascota" aria-hidden="true">
            <MascotaVanguarcitoVisual
              src={urlMascotaVanguarcito(config)}
              classNameImg="fia-hero-mascota-img"
            />
          </div>
        </header>

        <section className="voc-section">
          <div className="voc-section-head">
            <h2>Biblioteca de fichas</h2>
            {opcionesGrupo.length > 0 && (
              <button type="button" className="voc-btn-primary" onClick={() => abrirModal(null)} disabled={generando}>
                + Nueva ficha
              </button>
            )}
          </div>

          <div className="voc-panel" style={{ marginBottom: 16 }}>
            <div className="voc-panel-head">
              <FilterListOutlinedIcon sx={{ fontSize: 20, color: '#4a83c1' }} />
              <div>
                <div className="voc-panel-title">Filtros</div>
                <p className="voc-panel-desc">Acote por aula o por curso/asignatura.</p>
              </div>
            </div>
            <div className="voc-modal-grid">
              <label className="voc-label-block">
                <span className="voc-label-text">Grado / grupo</span>
                <select
                  className="voc-input voc-select"
                  value={filtroGrupoId}
                  onChange={(e) => setFiltroGrupoId(e.target.value)}
                >
                  <option value="">Todos los grupos</option>
                  {opcionesGrupo.map((o) => (
                    <option key={o.grupo_id} value={String(o.grupo_id)}>
                      {o.etiqueta || opcionGrupoLabel(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="voc-label-block">
                <span className="voc-label-text">Curso</span>
                <select
                  className="voc-input voc-select"
                  value={filtroAsignaturaId}
                  onChange={(e) => setFiltroAsignaturaId(e.target.value)}
                  disabled={!filtroGrupoId}
                >
                  <option value="">Todos los cursos</option>
                  {cursosFiltro.map((c) => (
                    <option key={c.asignatura_id} value={String(c.asignatura_id)}>
                      {c.curso_nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {sinGrupos && (
            <div className="voc-alert">
              No hay grupos disponibles para su perfil en el año lectivo. Asigne grupos o use un perfil con acceso al
              colegio.
            </div>
          )}

          {loading ? (
            <div className="voc-loading">Cargando…</div>
          ) : trabajos.length === 0 ? (
            <div className="voc-empty">No hay fichas con estos filtros. Use «+ Nueva ficha» para crear la primera.</div>
          ) : (
            <div className="voc-table-wrap">
              <table className="voc-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Título</th>
                    <th>Grupo</th>
                    <th>Curso</th>
                    <th>Tipo ficha</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {trabajos.map((row) => (
                    <tr key={row.id}>
                      <td className="voc-fecha">{formatFecha(row.creado_en)}</td>
                      <td>
                        <div className="voc-titulo">{row.titulo}</div>
                        {row.unidad && <div className="voc-file-meta">Unidad {row.unidad}</div>}
                        {row.estado === 'LISTO' && (
                          <div className="voc-file-meta">
                            {row.generado_con === 'vanguarcito'
                              ? 'Con Vanguarcito'
                              : row.generado_con === 'vanguarcito_parcial'
                                ? 'Vanguarcito + formulario'
                                : 'Solo formulario (sin Vanguarcito)'}
                          </div>
                        )}
                        {row.error_mensaje && row.estado !== 'LISTO' && (
                          <div className="voc-file-meta" style={{ color: '#b91c1c', maxWidth: 280 }}>
                            {row.error_mensaje}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="voc-badge-grado">{row.grupo_display || '—'}</span>
                      </td>
                      <td className="voc-desc">{row.curso_display || '—'}</td>
                      <td>
                        <span className="voc-file-meta">{row.tipo_ficha || 'General'}</span>
                      </td>
                      <td>
                        <span
                          className={`voc-badge-mio ${
                            row.estado === 'LISTO'
                              ? ''
                              : row.estado === 'ERROR'
                                ? ''
                                : ''
                          }`}
                          style={{
                            background:
                              row.estado === 'LISTO'
                                ? '#ecfdf5'
                                : row.estado === 'ERROR'
                                  ? '#fef2f2'
                                  : '#f3f4f6',
                            color:
                              row.estado === 'LISTO'
                                ? '#047857'
                                : row.estado === 'ERROR'
                                  ? '#b91c1c'
                                  : '#4b5563',
                          }}
                        >
                          {ESTADO_LABEL[row.estado] || row.estado}
                        </span>
                      </td>
                      <td>
                        <div className="voc-icon-actions">
                          {(row.estado === 'LISTO' || row.estado === 'ERROR') && (
                            <Tooltip title="Vista previa">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => verPreview(row)}
                                aria-label="Ver"
                              >
                                <VisibilityOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {row.estado === 'LISTO' && (
                            <Tooltip title="Descargar PDF">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => descargarPdf(row)}
                                aria-label="PDF"
                              >
                                <PictureAsPdfOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {puedeEditarFila(row) && (
                            <>
                              <Tooltip title="Editar">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => abrirModal(row)}
                                  aria-label="Editar"
                                >
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {row.estado === 'LISTO' && (
                                <Tooltip title="Regenerar con Vanguarcito">
                                  <IconButton
                                    size="small"
                                    color="secondary"
                                    onClick={() => regenerar(row)}
                                    disabled={generando}
                                    aria-label="Regenerar"
                                  >
                                    <AutoStoriesOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="Eliminar">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => eliminar(row)}
                                  aria-label="Eliminar"
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalOpen &&
        createPortal(
          <div
            className="voc-modal-overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !generando) setModalOpen(false);
            }}
          >
            <div className="voc-modal voc-modal--wide" role="dialog" aria-modal="true">
              <div className="voc-modal-topbar" aria-hidden />
              <div className="voc-modal-header">
                <div className="voc-modal-title-row">
                  <span className="voc-modal-icon-wrap" aria-hidden>
                    <AutoStoriesOutlinedIcon sx={{ fontSize: 26, color: '#2563eb' }} />
                  </span>
                  <div>
                    <div className="voc-modal-kicker">{editItem ? 'Editar ficha' : 'Nueva ficha'}</div>
                    <h2 className="voc-modal-h2">{editItem ? 'Editar datos' : 'Crear ficha pedagógica'}</h2>
                  </div>
                </div>
              </div>

              <div className="voc-modal-body">
                <div className="voc-panel">
                  <div className="voc-panel-head">
                    <GroupsOutlinedIcon sx={{ fontSize: 20, color: '#4a83c1' }} />
                    <div>
                      <div className="voc-panel-title">Aula y curso</div>
                      <p className="voc-panel-desc">Nivel, grado y sección; luego el curso del grupo.</p>
                    </div>
                  </div>
                  <div className="voc-modal-grid">
                    <label className="voc-label-block">
                      <span className="voc-label-text">Grupo (nivel — grado — sección)</span>
                      <select
                        className="voc-input voc-select"
                        value={form.grupo_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, grupo_id: e.target.value, asignatura_id: '' }))
                        }
                      >
                        <option value="">Seleccione…</option>
                        {opcionesGrupo.map((o) => (
                          <option key={o.grupo_id} value={String(o.grupo_id)}>
                            {o.etiqueta || opcionGrupoLabel(o)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="voc-label-block">
                      <span className="voc-label-text">Curso / asignatura</span>
                      <select
                        className="voc-input voc-select"
                        value={form.asignatura_id}
                        onChange={(e) => setForm((f) => ({ ...f, asignatura_id: e.target.value }))}
                        disabled={!form.grupo_id}
                      >
                        <option value="">Seleccione curso…</option>
                        {cursosGrupo.map((c) => (
                          <option key={c.asignatura_id} value={String(c.asignatura_id)}>
                            {c.curso_nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="voc-label-block">
                      <span className="voc-label-text">Tipo de ficha</span>
                      <select
                        className="voc-input voc-select"
                        value={form.estilo_ficha}
                        onChange={(e) => setForm((f) => ({ ...f, estilo_ficha: e.target.value }))}
                      >
                        <option value="auto">Automático (según curso)</option>
                        {estilosOpciones.map((e) => (
                          <option key={e.codigo} value={e.codigo}>
                            {e.nombre}
                          </option>
                        ))}
                      </select>
                      <span className="voc-file-hint" style={{ display: 'block', marginTop: 4 }}>
                        {form.estilo_ficha === 'auto' ? (
                          form.asignatura_id ? (
                            <>
                              Se detectará: <strong>{etiquetaEstilo(estiloResuelto)}</strong>
                              {estiloResuelto === 'matematica'
                                ? ' — hoja de aplicación con mínimo 10 ejercicios numéricos.'
                                : ' — preguntas, dibujo y actividades variadas.'}
                            </>
                          ) : (
                            'Elija un curso para detectar Matemática o General, o seleccione el tipo manualmente.'
                          )
                        ) : (
                          estilosOpciones.find((e) => e.codigo === form.estilo_ficha)?.descripcion ||
                          'Plantilla fija para esta ficha.'
                        )}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="voc-modal-grid">
                  <label className="voc-label-block">
                    <span className="voc-label-text">Título de la ficha *</span>
                    <input
                      className="voc-input"
                      type="text"
                      value={form.titulo}
                      onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                      placeholder="Ej. Plantas y su importancia"
                    />
                  </label>
                  <label className="voc-label-block">
                    <span className="voc-label-text">Unidad</span>
                    <input
                      className="voc-input"
                      type="text"
                      value={form.unidad}
                      onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                      placeholder="1"
                    />
                  </label>
                </div>

                <label className="voc-label-block">
                  <span className="voc-label-text">Indicaciones para Vanguarcito (opcional)</span>
                  <textarea
                    className="voc-input voc-textarea"
                    rows={4}
                    value={form.instrucciones_ia}
                    onChange={(e) => setForm((f) => ({ ...f, instrucciones_ia: e.target.value }))}
                    placeholder="Ej.: Profundiza en fotosíntesis y cuidado del medio ambiente; incluye ejemplos de plantas del Perú; actividades para 3° de primaria con dibujos."
                  />
                  <span className="voc-file-hint" style={{ display: 'block', marginTop: 4 }}>
                    Complementa el prompt interno (no lo reemplaza): aquí explicas qué quieres enseñar, profundidad y enfoque.
                  </span>
                </label>

                <label className="voc-label-block">
                  <span className="voc-label-text">Puntos clave del tema (uno por línea)</span>
                  <textarea
                    className="voc-input voc-textarea"
                    rows={4}
                    value={form.puntos_clave}
                    onChange={(e) => setForm((f) => ({ ...f, puntos_clave: e.target.value }))}
                    placeholder={'Las plantas producen oxígeno\nSon base de la cadena alimenticia\nTipos: raíz, tallo, hoja'}
                  />
                  <span className="voc-file-hint" style={{ display: 'block', marginTop: 4 }}>
                    Contenido curricular del tema, no instrucciones de diseño (colores, tipografía, etc.).
                  </span>
                </label>

                {!editItem && (
                  <div className="voc-file-panel">
                    <div className="voc-file-panel-head">
                      <PictureAsPdfOutlinedIcon sx={{ fontSize: 22, color: '#dc2626' }} />
                      <span className="voc-label-text">PDF origen (opcional)</span>
                    </div>
                    <label className="voc-file-drop">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="voc-file-input"
                        onChange={(e) => setArchivoPdf(e.target.files?.[0] || null)}
                      />
                      <div className="voc-file-drop-inner">
                        <span className="voc-file-drop-title">
                          {archivoPdf ? archivoPdf.name : 'Elegir PDF de apoyo'}
                        </span>
                        <span className="voc-file-hint">Máximo 20 MB</span>
                      </div>
                    </label>
                  </div>
                )}

                <label className="voc-label-block" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.usar_ia}
                    disabled={!config.vanguarcito_disponible}
                    onChange={(e) => setForm((f) => ({ ...f, usar_ia: e.target.checked }))}
                  />
                  <span className="voc-label-text" style={{ margin: 0 }}>
                    Usar Vanguarcito para estructurar actividades
                  </span>
                </label>
              </div>

              <div className="voc-modal-footer">
                <button type="button" className="voc-btn-cancel" onClick={() => setModalOpen(false)} disabled={generando}>
                  Cancelar
                </button>
                {editItem && (
                  <button
                    type="button"
                    className="voc-btn-cancel"
                    onClick={() => guardarYGenerar(true)}
                    disabled={generando}
                  >
                    Solo guardar
                  </button>
                )}
                <button type="button" className="voc-btn-primary" onClick={() => guardarYGenerar(false)} disabled={generando}>
                  {generando
                    ? 'Procesando…'
                    : editItem
                      ? 'Guardar y regenerar con Vanguarcito'
                      : 'Crear ficha con Vanguarcito'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DashboardLayout>
  );
}
