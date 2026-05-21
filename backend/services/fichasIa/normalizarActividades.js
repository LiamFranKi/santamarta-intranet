/** Texto apto para ficha impresa: todo en esta hoja, sin cuaderno/libreta. */
function sanitizarTextoFicha(s) {
  return String(s || '')
    .trim()
    .replace(/\ben\s+(tu\s+)?(cuaderno|libreta|agenda)\b/gi, 'en esta ficha')
    .replace(/\ben\s+casa\b/gi, 'en el espacio de la ficha')
    .replace(/\s+/g, ' ');
}

function letraIndice(i) {
  return String.fromCharCode(97 + (Number(i) % 26));
}

/**
 * Unifica tipos y estructura de actividades para la plantilla Handlebars.
 */
function normalizarActividades(actividades) {
  if (!Array.isArray(actividades)) return [];

  return actividades.map((act, idx) => {
    const raw = act || {};
    let tipo = String(raw.tipo || 'preguntas').toLowerCase().trim();
    if (tipo === 'dibujo_descrito' || tipo === 'dibujar') tipo = 'dibujo';
    if (tipo === 'vf' || tipo === 'v_f') tipo = 'verdadero_falso';
    if (tipo === 'seleccion' || tipo === 'opcion_multiple') tipo = 'opciones';

    const base = {
      tipo,
      titulo: sanitizarTextoFicha(raw.titulo || `Actividad ${idx + 1}`),
      instruccion: sanitizarTextoFicha(raw.instruccion || raw.instruccion_general || ''),
    };

    if (tipo === 'tabla_partes') {
      return {
        ...base,
        columnas: (raw.columnas || ['Concepto', 'Respuesta']).map((c) => sanitizarTextoFicha(c)),
        filas: (raw.filas || []).map((f) => ({
          parte: sanitizarTextoFicha(f?.parte || f?.columna1 || ''),
          funcion: sanitizarTextoFicha(f?.funcion || f?.columna2 || ''),
        })),
      };
    }

    if (tipo === 'verdadero_falso') {
      const items = (raw.items || raw.afirmaciones || raw.preguntas || []).map((it) => {
        if (typeof it === 'string') return { enunciado: sanitizarTextoFicha(it) };
        return {
          enunciado: sanitizarTextoFicha(it.enunciado || it.texto || it.afirmacion || ''),
        };
      });
      return { ...base, items: items.filter((i) => i.enunciado.length > 3) };
    }

    if (tipo === 'dibujo') {
      return {
        ...base,
        instruccion_dibujo: sanitizarTextoFicha(
          raw.instruccion_dibujo || raw.instruccion || 'Dibuja en el recuadro usando lo aprendido.'
        ),
        altura_dibujo: Math.min(220, Math.max(100, Number(raw.altura_dibujo) || 150)),
      };
    }

    if (tipo === 'opciones') {
      const items = (raw.items || raw.subpreguntas || []).map((it, i) => {
        if (typeof it === 'string') {
          return { letra: letraIndice(i), enunciado: sanitizarTextoFicha(it), subopciones: [] };
        }
        const sub = (it.subopciones || it.opciones || []).map((o, j) => ({
          letra: letraIndice(j),
          texto: sanitizarTextoFicha(typeof o === 'string' ? o : o.texto || o.opcion || ''),
        }));
        return {
          letra: String(it.letra || letraIndice(i)).toLowerCase().replace(/[^a-z]/g, '') || letraIndice(i),
          enunciado: sanitizarTextoFicha(it.enunciado || it.texto || it.pregunta || ''),
          subopciones: sub,
        };
      });
      return { ...base, items: items.filter((i) => i.enunciado.length > 3) };
    }

    if (tipo === 'completar') {
      const oraciones = (raw.oraciones || raw.items || raw.preguntas || []).map((o) =>
        sanitizarTextoFicha(typeof o === 'string' ? o : o.texto || o.oracion || '')
      );
      return { ...base, oraciones: oraciones.filter((o) => o.length > 5) };
    }

    tipo = 'preguntas';
    const preguntas = (raw.preguntas || raw.items || []).map((p) => {
      const texto = sanitizarTextoFicha(
        typeof p === 'string' ? p : p.texto || p.pregunta || p.enunciado || ''
      );
      return { texto };
    });
    return {
      ...base,
      tipo: 'preguntas',
      preguntas: preguntas.filter((p) => p.texto.length > 12),
    };
  });
}

module.exports = { normalizarActividades, sanitizarTextoFicha };
