const { sanitizarTextoFicha } = require('./normalizarActividades');

function arrStr(v, minLen = 1) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => sanitizarTextoFicha(typeof x === 'string' ? x : x?.texto || x?.enunciado || x?.nombre || ''))
    .filter((s) => s.length >= minLen);
}

function arrObj(v, mapFn) {
  if (!Array.isArray(v)) return [];
  return v.map(mapFn).filter(Boolean);
}

/**
 * Normaliza el JSON tipado GUÍA + PRÁCTICA (formato referencia institucional).
 */
function normalizarGuiaPractica(raw, { titulo } = {}) {
  const tema = String(titulo || 'el tema').trim() || 'el tema';
  const g = raw?.guia || {};
  const p = raw?.practica || {};

  const guia = {
    titulo: String(g.titulo || tema).trim().toUpperCase(),
    definicion: {
      titulo: String(g.definicion?.titulo || `¿Qué es ${tema}?`).trim(),
      texto: sanitizarTextoFicha(g.definicion?.texto || ''),
      emoji: String(g.definicion?.emoji || g.definicion?.emoji_ilustracion || '📘').trim().slice(0, 4) || '📘',
    },
    importancia: {
      titulo: String(g.importancia?.titulo || `¿Por qué es importante ${tema}?`).trim(),
      items: arrStr(g.importancia?.items, 8).slice(0, 6),
    },
    partes: {
      titulo: String(g.partes?.titulo || 'Partes o ideas principales').trim(),
      items: arrObj(g.partes?.items, (it) => {
        const nombre = sanitizarTextoFicha(it?.nombre || it?.titulo || '');
        const descripcion = sanitizarTextoFicha(it?.descripcion || it?.texto || '');
        if (!nombre || !descripcion) return null;
        return { nombre, descripcion, emoji: String(it?.emoji || '🔹').trim().slice(0, 4) || '🔹' };
      }).slice(0, 5),
    },
    tipos: {
      titulo: String(g.tipos?.titulo || 'Tipos o comparación').trim(),
      columna_a: {
        titulo: String(g.tipos?.columna_a?.titulo || 'Tipo A').trim(),
        emoji: String(g.tipos?.columna_a?.emoji || '🅰️').trim().slice(0, 4) || '🅰️',
        items: arrStr(g.tipos?.columna_a?.items, 4).slice(0, 5),
      },
      columna_b: {
        titulo: String(g.tipos?.columna_b?.titulo || 'Tipo B').trim(),
        emoji: String(g.tipos?.columna_b?.emoji || '🅱️').trim().slice(0, 4) || '🅱️',
        items: arrStr(g.tipos?.columna_b?.items, 4).slice(0, 5),
      },
      nota: sanitizarTextoFicha(g.tipos?.nota || ''),
    },
    proceso: {
      titulo: String(g.proceso?.titulo || 'Proceso o niveles').trim(),
      pasos: arrObj(g.proceso?.pasos, (it) => {
        const nombre = sanitizarTextoFicha(it?.nombre || it?.titulo || '');
        if (!nombre) return null;
        return {
          nombre,
          descripcion: sanitizarTextoFicha(it?.descripcion || it?.texto || ''),
          emoji: String(it?.emoji || '➡️').trim().slice(0, 4) || '➡️',
        };
      }).slice(0, 6),
    },
    ejemplos: {
      titulo: String(g.ejemplos?.titulo || 'Ejemplos').trim(),
      items: arrObj(g.ejemplos?.items, (it) => {
        const t = sanitizarTextoFicha(it?.titulo || it?.nombre || '');
        const d = sanitizarTextoFicha(it?.descripcion || it?.texto || '');
        if (!t || !d) return null;
        return { titulo: t, descripcion: d, emoji: String(it?.emoji || '✨').trim().slice(0, 4) || '✨' };
      }).slice(0, 3),
    },
    sabias_que: {
      titulo: String(g.sabias_que?.titulo || '¿Sabías que?').trim(),
      texto: sanitizarTextoFicha(g.sabias_que?.texto || ''),
      emoji: String(g.sabias_que?.emoji || '💡').trim().slice(0, 4) || '💡',
    },
    recuerda: sanitizarTextoFicha(g.recuerda || ''),
  };

  const marcarItems = arrObj(p.marcar?.items || p.marcar?.preguntas, (it) => {
    const pregunta = sanitizarTextoFicha(it?.pregunta || it?.enunciado || it?.texto || '');
    if (!pregunta) return null;
    let opciones = [];
    if (Array.isArray(it?.opciones)) {
      opciones = it.opciones.map((o, i) => {
        const letra = String.fromCharCode(97 + i);
        const texto = sanitizarTextoFicha(typeof o === 'string' ? o.replace(/^[a-d]\)\s*/i, '') : o?.texto || '');
        return { letra, texto };
      }).filter((o) => o.texto);
    }
    while (opciones.length < 3) {
      opciones.push({ letra: String.fromCharCode(97 + opciones.length), texto: 'Opción' });
    }
    return { pregunta, opciones: opciones.slice(0, 4) };
  }).slice(0, 3);

  const practica = {
    titulo: String(p.titulo || `FICHA DE APLICACIÓN: ${tema}`).trim(),
    responder: {
      preguntas: arrStr(p.responder?.preguntas, 10).slice(0, 3),
    },
    completar: {
      oraciones: arrStr(p.completar?.oraciones, 8).slice(0, 4),
    },
    verdadero_falso: {
      items: arrStr(p.verdadero_falso?.items || p.verdadero_falso?.afirmaciones, 8).slice(0, 5),
    },
    marcar: { items: marcarItems },
    relacionar: {
      columna_a: arrStr(p.relacionar?.columna_a, 2).slice(0, 5),
      columna_b: arrStr(p.relacionar?.columna_b, 2).slice(0, 5),
    },
    ordenar: {
      instruccion: sanitizarTextoFicha(
        p.ordenar?.instruccion || 'Ordena los elementos en el orden correcto.'
      ),
      elementos: arrStr(p.ordenar?.elementos, 2).slice(0, 6),
    },
    identifica: {
      instruccion: sanitizarTextoFicha(
        p.identifica?.instruccion || 'Observa e identifica cada caso.'
      ),
      casos: arrObj(p.identifica?.casos, (it, idx) => {
        const pista = sanitizarTextoFicha(it?.pista || it?.descripcion || it?.titulo || '');
        if (!pista) return null;
        return {
          etiqueta_esperada: String(it?.etiqueta_esperada || (idx === 0 ? 'A' : 'B')).trim().slice(0, 3),
          pista,
          emoji: String(it?.emoji || (idx === 0 ? '🔵' : '🟢')).trim().slice(0, 4) || '🔵',
        };
      }).slice(0, 2),
    },
  };

  return { guia, practica };
}

