import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { groupDocenteDocsByCategory, gestionPdfFullUrl } from '../utils/docenteDocumentosGestion';
import '../pages/DocenteDashboard.css';

/**
 * Listado de documentos de gestión (Herramientas) por categoría.
 * @param {number} [maxPorCategoria] — si se indica, solo se muestran las N más recientes por categoría.
 * @param {string} [verMasTo] — ruta del botón «Ver más» (p. ej. /docente/herramientas/documentos).
 */
export default function DocenteDocumentosGestionSection({
  documentos,
  loading,
  maxPorCategoria,
  verMasTo,
  heroTitle = 'Herramientas',
  heroSubtitle = 'Documentos institucionales disponibles para tu perfil. Abre cada PDF en una nueva pestaña.',
}) {
  const grupos = useMemo(() => {
    const full = groupDocenteDocsByCategory(documentos);
    const lim = maxPorCategoria;
    return full.map((g) => {
      const totalEnCategoria = g.items.length;
      const items = lim != null ? g.items.slice(0, lim) : g.items;
      return { ...g, items, totalEnCategoria };
    });
  }, [documentos, maxPorCategoria]);

  const mostrarVerMas =
    verMasTo &&
    maxPorCategoria != null &&
    grupos.some((g) => g.totalEnCategoria > maxPorCategoria);

  return (
    <div className="dashboard-section docs-gestion-wrap">
      <div className="docs-gestion-hero mundo-card">
        <div className="docs-gestion-hero-inner">
          <div className="docs-gestion-hero-icon" aria-hidden="true">
            📑
          </div>
          <div className="docs-gestion-hero-text">
            <h2 className="section-title docs-gestion-hero-title">{heroTitle}</h2>
            <p className="docs-gestion-hero-sub">{heroSubtitle}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="docs-gestion-loading mundo-card">
          <div className="docs-gestion-skeleton-row" />
          <div className="docs-gestion-skeleton-row short" />
          <div className="docs-gestion-skeleton-row" />
        </div>
      ) : grupos.length === 0 ? (
        <div className="docs-gestion-empty mundo-card">
          <span className="docs-gestion-empty-icon" aria-hidden="true">
            📭
          </span>
          <p>No hay documentos de gestión asignados a tu perfil por ahora.</p>
        </div>
      ) : (
        <>
          <div className="docs-gestion-categorias">
            {grupos.map((grupo, gi) => (
              <div
                key={grupo.nombre}
                className={`docs-gestion-categoria mundo-card docs-gestion-categoria--tone-${gi % 5}`}
              >
                <div className="docs-gestion-categoria-head">
                  <div className="docs-gestion-categoria-title-wrap">
                    <span className="docs-gestion-categoria-chip" aria-hidden="true">
                      {grupo.totalEnCategoria}
                    </span>
                    <h3 className="docs-gestion-categoria-title">{grupo.nombre}</h3>
                  </div>
                  <span className="docs-gestion-categoria-hint">PDF</span>
                </div>
                <div className="docs-gestion-doc-grid">
                  {grupo.items.map((d, di) => {
                    const fechaStr = d.fecha_publicacion
                      ? new Date(d.fecha_publicacion).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : d.created_at
                        ? new Date(d.created_at).toLocaleDateString('es-PE', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '';
                    const pastelIdx = (gi * 3 + di) % 6;
                    return (
                      <a
                        key={d.id}
                        className={`docs-gestion-doc-card docs-gestion-doc-card--pastel-${pastelIdx}`}
                        href={gestionPdfFullUrl(d.archivo_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={d.titulo}
                        aria-label={`Ver PDF: ${d.titulo}`}
                      >
                        <div className="docs-gestion-doc-icon-wrap" aria-hidden="true">
                          <span className="docs-gestion-doc-icon">PDF</span>
                        </div>
                        <div className="docs-gestion-doc-text">
                          <span className="docs-gestion-doc-titulo">{d.titulo}</span>
                          {fechaStr ? (
                            <span className="docs-gestion-doc-meta">{fechaStr}</span>
                          ) : null}
                        </div>
                        <span className="docs-gestion-doc-view" aria-hidden="true">
                          <svg
                            className="docs-gestion-doc-view-svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M1 12s4.5-7 11-7 11 7 11 7-4.5 7-11 7S1 12 1 12z"
                              stroke="currentColor"
                              strokeWidth="1.65"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="3.25"
                              stroke="currentColor"
                              strokeWidth="1.65"
                            />
                          </svg>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {mostrarVerMas ? (
            <div className="docs-gestion-ver-mas-wrap">
              <Link className="btn-docs-gestion-ver-mas" to={verMasTo}>
                Ver más
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
