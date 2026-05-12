'use strict';

/**
 * IDs de alternativas en exámenes pueden venir como number o string (MySQL/JSON).
 * Las respuestas legacy V/F usan 'VERDADERO' / 'FALSO' (cualquier capitalización).
 */

function parseIdAlternativaExamen(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t === '') return null;
    if (/^(verdadero|falso)$/i.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function idsAlternativaExamenIguales(a, b) {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function normDescAltVF(desc) {
  return String(desc || '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findByTextVF(alternativas, rt) {
  const alts = alternativas || [];
  const norm = (alt) => normDescAltVF(alt.descripcion);

  if (rt === 'verdadero') {
    let a = alts.find((alt) => {
      const d = norm(alt);
      return d === 'verdadero' || d === 'true' || d === 'v';
    });
    if (a) return a;
    a = alts.find((alt) => /\bverdadero\b/.test(norm(alt)) && !/\bfalso\b/.test(norm(alt)));
    if (a) return a;
    return alts.find((alt) => norm(alt).includes('verdadero')) || null;
  }

  if (rt === 'falso') {
    let a = alts.find((alt) => {
      const d = norm(alt);
      return d === 'falso' || d === 'false' || d === 'f';
    });
    if (a) return a;
    a = alts.find((alt) => /\bfalso\b/.test(norm(alt)) && !/\bverdadero\b/.test(norm(alt)));
    if (a) return a;
    return alts.find((alt) => norm(alt).includes('falso')) || null;
  }

  return null;
}

/**
 * Resuelve qué alternativa marcó el alumno (por ID numérico o texto V/F legacy).
 */
function findAlternativaMarcadaVF(alternativas, respuestaAlumno) {
  const alts = alternativas || [];
  if (respuestaAlumno === null || respuestaAlumno === undefined || respuestaAlumno === '') {
    return null;
  }

  const rid = parseIdAlternativaExamen(respuestaAlumno);
  if (rid !== null) {
    return (
      alts.find((alt) => {
        const na = Number(alt.id);
        return Number.isFinite(na) && na === rid;
      }) || null
    );
  }

  const t = String(respuestaAlumno).trim().toLowerCase();
  if (t !== 'verdadero' && t !== 'falso') return null;
  return findByTextVF(alts, t);
}

module.exports = {
  parseIdAlternativaExamen,
  idsAlternativaExamenIguales,
  findAlternativaMarcadaVF,
};