/** Completa huecos mínimos si Gemini omitió algún bloque. */
function completarGuiaPracticaMinima({ guia, practica }, tema) {
  const t = tema || 'el tema';
  if (!guia.definicion.texto) {
    guia.definicion.texto = `${t} es un concepto importante del curso. Léelo con atención y observa los ejemplos.`;
  }
  if (guia.importancia.items.length < 3) {
    guia.importancia.items = [
      `Permite comprender mejor ${t} en la vida diaria.`,
      `Ayuda a explicar fenómenos o situaciones del entorno escolar.`,
      `Sirve de base para aprender temas más avanzados.`,
      ...guia.importancia.items,
    ].slice(0, 5);
  }
  if (guia.partes.items.length < 2) {
    guia.partes.items = [
      { nombre: 'Idea principal', descripcion: `Concepto central de ${t}.`, emoji: '⭐' },
      { nombre: 'Ejemplo', descripcion: `Situación concreta relacionada con ${t}.`, emoji: '📌' },
      { nombre: 'Aplicación', descripcion: `Cómo usamos ${t} en el aula o en casa.`, emoji: '🛠️' },
    ];
  }
  if (!guia.tipos.columna_a.items.length) {
    guia.tipos.columna_a.items = [`Característica 1 de ${t}`, 'Característica 2', 'Característica 3'];
  }
  if (!guia.tipos.columna_b.items.length) {
    guia.tipos.columna_b.items = ['Otra forma o contraste 1', 'Otra forma 2', 'Otra forma 3'];
  }
  if (guia.proceso.pasos.length < 3) {
    guia.proceso.pasos = [
      { nombre: 'Inicio', descripcion: 'Partimos del concepto básico', emoji: '1️⃣' },
      { nombre: 'Desarrollo', descripcion: 'Organizamos las ideas', emoji: '2️⃣' },
      { nombre: 'Aplicación', descripcion: 'Lo usamos con ejemplos', emoji: '3️⃣' },
      { nombre: 'Conclusión', descripcion: 'Resumimos lo aprendido', emoji: '4️⃣' },
    ];
  }
  if (guia.ejemplos.items.length < 2) {
    guia.ejemplos.items = [
      { titulo: 'Ejemplo 1', descripcion: `Caso cotidiano de ${t}.`, emoji: '1️⃣' },
      { titulo: 'Ejemplo 2', descripcion: `Caso del aula relacionado con ${t}.`, emoji: '2️⃣' },
      { titulo: 'Ejemplo 3', descripcion: `Otro ejemplo claro de ${t}.`, emoji: '3️⃣' },
    ];
  }
  if (!guia.sabias_que.texto) {
    guia.sabias_que.texto = `Investigar sobre ${t} nos ayuda a ser más curiosos y a cuidar mejor nuestro entorno.`;
  }
  if (!guia.recuerda) {
    guia.recuerda = `${t} es clave para comprender el mundo. ¡Sigue practicando!`;
  }

  if (practica.responder.preguntas.length < 2) {
    practica.responder.preguntas = [
      `¿Qué es ${t}? Explícalo con tus palabras.`,
      `¿Por qué es importante aprender sobre ${t}?`,
    ];
  }
  if (practica.completar.oraciones.length < 2) {
    practica.completar.oraciones = [
      `La idea principal de ${t} es ______________.`,
      `Un ejemplo de ${t} es ______________.`,
      `${t} nos ayuda a ______________.`,
    ];
  }
  if (practica.verdadero_falso.items.length < 3) {
    practica.verdadero_falso.items = [
      `${t} no tiene ninguna relación con la vida diaria.`,
      `Es importante estudiar ${t} con atención.`,
      `Los ejemplos ayudan a comprender mejor ${t}.`,
      `Solo se puede aprender ${t} memorizando sin entender.`,
    ];
  }
  if (!practica.marcar.items.length) {
    practica.marcar.items = [
      {
        pregunta: `¿Cuál afirmación sobre ${t} es correcta?`,
        opciones: [
          { letra: 'a', texto: `Es un tema importante del curso` },
          { letra: 'b', texto: `No sirve para nada` },
          { letra: 'c', texto: `Solo existe en libros antiguos` },
          { letra: 'd', texto: `No se puede explicar` },
        ],
      },
    ];
  }
  if (practica.relacionar.columna_a.length < 3) {
    practica.relacionar.columna_a = ['Concepto', 'Ejemplo', 'Importancia'];
    practica.relacionar.columna_b = [
      `Idea central de ${t}`,
      'Caso de la vida diaria',
      'Por qué debemos estudiarlo',
    ];
  }
  if (practica.ordenar.elementos.length < 3) {
    practica.ordenar.elementos = ['Observar', 'Comprender', 'Ejemplificar', 'Aplicar', 'Evaluar'];
  }
  if (practica.identifica.casos.length < 2) {
    practica.identifica.casos = [
      { etiqueta_esperada: 'A', pista: `Caso relacionado con ${t}`, emoji: '🔵' },
      { etiqueta_esperada: 'B', pista: `Otro caso distinto de ${t}`, emoji: '🟢' },
    ];
  }
  return { guia, practica };
}

