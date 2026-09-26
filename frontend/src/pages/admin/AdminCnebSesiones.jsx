import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../services/api';
import Swal from 'sweetalert2';
import CnebHtmlVista from '../../components/aula/CnebHtmlVista';
import CnebInclusivoPanel from '../../components/aula/CnebInclusivoPanel';
import { htmlVacio, textoCnebAHtml } from '../../utils/cnebTextoRico';
import { emptyDua, fusionarProcedimientos, leerDua } from '../../utils/cnebDua';
import { useModulos } from '../../context/ModulosContext';
import { aulasDe, claveCurso, cursosDe, etiquetaGrado, gradosDe } from './cnebElegirAula';

const QUILL_CNEB = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [3, 4, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
};

const QUILL_FORMATS = ['bold', 'italic', 'underline', 'header', 'list', 'bullet'];

function urlVanguarcito() {
  const base = String(api.defaults?.baseURL || '').replace(/\/api\/?$/i, '');
  if (base) return `${base}/assets/fichas-ia/vanguarcito.png`;
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000/assets/fichas-ia/vanguarcito.png';
  }
  return `${protocol}//${hostname}/assets/fichas-ia/vanguarcito.png`;
}

function abrirSwalGenerandoCneb() {
  Swal.fire({
    html: `
      <div class="cneb-ia-carga">
        <div class="cneb-ia-mascota-wrap">
          <div class="cneb-ia-aura" aria-hidden="true"></div>
          <img src="${urlVanguarcito()}" alt="" class="cneb-ia-mascota" />
        </div>
        <h3 class="cneb-ia-titulo">Vanguarcito está armando la sesión</h3>
        <p class="cneb-ia-texto">Redacta inicio, desarrollo, cierre y la ficha del estudiante con el catálogo CNEB.</p>
        <div class="cneb-ia-bar"><div class="cneb-ia-bar-inner"></div></div>
        <p class="cneb-ia-hint">Puede tardar un minuto · no cierre esta ventana</p>
        <p class="cneb-ia-dots"><span>●</span><span> ●</span><span> ●</span></p>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: { popup: 'cneb-ia-swal' },
    didOpen: () => {
      const loader = Swal.getContainer()?.querySelector('.swal2-loader');
      if (loader) loader.style.display = 'none';
      const img = Swal.getPopup()?.querySelector('.cneb-ia-mascota');
      if (!img) return;
      img.onerror = () => {
        const span = document.createElement('span');
        span.className = 'cneb-ia-emoji';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = '🤖';
        img.replaceWith(span);
      };
    },
  });
}

const DURACIONES = [45, 60, 90];

export function hallarAreaCneb(areas, areaId, nombre) {
  const list = (areas || []).filter((a) => a.tipo !== 'transversal');
  if (areaId != null && areaId !== '') {
    const byId = list.find((a) => String(a.id) === String(areaId));
    if (byId) return byId;
  }
  const n = String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!n) return null;
  const exacta = list.find((a) => {
    const an = String(a.nombre || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return an === n;
  });
  if (exacta) return exacta;
  return (
    list.find((a) => {
      const an = String(a.nombre || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      return n.includes(an) || an.includes(n);
    }) || null
  );
}

function nombresCapacidad(capacidades) {
  return (capacidades || [])
    .map((c) => (typeof c === 'string' ? c : c?.nombre))
    .map((n) => String(n || '').trim())
    .filter(Boolean);
}

export function MarcoCnebVista({
  competenciaNombre,
  capacidades,
  estandar,
  desempenos,
  edadLabel,
  modo = 'lectura',
  seleccionados = [],
  onToggle,
  onMarcarTodos,
  onQuitarMarcas,
}) {
  const caps = nombresCapacidad(capacidades);
  const sel = (seleccionados || []).map(String);
  return (
    <article className="cneb-marco">
      <p className="cneb-marco-kicker">Marco CNEB · va de la mano</p>
      {competenciaNombre ? (
        <p className="cneb-marco-comp">
          <strong>Competencia:</strong> {competenciaNombre}
        </p>
      ) : null}
      <p className="cneb-marco-hint">
        Las <strong>capacidades</strong> y el <strong>estándar de aprendizaje</strong> no se eligen:
        MINEDU las trae al escoger la competencia. Usted marca los <strong>desempeños</strong>
        {edadLabel ? ` de ${edadLabel}` : ''} que va a observar hoy.
      </p>
      <h4>Capacidades</h4>
      {caps.length ? (
        <ul className="cneb-caps cneb-caps-pills">
          {caps.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p className="cneb-muted">Sin capacidades en el catálogo de esta competencia.</p>
      )}
      <h4>Estándar de aprendizaje</h4>
      {estandar ? (
        <p className="cneb-estandar">{estandar}</p>
      ) : (
        <p className="cneb-muted">Esta competencia aún no tiene estándar cargado.</p>
      )}
      <div className="cneb-marco-des-head">
        <h4>Desempeños{edadLabel ? ` · ${edadLabel}` : ''}</h4>
        {modo === 'edicion' && (desempenos || []).length ? (
          <div className="cneb-marco-des-actions">
            <button type="button" className="cneb-mini" onClick={onMarcarTodos}>
              Marcar todos
            </button>
            <button type="button" className="cneb-mini" onClick={onQuitarMarcas}>
              Quitar marcas
            </button>
          </div>
        ) : null}
      </div>
      {!(desempenos || []).length ? (
        <p className="cneb-muted">
          {modo === 'edicion'
            ? 'Este grado no tiene desempeños en el catálogo. Escríbalos abajo o pídalos a la IA. Quedan en esta sesión.'
            : 'No hay desempeños marcados en esta sesión.'}
        </p>
      ) : modo === 'edicion' ? (
        <div className="cneb-des-checks">
          {desempenos.map((d) => (
            <label key={d.id} className="cneb-check">
              <input
                type="checkbox"
                checked={sel.includes(String(d.id))}
                onChange={() => onToggle(d.id)}
              />
              <span>{d.texto}</span>
            </label>
          ))}
        </div>
      ) : (
        <ol className="cneb-des-list">
          {desempenos.map((d) => (
            <li key={d.id}>{d.texto}</li>
          ))}
        </ol>
      )}
    </article>
  );
}

function partirMinutos(total) {
  const t = Math.max(20, parseInt(total, 10) || 60);
  if (t <= 45) return { inicio: 8, desarrollo: t - 15, cierre: 7 };
  if (t <= 60) return { inicio: 10, desarrollo: t - 20, cierre: 10 };
  return { inicio: 15, desarrollo: t - 30, cierre: 15 };
}

function etiquetaAula(g) {
  if (!g) return '';
  const gr = g.grado != null ? String(g.grado) : '';
  const sec = String(g.seccion || '').trim();
  return [gr, sec].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formVacio(nivel, ctx = null) {
  const duracion_min = 60;
  const corteCtx = ctx?.corte != null ? Number(ctx.corte) : NaN;
  return {
    id: null,
    titulo: '',
    proposito: '',
    ficha_estudiante: '',
    duracion_min,
    grupo_id: ctx?.grupo_id != null && ctx.grupo_id !== '' ? String(ctx.grupo_id) : '',
    asignatura_id: ctx?.asignatura_id != null ? ctx.asignatura_id : null,
    area_id: ctx?.area_id != null && ctx.area_id !== '' ? String(ctx.area_id) : '',
    competencia_id: '',
    unidad: '',
    corte: Number.isFinite(corteCtx) && corteCtx > 0 ? corteCtx : nivel === 'INICIAL' ? 5 : 1,
    fecha_sesion: hoyISO(),
    estado: 'borrador',
    desempeno_ids: [],
    desempenos_libre: [],
    momentos: { inicio: '', desarrollo: '', cierre: '' },
    minutos: partirMinutos(duracion_min),
    cotejo: [],
    dua: emptyDua(),
  };
}

function sumaMinutos(minutos) {
  return ['inicio', 'desarrollo', 'cierre'].reduce((a, k) => a + (parseInt(minutos?.[k], 10) || 0), 0);
}

export default function AdminCnebSesiones({
  nivel,
  areas,
  etiquetaNivel,
  apiBase = '/admin/cneb',
  bimestre = 4,
  embebido = false,
  contextoAula = null,
  sesionId = null,
  onCerrar = null,
  onGuardado = null,
}) {
  const { activo } = useModulos();
  const mostrarIaSesiones = activo('academico.cneb-ia');
  const [lista, setLista] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [gradoSel, setGradoSel] = useState('');
  const [aulaSel, setAulaSel] = useState('');
  const [cursoSel, setCursoSel] = useState('');
  const [compsMarcadas, setCompsMarcadas] = useState([]);
  const [cantidadIa, setCantidadIa] = useState(1);
  const [titulosLote, setTitulosLote] = useState('');
  const [unidadesBim, setUnidadesBim] = useState([]);
  const unidadesBimRef = useRef([]);
  const areaMarcadaRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState(() => formVacio(nivel));
  const [editing, setEditing] = useState(false);
  const lastMarcoRef = useRef('');

  const loadLista = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        api.get(`${apiBase}/sesiones`, { params: { nivel } }),
        api.get(`${apiBase}/sesiones/meta`, { params: { nivel } }),
      ]);
      setLista(sRes.data?.sesiones || []);
      setGrupos(mRes.data?.grupos || []);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron cargar las sesiones',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, [nivel, apiBase]);

  useEffect(() => {
    loadLista();
    lastMarcoRef.current = '';
    if (embebido) {
      if (sesionId) return;
      const f = formVacio(nivel, contextoAula);
      const nombre = unidadesBimRef.current[0]?.nombre || '';
      if (nombre) f.unidad = nombre;
      setForm(f);
      setEditing(true);
      return;
    }
    setEditing(false);
    const base = formVacio(nivel);
    const nombre = unidadesBimRef.current[0]?.nombre || '';
    if (nombre) base.unidad = nombre;
    setForm(base);
    setGradoSel('');
    setAulaSel('');
    setCursoSel('');
    areaMarcadaRef.current = '';
  }, [nivel, loadLista, embebido, sesionId]);

  useEffect(() => {
    if (!nivel || form.id) return undefined;
    let vivo = true;
    api
      .get(`${apiBase}/unidades`, { params: { nivel, bimestre } })
      .then(({ data }) => {
        const listaUni = data?.unidades || [];
        if (!vivo) return;
        unidadesBimRef.current = listaUni;
        setUnidadesBim(listaUni);
        const nombre = listaUni[0]?.nombre || '';
        if (!nombre) return;
        setForm((f) => (f.id || String(f.unidad || '').trim() ? f : { ...f, unidad: nombre }));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [nivel, bimestre, apiBase, form.id]);

  useEffect(() => {
    if (!embebido || !sesionId) return;
    abrir(sesionId);
    // abrir se redefine; solo al cambiar de sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embebido, sesionId]);

  const areaForm = useMemo(
    () => (areas || []).find((a) => String(a.id) === String(form.area_id)) || null,
    [areas, form.area_id]
  );
  const comps = areaForm?.competencias || [];
  const compForm = useMemo(
    () => comps.find((c) => String(c.id) === String(form.competencia_id)) || null,
    [comps, form.competencia_id]
  );

  const desempenosCorte = useMemo(() => {
    const all = compForm?.desempenos || [];
    if (nivel === 'INICIAL') {
      const filtrados = all.filter((d) => Number(d.edad) === Number(form.corte));
      return filtrados.length ? filtrados : all;
    }
    const filtrados = all.filter((d) => Number(d.grado) === Number(form.corte));
    return filtrados.length ? filtrados : all;
  }, [compForm, form.corte, nivel]);

  const cortes = useMemo(() => {
    if (nivel === 'PRIMARIA') return [1, 2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}.º` }));
    if (nivel === 'SECUNDARIA') return [1, 2, 3, 4, 5].map((n) => ({ v: n, label: `${n}.º` }));
    return [3, 4, 5].map((n) => ({ v: n, label: `${n} años` }));
  }, [nivel]);

  const edadLabel = useMemo(() => {
    const c = cortes.find((x) => Number(x.v) === Number(form.corte));
    return c?.label || (nivel === 'INICIAL' ? `${form.corte} años` : `${form.corte}.º`);
  }, [cortes, form.corte, nivel]);

  useEffect(() => {
    const cid = String(form.competencia_id || '');
    if (!cid) return;
    const ids = (desempenosCorte || []).map((d) => d.id);
    if (!ids.length) return;
    const key = `${cid}:${form.corte}`;
    if (lastMarcoRef.current === key) return;
    lastMarcoRef.current = key;
    setForm((f) => {
      if (String(f.competencia_id) !== cid) return f;
      if (f.id && (f.desempeno_ids || []).length) return f;
      return { ...f, desempeno_ids: ids };
    });
  }, [form.competencia_id, form.corte, desempenosCorte]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const onDuracion = (mins) => {
    const duracion_min = parseInt(mins, 10) || 60;
    patch({ duracion_min, minutos: partirMinutos(duracion_min) });
  };

  const onGrupo = (grupoId) => {
    const g = grupos.find((x) => String(x.id) === String(grupoId));
    const corte = g?.grado != null ? Number(g.grado) : form.corte;
    patch({ grupo_id: grupoId, corte: Number.isFinite(corte) ? corte : form.corte });
  };

  const onArea = (areaId) => {
    const a = (areas || []).find((x) => String(x.id) === String(areaId));
    const first = a?.competencias?.[0];
    patch({
      area_id: areaId,
      competencia_id: first ? String(first.id) : '',
      desempeno_ids: [],
      desempenos_libre: [],
    });
    setCompsMarcadas((a?.competencias || []).map((c) => String(c.id)));
  };

  useEffect(() => {
    if (!embebido || form.id) return;
    const encontrada = hallarAreaCneb(
      areas,
      form.area_id || contextoAula?.area_id,
      contextoAula?.area_nombre
    );
    if (!encontrada) return;
    const first = encontrada.competencias?.[0];
    setForm((f) => {
      const nextArea = String(encontrada.id);
      const nextComp = f.competencia_id || (first ? String(first.id) : '');
      if (String(f.area_id) === nextArea && String(f.competencia_id || '') === String(nextComp || '')) {
        return f;
      }
      return { ...f, area_id: nextArea, competencia_id: nextComp, desempeno_ids: f.desempeno_ids || [] };
    });
  }, [embebido, form.id, areas, contextoAula]);

  useEffect(() => {
    const areaId = String(form.area_id || '');
    if (!areaId || !comps.length) return;
    if (areaMarcadaRef.current === areaId) return;
    areaMarcadaRef.current = areaId;
    setCompsMarcadas(comps.map((c) => String(c.id)));
  }, [form.area_id, comps]);

  const toggleDes = (id) => {
    const sid = String(id);
    patch({
      desempeno_ids: form.desempeno_ids.map(String).includes(sid)
        ? form.desempeno_ids.filter((x) => String(x) !== sid)
        : [...form.desempeno_ids, id],
    });
  };

  const abrirNueva = () => {
    lastMarcoRef.current = '';
    const base = formVacio(nivel, embebido ? contextoAula : null);
    if (unidadesBim[0]?.nombre) base.unidad = unidadesBim[0].nombre;
    setForm(base);
    setEditing(true);
  };

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`${apiBase}/sesiones/${id}`);
      const s = data.sesion;
      lastMarcoRef.current = (s.desempeno_ids || []).length
        ? `${s.competencia_id || ''}:${s.corte != null ? Number(s.corte) : ''}`
        : '';
      setForm({
        id: s.id,
        titulo: s.titulo || '',
        proposito: s.proposito || '',
        ficha_estudiante: textoCnebAHtml(s.ficha_estudiante),
        duracion_min: Number(s.duracion_min) || 60,
        grupo_id: s.grupo_id != null ? String(s.grupo_id) : '',
        asignatura_id: s.asignatura_id != null ? s.asignatura_id : null,
        area_id: s.area_id != null ? String(s.area_id) : '',
        competencia_id: s.competencia_id != null ? String(s.competencia_id) : '',
        unidad: s.unidad || '',
        corte: s.corte != null ? Number(s.corte) : nivel === 'INICIAL' ? 5 : 1,
        fecha_sesion: s.fecha_sesion ? String(s.fecha_sesion).slice(0, 10) : '',
        estado: s.estado || 'borrador',
        desempeno_ids: s.desempeno_ids || [],
        desempenos_libre: (s.desempenos || []).map((d) => d.texto).filter(Boolean),
        momentos: {
          inicio: textoCnebAHtml(s.momentos?.inicio),
          desarrollo: textoCnebAHtml(s.momentos?.desarrollo),
          cierre: textoCnebAHtml(s.momentos?.cierre),
        },
        minutos: s.minutos || partirMinutos(s.duracion_min),
        cotejo: (s.cotejo || []).map((c) => ({ item: c.item, desempeno_id: c.desempeno_id })),
        dua: leerDua(s.dua || s.dua_json),
      });
      setEditing(true);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo abrir', text: e.response?.data?.error || e.message });
    }
  };

  const armarBorrador = async () => {
    const textos = desempenosCorte
      .filter((d) => form.desempeno_ids.map(String).includes(String(d.id)))
      .map((d) => d.texto);
    try {
      const { data } = await api.post(`${apiBase}/sesiones/borrador`, {
        titulo: form.titulo,
        proposito: form.proposito,
        competencia_nombre: compForm?.nombre,
        desempenos_texto: textos,
        duracion_min: form.duracion_min,
        corte_label: cortes.find((c) => c.v === Number(form.corte))?.label,
      });
      const b = data.borrador;
      aplicarBorrador(b, { forzarTitulo: !form.titulo.trim(), forzarProposito: !form.proposito });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo armar el borrador', text: e.response?.data?.error || e.message });
    }
  };

  const aplicarBorrador = (b, { forzarProposito = false, forzarTitulo = false } = {}) => {
    if (!b) return;
    patch({
      titulo: (forzarTitulo || !form.titulo) && b.titulo ? b.titulo : form.titulo,
      proposito: forzarProposito || !form.proposito ? b.proposito || form.proposito : form.proposito,
      ficha_estudiante: textoCnebAHtml(b.ficha || b.ficha_estudiante || form.ficha_estudiante),
      minutos: b.minutos || form.minutos,
      momentos: {
        inicio: textoCnebAHtml(b.momentos?.inicio || form.momentos.inicio),
        desarrollo: textoCnebAHtml(b.momentos?.desarrollo || form.momentos.desarrollo),
        cierre: textoCnebAHtml(b.momentos?.cierre || form.momentos.cierre),
      },
      cotejo: (b.cotejo || []).map((item) => ({ item: typeof item === 'string' ? item : item.item })),
      ...(Array.isArray(b.desempenos) && b.desempenos.length
        ? { desempenos_libre: b.desempenos.map((t) => String(t || '').trim()).filter(Boolean) }
        : {}),
      dua: {
        ...(form.dua || emptyDua()),
        procedimientos: fusionarProcedimientos(form.dua?.procedimientos, b.procedimientos),
      },
    });
  };

  const generarConIa = async () => {
    const libres = (form.desempenos_libre || []).map((t) => String(t || '').trim()).filter(Boolean);
    const textos = desempenosCorte.length
      ? desempenosCorte
          .filter((d) => form.desempeno_ids.map(String).includes(String(d.id)))
          .map((d) => d.texto)
      : libres;
    if (!compForm?.nombre && !form.titulo.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Falta un ancla',
        text: 'Elija área y competencia del catálogo, o escriba un tema si es un taller interno.',
      });
      return;
    }
    setGenerating(true);
    abrirSwalGenerandoCneb();
    try {
      const { data } = await api.post(
        `${apiBase}/sesiones/generar-ia`,
        {
          sesion_id: form.id,
          nivel,
          titulo: form.titulo,
          proposito: form.proposito,
          competencia_nombre: compForm?.nombre || contextoAula?.curso_nombre || 'Taller interno (no SIAGIE)',
          area_nombre: areaForm?.nombre || contextoAula?.curso_nombre || 'Taller interno',
          capacidades: (compForm?.capacidades || []).map((c) => c.nombre),
          desempenos_texto: textos,
          proponer_desempenos: !desempenosCorte.length && !textos.length,
          duracion_min: form.duracion_min,
          corte_label: cortes.find((c) => c.v === Number(form.corte))?.label,
          unidad: form.unidad,
          taller: !form.area_id,
          grupo_id: form.grupo_id,
          dua: form.dua,
        },
        { timeout: 120000 }
      );
      aplicarBorrador(data.borrador, {
        forzarProposito: !form.proposito,
        forzarTitulo: !form.titulo.trim(),
      });
      Swal.close();
      await Swal.fire({
        icon: 'success',
        title: 'Borrador listo',
        text: 'Revise tema, momentos y ficha antes de aprobar.',
      });
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar con IA',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setGenerating(false);
    }
  };

  const toggleCompLote = (id) => {
    const sid = String(id);
    setCompsMarcadas((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const proponerConIa = () => {
    const lineas = String(titulosLote || '')
      .split(/\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    const n = lineas.length
      ? Math.min(6, lineas.length)
      : Math.min(6, Math.max(1, parseInt(cantidadIa, 10) || 1));
    if (n > 1) return generarLote();
    return generarConIa();
  };

  const generarLote = async () => {
    if (!String(form.unidad || '').trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Falta la unidad',
        text: 'Escriba la unidad del bimestre. Todas las sesiones salen sobre ese tema.',
      });
      return;
    }
    const lineasTitulo = String(titulosLote || '')
      .split(/\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);
    const taller = !form.area_id;
    if (!taller && !compsMarcadas.length) {
      await Swal.fire({ icon: 'warning', title: 'Marque al menos una competencia de esta unidad' });
      return;
    }
    const n = taller && lineasTitulo.length
      ? lineasTitulo.length
      : Math.min(6, Math.max(1, parseInt(cantidadIa, 10) || 1));
    setGenerating(true);
    abrirSwalGenerandoCneb();
    try {
      const { data } = await api.post(
        `${apiBase}/sesiones/generar-lote`,
        {
          nivel,
          cantidad: n,
          competencia_ids: taller ? [] : compsMarcadas,
          titulos: taller ? lineasTitulo : [],
          titulo: form.titulo,
          proposito: form.proposito,
          unidad: form.unidad,
          curso_nombre: contextoAula?.curso_nombre || '',
          corte: form.corte,
          corte_label: cortes.find((c) => c.v === Number(form.corte))?.label,
          duracion_min: form.duracion_min,
          grupo_id: form.grupo_id || null,
          asignatura_id: form.asignatura_id || null,
          fecha_sesion: form.fecha_sesion || null,
          dua: form.dua,
        },
        { timeout: 420000 }
      );
      Swal.close();
      await loadLista();
      if (typeof onGuardado === 'function') onGuardado();
      if (embebido && typeof onCerrar === 'function') onCerrar();
      else setEditing(false);
      const creadas = data?.creadas || [];
      await Swal.fire({
        icon: 'success',
        title: `${creadas.length} sesiones en borrador`,
        text: 'Revise cada una antes de aprobar. La unidad madre del nivel no se modificó.',
      });
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron generar las sesiones',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setGenerating(false);
    }
  };

  const guardar = async (estado) => {
    const suma = sumaMinutos(form.minutos);
    if (suma !== Number(form.duracion_min)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Los tiempos no cierran',
        text: `Inicio + desarrollo + cierre = ${suma} min. Debe ser ${form.duracion_min}.`,
      });
      return;
    }
    if (!String(form.titulo || '').trim()) {
      await Swal.fire({ icon: 'warning', title: 'Falta el título o tema de la sesión' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nivel,
        estado: estado || form.estado,
        cotejo: (form.cotejo || []).filter((c) => String(c.item || '').trim()),
        desempenos_libre: desempenosCorte.length
          ? []
          : (form.desempenos_libre || []).map((t) => String(t || '').trim()).filter(Boolean),
        desempeno_ids: desempenosCorte.length ? form.desempeno_ids : [],
      };
      if (form.id) await api.put(`${apiBase}/sesiones/${form.id}`, payload);
      else {
        const { data } = await api.post(`${apiBase}/sesiones`, payload);
        patch({ id: data.id });
      }
      await loadLista();
      if (typeof onGuardado === 'function') onGuardado();
      await Swal.fire({
        icon: 'success',
        title: estado === 'aprobada' ? 'Sesión aprobada' : 'Sesión guardada',
        text: 'Quedó en la base de datos. No se modificó el aula virtual ni la libreta.',
      });
      if (estado === 'aprobada') setEditing(false);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  };

  const descargarPdfSesion = async (id, opts = {}) => {
    if (!id) {
      await Swal.fire({ icon: 'warning', title: 'Guarde la sesión antes de descargar el PDF' });
      return;
    }
    const parte = opts.parte || 'sesion';
    const formato = opts.formato || 'colegio';
    try {
      const res = await api.get(`${apiBase}/sesiones/${id}/pdf`, {
        params: { parte, formato },
        responseType: 'blob',
        timeout: 60000,
      });
      const href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = parte === 'ficha'
        ? (formato === 'minedu' ? `ficha_minedu_${id}.pdf` : `ficha_cneb_${id}.pdf`)
        : `sesion_cneb_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el PDF',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  const eliminar = async (id) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta sesión?',
      text: 'No afecta notas ni temas del aula virtual.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`${apiBase}/sesiones/${id}`);
      if (form.id === id) {
        setEditing(false);
        setForm(formVacio(nivel, embebido ? contextoAula : null));
        if (embebido && typeof onCerrar === 'function') onCerrar();
      }
      await loadLista();
      if (typeof onGuardado === 'function') onGuardado();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.response?.data?.error || e.message });
    }
  };

  const suma = sumaMinutos(form.minutos);
  const sumaOk = suma === Number(form.duracion_min);

  if (loading && !editing && !embebido) {
    return <p className="cneb-muted">Cargando sesiones…</p>;
  }

  if (!editing && !embebido) {
    return (
      <section className="cneb-panel">
        <div className="cneb-map-toolbar">
          <div>
            <h2>Sesiones de {etiquetaNivel(nivel)}</h2>
            <p>
              El docente (o coordinación) arma el inicio, el desarrollo y el cierre. Puede abrir para
              editar, descargar PDF o eliminar: no afecta notas ni el aula virtual.
            </p>
          </div>
          <button type="button" className="cneb-btn primary" onClick={abrirNueva}>
            Nueva sesión
          </button>
        </div>
        <div className="cneb-elige">
          <label className="cneb-select-wrap">
            <span>Grado</span>
            <select
              value={gradoSel}
              onChange={(e) => {
                setGradoSel(e.target.value);
                setAulaSel('');
                setCursoSel('');
              }}
            >
              <option value="">Elegir grado…</option>
              {gradosDe(grupos).map((g) => (
                <option key={g} value={g}>
                  {etiquetaGrado(nivel, g)}
                </option>
              ))}
            </select>
          </label>
          <label className="cneb-select-wrap">
            <span>Aula</span>
            <select
              value={aulaSel}
              disabled={!gradoSel}
              onChange={(e) => {
                setAulaSel(e.target.value);
                setCursoSel('');
              }}
            >
              <option value="">Elegir aula…</option>
              {aulasDe(grupos, gradoSel).map((g) => (
                <option key={g.id} value={g.id}>
                  {etiquetaAula(g)}
                </option>
              ))}
            </select>
          </label>
          <label className="cneb-select-wrap">
            <span>Curso</span>
            <select value={cursoSel} disabled={!aulaSel} onChange={(e) => setCursoSel(e.target.value)}>
              <option value="">Elegir curso…</option>
              {cursosDe(lista.filter((s) => String(s.grupo_id) === String(aulaSel))).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!gradoSel || !aulaSel || !cursoSel ? (
          <div className="cneb-empty">
            Elija el grado, el aula y el curso para ver las sesiones de ese grupo.
          </div>
        ) : lista.filter((s) => String(s.grupo_id) === String(aulaSel) && claveCurso(s) === cursoSel).length === 0 ? (
          <div className="cneb-empty">En este curso todavía no hay sesiones.</div>
        ) : (
          <div className="cneb-ses-list">
            {lista
              .filter((s) => String(s.grupo_id) === String(aulaSel) && claveCurso(s) === cursoSel)
              .map((s) => (
              <article key={s.id} className={`cneb-ses-card${s.estado === 'aprobada' ? ' is-ok' : ''}`}>
                <div>
                  <p className="cneb-kicker">{s.estado === 'aprobada' ? 'Aprobada' : 'Borrador'}</p>
                  <h3>{s.titulo}</h3>
                  {s.unidad ? <p className="cneb-kicker">{s.unidad}</p> : null}
                  <p>
                    {s.area_nombre || 'Taller interno'}
                    {s.grado != null ? ` · ${s.grado} ${s.seccion || ''}`.trim() : ''}
                    {` · ${s.duracion_min} min`}
                    {s.fecha_sesion ? ` · ${String(s.fecha_sesion).slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="cneb-map-actions">
                  <button type="button" className="cneb-btn ghost" onClick={() => abrir(s.id)}>
                    Editar
                  </button>
                  <button type="button" className="cneb-btn ghost" onClick={() => descargarPdfSesion(s.id)}>
                    PDF sesión
                  </button>
                  <button
                    type="button"
                    className="cneb-btn ghost"
                    onClick={() => descargarPdfSesion(s.id, { parte: 'ficha', formato: 'colegio' })}
                  >
                    Ficha
                  </button>
                  <button type="button" className="cneb-btn ghost" onClick={() => eliminar(s.id)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="cneb-panel cneb-sesion-editor">
      <div className="cneb-map-toolbar">
        <div>
          <h2>{form.id ? 'Editar sesión' : 'Nueva sesión'}</h2>
          <p>
            Escriba la unidad y el tema, marque las competencias y pulse Generar con IA.
            Si pide una sesión, la ve aquí para revisarla. Si pide varias, quedan en borrador.
          </p>
        </div>
        <div className="cneb-map-actions">
          <button
            type="button"
            className="cneb-btn ghost"
            onClick={() => {
              if (embebido && typeof onCerrar === 'function') {
                onCerrar();
                return;
              }
              setEditing(false);
              setForm(formVacio(nivel));
            }}
          >
            {embebido ? 'Volver al aula' : 'Volver al listado'}
          </button>
          {form.id ? (
            <>
              <button type="button" className="cneb-btn ghost" onClick={() => descargarPdfSesion(form.id)}>
                PDF sesión
              </button>
              <button
                type="button"
                className="cneb-btn ghost"
                onClick={() => descargarPdfSesion(form.id, { parte: 'ficha', formato: 'colegio' })}
              >
                Ficha colegio
              </button>
              <button
                type="button"
                className="cneb-btn ghost"
                onClick={() => descargarPdfSesion(form.id, { parte: 'ficha', formato: 'minedu' })}
              >
                Ficha MINEDU
              </button>
              <button type="button" className="cneb-btn ghost" onClick={() => eliminar(form.id)}>
                Eliminar
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="cneb-bloque">
        <p className="cneb-bloque-kicker">Datos de la sesión</p>
      <div className="cneb-ses-grid">
        <label className="cneb-select-wrap">
          <span>Aula</span>
          {embebido && contextoAula?.grupo_id ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={
                contextoAula.aula_label ||
                etiquetaAula(grupos.find((g) => String(g.id) === String(form.grupo_id))) ||
                'Esta aula'
              }
            />
          ) : (
            <select value={form.grupo_id} onChange={(e) => onGrupo(e.target.value)}>
              <option value="">Elegir aula…</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {etiquetaAula(g)}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Fecha</span>
          <input
            type="date"
            value={form.fecha_sesion}
            onChange={(e) => patch({ fecha_sesion: e.target.value })}
          />
        </label>
        <label className="cneb-select-wrap">
          <span>Duración</span>
          <select value={form.duracion_min} onChange={(e) => onDuracion(e.target.value)}>
            {DURACIONES.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <label className="cneb-select-wrap">
          <span>{nivel === 'INICIAL' ? 'Edad' : 'Grado'}</span>
          {embebido && contextoAula?.corte != null ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={cortes.find((c) => Number(c.v) === Number(form.corte))?.label || `${form.corte} años`}
            />
          ) : (
            <select
              value={form.corte}
              onChange={(e) => patch({ corte: Number(e.target.value), desempeno_ids: [], desempenos_libre: [] })}
            >
              {cortes.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Área CNEB</span>
          {embebido && areaForm ? (
            <input
              type="text"
              className="cneb-search"
              readOnly
              value={areaForm.nombre || contextoAula?.area_nombre || 'Área'}
            />
          ) : (
            <select value={form.area_id} onChange={(e) => onArea(e.target.value)}>
              <option value="">Taller interno (no SIAGIE)</option>
              {(areas || [])
                .filter((a) => a.tipo !== 'transversal')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          )}
        </label>
        <label className="cneb-select-wrap">
          <span>Competencia</span>
          <select
            value={form.competencia_id}
            onChange={(e) => patch({ competencia_id: e.target.value, desempeno_ids: [], desempenos_libre: [] })}
            disabled={!comps.length}
          >
            <option value="">{comps.length ? 'Elegir competencia…' : 'Cargando competencias…'}</option>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="cneb-unidad-tema">
        <label>
          <span>Unidad del bimestre</span>
          {unidadesBim.length > 1 ? (
            <select
              value={unidadesBim.some((u) => u.nombre === form.unidad) ? form.unidad : ''}
              onChange={(e) => {
                if (e.target.value) patch({ unidad: e.target.value });
              }}
            >
              <option value="">Elegir unidad…</option>
              {unidadesBim.map((u) => (
                <option key={u.id} value={u.nombre}>
                  {u.nombre}
                </option>
              ))}
            </select>
          ) : null}
          <input
            type="text"
            maxLength={220}
            placeholder="Unidad madre de este bimestre"
            value={form.unidad}
            onChange={(e) => patch({ unidad: e.target.value })}
          />
        </label>
        <label>
          <span>Tema / título</span>
          <input
            type="text"
            maxLength={220}
            placeholder="Tema de esta sesión"
            value={form.titulo}
            onChange={(e) => patch({ titulo: e.target.value })}
          />
        </label>
      </div>
      <p className="cneb-hint-corta">
        La unidad ya viene escrita. Si la cambia, solo cambia esta sesión. Si escribe el tema, la IA no lo cambia.
      </p>
      </div>

      {mostrarIaSesiones && comps.length > 0 ? (
        <div className="cneb-lote">
          <div>
            <h3>Competencias de esta unidad</h3>
            <p>Marque las que entran en esta unidad. El número de sesiones lo usa el botón Generar con IA.</p>
          </div>
          <div className="cneb-comp-checks">
            {comps.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={compsMarcadas.includes(String(c.id))}
                  onChange={() => toggleCompLote(c.id)}
                />
                <span>{c.nombre}</span>
              </label>
            ))}
          </div>
          <div className="cneb-lote-accion">
            <label>
              <span>Sesiones</span>
              <input
                type="number"
                min={1}
                max={6}
                value={cantidadIa}
                onChange={(e) => setCantidadIa(e.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {mostrarIaSesiones && !form.area_id ? (
        <div className="cneb-lote">
          <div>
            <h3>Sesiones de este curso</h3>
            <p>
              Sin competencia de SIAGIE. Un título por línea, o deje la lista vacía e indique cuántas.
            </p>
          </div>
          <label className="cneb-lote-titulos">
            <span>Un título por sesión</span>
            <textarea
              rows={3}
              value={titulosLote}
              onChange={(e) => setTitulosLote(e.target.value)}
              placeholder={'Arduino\nPartes del robot'}
            />
          </label>
          <div className="cneb-lote-accion">
            {String(titulosLote || '').split(/\n/).map((t) => t.trim()).filter(Boolean).length === 0 ? (
              <label>
                <span>Sesiones</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={cantidadIa}
                  onChange={(e) => setCantidadIa(e.target.value)}
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {form.area_id && compForm ? (
        <MarcoCnebVista
          competenciaNombre={compForm.nombre}
          capacidades={compForm.capacidades}
          estandar={compForm.estandar_ciclo}
          desempenos={desempenosCorte}
          edadLabel={edadLabel}
          modo="edicion"
          seleccionados={form.desempeno_ids}
          onToggle={toggleDes}
          onMarcarTodos={() => patch({ desempeno_ids: desempenosCorte.map((d) => d.id) })}
          onQuitarMarcas={() => patch({ desempeno_ids: [] })}
        />
      ) : form.area_id ? (
        <p className="cneb-muted">
          Elija la competencia para ver capacidades, estándar de aprendizaje y desempeños de {edadLabel}.
        </p>
      ) : null}

      {form.area_id && compForm && !desempenosCorte.length ? (
        <div className="cneb-cotejo-bloque">
          <h3 className="cneb-uso-title">Desempeños de esta sesión · {edadLabel}</h3>
          <p className="cneb-muted">
            {mostrarIaSesiones
              ? 'La IA los propone junto con la lista de cotejo. Puede cambiar el texto, quitar o añadir antes de guardar.'
              : 'Escríbalos aquí. Quedan en esta sesión y no se agregan al catálogo del grado.'}
          </p>
          {(form.desempenos_libre || []).map((texto, i) => (
            <div key={`des-libre-${i}`} className="cneb-cotejo-row">
              <input
                type="text"
                value={texto}
                onChange={(e) => {
                  const next = [...(form.desempenos_libre || [])];
                  next[i] = e.target.value;
                  patch({ desempenos_libre: next });
                }}
              />
              <button
                type="button"
                className="cneb-btn ghost"
                onClick={() =>
                  patch({ desempenos_libre: (form.desempenos_libre || []).filter((_, j) => j !== i) })
                }
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cneb-btn ghost"
            onClick={() => patch({ desempenos_libre: [...(form.desempenos_libre || []), ''] })}
          >
            Añadir desempeño
          </button>
        </div>
      ) : null}

      <label className="cneb-select-wrap cneb-full">
        <span>Propósito</span>
        <textarea
          rows={2}
          value={form.proposito}
          onChange={(e) => patch({ proposito: e.target.value })}
          placeholder="Qué se espera que logren en esta sesión"
        />
      </label>
      {!form.area_id ? (
        <p className="cneb-muted">
          Sin área CNEB: el cotejo queda en el registro auxiliar y el consolidado del colegio. No
          entra al corte AD/A/B/C ni al informe / SIAGIE.
        </p>
      ) : null}

      <div className="cneb-generar-bar">
        <div>
          <strong>Generar la sesión</strong>
          <p>Si la cantidad es 1, la propuesta aparece en esta pantalla. Si son más, quedan en borrador.</p>
        </div>
        <div className="cneb-generar-bar__acciones">
        <button type="button" className="cneb-btn ghost" onClick={armarBorrador}>
          Armar borrador
        </button>
        {mostrarIaSesiones && (
          <button
            type="button"
            className="cneb-btn primary"
            onClick={proponerConIa}
            disabled={generating}
          >
            {generating ? 'Generando con IA…' : 'Generar con IA'}
          </button>
        )}
        <span className={`cneb-suma${sumaOk ? ' is-ok' : ' is-bad'}`}>
          Minutos: {suma} / {form.duracion_min}
        </span>
        </div>
      </div>

      <CnebInclusivoPanel
        apiBase={apiBase}
        grupoId={form.grupo_id}
        dua={form.dua}
        onChangeDua={(dua) => patch({ dua })}
      />

      {['inicio', 'desarrollo', 'cierre'].map((tipo) => (
        <div key={tipo} className={`cneb-momento cneb-momento--${tipo}`}>
          <div className="cneb-momento-head">
            <h3>{tipo === 'inicio' ? 'Inicio' : tipo === 'desarrollo' ? 'Desarrollo' : 'Cierre'}</h3>
            <label>
              Min
              <input
                type="number"
                min="0"
                max="180"
                value={form.minutos[tipo]}
                onChange={(e) =>
                  patch({ minutos: { ...form.minutos, [tipo]: parseInt(e.target.value, 10) || 0 } })
                }
              />
            </label>
          </div>
          <ReactQuill
            theme="snow"
            className="cneb-quill"
            modules={QUILL_CNEB}
            formats={QUILL_FORMATS}
            value={form.momentos[tipo] || ''}
            onChange={(html) =>
              setForm((f) => ({ ...f, momentos: { ...f.momentos, [tipo]: html } }))
            }
            placeholder={
              tipo === 'inicio'
                ? 'Motivación, saberes previos, problematización y propósito…'
                : tipo === 'desarrollo'
                  ? 'Actividades, materiales, evidencia…'
                  : 'Metacognición, recojo de evidencias…'
            }
          />
        </div>
      ))}

      <div className="cneb-ficha-grid">
        <label className="cneb-select-wrap cneb-full">
          <span>Ficha del estudiante (editar)</span>
          <ReactQuill
            theme="snow"
            className="cneb-quill"
            modules={QUILL_CNEB}
            formats={QUILL_FORMATS}
            value={form.ficha_estudiante || ''}
            onChange={(html) => setForm((f) => ({ ...f, ficha_estudiante: html }))}
            placeholder="Título, nombre, fecha y consignas numeradas…"
          />
        </label>
        <div className="cneb-ficha-preview-wrap">
          <span className="cneb-ficha-preview-label">Así se verá al imprimir</span>
          <div className="cneb-ficha-preview">
            {htmlVacio(form.ficha_estudiante) ? (
              <p className="cneb-muted">
                Escriba consignas. Aquí verá negritas, listas y espacios como en el PDF.
              </p>
            ) : (
              <CnebHtmlVista html={form.ficha_estudiante} />
            )}
            <div className="cneb-ficha-dibujo" aria-hidden>
              Espacio para dibujar o escribir
            </div>
          </div>
        </div>
      </div>
      <p className="cneb-muted">
        Hoja para archivar evidencia física. Use negrita y listas; el PDF respeta ese formato. Puede
        descargar la versión colegio o con membrete MINEDU.
      </p>

      <div className="cneb-cotejo-bloque">
      <h3 className="cneb-uso-title">Lista de cotejo</h3>
      <p className="cneb-muted">
        Ítems que el docente marcará al observar. La IA los escribe a partir de los desempeños y usted
        puede editarlos o añadir más.
      </p>
      {(form.cotejo || []).map((c, i) => (
        <div key={`cot-${i}`} className="cneb-cotejo-row">
          <input
            type="text"
            value={c.item}
            onChange={(e) => {
              const next = [...form.cotejo];
              next[i] = { ...next[i], item: e.target.value };
              patch({ cotejo: next });
            }}
          />
          <button
            type="button"
            className="cneb-btn ghost"
            onClick={() => patch({ cotejo: form.cotejo.filter((_, j) => j !== i) })}
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        className="cneb-btn ghost"
        onClick={() => patch({ cotejo: [...(form.cotejo || []), { item: '' }] })}
      >
        Añadir ítem
      </button>
      </div>

      <div className="cneb-map-actions" style={{ marginTop: '1.2rem' }}>
        <button type="button" className="cneb-btn ghost" onClick={() => guardar('borrador')} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button type="button" className="cneb-btn primary" onClick={() => guardar('aprobada')} disabled={saving}>
          Aprobar sesión
        </button>
      </div>
    </section>
  );
}
