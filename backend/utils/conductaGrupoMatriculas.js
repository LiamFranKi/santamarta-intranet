const {
  ASIGNATURA_CONDUCTA,
  obtenerRangoBimestre,
  contarComponentesConductaEnRango,
  persistirNotaConducta,
  persistirNotasConductaDesglose,
  backfillVestimentaAIncidenciasGrupo,
} = require('./conductaIncidenciasBimestre');
const {
  fetchReglaConducta,
  textoReglaConducta,
  captionDescuentosConducta,
  notasDesdeConteos,
  formatNotaAlmacenada,
} = require('./reglaConducta');

async function fetchGrupoConductaContext(query, grupoId, colegio_id) {
  const rows = await query(
    `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
    [grupoId, colegio_id]
  );
  return rows[0] || null;
}

/**
 * Lista alumnos con nota de conducta automática del bimestre (regla configurable).
 * Persiste el promedio calculado para libretas / reportes.
 */
async function listarAlumnosConductaPorGrupo(query, execute, { grupoId, colegio_id, ciclo }) {
  const cicloInt = parseInt(ciclo, 10) || 1;
  const grupo = await fetchGrupoConductaContext(query, grupoId, colegio_id);
  const anio = grupo?.anio || new Date().getFullYear();
  const rango = await obtenerRangoBimestre(query, colegio_id, cicloInt, anio);
  const regla = await fetchReglaConducta(query);
  const { usaConductaNueva, sincronizarConductaNueva } = require('./conductaCatalogo');
  const regimenNuevo = usaConductaNueva(anio, cicloInt);

  if (execute && !regimenNuevo) {
    try {
      await backfillVestimentaAIncidenciasGrupo(query, execute, {
        grupoId,
        colegio_id,
        anio,
        desde: rango.desde,
        hasta: rango.hasta,
      });
    } catch (e) {
      console.warn('[conducta] backfill vestimenta:', e.message);
    }
  }

  const matriculas = await query(
    `SELECT m.id as matricula_id, a.id as alumno_id,
            CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
     FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [grupoId, colegio_id]
  );

  if (!matriculas.length) {
    return {
      lista: [],
      ciclo: cicloInt,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
      regla,
      texto_regla: textoReglaConducta(regla),
      caption_descuentos: captionDescuentosConducta(regla),
    };
  }

  const lista = [];
  for (let i = 0; i < matriculas.length; i += 1) {
    const m = matriculas[i];
    if (regimenNuevo) {
      let nota = '20.00';
      let mes1 = '20.00';
      let mes2 = '20.00';
      try {
        const sync = await sincronizarConductaNueva(query, execute, {
          matriculaId: m.matricula_id,
          colegio_id,
          anioEscolar: anio,
          ciclo: cicloInt,
          rango,
          avisar: false,
        });
        if (sync?.nota != null) {
          nota = String(sync.nota);
          mes1 = String(sync.notas?.mes1 ?? nota);
          mes2 = String(sync.notas?.mes2 ?? nota);
        }
      } catch (e) {
        console.warn('[conducta] nota nueva:', e.message);
      }
      lista.push({
        numero: i + 1,
        matricula_id: m.matricula_id,
        alumno_id: m.alumno_id,
        nombre_completo: m.nombre_completo,
        nota_conducta: nota,
        nota_incidencias: mes1,
        nota_presentacion: mes2,
        nota_tardanzas: nota,
        nota_olvido_qr: nota,
        modo: 'nueva',
        total_incidencias: 0,
        total_presentacion: 0,
        total_tardanzas: 0,
        total_olvido_qr: 0,
      });
      continue;
    }
    const conteos = await contarComponentesConductaEnRango(
      query,
      m.matricula_id,
      rango.desde,
      rango.hasta
    );
    const notas = notasDesdeConteos(conteos, regla);
    if (execute) {
      try {
        await persistirNotasConductaDesglose(execute, m.matricula_id, cicloInt, notas);
      } catch (e) {
        console.warn('[conducta] persistir nota:', e.message);
      }
    }
    lista.push({
      numero: i + 1,
      matricula_id: m.matricula_id,
      alumno_id: m.alumno_id,
      nombre_completo: m.nombre_completo,
      nota_conducta: String(notas.final),
      nota_incidencias: notas.incidencias,
      nota_presentacion: notas.presentacion,
      nota_tardanzas: notas.tardanzas,
      nota_olvido_qr: notas.olvido_qr,
      total_incidencias: conteos.incidencias,
      total_presentacion: conteos.presentacion,
      total_tardanzas: conteos.tardanzas,
      total_olvido_qr: conteos.olvido_qr,
    });
  }

  return {
    lista,
    ciclo: cicloInt,
    fecha_desde: rango.desde,
    fecha_hasta: rango.hasta,
    regla,
    texto_regla: textoReglaConducta(regla),
    caption_descuentos: captionDescuentosConducta(regla),
  };
}

/** @deprecated Manual save — conducta es automática; se mantiene por compatibilidad API. */
async function guardarConductaPorGrupo(execute, { cicloInt, notas }) {
  for (const [matriculaId, nota] of Object.entries(notas || {})) {
    const val = formatNotaAlmacenada(nota);
    await persistirNotaConducta(execute, matriculaId, cicloInt, val);
  }
}

module.exports = {
  ASIGNATURA_CONDUCTA,
  fetchGrupoConductaContext,
  listarAlumnosConductaPorGrupo,
  guardarConductaPorGrupo,
};