/** Convierte guía tipada a teoria/aplicacion legacy (BD / preview antigua). */
function guiaPracticaALegacy({ guia, practica }, pie) {
  const teoria = {
    titulo_seccion: `GUÍA: ${guia.titulo}`,
    parrafos: [
      guia.definicion.texto,
      ...(guia.importancia.items || []).slice(0, 3),
    ].filter(Boolean),
    glosario: (guia.partes.items || []).map((p) => ({
      termino: p.nombre,
      definicion: p.descripcion,
    })),
    ilustraciones: (guia.ejemplos.items || []).map((e) => ({
      titulo: e.titulo,
      descripcion: e.descripcion,
      emoji: e.emoji,
    })),
    recuerda: guia.recuerda ? [guia.recuerda] : [],
  };

  const actividades = [
    {
      tipo: 'preguntas',
      titulo: 'I. RESPONDER',
      preguntas: practica.responder.preguntas,
    },
    {
      tipo: 'completar',
      titulo: 'II. COMPLETAR',
      oraciones: practica.completar.oraciones,
    },
    {
      tipo: 'verdadero_falso',
      titulo: 'III. VERDADERO O FALSO',
      items: practica.verdadero_falso.items.map((enunciado) => ({ enunciado })),
    },
    {
      tipo: 'opciones',
      titulo: 'IV. MARCAR',
      items: practica.marcar.items.map((it) => ({
        enunciado: it.pregunta,
        subopciones: it.opciones,
      })),
    },
  ];

  return {
    teoria,
    aplicacion: {
      titulo_seccion: practica.titulo || 'FICHA DE APLICACIÓN',
      instruccion_general: 'Completa todas las actividades en esta hoja.',
      actividades,
    },
    intro: teoria.parrafos.join('\n\n'),
    recuerda: teoria.recuerda,
    glosario: teoria.glosario,
    ilustraciones: teoria.ilustraciones,
    actividades,
    ejercicios_matematicos: [],
    pie_motivacional: pie || '¡Muy bien! Sigue aprendiendo.',
    guia,
    practica,
    formato_ficha: 'guia_practica',
  };
}

