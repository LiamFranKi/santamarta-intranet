const { query } = require('./mysql');
const { ordenNivelEducativoNombre } = require('./listaAlumnosMatriculadosReporte');
const { buildConceptosOpciones, buildMesesPensionOpciones, cargarConfigColegio } = require('./reportesGeneralDeudoresPagadores');
const { nroPagoDesdeMesCalendario } = require('./deudaPensiones');

function mesHastaPensionPorDefecto(totalPensiones, inicioPensiones) {
  const mesActual = new Date().getMonth() + 1;
  let nro = nroPagoDesdeMesCalendario(mesActual, inicioPensiones);
  if (!Number.isFinite(nro) || nro < 1) nro = 1;
  if (nro > totalPensiones) nro = totalPensiones;
  return nro;
}

async function cargarMetaReportesGeneral(colegioId) {
  let anioActivo = new Date().getFullYear();
  const [cRow] = await query('SELECT anio_activo, nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  if (cRow?.anio_activo != null && cRow.anio_activo !== '') {
    anioActivo = parseInt(cRow.anio_activo, 10) || anioActivo;
  }

  let niveles = await query(
    `SELECT id, nombre, grado_minimo, grado_maximo FROM niveles WHERE colegio_id = ?
     ORDER BY COALESCE(grado_minimo, 0) ASC, id ASC`,
    [colegioId]
  ).catch(() => []);
  if (!niveles?.length) {
    niveles = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC', [colegioId]).catch(
      () => []
    );
  }
  niveles = [...(niveles || [])].sort((a, b) => {
    const oa = ordenNivelEducativoNombre(a.nombre);
    const ob = ordenNivelEducativoNombre(b.nombre);
    if (oa !== ob) return oa - ob;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });

  let turnos = await query('SELECT id, nombre FROM turnos WHERE colegio_id = ? ORDER BY nombre ASC', [colegioId]).catch(
    () => []
  );
  if (!turnos?.length) {
    turnos = await query('SELECT id, nombre FROM turnos ORDER BY nombre ASC').catch(() => []);
  }
  const sedes = await query('SELECT id, nombre FROM sedes WHERE colegio_id = ? ORDER BY id ASC', [colegioId]).catch(
    () => []
  );

  const turnoManana = (turnos || []).find((t) => /mañana|manana/i.test(String(t.nombre || '')));
  const sedeUno = (sedes || []).find((s) => Number(s.id) === 1);
  const pagoCfg = await cargarConfigColegio(colegioId);
  const mesesPension = buildMesesPensionOpciones(pagoCfg.totalPensiones, pagoCfg.inicioPensiones);
  const defaultMesHasta = mesHastaPensionPorDefecto(pagoCfg.totalPensiones, pagoCfg.inicioPensiones);

  return {
    colegio_nombre: cRow?.nombre || 'Colegio',
    anio_activo: anioActivo,
    niveles: niveles || [],
    turnos: turnos || [],
    sedes: sedes || [],
    moneda: pagoCfg.moneda,
    total_pensiones: pagoCfg.totalPensiones,
    inicio_pensiones: pagoCfg.inicioPensiones,
    conceptos_opciones: buildConceptosOpciones(pagoCfg.totalPensiones, pagoCfg.inicioPensiones),
    meses_pension_opciones: mesesPension,
    defaults: {
      sede_id: sedeUno ? sedeUno.id : (sedes[0]?.id ?? 1),
      turno_id: turnoManana?.id ?? turnos[0]?.id ?? null,
      anio: anioActivo,
      concepto: 'todos',
      mes_hasta: defaultMesHasta,
    },
  };
}

module.exports = { cargarMetaReportesGeneral };
