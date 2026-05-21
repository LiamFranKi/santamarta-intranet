import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import './DisenadorFichas.css';

const ESTADO_LABEL = {
  BORRADOR: 'Borrador',
  EXTRAYENDO: 'Extrayendo PDF…',
  IA_PROCESANDO: 'Procesando con IA…',
  MAQUETANDO: 'Generando diseño…',
  LISTO: 'Listo',
  ERROR: 'Error',
  PUBLICADO: 'Publicado',
  CANCELADO: 'Cancelado',
};

export default function DisenadorFichas() {
  const [config, setConfig] = useState({ gemini_configurado: false, plantillas: [] });
  const [trabajos, setTrabajos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [grado, setGrado] = useState('4');
  const [area, setArea] = useState('CIENCIA Y TECNOLOGÍA');
  const [unidad, setUnidad] = useState('1');
  const [puntosClave, setPuntosClave] = useState('');
  const [archivoPdf, setArchivoPdf] = useState(null);
  const [usarIa, setUsarIa] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, list] = await Promise.all([
        api.get('/fichas-ia/config'),
        api.get('/fichas-ia/trabajos'),
      ]);
      setConfig(cfg.data || {});
      setTrabajos(list.data?.data || []);
      if (!cfg.data?.gemini_configurado) setUsarIa(false);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar el módulo', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crearYGenerar = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) {
      Swal.fire('Datos incompletos', 'Indique el título de la ficha', 'warning');
      return;
    }
    setGenerando(true);
    try {
      const fd = new FormData();
      fd.append('titulo', titulo.trim());
      fd.append('grado', grado.trim());
      fd.append('area', area.trim());
      fd.append('unidad', unidad.trim());
      fd.append('puntos_clave', puntosClave.trim());
      fd.append('usar_ia', usarIa && config.gemini_configurado ? '1' : '0');
      if (archivoPdf) fd.append('archivo_pdf', archivoPdf);

      const { data: creado } = await api.post('/fichas-ia/trabajos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const trabajoId = creado.trabajo_id;
      Swal.fire({
        title: 'Generando ficha…',
        html: usarIa && config.gemini_configurado
          ? 'Extrayendo texto y estructurando con Gemini.'
          : 'Maquetando sin IA (modo formulario).',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const { data: gen } = await api.post(`/fichas-ia/trabajos/${trabajoId}/generar`, {
        usar_ia: usarIa && config.gemini_configurado,
      });

      Swal.close();
      await cargar();

      const previewPath = gen.preview_url || `/api/fichas-ia/trabajos/${trabajoId}/preview-html`;
      const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '') || window.location.origin;
      const previewFull = previewPath.startsWith('http') ? previewPath : `${base}${previewPath}`;

      await Swal.fire({
        icon: 'success',
        title: 'Ficha lista',
        html: `<p>Ya puede ver la vista previa o descargar el PDF.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Vista previa',
        cancelButtonText: 'Cerrar',
      }).then((r) => {
        if (r.isConfirmed) window.open(previewFull, '_blank', 'noopener,noreferrer');
      });

      if (gen.pdf_url) window.open(gen.pdf_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      Swal.close();
      Swal.fire('Error', err.response?.data?.error || err.message || 'No se pudo generar', 'error');
    } finally {
      setGenerando(false);
    }
  };

  const abrirPreview = (id) => {
    const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '') || window.location.origin;
    window.open(`${base}/api/fichas-ia/trabajos/${id}/preview-html`, '_blank', 'noopener,noreferrer');
  };

  const descargarPdf = (id) => {
    const base = api.defaults.baseURL || '/api';
    window.open(`${base}/fichas-ia/trabajos/${id}/descargar-pdf`, '_blank', 'noopener,noreferrer');
  };

  return (
    <DashboardLayout>
      <div className="fichas-ia-wrap">
        <header className="fichas-ia-header">
          <h1>Diseñador de fichas pedagógicas</h1>
          <p>
            Convierta un PDF simple o sus notas en una ficha con formato Vanguard. Los archivos se guardan solo en
            este sistema (<code>uploads/fichas-ia</code>).
          </p>
          {!config.gemini_configurado && (
            <div className="fichas-ia-alert fichas-ia-alert--warn">
              <strong>Gemini no configurado.</strong> Puede generar fichas en modo formulario. Agregue{' '}
              <code>GOOGLE_AI_API_KEY</code> en el servidor para usar IA. Ver{' '}
              <code>docs/GEMINI_API_KEY.md</code>.
            </div>
          )}
          {config.gemini_configurado && (
            <div className="fichas-ia-alert fichas-ia-alert--ok">Gemini conectado — puede usar IA al generar.</div>
          )}
        </header>

        <div className="fichas-ia-grid">
          <section className="fichas-ia-card">
            <h2>Nueva ficha</h2>
            <form onSubmit={crearYGenerar} className="fichas-ia-form">
              <label>
                Título *
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej. Plantas y su importancia"
                  required
                />
              </label>
              <div className="fichas-ia-form-row">
                <label>
                  Grado
                  <input value={grado} onChange={(e) => setGrado(e.target.value)} placeholder="4" />
                </label>
                <label>
                  Unidad
                  <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="1" />
                </label>
              </div>
              <label>
                Área curricular
                <input value={area} onChange={(e) => setArea(e.target.value)} />
              </label>
              <label>
                Puntos clave (uno por línea)
                <textarea
                  value={puntosClave}
                  onChange={(e) => setPuntosClave(e.target.value)}
                  rows={4}
                  placeholder="Oxigenan el planeta&#10;Base de la cadena alimenticia"
                />
              </label>
              <label>
                PDF origen (opcional)
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setArchivoPdf(e.target.files?.[0] || null)}
                />
              </label>
              <label className="fichas-ia-check">
                <input
                  type="checkbox"
                  checked={usarIa}
                  disabled={!config.gemini_configurado}
                  onChange={(e) => setUsarIa(e.target.checked)}
                />
                Usar IA (Gemini) para estructurar actividades
              </label>
              <button type="submit" className="fichas-ia-btn-primary" disabled={generando || loading}>
                {generando ? 'Generando…' : 'Crear y generar ficha'}
              </button>
            </form>
          </section>

          <section className="fichas-ia-card">
            <h2>Mis fichas recientes</h2>
            {loading ? (
              <p className="fichas-ia-muted">Cargando…</p>
            ) : trabajos.length === 0 ? (
              <p className="fichas-ia-muted">Aún no hay fichas generadas.</p>
            ) : (
              <ul className="fichas-ia-lista">
                {trabajos.map((t) => (
                  <li key={t.id} className="fichas-ia-lista-item">
                    <div>
                      <strong>{t.titulo}</strong>
                      <span className={`fichas-ia-estado fichas-ia-estado--${String(t.estado || '').toLowerCase()}`}>
                        {ESTADO_LABEL[t.estado] || t.estado}
                      </span>
                      <div className="fichas-ia-meta">
                        {t.grado && `${t.grado}.º`} {t.area} · {new Date(t.creado_en).toLocaleString('es-PE')}
                      </div>
                    </div>
                    {t.estado === 'LISTO' && (
                      <div className="fichas-ia-acciones">
                        <button type="button" onClick={() => abrirPreview(t.id)}>
                          Vista previa
                        </button>
                        <button type="button" onClick={() => descargarPdf(t.id)}>
                          PDF
                        </button>
                        {t.pdf_url && (
                          <a href={t.pdf_url} target="_blank" rel="noopener noreferrer">
                            Abrir URL
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