function legacyAGuiaPractica(contenido, titulo) {
  const tema = titulo || contenido?.teoria?.titulo_seccion || 'el tema';
  const raw = {
    guia: {
      titulo: String(tema).replace(/^Aprendemos:\s*/i, ''),
      definicion: {
        titulo: `¿Qué es ${tema}?`,
        texto: (contenido?.teoria?.parrafos || [])[0] || '',
        emoji: '📘',
      },
      importancia: {
        titulo: `¿Por qué es importante?`,
        items: (contenido?.teoria?.parrafos || []).slice(1, 5),
      },
      partes: {
        titulo: 'Ideas principales',
        items: (contenido?.glosario || contenido?.teoria?.glosario || []).map((g) => ({
          nombre: g.termino,
          descripcion: g.definicion,
          emoji: '🔹',
        })),
      },
      tipos: {
        titulo: 'Comparación',
        columna_a: { titulo: 'Aspecto A', emoji: '🅰️', items: (contenido?.recuerda || []).slice(0, 3) },
        columna_b: { titulo: 'Aspecto B', emoji: '🅱️', items: (contenido?.recuerda || []).slice(3, 6) },
        nota: '',
      },
      proceso: {
        titulo: 'Pasos para aprender',
        pasos: [
          { nombre: 'Leer', descripcion: 'Lee la guía con atención', emoji: '📖' },
          { nombre: 'Observar', descripcion: 'Mira los ejemplos', emoji: '👀' },
          { nombre: 'Practicar', descripcion: 'Resuelve la ficha', emoji: '✏️' },
          { nombre: 'Repasar', descripcion: 'Revisa el recuerda', emoji: '✅' },
        ],
      },
      ejemplos: {
        titulo: 'Ejemplos',
        items: (contenido?.ilustraciones || contenido?.teoria?.ilustraciones || []).map((il) => ({
          titulo: il.titulo,
          descripcion: il.descripcion,
          emoji: il.emoji || '✨',
        })),
      },
      sabias_que: {
        titulo: '¿Sabías que?',
        texto: (contenido?.recuerda || [])[0] || `Aprender sobre ${tema} es muy útil.`,
        emoji: '💡',
      },
      recuerda: (contenido?.recuerda || []).join('. ') || `Recuerda lo esencial de ${tema}.`,
    },
    practica: {
      titulo: `FICHA DE APLICACIÓN: ${tema}`,
      responder: {
        preguntas: (contenido?.actividades || [])
          .filter((a) => a.tipo === 'preguntas')
          .flatMap((a) => (a.preguntas || []).map((q) => (typeof q === 'string' ? q : q.texto)))
          .slice(0, 3),
      },
      completar: {
        oraciones: (contenido?.actividades || [])
          .filter((a) => a.tipo === 'completar')
          .flatMap((a) => a.oraciones || [])
          .slice(0, 4),
      },
      verdadero_falso: {
        items: (contenido?.actividades || [])
          .filter((a) => a.tipo === 'verdadero_falso')
          .flatMap((a) => (a.items || []).map((i) => i.enunciado || i))
          .slice(0, 5),
      },
      marcar: { items: [] },
      relacionar: { columna_a: [], columna_b: [] },
      ordenar: { instruccion: '', elementos: [] },
      identifica: { instruccion: '', casos: [] },
    },
  };
  let { guia, practica } = normalizarGuiaPractica(raw, { titulo: tema });
  ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, tema));
  return guiaPracticaALegacy({ guia, practica }, contenido?.pie_motivacional);
}

module.exports = {
  normalizarGuiaPractica,
  completarGuiaPracticaMinima,
  guiaPracticaALegacy,
  legacyAGuiaPractica,
};
