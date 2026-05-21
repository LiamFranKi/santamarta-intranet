const { sanitizarTextoFicha } = require('./normalizarActividades');

function normalizarEjerciciosMatematica(ejercicios, { titulo, grado } = {}) {
  let lista = Array.isArray(ejercicios) ? ejercicios : [];
  const norm = lista.map((ej, idx) => {
    const raw = ej || {};
    let tipo = String(raw.tipo || 'operacion').toLowerCase();
    if (tipo === 'problema_matematico') tipo = 'problema';
    if (tipo === 'calculo') tipo = 'operacion';

    const base = {
      numero: Number(raw.numero) || idx + 1,
      tipo,
      instruccion: sanitizarTextoFicha(raw.instruccion || ''),
    };

    if (tipo === 'problema') {
      return {
        ...base,
        texto: sanitizarTextoFicha(raw.texto || raw.enunciado || raw.pregunta || ''),
      };
    }

    if (tipo === 'completar') {
      let oracion = sanitizarTextoFicha(raw.oracion || raw.texto || '');
      oracion = oracion.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (!/_{2,}|___+/.test(oracion)) {
        oracion = oracion.replace(/\.\s*$/, '') + ' ___.';
      }
      return { ...base, oracion };
    }

    if (tipo === 'verdadero_falso') {
      const items = (raw.items || [raw.enunciado]).filter(Boolean).map((it) => ({
        enunciado: sanitizarTextoFicha(typeof it === 'string' ? it : it.enunciado || it.texto),
      }));
      return {
        ...base,
        enunciado: sanitizarTextoFicha(raw.enunciado || 'Completa V o F:'),
        items,
      };
    }

    const operaciones = raw.operaciones || raw.lineas || [];
    if (Array.isArray(operaciones) && operaciones.length) {
      return {
        ...base,
        tipo: 'operacion',
        enunciado: sanitizarTextoFicha(raw.enunciado || 'Resuelve:'),
        operaciones: operaciones.map((o) => sanitizarTextoFicha(typeof o === 'string' ? o : o.texto || '')),
      };
    }

    return {
      ...base,
      tipo: 'operacion',
      enunciado: sanitizarTextoFicha(raw.enunciado || 'Calcula:'),
      operaciones: [sanitizarTextoFicha(raw.operacion || raw.texto || '___ + ___ =')],
    };
  });

  while (norm.length < 10) {
    const n = norm.length + 1;
    if (n <= 4) {
      norm.push({
        numero: n,
        tipo: 'operacion',
        enunciado: 'Calcula en esta ficha:',
        operaciones: [`${10 + n} + ${n + 2} =`, `${20 + n} - ${n} =`],
      });
    } else if (n <= 7) {
      norm.push({
        numero: n,
        tipo: 'problema',
        texto: `Problema ${n}: Inventa un problema corto sobre ${titulo || 'el tema'} que puedas resolver con sumas o restas. Muestra tu procedimiento en el espacio.`,
      });
    } else {
      norm.push({
        numero: n,
        tipo: 'completar',
        oracion: `El resultado de ${n} + ${n + 3} es ___.`,
      });
    }
  }

  return norm.slice(0, 14).map((e, i) => ({ ...e, numero: i + 1 }));
}

module.exports = { normalizarEjerciciosMatematica };
