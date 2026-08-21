/**
 * Validación de colocación — módulo piloto horario_gen_*.
 * No toca grupos_horarios.
 */
const { query } = require('../utils/mysql');

function timeToSec(t) {
  if (!t) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
async function validatePlacement({
  colegioId,
  versionId,
  diaSemana,
  bloqueId,
  grupoId,
  cargaId = null,
  textoLibre = null,
  excludeEntradaId = null,
}) {
  const errors = [];
  const warnings = [];
  const texto = String(textoLibre || '').trim();
  const isLibre = Boolean(texto) && !cargaId;

  if (!versionId || !diaSemana || !bloqueId || !grupoId) {
    return { valid: false, errors: ['Faltan datos de colocación'], warnings };
  }
  if (!isLibre && !cargaId) {
    return { valid: false, errors: ['Indique un curso de carga o un texto libre'], warnings };
  }
  if (isLibre && texto.length < 2) {
    return { valid: false, errors: ['El texto libre debe tener al menos 2 caracteres'], warnings };
  }
  if (isLibre && texto.length > 120) {
    return { valid: false, errors: ['El texto libre admite máximo 120 caracteres'], warnings };
  }

  const ver = await query(
    `SELECT * FROM horario_gen_versiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [versionId, colegioId]
  );
  if (!ver?.length) return { valid: false, errors: ['Versión no encontrada'], warnings };

  const bloqueRows = await query(
    `SELECT b.* FROM horario_gen_bloques b
     INNER JOIN horario_gen_config c ON c.id = b.config_id
     WHERE b.id = ? AND c.colegio_id = ? LIMIT 1`,
    [bloqueId, colegioId]
  );
  if (!bloqueRows?.length) return { valid: false, errors: ['Bloque no encontrado'], warnings };
  const bloque = bloqueRows[0];

  if (bloque.tipo === 'BREAK' || bloque.tipo === 'LUNCH') {
    errors.push(
      `No se pueden colocar clases en ${bloque.tipo === 'BREAK' ? 'recreo' : 'almuerzo'} (${bloque.nombre}).`
    );
  }

  // Slot ocupado por el grupo
  let slotSql = `
    SELECT e.id, cur.nombre AS curso_nombre, e.texto_libre
    FROM horario_gen_entradas e
    LEFT JOIN cursos cur ON cur.id = e.curso_id
    WHERE e.version_id = ? AND e.dia_semana = ? AND e.bloque_id = ? AND e.grupo_id = ?
  `;
  const slotParams = [versionId, diaSemana, bloqueId, grupoId];
  if (excludeEntradaId) {
    slotSql += ' AND e.id <> ?';
    slotParams.push(excludeEntradaId);
  }
  const slot = await query(slotSql, slotParams);
  if (slot?.length) {
    errors.push(
      `Este grupo ya tiene clase en ese bloque (${slot[0].curso_nombre || slot[0].texto_libre || 'otra asignatura'}).`
    );
  }

  // Texto libre: no usa curso/carga/docente → no afecta libreta
  if (isLibre) {
    return { valid: errors.length === 0, errors, warnings };
  }

  const cargaRows = await query(
    `SELECT * FROM horario_gen_carga WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [cargaId, colegioId]
  );
  if (!cargaRows?.length) return { valid: false, errors: ['Carga no encontrada'], warnings };
  const carga = cargaRows[0];

  if (Number(carga.grupo_id) !== Number(grupoId)) {
    errors.push('La carga no pertenece a este grupo.');
  }

  if (!carga.activo || Number(carga.activo) === 0) {
    errors.push('La carga está inactiva.');
  }

  const personalId = carga.personal_id ? Number(carga.personal_id) : null;

  // Docente ocupado en CUALQUIER nivel del año (Inicial/Primaria/Secundaria)
  if (personalId) {
    const { findTeacherClashAcrossYear } = require('./horarioGenTeacherBusy');
    const clash = await findTeacherClashAcrossYear({
      colegioId,
      anio: ver[0].anio,
      personalId,
      diaSemana,
      horaInicio: bloque.hora_inicio,
      horaFin: bloque.hora_fin,
      excludeEntradaId,
    });
    if (clash) {
      const aula = [clash.nivel_nombre, clash.grado != null ? `${clash.grado}` : null, clash.seccion]
        .filter((x) => x !== null && x !== undefined && String(x).trim() !== '')
        .join(' ');
      errors.push(
        `El docente ya está ocupado en ${aula || 'otro grupo'} (${clash.curso_nombre || clash.texto_libre || 'curso'}) a esa hora.`
      );
    }

    // Disponibilidad
    const disp = await query(
      `SELECT * FROM horario_gen_disponibilidad
       WHERE colegio_id = ? AND anio = ? AND personal_id = ? AND dia_semana = ?
       LIMIT 1`,
      [colegioId, ver[0].anio, personalId, diaSemana]
    );
    if (disp?.length) {
      const d = disp[0];
      const bStartSec = timeToSec(bloque.hora_inicio);
      const bEndSec = timeToSec(bloque.hora_fin);
      if (d.estado === 'UNAVAILABLE') {
        errors.push('El docente no está disponible ese día.');
      } else if (d.estado === 'AVAILABLE' || d.estado === 'CUSTOM_INTERVAL') {
        const from = timeToSec(d.hora_desde);
        const until = timeToSec(d.hora_hasta);
        if (from != null && until != null && (bStartSec < from || bEndSec > until)) {
          errors.push(
            `El docente solo está disponible de ${String(d.hora_desde).slice(0, 5)} a ${String(d.hora_hasta).slice(0, 5)}.`
          );
        }
      } else if (d.estado === 'AVAILABLE_UNTIL') {
        const until = timeToSec(d.hora_hasta);
        if (until != null && bEndSec > until) {
          errors.push(`El docente solo está disponible hasta las ${String(d.hora_hasta).slice(0, 5)}.`);
        }
      } else if (d.estado === 'AVAILABLE_FROM') {
        const from = timeToSec(d.hora_desde);
        if (from != null && bStartSec < from) {
          errors.push(`El docente solo está disponible desde las ${String(d.hora_desde).slice(0, 5)}.`);
        }
      }
    } else {
      warnings.push('El docente no tiene disponibilidad configurada; se asume disponible.');
    }
  } else {
    warnings.push('La carga no tiene docente asignado.');
  }

  // Tope semanal
  let countSql = `
    SELECT COUNT(*) AS n FROM horario_gen_entradas
    WHERE version_id = ? AND carga_id = ?
  `;
  const countParams = [versionId, cargaId];
  if (excludeEntradaId) {
    countSql += ' AND id <> ?';
    countParams.push(excludeEntradaId);
  }
  const cnt = await query(countSql, countParams);
  const placed = Number(cnt?.[0]?.n || 0);
  const need = Number(carga.bloques_semanales || 0);
  if (placed >= need) {
    errors.push(`Ya están colocados ${placed}/${need} bloques semanales de esta carga.`);
  } else if (placed + 1 === need) {
    warnings.push(`Con esta colocación se completa la carga (${need} bloques).`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  validatePlacement,
  timeToSec,
  overlaps,
};
