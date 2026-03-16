import React from 'react';
import { DndContext, DragOverlay, pointerWithin, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const ID_POOL = 'pool-elementos-soltar';

function PreguntaArrastrarSoltar({ pregunta, respuesta, onRespuestaChange }) {
  const alternativas = pregunta.alternativas || [];
  const respuestasActuales = respuesta || {};
  const [activeId, setActiveId] = React.useState(null);

  // Obtener zonas únicas
  const zonasUnicas = [...new Set(alternativas
    .map(alt => alt.zona_drop)
    .filter(zona => zona && zona.trim() !== ''))];

  // Alternativas que aún no tienen zona (están en el “pool”)
  const alternativasArrastrables = alternativas.filter(alt => {
    const respuestaAlt = respuestasActuales[alt.id];
    return !respuestaAlt || !respuestaAlt.zona;
  });

  // Activar arrastre solo después de mover un poco (evita que un clic suelte en cualquier sitio)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const alternativaId = active.id;
    const overId = String(over.id);

    // Soltar en el área "pool" = quitar de la zona (volver a la lista)
    if (overId === ID_POOL) {
      const nuevo = { ...respuestasActuales };
      delete nuevo[alternativaId];
      onRespuestaChange(nuevo);
      return;
    }

    // Soltar en una zona válida
    if (zonasUnicas.includes(overId)) {
      onRespuestaChange({
        ...respuestasActuales,
        [alternativaId]: { zona: overId }
      });
    }
  };

  return (
    <div className="pregunta-arrastrar-soltar">
      <div 
        className="pregunta-descripcion"
        dangerouslySetInnerHTML={{ __html: pregunta.descripcion }}
      />
      
      <p className="instrucciones-arrastrar">
        📌 Arrastra cada elemento a su zona. Puedes sacarlos de la zona arrastrándolos de vuelta a la lista para cambiar.
      </p>

      <DndContext 
        sensors={sensors} 
        collisionDetection={pointerWithin} 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="arrastrar-soltar-container">
          {/* Zonas de Destino (cada una es droppable; los ítems dentro son draggables) */}
          <div className="zonas-destino">
            {zonasUnicas.map((zona) => (
              <ZonaDrop 
                key={zona} 
                zona={zona} 
                alternativas={alternativas}
                respuestasActuales={respuestasActuales}
              />
            ))}
          </div>

          {/* Área pool: droppable para devolver ítems y lista de ítems sin zona */}
          <PoolDrop id={ID_POOL}>
            <h3>Arrastra estos elementos (o suelta aquí para sacar de una zona):</h3>
            {alternativasArrastrables.map((alt) => (
              <ElementoArrastrable key={alt.id} alternativa={alt} />
            ))}
          </PoolDrop>
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="elemento-arrastrable dragging-overlay">
              <div dangerouslySetInnerHTML={{ __html: alternativas.find(a => a.id === activeId)?.descripcion || '' }} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function ElementoArrastrable({ alternativa, enZona }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: alternativa.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`elemento-arrastrable ${enZona ? 'elemento-en-zona' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div dangerouslySetInnerHTML={{ __html: alternativa.descripcion }} />
    </div>
  );
}

function PoolDrop({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`elementos-arrastrables pool-droppable ${isOver ? 'drag-over' : ''}`}
    >
      {children}
    </div>
  );
}

function ZonaDrop({ zona, alternativas, respuestasActuales }) {
  const { setNodeRef, isOver } = useDroppable({ id: zona });

  const alternativasEnZona = Object.entries(respuestasActuales)
    .filter(([_, resp]) => resp && resp.zona === zona)
    .map(([altId]) => alternativas.find(a => a.id === parseInt(altId, 10)))
    .filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      className={`zona-drop ${isOver ? 'drag-over' : ''}`}
    >
      <h4>{zona}</h4>
      <div className="zona-drop-content">
        {alternativasEnZona.map((alt) => (
          <ElementoArrastrable key={alt.id} alternativa={alt} enZona />
        ))}
        {alternativasEnZona.length === 0 && (
          <div className="zona-vacia">Suelta aquí</div>
        )}
      </div>
    </div>
  );
}

export default PreguntaArrastrarSoltar;

