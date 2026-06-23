import React from 'react';

/**
 * Bloque de un reporte en Reportes → General.
 * Apilar varios uno debajo de otro; usar `tone` distinto (0–5) para color pastel.
 */
export default function ReporteGeneralPanel({ tone = 0, icon = '📄', title, description, hint, children, compact = false }) {
  const toneClass = `rg-panel--tone-${Number(tone) % 6}`;

  return (
    <section
      className={`rg-panel ${toneClass}${compact ? ' rg-panel--compact' : ''}`}
      aria-labelledby={title ? undefined : 'rg-panel-title'}
    >
      <header className="rg-panel__header">
        <span className="rg-panel__icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h2 className="rg-panel__title" id="rg-panel-title">
            {title}
          </h2>
          {description ? <p className="rg-panel__desc">{description}</p> : null}
          {hint ? <p className="rg-panel__hint">{hint}</p> : null}
        </div>
      </header>
      <div className="rg-panel__body">{children}</div>
    </section>
  );
}
