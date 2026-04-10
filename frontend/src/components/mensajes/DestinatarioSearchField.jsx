import React, {
  memo,
  useRef,
  useLayoutEffect,
  useEffect,
  useState,
  useCallback
} from 'react';
import { createPortal } from 'react-dom';
import './DestinatarioSearchField.css';

/**
 * Búsqueda de destinatarios para nuevo mensaje.
 * El listado se renderiza con portal + position:fixed bajo el campo (no tapa el input).
 */
function DestinatarioSearchField({
  busquedaDestinatario,
  onBusquedaChange,
  destinatariosSeleccionados,
  onEliminarDestinatario,
  resultadosBusqueda,
  mostrarResultados,
  onMostrarResultadosChange,
  onSeleccionarDestinatario,
  placeholder = 'Buscar destinatario, grupo, alumno o apoderado...',
  minChars = 2
}) {
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelRect, setPanelRect] = useState(null);

  const showList = mostrarResultados && resultadosBusqueda.length > 0;
  const showEmpty =
    mostrarResultados &&
    resultadosBusqueda.length === 0 &&
    busquedaDestinatario.trim().length >= minChars;
  const open = showList || showEmpty;

  const updatePosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelRect({
      top: r.bottom + 6,
      left: r.left,
      width: Math.max(r.width, 260)
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition, busquedaDestinatario, destinatariosSeleccionados]);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const ro = new ResizeObserver(() => updatePosition());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      const t = e.target;
      if (containerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onMostrarResultadosChange(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, onMostrarResultadosChange]);

  const dropdown =
    open && panelRect
      ? createPortal(
          <div
            ref={panelRef}
            className="destinatario-search-dropdown"
            style={{
              position: 'fixed',
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              zIndex: 10050
            }}
            role="listbox"
            aria-label="Resultados de búsqueda"
          >
            {showList
              ? resultadosBusqueda.map((resultado, index) => {
                  const nombreCompleto = String(resultado?.nombre_completo || 'Sin nombre');
                  const tipo = String(resultado?.tipo || '');
                  const infoAdicional = resultado?.info_adicional
                    ? String(resultado.info_adicional)
                    : null;
                  return (
                    <div
                      key={index}
                      className="resultado-item"
                      role="option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSeleccionarDestinatario(resultado)}
                    >
                      <div className="resultado-info">
                        <span className="resultado-nombre">{nombreCompleto}</span>
                        {tipo ? <span className="resultado-tipo">{tipo}</span> : null}
                      </div>
                      {infoAdicional ? (
                        <span className="resultado-extra">{infoAdicional}</span>
                      ) : null}
                    </div>
                  );
                })
              : (
                  <div className="resultado-item resultado-vacio">
                    <span>No se encontraron resultados</span>
                  </div>
                )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={containerRef} className="destinatarios-input-container">
        <div className="destinatarios-seleccionados">
          {destinatariosSeleccionados.map((dest, index) => {
            const nombreCompleto = String(dest?.nombre_completo || 'Sin nombre');
            const tipo = String(dest?.tipo || '');
            return (
              <span key={index} className="destinatario-tag">
                {nombreCompleto}
                {tipo ? <span className="destinatario-tipo">{tipo}</span> : null}
                <button
                  type="button"
                  className="destinatario-remove"
                  onClick={() => onEliminarDestinatario(index)}
                  aria-label="Quitar destinatario"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <input
          type="text"
          className="destinatarios-input"
          placeholder={placeholder}
          value={busquedaDestinatario}
          onChange={(e) => onBusquedaChange(e.target.value)}
          onFocus={() => onMostrarResultadosChange(true)}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>
      {dropdown}
    </>
  );
}

export default memo(DestinatarioSearchField);
