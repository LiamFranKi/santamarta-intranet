const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const PDFDocument = require('pdfkit');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { registrarAccion } = require('../utils/auditoria');
const { uploadToPHPServer } = require('../utils/ftpUpload');
const { enviarPushNotificationMultiple, enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { insertNotificacionUsuario, notificacionMensajeDuplicadaReciente } = require('../utils/notificacionInsert');
const {
  obtenerUrlAulaVirtual,
  obtenerUrlExamenActivado,
  inferirUrlApoderadoNotificacion,
  inferirUrlNotificacionFamiliaPorDestinatario,
  urlPublicacionPorTipoUsuario,
  urlMensajesPorTipoUsuario
} = require('../utils/notificacionUrls');
const { notificarComunicadoNuevo } = require('../utils/comunicadosNotificar');
const { enviarCorreoNotificacion, isEmailEnvioHabilitado } = require('../services/emailService');
const mensajesConfig = require('../config/mensajes.json');
const moment = require('moment-timezone');
const { fechaHoraMySQLLima, fechaMySQLLima, horaMySQLLima } = require('../utils/fechaHoraLima');
const {
  ACTIVIDADES_SELECT_SQL,
  ACTIVIDADES_SELECT_CON_EVENTO_SQL,
  normalizarDatetimeMysqlEntrada,
  compararDatetimeMysql,
  esDatetimeMysqlValido
} = require('../utils/actividadesFecha');
const {
  obtenerContextoAlumnoGrupoParaMensaje,
  enriquecerMensajeApoderadoADocente
} = require('../utils/mensajesHijoDocenteContexto');
const {
  obtenerMetaGruposConexiones,
  enriquecerMensajeConexionesFamiliares
} = require('../utils/mensajesGrupoConexionesContexto');
const { fetchUsuariosTutoresGrupos } = require('../utils/grupoTutores');
const { enriquecerMensajeDocenteParaDestinatario } = require('../utils/mensajesDocenteApoderadoContexto');
const { mountSelfServiceCvRoutes } = require('../utils/personalCv');
const {
  pickSaludFields,
  normalizeSaludBody,
  mountAlumnoFichaByIdRoutes
} = require('../utils/alumnoPerfilExtra');
const { fetchPreguntasConAlternativas } = require('../utils/examenPreguntasAlternativas');
const { fetchMatriculaAnioActivoOperativa, sqlExistePagoMatriculaCancelado, personalHijoTieneMatriculaAnioActivoOperativa, MENSAJE_SIN_MATRICULA } = require('../utils/matriculaAnioActivo');
const { maxCuadrosConNotaEnCriterio } = require('../utils/indicadoresPlantillaService');
const { tryInsertPushCronDedup, fechaLimaYmd } = require('../utils/pushCronDedup');
const { normalizarUrlsImagenesEnHtml, urlArchivoMensajeStatic } = require('../utils/mensajesHtml');
const { staticFsSubdir, joinStaticFs, getPublicStaticBaseUrl, urlStaticFotos } = require('../utils/staticStorage');
const { resolverTemaDestinoId } = require('../utils/copiarContenidoAsignatura');
const { buildArchivoPdfUrl, esExamenTipoPdf } = require('../utils/examenArchivoPdfUrl');
const { findAlternativaMarcadaVF } = require('../utils/examenRespuestaIds');
const { assertDocentePuedeEditarContenidoExamenVirtual, examenBloqueaEdicionContenidoDocente } = require('../utils/examenBloqueoEdicionContenido');
const {
  fetchRangosCiclosParsed,
  contarInasistenciasBimestre,
  contarTardanzasBimestre,
} = require('../utils/libretaResumenBimestres');
const { obtenerRangosLetrasColegio } = require('../utils/rangosLetrasColegio');
const { fetchNotasTodosGrupoData } = require('../utils/notasTodosGrupoData');
const {
  listarAlumnosRecomendacionesPorGrupo,
  guardarRecomendacionesPorGrupo,
} = require('../utils/recomendacionesGrupoMatriculas');
const {
  calcularTardanzasMesPersonal,
  calcTardanza,
  DESCUENTO_POR_MINUTO,
} = require('../utils/adminTardanzasHuellero');
const {
  listarAlumnosConductaPorGrupo,
  guardarConductaPorGrupo,
} = require('../utils/conductaGrupoMatriculas');
const { esCompletarCorrecto } = require('../utils/examenCompletar');
const { finalizarPruebaConCalificacion } = require('../utils/examenFinalizarPrueba');
const {
  programarCierreIntentosPendientesExamen,
  MOTIVO: MOTIVO_CIERRE_EXAMEN,
} = require('../utils/examenCerrarIntentosPendientes');
const {
  fetchAsignaturasLibretaConArea,
  fetchAreasLibretaConAsignaturas,
  dedupeAsignaturasPorId,
  filtrarAsignaturasDeArea
} = require('../utils/libretaCuantitativaAreas');
const { lineaAlumnoGrado, etiquetaGradoGrupo } = require('../utils/notificacionExamenApoderadoTexto');
const { listarDeudoresGrupo, mergeObservacionesTutor } = require('../utils/tutorDeudoresService');
const {
  fetchAsignaturaConAcceso,
  fetchExamenConAcceso,
  fetchResultadoPruebaConAcceso,
  fetchPreguntaExamenConAcceso,
  fetchAlternativaExamenConAcceso,
  fetchTareaConAcceso,
  fetchSesionConAcceso,
  esStaffColegio,
} = require('../utils/asignaturaAcceso');
const { verificarAccesoAlumnoHijoDocente } = require('../utils/accesoAlumnoHijoDocente');

/** Administrador o Promotoría: mismos permisos en módulos compartidos (comunicados, actividades, mensajes vía router docente). */
function esAdminOPromotoria(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

/** Gate común para /hijos/:hijoId/* (docente-apoderado o staff del colegio). */
async function gateAlumnoHijoDocente(req, res, hijoId) {
  const hijoIdNum = parseInt(hijoId, 10);
  if (!hijoId || Number.isNaN(hijoIdNum)) {
    res.status(400).json({ error: 'ID de alumno inválido' });
    return null;
  }
  const acc = await verificarAccesoAlumnoHijoDocente(req, hijoIdNum);
  if (!acc.ok) {
    res.status(acc.status || 403).json({ error: acc.error });
    return null;
  }
  return { hijoIdNum, ...acc };
}

/** Docente titular o staff (admin/promotoría) con asignatura en el colegio y año activo. */
async function verificarAccesoAsignatura(
  req,
  res,
  asignaturaId,
  selectSql = 'a.*',
  errorMsg = 'No tienes acceso a este curso'
) {
  const row = await fetchAsignaturaConAcceso(query, req, asignaturaId, selectSql);
  if (!row) {
    res.status(403).json({ error: errorMsg });
    return null;
  }
  return row;
}

function trabajadorIdParaAsignatura(req, asignaturaRow) {
  if (esAdminOPromotoria(req.user?.tipo)) {
    const tid = parseInt(asignaturaRow?.personal_id, 10);
    if (Number.isFinite(tid) && tid > 0) return tid;
  }
  const pid = parseInt(req.user?.personal_id, 10);
  if (Number.isFinite(pid) && pid > 0) return pid;
  return parseInt(asignaturaRow?.personal_id, 10) || 0;
}

async function verificarAccesoTemaArchivo(req, res, temaId) {
  const id = parseInt(temaId, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID de tema inválido' });
    return null;
  }
  const rows = await query(`SELECT aa.* FROM asignaturas_archivos aa WHERE aa.id = ?`, [id]);
  if (!rows?.length) {
    res.status(404).json({ error: 'Tema no encontrado o sin permisos' });
    return null;
  }
  const asignatura = await verificarAccesoAsignatura(
    req,
    res,
    rows[0].asignatura_id,
    'a.*',
    'No tienes acceso a esta asignatura'
  );
  if (!asignatura) return null;
  return { tema: rows[0], asignatura };
}

/** Tarea/proyecto del aula virtual: titular o staff (admin/promotoría) en colegio y año activo. */
async function verificarAccesoTarea(
  req,
  res,
  tareaId,
  selectSql = 't.*',
  errorMsg = 'Tarea no encontrada o sin permisos',
  statusCode = 404,
  extraJoins = ''
) {
  const row = await fetchTareaConAcceso(query, req, tareaId, selectSql, extraJoins);
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Sesión PDF del aula virtual: titular o staff (admin/promotoría) en colegio y año activo. */
async function verificarAccesoSesion(
  req,
  res,
  sesionId,
  selectSql = 's.*',
  errorMsg = 'Sesión no encontrada',
  statusCode = 404,
  extraJoins = ''
) {
  const row = await fetchSesionConAcceso(query, req, sesionId, selectSql, extraJoins);
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Examen del aula virtual: titular o staff (admin/promotoría) en colegio y año activo. */
async function verificarAccesoExamen(
  req,
  res,
  examenId,
  selectSql = 'ae.*',
  errorMsg = 'No tienes acceso a este examen',
  statusCode = 403,
  extraJoins = ''
) {
  const row = await fetchExamenConAcceso(query, req, examenId, selectSql, extraJoins);
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Resultado de prueba de examen: mismo criterio que verificarAccesoExamen. */
async function verificarAccesoResultadoPrueba(
  req,
  res,
  resultadoId,
  selectSql = 'aep.*',
  errorMsg = 'No tienes acceso a este resultado',
  statusCode = 403,
  extraJoins = ''
) {
  const row = await fetchResultadoPruebaConAcceso(
    query,
    req,
    resultadoId,
    selectSql,
    extraJoins
  );
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Pregunta de examen virtual: mismo criterio que verificarAccesoExamen. */
async function verificarAccesoPreguntaExamen(
  req,
  res,
  preguntaId,
  selectSql = 'ep.*, ae.asignatura_id, ep.examen_id',
  errorMsg = 'No tienes acceso a esta pregunta',
  statusCode = 403
) {
  const row = await fetchPreguntaExamenConAcceso(query, req, preguntaId, selectSql);
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Alternativa de pregunta de examen virtual: mismo criterio que verificarAccesoExamen. */
async function verificarAccesoAlternativaExamen(
  req,
  res,
  alternativaId,
  selectSql = 'aa.*, ep.examen_id, aa.pregunta_id',
  errorMsg = 'No tienes acceso a esta alternativa',
  statusCode = 403
) {
  const row = await fetchAlternativaExamenConAcceso(query, req, alternativaId, selectSql);
  if (!row) {
    res.status(statusCode).json({ error: errorMsg });
    return null;
  }
  return row;
}

/** Admin, Promotoría o Psicóloga: listado de grupos del año y publicaciones con alcance de colegio (misma regla que admin en feed). */
function esAdminPromotoriaOpsicologa(tipo) {
  return esAdminOPromotoria(tipo) || tipo === 'PSICOLOGA';
}

/** PSICOLOGA: solo rutas de comunicación, agenda, mensajería y documentos de gestión (misma API que docente donde aplica). */
function psicologaRutaDocentePermitida(path) {
  const prefixes = [
    '/comunicados',
    '/actividades',
    '/mensajes',
    '/documentos-gestion',
    '/roles-adicionales',
    '/publicaciones',
    '/grupos',
    '/alumnos'
  ];
  return prefixes.some((pre) => path === pre || path.startsWith(`${pre}/`));
}

/** enrollment_incidents.assignment_id cuando el registro es del tutor (no hay asignatura) */
const ASSIGNMENT_ID_TUTORIA = -102;

/**
 * Staff de colegio o docente con asignatura en el grupo o tutor del grupo (misma idea que mensajes-historial).
 * @returns {Promise<{ ok: true, anioEsc: number } | { ok: false, status: number, error: string }>}
 */
async function assertAccesoReporteGrupoGeneral(req, grupoId) {
  const { colegio_id, anio_activo, tipo } = req.user;
  if (!grupoId || !colegio_id || !anio_activo) {
    return { ok: false, status: 400, error: 'Parámetros requeridos' };
  }
  const esStaffColegio =
    esAdminOPromotoria(tipo) || tipo === 'PSICOLOGA' || tipo === 'SECRETARIA';

  if (esStaffColegio) {
    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [grupoId, colegio_id, anio_activo]
    );
    if (!gRow.length) return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
    return { ok: true, anioEsc: Number(gRow[0].anio) };
  }

  const personalId = req.user.personal_id;
  if (!personalId) return { ok: false, status: 404, error: 'Docente no encontrado' };

  const tieneAccesoAsignatura = await query(
    `SELECT 1 FROM asignaturas a
     INNER JOIN grupos g ON g.id = a.grupo_id
     WHERE a.personal_id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [personalId, grupoId, colegio_id, anio_activo]
  );
  const esTutorDelGrupo = await query(
    `SELECT 1 FROM grupos g
     WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [grupoId, personalId, personalId, colegio_id, anio_activo]
  );

  if (!tieneAccesoAsignatura?.length && !esTutorDelGrupo?.length) {
    const esTutoriaGeneral = await esTutoriaGeneralUsuario(req);
    if (!esTutoriaGeneral) {
      return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
    }
  }

  const gRow = await query(
    `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
    [grupoId, colegio_id, anio_activo]
  );
  if (!gRow.length) return { ok: false, status: 403, error: 'No tienes acceso a este grupo' };
  return { ok: true, anioEsc: Number(gRow[0].anio) };
}

/**
 * IDs de grupos para publicaciones: unión de grupos con asignatura + grupos donde es tutor (sin duplicar id).
 */
async function obtenerGruposIdsAlcancePublicaciones(colegio_id, anio_activo, personalId) {
  const gruposAsignados = await query(
    `SELECT DISTINCT g.id
     FROM grupos g
     INNER JOIN asignaturas a ON a.grupo_id = g.id
     WHERE a.personal_id = ? AND g.colegio_id = ? AND g.anio = ?`,
    [personalId, colegio_id, anio_activo]
  );
  const gruposTutoria = await query(
    `SELECT g.id FROM grupos g
     WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
    [personalId, personalId, colegio_id, anio_activo]
  );
  const ids = new Set([
    ...gruposAsignados.map((g) => g.id),
    ...gruposTutoria.map((g) => g.id)
  ]);
  return Array.from(ids);
}

function ordenarGruposDocenteLista(grupos) {
  const ordenNivel = { Inicial: 0, Primaria: 1, Secundaria: 2 };
  return [...(grupos || [])].sort((a, b) => {
    const nivA = ordenNivel[a.nivel_nombre] ?? (a.nivel_id != null ? Number(a.nivel_id) : 999);
    const nivB = ordenNivel[b.nivel_nombre] ?? (b.nivel_id != null ? Number(b.nivel_id) : 999);
    if (nivA !== nivB) return nivA - nivB;
    const gradA = a.grado != null ? Number(a.grado) : 0;
    const gradB = b.grado != null ? Number(b.grado) : 0;
    if (gradA !== gradB) return gradA - gradB;
    return String(a.seccion || '').localeCompare(String(b.seccion || ''), undefined, { sensitivity: 'base', numeric: true });
  });
}

/**
 * Une grupos docente (asignatura) y tutoría sin duplicar por g.id (misma aula como tutor y docente = una fila, prioriza tipo asignado).
 */
function mergeGruposDocenteSinDuplicar(gruposAsignados, gruposTutoria) {
  const byId = new Map();
  for (const g of gruposAsignados || []) {
    byId.set(g.id, { ...g, tipo_grupo: 'asignado' });
  }
  for (const g of gruposTutoria || []) {
    if (!byId.has(g.id)) {
      byId.set(g.id, { ...g, tipo_grupo: 'tutoria' });
    }
  }
  return Array.from(byId.values());
}

function normalizarTextoComparacionNotificacion(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function construirMensajeFamiliaConAlumnoYGrupo(base, row) {
  const mensajeBase = String(base || '').trim();
  if (!mensajeBase || !row) return mensajeBase;

  const alumnoNombre = String(row.alumno_nombre || row.nombre_completo_alumno || '')
    .replace(/\s+/g, ' ')
    .trim();
  const grupoTexto = etiquetaGradoGrupo(row);
  const baseNormalizada = normalizarTextoComparacionNotificacion(mensajeBase);
  const yaIncluyeAlumno =
    alumnoNombre && baseNormalizada.includes(normalizarTextoComparacionNotificacion(alumnoNombre));
  const yaIncluyeGrupo =
    grupoTexto && baseNormalizada.includes(normalizarTextoComparacionNotificacion(grupoTexto));

  if (yaIncluyeAlumno && (!grupoTexto || yaIncluyeGrupo)) {
    return mensajeBase;
  }

  const lineaContexto = lineaAlumnoGrado({
    alumno_nombre: alumnoNombre,
    grado: row.grado,
    seccion: row.seccion,
    nivel_nombre: row.nivel_nombre,
  });

  return lineaContexto ? `${lineaContexto} — ${mensajeBase}` : mensajeBase;
}

/**
 * Función auxiliar para crear notificaciones de Aula Virtual
 * @param {Object} params - Parámetros de la notificación
 * @param {number} params.asignatura_id - ID de la asignatura
 * @param {string} params.tipo - Tipo de contenido: 'tema', 'tarea', 'examen', 'video', 'enlace'
 * @param {string} params.nombre - Nombre/título del contenido
 * @param {number} params.usuario_id - ID del usuario que crea (docente)
 * @param {number} params.colegio_id - ID del colegio
 * @param {number} params.anio_activo - Año activo
 * @param {string} params.docente_nombre - Nombre del docente (opcional, se obtiene si no se proporciona)
 * @param {string} params.fecha_entrega - Fecha de entrega (solo para tareas)
 * @param {number} params.entidad_id - ID de la entidad creada (tema/tarea/examen/video/enlace)
 */
async function crearNotificacionesAulaVirtual(params) {
  const { asignatura_id, tipo, nombre, usuario_id, colegio_id, anio_activo, docente_nombre, fecha_entrega, entidad_id } = params;
  
  try {
    console.log(`📚 [AULA VIRTUAL] Iniciando notificaciones para ${tipo}: "${nombre}"`);
    
    // Obtener información de la asignatura (grupo y curso)
    const asignaturaInfo = await query(
      `SELECT a.grupo_id, a.curso_id, c.nombre as curso_nombre,
              g.grado, g.seccion, COALESCE(n.nombre, '') as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [asignatura_id, colegio_id]
    );
    
    if (asignaturaInfo.length === 0) {
      console.error(`❌ [AULA VIRTUAL] Asignatura ${asignatura_id} no encontrada`);
      return;
    }
    
    const { grupo_id, curso_nombre, docente_nombre_completo, grado, seccion, nivel_nombre } = asignaturaInfo[0];
    const nombreDocente = docente_nombre || docente_nombre_completo || 'Un docente';
    const grupoTexto = etiquetaGradoGrupo({ grado, seccion, nivel_nombre });
    const prefijoCursoGrupo = [
      `Curso: ${curso_nombre}`,
      grupoTexto ? `Grupo: ${grupoTexto}` : null
    ].filter(Boolean).join(' - ');
    
    // Preparar título y mensaje según el tipo
    let tituloNotificacion = '';
    let mensajeNotificacion = '';
    
    switch (tipo) {
      case 'tema':
        tituloNotificacion = 'Nuevo Tema';
        mensajeNotificacion = `${prefijoCursoGrupo} - Tema: ${nombre} - Docente: ${nombreDocente}`;
        break;
      case 'tarea':
        tituloNotificacion = 'Nuevo Proyecto';
        const fechaEntregaTexto = fecha_entrega ? ` - Fecha de entrega: ${fecha_entrega}` : '';
        mensajeNotificacion = `${prefijoCursoGrupo} - Docente: ${nombreDocente}${fechaEntregaTexto}`;
        break;
      case 'examen':
        tituloNotificacion = 'Nuevo Examen';
        mensajeNotificacion = `${prefijoCursoGrupo} - Docente: ${nombreDocente}`;
        break;
      case 'video':
        tituloNotificacion = 'Nuevo Video';
        mensajeNotificacion = `${prefijoCursoGrupo} - Docente: ${nombreDocente}`;
        break;
      case 'enlace':
        tituloNotificacion = 'Nuevo Enlace de Ayuda';
        mensajeNotificacion = `${prefijoCursoGrupo} - Docente: ${nombreDocente}`;
        break;
      default:
        tituloNotificacion = 'Nueva Actividad';
        mensajeNotificacion = `${prefijoCursoGrupo} - Docente: ${nombreDocente}`;
    }
    
    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0)
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [grupo_id, colegio_id, colegio_id]
    );
    
    const alumnoIds = alumnos.map(a => a.alumno_id);
    const alumnoUsuarioIds = alumnos.map(a => a.usuario_id);
    
    // Obtener apoderados de esos alumnos
    let apoderadoUsuarioIds = [];
    if (alumnoIds.length > 0) {
      const apoderados = await query(
        `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
         FROM apoderados ap
         INNER JOIN familias f ON f.apoderado_id = ap.id
         INNER JOIN usuarios u ON u.apoderado_id = ap.id
         WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
           AND ap.colegio_id = ?
           AND u.colegio_id = ?
           AND u.estado = 'ACTIVO'`,
        [...alumnoIds, colegio_id, colegio_id]
      );
      apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
      
      // Obtener DNI de apoderados para buscar docentes-apoderados
      const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
      
      if (apoderadoDnis.length > 0) {
        // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
        const docentesApoderados = await query(
          `SELECT DISTINCT u.id 
           FROM usuarios u
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE u.colegio_id = ? 
             AND u.estado = 'ACTIVO'
             AND u.tipo = 'DOCENTE'
             AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                  OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
             AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`, // Evitar duplicados
          [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
        );
        
        const docentesApoderadosIds = docentesApoderados.map(u => u.id);
        apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
        
        if (docentesApoderadosIds.length > 0) {
          console.log(`📚 [AULA VIRTUAL] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
        }
      }
    }
    
    // Combinar todos los destinatarios (alumnos + apoderados + docentes-apoderados)
    const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];
    const mapaPadreAlumnos = new Map();
    const apoderadoUsuarioIdSet = new Set(
      apoderadoUsuarioIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n))
    );

    const registrarAlumnoPadre = (padreId, alumnoNombre) => {
      const uid = parseInt(padreId, 10);
      const nombreAlumno = String(alumnoNombre || '').replace(/\s+/g, ' ').trim();
      if (Number.isNaN(uid) || !nombreAlumno) return;
      if (!mapaPadreAlumnos.has(uid)) mapaPadreAlumnos.set(uid, new Set());
      mapaPadreAlumnos.get(uid).add(nombreAlumno);
    };

    if (alumnoIds.length > 0 && apoderadoUsuarioIds.length > 0) {
      const phAl = alumnoIds.map(() => '?').join(',');
      try {
        const rowsApod = await query(
          `SELECT u.id AS padre_usuario_id,
                  TRIM(CONCAT(COALESCE(a.nombres,''),' ',COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''))) AS alumno_nombre
           FROM matriculas m
           INNER JOIN alumnos a ON a.id = m.alumno_id
           INNER JOIN familias f ON f.alumno_id = a.id
           INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
           INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
           WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
             AND a.id IN (${phAl})`,
          [colegio_id, colegio_id, grupo_id, colegio_id, ...alumnoIds]
        );
        for (const r of rowsApod || []) {
          registrarAlumnoPadre(r.padre_usuario_id, r.alumno_nombre);
        }

        const rowsDocApod = await query(
          `SELECT DISTINCT u.id AS padre_usuario_id,
                  TRIM(CONCAT(COALESCE(a.nombres,''),' ',COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''))) AS alumno_nombre
           FROM matriculas m
           INNER JOIN alumnos a ON a.id = m.alumno_id
           INNER JOIN familias f ON f.alumno_id = a.id
           INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
           INNER JOIN usuarios u ON u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
             AND a.id IN (${phAl})
             AND ap.nro_documento IS NOT NULL AND TRIM(ap.nro_documento) <> ''
             AND (p.nro_documento = ap.nro_documento OR TRIM(u.usuario) = TRIM(ap.nro_documento))`,
          [colegio_id, colegio_id, grupo_id, colegio_id, ...alumnoIds]
        );
        for (const r of rowsDocApod || []) {
          registrarAlumnoPadre(r.padre_usuario_id, r.alumno_nombre);
        }
      } catch (eMap) {
        console.error('❌ [AULA VIRTUAL] Error construyendo contexto apoderado/hijo:', eMap);
      }
    }

    let tipoPorDestinatario = new Map();
    if (todosDestinatarios.length > 0) {
      const phDest = todosDestinatarios.map(() => '?').join(',');
      const tiposRows = await query(
        `SELECT id, tipo, alumno_id FROM usuarios WHERE id IN (${phDest}) AND colegio_id = ?`,
        [...todosDestinatarios.map((id) => parseInt(id, 10)), colegio_id]
      );
      tipoPorDestinatario = new Map(
        (tiposRows || []).map((r) => [parseInt(r.id, 10), { tipo: r.tipo, alumno_id: r.alumno_id }])
      );
    }

    const construirMensajeAulaVirtualDestinatario = (destinatarioIdNum, tipoUsuario) => {
      if (tipoUsuario === 'ALUMNO') return mensajeNotificacion;
      if (!apoderadoUsuarioIdSet.has(destinatarioIdNum)) return mensajeNotificacion;
      const nombresRelacionados = mapaPadreAlumnos.get(destinatarioIdNum);
      if (!nombresRelacionados || nombresRelacionados.size === 0) return mensajeNotificacion;
      const alumnosTexto = Array.from(nombresRelacionados.values()).join(', ');
      if (!alumnosTexto) return mensajeNotificacion;
      const prefijoAlumno =
        nombresRelacionados.size > 1
          ? `Alumnos/as: ${alumnosTexto}`
          : `Alumno/a: ${alumnosTexto}`;
      return `${prefijoAlumno} — ${mensajeNotificacion}`;
    };
    
    console.log(`📚 [AULA VIRTUAL] Encontrados ${todosDestinatarios.length} destinatarios (${alumnoUsuarioIds.length} alumnos, ${apoderadoUsuarioIds.length} apoderados incluyendo docentes)`);
    
    // Crear notificaciones en la BD (deep link por destinatario)
    if (todosDestinatarios.length > 0) {
      for (const destinatarioId of todosDestinatarios) {
        try {
          const destinatarioIdNum = parseInt(destinatarioId, 10);
          const urlDestino = await obtenerUrlAulaVirtual(query, destinatarioId, {
            asignatura_id,
            grupo_id,
            recurso_tipo: tipo,
            recurso_id: entidad_id
          });
          const u0 = tipoPorDestinatario.get(destinatarioIdNum) || {};
          const mensajeDestinatario = construirMensajeAulaVirtualDestinatario(destinatarioIdNum, u0.tipo);
          const accion_payload = {
            asignatura_id,
            grupo_id,
            recurso_tipo: tipo,
            recurso_id: entidad_id,
            ...(u0.tipo === 'ALUMNO' && u0.alumno_id ? { alumno_id: u0.alumno_id } : {})
          };
          await insertNotificacionUsuario(execute, {
            usuario_id,
            destinatario_id: destinatarioId,
            asunto: tituloNotificacion,
            contenido: mensajeDestinatario,
            estado: 'NO ENVIADO',
            accion_tipo: `aula_virtual_${tipo}`,
            accion_payload,
            url_destino: urlDestino
          });
        } catch (error) {
          console.error(`❌ [AULA VIRTUAL] Error creando notificación para usuario ${destinatarioId}:`, error);
        }
      }
      
      console.log(`✅ [AULA VIRTUAL] ${todosDestinatarios.length} notificaciones creadas en BD`);
      
      // Enviar push notifications
      if (todosDestinatarios.length > 0) {
        const subscriptionsData = await query(
          `SELECT usuario_id, endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...todosDestinatarios, colegio_id]
        );
        
        if (subscriptionsData.length > 0) {
          const baseTag = `aula-virtual-${tipo}-${entidad_id || Date.now()}`;
          const pushItems = [];
          for (const sub of subscriptionsData) {
            const uid = parseInt(sub.usuario_id, 10);
            const uMeta = tipoPorDestinatario.get(uid) || {};
            const urlPush = await obtenerUrlAulaVirtual(query, sub.usuario_id, {
              asignatura_id,
              grupo_id,
              recurso_tipo: tipo,
              recurso_id: entidad_id
            });
            const bodyPush = construirMensajeAulaVirtualDestinatario(uid, uMeta.tipo);
            pushItems.push({
              subscription: {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              },
              payload: {
                title: tituloNotificacion,
                body: bodyPush,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                tag: baseTag,
                data: {
                  url: urlPush,
                  tipo: `aula_virtual_${tipo}`,
                  asignatura_id,
                  entidad_id
                }
              }
            });
          }
          
          console.log(`📱 [AULA VIRTUAL] Enviando ${pushItems.length} push notifications...`);
          
          enviarPushNotificacionesIndividuales(pushItems)
            .then(resultadosPush => {
              const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
              const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
              console.log(`✅ [AULA VIRTUAL] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
            })
            .catch(err => {
              console.error(`❌ [AULA VIRTUAL] Error en envío de push notifications:`, err);
            });
        } else {
          console.log('⚠️ [AULA VIRTUAL] No hay suscripciones push activas para enviar notificaciones');
        }
        
        // Correos deshabilitados para Crear Tema/Tarea/Examen/Videoteca/Enlace (solo push)
      }
    } else {
      console.log('⚠️ [AULA VIRTUAL] No se encontraron destinatarios para notificar');
    }
  } catch (error) {
    console.error(`❌ [AULA VIRTUAL] Error en proceso de notificaciones:`, error);
    console.error(`❌ [AULA VIRTUAL] Stack:`, error.stack);
  }
}

/**
 * Función auxiliar para crear notificaciones a apoderados de un alumno específico
 * Incluye apoderados normales y docentes que también son apoderados
 * @param {Object} params - Parámetros de la notificación
 * @param {number} params.alumno_id - ID del alumno
 * @param {number} params.usuario_id - ID del usuario que crea (docente)
 * @param {number} params.colegio_id - ID del colegio
 * @param {number} params.anio_activo - Año activo
 * @param {string} params.tituloNotificacion - Título de la notificación
 * @param {string} params.mensajeNotificacion - Mensaje de la notificación
 * @param {string} params.tipoNotificacion - Tipo de notificación (para el tag y data)
 * @param {Object} params.dataExtra - Datos extra para el payload push (opcional)
 */
async function crearNotificacionesApoderados(params) {
  const {
    alumno_id,
    usuario_id,
    colegio_id,
    anio_activo,
    tituloNotificacion,
    mensajeNotificacion,
    tipoNotificacion,
    dataExtra = {},
    url_destino: urlDestinoParam = null,
    /** Solo inserta Mensajes internos (`mensajes`) sin campanitas/push/email (p. ej. si el examen aún no publica nota en campanita). */
    soloMensajesInternos = false,
    /** Comprobante en bandeja Mensajes para apoderados y docentes–apoderado (dos filas por destinatario: ENVIADO/RECIBIDO). */
    mensajeInterno = null
  } = params;
  
  try {
    // Asegurar que alumno_id sea un número
    const alumnoIdNum = parseInt(alumno_id);
    if (isNaN(alumnoIdNum)) {
      console.error(`❌ [NOTIFICACIONES APODERADOS] alumno_id inválido: ${alumno_id}`);
      return;
    }
    
    console.log(`📢 [NOTIFICACIONES APODERADOS] Iniciando notificaciones para alumno ID: ${alumnoIdNum} (colegio: ${colegio_id})`);
    console.log(`📢 [NOTIFICACIONES APODERADOS] Parámetros:`, { tituloNotificacion, tipoNotificacion });
    
    // Obtener usuario del alumno
    const alumnoUsuario = await query(
      `SELECT u.id as usuario_id, a.id as alumno_id
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE a.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [alumnoIdNum, colegio_id]
    );
    
    if (alumnoUsuario.length === 0) {
      console.log(`⚠️ [NOTIFICACIONES APODERADOS] No se encontró usuario activo para el alumno ID: ${alumnoIdNum}`);
      return;
    }
    
    const alumnoUsuarioId = alumnoUsuario[0].usuario_id;
    console.log(`✅ [NOTIFICACIONES APODERADOS] Usuario del alumno encontrado: ${alumnoUsuarioId}`);

    let mensajeNotificacionFinal = String(mensajeNotificacion || '').trim();
    try {
      const alumnoCtxRows = await query(
        `SELECT
           TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))) AS alumno_nombre,
           g.grado,
           g.seccion,
           COALESCE(n.nombre, '') AS nivel_nombre
         FROM alumnos a
         LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0)
         LEFT JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE a.id = ? AND a.colegio_id = ?
         ORDER BY (g.id IS NULL) ASC, m.fecha_registro DESC
         LIMIT 1`,
        [anio_activo, alumnoIdNum, colegio_id]
      );
      mensajeNotificacionFinal = construirMensajeFamiliaConAlumnoYGrupo(
        mensajeNotificacion,
        alumnoCtxRows && alumnoCtxRows[0] ? alumnoCtxRows[0] : null
      );
    } catch (ctxErr) {
      console.error('❌ [NOTIFICACIONES APODERADOS] Error obteniendo contexto alumno/grupo:', ctxErr);
    }
    
    // Obtener apoderados del alumno
    let apoderadoUsuarioIds = [];
    const apoderados = await query(
      `SELECT DISTINCT u.id as usuario_id, ap.nro_documento, ap.nombres, ap.apellido_paterno
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE f.alumno_id = ?
         AND ap.colegio_id = ?
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [alumnoIdNum, colegio_id, colegio_id]
    );
    
    console.log(`📋 [NOTIFICACIONES APODERADOS] Apoderados encontrados: ${apoderados.length}`);
    if (apoderados.length > 0) {
      apoderados.forEach((ap, idx) => {
        console.log(`   ${idx + 1}. Usuario ID: ${ap.usuario_id}, DNI: ${ap.nro_documento || 'N/A'}, Nombre: ${ap.nombres} ${ap.apellido_paterno}`);
      });
    } else {
      console.log(`⚠️ [NOTIFICACIONES APODERADOS] No se encontraron apoderados para el alumno ID: ${alumnoIdNum}`);
      console.log(`   Verificando si existe relación en familias...`);
      // Verificar si hay familias relacionadas
      const familiasCheck = await query(
        `SELECT f.* FROM familias f WHERE f.alumno_id = ?`,
        [alumnoIdNum]
      );
      console.log(`   Familias encontradas: ${familiasCheck.length}`);
      if (familiasCheck.length > 0) {
        familiasCheck.forEach((f, idx) => {
          console.log(`   Familia ${idx + 1}: apoderado_id=${f.apoderado_id}`);
        });
      }
    }
    
    apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
    
    // Obtener DNI de apoderados para buscar docentes-apoderados
    const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni && dni !== null && dni !== undefined && dni !== '');
    console.log(`📋 [NOTIFICACIONES APODERADOS] DNIs de apoderados para buscar docentes: ${apoderadoDnis.length}`);
    
    if (apoderadoDnis.length > 0) {
      // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
      try {
        // Construir la consulta SQL dinámicamente
        const placeholdersDni = apoderadoDnis.map(() => '?').join(',');
        let sqlQuery = `SELECT DISTINCT u.id 
         FROM usuarios u
         INNER JOIN personal p ON p.id = u.personal_id
         WHERE u.colegio_id = ? 
           AND u.estado = 'ACTIVO'
           AND u.tipo = 'DOCENTE'
           AND (p.nro_documento IN (${placeholdersDni}) 
                OR u.usuario IN (${placeholdersDni}))`;
        
        const queryParams = [colegio_id];
        queryParams.push(...apoderadoDnis); // Para p.nro_documento IN
        queryParams.push(...apoderadoDnis); // Para u.usuario IN
        
        // Solo agregar NOT IN si hay IDs para excluir
        if (apoderadoUsuarioIds.length > 0) {
          const placeholdersExclude = apoderadoUsuarioIds.map(() => '?').join(',');
          sqlQuery += ` AND u.id NOT IN (${placeholdersExclude})`;
          queryParams.push(...apoderadoUsuarioIds);
        }
        
        console.log(`🔍 [NOTIFICACIONES APODERADOS] Ejecutando consulta para docentes-apoderados`);
        console.log(`🔍 [NOTIFICACIONES APODERADOS] Placeholders DNI: ${placeholdersDni}`);
        console.log(`🔍 [NOTIFICACIONES APODERADOS] DNIs:`, apoderadoDnis);
        console.log(`🔍 [NOTIFICACIONES APODERADOS] Total parámetros: ${queryParams.length}`);
        console.log(`🔍 [NOTIFICACIONES APODERADOS] Parámetros:`, queryParams);
        
        const docentesApoderados = await query(sqlQuery, queryParams);
        
        const docentesApoderadosIds = docentesApoderados.map(u => u.id);
        apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
        
        if (docentesApoderadosIds.length > 0) {
          console.log(`📚 [NOTIFICACIONES APODERADOS] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
        }
      } catch (error) {
        console.error(`❌ [NOTIFICACIONES APODERADOS] Error buscando docentes-apoderados:`, error);
        console.error(`❌ [NOTIFICACIONES APODERADOS] Error details:`, error.message);
        console.error(`❌ [NOTIFICACIONES APODERADOS] Stack:`, error.stack);
        // Continuar sin docentes-apoderados si hay error
      }
    }
    
    // Solo apoderados y docentes-apoderados (NO incluir al alumno)
    const todosDestinatarios = [...new Set(apoderadoUsuarioIds)];
    
    console.log(`📢 [NOTIFICACIONES APODERADOS] Encontrados ${todosDestinatarios.length} destinatarios (solo apoderados, sin alumno)`);
    console.log(`📋 [NOTIFICACIONES APODERADOS] IDs de destinatarios:`, todosDestinatarios);
    
    // Crear notificaciones en la BD
    if (todosDestinatarios.length > 0) {
      const placeholdersU = todosDestinatarios.map(() => '?').join(',');
      const destTiposRows = await query(
        `SELECT id, tipo FROM usuarios WHERE id IN (${placeholdersU}) AND colegio_id = ?`,
        [...todosDestinatarios.map((id) => parseInt(id, 10)), parseInt(colegio_id, 10)]
      );
      const tipoPorDestinatario = new Map(
        (destTiposRows || []).map((r) => [parseInt(r.id, 10), r.tipo])
      );

      if (!soloMensajesInternos) {
      console.log(`📝 [NOTIFICACIONES APODERADOS] Creando ${todosDestinatarios.length} notificaciones en BD...`);
      for (const destinatarioId of todosDestinatarios) {
        try {
          // Asegurar que todos los valores sean válidos
          const usuarioIdNum = parseInt(usuario_id);
          const destinatarioIdNum = parseInt(destinatarioId);
          
          if (isNaN(usuarioIdNum) || isNaN(destinatarioIdNum) || !tituloNotificacion || !mensajeNotificacionFinal) {
            console.error(`❌ [NOTIFICACIONES APODERADOS] Valores inválidos: usuario_id=${usuario_id}, destinatarioId=${destinatarioId}, titulo=${tituloNotificacion}, mensaje=${mensajeNotificacionFinal}`);
            continue;
          }
          
          const tipoDest = tipoPorDestinatario.get(destinatarioIdNum) || 'APODERADO';
          const urlDestino =
            urlDestinoParam ||
            inferirUrlNotificacionFamiliaPorDestinatario(
              tipoNotificacion,
              dataExtra,
              alumnoIdNum,
              tipoDest
            );
          await insertNotificacionUsuario(execute, {
            usuario_id: usuarioIdNum,
            destinatario_id: destinatarioIdNum,
            asunto: String(tituloNotificacion),
            contenido: String(mensajeNotificacionFinal),
            estado: 'NO ENVIADO',
            accion_tipo: String(tipoNotificacion || 'apoderado'),
            accion_payload: { alumno_id: alumnoIdNum, ...dataExtra },
            url_destino: urlDestino
          });
        } catch (error) {
          console.error(`❌ [NOTIFICACIONES APODERADOS] Error creando notificación para usuario ${destinatarioId}:`, error);
          console.error(`❌ [NOTIFICACIONES APODERADOS] Error details:`, error.message);
        }
      }
      
      console.log(`✅ [NOTIFICACIONES APODERADOS] ${todosDestinatarios.length} notificaciones creadas en BD`);
      }
      
      if (!soloMensajesInternos) {
      // Enviar push notifications
      try {
        const placeholdersDestinatarios = todosDestinatarios.map(() => '?').join(',');
        console.log(`📱 [NOTIFICACIONES APODERADOS] Buscando suscripciones push para ${todosDestinatarios.length} usuarios...`);
        const subscriptionsData = await query(
          `SELECT usuario_id, endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id IN (${placeholdersDestinatarios}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...todosDestinatarios.map(id => parseInt(id)), parseInt(colegio_id)]
        );
        
        if (subscriptionsData.length > 0) {
        const pushItems = subscriptionsData.map((sub) => {
          const uid = parseInt(sub.usuario_id, 10);
          const tipoDestPush = tipoPorDestinatario.get(uid) || 'APODERADO';
          const urlPush =
            urlDestinoParam ||
            inferirUrlNotificacionFamiliaPorDestinatario(
              tipoNotificacion,
              dataExtra,
              alumnoIdNum,
              tipoDestPush
            );
          return {
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload: {
            title: tituloNotificacion,
            body: mensajeNotificacionFinal,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            tag: `${tipoNotificacion}-${alumno_id}-${Date.now()}`,
            data: {
              url: urlPush,
              tipo: tipoNotificacion,
              alumno_id: alumno_id,
              ...dataExtra
            }
          }
        };
        });
        
        console.log(`📱 [NOTIFICACIONES APODERADOS] Enviando ${pushItems.length} push notifications...`);
        
        enviarPushNotificacionesIndividuales(pushItems)
          .then(resultadosPush => {
            const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
            const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
            console.log(`✅ [NOTIFICACIONES APODERADOS] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
          })
          .catch(err => {
            console.error(`❌ [NOTIFICACIONES APODERADOS] Error en envío de push notifications:`, err);
          });
      } else {
        console.log('⚠️ [NOTIFICACIONES APODERADOS] No hay suscripciones push activas para enviar notificaciones');
      }

      // Correo a apoderados:
      // - nota_tarea, examen_finalizado → cuenta GENERAL (principal)
      // - asistencia_manual_* (tutor manual + auto-falta) → cuenta ASISTENCIA
      const tiposConCorreoGENERAL = ['nota_tarea', 'examen_finalizado'];
      const esAsistenciaManual = tipoNotificacion && tipoNotificacion.startsWith('asistencia_manual_');
      const enviarCorreo = tiposConCorreoGENERAL.includes(tipoNotificacion) || esAsistenciaManual;
      const categoriaCorreo = esAsistenciaManual ? 'ASISTENCIA' : 'GENERAL';

      if (enviarCorreo && isEmailEnvioHabilitado()) {
        try {
          const colegioInfo = await query(`SELECT nombre FROM colegios WHERE id = ?`, [colegio_id]);
          const colegioNombre = colegioInfo.length > 0 ? colegioInfo[0].nombre : 'Vanguard Schools';
          const usuariosConEmail = await query(
            `SELECT DISTINCT u.id, COALESCE(ap.email, p.email) as email
             FROM usuarios u
             LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
             LEFT JOIN personal p ON p.id = u.personal_id
             WHERE u.id IN (${todosDestinatarios.map(() => '?').join(',')})
               AND u.colegio_id = ?
               AND COALESCE(ap.email, p.email) IS NOT NULL
               AND TRIM(COALESCE(ap.email, p.email)) != ''`,
            [...todosDestinatarios, colegio_id]
          );
          const emailsUnicos = new Map();
          usuariosConEmail.forEach(u => {
            const email = (u.email || '').toLowerCase().trim();
            if (email && !emailsUnicos.has(email)) emailsUnicos.set(email, u.email);
          });
          let enviadosCorreo = 0;
          for (const email of emailsUnicos.values()) {
            try {
              const res = await enviarCorreoNotificacion(
                email,
                tituloNotificacion,
                mensajeNotificacionFinal,
                colegioNombre,
                categoriaCorreo
              );
              if (res && res.success) enviadosCorreo += 1;
            } catch (err) {
              console.error(`❌ [NOTIFICACIONES APODERADOS] Error correo:`, err);
            }
          }
          if (enviadosCorreo > 0) {
            console.log(
              `📧 [NOTIFICACIONES APODERADOS] Correos enviados: ${enviadosCorreo}/${emailsUnicos.size} (${tipoNotificacion}, cuenta: ${categoriaCorreo})`
            );
          }
        } catch (err) {
          console.error(`❌ [NOTIFICACIONES APODERADOS] Error envío correos:`, err);
        }
      }
      } catch (error) {
        console.error(`❌ [NOTIFICACIONES APODERADOS] Error obteniendo suscripciones push:`, error);
        console.error(`❌ [NOTIFICACIONES APODERADOS] Error details:`, error.message);
      }
      }

      if (
        mensajeInterno &&
        String(mensajeInterno.asunto || '').trim() &&
        String(mensajeInterno.texto || '').trim()
      ) {
        const fh = fechaHoraMySQLLima();
        const remitenteNum = parseInt(usuario_id, 10);
        const asuntoMI = String(mensajeInterno.asunto).slice(0, 500);
        const textoMI = String(mensajeInterno.texto);
        if (!isNaN(remitenteNum)) {
          for (const destinatarioId of todosDestinatarios) {
            const did = parseInt(destinatarioId, 10);
            if (isNaN(did) || did === remitenteNum) continue;
            try {
              await execute(
                `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
                 VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
                [remitenteNum, did, asuntoMI, textoMI, fh]
              );
              await execute(
                `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
                 VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
                [remitenteNum, did, asuntoMI, textoMI, fh]
              );
            } catch (miErr) {
              console.error(
                `[NOTIFICACIONES APODERADOS] Error mensaje interno examen/familia → usuario ${did}:`,
                miErr.message
              );
            }
          }
          console.log(
            `📬 [NOTIFICACIONES APODERADOS] Mensajes internos (bandeja) enviados a ${todosDestinatarios.length} destinatario(s)`
          );
        }

        // Examen con nota oculta en campanita: aviso por push + campanita hacia Mensajes (sustituye correo)
        if (soloMensajesInternos) try {
          const tituloBell =
            (mensajeInterno && String(mensajeInterno.asunto || '').trim()) ||
            String(tituloNotificacion || 'Comprobante de examen');
          const contenidoBell =
            'Revise Mensajes para ver el comprobante del examen (la nota puede estar pendiente según el docente).';
          const usuarioIdNum = parseInt(usuario_id, 10);

          for (const destinatarioId of todosDestinatarios) {
            const destinatarioIdNum = parseInt(destinatarioId, 10);
            if (isNaN(destinatarioIdNum) || isNaN(usuarioIdNum)) continue;
            const tipoDest = tipoPorDestinatario.get(destinatarioIdNum) || 'APODERADO';
            const urlMensajes = urlMensajesPorTipoUsuario(tipoDest);
            try {
              await insertNotificacionUsuario(execute, {
                usuario_id: usuarioIdNum,
                destinatario_id: destinatarioIdNum,
                asunto: String(tituloBell).slice(0, 200),
                contenido: contenidoBell,
                estado: 'NO ENVIADO',
                accion_tipo: 'mensaje_comprobante_examen',
                accion_payload: { alumno_id: alumnoIdNum, ...dataExtra },
                url_destino: urlMensajes
              });
            } catch (bellEx) {
              console.warn(
                `[NOTIFICACIONES APODERADOS] Campanita comprobante examen → ${destinatarioIdNum}:`,
                bellEx.message
              );
            }
          }

          const subscriptionsSoloMi = await query(
            `SELECT usuario_id, endpoint, p256dh, auth
             FROM push_subscriptions
             WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')})
               AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
            [...todosDestinatarios.map((id) => parseInt(id, 10)), parseInt(colegio_id, 10)]
          );
          if ((subscriptionsSoloMi || []).length > 0) {
            const bodyPush = contenidoBell.substring(0, 160);
            const pushSoloMi = subscriptionsSoloMi.map((sub) => {
              const uid = parseInt(sub.usuario_id, 10);
              const tipoDestPush = tipoPorDestinatario.get(uid) || 'APODERADO';
              return {
                subscription: {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth }
                },
                payload: {
                  title: String(tituloBell).slice(0, 80),
                  body: bodyPush,
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/icon-192x192.png',
                  vibrate: [200, 100, 200],
                  tag: `examen-comprobante-${alumnoIdNum}-${uid}`,
                  data: {
                    url: urlMensajesPorTipoUsuario(tipoDestPush),
                    tipo: 'mensaje_comprobante_examen',
                    alumno_id: alumnoIdNum,
                    ...dataExtra
                  }
                }
              };
            });
            enviarPushNotificacionesIndividuales(pushSoloMi)
              .then((res) => {
                const ok = res.filter((r) => r.resultado && r.resultado.success).length;
                console.log(
                  `📱 [NOTIFICACIONES APODERADOS] Push comprobante examen (solo Mensajes): ${ok}/${pushSoloMi.length}`
                );
              })
              .catch((err) =>
                console.error('[NOTIFICACIONES APODERADOS] Error push comprobante examen:', err)
              );
          }
        } catch (soloMiErr) {
          console.error('[NOTIFICACIONES APODERADOS] Error aviso solo Mensajes:', soloMiErr);
        }
      }
    } else {
      console.log('⚠️ [NOTIFICACIONES APODERADOS] No se encontraron destinatarios para notificar');
    }
  } catch (error) {
    console.error(`❌ [NOTIFICACIONES APODERADOS] Error en proceso de notificaciones:`, error);
    console.error(`❌ [NOTIFICACIONES APODERADOS] Stack:`, error.stack);
  }
}

// Configurar multer para subir fotos de personal
const personalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Image/Fotos/ del sistema PHP (compartido con ambos sistemas)
    cb(null, staticFsSubdir('Image', 'Fotos'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `personal-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configurar multer para subir imágenes de publicaciones
const publicacionesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../backend/uploads/publicaciones');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `publicacion-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configurar multer para subir archivos de publicaciones
const archivosStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../backend/uploads/archivos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `archivo-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'));
  }
};

const uploadPersonal = multer({
  storage: personalStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

const uploadPublicaciones = multer({
  storage: publicacionesStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
});

const fileFilterArchivos = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se permiten: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP, RAR'));
  }
};

const uploadArchivos = multer({
  storage: archivosStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilterArchivos
});

// Configurar multer para subir archivos del aula virtual (temas, tareas, exámenes)
const aulaVirtualStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Archivos/ del sistema PHP (compartido con ambos sistemas)
    cb(null, staticFsSubdir('Archivos'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `aula-virtual-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterAulaVirtual = (req, file, cb) => {
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'application/pdf';
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'));
  }
};

const uploadAulaVirtual = multer({
  storage: aulaVirtualStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilterAulaVirtual
});

// Imagen opcional del bloque de contexto del examen (comparte carpeta Static/Archivos con el aula virtual)
const examenBloqueImagenStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, staticFsSubdir('Archivos'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `examen-bloque-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterExamenBloqueImagen = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const okExt = allowedExt.includes(ext);
  const okMime = file.mimetype && file.mimetype.startsWith('image/');
  if (okExt && okMime) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
};

const uploadExamenBloqueImagen = multer({
  storage: examenBloqueImagenStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: fileFilterExamenBloqueImagen
});

// Configurar multer para subir archivos de mensajes
const mensajesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Archivos/ del sistema PHP (compartido con ambos sistemas)
    // Si es imagen, podría ir a Static/Image/Mensajes/, pero por simplicidad usamos Archivos
    cb(null, staticFsSubdir('Archivos'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `mensaje-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterMensajes = (req, file, cb) => {
  // Permitir cualquier tipo de archivo para mensajes
  cb(null, true);
};

const uploadMensajes = multer({
  storage: mensajesStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB por archivo
  fileFilter: fileFilterMensajes
});

// Todas las rutas requieren autenticación y ser DOCENTE, ADMINISTRADOR o PROMOTORIA
router.use(authenticateToken);
// Permitir DOCENTE, ADMINISTRADOR y PROMOTORIA en todas las rutas
router.use((req, res, next) => {
  // Log para debugging - solo en rutas de hijos/aula-virtual
  if (req.path.includes('/hijos/') && req.path.includes('/aula-virtual')) {
    console.log(`🔵 [MIDDLEWARE-GLOBAL] Verificando acceso para: ${req.method} ${req.path}`);
    console.log(`📋 [MIDDLEWARE-GLOBAL] User:`, { tipo: req.user?.tipo, usuario_id: req.user?.usuario_id, personal_id: req.user?.personal_id });
  }
  
  if (!req.user) {
    if (req.path.includes('/hijos/') && req.path.includes('/aula-virtual')) {
      console.error(`❌ [MIDDLEWARE-GLOBAL] Usuario no autenticado`);
    }
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (req.user.tipo !== 'DOCENTE' && !esAdminOPromotoria(req.user.tipo)) {
    if (req.user.tipo === 'PSICOLOGA' && psicologaRutaDocentePermitida(req.path || '')) {
      return next();
    }
    if (req.path.includes('/hijos/') && req.path.includes('/aula-virtual')) {
      console.error(`❌ [MIDDLEWARE-GLOBAL] Tipo de usuario no permitido: ${req.user.tipo}`);
    }
    return res.status(403).json({ 
      error: 'No tienes permisos para acceder a este recurso' 
    });
  }
  
  if (req.path.includes('/hijos/') && req.path.includes('/aula-virtual')) {
    console.log(`✅ [MIDDLEWARE-GLOBAL] Acceso permitido, continuando...`);
  }
  
  next();
});

/**
 * GET /api/docente/dashboard
 * Obtener datos del dashboard del docente
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del personal/docente
    const personal = await query(
      `SELECT p.*, u.tipo as tipo_usuario
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];

    // Contar grupos asignados (grupos distintos donde el docente tiene asignaturas)
    const gruposAsignados = await query(
      `SELECT COUNT(DISTINCT g.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [docente.id, colegio_id, anio_activo]
    );

    // Contar cursos asignados
    // asignaturas tiene grupo_id directamente, no area_curso_id. El año viene de grupos.anio
    const cursosAsignados = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [docente.id, colegio_id, anio_activo]
    );

    // Contar estudiantes totales
    const estudiantes = await query(
      `SELECT COUNT(DISTINCT m.alumno_id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)`,
      [docente.id, colegio_id, anio_activo]
    );

    // Próximos exámenes (todos los futuros, sin límite de días)
    // asignaturas_examenes tiene fecha_desde, fecha_hasta, hora_desde, hora_hasta (NO tiene fecha_inicio)
    // asignaturas_examenes SÍ tiene asignatura_id y titulo (NO tiene descripcion)
    // IMPORTANTE: Comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const proximosExamenes = await query(
      `SELECT ae.*, 
              COALESCE(ae.titulo, 'Examen') as titulo,
              c.nombre as asignatura_nombre, 
              g.grado, 
              g.seccion, 
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(ae.fecha_desde) as fecha_evento
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND DATE(ae.fecha_desde) >= DATE(NOW())
       ORDER BY ae.fecha_desde ASC`,
      [docente.id, colegio_id, anio_activo]
    );

    // Próximas tareas (todas las futuras, sin límite de días)
    // asignaturas_tareas tiene titulo, descripcion, fecha_entrega (NO fecha_fin)
    // IMPORTANTE: Comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const proximasTareas = await query(
      `SELECT t.*, 
              t.titulo,
              c.nombre as asignatura_nombre, 
              g.grado, 
              g.seccion,
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(t.fecha_entrega) as fecha_evento
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND t.fecha_entrega IS NOT NULL
       AND DATE(t.fecha_entrega) >= DATE(NOW())
       ORDER BY t.fecha_entrega ASC`,
      [docente.id, colegio_id, anio_activo]
    );

    // Actividades próximas (solo futuras del año actual, no año activo)
    // IMPORTANTE: Filtrar por AÑO ACTUAL del sistema (no año activo) y comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const añoActual = new Date().getFullYear();
    const actividades = await query(
      `${ACTIVIDADES_SELECT_CON_EVENTO_SQL}
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       AND DATE(a.fecha_inicio) >= DATE(NOW())
       ORDER BY a.fecha_inicio ASC`,
      [colegio_id, añoActual]
    );

    console.log(`📅 Dashboard - Actividades del año actual ${añoActual} (futuras):`, actividades.length);
    if (actividades.length > 0) {
      console.log('📅 Dashboard - Primeras actividades:', actividades.slice(0, 3).map(a => ({
        id: a.id,
        descripcion: a.descripcion,
        fecha_inicio: a.fecha_inicio,
        fecha_evento: a.fecha_evento
      })));
    }

    // Contar mensajes no leídos del docente
    const mensajesNoLeidos = await query(
      `SELECT COUNT(*) as total
       FROM mensajes m
       WHERE m.destinatario_id = ?
         AND m.tipo = 'RECIBIDO'
         AND m.estado = 'NO_LEIDO'
         AND m.borrado = 'NO'`,
      [usuario_id]
    );

    const tardanzaMes = await calcularTardanzasMesPersonal(query, {
      usuario_id,
      colegio_id,
      anio_activo,
      hora_entrada_config: docente.hora_entrada,
    });

    // Obtener comunicado con show_in_home activo (más reciente)
    const comunicadoHome = await query(
      `SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ? AND c.estado = 'ACTIVO' AND c.show_in_home = 1
       ORDER BY c.fecha_hora DESC
       LIMIT 1`,
      [colegio_id]
    );

    // Construir URL del archivo del comunicado si existe
    let comunicadoHomeData = null;
    if (comunicadoHome.length > 0) {
      const com = comunicadoHome[0];
      let archivoUrl = null;
      
      if (com.archivo && com.archivo.trim() !== '') {
        const nombreArchivo = com.archivo.trim();
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        const isProduction = process.env.NODE_ENV === 'production';
        const dominioBase = 'https://sistema.vanguardschools.edu.pe';
        
        if (esSistemaNuevo) {
          archivoUrl = isProduction
            ? `https://sistema.vanguardschools.edu.pe${nombreArchivo.startsWith('/') ? nombreArchivo : '/' + nombreArchivo}`
            : `http://localhost:5000${nombreArchivo.startsWith('/') ? nombreArchivo : '/' + nombreArchivo}`;
        } else {
          if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          } else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          } else {
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
        }
      }
      
      comunicadoHomeData = {
        ...com,
        archivo_url: archivoUrl
      };
    }

    // Verificar roles adicionales (apoderado y tutor)
    // Verificar si es apoderado (tiene hijos estudiando en el colegio)
    const esApoderado = await query(
      `SELECT COUNT(DISTINCT f.alumno_id) as total_hijos
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ap.colegio_id = ? 
         AND ap.nro_documento = (
           SELECT p.nro_documento 
           FROM personal p 
           WHERE p.id = ? AND p.colegio_id = ?
         )
         AND m.colegio_id = ?
         AND (m.estado = 0)
         AND g.anio = ?`,
      [colegio_id, docente.id, colegio_id, colegio_id, anio_activo]
    );

    const tieneHijos = (esApoderado[0]?.total_hijos || 0) > 0;

    // Verificar si es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [docente.id, docente.id, colegio_id, anio_activo]
    );

    const esTutor = gruposTutor.length > 0;

    // Construir nombre completo
    const nombreCompleto = `${docente.nombres || ''} ${docente.apellidos || ''}`.trim();
    
    // Construir URL de foto
    let fotoUrl = null;
    if (docente.foto && docente.foto !== '') {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${docente.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${docente.foto}`;
      }
    }

    res.json({
      docente: {
        id: docente.id,
        nombres: nombreCompleto || docente.nombres || 'Docente',
        apellidos: docente.apellidos || '',
        foto: fotoUrl,
        email: docente.email || ''
      },
      rolesAdicionales: {
        es_apoderado: tieneHijos,
        es_tutor: esTutor
      },
      estadisticas: {
        gruposAsignados: gruposAsignados[0]?.total || 0,
        cursosAsignados: cursosAsignados[0]?.total || 0,
        estudiantes: estudiantes[0]?.total || 0,
        mensajesNoLeidos: mensajesNoLeidos[0]?.total || 0,
        tardanzasMesActual: tardanzaMes.minutos_tardanza,
        descuentoMesActual: tardanzaMes.descuento,
        mesTardanzasNombre: tardanzaMes.mes_nombre,
      },
      proximosExamenes: proximosExamenes || [],
      proximasTareas: proximasTareas || [],
      actividades: actividades || [],
      comunicadoHome: comunicadoHomeData
    });
  } catch (error) {
    console.error('Error en dashboard docente:', error);
    res.status(500).json({ error: 'Error al obtener datos del dashboard' });
  }
});

/**
 * GET /api/docente/asistencias
 * Obtener asistencias del docente con filtro por mes y año
 */
router.get('/asistencias', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { mes, anio } = req.query;

    // Validar parámetros
    const mesInt = mes ? parseInt(mes) : new Date().getMonth() + 1;
    const anioInt = anio ? parseInt(anio) : new Date().getFullYear();

    if (mesInt < 1 || mesInt > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    // Obtener datos del personal/docente
    const personal = await query(
      `SELECT p.*, u.tipo as tipo_usuario
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];
    const horaEntradaConfigurada = docente.hora_entrada;

    // Obtener registros de asistencia del mes y año especificados
    const registrosAsistencia = await query(
      `SELECT ar.fecha, ar.hora_entrada, ar.hora_salida, ar.tipo_registro
       FROM asistencia_registros ar
       WHERE ar.usuario_id = ?
         AND ar.colegio_id = ?
         AND ar.anio = ?
         AND YEAR(ar.fecha) = ?
         AND MONTH(ar.fecha) = ?
         AND ar.hora_entrada IS NOT NULL
         AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
       ORDER BY ar.fecha DESC, ar.hora_entrada DESC`,
      [usuario_id, colegio_id, anio_activo, anioInt, mesInt]
    );

    let totalMinutosTardanza = 0;
    const asistenciasConCalculos = registrosAsistencia.map((registro) => {
      const { minutos_tardanza: minutosTardanza } = calcTardanza(
        horaEntradaConfigurada,
        registro.hora_entrada
      );
      totalMinutosTardanza += minutosTardanza;
      return {
        ...registro,
        minutos_tardanza: minutosTardanza,
      };
    });

    const totalDescuento = Math.round(totalMinutosTardanza * DESCUENTO_POR_MINUTO * 100) / 100;

    res.json({
      asistencias: asistenciasConCalculos,
      total_minutos_tardanza: totalMinutosTardanza,
      total_descuento: totalDescuento,
      hora_entrada_configurada: horaEntradaConfigurada,
      mes: mesInt,
      anio: anioInt
    });
  } catch (error) {
    console.error('Error obteniendo asistencias:', error);
    res.status(500).json({ error: 'Error al obtener asistencias' });
  }
});

/**
 * GET /api/docente/perfil
 * Obtener perfil del docente
 */
router.get('/perfil', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;

    const personal = await query(
      `SELECT p.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];

    // Construir URL de foto
    let fotoUrl = null;
    if (docente.foto && docente.foto !== '') {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${docente.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${docente.foto}`;
      }
    }

    res.json({
      id: docente.id,
      nombres: docente.nombres,
      apellidos: docente.apellidos,
      dni: docente.dni,
      email: docente.email,
      telefono_fijo: docente.telefono_fijo,
      telefono_celular: docente.telefono_celular,
      direccion: docente.direccion,
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      cargo: docente.cargo,
      profesion: docente.profesion,
      fecha_nacimiento: docente.fecha_nacimiento,
      fecha_ingreso: docente.fecha_ingreso,
      hora_entrada: docente.hora_entrada,
      hora_salida: docente.hora_salida
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * GET /api/docente/qr
 * Obtener datos del docente para generar QR (fotocheck)
 */
router.get('/qr', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del docente
    const personal = await query(
      `SELECT p.id, p.nombres, p.apellidos, p.fecha_nacimiento, u.usuario as nro_documento
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docenteData = personal[0];

    // Obtener nombre del colegio
    const colegio = await query(
      `SELECT nombre FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';

    // Generar código QR (puede ser el DNI o un ID único)
    const qrData = docenteData.nro_documento || `DOCENTE-${docenteData.id}`;

    // Formatear fecha de nacimiento
    let fechaNacimientoFormateada = '';
    if (docenteData.fecha_nacimiento) {
      const fecha = new Date(docenteData.fecha_nacimiento);
      if (!isNaN(fecha.getTime())) {
        fechaNacimientoFormateada = fecha.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    }

    // Separar nombres y apellidos
    const nombres = docenteData.nombres || '';
    const apellidos = docenteData.apellidos || '';

    res.json({
      nombres: nombres,
      apellidos: apellidos,
      nombre_completo: `${nombres} ${apellidos}`.trim(),
      fecha_nacimiento: fechaNacimientoFormateada,
      colegio_nombre: colegioNombre,
      anio: anio_activo,
      qr_data: qrData,
      nro_documento: docenteData.nro_documento || ''
    });
  } catch (error) {
    console.error('Error obteniendo datos para QR:', error);
    res.status(500).json({ error: 'Error al obtener datos para QR' });
  }
});

/**
 * PUT /api/docente/perfil
 * Actualizar perfil del docente (incluyendo foto)
 */
router.put('/perfil', uploadPersonal.single('foto'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { nombres, apellidos, email, telefono_fijo, telefono_celular, direccion, fecha_nacimiento } = req.body;

    // Obtener docente actual
    const personal = await query(
      `SELECT p.* FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];
    
    // Guardar datos anteriores para auditoría
    const datosAnteriores = {
      nombres: docente.nombres,
      apellidos: docente.apellidos,
      email: docente.email,
      telefono_fijo: docente.telefono_fijo,
      telefono_celular: docente.telefono_celular,
      direccion: docente.direccion,
      fecha_nacimiento: docente.fecha_nacimiento,
      foto: docente.foto
    };
    
    let fotoPath = docente.foto;

    // Si se subió una nueva foto
    if (req.file) {
      // Eliminar foto anterior si existe
      if (docente.foto && docente.foto !== '') {
        // Eliminar foto anterior si existe (puede estar en Static/Image/Fotos/ o en uploads/personal/ por compatibilidad)
        const oldFotoPathStatic = `/home/vanguard/intranet2026/backend/Static/Image/Fotos/${path.basename(docente.foto)}`;
        const oldFotoPath = oldFotoPathStatic;
        if (fs.existsSync(oldFotoPath)) {
          fs.unlinkSync(oldFotoPath);
        }
      }
      
      // Guardar nueva foto - solo el nombre del archivo, no la ruta completa
      fotoPath = req.file.filename;
    }

    // ACTUALIZAR DATOS EN LA BASE DE DATOS
    await execute(
      `UPDATE personal SET
        nombres = ?,
        apellidos = ?,
        email = ?,
        telefono_fijo = ?,
        telefono_celular = ?,
        direccion = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ?`,
      [
        nombres || docente.nombres,
        apellidos || docente.apellidos,
        email || docente.email,
        telefono_fijo || docente.telefono_fijo,
        telefono_celular || docente.telefono_celular,
        direccion || docente.direccion,
        fotoPath,
        fecha_nacimiento || docente.fecha_nacimiento,
        docente.id
      ]
    );

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      nombres: nombres || docente.nombres,
      apellidos: apellidos || docente.apellidos,
      email: email || docente.email,
      telefono_fijo: telefono_fijo || docente.telefono_fijo,
      telefono_celular: telefono_celular || docente.telefono_celular,
      direccion: direccion || docente.direccion,
      fecha_nacimiento: fecha_nacimiento || docente.fecha_nacimiento,
      foto: fotoPath
    };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'PERFIL',
      entidad: 'personal',
      entidad_id: docente.id,
      descripcion: `Actualizó perfil: ${datosNuevos.nombres} ${datosNuevos.apellidos}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // ACTUALIZAR DATOS EN LA BASE DE DATOS
    await execute(
      `UPDATE personal SET
        nombres = ?,
        apellidos = ?,
        email = ?,
        telefono_fijo = ?,
        telefono_celular = ?,
        direccion = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ?`,
      [
        nombres || docente.nombres,
        apellidos || docente.apellidos,
        email || docente.email,
        telefono_fijo || docente.telefono_fijo,
        telefono_celular || docente.telefono_celular,
        direccion || docente.direccion,
        fotoPath,
        fecha_nacimiento || docente.fecha_nacimiento,
        docente.id
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Obtener el perfil completo actualizado para devolverlo
    const personalActualizado = await query(
      `SELECT p.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    const docenteActualizado = personalActualizado[0];

    // Construir URL de foto desde la BD actualizada
    let fotoUrl = null;
    const fotoEnBD = docenteActualizado.foto;
    if (fotoEnBD && fotoEnBD !== '') {
      const isProduction = process.env.NODE_ENV === 'production';
      // Si ya es una ruta completa (empieza con /uploads/), construir URL completa
      if (fotoEnBD.startsWith('/uploads/')) {
        if (isProduction) {
          fotoUrl = `https://vanguardschools.edu.pe${fotoEnBD}`;
        } else {
          fotoUrl = `http://localhost:5000${fotoEnBD}`;
        }
      } else if (fotoEnBD.startsWith('http')) {
        // Si ya es una URL completa, usarla directamente
        fotoUrl = fotoEnBD;
      } else {
        // Es solo el nombre del archivo
        // Usar el dominio del sistema PHP para servir fotos (igual que publicaciones)
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        if (isProduction) {
          fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${fotoEnBD}`;
        } else {
          fotoUrl = `http://localhost:5000/Static/Image/Fotos/${fotoEnBD}`;
        }
      }
    }

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      docente: {
        id: docenteActualizado.id,
        nombres: docenteActualizado.nombres,
        apellidos: docenteActualizado.apellidos,
        dni: docenteActualizado.dni,
        email: docenteActualizado.email,
        telefono_fijo: docenteActualizado.telefono_fijo,
        telefono_celular: docenteActualizado.telefono_celular,
        direccion: docenteActualizado.direccion,
        foto: fotoUrl,
        cargo: docenteActualizado.cargo,
        profesion: docenteActualizado.profesion,
        fecha_nacimiento: docenteActualizado.fecha_nacimiento,
        fecha_ingreso: docenteActualizado.fecha_ingreso,
        hora_entrada: docenteActualizado.hora_entrada,
        hora_salida: docenteActualizado.hora_salida
      },
      // También devolver el perfil completo para que el frontend pueda actualizar el estado
      perfil: {
        id: docenteActualizado.id,
        nombres: docenteActualizado.nombres,
        apellidos: docenteActualizado.apellidos,
        dni: docenteActualizado.dni,
        email: docenteActualizado.email,
        telefono_fijo: docenteActualizado.telefono_fijo,
        telefono_celular: docenteActualizado.telefono_celular,
        direccion: docenteActualizado.direccion,
        foto: fotoUrl,
        cargo: docenteActualizado.cargo,
        profesion: docenteActualizado.profesion,
        fecha_nacimiento: docenteActualizado.fecha_nacimiento,
        fecha_ingreso: docenteActualizado.fecha_ingreso,
        hora_entrada: docenteActualizado.hora_entrada,
        hora_salida: docenteActualizado.hora_salida
      }
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

/**
 * PUT /api/docente/perfil/password
 * Cambiar contraseña del docente
 */
router.put('/perfil/password', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (password_nueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Obtener usuario actual
    const usuarios = await query(
      `SELECT u.id, u.password, u.tipo, u.colegio_id FROM usuarios u WHERE u.id = ?`,
      [usuario_id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuarioDB = usuarios[0];

    // Validar contraseña actual (SHA1 como en PHP)
    const crypto = require('crypto');
    const passwordHashActual = crypto.createHash('sha1').update(password_actual).digest('hex');
    
    if (usuarioDB.password !== passwordHashActual) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Generar hash de la nueva contraseña
    const passwordHashNueva = crypto.createHash('sha1').update(password_nueva).digest('hex');

    // Actualizar contraseña en la base de datos
    // Registrar auditoría ANTES de cambiar contraseña
    registrarAccion({
      usuario_id,
      colegio_id: usuarioDB.colegio_id,
      tipo_usuario: usuarioDB.tipo,
      accion: 'CAMBIAR_PASSWORD',
      modulo: 'PERFIL',
      entidad: 'usuario',
      entidad_id: usuario_id,
      descripcion: 'Cambió su contraseña',
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: null,
      resultado: 'EXITOSO'
    });

    await execute(
      `UPDATE usuarios SET password = ? WHERE id = ?`,
      [passwordHashNueva, usuario_id]
    );

    // Cerrar otras sesiones (tokens JWT previos dejan de valer)
    try {
      const { bumpTokenVersion } = require('../utils/tokenVersion');
      await bumpTokenVersion(execute, usuario_id);
    } catch (e) {
      console.warn('[perfil/password] bumpTokenVersion:', e.message);
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Contraseña actualizada correctamente. Vuelva a iniciar sesión.',
      requiere_relogin: true,
    });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

/** CV personal (estudios, idiomas, experiencia, PDFs). Sin sueldo. */
mountSelfServiceCvRoutes(router);

/**
 * GET /api/docente/tiene-asignaciones
 * Verificar si el docente tiene grupos y cursos asignados
 */
router.get('/tiene-asignaciones', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.json({ tiene_grupos: false, tiene_cursos: false });
    }

    // Verificar si tiene grupos asignados
    const gruposAsignados = await query(
      `SELECT COUNT(DISTINCT g.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personalId, colegio_id, anio_activo]
    );

    // Verificar si tiene cursos asignados
    const cursosAsignados = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personalId, colegio_id, anio_activo]
    );

    const tieneGrupos = (gruposAsignados[0]?.total || 0) > 0;
    const tieneCursos = (cursosAsignados[0]?.total || 0) > 0;

    res.json({ 
      tiene_grupos: tieneGrupos,
      tiene_cursos: tieneCursos
    });
  } catch (error) {
    console.error('Error verificando asignaciones:', error);
    res.json({ tiene_grupos: false, tiene_cursos: false });
  }
});

/**
 * GET /api/docente/grupos
 * Query opcional: alcance=todos | publicaciones (misma lista: asignaturas ∪ tutoría, sin duplicar por grupo).
 */
router.get('/grupos', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;

    // Administrador / Promotoría / Psicóloga: todos los grupos del año (sin restricción)
    if (esAdminPromotoriaOpsicologa(req.user.tipo)) {
      const gruposTodos = await query(
        `SELECT DISTINCT g.*,
                n.nombre as nivel_nombre,
                t.nombre as turno_nombre,
                (SELECT COUNT(*)
                 FROM matriculas m
                 WHERE m.grupo_id = g.id
                   AND m.colegio_id = ?
                   AND (m.estado = 0)) as total_alumnos,
                'colegio' as tipo_grupo
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         INNER JOIN turnos t ON t.id = g.turno_id
         WHERE g.colegio_id = ? AND g.anio = ?`,
        [colegio_id, colegio_id, anio_activo]
      );
      const ordenNivelAdmin = { Inicial: 0, Primaria: 1, Secundaria: 2 };
      const lista = [...(gruposTodos || [])].sort((a, b) => {
        const nivA = ordenNivelAdmin[a.nivel_nombre] ?? (a.nivel_id != null ? Number(a.nivel_id) : 999);
        const nivB = ordenNivelAdmin[b.nivel_nombre] ?? (b.nivel_id != null ? Number(b.nivel_id) : 999);
        if (nivA !== nivB) return nivA - nivB;
        const gradA = a.grado != null ? Number(a.grado) : 0;
        const gradB = b.grado != null ? Number(b.grado) : 0;
        if (gradA !== gradB) return gradA - gradB;
        return String(a.seccion || '').localeCompare(String(b.seccion || ''), undefined, { sensitivity: 'base', numeric: true });
      });
      return res.json({ grupos: lista });
    }

    // Obtener personal_id del token
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Grupos como docente (asignaturas)
    const gruposAsignados = await query(
      `SELECT DISTINCT g.*, 
              n.nombre as nivel_nombre, 
              t.nombre as turno_nombre,
              (SELECT COUNT(*) 
               FROM matriculas m 
               WHERE m.grupo_id = g.id 
               AND m.colegio_id = ? 
               AND (m.estado = 0)) as total_alumnos,
              'asignado' as tipo_grupo
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       INNER JOIN asignaturas a ON a.grupo_id = g.id
       WHERE a.personal_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [colegio_id, personalId, colegio_id, anio_activo]
    );

    // Grupos como tutor (siempre consultar para alcance=todos y deduplicar)
    const gruposTutoria = await query(
      `SELECT g.*, 
              n.nombre as nivel_nombre, 
              t.nombre as turno_nombre,
              (SELECT COUNT(*) 
               FROM matriculas m 
               WHERE m.grupo_id = g.id 
               AND m.colegio_id = ? 
               AND (m.estado = 0)) as total_alumnos,
              'tutoria' as tipo_grupo
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [colegio_id, personalId, personalId, colegio_id, anio_activo]
    );

    // Docente + tutoría sin duplicar (un salón donde enseña y es tutor = una entrada, tipo asignado)
    const grupos = mergeGruposDocenteSinDuplicar(gruposAsignados, gruposTutoria);

    res.json({ grupos: ordenarGruposDocenteLista(grupos) });
  } catch (error) {
    console.error('Error obteniendo grupos:', error);
    res.status(500).json({ error: 'Error al obtener grupos asignados' });
  }
});

/**
 * GET /api/docente/grupos/:grupoId/alumnos
 * Obtener lista de alumnos de un grupo
 */
router.get('/grupos/:grupoId/alumnos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo, tipo } = req.user;

    // Validar parámetros
    if (!grupoId) {
      return res.status(400).json({ error: 'ID de grupo es requerido' });
    }
    if (!colegio_id) {
      return res.status(400).json({ error: 'ID de colegio es requerido' });
    }
    if (!anio_activo) {
      return res.status(400).json({ error: 'Año académico es requerido' });
    }

    const esStaffColegio =
      esAdminOPromotoria(tipo) || tipo === 'PSICOLOGA' || tipo === 'SECRETARIA';

    if (esStaffColegio) {
      const gRow = await query(
        `SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
        [grupoId, colegio_id, anio_activo]
      );
      if (!gRow || gRow.length === 0) {
        return res.status(403).json({ error: 'No tienes acceso a este grupo' });
      }
    } else {
      // Docente: asignatura en el grupo o tutor del grupo (alineado con reportes y mensajes-historial)
      const personalId = req.user.personal_id;

      if (!personalId) {
        return res.status(404).json({ error: 'Docente no encontrado' });
      }

      const tieneAccesoAsignatura = await query(
        `SELECT 1 FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE a.personal_id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ? LIMIT 1`,
        [personalId, grupoId, colegio_id, anio_activo]
      );
      const esTutorDelGrupo = await query(
        `SELECT 1 FROM grupos g
         WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
        [grupoId, personalId, personalId, colegio_id, anio_activo]
      );

      if (!tieneAccesoAsignatura?.length && !esTutorDelGrupo?.length) {
        return res.status(403).json({ error: 'No tienes acceso a este grupo' });
      }
    }

    // Obtener alumnos del grupo con fecha de nacimiento y teléfono (del alumno o apoderado)
    // Los alumnos se relacionan con apoderados a través de la tabla familias
    // Usar subconsulta para obtener un solo teléfono por alumno y evitar duplicados
    const alumnos = await query(
      `SELECT DISTINCT
              a.*, 
              m.id as matricula_id,
              m.fecha_registro, 
              m.estado as estado_matricula,
              a.fecha_nacimiento,
              COALESCE(
                (SELECT ap2.telefono_celular 
                 FROM familias f2 
                 INNER JOIN apoderados ap2 ON ap2.id = f2.apoderado_id 
                 WHERE f2.alumno_id = a.id 
                 AND ap2.telefono_celular IS NOT NULL 
                 AND ap2.telefono_celular != '' 
                 LIMIT 1),
                (SELECT ap3.telefono_fijo 
                 FROM familias f3 
                 INNER JOIN apoderados ap3 ON ap3.id = f3.apoderado_id 
                 WHERE f3.alumno_id = a.id 
                 AND ap3.telefono_fijo IS NOT NULL 
                 AND ap3.telefono_fijo != '' 
                 LIMIT 1),
                'N/A'
              ) as telefono
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id]
    );

    res.json({ alumnos: alumnos || [] });
  } catch (error) {
    console.error('Error obteniendo alumnos:', error);
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
});

/**
 * GET /api/docente/grupos/:grupoId/reporte-descuentos-presentacion
 * Igual que tutoria pero para staff del colegio o docente con acceso al grupo (asignatura o tutoría).
 */
router.get('/grupos/:grupoId/reporte-descuentos-presentacion', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoReporteGrupoGeneral(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });

    const anioEsc = acc.anioEsc;
    const hoyStr = fechaQueryValida(req.query.fecha_hasta || new Date().toISOString().slice(0, 10))
      || new Date().toISOString().slice(0, 10);
    let fechaDesde = fechaQueryValida(req.query.fecha_desde) || `${anioEsc}-03-01`;
    let fechaHasta = fechaQueryValida(req.query.fecha_hasta) || `${anioEsc + 1}-02-28`;
    if (fechaDesde > fechaHasta) {
      const t = fechaDesde;
      fechaDesde = fechaHasta;
      fechaHasta = t;
    }
    if (hoyStr < fechaHasta) fechaHasta = hoyStr;

    let rows = [];
    try {
      rows = await query(
        `SELECT ped.id, ped.fecha, ped.hora, ped.puntos, ped.motivo,
                ua.alumno_id,
                TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre,
                CASE
                  WHEN rpp.id IS NOT NULL THEN TRIM(CONCAT(COALESCE(rpp.nombres,''), ' ', COALESCE(rpp.apellidos,'')))
                  WHEN alrp.id IS NOT NULL THEN TRIM(CONCAT(
                    COALESCE(alrp.apellido_paterno,''),' ', COALESCE(alrp.apellido_materno,''),' ', COALESCE(alrp.nombres,'')))
                  ELSE '—'
                END AS registrado_por_nombre
         FROM presentacion_escolar_descuentos ped
         INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
         INNER JOIN alumnos al ON al.id = ua.alumno_id
         INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
         INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
         LEFT JOIN usuarios ur ON ur.id = ped.registrado_por_usuario_id
         LEFT JOIN personal rpp ON rpp.id = ur.personal_id
         LEFT JOIN alumnos alrp ON alrp.id = ur.alumno_id
         WHERE ped.colegio_id = ? AND ped.anio = ?
           AND DATE(ped.fecha) BETWEEN ? AND ?
         ORDER BY al.apellido_paterno, al.apellido_materno, al.nombres, ped.fecha DESC, ped.hora DESC`,
        [grupoId, colegio_id, anioEsc, fechaDesde, fechaHasta]
      );
    } catch (ePd) {
      if (String(ePd.message || '').includes("doesn't exist") || ePd.code === 'ER_NO_SUCH_TABLE') rows = [];
      else throw ePd;
    }

    const porAlumno = new Map();
    (rows || []).forEach((r) => {
      const aid = r.alumno_id;
      if (!porAlumno.has(aid)) {
        porAlumno.set(aid, {
          alumno_id: aid,
          alumno_nombre: r.alumno_nombre,
          suma_puntos: 0,
          registros: [],
        });
      }
      const b = porAlumno.get(aid);
      const pts = Number(r.puntos) || 0;
      b.suma_puntos += pts;
      b.registros.push({
        id: r.id,
        fecha: r.fecha,
        hora: r.hora,
        puntos: r.puntos,
        motivo: r.motivo,
        registrado_por_nombre: r.registrado_por_nombre,
      });
    });

    res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      alumnos: Array.from(porAlumno.values()),
    });
  } catch (e) {
    console.error('[grupos/reporte-descuentos-presentacion]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET /api/docente/grupos/:grupoId/reporte-incidencias-grupo
 * Incidencias del aula (sin exigir ser tutor del grupo en el WHERE).
 */
router.get('/grupos/:grupoId/reporte-incidencias-grupo', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id } = req.user;
    const acc = await assertAccesoReporteGrupoGeneral(req, grupoId);
    if (!acc.ok) return res.status(acc.status).json({ error: acc.error });

    const anioEsc = acc.anioEsc;
    const hoyStr = fechaQueryValida(req.query.fecha_hasta || new Date().toISOString().slice(0, 10))
      || new Date().toISOString().slice(0, 10);
    let fechaDesde = fechaQueryValida(req.query.fecha_desde) || `${anioEsc}-03-01`;
    let fechaHasta = fechaQueryValida(req.query.fecha_hasta) || `${anioEsc + 1}-02-28`;
    if (fechaDesde > fechaHasta) {
      const t = fechaDesde;
      fechaDesde = fechaHasta;
      fechaHasta = t;
    }
    if (hoyStr < fechaHasta) fechaHasta = hoyStr;

    const rows = await query(
      `SELECT ei.id, ei.description, ei.created_at,
              CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
              CASE WHEN ei.assignment_id = ? THEN 'Tutoría' ELSE COALESCE(c.nombre, '—') END AS curso_nombre,
              m.alumno_id,
              TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE g.id = ? AND g.colegio_id = ?
         AND ei.type = 1 AND g.anio = ?
         AND DATE(ei.created_at) BETWEEN ? AND ?
       ORDER BY alumno_nombre ASC, ei.created_at DESC`,
      [ASSIGNMENT_ID_TUTORIA, grupoId, colegio_id, anioEsc, fechaDesde, fechaHasta]
    );

    const porAlumno = new Map();
    (rows || []).forEach((r) => {
      const aid = r.alumno_id;
      if (!porAlumno.has(aid)) {
        porAlumno.set(aid, {
          alumno_id: aid,
          alumno_nombre: r.alumno_nombre,
          incidencias: [],
        });
      }
      porAlumno.get(aid).incidencias.push({
        id: r.id,
        description: r.description,
        created_at: r.created_at,
        docente_nombre: r.docente_nombre,
        curso_nombre: r.curso_nombre,
      });
    });

    res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      total: (rows || []).length,
      alumnos: Array.from(porAlumno.values()),
    });
  } catch (e) {
    console.error('[grupos/reporte-incidencias-grupo]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET /api/docente/grupos/:grupoId/mensajes-historial
 * Historial de mensajes enviados al grupo (Conexiones Familiares)
 */
router.get('/grupos/:grupoId/mensajes-historial', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    if (!grupoId) {
      return res.status(400).json({ error: 'Parámetros requeridos' });
    }
    if (!personal_id) {
      const esTg = await esTutoriaGeneralUsuario(req);
      if (!esTg) return res.status(400).json({ error: 'Parámetros requeridos' });
    }

    // Verificar que el docente tiene acceso al grupo (asignatura en el grupo O tutor del grupo)
    const tieneAccesoAsignatura = await query(
      `SELECT 1 FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [personal_id, grupoId, colegio_id, anio_activo]
    );
    const esTutorDelGrupo = await query(
      `SELECT 1 FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ? LIMIT 1`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    const esTutoriaGeneral = await esTutoriaGeneralUsuario(req);

    if ((!tieneAccesoAsignatura || tieneAccesoAsignatura.length === 0) &&
        (!esTutorDelGrupo || esTutorDelGrupo.length === 0) &&
        !esTutoriaGeneral) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    // Obtener info del grupo
    const grupoRow = await query(
      `SELECT g.id, g.grado, g.seccion, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.id = ? AND g.colegio_id = ?`,
      [grupoId, colegio_id]
    );
    const grupo = grupoRow?.[0] || null;

    // Obtener historial de mensajes_grupos (si la tabla existe)
    let mensajes = [];
    try {
      if (esTutoriaGeneral) {
        mensajes = await query(
          `SELECT id, asunto, mensaje, fecha_hora, mensaje_referencia_id, remitente_id
           FROM mensajes_grupos
           WHERE grupo_id = ?
           ORDER BY fecha_hora DESC`,
          [grupoId]
        );
      } else {
        mensajes = await query(
          `SELECT id, asunto, mensaje, fecha_hora, mensaje_referencia_id
           FROM mensajes_grupos
           WHERE grupo_id = ? AND remitente_id = ?
           ORDER BY fecha_hora DESC`,
          [grupoId, usuario_id]
        );
      }

      // Archivos: preferir mensaje_referencia_id (mismo envío que apoderados); fallback legado por asunto+fecha
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      for (const mg of mensajes) {
        let archivosRows;
        if (mg.mensaje_referencia_id) {
          archivosRows = await query(
            `SELECT nombre_archivo, archivo
             FROM mensajes_archivos
             WHERE mensaje_id = ?`,
            [mg.mensaje_referencia_id]
          );
        } else {
          archivosRows = await query(
            `SELECT DISTINCT ma.nombre_archivo, ma.archivo
             FROM mensajes_archivos ma
             INNER JOIN mensajes m ON m.id = ma.mensaje_id
             WHERE m.remitente_id = ?
               AND CONVERT(m.asunto USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
               AND DATE_FORMAT(m.fecha_hora, '%Y-%m-%d %H:%i:%s') = DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s')`,
            [usuario_id, mg.asunto, mg.fecha_hora]
          );
        }
        mg.archivos = (archivosRows || []).map(arch => {
          const archivoUrl = isProduction
            ? `${phpSystemUrl}/Static/Archivos/${arch.archivo}`
            : `http://localhost:5000/Static/Archivos/${arch.archivo}`;
          return { ...arch, archivo_url: archivoUrl };
        });
      }
    } catch (mgErr) {
      if (!mgErr.message || !mgErr.message.includes("doesn't exist")) {
        console.warn('Error obteniendo mensajes_grupos:', mgErr.message);
      }
    }

    res.json({ grupo, mensajes: mensajes || [] });
  } catch (error) {
    console.error('Error obteniendo historial de mensajes:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

/**
 * DELETE /api/docente/grupos/:grupoId/mensajes-historial/:mensajeId
 * Eliminar un mensaje del historial de Conexiones Familiares (solo el remitente)
 */
router.delete('/grupos/:grupoId/mensajes-historial/:mensajeId', async (req, res) => {
  try {
    const { grupoId, mensajeId } = req.params;
    const { usuario_id, colegio_id } = req.user;

    const grupoRow = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND g.colegio_id = ?`,
      [grupoId, colegio_id]
    );
    if (!grupoRow || grupoRow.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const result = await execute(
      `DELETE FROM mensajes_grupos WHERE id = ? AND grupo_id = ? AND remitente_id = ?`,
      [mensajeId, grupoId, usuario_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado o no puede eliminarse' });
    }
    res.json({ success: true, message: 'Mensaje eliminado del historial' });
  } catch (error) {
    console.error('Error eliminando mensaje del historial:', error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

/**
 * GET /api/docente/alumnos/:alumnoId/info
 * Obtener información completa del alumno con historial de matrículas
 */
router.get('/alumnos/:alumnoId/info', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Obtener información del alumno
    const alumno = await query(
      `SELECT a.*, 
              p.nombre as pais_nacimiento_nombre
       FROM alumnos a
       LEFT JOIN paises p ON p.id = a.pais_nacimiento_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [alumnoId, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    // Obtener apoderados (padre y madre)
    const apoderados = await query(
      `SELECT ap.*, 
              f.alumno_id,
              CASE 
                WHEN ap.parentesco = 0 THEN 'Padre'
                WHEN ap.parentesco = 1 THEN 'Madre'
                ELSE 'Otro'
              END as parentesco_nombre
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       WHERE f.alumno_id = ? AND ap.colegio_id = ?
       AND ap.parentesco IN (0, 1)
       ORDER BY ap.parentesco ASC`,
      [alumnoId, colegio_id]
    );

    // Separar padre y madre
    const padre = apoderados.find(a => a.parentesco === 0) || null;
    const madre = apoderados.find(a => a.parentesco === 1) || null;

    // Obtener nivel actual del alumno (desde la matrícula actual)
    const nivelActual = await query(
      `SELECT n.id as nivel_id, 
              n.nombre as nivel_nombre,
              g.grado,
              g.seccion
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    // Obtener avatar actual del alumno
    // Prioridad 1: avatar_bases (sistema por bimestre) con descripcion e historia
    // Prioridad 2: avatar_shop (sistema antiguo)
    const sexoAlumno = alumno[0].sexo;
    const sexoAvatarBuscado = sexoAlumno;
    const nivelId = nivelActual && nivelActual.length > 0 ? nivelActual[0].nivel_id : null;

    // Helper para bimestre actual (simple, por mes)
    const getBimestreActual = () => {
      const m = new Date().getMonth() + 1;
      return Math.min(4, Math.max(1, Math.ceil(m / 3)));
    };
    let bimestre = getBimestreActual();
    try {
      const phpSerialize = require('php-serialize');
      const rows = await query('SELECT rangos_ciclos_notas FROM colegios WHERE id = ? LIMIT 1', [colegio_id]);
      if (rows && rows.length > 0 && rows[0].rangos_ciclos_notas) {
        let rangos = {};
        try { rangos = phpSerialize.unserialize(rows[0].rangos_ciclos_notas) || {}; } catch (e) {
          try { rangos = JSON.parse(rows[0].rangos_ciclos_notas) || {}; } catch (e2) {}
        }
        const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const parseDdMm = (str) => {
          if (!str || typeof str !== 'string') return null;
          const parts = str.trim().split('-');
          if (parts.length < 2) return null;
          const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
          if (isNaN(d) || isNaN(m) || m < 1 || m > 12) return null;
          return new Date(anio, m - 1, d);
        };
        for (let ciclo = 1; ciclo <= 4; ciclo++) {
          const r = rangos[ciclo] || rangos[String(ciclo)];
          if (!r || !r.inicio || !r.final) continue;
          const inicioDate = parseDdMm(r.inicio), finalDate = parseDdMm(r.final);
          if (!inicioDate || !finalDate) continue;
          inicioDate.setHours(0, 0, 0, 0); finalDate.setHours(23, 59, 59, 999);
          if (hoy >= inicioDate && hoy <= finalDate) { bimestre = ciclo; break; }
        }
      }
    } catch (e) { /* usar bimestre por defecto */ }

    // Compatibilidad: si no hay avatar configurado para el bimestre actual, caer a Bimestre 1.
    if (bimestre !== 1) {
      try {
        const basesBimestre = await query(
          'SELECT id FROM avatar_bases WHERE bimestre = ? LIMIT 1',
          [bimestre]
        );
        if (!basesBimestre || basesBimestre.length === 0) bimestre = 1;
      } catch (e) {
        bimestre = 1;
      }
    }

    // Intentar avatar_bases (sistema por bimestre)
    let avatarBimestre = null;
    try {
      let bases = await query(
        `SELECT * FROM avatar_bases WHERE bimestre = ? AND sexo = ? LIMIT 1`,
        [bimestre, sexoAvatarBuscado !== null ? sexoAvatarBuscado : 0]
      );
      if (bases.length === 0) bases = await query(`SELECT * FROM avatar_bases WHERE bimestre = ? LIMIT 1`, [bimestre]);
      if (bases.length > 0) {
        const baseRow = bases[0];
        const equipado = await query(
          `SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ?`,
          [alumnoId, baseRow.id]
        );
        const accesorioId = equipado[0]?.accesorio_id || null;
        const baseUrl = process.env.NODE_ENV !== 'production'
          ? 'http://localhost:5000/api/static/avatars'
          : ((req.get('x-forwarded-host') || req.get('host'))
            ? `${(req.get('x-forwarded-proto') || req.protocol || 'https')}://${req.get('x-forwarded-host') || req.get('host')}/api/static/avatars`
            : `${process.env.API_PUBLIC_URL || process.env.PHP_SYSTEM_URL || ''}/api/static/avatars`);
        let imagenUrl = baseRow.imagen_base ? `${baseUrl}/${baseRow.imagen_base}` : null;
        if (accesorioId) {
          const acc = await query(`SELECT imagen_combinada FROM avatar_accesorios WHERE id = ?`, [accesorioId]);
          if (acc.length > 0 && acc[0].imagen_combinada) imagenUrl = `${baseUrl}/${acc[0].imagen_combinada}`;
        }
        if (!imagenUrl && baseRow.imagen_base) imagenUrl = `${baseUrl}/${baseRow.imagen_base}`;
        const desc = baseRow.descripcion ?? baseRow.Descripcion ?? '';
        const hist = baseRow.historia ?? baseRow.Historia ?? '';
        avatarBimestre = {
          id: baseRow.id,
          name: baseRow.nombre || '',
          description: String(desc || '').trim(),
          historia: String(hist || '').trim(),
          level: bimestre,
          image_url: imagenUrl,
          bimestre
        };
      }
    } catch (e) {
      if (!e.message || (!e.message.includes("doesn't exist") && !e.message.includes('avatar_bases'))) {
        console.warn('Error avatar_bases docente:', e.message);
      }
    }

    // Fallback: avatar_shop (sistema antiguo)
    let avatarAlumno = [];
    if (!avatarBimestre) {
      if (sexoAvatarBuscado !== null) {
        avatarAlumno = await query(
          `SELECT asi.*, ass.created_at as fecha_compra, ass.student_id
           FROM avatar_shop_sales ass INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ? AND (asi.sexo = ? OR asi.sexo IS NULL)
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoId, sexoAvatarBuscado]
        );
      } else {
        avatarAlumno = await query(
          `SELECT asi.*, ass.created_at as fecha_compra, ass.student_id
           FROM avatar_shop_sales ass INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ?
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoId]
        );
      }
    }

    // Obtener historial de matrículas agrupado por nivel
    const matriculas = await query(
      `SELECT m.id, m.grupo_id, m.fecha_registro, m.estado,
              g.grado, g.seccion, g.anio,
              n.id as nivel_id, n.nombre as nivel_nombre,
              t.nombre as turno_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY n.id, g.anio DESC, g.grado, g.seccion`,
      [alumnoId, colegio_id]
    );

    // Obtener la matrícula actual del año activo (si existe) para el QR
    const matriculaActual = await query(
      `SELECT m.id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    // Agrupar matrículas por nivel
    const matriculasPorNivel = {};
    matriculas.forEach(matricula => {
      if (!matriculasPorNivel[matricula.nivel_id]) {
        matriculasPorNivel[matricula.nivel_id] = {
          nivel_id: matricula.nivel_id,
          nivel_nombre: matricula.nivel_nombre,
          matriculas: []
        };
      }
      matriculasPorNivel[matricula.nivel_id].matriculas.push({
        id: matricula.id,
        grado: matricula.grado,
        seccion: matricula.seccion,
        anio: matricula.anio,
        turno_nombre: matricula.turno_nombre,
        fecha_registro: matricula.fecha_registro,
        estado: matricula.estado
      });
    });

    // Construir URL de la foto del alumno
    let fotoUrl = null;
    if (alumno[0].foto) {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      // Por defecto usar PHP_SYSTEM_URL (o fallback), solo usar localhost si estamos explícitamente en desarrollo
      const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.PHP_SYSTEM_URL;
      if (isDevelopment) {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumno[0].foto}`;
      } else {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumno[0].foto}`;
      }
    }

    // Construir URL del avatar y objeto avatar final
    let avatarUrl = null;
    let avatarObj = null;
    if (avatarBimestre) {
      avatarUrl = avatarBimestre.image_url;
      avatarObj = avatarBimestre;
    } else if (avatarAlumno && avatarAlumno.length > 0) {
      const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.PHP_SYSTEM_URL;
      if (avatarAlumno[0].image) {
        avatarUrl = isDevelopment
          ? `http://localhost:5000/Static/Image/Avatars/${avatarAlumno[0].image}`
          : `${process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe'}/Static/Image/Avatars/${avatarAlumno[0].image}`;
      }
      avatarObj = {
        id: avatarAlumno[0].id,
        name: avatarAlumno[0].name,
        description: avatarAlumno[0].description || '',
        historia: '',
        level: avatarAlumno[0].level,
        image: avatarAlumno[0].image,
        image_url: avatarUrl,
        fecha_compra: avatarAlumno[0].fecha_compra
      };
    }

    // Contar estrellas (avatar_bimestre: enrollment_incidents; avatar_shop: level)
    let estrellasTotal = 0;
    if (avatarBimestre) {
      const matriculasForEstrellas = await query(
        `SELECT m.id FROM matriculas m INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
        [alumnoId, colegio_id, anio_activo]
      );
      const matIds = matriculasForEstrellas.map(m => m.id);
      if (matIds.length > 0) {
        const ph = matIds.map(() => '?').join(',');
        const r = await query(
          `SELECT COALESCE(SUM(points), 0) as t FROM enrollment_incidents WHERE enrollment_id IN (${ph}) AND type = 2`,
          matIds
        );
        estrellasTotal = parseInt(r[0]?.t || 0, 10);
      }
    } else if (avatarAlumno && avatarAlumno.length > 0) {
      estrellasTotal = avatarAlumno[0].level || 0;
    }

    // Generar hash SHA1 del matricula_id para el QR
    const crypto = require('crypto');
    const matriculaId = matriculaActual && matriculaActual.length > 0 ? matriculaActual[0].id : null;
    const qrCode = matriculaId ? crypto.createHash('sha1').update(String(matriculaId)).digest('hex') : null;

    res.json({
      alumno: {
        ...alumno[0],
        foto_url: fotoUrl,
        avatar: avatarObj,
        nivel_actual: nivelActual && nivelActual.length > 0 ? {
          nivel_id: nivelActual[0].nivel_id,
          nivel_nombre: nivelActual[0].nivel_nombre,
          grado: nivelActual[0].grado,
          seccion: nivelActual[0].seccion
        } : null,
        estrellas: estrellasTotal
      },
      apoderados: {
        padre: padre ? {
          nombres: padre.nombres,
          apellido_paterno: padre.apellido_paterno,
          apellido_materno: padre.apellido_materno,
          nro_documento: padre.nro_documento,
          telefono_fijo: padre.telefono_fijo,
          telefono_celular: padre.telefono_celular,
          email: padre.email,
          direccion: padre.direccion,
          ocupacion: padre.ocupacion,
          centro_trabajo_direccion: padre.centro_trabajo_direccion
        } : null,
        madre: madre ? {
          nombres: madre.nombres,
          apellido_paterno: madre.apellido_paterno,
          apellido_materno: madre.apellido_materno,
          nro_documento: madre.nro_documento,
          telefono_fijo: madre.telefono_fijo,
          telefono_celular: madre.telefono_celular,
          email: madre.email,
          direccion: madre.direccion,
          ocupacion: madre.ocupacion,
          centro_trabajo_direccion: madre.centro_trabajo_direccion
        } : null
      },
      matriculas_por_nivel: Object.values(matriculasPorNivel),
      matricula_actual_id: matriculaId,
      qr_code: qrCode
    });
  } catch (error) {
    console.error('Error obteniendo información del alumno:', error);
    res.status(500).json({ error: 'Error al obtener información del alumno' });
  }
});

/**
 * GET /api/docente/cursos
 * Obtener cursos asignados al docente
 */
router.get('/cursos', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo } = req.user;
    const personalId = req.user.personal_id;
    const staff = esStaffColegio(tipo);

    if (!staff && !personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    let cursos;
    if (staff) {
      cursos = await query(
        `SELECT a.*, c.nombre as curso_nombre, c.imagen as curso_imagen,
                g.grado, g.seccion, g.anio,
                n.nombre as nivel_nombre, n.tipo_calificacion as nivel_tipo_calificacion, t.nombre as turno_nombre
         FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         INNER JOIN cursos c ON c.id = a.curso_id
         INNER JOIN niveles n ON n.id = g.nivel_id
         INNER JOIN turnos t ON t.id = g.turno_id
         WHERE a.colegio_id = ? AND g.anio = ?
         ORDER BY n.nombre, g.grado, g.seccion, c.nombre`,
        [colegio_id, anio_activo]
      );
    } else {
      cursos = await query(
        `SELECT a.*, c.nombre as curso_nombre, c.imagen as curso_imagen,
                g.grado, g.seccion, g.anio,
                n.nombre as nivel_nombre, n.tipo_calificacion as nivel_tipo_calificacion, t.nombre as turno_nombre
         FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         INNER JOIN cursos c ON c.id = a.curso_id
         INNER JOIN niveles n ON n.id = g.nivel_id
         INNER JOIN turnos t ON t.id = g.turno_id
         WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
         ORDER BY n.nombre, g.grado, g.seccion, c.nombre`,
        [personalId, colegio_id, anio_activo]
      );
    }

    // Construir URLs completas para las imágenes de cursos
    // Según el modelo anterior, las imágenes están en /Static/Archivos/
    const cursosConImagenes = cursos.map(curso => {
      let cursoImagenUrl = null;
      if (curso.curso_imagen && curso.curso_imagen !== '') {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Si ya es una URL completa, usarla directamente
        if (curso.curso_imagen.startsWith('http')) {
          cursoImagenUrl = curso.curso_imagen;
        } else if (curso.curso_imagen.startsWith('/Static/')) {
          // Ruta del sistema anterior
          if (isProduction) {
            cursoImagenUrl = `https://vanguardschools.edu.pe${curso.curso_imagen}`;
          } else {
            cursoImagenUrl = `http://localhost:5000${curso.curso_imagen}`;
          }
        } else {
          // Solo el nombre del archivo, construir ruta completa en /Static/Archivos/
          if (isProduction) {
            cursoImagenUrl = `https://vanguardschools.edu.pe/Static/Archivos/${curso.curso_imagen}`;
          } else {
            cursoImagenUrl = `http://localhost:5000/Static/Archivos/${curso.curso_imagen}`;
          }
        }
      }
      
      return {
        ...curso,
        curso_imagen_url: cursoImagenUrl
      };
    });

    res.json({ cursos: cursosConImagenes || [] });
  } catch (error) {
    console.error('Error obteniendo cursos:', error);
    res.status(500).json({ error: 'Error al obtener cursos asignados' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos
 * Obtener lista de alumnos de un curso (asignatura) con conteo de estrellas
 */
router.get('/cursos/:cursoId/alumnos', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Validar parámetros
    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    if (!req.user.personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const cursoInfo = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      `a.*, g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre, t.nombre as turno_nombre,
              c.nombre as curso_nombre`
    );
    if (!cursoInfo) return;

    // Obtener alumnos del grupo con conteo de estrellas e incidencias
    // IMPORTANTE: Las estrellas e incidencias se calculan solo del año activo y del curso específico
    // Las estrellas se calculan sumando los puntos de enrollment_incidents (type = 2)
    // Las incidencias se cuentan de enrollment_incidents (type = 1)
    // Usamos subconsultas correlacionadas para evitar duplicación por productos cartesianos de JOINs
    // El promedio final se calcula como el promedio de TODOS los bimestres que tengan notas registradas
    const alumnos = await query(
      `SELECT a.id, 
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id,
              (SELECT COALESCE(SUM(ei.points), 0)
               FROM enrollment_incidents ei
               INNER JOIN matriculas m_ei ON m_ei.id = ei.enrollment_id
               INNER JOIN grupos g_ei ON g_ei.id = m_ei.grupo_id
               WHERE ei.enrollment_id = m.id 
                 AND ei.type = 2 
                 AND ei.assignment_id = ?
                 AND g_ei.anio = ?) as total_estrellas,
              (SELECT COUNT(DISTINCT ei.id)
               FROM enrollment_incidents ei
               INNER JOIN matriculas m_ei ON m_ei.id = ei.enrollment_id
               INNER JOIN grupos g_ei ON g_ei.id = m_ei.grupo_id
               WHERE ei.enrollment_id = m.id 
                 AND ei.type = 1 
                 AND ei.assignment_id = ?
                 AND g_ei.anio = ?) as total_incidencias,
              (SELECT CASE 
                 WHEN COUNT(*) > 0 THEN 
                   ROUND(AVG(CAST(p.promedio AS DECIMAL(5,2))), 0)
                 ELSE NULL
               END
               FROM promedios p 
               WHERE p.matricula_id = m.id 
                 AND p.asignatura_id = ?
                 AND p.promedio IS NOT NULL
                 AND p.promedio != ''
                 AND p.promedio != '-'
                 AND p.promedio REGEXP '^[0-9]+\.?[0-9]*$') as promedio_final
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [cursoInfo.id, anio_activo, cursoInfo.id, anio_activo, cursoInfo.id, cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    res.json({ 
      alumnos: alumnos || [],
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        turno_nombre: cursoInfo.turno_nombre,
        grupo_id: cursoInfo.grupo_id
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos del curso:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Error al obtener lista de alumnos del curso' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/nomina
 * Obtener notas de nómina para un curso y bimestre
 */
router.get('/cursos/:cursoId/nomina', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const bimestre = parseInt(req.query.bimestre || '1', 10);
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!cursoId) return res.status(400).json({ error: 'ID de curso es requerido' });
    if (bimestre < 1 || bimestre > 4) return res.status(400).json({ error: 'Bimestre debe ser 1, 2, 3 o 4' });

    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );
    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const [row] = await query(
      `SELECT notas_json FROM nomina_registros
       WHERE asignatura_id = ? AND personal_id = ? AND bimestre = ? AND colegio_id = ?`,
      [cursoId, personalId, bimestre, colegio_id]
    );
    const notas_json = (row && row.notas_json) ? (typeof row.notas_json === 'string' ? JSON.parse(row.notas_json) : row.notas_json) : {};
    res.json({ notas: notas_json, bimestre });
  } catch (error) {
    console.error('Error obteniendo notas de nómina:', error);
    res.status(500).json({ error: 'Error al obtener notas de nómina' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/nomina
 * Guardar notas de nómina
 */
router.post('/cursos/:cursoId/nomina', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { bimestre, notas } = req.body;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!cursoId) return res.status(400).json({ error: 'ID de curso es requerido' });
    const bimestreInt = parseInt(bimestre || '1', 10);
    if (bimestreInt < 1 || bimestreInt > 4) return res.status(400).json({ error: 'Bimestre debe ser 1, 2, 3 o 4' });

    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );
    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const notasJson = typeof notas === 'object' ? JSON.stringify(notas) : (notas || '{}');
    await execute(
      `INSERT INTO nomina_registros (asignatura_id, personal_id, bimestre, notas_json, colegio_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notas_json = VALUES(notas_json), updated_at = CURRENT_TIMESTAMP`,
      [cursoId, personalId, bimestreInt, notasJson, colegio_id]
    );
    res.json({ ok: true, mensaje: 'Notas guardadas correctamente' });
  } catch (error) {
    console.error('Error guardando notas de nómina:', error);
    res.status(500).json({ error: 'Error al guardar notas de nómina' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/nomina
 * Limpiar todas las notas de nómina de un bimestre
 */
router.delete('/cursos/:cursoId/nomina', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const bimestre = parseInt(req.query.bimestre || '1', 10);
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!cursoId) return res.status(400).json({ error: 'ID de curso es requerido' });
    if (bimestre < 1 || bimestre > 4) return res.status(400).json({ error: 'Bimestre debe ser 1, 2, 3 o 4' });

    const asignatura = await query(
      `SELECT a.id FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );
    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    await execute(
      `INSERT INTO nomina_registros (asignatura_id, personal_id, bimestre, notas_json, colegio_id)
       VALUES (?, ?, ?, '{}', ?)
       ON DUPLICATE KEY UPDATE notas_json = '{}', updated_at = CURRENT_TIMESTAMP`,
      [cursoId, personalId, bimestre, colegio_id]
    );
    res.json({ ok: true, mensaje: 'Notas limpiadas correctamente' });
  } catch (error) {
    console.error('Error limpiando notas de nómina:', error);
    res.status(500).json({ error: 'Error al limpiar notas de nómina' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas
 * Obtener historial de estrellas de un alumno
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno en el grupo del curso
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener historial de estrellas (type = 2 según el sistema anterior)
    // IMPORTANTE: Filtrar solo estrellas del año activo
    // Incluir información del docente que dio las estrellas
    const estrellas = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       WHERE ei.enrollment_id = ? 
         AND ei.assignment_id = ? 
         AND ei.type = 2
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [personal_id, matriculaId, cursoId, anio_activo]
    );

    // Calcular total de estrellas
    const totalEstrellas = estrellas.reduce((sum, e) => sum + (e.points || 0), 0);

    res.json({
      estrellas: estrellas || [],
      total_estrellas: totalEstrellas,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo estrellas:', error);
    res.status(500).json({ error: 'Error al obtener historial de estrellas' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas
 * Dar estrellas a un alumno
 */
router.post('/cursos/:cursoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { points, description } = req.body;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Validar datos
    if (!points || points <= 0) {
      return res.status(400).json({ error: 'La cantidad de estrellas debe ser mayor a 0' });
    }

    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Crear registro de estrellas
    const now = fechaHoraMySQLLima();
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 2, ?, ?, ?, ?)`,
      [matriculaId, cursoId, personal_id, points, description.trim(), now, now]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Dio ${points} estrella(s) al alumno ID ${alumnoId} en el curso ID ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Enviar notificaciones a apoderados de forma asíncrona
    setImmediate(async () => {
      try {
        // Obtener información del alumno y curso para la notificación
        const alumnoInfo = await query(
          `SELECT a.id as alumno_id, CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre,
                  c.nombre as curso_nombre,
                  CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
           FROM alumnos a
           INNER JOIN asignaturas asig ON asig.id = ?
           INNER JOIN cursos c ON c.id = asig.curso_id
           INNER JOIN personal p ON p.id = asig.personal_id
           WHERE a.id = ?`,
          [cursoId, alumnoId]
        );

        if (alumnoInfo.length > 0) {
          const { alumno_id, alumno_nombre, curso_nombre, docente_nombre } = alumnoInfo[0];
          
          console.log(`⭐ [ESTRELLAS] Preparando notificación para alumno ID: ${alumno_id}`);
          
          await crearNotificacionesApoderados({
            alumno_id: parseInt(alumno_id), // Asegurar que sea número
            usuario_id: req.user.usuario_id,
            colegio_id: colegio_id,
            anio_activo: anio_activo,
            tituloNotificacion: 'Estrella Asignada',
            mensajeNotificacion: `${alumno_nombre} recibió ${points} estrella(s) en ${curso_nombre} - Docente: ${docente_nombre}`,
            tipoNotificacion: 'estrella',
            dataExtra: {
              curso_id: parseInt(cursoId),
              incident_id: result.insertId,
              points: points
            }
          });
        } else {
          console.log(`⚠️ [ESTRELLAS] No se encontró información del alumno para crear notificación`);
        }
      } catch (error) {
        console.error(`❌ [ESTRELLAS] Error en proceso de notificaciones:`, error);
      }
    });

    res.json({
      success: true,
      message: `${points} estrella(s) asignada(s) correctamente`,
      incident_id: result.insertId
    });
  } catch (error) {
    console.error('Error dando estrellas:', error);
    res.status(500).json({ error: 'Error al asignar estrellas' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas/:incidentId
 * Eliminar estrellas (solo las que el docente actual dio)
 */
router.delete('/cursos/:cursoId/alumnos/:alumnoId/estrellas/:incidentId', async (req, res) => {
  try {
    const { cursoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el incidente existe y pertenece al docente actual
    // IMPORTANTE: Verificar que pertenezca al año activo
    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? 
         AND ei.worker_id = ? 
         AND ei.type = 2
         AND g.anio = ?`,
      [incidentId, personal_id, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({ 
        error: 'No puedes eliminar estas estrellas. Solo puedes eliminar las que tú mismo diste del año activo.' 
      });
    }

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó ${incidente[0].points} estrella(s) del alumno ID ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Estrellas eliminadas correctamente'
    });
  } catch (error) {
    console.error('Error eliminando estrellas:', error);
    res.status(500).json({ error: 'Error al eliminar estrellas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias
 * Obtener historial de incidencias de un alumno
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno en el grupo del curso
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener historial de incidencias (type = 1 según el sistema anterior)
    // IMPORTANTE: 
    // - Filtrar solo incidencias del año activo
    // - Mostrar TODAS las incidencias del alumno sin filtrar por curso (assignment_id)
    // - Incluir información del docente que registró la incidencia y el curso donde se registró
    const incidencias = await query(
      `SELECT ei.id, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? 
         AND ei.type = 1
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [personal_id, matriculaId, anio_activo]
    );

    res.json({
      incidencias: incidencias || [],
      total_incidencias: incidencias.length,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo incidencias:', error);
    res.status(500).json({ error: 'Error al obtener historial de incidencias' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias
 * Registrar una incidencia para un alumno
 */
router.post('/cursos/:cursoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { description } = req.body;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Validar datos
    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Crear registro de incidencia (type = 1, points = 0)
    const now = fechaHoraMySQLLima();
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
      [matriculaId, cursoId, personal_id, description.trim(), now, now]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Registró una incidencia para el alumno ID ${alumnoId} en el curso ID ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Enviar notificaciones a apoderados de forma asíncrona
    setImmediate(async () => {
      try {
        // Obtener información del alumno y curso para la notificación
        const alumnoInfo = await query(
          `SELECT a.id as alumno_id, CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre,
                  c.nombre as curso_nombre,
                  CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
           FROM alumnos a
           INNER JOIN asignaturas asig ON asig.id = ?
           INNER JOIN cursos c ON c.id = asig.curso_id
           INNER JOIN personal p ON p.id = asig.personal_id
           WHERE a.id = ?`,
          [cursoId, alumnoId]
        );

        if (alumnoInfo.length > 0) {
          const { alumno_id, alumno_nombre, curso_nombre, docente_nombre } = alumnoInfo[0];
          
          console.log(`⚠️ [INCIDENCIAS] Preparando notificación para alumno ID: ${alumno_id}`);
          
          await crearNotificacionesApoderados({
            alumno_id: parseInt(alumno_id), // Asegurar que sea número
            usuario_id: req.user.usuario_id,
            colegio_id: colegio_id,
            anio_activo: anio_activo,
            tituloNotificacion: 'Incidencia Registrada',
            mensajeNotificacion: `Se registró una incidencia para ${alumno_nombre} en ${curso_nombre} - Docente: ${docente_nombre}`,
            tipoNotificacion: 'incidencia',
            dataExtra: {
              curso_id: parseInt(cursoId),
              incident_id: result.insertId
            }
          });
        } else {
          console.log(`⚠️ [INCIDENCIAS] No se encontró información del alumno para crear notificación`);
        }
      } catch (error) {
        console.error(`❌ [INCIDENCIAS] Error en proceso de notificaciones:`, error);
      }
    });

    res.json({
      success: true,
      message: 'Incidencia registrada correctamente',
      incident_id: result.insertId
    });
  } catch (error) {
    console.error('Error registrando incidencia:', error);
    res.status(500).json({ error: 'Error al registrar la incidencia' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias/:incidentId
 * Eliminar incidencia (solo las que el docente actual registró)
 */
router.delete('/cursos/:cursoId/alumnos/:alumnoId/incidencias/:incidentId', async (req, res) => {
  try {
    const { cursoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el incidente existe y pertenece al docente actual
    // IMPORTANTE: Verificar que pertenezca al año activo
    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? 
         AND ei.worker_id = ? 
         AND ei.type = 1
         AND g.anio = ?`,
      [incidentId, personal_id, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({ 
        error: 'No puedes eliminar esta incidencia. Solo puedes eliminar las que tú mismo registraste del año activo.' 
      });
    }

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó una incidencia del alumno ID ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Incidencia eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando incidencia:', error);
    res.status(500).json({ error: 'Error al eliminar la incidencia' });
  }
});

/**
 * Función auxiliar para deserializar datos de notas_detalles
 * El campo data viene serializado en formato PHP: serialize(array)
 */
function deserializarNotasDetalles(dataString) {
  if (!dataString || dataString === '') {
    return {};
  }

  try {
    const phpSerialize = require('php-serialize');
    
    // Intentar deserializar directamente
    try {
      const deserialized = phpSerialize.unserialize(dataString);
      return deserialized || {};
    } catch (e) {
      // Si falla, intentar decodificar base64 primero
      try {
        const decoded = Buffer.from(dataString, 'base64').toString('utf-8');
        const deserialized = phpSerialize.unserialize(decoded);
        return deserialized || {};
      } catch (e2) {
        console.warn('Error deserializando notas_detalles:', e2);
        return {};
      }
    }
  } catch (error) {
    console.warn('Error deserializando notas_detalles:', error);
    return {};
  }
}

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/notas-detalladas
 * Obtener notas detalladas de un alumno para un curso específico
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/notas-detalladas', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId, alumnoId } = req.params;

    // Validar que el curso pertenece al docente
    const asignatura = await query(
      `SELECT a.*, g.anio, g.nivel_id, n.tipo_calificacion, n.tipo_calificacion_final,
              n.nota_aprobatoria, n.nota_maxima, n.nota_minima, c.nombre as curso_nombre,
              c.peso_examen_mensual, c.examen_mensual
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado o no asignado' });
    }

    const cursoInfo = asignatura[0];

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id, m.alumno_id, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? 
         AND g.anio = ? AND (m.estado = 0)`,
      [alumnoId, cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este grupo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener criterios de la asignatura (para todos los ciclos o ciclo específico)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ?
       ORDER BY orden ASC`,
      [cursoId, colegio_id]
    );

    // Obtener todos los indicadores de una vez (optimización)
    const criterioIds = criterios.map(c => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
         ORDER BY criterio_id ASC, id ASC`,
        criterioIds
      );
    }

    // Agrupar indicadores por criterio
    const indicadoresPorCriterio = {};
    todosIndicadores.forEach(indicador => {
      if (!indicadoresPorCriterio[indicador.criterio_id]) {
        indicadoresPorCriterio[indicador.criterio_id] = [];
      }
      indicadoresPorCriterio[indicador.criterio_id].push(indicador);
    });

    // Agregar indicadores a cada criterio
    const criteriosConIndicadores = criterios.map(criterio => ({
      ...criterio,
      indicadores: indicadoresPorCriterio[criterio.id] || []
    }));

    // Obtener todas las notas detalladas de una vez (optimización)
    const todasNotasDetalles = await query(
      `SELECT ciclo, data FROM notas_detalles
       WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
    );

    // Obtener todas las notas de criterios de una vez (optimización)
    const todasNotasCriterios = await query(
      `SELECT criterio_id, nota, ciclo
       FROM notas n
       WHERE n.matricula_id = ? AND n.asignatura_id = ? AND n.ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
    );

    // Obtener todos los exámenes mensuales de una vez (optimización)
    let todasExamenesMensuales = [];
    if (cursoInfo.examen_mensual === 'SI') {
      todasExamenesMensuales = await query(
        `SELECT nro, nota, ciclo FROM notas_examen_mensual
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
         ORDER BY ciclo ASC, nro ASC`,
        [matriculaId, cursoId]
      );
    }

    // Obtener todos los promedios finales de una vez (optimización)
    const todosPromedios = await query(
      `SELECT promedio, ciclo FROM promedios
       WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
    );

    // Organizar datos por ciclo
    const notasDetalladas = {};
    for (let ciclo = 1; ciclo <= 4; ciclo++) {
      // Obtener notas detalladas del ciclo
      const notaDetalle = todasNotasDetalles.find(nd => nd.ciclo === ciclo);
      if (notaDetalle && notaDetalle.data) {
        notasDetalladas[ciclo] = deserializarNotasDetalles(notaDetalle.data);
      } else {
        notasDetalladas[ciclo] = {};
      }

      // Crear mapa de notas por criterio para este ciclo
      const notasMap = {};
      todasNotasCriterios
        .filter(n => n.ciclo === ciclo)
        .forEach(nota => {
          notasMap[nota.criterio_id] = nota.nota;
        });

      // Agregar notas de criterios a cada criterio
      criteriosConIndicadores.forEach(criterio => {
        if (!criterio.notas) criterio.notas = {};
        criterio.notas[ciclo] = notasMap[criterio.id] || null;
      });

      // Agregar exámenes mensuales del ciclo
      if (cursoInfo.examen_mensual === 'SI') {
        const examenesCiclo = todasExamenesMensuales.filter(e => e.ciclo === ciclo);
        if (examenesCiclo.length > 0) {
          if (!notasDetalladas[ciclo].examen_mensual) {
            notasDetalladas[ciclo].examen_mensual = {};
          }
          examenesCiclo.forEach(examen => {
            notasDetalladas[ciclo].examen_mensual[examen.nro] = examen.nota;
          });
        }
      }

      // Agregar promedio final del ciclo
      const promedioCiclo = todosPromedios.find(p => p.ciclo === ciclo);
      notasDetalladas[ciclo].promedio_final = promedioCiclo ? promedioCiclo.promedio : null;
    }

    // Obtener información del alumno
    const alumno = await query(
      `SELECT id, nombres, apellido_paterno, apellido_materno,
              CONCAT(apellido_paterno, ' ', apellido_materno, ', ', nombres) as nombre_completo
       FROM alumnos
       WHERE id = ?`,
      [alumnoId]
    );

    res.json({
      alumno: alumno[0] || null,
      curso: {
        id: cursoInfo.id,
        nombre: cursoInfo.curso_nombre,
        grupo_id: cursoInfo.grupo_id,
        nivel: {
          tipo_calificacion: cursoInfo.tipo_calificacion, // 0 = Cualitativa, 1 = Cuantitativa
          tipo_calificacion_final: cursoInfo.tipo_calificacion_final, // 0 = Promedio, 1 = Porcentaje
          nota_aprobatoria: cursoInfo.nota_aprobatoria,
          nota_maxima: cursoInfo.nota_maxima,
          nota_minima: cursoInfo.nota_minima
        },
        examen_mensual: cursoInfo.examen_mensual === 'SI',
        peso_examen_mensual: cursoInfo.peso_examen_mensual || 0
      },
      criterios: criteriosConIndicadores,
      notas: notasDetalladas
    });
  } catch (error) {
    console.error('Error obteniendo notas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener notas detalladas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/notas
 * Obtener todos los alumnos del curso con sus notas para un ciclo específico
 */
router.get('/cursos/:cursoId/notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { ciclo = 1 } = req.query; // Ciclo por defecto: 1

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    const cicloInt = parseInt(ciclo);

    const cursoInfo = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      `a.*, g.id as grupo_id, g.grado, g.seccion, g.anio, g.nivel_id,
              n.nombre as nivel_nombre, n.tipo_calificacion, n.tipo_calificacion_final,
              n.nota_aprobatoria, n.nota_maxima, n.nota_minima,
              c.nombre as curso_nombre, c.peso_examen_mensual, c.examen_mensual`
    );
    if (!cursoInfo) return;

    // Si es Cualitativa (INICIAL), obtener tabla de conversión letras
    let rangosLetrasPrimaria = [];
    if (cursoInfo.tipo_calificacion === 0) {
      try {
        const colegioData = await query(
          `SELECT rangos_letras_primaria FROM colegios WHERE id = ?`,
          [colegio_id]
        );
        if (colegioData[0]?.rangos_letras_primaria) {
          const phpSerialize = require('php-serialize');
          const buffer = Buffer.from(colegioData[0].rangos_letras_primaria, 'base64');
          const deserialized = phpSerialize.unserialize(buffer);
          rangosLetrasPrimaria = Array.isArray(deserialized) ? deserialized
            : (typeof deserialized === 'object' && deserialized !== null ? Object.values(deserialized) : []);
        }
      } catch (e) {
        console.warn('Error deserializando rangos_letras_primaria:', e.message);
      }
      if (rangosLetrasPrimaria.length === 0) {
        rangosLetrasPrimaria = [
          { rango: '19-20', letra: 'AD' },
          { rango: '13-18', letra: 'A' },
          { rango: '11-12', letra: 'B' },
          { rango: '0-10', letra: 'C' }
        ];
      }
    }

    // Obtener criterios del curso para este ciclo (ciclo = 0 significa todos los ciclos)
    let criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC`,
      [cursoId, colegio_id, cicloInt]
    );
    // INICIAL: si no hay criterios para bimestre 2, 3 o 4, usar los del 1er bimestre
    if (criterios.length === 0 && [2, 3, 4].includes(cicloInt) && cursoInfo.tipo_calificacion === 0) {
      criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
         ORDER BY orden ASC`,
        [cursoId, colegio_id]
      );
    }

    // Obtener indicadores para todos los criterios
    const criterioIds = criterios.map(c => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
         ORDER BY criterio_id ASC, id ASC`,
        criterioIds
      );
    }

    // Agrupar indicadores por criterio
    const indicadoresPorCriterio = {};
    todosIndicadores.forEach(indicador => {
      if (!indicadoresPorCriterio[indicador.criterio_id]) {
        indicadoresPorCriterio[indicador.criterio_id] = [];
      }
      indicadoresPorCriterio[indicador.criterio_id].push(indicador);
    });

    // Agregar indicadores a cada criterio
    const criteriosConIndicadores = criterios.map(criterio => ({
      ...criterio,
      indicadores: indicadoresPorCriterio[criterio.id] || []
    }));

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    // Obtener todas las notas detalladas de todos los alumnos
    const matriculaIds = alumnos.map(a => a.matricula_id);
    let todasNotasDetalles = [];
    if (matriculaIds.length > 0) {
      todasNotasDetalles = await query(
        `SELECT matricula_id, data FROM notas_detalles
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todas las notas de criterios
    let todasNotasCriterios = [];
    if (matriculaIds.length > 0) {
      todasNotasCriterios = await query(
        `SELECT matricula_id, criterio_id, nota FROM notas
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todos los exámenes mensuales
    let todasExamenesMensuales = [];
    if (cursoInfo.examen_mensual === 'SI' && matriculaIds.length > 0) {
      todasExamenesMensuales = await query(
        `SELECT matricula_id, nro, nota FROM notas_examen_mensual
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?
         ORDER BY matricula_id ASC, nro ASC`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todos los promedios finales
    let todosPromedios = [];
    if (matriculaIds.length > 0) {
      todosPromedios = await query(
        `SELECT matricula_id, promedio FROM promedios
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Organizar datos por alumno
    const alumnosConNotas = alumnos.map((alumno, index) => {
      const matriculaId = alumno.matricula_id;

      // Obtener notas detalladas del alumno
      const notaDetalle = todasNotasDetalles.find(nd => nd.matricula_id === matriculaId);
      let notasDetalladas = {};
      if (notaDetalle && notaDetalle.data) {
        notasDetalladas = deserializarNotasDetalles(notaDetalle.data);
      }

      // Obtener notas de criterios del alumno
      const notasCriterios = todasNotasCriterios.filter(n => n.matricula_id === matriculaId);
      const notasMap = {};
      notasCriterios.forEach(nota => {
        notasMap[nota.criterio_id] = nota.nota;
      });

      // Obtener exámenes mensuales del alumno
      const examenesAlumno = todasExamenesMensuales.filter(e => e.matricula_id === matriculaId);
      const examenesMap = {};
      examenesAlumno.forEach(examen => {
        examenesMap[examen.nro] = examen.nota;
      });

      // Obtener promedio final del alumno
      const promedioAlumno = todosPromedios.find(p => p.matricula_id === matriculaId);
      const promedioFinal = promedioAlumno ? promedioAlumno.promedio : null;

      return {
        ...alumno,
        numero: index + 1,
        notas_detalladas: notasDetalladas,
        notas_criterios: notasMap,
        examenes_mensuales: examenesMap,
        promedio_final: promedioFinal
      };
    });

    res.json({
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        grupo_id: cursoInfo.grupo_id,
        nivel: {
          tipo_calificacion: cursoInfo.tipo_calificacion,
          tipo_calificacion_final: cursoInfo.tipo_calificacion_final,
          nota_aprobatoria: cursoInfo.nota_aprobatoria,
          nota_maxima: cursoInfo.nota_maxima,
          nota_minima: cursoInfo.nota_minima
        },
        examen_mensual: cursoInfo.examen_mensual === 'SI',
        peso_examen_mensual: cursoInfo.peso_examen_mensual || 0
      },
      criterios: criteriosConIndicadores,
      alumnos: alumnosConNotas,
      ciclo: cicloInt,
      rangos_letras_primaria: cursoInfo.tipo_calificacion === 0 ? rangosLetrasPrimaria : []
    });
  } catch (error) {
    console.error('Error obteniendo notas del curso:', error);
    res.status(500).json({ error: 'Error al obtener notas del curso' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/notas
 * Guardar notas de todos los alumnos del curso para un ciclo específico
 */
router.post('/cursos/:cursoId/notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, usuario_id, personal_id } = req.user;
    const { ciclo, notas } = req.body; // notas: { matricula_id: { criterio_id: { indicador_id: [notas...] } } }

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId || !ciclo || !notas) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const cicloInt = parseInt(ciclo);

    const cursoInfo = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      `a.*, g.id as grupo_id, g.nivel_id, n.tipo_calificacion,
              c.peso_examen_mensual, c.examen_mensual`
    );
    if (!cursoInfo) return;
    const esCualitativa = cursoInfo.tipo_calificacion === 0;

    let rangosLetras = [];
    if (esCualitativa) {
      try {
        const colegioData = await query(`SELECT rangos_letras_primaria FROM colegios WHERE id = ?`, [colegio_id]);
        if (colegioData[0]?.rangos_letras_primaria) {
          const phpSerialize = require('php-serialize');
          const buffer = Buffer.from(colegioData[0].rangos_letras_primaria, 'base64');
          const deserialized = phpSerialize.unserialize(buffer);
          rangosLetras = Array.isArray(deserialized) ? deserialized : (typeof deserialized === 'object' && deserialized ? Object.values(deserialized) : []);
        }
      } catch (e) { /* ignore */ }
      if (rangosLetras.length === 0) {
        rangosLetras = [{ rango: '19-20', letra: 'AD' }, { rango: '13-18', letra: 'A' }, { rango: '11-12', letra: 'B' }, { rango: '0-10', letra: 'C' }];
      }
    }

    // Puntaje mayor por letra para promediar: AD=20, A=19, B=18, C=17
    const PUNTAJES_LETRAS = { AD: 20, A: 19, B: 18, C: 17 };
    const letraANumero = (letra) => {
      if (!letra || typeof letra !== 'string') return null;
      const ln = String(letra).trim().toUpperCase();
      if (PUNTAJES_LETRAS[ln] !== undefined) return PUNTAJES_LETRAS[ln];
      for (const r of rangosLetras) {
        if ((r.letra || '').toUpperCase() === ln && r.rango) {
          const [a, b] = r.rango.split('-').map(Number);
          if (!isNaN(a) && !isNaN(b)) return Math.max(a, b);
        }
      }
      return null;
    };
    const numeroALetra = (num) => {
      if (num == null || isNaN(num)) return null;
      const n = parseFloat(num);
      const rounded = Math.round(n);
      if (rounded >= 20) return 'AD';
      if (rounded >= 19) return 'A';
      if (rounded >= 18) return 'B';
      if (rounded >= 17) return 'C';
      for (const r of rangosLetras) {
        if (!r.rango) continue;
        const [a, b] = r.rango.split('-').map(Number);
        if (!isNaN(a) && !isNaN(b) && n >= a && n <= b) return r.letra || null;
      }
      return null;
    };

    // Obtener criterios del curso
    let criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC`,
      [cursoId, colegio_id, cicloInt]
    );
    // INICIAL: si no hay criterios para bimestre 2, 3 o 4, usar los del 1er bimestre
    if (criterios.length === 0 && [2, 3, 4].includes(cicloInt) && esCualitativa) {
      criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
         ORDER BY orden ASC`,
        [cursoId, colegio_id]
      );
    }

    // Obtener indicadores
    const criterioIds = criterios.map(c => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})`,
        criterioIds
      );
    }

    const phpSerialize = require('php-serialize');

    // Preparar arrays para operaciones en batch
    const insertsNotasDetalles = [];
    const deletesNotasDetalles = [];
    const insertsNotas = [];
    const deletesNotas = [];
    const insertsExamenesMensuales = [];
    const deletesExamenesMensuales = [];
    const insertsPromedios = [];
    const deletesPromedios = [];
    
    // Mapa para calcular promedios finales después
    const promediosCriteriosPorAlumno = {}; // { matricula_id: { criterio_id: nota } }

    // Procesar notas de cada alumno (solo cálculos, sin queries)
    for (const matriculaId in notas) {
      const matriculaIdInt = parseInt(matriculaId);
      const notasAlumno = notas[matriculaId];

      // Construir estructura de datos para notas_detalles
      const dataNotas = {};
      const promediosCriterios = {};

      for (const criterio of criterios) {
        const criterioId = criterio.id;
        const notasCriterio = notasAlumno[criterioId];

        if (!notasCriterio) continue;

        // Obtener indicadores de este criterio
        const indicadoresCriterio = todosIndicadores.filter(i => i.criterio_id === criterioId);

        if (indicadoresCriterio.length > 0) {
          // Hay indicadores: calcular promedio de cada indicador, luego promedio de criterio
          dataNotas[criterioId] = {};
          const promediosIndicadores = [];

          for (const indicador of indicadoresCriterio) {
            const indicadorId = indicador.id;
            const notasIndicador = notasCriterio[indicadorId];

            if (!notasIndicador || !Array.isArray(notasIndicador)) continue;

            if (esCualitativa && rangosLetras.length > 0) {
              const numeros = notasIndicador.map(n => letraANumero(n)).filter(x => x !== null);
              if (numeros.length > 0) {
                dataNotas[criterioId][indicadorId] = notasIndicador;
                const prom = numeros.reduce((s, x) => s + x, 0) / numeros.length;
                promediosIndicadores.push(numeroALetra(prom));
              }
            } else {
              const notasValidas = notasIndicador
                .map(n => { const nota = parseFloat(n); return isNaN(nota) ? null : nota; })
                .filter(n => n !== null);
              if (notasValidas.length > 0) {
                dataNotas[criterioId][indicadorId] = notasIndicador;
                const promedioIndicador = Math.round(notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length);
                promediosIndicadores.push(promedioIndicador);
              }
            }
          }

          // Calcular promedio del criterio (promedio de los promedios de indicadores)
          if (promediosIndicadores.length > 0) {
            if (esCualitativa && rangosLetras.length > 0) {
              const nums = promediosIndicadores.map(p => typeof p === 'string' ? letraANumero(p) : p).filter(x => x !== null);
              if (nums.length > 0) {
                const prom = nums.reduce((s, x) => s + x, 0) / nums.length;
                promediosCriterios[criterioId] = numeroALetra(prom);
              }
            } else {
              const promedioCriterio = Math.round(
                promediosIndicadores.reduce((sum, p) => sum + p, 0) / promediosIndicadores.length
              );
              promediosCriterios[criterioId] = promedioCriterio.toString();
            }
          }
        } else {
          const notaDirecta = notasCriterio.directa || notasCriterio[0];
          if (notaDirecta && notaDirecta !== '') {
            if (esCualitativa) {
              promediosCriterios[criterioId] = String(notaDirecta).trim().toUpperCase();
            } else {
              const nota = parseFloat(notaDirecta);
              if (!isNaN(nota)) promediosCriterios[criterioId] = Math.round(nota).toString();
            }
          }
        }
      }

      // Guardar para cálculo de promedios finales
      promediosCriteriosPorAlumno[matriculaIdInt] = promediosCriterios;

      // Preparar DELETE e INSERT para notas_detalles
      deletesNotasDetalles.push([cursoId, matriculaIdInt, cicloInt]);
      const dataSerializado = phpSerialize.serialize(dataNotas);
      insertsNotasDetalles.push([cursoId, matriculaIdInt, cicloInt, dataSerializado]);

      // Preparar DELETE e INSERT para notas de criterios
      for (const criterioId in promediosCriterios) {
        const notaCriterio = promediosCriterios[criterioId];
        deletesNotas.push([matriculaIdInt, criterioId, cursoId, cicloInt]);
        insertsNotas.push([matriculaIdInt, criterioId, cicloInt, cursoId, notaCriterio]);
      }

      // Preparar DELETE e INSERT para exámenes mensuales
      if (cursoInfo.examen_mensual === 'SI' && notasAlumno.examen_mensual) {
        const examenes = notasAlumno.examen_mensual;
        deletesExamenesMensuales.push([matriculaIdInt, cursoId, cicloInt]);
        
        for (const nro in examenes) {
          const notaExamen = parseFloat(examenes[nro]);
          if (!isNaN(notaExamen)) {
            insertsExamenesMensuales.push([matriculaIdInt, cursoId, cicloInt, parseInt(nro), notaExamen]);
          }
        }
      }

      // Preparar DELETE para promedios (INSERT se hará después de calcular)
      deletesPromedios.push([matriculaIdInt, cursoId, cicloInt]);
    }

    // Ejecutar DELETE en batch
    if (deletesNotasDetalles.length > 0) {
      const matriculaIds = [...new Set(deletesNotasDetalles.map(d => d[1]))];
      await execute(
        `DELETE FROM notas_detalles
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesNotas.length > 0) {
      const matriculaIds = [...new Set(deletesNotas.map(d => d[0]))];
      await execute(
        `DELETE FROM notas
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesExamenesMensuales.length > 0) {
      const matriculaIds = [...new Set(deletesExamenesMensuales.map(d => d[0]))];
      await execute(
        `DELETE FROM notas_examen_mensual
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesPromedios.length > 0) {
      const matriculaIds = [...new Set(deletesPromedios.map(d => d[0]))];
      await execute(
        `DELETE FROM promedios
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    // Ejecutar INSERT en batch
    if (insertsNotasDetalles.length > 0) {
      const values = insertsNotasDetalles.map(() => '(?, ?, ?, ?)').join(', ');
      const params = insertsNotasDetalles.flat();
      await execute(
        `INSERT INTO notas_detalles (asignatura_id, matricula_id, ciclo, data) VALUES ${values}`,
        params
      );
    }

    if (insertsNotas.length > 0) {
      const values = insertsNotas.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = insertsNotas.flat();
      await execute(
        `INSERT INTO notas (matricula_id, criterio_id, ciclo, asignatura_id, nota) VALUES ${values}`,
        params
      );
    }

    if (insertsExamenesMensuales.length > 0) {
      const values = insertsExamenesMensuales.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = insertsExamenesMensuales.flat();
      await execute(
        `INSERT INTO notas_examen_mensual (matricula_id, asignatura_id, ciclo, nro, nota) VALUES ${values}`,
        params
      );
    }

    // Calcular y guardar promedios finales en batch
    const matriculaIds = Object.keys(promediosCriteriosPorAlumno).map(id => parseInt(id));
    
    if (matriculaIds.length > 0) {
      // Obtener todas las notas de criterios de una vez
      const todasNotasFinales = await query(
        `SELECT n.matricula_id, n.criterio_id, n.nota, ac.peso
         FROM notas n
         INNER JOIN asignaturas_criterios ac ON ac.id = n.criterio_id
         WHERE n.asignatura_id = ? AND n.ciclo = ? AND n.matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );

      // Obtener todos los exámenes mensuales de una vez
      let todasExamenesMensuales = [];
      if (cursoInfo.examen_mensual === 'SI') {
        todasExamenesMensuales = await query(
          `SELECT matricula_id, nro, nota FROM notas_examen_mensual
           WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})
           ORDER BY matricula_id ASC, nro ASC`,
          [cursoId, cicloInt, ...matriculaIds]
        );
      }

      // Agrupar notas por matricula_id
      const notasPorAlumno = {};
      todasNotasFinales.forEach(row => {
        if (!notasPorAlumno[row.matricula_id]) {
          notasPorAlumno[row.matricula_id] = [];
        }
        notasPorAlumno[row.matricula_id].push(row);
      });

      // Agrupar exámenes por matricula_id
      const examenesPorAlumno = {};
      todasExamenesMensuales.forEach(row => {
        if (!examenesPorAlumno[row.matricula_id]) {
          examenesPorAlumno[row.matricula_id] = [];
        }
        examenesPorAlumno[row.matricula_id].push(row);
      });

      // Calcular promedios finales para cada alumno
      for (const matriculaIdInt of matriculaIds) {
        const notasFinales = notasPorAlumno[matriculaIdInt] || [];
        const notasByCriterio = Object.fromEntries(
          notasFinales.map((row) => [row.criterio_id, row])
        );
        let promedioFinal = null;

        if (esCualitativa && rangosLetras.length > 0) {
          if (notasFinales.length > 0) {
            const numeros = notasFinales.map(n => letraANumero(n.nota)).filter(x => x !== null);
            if (numeros.length > 0) {
              const prom = numeros.reduce((s, x) => s + x, 0) / numeros.length;
              promedioFinal = numeroALetra(prom);
            }
          }
        } else if (cursoInfo.tipo_calificacion_final === 1 && !esCualitativa) {
          let sumaPonderada = 0;
          for (const criterio of criterios) {
            const peso = parseFloat(criterio.peso) || 0;
            if (peso <= 0) continue;
            const row = notasByCriterio[criterio.id];
            const raw = row?.nota;
            const nota =
              raw != null && raw !== '' && !isNaN(parseFloat(raw))
                ? parseFloat(raw)
                : 0;
            sumaPonderada += (nota * peso) / 100;
          }
          if (cursoInfo.examen_mensual === 'SI') {
            const pesoExamen = parseFloat(cursoInfo.peso_examen_mensual) || 0;
            if (pesoExamen > 0) {
              const examenesAlumno = examenesPorAlumno[matriculaIdInt] || [];
              let promEx = 0;
              if (examenesAlumno.length > 0) {
                const notasExamenes = examenesAlumno
                  .map(e => parseFloat(e.nota))
                  .filter(n => !isNaN(n));
                if (notasExamenes.length > 0) {
                  promEx = Math.round(
                    notasExamenes.reduce((sum, n) => sum + n, 0) / notasExamenes.length
                  );
                }
              }
              sumaPonderada += (promEx * pesoExamen) / 100;
            }
          }
          const pesoCriterios = criterios.reduce((s, c) => s + (parseFloat(c.peso) || 0), 0);
          const pesoExTot =
            cursoInfo.examen_mensual === 'SI'
              ? parseFloat(cursoInfo.peso_examen_mensual) || 0
              : 0;
          if (pesoCriterios + pesoExTot > 0) {
            promedioFinal = Math.round(sumaPonderada);
          }
        } else if (notasFinales.length > 0 && !esCualitativa) {
          const notasValidas = notasFinales
            .map((n) => parseFloat(n.nota))
            .filter((n) => !isNaN(n));
          if (notasValidas.length > 0) {
            promedioFinal = Math.round(
              notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length
            );
          }

          if (
            cursoInfo.examen_mensual === 'SI' &&
            promedioFinal !== null &&
            typeof promedioFinal === 'number'
          ) {
            const examenesAlumno = examenesPorAlumno[matriculaIdInt] || [];
            if (examenesAlumno.length > 0) {
              const notasExamenes = examenesAlumno
                .map((e) => parseFloat(e.nota))
                .filter((n) => !isNaN(n));
              if (notasExamenes.length > 0) {
                const promedioExamen = Math.round(
                  notasExamenes.reduce((sum, n) => sum + n, 0) / notasExamenes.length
                );
                const pesoExamen = cursoInfo.peso_examen_mensual || 0;
                if (pesoExamen > 0) {
                  promedioFinal = Math.round(
                    (promedioFinal * (100 - pesoExamen)) / 100 + (promedioExamen * pesoExamen) / 100
                  );
                } else {
                  promedioFinal = Math.round((promedioFinal + promedioExamen) / 2);
                }
              }
            }
          }
        }

        // Agregar a inserts de promedios
        if (promedioFinal !== null) {
          insertsPromedios.push([matriculaIdInt, cursoId, cicloInt, promedioFinal.toString()]);
        }
      }

      // Insertar promedios en batch
      if (insertsPromedios.length > 0) {
        const values = insertsPromedios.map(() => '(?, ?, ?, ?)').join(', ');
        const params = insertsPromedios.flat();
        await execute(
          `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES ${values}`,
          params
        );
      }
    }

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'REGISTRAR_NOTAS',
      modulo: 'CURSOS',
      entidad: 'notas',
      entidad_id: cursoId,
      descripcion: `Registró notas del curso ID: ${cursoId} para el ciclo ${cicloInt} (${Object.keys(notas).length} alumno(s))`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ ciclo: cicloInt, total_alumnos: Object.keys(notas).length }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Notas guardadas correctamente'
    });
  } catch (error) {
    console.error('Error guardando notas:', error);
    res.status(500).json({ error: 'Error al guardar notas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/detalle-notas?ciclo=1
 * Lista de alumnos con promedio calculado y explicación guardada (para Detalle Notas)
 */
router.get('/cursos/:cursoId/detalle-notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { ciclo = 1 } = req.query;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const cicloInt = parseInt(ciclo);
    if (cicloInt < 1 || cicloInt > 4) {
      return res.status(400).json({ error: 'Ciclo debe ser 1, 2, 3 o 4' });
    }

    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre, n.tipo_calificacion, c.nombre as curso_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];
    const esInicial = cursoInfo.tipo_calificacion === 0 || (cursoInfo.nivel_nombre || '').toUpperCase().includes('INICIAL');

    // === RAMA INICIAL (cualitativa): detalle por indicador ===
    if (esInicial) {
      let criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
         ORDER BY orden ASC, id ASC`,
        [cursoId, colegio_id, cicloInt]
      );
      if ((!criterios || criterios.length === 0) && [2, 3, 4].includes(cicloInt)) {
        criterios = await query(
          `SELECT * FROM asignaturas_criterios
           WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
           ORDER BY orden ASC, id ASC`,
          [cursoId, colegio_id]
        ) || [];
      }
      criterios = criterios || [];
      const criterioIds = criterios.map(c => c.id);
      let indicadores = [];
      if (criterioIds.length > 0) {
        indicadores = (await query(
          `SELECT * FROM asignaturas_indicadores WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')}) ORDER BY criterio_id, id`,
          criterioIds
        )) || [];
      }

      const alumnos = await query(
        `SELECT a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno,
                CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
                m.id as matricula_id
         FROM alumnos a
         INNER JOIN matriculas m ON m.alumno_id = a.id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g.anio = ?
         ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
        [cursoInfo.grupo_id, colegio_id, anio_activo]
      );

      if (alumnos.length === 0) {
        return res.json({
          curso: { id: cursoInfo.id, curso_nombre: cursoInfo.curso_nombre, grado: cursoInfo.grado, seccion: cursoInfo.seccion, nivel_nombre: cursoInfo.nivel_nombre, grupo_id: cursoInfo.grupo_id, es_cualitativa: true },
          ciclo: cicloInt,
          es_cualitativa: true,
          indicadores,
          alumnos: []
        });
      }

      const matriculaIds = alumnos.map(a => a.matricula_id);
      const todasNotasDetalles = await query(
        `SELECT matricula_id, data FROM notas_detalles
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
      const explicacionesIndicadores = await query(
        `SELECT matricula_id, indicador_id, nota, explicacion FROM notas_detalle_explicaciones_indicadores
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ? AND colegio_id = ?`,
        [cursoId, ...matriculaIds, cicloInt, colegio_id]
      );

      const alumnosConIndicadores = alumnos.map((alumno, idx) => {
        const matId = alumno.matricula_id;
        const notaDet = todasNotasDetalles.find(nd => nd.matricula_id === matId);
        const notasDet = notaDet && notaDet.data ? deserializarNotasDetalles(notaDet.data) : {};
        const indicadoresConDatos = indicadores.map(ind => {
          const notaCriterio = notasDet[ind.criterio_id] || notasDet[String(ind.criterio_id)];
          const notasArr = notaCriterio && (notaCriterio[ind.id] || notaCriterio[String(ind.id)]);
          let promedio = '-';
          if (notasArr && Array.isArray(notasArr)) {
            const arr = notasArr.filter(x => x != null && x !== '');
            if (arr.length > 0) promedio = arr.length === 1 ? String(arr[0]) : arr.join(', ');
          }
          const expRow = explicacionesIndicadores.find(e => e.matricula_id === matId && e.indicador_id === ind.id);
          return {
            indicador_id: ind.id,
            descripcion: ind.descripcion || ind.abreviatura || `Ind ${ind.id}`,
            promedio,
            explicacion: expRow ? (expRow.explicacion || '') : ''
          };
        });
        return {
          ...alumno,
          numero: idx + 1,
          indicadores: indicadoresConDatos
        };
      });

      return res.json({
        curso: { id: cursoInfo.id, curso_nombre: cursoInfo.curso_nombre, grado: cursoInfo.grado, seccion: cursoInfo.seccion, nivel_nombre: cursoInfo.nivel_nombre, grupo_id: cursoInfo.grupo_id, es_cualitativa: true },
        ciclo: cicloInt,
        es_cualitativa: true,
        indicadores,
        alumnos: alumnosConIndicadores
      });
    }

    // === RAMA CUANTITATIVA (Primaria/Secundaria) ===
    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres, a.apellido_paterno, a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    if (alumnos.length === 0) {
      return res.json({
        curso: { id: cursoInfo.id, curso_nombre: cursoInfo.curso_nombre, grado: cursoInfo.grado, seccion: cursoInfo.seccion, nivel_nombre: cursoInfo.nivel_nombre },
        ciclo: cicloInt,
        alumnos: []
      });
    }

    const matriculaIds = alumnos.map(a => a.matricula_id);
    const promedios = await query(
      `SELECT matricula_id, promedio FROM promedios
       WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
      [cursoId, ...matriculaIds, cicloInt]
    );

    const explicaciones = await query(
      `SELECT matricula_id, nota, explicacion FROM notas_detalle_explicaciones
       WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ? AND colegio_id = ?`,
      [cursoId, ...matriculaIds, cicloInt, colegio_id]
    );

    const alumnosConDatos = alumnos.map((a, i) => {
      const prom = promedios.find(p => p.matricula_id === a.matricula_id);
      const exp = explicaciones.find(e => e.matricula_id === a.matricula_id);
      return {
        ...a,
        numero: i + 1,
        promedio: prom ? prom.promedio : null,
        nota_guardada: exp ? exp.nota : null,
        explicacion: exp ? exp.explicacion : ''
      };
    });

    res.json({
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        grupo_id: cursoInfo.grupo_id
      },
      ciclo: cicloInt,
      alumnos: alumnosConDatos
    });
  } catch (error) {
    console.error('Error obteniendo detalle de notas:', error);
    res.status(500).json({ error: 'Error al obtener detalle de notas' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/detalle-notas
 * Guardar explicaciones por bimestre
 * Cuantitativa: Body: { ciclo, datos: [{ matricula_id, nota, explicacion }] }
 * INICIAL: Body: { ciclo, datos: [{ matricula_id, indicadores: [{ indicador_id, nota, explicacion }] }] }
 */
router.post('/cursos/:cursoId/detalle-notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, personal_id } = req.user;
    const { ciclo, datos } = req.body;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!ciclo || !Array.isArray(datos)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const cicloInt = parseInt(ciclo);
    if (cicloInt < 1 || cicloInt > 4) {
      return res.status(400).json({ error: 'Ciclo debe ser 1, 2, 3 o 4' });
    }

    const asignatura = await query(
      `SELECT a.id, n.tipo_calificacion, n.nombre as nivel_nombre FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ?`,
      [cursoId, personal_id, colegio_id]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const esInicial = asignatura[0].tipo_calificacion === 0 || (asignatura[0].nivel_nombre || '').toUpperCase().includes('INICIAL');

    if (esInicial && datos[0] && Array.isArray(datos[0].indicadores)) {
      // INICIAL: guardar por indicador en notas_detalle_explicaciones_indicadores
      for (const item of datos) {
        const matriculaId = parseInt(item.matricula_id);
        if (isNaN(matriculaId) || !Array.isArray(item.indicadores)) continue;
        for (const ind of item.indicadores) {
          const indicadorId = parseInt(ind.indicador_id);
          if (isNaN(indicadorId)) continue;
          const nota = ind.nota != null && ind.nota !== '' ? String(ind.nota).trim() : null;
          const explicacion = (ind.explicacion || '').trim() || null;
          await execute(
            `INSERT INTO notas_detalle_explicaciones_indicadores 
             (asignatura_id, indicador_id, matricula_id, ciclo, nota, explicacion, colegio_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nota = VALUES(nota), explicacion = VALUES(explicacion), updated_at = NOW()`,
            [cursoId, indicadorId, matriculaId, cicloInt, nota, explicacion, colegio_id]
          );
        }
      }
    } else {
      // Cuantitativa: notas_detalle_explicaciones
      for (const item of datos) {
        const matriculaId = parseInt(item.matricula_id);
        if (isNaN(matriculaId)) continue;
        const nota = item.nota != null && item.nota !== '' ? parseFloat(item.nota) : null;
        const explicacion = (item.explicacion || '').trim();
        await execute(
          `INSERT INTO notas_detalle_explicaciones 
           (asignatura_id, matricula_id, ciclo, nota, explicacion, colegio_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nota = VALUES(nota), explicacion = VALUES(explicacion), updated_at = NOW()`,
          [cursoId, matriculaId, cicloInt, nota, explicacion || null, colegio_id]
        );
      }
    }

    res.json({ success: true, message: 'Detalle de notas guardado correctamente' });
  } catch (error) {
    console.error('Error guardando detalle de notas:', error);
    res.status(500).json({ error: 'Error al guardar detalle de notas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/criterios
 * Obtener criterios e indicadores de un curso (para nivel INICIAL - Registrar Indicadores)
 */
router.get('/cursos/:cursoId/criterios', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, personal_id } = req.user;
    const { ciclo } = req.query;

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      `a.*, c.nombre as curso_nombre, n.nombre as nivel_nombre, n.tipo_calificacion`
    );
    if (!asignaturaAcceso) return;

    let criterios = [];
    if (ciclo) {
      const cicloInt = parseInt(ciclo);
      criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
         ORDER BY orden ASC, id ASC`,
        [cursoId, colegio_id, cicloInt]
      );
      // INICIAL: si no hay indicadores para bimestre 2, 3 o 4, mostrar los del 1er bimestre
      if (criterios.length === 0 && [2, 3, 4].includes(cicloInt)) {
        criterios = await query(
          `SELECT * FROM asignaturas_criterios
           WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
           ORDER BY orden ASC, id ASC`,
          [cursoId, colegio_id]
        );
      }
    } else {
      criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ?
         ORDER BY ciclo ASC, orden ASC, id ASC`,
        [cursoId, colegio_id]
      );
    }

    const criterioIds = criterios.map(c => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
         ORDER BY criterio_id, id`,
        criterioIds
      );
    }

    const indicadoresPorCriterio = {};
    todosIndicadores.forEach(ind => {
      if (!indicadoresPorCriterio[ind.criterio_id]) indicadoresPorCriterio[ind.criterio_id] = [];
      indicadoresPorCriterio[ind.criterio_id].push(ind);
    });

    const criteriosConIndicadores = criterios.map(c => ({
      ...c,
      indicadores: indicadoresPorCriterio[c.id] || []
    }));

    res.json({
      criterios: criteriosConIndicadores,
      curso: {
        curso_nombre: asignaturaAcceso.curso_nombre,
        nivel_nombre: asignaturaAcceso.nivel_nombre,
        tipo_calificacion: asignaturaAcceso.tipo_calificacion,
      },
    });
  } catch (error) {
    console.error('Error obteniendo criterios:', error);
    res.status(500).json({ error: 'Error al obtener criterios' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/criterios
 * Crear criterio/indicador (INICIAL: peso 0 + indicador; cuantitativo: peso %)
 */
router.post('/cursos/:cursoId/criterios', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, personal_id } = req.user;
    const { descripcion, abreviatura, ciclo, peso, cuadros } = req.body;

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }
    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }

    const asignatura = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      'a.*, n.tipo_calificacion'
    );
    if (!asignatura) return;

    const cicloInt =
      ciclo !== undefined && ciclo !== null && ciclo !== ''
        ? parseInt(ciclo, 10)
        : 1;
    if (!Number.isFinite(cicloInt) || cicloInt < 0 || cicloInt > 4) {
      return res.status(400).json({ error: 'Bimestre no válido' });
    }

    const esCualitativa = asignatura.tipo_calificacion === 0;
    const pesoVal = esCualitativa ? 0 : Math.max(0, parseFloat(peso) || 0);
    const abrev = (abreviatura || '').trim() || descripcion.trim().substring(0, 20);

    const maxOrden = await query(
      `SELECT COALESCE(MAX(orden), 0) as m
       FROM asignaturas_criterios
       WHERE asignatura_id = ? AND ciclo = ?`,
      [cursoId, cicloInt]
    );
    const orden = (maxOrden[0]?.m || 0) + 1;

    await execute(
      `INSERT INTO asignaturas_criterios (colegio_id, descripcion, abreviatura, asignatura_id, ciclo, orden, peso)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [colegio_id, descripcion.trim(), abrev, cursoId, cicloInt, orden, pesoVal]
    );

    const criterioInsertado = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND ciclo = ? AND orden = ?
       ORDER BY id DESC LIMIT 1`,
      [cursoId, colegio_id, cicloInt, orden]
    );
    const criterioId = criterioInsertado[0]?.id;
    if (!criterioId) {
      return res.status(500).json({ error: 'Error al crear el criterio' });
    }

    const cuadrosVal = esCualitativa ? 1 : Math.max(1, parseInt(cuadros, 10) || 1);
    await execute(
      `INSERT INTO asignaturas_indicadores (criterio_id, descripcion, cuadros)
       VALUES (?, ?, ?)`,
      [criterioId, descripcion.trim(), cuadrosVal]
    );

    res.json({
      success: true,
      message: 'Indicador registrado correctamente',
      criterio_id: criterioId
    });
  } catch (error) {
    console.error('Error creando criterio:', error);
    res.status(500).json({ error: 'Error al registrar indicador' });
  }
});

/**
 * PUT /api/docente/cursos/:cursoId/criterios/:criterioId
 * Actualizar criterio/indicador (descripción, abreviatura, peso, cuadros, bimestre)
 */
router.put('/cursos/:cursoId/criterios/:criterioId', async (req, res) => {
  try {
    const { cursoId, criterioId } = req.params;
    const { colegio_id, personal_id } = req.user;
    const { descripcion, abreviatura, ciclo, peso, cuadros } = req.body;

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }
    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: 'La descripción es obligatoria' });
    }

    const asignatura = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      'a.*, n.tipo_calificacion'
    );
    if (!asignatura) return;

    const criterioRows = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE id = ? AND asignatura_id = ? AND colegio_id = ?`,
      [criterioId, cursoId, colegio_id]
    );
    if (!criterioRows.length) {
      return res.status(404).json({ error: 'Criterio no encontrado' });
    }

    const cicloInt =
      ciclo !== undefined && ciclo !== null && ciclo !== ''
        ? parseInt(ciclo, 10)
        : parseInt(criterioRows[0].ciclo, 10);
    if (!Number.isFinite(cicloInt) || cicloInt < 0 || cicloInt > 4) {
      return res.status(400).json({ error: 'Bimestre no válido' });
    }

    const esCualitativa = asignatura.tipo_calificacion === 0;
    const pesoVal = esCualitativa ? 0 : Math.max(0, parseFloat(peso) || 0);
    const abrev = (abreviatura || '').trim() || descripcion.trim().substring(0, 20);
    const cuadrosVal = esCualitativa ? 1 : Math.max(1, parseInt(cuadros, 10) || 1);

    if (!esCualitativa) {
      const maxUsados = await maxCuadrosConNotaEnCriterio(cursoId, criterioId);
      if (cuadrosVal < maxUsados) {
        return res.status(400).json({
          error: `No puede reducir a ${cuadrosVal} cuadro(s): ya hay notas registradas hasta el cuadro ${maxUsados}.`
        });
      }
    }

    await execute(
      `UPDATE asignaturas_criterios
       SET descripcion = ?, abreviatura = ?, ciclo = ?, peso = ?
       WHERE id = ? AND asignatura_id = ? AND colegio_id = ?`,
      [descripcion.trim(), abrev, cicloInt, pesoVal, criterioId, cursoId, colegio_id]
    );

    await execute(
      `UPDATE asignaturas_indicadores
       SET descripcion = ?, cuadros = ?
       WHERE criterio_id = ?`,
      [descripcion.trim(), cuadrosVal, criterioId]
    );

    res.json({
      success: true,
      message: 'Criterio actualizado correctamente'
    });
  } catch (error) {
    console.error('Error actualizando criterio:', error);
    res.status(500).json({ error: 'Error al actualizar el criterio' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/criterios/:criterioId
 * Eliminar criterio/indicador (nivel INICIAL)
 */
router.delete('/cursos/:cursoId/criterios/:criterioId', async (req, res) => {
  try {
    const { cursoId, criterioId } = req.params;
    const { colegio_id, personal_id } = req.user;

    if (!personal_id && !esStaffColegio(req.user.tipo)) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const asignatura = await verificarAccesoAsignatura(req, res, cursoId, 'a.id');
    if (!asignatura) return;

    const criterio = await query(
      `SELECT id FROM asignaturas_criterios
       WHERE id = ? AND asignatura_id = ? AND colegio_id = ?`,
      [criterioId, cursoId, colegio_id]
    );

    if (!criterio || criterio.length === 0) {
      return res.status(404).json({ error: 'Indicador no encontrado' });
    }

    await execute(`DELETE FROM asignaturas_indicadores WHERE criterio_id = ?`, [criterioId]);
    await execute(`DELETE FROM notas WHERE criterio_id = ?`, [criterioId]);
    await execute(`DELETE FROM asignaturas_criterios WHERE id = ?`, [criterioId]);

    res.json({
      success: true,
      message: 'Indicador eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando criterio:', error);
    res.status(500).json({ error: 'Error al eliminar el indicador' });
  }
});

/**
 * GET /api/docente/horario
 * Obtener horario del docente
 */
router.get('/horario', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // =============================
    // Obtener horario del docente
    // Basado en la lógica de imprimir_horario_docente del sistema anterior,
    // usando la tabla grupos_horarios + asignaturas + grupos + niveles + cursos
    // =============================

    const anioActivoInt = parseInt(anio_activo);

    // Ver qué años de grupos_horarios hay para este docente
    const aniosDisponibles = await query(
      `SELECT DISTINCT gh.anio
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g ON g.id = a.grupo_id
       WHERE (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.anio DESC`,
      [personalId, personalId]
    );

    if (!aniosDisponibles || aniosDisponibles.length === 0) {
      console.log('📅 No se encontraron registros en grupos_horarios para este docente.');
      return res.json({ horario: [] });
    }

    // Usar primero el año activo si existe en grupos_horarios, si no, el más reciente disponible
    let anioUsar = anioActivoInt;
    const existeAnioActivo = aniosDisponibles.some((row) => parseInt(row.anio) === anioActivoInt);
    if (!existeAnioActivo) {
      anioUsar = parseInt(aniosDisponibles[0].anio);
    }

    console.log(
      `📅 Años disponibles en grupos_horarios para este docente:`,
      aniosDisponibles.map((a) => a.anio)
    );
    console.log(`📅 Usando año para horario docente: ${anioUsar}`);

    // Traer todas las filas de horario con curso y grupo ya resueltos
    // Incluye horarios con asignaturas Y horarios manuales (recreos, talleres, etc.)
    // Los horarios manuales tienen descripcion pero pueden no tener asignatura_id válido
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [anioUsar, personalId, personalId]
    );

    console.log(`📅 Filas de horario crudo encontradas: ${horarioCrudo ? horarioCrudo.length : 0}`);
    if (horarioCrudo && horarioCrudo.length > 0) {
      console.log('📅 Primera fila de horario crudo:', horarioCrudo[0]);
    }

    // Mapear a un formato estándar para el frontend
    const horario = (horarioCrudo || []).map((row) => {
      // Texto del grupo: NIVEL - X° SECCION - AÑO (igual al PDF)
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) {
          grupoTexto = `${grupoTexto} - ${row.anio}`;
        }
      }

      const titulo = row.curso_nombre || row.descripcion || '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto
      };
    });

    res.json({ horario });
  } catch (error) {
    console.error('Error obteniendo horario:', error);
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/horario
 * Obtener horario de un curso específico
 */
router.get('/cursos/:cursoId/horario', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.*, c.id as curso_id, c.nombre as curso_nombre,
              g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];
    const anioActivoInt = parseInt(anio_activo);

    // Obtener horario específico de este curso
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = a.grupo_id
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND a.id = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [anioActivoInt, cursoId, personalId, personalId]
    );

    // Mapear a un formato estándar para el frontend
    const horario = (horarioCrudo || []).map((row) => {
      // Texto del grupo: NIVEL - X° SECCION - AÑO
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) {
          grupoTexto = `${grupoTexto} - ${row.anio}`;
        }
      }

      const titulo = row.curso_nombre || row.descripcion || '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto
      };
    });

    res.json({ 
      horario,
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        grupo_id: cursoInfo.grupo_id
      }
    });
  } catch (error) {
    console.error('Error obteniendo horario del curso:', error);
    res.status(500).json({ error: 'Error al obtener horario del curso' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/aula-virtual
 * Obtener link del aula virtual de un curso
 */
router.get('/cursos/:cursoId/aula-virtual', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.id, a.aula_virtual, a.habilitar_aula,
              c.nombre as curso_nombre,
              g.grado, g.seccion,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];

    res.json({ 
      aula_virtual: cursoInfo.aula_virtual || '',
      habilitar_aula: cursoInfo.habilitar_aula || 'NO',
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error obteniendo link del aula virtual:', error);
    res.status(500).json({ error: 'Error al obtener link del aula virtual' });
  }
});

/**
 * PUT /api/docente/cursos/:cursoId/aula-virtual
 * Actualizar link del aula virtual de un curso
 */
// GET: Obtener datos para copiar contenido (otras secciones y contenido disponible)
router.get('/cursos/:cursoId/copiar-contenido', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId } = req.params;

    const cursoInfo = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      `a.*, c.nombre as curso_nombre, g.grado, g.seccion, g.nivel_id, g.anio`
    );
    if (!cursoInfo) return;

    // Obtener otras asignaturas del mismo curso, mismo grado, mismo año (cualquier docente; el que tiene el contenido puede copiar a otras secciones)
    const otrasAsignaturas = await query(
      `SELECT a.id, a.curso_id, c.nombre as curso_nombre, g.grado, g.seccion, g.turno_id, t.nombre as turno_nombre
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE a.id != ?
         AND a.curso_id = ?
         AND a.colegio_id = ?
         AND g.anio = ?
         AND g.grado = ?
       ORDER BY g.seccion ASC`,
      [cursoId, cursoInfo.curso_id, colegio_id, anio_activo, cursoInfo.grado]
    );

    // Obtener todos los temas (archivos) de la asignatura actual
    const temas = await query(
      `SELECT id, nombre, ciclo, orden FROM asignaturas_archivos
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, orden ASC`,
      [cursoId]
    );

    // Obtener todas las tareas de la asignatura actual
    const tareas = await query(
      `SELECT id, titulo, ciclo FROM asignaturas_tareas
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los exámenes de la asignatura actual
    const examenes = await query(
      `SELECT id, titulo, ciclo FROM asignaturas_examenes
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los videos de la asignatura actual
    const videos = await query(
      `SELECT id, descripcion, ciclo FROM asignaturas_videos
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los enlaces de la asignatura actual
    const enlaces = await query(
      `SELECT id, descripcion, ciclo FROM asignaturas_enlaces
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Sesiones PDF del aula virtual (vinculadas a temas interactivos)
    const sesiones = await query(
      `SELECT s.id, s.titulo, s.ciclo, s.tema_id, aa.nombre AS tema_nombre
       FROM asignaturas_sesion_pdf s
       INNER JOIN asignaturas_archivos aa ON aa.id = s.tema_id AND aa.asignatura_id = s.asignatura_id
       WHERE s.asignatura_id = ?
       ORDER BY s.ciclo ASC, s.id ASC`,
      [cursoId]
    );

    res.json({
      otrasAsignaturas: otrasAsignaturas.map(a => ({
        id: a.id,
        nombre: `${a.curso_nombre} - ${a.grado}° ${a.seccion} - ${a.turno_nombre || ''}`
      })),
      temas: temas.map(t => ({
        id: t.id,
        nombre: `B${t.ciclo} - ${t.nombre}`
      })),
      tareas: tareas.map(t => ({
        id: t.id,
        nombre: `B${t.ciclo} - ${t.titulo}`
      })),
      examenes: examenes.map(e => ({
        id: e.id,
        nombre: `B${e.ciclo} - ${e.titulo}`
      })),
      videos: videos.map(v => ({
        id: v.id,
        nombre: `B${v.ciclo} - ${v.descripcion}`
      })),
      enlaces: enlaces.map(e => ({
        id: e.id,
        nombre: `B${e.ciclo} - ${e.descripcion}`
      })),
      sesiones: sesiones.map((s) => ({
        id: s.id,
        nombre: `B${s.ciclo} - ${s.titulo || 'Sesión'} (${s.tema_nombre || 'tema'})`
      }))
    });
  } catch (error) {
    console.error('Error obteniendo datos para copiar contenido:', error);
    res.status(500).json({ error: 'Error al obtener datos para copiar contenido' });
  }
});

// POST: Ejecutar copia de contenido
router.post('/cursos/:cursoId/copiar-contenido', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId } = req.params;
    const { asignatura_destino_id, temas_id, tareas_id, examenes_id, videos_id, enlaces_id, sesiones_id } = req.body;

    if (!asignatura_destino_id) {
      return res.status(400).json({ error: 'Debe seleccionar una asignatura destino' });
    }

    // Origen: docente titular de la asignatura o staff (admin/promotoría) con acceso al colegio y año
    const origenRow = await fetchAsignaturaConAcceso(
      query,
      req,
      cursoId,
      'a.*, g.grado'
    );
    if (!origenRow) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura de origen' });
    }

    const asignaturaOrigen = [origenRow];

    // Destino: cualquier asignatura del mismo curso y mismo grado (puede ser de otro docente)
    const asignaturaDestino = await query(
      `SELECT a.*, g.grado FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_destino_id, colegio_id, anio_activo]
    );

    if (asignaturaDestino.length === 0) {
      return res.status(403).json({ error: 'Asignatura destino no encontrada' });
    }

    if (asignaturaDestino[0].curso_id !== asignaturaOrigen[0].curso_id || asignaturaDestino[0].grado !== asignaturaOrigen[0].grado) {
      return res.status(403).json({ error: 'Solo puedes copiar a una sección del mismo curso y grado' });
    }

    let copiados = {
      temas: 0,
      tareas: 0,
      examenes: 0,
      videos: 0,
      enlaces: 0,
      sesiones: 0,
    };
    const omitidos = {
      temas: 0,
      tareas: 0,
      examenes: 0,
      videos: 0,
      enlaces: 0,
      sesiones: 0,
    };

    /** Mapea id de tema en origen → id de tema copiado en destino (para sesiones PDF). */
    const mapeoTemasOrigenADestino = {};

    // Copiar temas (archivos)
    if (temas_id && temas_id.length > 0) {
      for (const temaId of temas_id) {
        const tema = await query(
          `SELECT * FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`,
          [temaId, cursoId]
        );

        if (tema.length > 0) {
          const resultadoTema = await execute(
            `INSERT INTO asignaturas_archivos (asignatura_id, trabajador_id, nombre, archivo, fecha_hora, ciclo, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              asignatura_destino_id,
              tema[0].trabajador_id,
              tema[0].nombre,
              tema[0].archivo,
              fechaHoraMySQLLima(),
              tema[0].ciclo,
              tema[0].orden
            ]
          );
          if (resultadoTema && resultadoTema.insertId) {
            mapeoTemasOrigenADestino[String(temaId)] = resultadoTema.insertId;
          }
          copiados.temas++;
        } else {
          omitidos.temas += 1;
        }
      }
    }

    // Copiar tareas (con sus archivos)
    if (tareas_id && tareas_id.length > 0) {
      for (const tareaId of tareas_id) {
        const tarea = await query(
          `SELECT * FROM asignaturas_tareas WHERE id = ? AND asignatura_id = ?`,
          [tareaId, cursoId]
        );

        if (tarea.length > 0) {
          const resultado = await execute(
            `INSERT INTO asignaturas_tareas (titulo, descripcion, fecha_hora, fecha_entrega, trabajador_id, asignatura_id, ciclo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              tarea[0].titulo,
              tarea[0].descripcion,
              fechaHoraMySQLLima(),
              tarea[0].fecha_entrega,
              tarea[0].trabajador_id,
              asignatura_destino_id,
              tarea[0].ciclo
            ]
          );

          const nuevaTareaId = resultado.insertId;

          // Copiar archivos de la tarea
          const archivosTarea = await query(
            `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
            [tareaId]
          );

          for (const archivo of archivosTarea) {
            await execute(
              `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
               VALUES (?, ?, ?)`,
              [nuevaTareaId, archivo.nombre, archivo.archivo]
            );
          }

          copiados.tareas++;
        } else {
          omitidos.tareas += 1;
        }
      }
    }

    // Copiar exámenes (con preguntas y alternativas)
    if (examenes_id && examenes_id.length > 0) {
      for (const examenId of examenes_id) {
        const examen = await query(
          `SELECT * FROM asignaturas_examenes WHERE id = ? AND asignatura_id = ?`,
          [examenId, cursoId]
        );

        if (examen.length > 0) {
          const examenData = examen[0];
          const resultado = await execute(
            `INSERT INTO asignaturas_examenes (
              trabajador_id, titulo, tipo, archivo_pdf, fecha_desde, fecha_hasta, hora_desde, hora_hasta,
              asignatura_id, ciclo, preguntas_max, tipo_puntaje, puntos_correcta, penalizar_incorrecta,
              penalizacion_incorrecta, tiempo, intentos, estado, orden_preguntas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              examenData.trabajador_id,
              examenData.titulo,
              examenData.tipo,
              examenData.archivo_pdf,
              examenData.fecha_desde,
              examenData.fecha_hasta,
              examenData.hora_desde,
              examenData.hora_hasta,
              asignatura_destino_id,
              examenData.ciclo,
              examenData.preguntas_max,
              examenData.tipo_puntaje,
              examenData.puntos_correcta,
              examenData.penalizar_incorrecta,
              examenData.penalizacion_incorrecta,
              examenData.tiempo,
              examenData.intentos,
              examenData.estado,
              examenData.orden_preguntas
            ]
          );

        const nuevoExamenId = resultado.insertId;

        try {
          const bloqueSrc = await query(
            `SELECT contenido, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
            [examenId]
          );
          if (bloqueSrc.length > 0) {
            const bs = bloqueSrc[0];
            const plain = (bs.contenido || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            const hasImg = bs.imagen && String(bs.imagen).trim();
            if (plain || hasImg) {
              await execute(
                `INSERT INTO asignaturas_examenes_bloques (examen_id, contenido, imagen) VALUES (?, ?, ?)`,
                [nuevoExamenId, bs.contenido || null, hasImg ? bs.imagen : null]
              );
            }
          }
        } catch (bloqueCopyErr) {
          if (bloqueCopyErr && bloqueCopyErr.code !== 'ER_NO_SUCH_TABLE') {
            console.warn('Copiar bloque examen (curso):', bloqueCopyErr.message);
          }
        }

        // Copiar preguntas
          const preguntas = await query(
            `SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
            [examenId]
          );

          // Mapeo global de IDs antiguos a nuevos para alternativas (para actualizar par_id)
          const mapeoAlternativasGlobal = {}; // { alternativa_id_antigua: alternativa_id_nueva }

          for (const pregunta of preguntas) {
            const resultadoPregunta = await execute(
              `INSERT INTO asignaturas_examenes_preguntas (
                examen_id, descripcion, puntos, orden, tipo, imagen_puzzle, datos_adicionales
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                nuevoExamenId,
                pregunta.descripcion,
                pregunta.puntos,
                pregunta.orden,
                pregunta.tipo,
                pregunta.imagen_puzzle,
                pregunta.datos_adicionales
              ]
            );

            const nuevaPreguntaId = resultadoPregunta.insertId;

            // Copiar alternativas
            const alternativas = await query(
              `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [pregunta.id]
            );

            for (const alternativa of alternativas) {
              const resultadoAlternativa = await execute(
                `INSERT INTO asignaturas_examenes_preguntas_alternativas (
                  pregunta_id, descripcion, correcta, orden_posicion, par_id, zona_drop
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  nuevaPreguntaId,
                  alternativa.descripcion,
                  alternativa.correcta,
                  alternativa.orden_posicion,
                  null, // Temporalmente null, se actualizará después
                  alternativa.zona_drop
                ]
              );

              // Guardar mapeo de ID antiguo a nuevo
              mapeoAlternativasGlobal[alternativa.id] = resultadoAlternativa.insertId;
            }
          }

          // Actualizar par_id de las alternativas copiadas
          for (const pregunta of preguntas) {
            const alternativas = await query(
              `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [pregunta.id]
            );

            const nuevasPreguntas = await query(
              `SELECT id FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
              [nuevoExamenId]
            );

            // Encontrar el índice de la pregunta actual
            const preguntaIndex = preguntas.findIndex(p => p.id === pregunta.id);
            const nuevaPreguntaId = nuevasPreguntas[preguntaIndex].id;

            const nuevasAlternativas = await query(
              `SELECT id FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [nuevaPreguntaId]
            );

            for (let i = 0; i < alternativas.length; i++) {
              const alternativa = alternativas[i];
              const nuevaAlternativaId = nuevasAlternativas[i].id;

              if (alternativa.par_id && mapeoAlternativasGlobal[alternativa.par_id]) {
                const nuevoParId = mapeoAlternativasGlobal[alternativa.par_id];
                await execute(
                  `UPDATE asignaturas_examenes_preguntas_alternativas SET par_id = ? WHERE id = ?`,
                  [nuevoParId, nuevaAlternativaId]
                );
              }
            }
          }

          copiados.examenes++;
        } else {
          omitidos.examenes += 1;
        }
      }
    }

    // Copiar videos
    if (videos_id && videos_id.length > 0) {
      for (const videoId of videos_id) {
        const video = await query(
          `SELECT * FROM asignaturas_videos WHERE id = ? AND asignatura_id = ?`,
          [videoId, cursoId]
        );

        if (video.length > 0) {
          await execute(
            `INSERT INTO asignaturas_videos (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              asignatura_destino_id,
              video[0].trabajador_id,
              video[0].descripcion,
              video[0].enlace,
              video[0].ciclo,
              fechaHoraMySQLLima()
            ]
          );
          copiados.videos++;
        } else {
          omitidos.videos += 1;
        }
      }
    }

    // Copiar enlaces
    if (enlaces_id && enlaces_id.length > 0) {
      for (const enlaceId of enlaces_id) {
        const enlace = await query(
          `SELECT * FROM asignaturas_enlaces WHERE id = ? AND asignatura_id = ?`,
          [enlaceId, cursoId]
        );

        if (enlace.length > 0) {
          await execute(
            `INSERT INTO asignaturas_enlaces (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              asignatura_destino_id,
              enlace[0].trabajador_id,
              enlace[0].descripcion,
              enlace[0].enlace,
              enlace[0].ciclo,
              fechaHoraMySQLLima()
            ]
          );
          copiados.enlaces++;
        } else {
          omitidos.enlaces += 1;
        }
      }
    }

    const trabajadorDestino = personal_id || asignaturaOrigen[0].personal_id;

    // Copiar sesiones PDF (vinculadas a tema interactivo en destino)
    if (sesiones_id && sesiones_id.length > 0) {
      for (const sesionId of sesiones_id) {
        const sesionRows = await query(
          `SELECT * FROM asignaturas_sesion_pdf WHERE id = ? AND asignatura_id = ?`,
          [sesionId, cursoId]
        );

        if (sesionRows.length === 0) {
          omitidos.sesiones += 1;
          continue;
        }
        const s = sesionRows[0];

        const temaDestinoId = await resolverTemaDestinoId(query, {
          temaOrigenId: s.tema_id,
          asignaturaOrigenId: cursoId,
          asignaturaDestinoId: asignatura_destino_id,
          mapeoTemasOrigenADestino,
        });

        if (!temaDestinoId) {
          omitidos.sesiones += 1;
          continue;
        }

        await execute(
          `INSERT INTO asignaturas_sesion_pdf (asignatura_id, tema_id, titulo, descripcion, archivo, ciclo, trabajador_id, fecha_hora, colegio_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            asignatura_destino_id,
            temaDestinoId,
            s.titulo,
            s.descripcion,
            s.archivo,
            s.ciclo,
            trabajadorDestino || s.trabajador_id,
            s.fecha_hora,
            colegio_id,
          ]
        );
        copiados.sesiones++;
      }
    }

    // Registrar auditoría
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'COPIAR',
      modulo: 'Cursos Asignados',
      entidad: 'Contenido Aula Virtual',
      entidad_id: cursoId,
      descripcion: `Copió contenido de asignatura (ID: ${cursoId}) a asignatura (ID: ${asignatura_destino_id}). Temas: ${copiados.temas}, Tareas: ${copiados.tareas}, Exámenes: ${copiados.examenes}, Videos: ${copiados.videos}, Enlaces: ${copiados.enlaces}, Sesiones: ${copiados.sesiones}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ asignatura_destino_id, copiados }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    const totalOmitidos = Object.values(omitidos).reduce((a, b) => a + b, 0);
    res.json({
      success: true,
      message: totalOmitidos
        ? 'Contenido copiado con algunos elementos omitidos (revise el detalle).'
        : 'Contenido copiado correctamente',
      copiados,
      omitidos,
    });
  } catch (error) {
    console.error('Error copiando contenido:', error);
    res.status(500).json({ error: 'Error al copiar contenido' });
  }
});

router.put('/cursos/:cursoId/aula-virtual', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, usuario_id } = req.user;
    const { aula_virtual, habilitar_aula } = req.body;

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Validar habilitar_aula
    if (habilitar_aula !== undefined && habilitar_aula !== 'SI' && habilitar_aula !== 'NO') {
      return res.status(400).json({ error: 'habilitar_aula debe ser "SI" o "NO"' });
    }

    const asignatura = await verificarAccesoAsignatura(
      req,
      res,
      cursoId,
      'a.*',
      'No tienes acceso a este curso'
    );
    if (!asignatura) return;

    // Construir query de actualización
    const updates = [];
    const params = [];

    if (aula_virtual !== undefined) {
      updates.push('a.aula_virtual = ?');
      params.push(aula_virtual || ''); // Permitir guardar en blanco
    }

    if (habilitar_aula !== undefined) {
      updates.push('a.habilitar_aula = ?');
      params.push(habilitar_aula);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    params.push(cursoId, colegio_id, anio_activo);

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      aula_virtual: aula_virtual || '',
      habilitar_aula: habilitar_aula
    };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id: usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR_AULA_VIRTUAL',
      modulo: 'CURSOS',
      entidad: 'asignaturas',
      entidad_id: cursoId,
      descripcion: `Actualizó link del aula virtual del curso ID: ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(asignatura),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar asignatura (usar alias 'a' para las columnas en SET)
    await execute(
      `UPDATE asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       SET ${updates.join(', ')}
       WHERE a.id = ? AND a.colegio_id = ? AND g.anio = ?`,
      params
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Obtener datos actualizados
    const asignaturaActualizada = await query(
      `SELECT a.aula_virtual, a.habilitar_aula,
              c.nombre as curso_nombre,
              g.grado, g.seccion,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ?`,
      [cursoId]
    );

    res.json({ 
      success: true,
      message: 'Link del aula virtual actualizado correctamente',
      aula_virtual: asignaturaActualizada[0]?.aula_virtual || '',
      habilitar_aula: asignaturaActualizada[0]?.habilitar_aula || 'NO',
      curso: {
        id: cursoId,
        curso_nombre: asignaturaActualizada[0]?.curso_nombre,
        grado: asignaturaActualizada[0]?.grado,
        seccion: asignaturaActualizada[0]?.seccion,
        nivel_nombre: asignaturaActualizada[0]?.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error actualizando link del aula virtual:', error);
    res.status(500).json({ error: 'Error al actualizar link del aula virtual' });
  }
});

const {
  verificarAccesoGrupoTutoria,
  listarGruposTutoriaGeneral,
  filaGrupoTutoriaOGeneral,
  esTutoriaGeneralUsuario
} = require('../utils/tutoriaGrupoAcceso');
const { esTutoriaGeneralActivo } = require('../utils/tutoriaGeneral');
const { esCajeroCajaChicaActivo } = require('../utils/cajaChicaCajeros');

router.use('/tutoria/grupos/:grupoId', async (req, res, next) => {
  try {
    const grupoId = req.params.grupoId;
    if (!(await verificarAccesoGrupoTutoria(req, res, grupoId))) return;
    next();
  } catch (e) {
    console.error('[tutoria/grupo acceso]', e);
    res.status(500).json({ error: 'Error verificando acceso al grupo' });
  }
});

/**
 * GET /api/docente/tutoria
 * Verificar si el docente es tutor y obtener TODOS los grupos donde es tutor
 */
router.get('/tutoria', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (req._tutoriaAccesoGeneral) {
      const grupos = await listarGruposTutoriaGeneral(colegio_id, anio_activo);
      return res.json({
        es_tutoria_general: true,
        es_tutor: false,
        grupos: grupos || []
      });
    }

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener TODOS los grupos donde es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, n.tipo_calificacion, t.nombre as turno_nombre,
              (SELECT COUNT(*) 
               FROM matriculas m 
               WHERE m.grupo_id = g.id 
               AND m.colegio_id = ? 
               AND (m.estado = 0)) as total_alumnos
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [colegio_id, personalId, personalId, colegio_id, anio_activo]
    );

    res.json({
      es_tutor: gruposTutor.length > 0,
      grupos: gruposTutor || []
    });
  } catch (error) {
    console.error('Error verificando tutoría:', error);
    res.status(500).json({ error: 'Error al verificar tutoría' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/deudores/conceptos
 * Opciones de filtro (misma convención que reporte admin: todos, 0=matrícula, 1..N=pensión).
 */
router.get('/tutoria/grupos/:grupoId/deudores/conceptos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId && !req._tutoriaGrupoAccesoOk) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }
    const ok = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && (!ok || ok.length === 0)) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }
    const anioParam = parseInt(req.query.anio, 10);
    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anio =
      !isNaN(anioParam) && anioParam > 0
        ? anioParam
        : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';
    const nombresMes = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre'
    ];
    const opciones = [
      { value: 'todos', label: 'Todos (saldo pendiente)' },
      { value: '0', label: 'Matrícula' }
    ];
    for (let i = 1; i <= totalPensiones; i += 1) {
      const indiceMes = 2 + i;
      if (indiceMes > 12) continue;
      opciones.push({
        value: String(i),
        label: `Mensualidad ${nombresMes[indiceMes] || `Mes ${i}`}`
      });
    }
    res.json({ anio, moneda, opciones });
  } catch (e) {
    console.error('[tutoria/deudores/conceptos]', e);
    res.status(500).json({ error: 'Error al cargar conceptos' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/deudores?anio=&tipo=
 */
router.get('/tutoria/grupos/:grupoId/deudores', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId && !req._tutoriaGrupoAccesoOk) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }
    const grupoTutor = await query(
      `SELECT g.*, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }
    const anioParam = parseInt(req.query.anio, 10);
    const tipoRaw = req.query.tipo;
    const [colegio] = await query(
      `SELECT anio_activo, total_pensiones, moneda, titulo_intranet, razon_social
       FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const anio =
      !isNaN(anioParam) && anioParam > 0
        ? anioParam
        : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';
    const colegioNombre = (colegio?.razon_social || colegio?.titulo_intranet || 'Colegio').trim();
    const g = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor);
    if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
    const grupoEtiqueta = `${g.grado}° ${g.seccion || ''} — ${g.nivel_nombre || ''}`.trim();

    let payload;
    try {
      payload = await listarDeudoresGrupo(query, {
        colegio_id,
        grupo_id: parseInt(grupoId, 10),
        anio,
        tipoRaw,
        totalPensiones
      });
    } catch (err) {
      if (err.code === 'INVALID_TIPO') {
        return res.status(400).json({
          error: 'Parámetro tipo inválido (0=matrícula, 1..N=pensión, o todos)'
        });
      }
      throw err;
    }

    const filasConObs = await mergeObservacionesTutor(query, colegio_id, payload.filas);

    res.json({
      colegio_nombre: colegioNombre,
      grupo_etiqueta: grupoEtiqueta,
      anio,
      moneda,
      concepto: payload.concepto,
      total_alumnos_unicos: payload.total_alumnos_unicos,
      filas: filasConObs
    });
  } catch (e) {
    console.error('[tutoria/deudores]', e);
    res.status(500).json({ error: 'Error al obtener deudores del grupo' });
  }
});

/**
 * PUT /api/docente/tutoria/grupos/:grupoId/deudores/observaciones
 * Body: { items: [{ matricula_id, tipo_concepto, nro_concepto, observaciones }] }
 */
router.put('/tutoria/grupos/:grupoId/deudores/observaciones', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo, usuario_id } = req.user;
    const uid = usuario_id || req.user.id;
    const personalId = req.user.personal_id;
    if (!personalId || !uid) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }
    const gid = parseInt(grupoId, 10);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.json({ ok: true, guardados: 0 });
    }
    const matIds = [...new Set(items.map((it) => parseInt(it.matricula_id, 10)).filter((n) => !isNaN(n)))];
    if (matIds.length === 0) {
      return res.status(400).json({ error: 'No hay matrículas válidas' });
    }
    const ph = matIds.map(() => '?').join(',');
    const mats = await query(
      `SELECT id FROM matriculas
       WHERE colegio_id = ? AND grupo_id = ? AND id IN (${ph}) AND (estado = 0)`,
      [colegio_id, gid, ...matIds]
    );
    const permitidas = new Set((mats || []).map((m) => m.id));
    let guardados = 0;
    for (const it of items) {
      const mid = parseInt(it.matricula_id, 10);
      if (!permitidas.has(mid)) continue;
      const tc = parseInt(it.tipo_concepto, 10);
      const nc = parseInt(it.nro_concepto, 10);
      if (tc !== 0 && tc !== 1) continue;
      if (nc < 0 || Number.isNaN(nc)) continue;
      const obs = it.observaciones != null ? String(it.observaciones).slice(0, 65000) : '';
      try {
        await execute(
          `INSERT INTO tutor_deuda_seguimiento
            (colegio_id, grupo_id, matricula_id, tipo_concepto, nro_concepto, observaciones, usuario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             observaciones = VALUES(observaciones),
             usuario_id = VALUES(usuario_id),
             grupo_id = VALUES(grupo_id),
             updated_at = CURRENT_TIMESTAMP`,
          [colegio_id, gid, mid, tc, nc, obs || null, uid]
        );
        guardados += 1;
      } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
          return res.status(503).json({
            error:
              'La tabla de seguimiento no existe en el servidor. Ejecute la migración 041_tutor_deuda_seguimiento_mysql.sql.'
          });
        }
        throw err;
      }
    }
    res.json({ ok: true, guardados });
  } catch (e) {
    console.error('[tutoria/deudores/observaciones]', e);
    res.status(500).json({ error: 'Error al guardar observaciones' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/cursos
 * Obtener cursos (asignaturas) de un grupo específico del tutor
 */
router.get('/tutoria/grupos/:grupoId/cursos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    // Obtener asignaturas (cursos) del grupo (mismo nivel/grado/sección/año para todo el grupo)
    const cursos = await query(
      `SELECT DISTINCT
              a.id as asignatura_id,
              a.id as id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              c.imagen as curso_imagen,
              g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              p.id as docente_id,
              p.foto as docente_foto,
              (SELECT u.id FROM usuarios u 
               WHERE u.personal_id = p.id AND u.estado = 'ACTIVO' 
               LIMIT 1) as docente_usuario_id,
              a.aula_virtual as link_aula_virtual
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Construir URLs de imágenes
    const cursosConImagenes = cursos.map(curso => {
      let cursoImagenUrl = null;
      let docenteFotoUrl = null;

      if (curso.curso_imagen) {
        cursoImagenUrl = curso.curso_imagen.startsWith('http') 
          ? curso.curso_imagen 
          : `${process.env.URL_SISTEMA_ANTERIOR || 'https://sistema.vanguardschools.edu.pe'}/assets/cursos/${curso.curso_imagen}`;
      }

      // Construir URL de foto del docente (igual que en /hijos/:hijoId/cursos)
      if (curso.docente_foto && curso.docente_foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          docenteFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${curso.docente_foto}`;
        } else {
          docenteFotoUrl = `http://localhost:5000/Static/Image/Fotos/${curso.docente_foto}`;
        }
      }

      return {
        ...curso,
        curso_imagen_url: cursoImagenUrl,
        docente_foto_url: docenteFotoUrl
      };
    });

    res.json({ cursos: cursosConImagenes });
  } catch (error) {
    console.error('Error obteniendo cursos del grupo:', error);
    res.status(500).json({ error: 'Error al obtener los cursos del grupo' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/notas-todos?ciclo=1
 * Obtener notas de TODOS los cursos del grupo (para exportar PDF por curso, hoja por hoja)
 * El tutor puede ver notas de todos los cursos de su grupo aunque no los dicte
 */
router.get('/tutoria/grupos/:grupoId/notas-todos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { ciclo = 1 } = req.query;
    const cicloInt = parseInt(ciclo) || 1;

    if (!personal_id && !req._tutoriaGrupoAccesoOk) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, n.tipo_calificacion, n.tipo_calificacion_final,
              n.nota_aprobatoria, n.nota_maxima, n.nota_minima
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    const grupoRow = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor, {
      withTurno: false,
      extraFields: 'n.tipo_calificacion, n.tipo_calificacion_final, n.nota_aprobatoria, n.nota_maxima, n.nota_minima'
    });
    if (!grupoRow) return res.status(404).json({ error: 'Grupo no encontrado' });

    const anioGrupo = parseInt(grupoRow.anio, 10) || parseInt(anio_activo, 10);
    const { cursos: cursosConNotas, grupo: grupoInfo } = await fetchNotasTodosGrupoData(query, {
      grupoId,
      colegio_id,
      anioGrupo,
      cicloInt,
    });

    res.json({ cursos: cursosConNotas, grupo: grupoInfo });
  } catch (error) {
    console.error('Error obteniendo notas de todos los cursos:', error);
    res.status(500).json({ error: 'Error al obtener notas del grupo' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/tareas
 * Obtener tareas del aula virtual (para tutores - modo solo lectura)
 * IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/tareas', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;

    console.log('🔵 [TUTOR-TAREAS] Parámetros recibidos:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      asignatura_id,
      ciclo,
      usuario_id: req.user.usuario_id,
      tipo: req.user.tipo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-TAREAS] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-TAREAS] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (grupoTutor.length === 0) {
      // Intentar verificar sin anio para debug
      const grupoSinAnio = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?`,
        [grupoId, personalId, personalId, colegio_id]
      );
      // También verificar si el grupo existe pero con otro tutor_id
      const grupoExiste = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [grupoId, colegio_id, anio_activo]
      );
      
      console.error('❌ [TUTOR-TAREAS] No se encontró grupo como tutor. Debug:', {
        grupoSinAnio: grupoSinAnio.length > 0,
        grupoDataSinAnio: grupoSinAnio[0] || null,
        anioEnGrupo: grupoSinAnio[0]?.anio,
        anioEsperado: anio_activo,
        grupoExiste: grupoExiste.length > 0,
        tutorIdEnGrupo: grupoExiste[0]?.tutor_id,
        personalIdEsperado: personalId,
        sonIguales: grupoExiste[0]?.tutor_id == personalId
      });
      if (!req._tutoriaGrupoAccesoOk) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*
       FROM asignaturas a
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener tareas (solo lectura - no se pueden modificar)
    // Usar la misma tabla que el endpoint de hijos
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.asignatura_id = ? AND t.ciclo = ?
       ORDER BY t.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs de archivos (igual que en el endpoint de hijos)
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const tareasConArchivos = await Promise.all(tareas.map(async (tarea) => {
      const archivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );

      const archivosConUrls = archivos.map(archivo => {
        let archivoUrl = null;
        if (archivo.archivo && archivo.archivo !== '') {
          if (archivo.archivo.startsWith('http')) {
            archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl);
          } else if (archivo.archivo.startsWith('/Static/')) {
            const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
              : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
          } else {
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
              : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
          }
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });

      let enlaceUrl = null;
      if (tarea.enlace && tarea.enlace !== '') {
        enlaceUrl = tarea.enlace.trim();
      }

      return {
        ...tarea,
        archivos: archivosConUrls,
        enlace_url: enlaceUrl
      };
    }));

    res.json({ tareas: tareasConArchivos || [] });
  } catch (error) {
    console.error('❌ [TUTOR-TAREAS] Error obteniendo tareas:', error);
    console.error('❌ [TUTOR-TAREAS] Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Error al obtener las tareas' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/tareas/:tareaId
 * Detalle de tarea para tutor (solo lectura): incluye entregas de alumnos y notas registradas por docente
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/tareas/:tareaId', async (req, res) => {
  try {
    const { grupoId, tareaId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const grupoTutor = await query(
      `SELECT g.id
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && (!grupoTutor || grupoTutor.length === 0)) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    const tarea = await query(
      `SELECT t.*,
              CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre,
              a.id AS asignatura_id,
              a.grupo_id
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       WHERE t.id = ? AND a.grupo_id = ? AND a.colegio_id = ?
       LIMIT 1`,
      [tareaId, grupoId, colegio_id]
    );
    if (!tarea || tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin acceso' });
    }
    const tareaData = tarea[0];

    const archivos = await query(
      `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
      [tareaId]
    );
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = (archivos || []).map((archivo) => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return { ...archivo, archivo_url: archivoUrl };
    });

    const entregas = await query(
      `SELECT ate.*,
              ate.alumno_id,
              CONCAT(COALESCE(al.apellido_paterno,''), ' ', COALESCE(al.apellido_materno,''), ', ', COALESCE(al.nombres,'')) AS alumno_nombre
       FROM asignaturas_tareas_entregas ate
       LEFT JOIN alumnos al ON al.id = ate.alumno_id
       WHERE ate.tarea_id = ? AND ate.tipo = 'ALUMNO'
       ORDER BY ate.fecha_hora DESC`,
      [tareaId]
    );

    const notas = await query(
      `SELECT atn.matricula_id, atn.nota,
              m.alumno_id,
              CONCAT(COALESCE(al.apellido_paterno,''), ' ', COALESCE(al.apellido_materno,''), ', ', COALESCE(al.nombres,'')) AS alumno_nombre
       FROM asignaturas_tareas_notas atn
       INNER JOIN matriculas m ON m.id = atn.matricula_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE atn.tarea_id = ?`,
      [tareaId]
    );
    const notaPorAlumno = new Map((notas || []).map((n) => [String(n.alumno_id), n.nota]));
    const entregasConNota = (entregas || []).map((e) => ({
      ...e,
      nota: notaPorAlumno.has(String(e.alumno_id)) ? notaPorAlumno.get(String(e.alumno_id)) : null
    }));

    res.json({
      tarea: {
        ...tareaData,
        archivos: archivosConUrls,
        entregas: entregasConNota,
        nota: null,
        enlace_url: tareaData.enlace ? String(tareaData.enlace).trim() : null
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalle de tarea (tutor):', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalle de la tarea' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/config
 * Igual que /aula-virtual/config (tutor del grupo)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/config', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    const colegio = await query(`SELECT total_notas FROM colegios WHERE id = ?`, [colegio_id]);
    if (!colegio.length) return res.status(404).json({ error: 'Colegio no encontrado' });
    res.json({ total_notas: colegio[0].total_notas || 4 });
  } catch (error) {
    console.error('Error config aula tutor:', error);
    res.status(500).json({ error: error.message || 'Error al obtener configuración' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/temas
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/temas', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const asignatura = await query(
      `SELECT a.id FROM asignaturas a WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );
    if (!asignatura.length) return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    const temas = await query(
      `SELECT * FROM asignaturas_temas WHERE asignatura_id = ? ORDER BY fecha DESC, id DESC`,
      [asignatura_id]
    );
    res.json({ temas: temas || [] });
  } catch (error) {
    console.error('Error temas aula tutor:', error);
    res.status(500).json({ error: error.message || 'Error al obtener temas' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/sesiones
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/sesiones', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const cicloFiltro = ciclo ? parseInt(ciclo, 10) : 1;
    const asignatura = await query(
      `SELECT a.id FROM asignaturas a WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );
    if (!asignatura.length) return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    const sesiones = await query(
      `SELECT s.*, aa.nombre as tema_nombre
       FROM asignaturas_sesion_pdf s
       INNER JOIN asignaturas_archivos aa ON aa.id = s.tema_id
       WHERE s.asignatura_id = ? AND s.ciclo = ?
       ORDER BY s.id ASC`,
      [asignatura_id, cicloFiltro]
    );
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const sesionesConUrl = (sesiones || []).map((s) => {
      let archivoUrl = null;
      if (s.archivo && s.archivo !== '') {
        const nombre = String(s.archivo).startsWith('/Static/Archivos/')
          ? String(s.archivo).replace(/^\/Static\/Archivos\//, '')
          : s.archivo;
        archivoUrl = isDevelopment
          ? `http://localhost:5000/Static/Archivos/${nombre}`
          : `${phpSystemUrl}/Static/Archivos/${nombre}`;
      }
      return { ...s, archivo_url: archivoUrl };
    });
    res.json({ sesiones: sesionesConUrl });
  } catch (error) {
    console.error('Error sesiones aula tutor:', error);
    res.status(500).json({ error: error.message || 'Error al obtener sesiones' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/tareas/:tareaId/entregas
 * Misma respuesta que /aula-virtual/tareas/:tareaId/entregas (solo lectura para tutor)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/tareas/:tareaId/entregas', async (req, res) => {
  try {
    const { grupoId, tareaId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    const tarea = await query(
      `SELECT t.*, a.grupo_id, g.grado, g.seccion, g.id as grupo_id_real, c.nombre as curso_nombre,
              n.nota_minima, n.nota_maxima, n.tipo_calificacion, n.nombre as nivel_nombre
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE t.id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [tareaId, grupoId, colegio_id, anio_activo]
    );
    if (!tarea.length) return res.status(404).json({ error: 'Tarea no encontrada o sin acceso' });
    const tareaInfo = tarea[0];
    const gid = tareaInfo.grupo_id_real || tareaInfo.grupo_id;
    const alumnos = await query(
      `SELECT a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g2 ON g2.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g2.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [gid, colegio_id, anio_activo]
    );
    const entregas = await query(
      `SELECT * FROM asignaturas_tareas_entregas WHERE tarea_id = ? AND tipo = 'ALUMNO' ORDER BY fecha_hora DESC`,
      [tareaId]
    );
    const notas = await query(`SELECT * FROM asignaturas_tareas_notas WHERE tarea_id = ?`, [tareaId]);
    let vistos = [];
    try {
      if (tareaInfo.visto && tareaInfo.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaInfo.visto);
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (e) {
      vistos = [];
    }
    const entregasPorAlumno = {};
    entregas.forEach((entrega) => {
      if (!entregasPorAlumno[entrega.alumno_id]) entregasPorAlumno[entrega.alumno_id] = [];
      entregasPorAlumno[entrega.alumno_id].push({
        id: entrega.id,
        url: entrega.url,
        nombre: entrega.nombre,
        fecha_hora: entrega.fecha_hora
      });
    });
    const notasPorMatricula = {};
    notas.forEach((n) => {
      notasPorMatricula[n.matricula_id] = n.nota;
    });
    const alumnosConDatos = alumnos.map((alumno, index) => {
      const entregasAlumno = entregasPorAlumno[alumno.alumno_id] || [];
      const nota = notasPorMatricula[alumno.matricula_id] || '';
      const visto = Array.isArray(vistos) && vistos.includes(alumno.alumno_id) ? 'SI' : 'NO';
      return {
        numero: index + 1,
        alumno_id: alumno.alumno_id,
        matricula_id: alumno.matricula_id,
        nombre_completo: alumno.nombre_completo,
        nota,
        visto,
        archivos: entregasAlumno
      };
    });
    res.json({
      alumnos: alumnosConDatos,
      tarea: {
        id: tareaInfo.id,
        titulo: tareaInfo.titulo,
        curso_nombre: tareaInfo.curso_nombre,
        grado: tareaInfo.grado,
        seccion: tareaInfo.seccion,
        nota_minima: tareaInfo.nota_minima,
        nota_maxima: tareaInfo.nota_maxima,
        tipo_calificacion: tareaInfo.tipo_calificacion,
        nivel_nombre: tareaInfo.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error entregas tarea tutor:', error);
    res.status(500).json({ error: 'Error al obtener entregas' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultados
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultados', async (req, res) => {
  try {
    const { grupoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, grupoId, colegio_id, anio_activo]
    );
    if (!examen.length) return res.status(403).json({ error: 'No tienes acceso a este examen' });
    const resultados = await query(
      `SELECT COALESCE(aep.id, NULL) as resultado_id, m.id as matricula_id,
              COALESCE(aep.fecha_hora, NULL) as fecha_hora, aep.puntaje as puntaje,
              aep.correctas as correctas, aep.incorrectas as incorrectas,
              COALESCE(aep.estado, NULL) as estado,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              a.nombres, a.apellido_paterno, a.apellido_materno
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       LEFT JOIN asignaturas_examenes_pruebas aep ON aep.matricula_id = m.id AND aep.examen_id = ?
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres ASC`,
      [examenId, grupoId, colegio_id]
    );
    res.json({ examen: examen[0], resultados: resultados || [] });
  } catch (error) {
    console.error('Error resultados examen tutor:', error);
    res.status(500).json({ error: 'Error al obtener resultados del examen' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/resultados/:resultadoId/detalles
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/resultados/:resultadoId/detalles', async (req, res) => {
  try {
    const { grupoId, resultadoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !grupoTutor.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    const resultado = await query(
      `SELECT aep.*, ae.titulo as examen_titulo, ae.tipo_puntaje, ae.puntos_correcta,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
       INNER JOIN asignaturas a_asig ON a_asig.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a_asig.grupo_id
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE aep.id = ? AND a_asig.grupo_id = ? AND a_asig.colegio_id = ? AND g.anio = ?`,
      [resultadoId, grupoId, colegio_id, anio_activo]
    );
    if (!resultado.length) return res.status(403).json({ error: 'No tienes acceso a este resultado' });
    const resultadoInfo = resultado[0];
    const examenId = resultadoInfo.examen_id;
    let preguntaIds = [];
    try {
      if (resultadoInfo.preguntas && String(resultadoInfo.preguntas).trim() !== '') {
        try {
          preguntaIds = JSON.parse(resultadoInfo.preguntas);
          if (!Array.isArray(preguntaIds)) preguntaIds = [];
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.preguntas, 'base64').toString('utf-8');
            preguntaIds = phpSerialize.unserialize(decoded) || [];
            if (!Array.isArray(preguntaIds)) preguntaIds = [];
          } catch (phpError) {
            preguntaIds = [];
          }
        }
      }
    } catch (e) {
      preguntaIds = [];
    }
    let preguntasRows = [];
    if (preguntaIds.length > 0) {
      const placeholders = preguntaIds.map(() => '?').join(',');
      preguntasRows = await query(
        `SELECT * FROM asignaturas_examenes_preguntas
         WHERE examen_id = ? AND id IN (${placeholders})
         ORDER BY FIELD(id, ${placeholders})`,
        [examenId, ...preguntaIds, ...preguntaIds]
      );
    } else {
      preguntasRows = await query(
        `SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
        [examenId]
      );
    }
    const preguntasConAlternativas = [];
    for (const pregunta of preguntasRows || []) {
      const alts = await query(
        `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
        [pregunta.id]
      );
      preguntasConAlternativas.push({
        ...pregunta,
        alternativas: (alts || []).map((a) => ({
          id: a.id,
          descripcion: a.descripcion || '',
          correcta:
            a.correcta === 1 || a.correcta === '1' || a.correcta === true || a.correcta === 'SI'
              ? 'SI'
              : 'NO',
          orden_posicion: a.orden_posicion,
          par_id: a.par_id,
          zona_drop: a.zona_drop
        }))
      });
    }
    let respuestasAlumno = {};
    try {
      if (resultadoInfo.respuestas && String(resultadoInfo.respuestas).trim() !== '') {
        try {
          respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          } catch (phpError) {
            respuestasAlumno = {};
          }
        }
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach((key) => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      }
    } catch (parseError) {
      respuestasAlumno = {};
    }
    res.json({
      resultado: resultadoInfo,
      preguntas: preguntasConAlternativas,
      respuestas: respuestasAlumno
    });
  } catch (error) {
    console.error('Error detalles resultado tutor:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalles del resultado' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/examenes
 * Obtener lista de exámenes (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/examenes', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;

    console.log('🔵 [TUTOR-EXAMENES] Parámetros recibidos:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      asignatura_id,
      ciclo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-EXAMENES] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-EXAMENES] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (grupoTutor.length === 0) {
      // Intentar verificar sin anio para debug
      const grupoSinAnio = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?`,
        [grupoId, personalId, personalId, colegio_id]
      );
      
      // También verificar si el grupo existe pero con otro tutor_id
      const grupoExiste = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [grupoId, colegio_id, anio_activo]
      );
      
      console.error('❌ [TUTOR-EXAMENES] No se encontró grupo como tutor. Debug:', {
        grupoSinAnio: grupoSinAnio.length > 0,
        anioEnGrupo: grupoSinAnio[0]?.anio,
        anioEsperado: anio_activo,
        grupoExiste: grupoExiste.length > 0,
        tutorIdEnGrupo: grupoExiste[0]?.tutor_id,
        personalIdEsperado: personalId,
        sonIguales: grupoExiste[0]?.tutor_id == personalId
      });
      if (!req._tutoriaGrupoAccesoOk) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*
       FROM asignaturas a
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener exámenes (solo lectura) - usar asignaturas_examenes como en hijos
    const examenes = await query(
      `SELECT ae.*, 
              COUNT(DISTINCT ep.id) as total_preguntas
       FROM asignaturas_examenes ae
       LEFT JOIN asignaturas_examenes_preguntas ep ON ep.examen_id = ae.id
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       GROUP BY ae.id
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    const examenesConInfo = await Promise.all((examenes || []).map(async (ex) => {
      const r = await query(
        `SELECT COUNT(*) AS total
         FROM asignaturas_examenes_pruebas aep
         INNER JOIN matriculas m ON m.id = aep.matricula_id
         WHERE aep.examen_id = ? AND m.grupo_id = ?`,
        [ex.id, grupoId]
      );
      return {
        ...ex,
        tiene_resultados: (r && r[0] && r[0].total > 0) || false
      };
    }));

    res.json({ examenes: examenesConInfo || [] });
  } catch (error) {
    console.error('❌ [TUTOR-EXAMENES] Error obteniendo exámenes:', error);
    console.error('❌ [TUTOR-EXAMENES] Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Error al obtener los exámenes' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/archivos
 * Obtener archivos del aula virtual (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/archivos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;

    console.log('🔵 [TUTOR-ARCHIVOS] Parámetros recibidos:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      asignatura_id,
      ciclo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-ARCHIVOS] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-ARCHIVOS] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (grupoTutor.length === 0) {
      // Intentar verificar sin anio para debug
      const grupoSinAnio = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?`,
        [grupoId, personalId, personalId, colegio_id]
      );
      
      // También verificar si el grupo existe pero con otro tutor_id
      const grupoExiste = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [grupoId, colegio_id, anio_activo]
      );
      
      console.error('❌ [TUTOR-ARCHIVOS] No se encontró grupo como tutor. Debug:', {
        grupoSinAnio: grupoSinAnio.length > 0,
        anioEnGrupo: grupoSinAnio[0]?.anio,
        anioEsperado: anio_activo,
        grupoExiste: grupoExiste.length > 0,
        tutorIdEnGrupo: grupoExiste[0]?.tutor_id,
        personalIdEsperado: personalId,
        sonIguales: grupoExiste[0]?.tutor_id == personalId
      });
      if (!req._tutoriaGrupoAccesoOk) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*
       FROM asignaturas a
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener archivos (solo lectura)
    const archivos = await query(
      `SELECT a.*
       FROM asignaturas_archivos a
       WHERE a.asignatura_id = ? AND a.ciclo = ?
       ORDER BY a.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs de archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return {
        ...archivo,
        archivo_url: archivoUrl
      };
    });

    res.json({ archivos: archivosConUrls || [] });
  } catch (error) {
    console.error('❌ [TUTOR-ARCHIVOS] Error obteniendo archivos:', error);
    console.error('❌ [TUTOR-ARCHIVOS] Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Error al obtener los archivos' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/videos
 * Obtener videos del aula virtual (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/videos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;

    console.log('🔵 [TUTOR-VIDEOS] Parámetros recibidos:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      asignatura_id,
      ciclo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-VIDEOS] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-VIDEOS] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (grupoTutor.length === 0) {
      // Intentar verificar sin anio para debug
      const grupoSinAnio = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?`,
        [grupoId, personalId, personalId, colegio_id]
      );
      
      // También verificar si el grupo existe pero con otro tutor_id
      const grupoExiste = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [grupoId, colegio_id, anio_activo]
      );
      
      console.error('❌ [TUTOR-VIDEOS] No se encontró grupo como tutor. Debug:', {
        grupoSinAnio: grupoSinAnio.length > 0,
        anioEnGrupo: grupoSinAnio[0]?.anio,
        anioEsperado: anio_activo,
        grupoExiste: grupoExiste.length > 0,
        tutorIdEnGrupo: grupoExiste[0]?.tutor_id,
        personalIdEsperado: personalId,
        sonIguales: grupoExiste[0]?.tutor_id == personalId
      });
      if (!req._tutoriaGrupoAccesoOk) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*
       FROM asignaturas a
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener videos (solo lectura)
    const videos = await query(
      `SELECT v.*
       FROM asignaturas_videos v
       WHERE v.asignatura_id = ? AND v.ciclo = ?
       ORDER BY v.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ videos: videos || [] });
  } catch (error) {
    console.error('❌ [TUTOR-VIDEOS] Error obteniendo videos:', error);
    console.error('❌ [TUTOR-VIDEOS] Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Error al obtener los videos' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/enlaces
 * Obtener enlaces del aula virtual (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/enlaces', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { asignatura_id, ciclo } = req.query;

    console.log('🔵 [TUTOR-ENLACES] Parámetros recibidos:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      asignatura_id,
      ciclo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-ENLACES] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-ENLACES] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (grupoTutor.length === 0) {
      // Intentar verificar sin anio para debug
      const grupoSinAnio = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?`,
        [grupoId, personalId, personalId, colegio_id]
      );
      
      // También verificar si el grupo existe pero con otro tutor_id
      const grupoExiste = await query(
        `SELECT g.* FROM grupos g WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [grupoId, colegio_id, anio_activo]
      );
      
      console.error('❌ [TUTOR-ENLACES] No se encontró grupo como tutor. Debug:', {
        grupoSinAnio: grupoSinAnio.length > 0,
        anioEnGrupo: grupoSinAnio[0]?.anio,
        anioEsperado: anio_activo,
        grupoExiste: grupoExiste.length > 0,
        tutorIdEnGrupo: grupoExiste[0]?.tutor_id,
        personalIdEsperado: personalId,
        sonIguales: grupoExiste[0]?.tutor_id == personalId
      });
      if (!req._tutoriaGrupoAccesoOk) return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*
       FROM asignaturas a
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignatura_id, grupoId, colegio_id]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener enlaces (solo lectura)
    const enlaces = await query(
      `SELECT e.*
       FROM asignaturas_enlaces e
       WHERE e.asignatura_id = ? AND e.ciclo = ?
       ORDER BY e.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ enlaces: enlaces || [] });
  } catch (error) {
    console.error('❌ [TUTOR-ENLACES] Error obteniendo enlaces:', error);
    console.error('❌ [TUTOR-ENLACES] Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Error al obtener los enlaces' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultado
 * Obtener resultado de un examen (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultado', async (req, res) => {
  try {
    const { grupoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    // Obtener el examen y verificar que pertenece a una asignatura del grupo
    const examen = await query(
      `SELECT ae.*, a.grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       WHERE ae.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [examenId, grupoId, colegio_id]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'El examen no pertenece a este grupo' });
    }

    // Obtener resultados del examen (para todos los alumnos del grupo)
    const resultados = await query(
      `SELECT aep.*,
              m.id AS matricula_id,
              m.alumno_id,
              al.nombres, al.apellido_paterno, al.apellido_materno
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE aep.examen_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
       ORDER BY al.apellido_paterno, al.apellido_materno, al.nombres`,
      [examenId, grupoId, colegio_id]
    );

    res.json({
      examen: examen[0],
      resultados: resultados
    });
  } catch (error) {
    console.error('Error obteniendo resultado de examen (tutor):', error);
    res.status(500).json({ error: 'Error al obtener el resultado del examen' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultado/detalles
 * Obtener detalles de resultado de un examen (para tutores - modo solo lectura)
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/examenes/:examenId/resultado/detalles', async (req, res) => {
  try {
    const { grupoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    // Obtener el examen y verificar que pertenece a una asignatura del grupo
    const examen = await query(
      `SELECT ae.*, a.grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       WHERE ae.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [examenId, grupoId, colegio_id]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'El examen no pertenece a este grupo' });
    }

    // Preguntas + alternativas sin GROUP_CONCAT (evita error 500 con sql_mode estricto / datos con ":")
    const preguntasRows = await query(
      `SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
      [examenId]
    );
    const preguntas = [];
    for (const pregunta of preguntasRows || []) {
      const alts = await query(
        `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
        [pregunta.id]
      );
      preguntas.push({
        ...pregunta,
        alternativas: (alts || []).map((a) => ({
          id: a.id,
          descripcion: a.descripcion || '',
          correcta:
            a.correcta === 1 || a.correcta === '1' || a.correcta === true || a.correcta === 'SI'
              ? 'SI'
              : 'NO',
          orden_posicion: a.orden_posicion,
          par_id: a.par_id,
          zona_drop: a.zona_drop
        }))
      });
    }

    const pruebas = await query(
      `SELECT aep.*,
              m.id AS matricula_id, m.alumno_id,
              al.nombres, al.apellido_paterno, al.apellido_materno
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE aep.examen_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
       ORDER BY al.apellido_paterno, al.apellido_materno, al.nombres, aep.fecha_hora DESC`,
      [examenId, grupoId, colegio_id]
    );

    const resultadosConDetalles = (pruebas || []).map((prueba) => {
      let respuestasAlumno = {};
      try {
        if (prueba.respuestas && String(prueba.respuestas).trim() !== '') {
          try {
            respuestasAlumno = JSON.parse(prueba.respuestas);
          } catch (jsonError) {
            try {
              const phpSerialize = require('php-serialize');
              const decoded = Buffer.from(prueba.respuestas, 'base64').toString('utf-8');
              respuestasAlumno = phpSerialize.unserialize(decoded) || {};
            } catch (phpError) {
              respuestasAlumno = {};
            }
          }
        }
      } catch (e) {
        respuestasAlumno = {};
      }
      return {
        ...prueba,
        alumno_nombre: `${prueba.apellido_paterno || ''} ${prueba.apellido_materno || ''}, ${prueba.nombres || ''}`.trim(),
        respuestas: respuestasAlumno
      };
    });

    res.json({
      examen: examen[0],
      preguntas,
      resultados: resultadosConDetalles
    });
  } catch (error) {
    console.error('Error obteniendo detalles de resultado de examen (tutor):', error);
    res.status(500).json({ error: 'Error al obtener los detalles del resultado del examen' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/aula-virtual/:asignaturaId
 * Obtener datos del aula virtual de una asignatura (para tutores - modo solo lectura)
 * IMPORTANTE: Esta ruta debe estar DESPUÉS de todas las rutas específicas (tareas, examenes, etc.)
 * para que Express capture primero las rutas específicas.
 */
router.get('/tutoria/grupos/:grupoId/aula-virtual/:asignaturaId', async (req, res) => {
  try {
    const { grupoId, asignaturaId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    console.log('🔵 [TUTOR-AULA-VIRTUAL] Parámetros recibidos:', {
      grupoId,
      asignaturaId,
      personalId,
      colegio_id,
      anio_activo,
      usuario_id: req.user.usuario_id,
      tipo: req.user.tipo
    });

    if (!personalId) {
      console.error('❌ [TUTOR-AULA-VIRTUAL] personalId no encontrado en req.user');
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*
       FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    console.log('🔵 [TUTOR-AULA-VIRTUAL] Resultado verificación tutor:', {
      grupoId,
      personalId,
      colegio_id,
      anio_activo,
      grupoEncontrado: grupoTutor.length > 0,
      grupoData: grupoTutor[0] || null
    });

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    // Verificar que la asignatura pertenece a este grupo
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, c.nombre as curso_nombre,
              g.grado, g.seccion, n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ? 
       LIMIT 1`,
      [asignaturaId, grupoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'La asignatura no pertenece a este grupo' });
    }

    const asignaturaData = asignatura[0];

    res.json({
      asignatura: {
        id: asignaturaData.id,
        curso_nombre: asignaturaData.curso_nombre,
        grado: asignaturaData.grado,
        seccion: asignaturaData.seccion,
        nivel_nombre: asignaturaData.nivel_nombre,
        docente_nombre: asignaturaData.docente_nombre || 'Docente',
        aula_virtual: asignaturaData.aula_virtual || '',
        habilitar_aula: asignaturaData.habilitar_aula || 'NO'
      },
      grupo_id: grupoId
    });
  } catch (error) {
    console.error('Error obteniendo aula virtual (tutor):', error);
    res.status(500).json({ error: error.message || 'Error al obtener aula virtual' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/horario
 * Obtener horario del grupo (igual que lo ve el alumno)
 */
router.get('/tutoria/grupos/:grupoId/horario', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && (!grupoTutor || grupoTutor.length === 0)) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    const anioActivoInt = parseInt(anio_activo);

    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre AS curso_nombre,
         gh.descripcion AS descripcion,
         g.grado,
         g.seccion,
         n.nombre AS nivel_nombre,
         CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id AND a.colegio_id = ?
       LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN personal p ON p.id = COALESCE(a.personal_id, gh.personal_id)
       WHERE gh.anio = ?
         AND (
           (a.grupo_id = ? AND a.colegio_id = ?)
           OR
           (gh.grupo_id = ? AND a.id IS NULL)
         )
       ORDER BY gh.dia,
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [colegio_id, anioActivoInt, grupoId, colegio_id, grupoId]
    );

    const horario = (horarioCrudo || []).map((row) => {
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) grupoTexto = `${grupoTexto} - ${row.anio}`;
      }
      const titulo = row.curso_nombre || row.descripcion || '';
      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto,
        docente_nombre: row.docente_nombre || ''
      };
    });

    res.json({ horario, grupo: await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor) });
  } catch (error) {
    console.error('Error obteniendo horario del grupo (tutor):', error);
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/alumnos
 * Obtener alumnos de un grupo específico del tutor
 */
router.get('/tutoria/grupos/:grupoId/alumnos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId && !req._tutoriaGrupoAccesoOk) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );

    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) { return res.status(403).json({ error: 'No eres tutor de este grupo' }); }

    const grupo = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor);
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT DISTINCT
              a.*, 
              m.id as matricula_id,
              m.fecha_registro, 
              m.estado as estado_matricula,
              a.fecha_nacimiento,
              COALESCE(
                (SELECT ap2.telefono_celular 
                 FROM familias f2 
                 INNER JOIN apoderados ap2 ON ap2.id = f2.apoderado_id 
                 WHERE f2.alumno_id = a.id 
                 AND ap2.telefono_celular IS NOT NULL 
                 AND ap2.telefono_celular != '' 
                 LIMIT 1),
                (SELECT ap3.telefono_fijo 
                 FROM familias f3 
                 INNER JOIN apoderados ap3 ON ap3.id = f3.apoderado_id 
                 WHERE f3.alumno_id = a.id 
                 AND ap3.telefono_fijo IS NOT NULL 
                 AND ap3.telefono_fijo != '' 
                 LIMIT 1),
                'N/A'
              ) as telefono
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupo.id, colegio_id]
    );

    // Construir URLs de fotos
    const alumnosConFotos = alumnos.map(alumno => {
      let fotoUrl = null;
      if (alumno.foto && alumno.foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumno.foto}`;
        } else {
          fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumno.foto}`;
        }
      }
      return { ...alumno, foto: fotoUrl };
    });

    res.json({
      grupo: grupo,
      alumnos: alumnosConFotos || []
    });
  } catch (error) {
    console.error('Error obteniendo alumnos del tutor:', error);
    res.status(500).json({ error: 'Error al obtener alumnos del tutor' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias
 * Incidencias del alumno (todas las del año); curso_nombre "Tutoría" si assignment_id es sentinel; puede_eliminar si el tutor las registró.
 */
router.get('/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { grupoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
         AND (m.estado = 0) AND g.anio = ?`,
      [alumnoId, grupoId, colegio_id, anio_activo]
    );
    if (!matricula || matricula.length === 0) return res.status(404).json({ error: 'Alumno no encontrado en este grupo' });

    const matriculaId = matricula[0].id;

    const incidencias = await query(
      `SELECT ei.id, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              CASE WHEN ei.assignment_id = ? THEN 'Tutoría' ELSE c.nombre END as curso_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? AND ei.type = 1 AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [ASSIGNMENT_ID_TUTORIA, personal_id, matriculaId, anio_activo]
    );

    res.json({
      incidencias: incidencias || [],
      total_incidencias: (incidencias || []).length,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo incidencias (tutor):', error);
    res.status(500).json({ error: 'Error al obtener incidencias' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas
 * Estrellas del alumno (todas las del año); curso_nombre "Tutoría" si assignment_id es sentinel; puede_eliminar si el tutor las registró.
 */
router.get('/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { grupoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
         AND (m.estado = 0) AND g.anio = ?`,
      [alumnoId, grupoId, colegio_id, anio_activo]
    );
    if (!matricula || matricula.length === 0) return res.status(404).json({ error: 'Alumno no encontrado en este grupo' });

    const matriculaId = matricula[0].id;

    const estrellas = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              CASE WHEN ei.assignment_id = ? THEN 'Tutoría' ELSE c.nombre END as curso_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? AND ei.type = 2 AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [ASSIGNMENT_ID_TUTORIA, personal_id, matriculaId, anio_activo]
    );

    const totalEstrellas = (estrellas || []).reduce((sum, e) => sum + (e.points || 0), 0);

    res.json({
      estrellas: estrellas || [],
      total_estrellas: totalEstrellas,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo estrellas (tutor):', error);
    res.status(500).json({ error: 'Error al obtener estrellas' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias
 * Registrar incidencia como tutor (curso mostrado: Tutoría)
 */
router.post('/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { grupoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id, usuario_id } = req.user;
    const { description } = req.body;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!description || String(description).trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
         AND (m.estado = 0) AND g.anio = ?`,
      [alumnoId, grupoId, colegio_id, anio_activo]
    );
    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este grupo para el año activo' });
    }

    const matriculaId = matricula[0].id;
    const now = fechaHoraMySQLLima();
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
      [matriculaId, ASSIGNMENT_ID_TUTORIA, personal_id, String(description).trim(), now, now]
    );

    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Registró incidencia (Tutoría) alumno ID ${alumnoId} grupo ${grupoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    }).catch(() => {});
    req.skipAudit = true;

    setImmediate(async () => {
      try {
        const alumnoInfo = await query(
          `SELECT a.id as alumno_id, CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre
           FROM alumnos a WHERE a.id = ? LIMIT 1`,
          [alumnoId]
        );
        const docRow = await query(
          `SELECT CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre FROM personal p WHERE p.id = ? LIMIT 1`,
          [personal_id]
        );
        const docenteNombre = docRow[0]?.docente_nombre || 'Tutor';
        if (alumnoInfo.length > 0) {
          await crearNotificacionesApoderados({
            alumno_id: parseInt(alumnoInfo[0].alumno_id, 10),
            usuario_id,
            colegio_id,
            anio_activo,
            tituloNotificacion: 'Incidencia Registrada',
            mensajeNotificacion: `Se registró una incidencia para ${alumnoInfo[0].alumno_nombre} en Tutoría - Docente: ${docenteNombre}`,
            tipoNotificacion: 'incidencia',
            dataExtra: { tutor_grupo_id: parseInt(grupoId, 10), incident_id: result.insertId }
          });
        }
      } catch (e) {
        console.error('❌ [INCIDENCIAS TUTORÍA] Notificaciones:', e);
      }
    });

    res.json({ success: true, message: 'Incidencia registrada correctamente', incident_id: result.insertId });
  } catch (error) {
    console.error('Error registrando incidencia (tutor):', error);
    res.status(500).json({ error: 'Error al registrar la incidencia' });
  }
});

/**
 * DELETE /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias/:incidentId
 */
router.delete('/tutoria/grupos/:grupoId/alumnos/:alumnoId/incidencias/:incidentId', async (req, res) => {
  try {
    const { grupoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id, usuario_id } = req.user;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? AND ei.worker_id = ? AND ei.type = 1
         AND m.alumno_id = ? AND m.grupo_id = ? AND g.anio = ?`,
      [incidentId, personal_id, alumnoId, grupoId, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({
        error: 'No puedes eliminar esta incidencia. Solo las que registraste para este alumno en tu grupo de tutoría.'
      });
    }

    await execute(`DELETE FROM enrollment_incidents WHERE id = ?`, [incidentId]);

    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó incidencia (tutoría) alumno ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      resultado: 'EXITOSO'
    }).catch(() => {});
    req.skipAudit = true;

    res.json({ success: true, message: 'Incidencia eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando incidencia (tutor):', error);
    res.status(500).json({ error: 'Error al eliminar la incidencia' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas
 */
router.post('/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { grupoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id, usuario_id } = req.user;
    const { points, description } = req.body;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!points || parseInt(points, 10) <= 0) {
      return res.status(400).json({ error: 'La cantidad de estrellas debe ser mayor a 0' });
    }
    if (!description || String(description).trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ?
         AND (m.estado = 0) AND g.anio = ?`,
      [alumnoId, grupoId, colegio_id, anio_activo]
    );
    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este grupo para el año activo' });
    }

    const matriculaId = matricula[0].id;
    const pts = parseInt(points, 10);
    const now = fechaHoraMySQLLima();
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 2, ?, ?, ?, ?)`,
      [matriculaId, ASSIGNMENT_ID_TUTORIA, personal_id, pts, String(description).trim(), now, now]
    );

    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Dio ${pts} estrella(s) (Tutoría) alumno ${alumnoId} grupo ${grupoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    }).catch(() => {});
    req.skipAudit = true;

    setImmediate(async () => {
      try {
        const alumnoInfo = await query(
          `SELECT a.id as alumno_id, CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre
           FROM alumnos a WHERE a.id = ? LIMIT 1`,
          [alumnoId]
        );
        const docRow = await query(
          `SELECT CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre FROM personal p WHERE p.id = ? LIMIT 1`,
          [personal_id]
        );
        const docenteNombre = docRow[0]?.docente_nombre || 'Tutor';
        if (alumnoInfo.length > 0) {
          await crearNotificacionesApoderados({
            alumno_id: parseInt(alumnoInfo[0].alumno_id, 10),
            usuario_id,
            colegio_id,
            anio_activo,
            tituloNotificacion: 'Estrella Asignada',
            mensajeNotificacion: `${alumnoInfo[0].alumno_nombre} recibió ${pts} estrella(s) en Tutoría - Docente: ${docenteNombre}`,
            tipoNotificacion: 'estrella',
            dataExtra: { tutor_grupo_id: parseInt(grupoId, 10), incident_id: result.insertId, points: pts }
          });
        }
      } catch (e) {
        console.error('❌ [ESTRELLAS TUTORÍA] Notificaciones:', e);
      }
    });

    res.json({ success: true, message: `${pts} estrella(s) asignada(s) correctamente`, incident_id: result.insertId });
  } catch (error) {
    console.error('Error dando estrellas (tutor):', error);
    res.status(500).json({ error: 'Error al asignar estrellas' });
  }
});

/**
 * DELETE /api/docente/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas/:incidentId
 */
router.delete('/tutoria/grupos/:grupoId/alumnos/:alumnoId/estrellas/:incidentId', async (req, res) => {
  try {
    const { grupoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id, usuario_id } = req.user;

    if (!personal_id) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personal_id, personal_id, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? AND ei.worker_id = ? AND ei.type = 2
         AND m.alumno_id = ? AND m.grupo_id = ? AND g.anio = ?`,
      [incidentId, personal_id, alumnoId, grupoId, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({
        error: 'No puedes eliminar estas estrellas. Solo las que tú mismo asignaste a este alumno en tu grupo de tutoría.'
      });
    }

    await execute(`DELETE FROM enrollment_incidents WHERE id = ?`, [incidentId]);

    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó estrellas (tutoría) alumno ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      resultado: 'EXITOSO'
    }).catch(() => {});
    req.skipAudit = true;

    res.json({ success: true, message: 'Estrellas eliminadas correctamente' });
  } catch (error) {
    console.error('Error eliminando estrellas (tutor):', error);
    res.status(500).json({ error: 'Error al eliminar estrellas' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/orden-merito
 * Reporte de orden de mérito del grupo (por bimestre)
 */
router.get('/tutoria/grupos/:grupoId/orden-merito', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const grupo = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor);
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });
    const primeraMatricula = await query(
      `SELECT id FROM matriculas WHERE grupo_id = ? AND (estado = 0) LIMIT 1`,
      [grupoId]
    );
    const matriculaId = primeraMatricula?.[0]?.id;
    if (!matriculaId) return res.json({ grupo: { grado: grupo.grado, seccion: grupo.seccion, nivel_nombre: grupo.nivel_nombre, anio: grupo.anio }, detalle: { b1: [], b2: [], b3: [], b4: [] } });

    const asignaturas = await query(
      `SELECT a.id as asignatura_id FROM asignaturas a
       WHERE a.grupo_id = ? AND a.colegio_id = ? ORDER BY a.id`,
      [grupoId, colegio_id]
    );
    const asignaturasIds = (asignaturas || []).map(a => a.asignatura_id).filter(id => id !== -101);
    const ordenMeritoResult = await obtenerOrdenMerito(grupoId, matriculaId, asignaturasIds);

    res.json({
      grupo: { grado: grupo.grado, seccion: grupo.seccion, nivel_nombre: grupo.nivel_nombre, anio: grupo.anio },
      detalle: ordenMeritoResult.detalle || { b1: [], b2: [], b3: [], b4: [] }
    });
  } catch (error) {
    console.error('Error obteniendo orden de mérito:', error);
    res.status(500).json({ error: 'Error al obtener orden de mérito' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/asistencia?fecha=YYYY-MM-DD
 * Obtener lista de alumnos del grupo con sus asistencias para una fecha
 */
router.get('/tutoria/grupos/:grupoId/asistencia', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { fecha } = req.query;

    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const grupoInfo = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor, { withTurno: false });

    const fechaQuery = fecha ? moment(fecha).format('YYYY-MM-DD') : moment().tz('America/Lima').format('YYYY-MM-DD');

    const matriculas = await query(
      `SELECT m.id as matricula_id, a.id as alumno_id,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id]
    );

    const asistencias = await query(
      `SELECT matricula_id, tipo, hora_entrada, hora_salida
       FROM matriculas_asistencias
       WHERE matricula_id IN (${matriculas.map(() => '?').join(',')}) AND fecha = ?`,
      [...matriculas.map(m => m.matricula_id), fechaQuery]
    );
    const mapaAsistencia = {};
    asistencias.forEach(a => { mapaAsistencia[a.matricula_id] = a; });

    const lista = matriculas.map((m, i) => ({
      numero: i + 1,
      matricula_id: m.matricula_id,
      alumno_id: m.alumno_id,
      nombre_completo: m.nombre_completo,
      asistencia: mapaAsistencia[m.matricula_id] || null,
      tipo: mapaAsistencia[m.matricula_id]?.tipo || null
    }));

    res.json({ grupo: grupoInfo, alumnos: lista, fecha: fechaQuery });
  } catch (error) {
    console.error('Error obteniendo asistencia:', error);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/asistencia
 * Guardar asistencia de un alumno (al hacer clic en Presente, Tardanza, etc)
 * Envía notificación push y correo solo cuando el tipo CAMBIA (no reenvía si ya se notificó)
 */
router.post('/tutoria/grupos/:grupoId/asistencia', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo, usuario_id } = req.user;
    const personalId = req.user.personal_id;
    const { matricula_id, fecha, tipo, hora_dispositivo } = req.body;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    if (!matricula_id || !fecha || !tipo) return res.status(400).json({ error: 'Datos incompletos' });
    const tiposValidos = ['PRESENTE', 'TARDANZA', 'TARDANZA_JUSTIFICADA', 'FALTA', 'FALTA_JUSTIFICADA'];
    if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const fechaNorm = moment(fecha).format('YYYY-MM-DD');
    let horaActual = moment().tz('America/Lima').format('HH:mm:ss');
    if (hora_dispositivo && typeof hora_dispositivo === 'string') {
      const h = hora_dispositivo.trim();
      const match = h.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (match) {
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const sec = match[3] != null ? parseInt(match[3], 10) : 0;
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
          horaActual = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
      }
    }

    const existente = await query(
      `SELECT id, tipo FROM matriculas_asistencias WHERE matricula_id = ? AND fecha = ?`,
      [matricula_id, fechaNorm]
    );

    let enviarNotificacion = false;
    if (existente.length > 0) {
      if (existente[0].tipo !== tipo) {
        await execute(
          `UPDATE matriculas_asistencias SET tipo = ?, hora_entrada = COALESCE(hora_entrada, ?) WHERE id = ?`,
          [tipo, horaActual, existente[0].id]
        );
        enviarNotificacion = true;
      }
    } else {
      await execute(
        `INSERT INTO matriculas_asistencias (matricula_id, fecha, tipo, hora_entrada, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [matricula_id, fechaNorm, tipo, horaActual]
      );
      enviarNotificacion = true;
    }

    if (enviarNotificacion) {
      const alumnoData = await query(
        `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno
         FROM alumnos a INNER JOIN matriculas m ON m.alumno_id = a.id
         WHERE m.id = ? AND m.grupo_id = ?`,
        [matricula_id, grupoId]
      );
      if (alumnoData.length > 0) {
        const nombreAlumno = `${alumnoData[0].nombres} ${alumnoData[0].apellido_paterno} ${alumnoData[0].apellido_materno}`.trim();
        const fechaForm = moment(fechaNorm).format('DD/MM/YYYY');
        const cfg = mensajesConfig.asistencia?.manual?.[tipo];
        const tituloBase = cfg?.titulo || `Asistencia: ${tipo}`;
        const palabraClaveManual = { PRESENTE: 'ASISTIÓ', TARDANZA: 'TARDANZA', TARDANZA_JUSTIFICADA: 'TARDANZA JUSTIFICADA', FALTA: 'FALTA', FALTA_JUSTIFICADA: 'FALTA JUSTIFICADA' }[tipo] || tipo;
        const titulo = `${palabraClaveManual} - ${tituloBase}`;
        let mensaje = (cfg?.mensaje_corto || '').replace('{nombreAlumno}', nombreAlumno).replace('{fecha}', fechaForm);
        if (tipo === 'FALTA' || tipo === 'TARDANZA') {
          mensaje += (mensaje.trim() ? ' ' : '') + 'Comuníquese con su tutora para poder justificar su Falta o Tardanza.';
        }
        setImmediate(() => {
          crearNotificacionesApoderados({
            alumno_id: alumnoData[0].id,
            usuario_id,
            colegio_id,
            anio_activo,
            tituloNotificacion: titulo, // Ya incluye palabra clave al inicio (ASISTIÓ, TARDANZA, FALTA, etc.)
            mensajeNotificacion: mensaje,
            tipoNotificacion: `asistencia_manual_${tipo}`,
            dataExtra: { fecha: fechaNorm, tipo }
          }).catch(err => console.error('Error notificando asistencia:', err));
        });
      }
    }

    res.json({ success: true, tipo });
  } catch (error) {
    console.error('Error guardando asistencia:', error);
    res.status(500).json({ error: 'Error al guardar asistencia' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/asistencia/guardar-todo
 * Marcar como FALTA a todos los que no tienen asistencia ni tardanza. Envía notificación solo a los newly marked.
 */
router.post('/tutoria/grupos/:grupoId/asistencia/guardar-todo', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo, usuario_id } = req.user;
    const personalId = req.user.personal_id;
    const { fecha, hora_dispositivo } = req.body;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const fechaNorm = fecha ? moment(fecha).format('YYYY-MM-DD') : moment().tz('America/Lima').format('YYYY-MM-DD');
    let horaActual = moment().tz('America/Lima').format('HH:mm:ss');
    if (hora_dispositivo && typeof hora_dispositivo === 'string') {
      const h = hora_dispositivo.trim();
      const match = h.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (match) {
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const sec = match[3] != null ? parseInt(match[3], 10) : 0;
        if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
          horaActual = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
      }
    }

    const matriculas = await query(
      `SELECT m.id as matricula_id, a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno
       FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND (m.estado = 0)`,
      [grupoId]
    );

    const asistenciasExistentes = await query(
      `SELECT matricula_id, tipo FROM matriculas_asistencias WHERE matricula_id IN (${matriculas.map(() => '?').join(',')}) AND fecha = ?`,
      [...matriculas.map(m => m.matricula_id), fechaNorm]
    );
    const mapa = {};
    asistenciasExistentes.forEach(a => { mapa[a.matricula_id] = a.tipo; });

    const considerarPresente = ['PRESENTE', 'TARDANZA', 'TARDANZA_JUSTIFICADA'];
    const marcadosComoFalta = [];

    for (const m of matriculas) {
      const tipoActual = mapa[m.matricula_id];
      const tienePresenteOTardanza = tipoActual && considerarPresente.includes(tipoActual);
      if (!tienePresenteOTardanza) {
        const existenteRow = await query(`SELECT id, tipo FROM matriculas_asistencias WHERE matricula_id = ? AND fecha = ?`, [m.matricula_id, fechaNorm]);
        const yaTieneFalta = existenteRow.length > 0 && (existenteRow[0].tipo === 'FALTA' || existenteRow[0].tipo === 'FALTA_JUSTIFICADA');
        if (yaTieneFalta) continue;
        if (existenteRow.length > 0) {
          await execute(`UPDATE matriculas_asistencias SET tipo = 'FALTA' WHERE id = ?`, [existenteRow[0].id]);
        } else {
          await execute(
            `INSERT INTO matriculas_asistencias (matricula_id, fecha, tipo, hora_entrada, created_at) VALUES (?, ?, ?, ?, NOW())`,
            [m.matricula_id, fechaNorm, 'FALTA', horaActual]
          );
        }
        marcadosComoFalta.push({ alumno_id: m.alumno_id, nombre_completo: `${m.nombres} ${m.apellido_paterno} ${m.apellido_materno}`.trim() });
      }
    }

    for (const item of marcadosComoFalta) {
      const cfg = mensajesConfig.asistencia?.manual?.FALTA;
      const tituloBase = cfg?.titulo || 'Falta Registrada';
      const titulo = `FALTA - ${tituloBase}`;
      const fechaForm = moment(fechaNorm).format('DD/MM/YYYY');
      let mensaje = (cfg?.mensaje_corto || '').replace('{nombreAlumno}', item.nombre_completo).replace('{fecha}', fechaForm);
      mensaje += (mensaje.trim() ? ' ' : '') + 'Comuníquese con su tutora para poder justificar su Falta o Tardanza.';
      setImmediate(() => {
        crearNotificacionesApoderados({
          alumno_id: item.alumno_id,
          usuario_id,
          colegio_id,
          anio_activo,
          tituloNotificacion: titulo,
          mensajeNotificacion: mensaje,
          tipoNotificacion: 'asistencia_manual_FALTA',
          dataExtra: { fecha: fechaNorm, tipo: 'FALTA' }
        }).catch(err => console.error('Error notificando falta:', err));
      });
    }

    res.json({ success: true, marcados_como_falta: marcadosComoFalta.length });
  } catch (error) {
    console.error('Error guardando asistencias:', error);
    res.status(500).json({ error: 'Error al guardar asistencias' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/recomendaciones?ciclo=1
 * Obtener alumnos del grupo con sus recomendaciones por bimestre
 */
router.get('/tutoria/grupos/:grupoId/recomendaciones', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const ciclo = parseInt(req.query.ciclo) || 1;

    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const lista = await listarAlumnosRecomendacionesPorGrupo(query, {
      grupoId,
      colegio_id,
      ciclo,
    });

    const grupo = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor, { withTurno: false });
    res.json({ grupo, alumnos: lista, ciclo });
  } catch (error) {
    console.error('Error obteniendo recomendaciones:', error);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/recomendaciones
 * Guardar recomendaciones por bimestre
 */
router.post('/tutoria/grupos/:grupoId/recomendaciones', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { ciclo, recomendaciones } = req.body; // recomendaciones: { matricula_id: texto }

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const cicloInt = parseInt(ciclo) || 1;
    if (cicloInt < 1 || cicloInt > 4) return res.status(400).json({ error: 'Ciclo inválido' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    await guardarRecomendacionesPorGrupo(query, execute, {
      grupoId,
      cicloInt,
      recomendaciones,
      personalActor: personalId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando recomendaciones:', error);
    res.status(500).json({ error: 'Error al guardar recomendaciones' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/conducta?ciclo=1
 * Obtener alumnos del grupo con nota de conducta por bimestre (default 20)
 */
router.get('/tutoria/grupos/:grupoId/conducta', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const ciclo = parseInt(req.query.ciclo, 10) || 1;

    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });
    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const { lista, ciclo: cicloInt } = await listarAlumnosConductaPorGrupo(query, {
      grupoId,
      colegio_id,
      ciclo,
    });

    const grupo = await filaGrupoTutoriaOGeneral(req, grupoId, grupoTutor, { withTurno: false });
    res.json({ grupo, alumnos: lista, ciclo: cicloInt });
  } catch (error) {
    console.error('Error obteniendo conducta:', error);
    res.status(500).json({ error: 'Error al obtener conducta' });
  }
});

/**
 * POST /api/docente/tutoria/grupos/:grupoId/conducta
 * Guardar notas de conducta por bimestre
 */
router.post('/tutoria/grupos/:grupoId/conducta', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const { ciclo, notas } = req.body;

    if (!personalId) return res.status(404).json({ error: 'Docente no encontrado' });
    const cicloInt = parseInt(ciclo, 10) || 1;
    if (cicloInt < 1 || cicloInt > 4) return res.status(400).json({ error: 'Ciclo inválido' });

    const grupoTutor = await query(
      `SELECT g.id FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && grupoTutor.length === 0) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    await guardarConductaPorGrupo(execute, { cicloInt, notas });

    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando conducta:', error);
    res.status(500).json({ error: 'Error al guardar conducta' });
  }
});

/** Rango fecha YYYY-MM-DD o null si inválido */
function fechaQueryValida(val) {
  if (val == null || String(val).trim() === '') return null;
  const s = String(val).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/**
 * GET /api/docente/tutoria/grupos/:grupoId/evidencias-tutor/resumen?fecha_desde=&fecha_hasta=
 * Totales para mostrar/ocultar botones (descuentos presentación escolar / incidencias del grupo).
 */
router.get('/tutoria/grupos/:grupoId/evidencias-tutor/resumen', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });

    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !gRow.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const anioEsc = gRow.length > 0
      ? Number(gRow[0].anio)
      : Number(anio_activo);
    const hoyStr = fechaQueryValida(req.query.fecha_hasta || new Date().toISOString().slice(0, 10))
      || new Date().toISOString().slice(0, 10);
    let fechaDesde = fechaQueryValida(req.query.fecha_desde) || `${anioEsc}-03-01`;
    let fechaHasta = fechaQueryValida(req.query.fecha_hasta) || `${anioEsc + 1}-02-28`;
    if (fechaDesde > fechaHasta) {
      const t = fechaDesde;
      fechaDesde = fechaHasta;
      fechaHasta = t;
    }
    if (hoyStr < fechaHasta) fechaHasta = hoyStr;

    let cuentaDescuentos = 0;
    try {
      const [d] = await query(
        `SELECT COUNT(*) AS c
         FROM presentacion_escolar_descuentos ped
         INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ?
         INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
         INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
         WHERE ped.colegio_id = ? AND ped.anio = ?
           AND DATE(ped.fecha) BETWEEN ? AND ?`,
        [colegio_id, grupoId, colegio_id, colegio_id, anioEsc, fechaDesde, fechaHasta]
      );
      cuentaDescuentos = Number(d?.c || 0);
    } catch (ePd) {
      if (String(ePd.message || '').includes("doesn't exist") || ePd.code === 'ER_NO_SUCH_TABLE') cuentaDescuentos = 0;
      else throw ePd;
    }

    let cuentaIncidencias = 0;
    try {
      const [ir] = await query(
        `SELECT COUNT(*) AS c
         FROM enrollment_incidents ei
         INNER JOIN matriculas m ON m.id = ei.enrollment_id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?
           AND ei.type = 1 AND g.anio = ?
           AND DATE(ei.created_at) BETWEEN ? AND ?`,
        [grupoId, personalId, personalId, colegio_id, anioEsc, fechaDesde, fechaHasta]
      );
      cuentaIncidencias = Number(ir?.c || 0);
    } catch (eInc) {
      console.error('[tutoria/evidencias-tutor/resumen incidencias]', eInc.message);
      cuentaIncidencias = 0;
    }

    res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      cuenta_descuentos_presentacion: cuentaDescuentos,
      cuenta_incidencias: cuentaIncidencias,
    });
  } catch (e) {
    console.error('[tutoria/evidencias-tutor/resumen]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/reporte-descuentos-presentacion
 * Descuentos por presentación escolar (asistencia/QR): detalle agrupado en front por alumno.
 */
router.get('/tutoria/grupos/:grupoId/reporte-descuentos-presentacion', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });

    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !gRow.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const anioEsc = gRow.length > 0
      ? Number(gRow[0].anio)
      : Number(anio_activo);
    const hoyStr = fechaQueryValida(req.query.fecha_hasta || new Date().toISOString().slice(0, 10))
      || new Date().toISOString().slice(0, 10);
    let fechaDesde = fechaQueryValida(req.query.fecha_desde) || `${anioEsc}-03-01`;
    let fechaHasta = fechaQueryValida(req.query.fecha_hasta) || `${anioEsc + 1}-02-28`;
    if (fechaDesde > fechaHasta) {
      const t = fechaDesde;
      fechaDesde = fechaHasta;
      fechaHasta = t;
    }
    if (hoyStr < fechaHasta) fechaHasta = hoyStr;

    let rows = [];
    try {
      rows = await query(
        `SELECT ped.id, ped.fecha, ped.hora, ped.puntos, ped.motivo,
                ua.alumno_id,
                TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre,
                CASE
                  WHEN rpp.id IS NOT NULL THEN TRIM(CONCAT(COALESCE(rpp.nombres,''), ' ', COALESCE(rpp.apellidos,'')))
                  WHEN alrp.id IS NOT NULL THEN TRIM(CONCAT(
                    COALESCE(alrp.apellido_paterno,''),' ', COALESCE(alrp.apellido_materno,''),' ', COALESCE(alrp.nombres,'')))
                  ELSE '—'
                END AS registrado_por_nombre
         FROM presentacion_escolar_descuentos ped
         INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
         INNER JOIN alumnos al ON al.id = ua.alumno_id
         INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.grupo_id = ? AND m.colegio_id = ped.colegio_id AND (m.estado = 0)
         INNER JOIN grupos gx ON gx.id = m.grupo_id AND gx.anio = ped.anio
         LEFT JOIN usuarios ur ON ur.id = ped.registrado_por_usuario_id
         LEFT JOIN personal rpp ON rpp.id = ur.personal_id
         LEFT JOIN alumnos alrp ON alrp.id = ur.alumno_id
         WHERE ped.colegio_id = ? AND ped.anio = ?
           AND DATE(ped.fecha) BETWEEN ? AND ?
         ORDER BY al.apellido_paterno, al.apellido_materno, al.nombres, ped.fecha DESC, ped.hora DESC`,
        [grupoId, colegio_id, anioEsc, fechaDesde, fechaHasta]
      );
    } catch (ePd) {
      if (String(ePd.message || '').includes("doesn't exist") || ePd.code === 'ER_NO_SUCH_TABLE') rows = [];
      else throw ePd;
    }

    const porAlumno = new Map();
    (rows || []).forEach((r) => {
      const aid = r.alumno_id;
      if (!porAlumno.has(aid)) {
        porAlumno.set(aid, {
          alumno_id: aid,
          alumno_nombre: r.alumno_nombre,
          suma_puntos: 0,
          registros: [],
        });
      }
      const b = porAlumno.get(aid);
      const pts = Number(r.puntos) || 0;
      b.suma_puntos += pts;
      b.registros.push({
        id: r.id,
        fecha: r.fecha,
        hora: r.hora,
        puntos: r.puntos,
        motivo: r.motivo,
        registrado_por_nombre: r.registrado_por_nombre,
      });
    });

    res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      alumnos: Array.from(porAlumno.values()),
    });
  } catch (e) {
    console.error('[tutoria/reporte-descuentos-presentacion]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/reporte-incidencias-grupo
 * Todas las incidencias tipo disciplinarias del año del grupo para alumnos de esta aula.
 */
router.get('/tutoria/grupos/:grupoId/reporte-incidencias-grupo', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    if (!personalId && !req._tutoriaGrupoAccesoOk) return res.status(404).json({ error: 'Docente no encontrado' });

    const gRow = await query(
      `SELECT g.id, g.anio FROM grupos g WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, personalId, colegio_id, anio_activo]
    );
    if (!req._tutoriaGrupoAccesoOk && !gRow.length) return res.status(403).json({ error: 'No eres tutor de este grupo' });

    const anioEsc = gRow.length > 0
      ? Number(gRow[0].anio)
      : Number(anio_activo);
    const hoyStr = fechaQueryValida(req.query.fecha_hasta || new Date().toISOString().slice(0, 10))
      || new Date().toISOString().slice(0, 10);
    let fechaDesde = fechaQueryValida(req.query.fecha_desde) || `${anioEsc}-03-01`;
    let fechaHasta = fechaQueryValida(req.query.fecha_hasta) || `${anioEsc + 1}-02-28`;
    if (fechaDesde > fechaHasta) {
      const t = fechaDesde;
      fechaDesde = fechaHasta;
      fechaHasta = t;
    }
    if (hoyStr < fechaHasta) fechaHasta = hoyStr;

    const rows = await query(
      `SELECT ei.id, ei.description, ei.created_at,
              CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) AS docente_nombre,
              CASE WHEN ei.assignment_id = ? THEN 'Tutoría' ELSE COALESCE(c.nombre, '—') END AS curso_nombre,
              m.alumno_id,
              TRIM(CONCAT(COALESCE(al.apellido_paterno,''),' ', COALESCE(al.apellido_materno,''),' ', COALESCE(al.nombres,''))) AS alumno_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ?
         AND ei.type = 1 AND g.anio = ?
         AND DATE(ei.created_at) BETWEEN ? AND ?
       ORDER BY alumno_nombre ASC, ei.created_at DESC`,
      [ASSIGNMENT_ID_TUTORIA, grupoId, personalId, personalId, colegio_id, anioEsc, fechaDesde, fechaHasta]
    );

    const porAlumno = new Map();
    (rows || []).forEach((r) => {
      const aid = r.alumno_id;
      if (!porAlumno.has(aid)) {
        porAlumno.set(aid, {
          alumno_id: aid,
          alumno_nombre: r.alumno_nombre,
          incidencias: [],
        });
      }
      porAlumno.get(aid).incidencias.push({
        id: r.id,
        description: r.description,
        created_at: r.created_at,
        docente_nombre: r.docente_nombre,
        curso_nombre: r.curso_nombre,
      });
    });

    res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      total: (rows || []).length,
      alumnos: Array.from(porAlumno.values()),
    });
  } catch (e) {
    console.error('[tutoria/reporte-incidencias-grupo]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/roles-adicionales', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    let personalId = req.user.personal_id;

    // Si el JWT viejo no traía personal_id pero el usuario ya tiene vínculo en BD (común en admin/docente)
    if (!personalId && req.user.usuario_id) {
      const urow = await query(
        `SELECT personal_id FROM usuarios WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [req.user.usuario_id, colegio_id]
      );
      if (urow.length && urow[0].personal_id) {
        personalId = urow[0].personal_id;
      }
    }

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar si es apoderado (tiene hijos estudiando en el colegio)
    // Buscar si el personal tiene un registro en apoderados y tiene hijos (familias)
    // Primero obtener el nro_documento del personal
    let tieneHijos = false;
    let hijos = [];
    
    try {
      const personalData = await query(
        `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [personalId, colegio_id]
      );

      if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
        const nroDocumento = personalData[0].nro_documento;
        
        // Buscar si existe un apoderado con ese nro_documento que tenga hijos
        const esApoderado = await query(
          `SELECT COUNT(DISTINCT f.alumno_id) as total_hijos
           FROM apoderados ap
           INNER JOIN familias f ON f.apoderado_id = ap.id
           INNER JOIN alumnos a ON a.id = f.alumno_id
           INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = ap.colegio_id
           INNER JOIN grupos g ON g.id = m.grupo_id
           WHERE ap.colegio_id = ? 
             AND ap.nro_documento = ?
             AND a.colegio_id = ?
             AND (m.estado = 0)
             AND g.anio = ?
             AND ${sqlExistePagoMatriculaCancelado('m')}`,
          [colegio_id, nroDocumento, colegio_id, anio_activo]
        );

        tieneHijos = (esApoderado[0]?.total_hijos || 0) > 0;
      }
    } catch (error) {
      console.error('Error verificando si es apoderado:', error);
      // Continuar sin fallar, simplemente no será apoderado
      tieneHijos = false;
    }

    // Obtener lista de hijos si es apoderado
    if (tieneHijos) {
      try {
        const personalData = await query(
          `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
          [personalId, colegio_id]
        );

        if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
          const nroDocumento = personalData[0].nro_documento;
          
          hijos = await query(
            `SELECT DISTINCT
                    a.id,
                    a.nombres,
                    a.apellido_paterno,
                    a.apellido_materno,
                    a.nro_documento as dni,
                    a.foto,
                    g.grado,
                    g.seccion,
                    n.nombre as nivel_nombre,
                    t.nombre as turno_nombre,
                    m.id as matricula_id,
                    (SELECT MIN(u.id)
                     FROM usuarios u
                     WHERE g.tutor_id IS NOT NULL
                       AND u.personal_id = g.tutor_id
                       AND u.colegio_id = g.colegio_id
                       AND u.estado = 'ACTIVO') AS tutor_usuario_id,
                    (SELECT TRIM(CONCAT(COALESCE(pt.nombres, ''), ' ', COALESCE(pt.apellidos, '')))
                     FROM personal pt
                     WHERE g.tutor_id IS NOT NULL
                       AND pt.id = g.tutor_id
                       AND pt.colegio_id = g.colegio_id
                     LIMIT 1) AS tutor_nombre_completo
             FROM apoderados ap
             INNER JOIN familias f ON f.apoderado_id = ap.id
             INNER JOIN alumnos a ON a.id = f.alumno_id
             INNER JOIN matriculas m ON m.alumno_id = a.id
             INNER JOIN grupos g ON g.id = m.grupo_id
             INNER JOIN niveles n ON n.id = g.nivel_id
             INNER JOIN turnos t ON t.id = g.turno_id
             WHERE ap.colegio_id = ? 
               AND ap.nro_documento = ?
               AND a.colegio_id = ?
               AND m.colegio_id = ?
               AND (m.estado = 0)
               AND g.anio = ?
               AND ${sqlExistePagoMatriculaCancelado('m')}
             ORDER BY n.nombre, g.grado, g.seccion, a.apellido_paterno, a.apellido_materno, a.nombres`,
            [colegio_id, nroDocumento, colegio_id, colegio_id, anio_activo]
          );
          
          console.log(`📋 [ROLES-ADICIONALES] Hijos encontrados: ${hijos.length}`);
          if (hijos.length > 0) {
            console.log(`📋 [ROLES-ADICIONALES] Primer hijo completo:`, JSON.stringify(hijos[0], null, 2));
            console.log(`📋 [ROLES-ADICIONALES] DNI del primer hijo:`, hijos[0].dni || hijos[0].nro_documento || 'NO DISPONIBLE');
          }
        }
      } catch (error) {
        console.error('Error obteniendo lista de hijos:', error);
        hijos = [];
      }
    }

    // Verificar si es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)) AND g.colegio_id = ? AND g.anio = ?`,
      [personalId, personalId, colegio_id, anio_activo]
    );

    const esTutor = gruposTutor.length > 0;
    let esTutoriaGeneral = false;
    let esCajeroCajaChica = false;
    try {
      esTutoriaGeneral = await esTutoriaGeneralActivo(personalId, colegio_id);
    } catch (errTg) {
      console.error('Error verificando Tutoría General:', errTg);
    }
    try {
      esCajeroCajaChica = await esCajeroCajaChicaActivo(personalId, colegio_id);
    } catch (errCj) {
      console.error('Error verificando Cajero Caja Chica:', errCj);
    }

    console.log(`📋 [ROLES-ADICIONALES] Preparando respuesta JSON:`);
    console.log(`📋 [ROLES-ADICIONALES] - es_apoderado: ${tieneHijos}`);
    console.log(`📋 [ROLES-ADICIONALES] - es_tutor: ${esTutor}`);
    console.log(`📋 [ROLES-ADICIONALES] - es_tutoria_general: ${esTutoriaGeneral}`);
    console.log(`📋 [ROLES-ADICIONALES] - es_cajero_caja_chica: ${esCajeroCajaChica}`);
    console.log(`📋 [ROLES-ADICIONALES] - hijos: ${hijos?.length || 0} hijos`);
    if (hijos && hijos.length > 0) {
      console.log(`📋 [ROLES-ADICIONALES] - Primer hijo en respuesta:`, JSON.stringify(hijos[0], null, 2));
    }

    res.json({
      es_apoderado: tieneHijos,
      es_tutor: esTutor,
      es_tutoria_general: esTutoriaGeneral,
      es_cajero_caja_chica: esCajeroCajaChica,
      hijos: hijos || [],
      grupo_tutor: esTutor ? gruposTutor[0] : null
    });
  } catch (error) {
    console.error('Error verificando roles adicionales:', error);
    res.status(500).json({ error: 'Error al verificar roles adicionales' });
  }
});

/**
 * GET /api/docente/documentos-gestion
 * PDFs de gestión visibles para docentes (perfil DOCENTE o TODOS)
 */
router.get('/documentos-gestion', async (req, res) => {
  try {
    const { colegio_id, tipo } = req.user;
    const tipoUsuario = tipo || 'DOCENTE';
    let documentos;
    if (tipoUsuario === 'PSICOLOGA') {
      // Psicóloga: visibilidad total (misma vista funcional que administración en este módulo).
      documentos = await query(
        `SELECT d.id, d.titulo, d.nombre_archivo_original, d.ruta_almacenamiento, d.perfil_destino,
                d.fecha_publicacion, d.created_at,
                c.nombre as categoria_nombre, c.orden as categoria_orden
         FROM gestion_documentos d
         INNER JOIN gestion_documentos_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
         WHERE d.colegio_id = ? AND d.activo = 1 AND c.activo = 1
         ORDER BY c.orden ASC, d.created_at DESC`,
        [colegio_id]
      );
    } else {
      const perfilesPermitidos = [tipoUsuario];
      documentos = await query(
        `SELECT d.id, d.titulo, d.nombre_archivo_original, d.ruta_almacenamiento, d.perfil_destino,
                d.fecha_publicacion, d.created_at,
                c.nombre as categoria_nombre, c.orden as categoria_orden
         FROM gestion_documentos d
         INNER JOIN gestion_documentos_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
         WHERE d.colegio_id = ? AND d.activo = 1 AND c.activo = 1
           AND (
             d.perfil_destino = 'TODOS'
             OR d.perfil_destino IN (${perfilesPermitidos.map(() => '?').join(',')})
           )
         ORDER BY c.orden ASC, d.created_at DESC`,
        [colegio_id, ...perfilesPermitidos]
      );
    }
    const list = (documentos || []).map((d) => ({
      ...d,
      archivo_url: `/uploads/${d.ruta_almacenamiento}`
    }));
    res.json({ documentos: list });
  } catch (error) {
    console.error('Error listando documentos de gestión (docente):', error);
    res.status(500).json({ error: error.message || 'Error al listar documentos' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/datos
 * Obtener datos completos de un hijo para editar
 */
// Nota: authenticateToken y requireUserType ya están aplicados globalmente en router.use()
// pero los dejamos aquí para mayor claridad
router.get('/hijos/:hijoId/datos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id } = req.user;

    console.log(`\n🔵 ========== [HIJOS-DATOS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-DATOS] Método: ${req.method}`);
    console.log(`📋 [HIJOS-DATOS] URL: ${req.originalUrl}`);
    console.log(`📋 [HIJOS-DATOS] Params:`, req.params);
    console.log(`📋 [HIJOS-DATOS] hijoId recibido: ${hijoId} (tipo: ${typeof hijoId})`);
    console.log(`📋 [HIJOS-DATOS] Usuario: usuario_id=${usuario_id}, personal_id=${personal_id}, colegio_id=${colegio_id}`);
    
    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      console.error(`❌ [HIJOS-DATOS] Error: hijoId inválido: ${hijoId}`);
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }
    
    const hijoIdNum = parseInt(hijoId);
    console.log(`📋 [HIJOS-DATOS] hijoId convertido a número: ${hijoIdNum}`);

    if (!personal_id) {
      console.error('❌ [HIJOS-DATOS] Error: personal_id no encontrado en req.user');
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal (puede estar en personal.nro_documento o en usuarios.usuario)
    let nroDocumento = null;
    
    // Primero intentar obtener desde la tabla personal
    console.log(`📋 [HIJOS-DATOS] Buscando nro_documento en personal para personal_id=${personal_id}`);
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    console.log(`📋 [HIJOS-DATOS] Resultado personalData:`, personalData);

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
      console.log(`✅ [HIJOS-DATOS] nro_documento encontrado en personal: ${nroDocumento}`);
    } else {
      // Si no está en personal, obtener desde usuarios.usuario (que es el DNI)
      console.log(`📋 [HIJOS-DATOS] Buscando nro_documento en usuarios para usuario_id=${usuario_id}`);
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      
      console.log(`📋 [HIJOS-DATOS] Resultado usuarioData:`, usuarioData);
      
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
        console.log(`✅ [HIJOS-DATOS] nro_documento encontrado en usuarios: ${nroDocumento}`);
      }
    }

    if (!nroDocumento) {
      console.error(`❌ [HIJOS-DATOS] Error: No se encontró nro_documento para personal_id ${personal_id}, usuario_id ${usuario_id}, colegio_id ${colegio_id}`);
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    // Buscar en apoderados usando el nro_documento
    console.log(`📋 [HIJOS-DATOS] Verificando si alumno ${hijoIdNum} es hijo del docente con nro_documento ${nroDocumento}`);
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    console.log(`📋 [HIJOS-DATOS] Resultado verificación esHijo:`, esHijo);

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      console.error(`❌ [HIJOS-DATOS] Error: El alumno ${hijoIdNum} no es hijo del docente con nro_documento ${nroDocumento}`);
      console.error(`❌ [HIJOS-DATOS] Detalles: colegio_id=${colegio_id}, nro_documento=${nroDocumento}, hijoId=${hijoIdNum}`);
      return res.status(403).json({ error: 'No tienes permisos para ver estos datos. El alumno no está registrado como tu hijo.' });
    }

    console.log(`✅ [HIJOS-DATOS] Verificación exitosa: el alumno ${hijoIdNum} es hijo del docente`);

    // Obtener datos del alumno
    console.log(`📋 [HIJOS-DATOS] Obteniendo datos del alumno con id=${hijoIdNum}, colegio_id=${colegio_id}`);
    const alumno = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    console.log(`📋 [HIJOS-DATOS] Resultado consulta alumno:`, alumno.length > 0 ? 'Encontrado' : 'No encontrado');

    if (!alumno || alumno.length === 0) {
      console.error(`❌ [HIJOS-DATOS] Error: Alumno no encontrado con id=${hijoIdNum}, colegio_id=${colegio_id}`);
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    console.log(`✅ [HIJOS-DATOS] Datos del alumno obtenidos exitosamente:`, {
      id: alumnoData.id,
      nombres: alumnoData.nombres,
      nro_documento: alumnoData.nro_documento
    });

    const respuesta = {
      id: alumnoData.id,
      nombres: alumnoData.nombres,
      apellido_paterno: alumnoData.apellido_paterno,
      apellido_materno: alumnoData.apellido_materno,
      email: alumnoData.email,
      sexo: alumnoData.sexo,
      fecha_nacimiento: alumnoData.fecha_nacimiento,
      foto: alumnoData.foto,
      nro_documento: alumnoData.nro_documento,
      ...pickSaludFields(alumnoData)
    };
    
    console.log(`✅ [HIJOS-DATOS] Respuesta enviada exitosamente para hijoId: ${hijoIdNum}`);
    console.log(`🔵 ========== [HIJOS-DATOS] FIN DE PETICIÓN ==========\n`);
    
    res.json(respuesta);
  } catch (error) {
    console.error('❌ [HIJOS-DATOS] Error obteniendo datos del hijo:', error);
    console.error('❌ [HIJOS-DATOS] Stack trace:', error.stack);
    console.error(`🔵 ========== [HIJOS-DATOS] FIN DE PETICIÓN (ERROR) ==========\n`);
    res.status(500).json({ error: 'Error al obtener datos del alumno', details: error.message });
  }
});

/**
 * PUT /api/docente/hijos/:hijoId/datos
 * Actualizar datos de un hijo (solo si es apoderado)
 */
// Configurar multer para fotos de alumnos
const alumnoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/intranet2026/backend/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `alumno-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterAlumno = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'));
  }
};

const uploadAlumnoHijo = multer({
  storage: alumnoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterAlumno
});

// Nota: authenticateToken y requireUserType ya están aplicados globalmente en router.use()
router.put('/hijos/:hijoId/datos', uploadAlumnoHijo.single('foto'), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id } = req.user;
    const { nombres, apellido_paterno, apellido_materno, email, sexo, fecha_nacimiento } = req.body;

    console.log(`\n🔵 ========== [HIJOS-DATOS-PUT] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-DATOS-PUT] Método: ${req.method}`);
    console.log(`📋 [HIJOS-DATOS-PUT] URL: ${req.originalUrl}`);
    console.log(`📋 [HIJOS-DATOS-PUT] Params:`, req.params);
    console.log(`📋 [HIJOS-DATOS-PUT] hijoId recibido: ${hijoId} (tipo: ${typeof hijoId})`);
    console.log(`📋 [HIJOS-DATOS-PUT] Usuario: usuario_id=${usuario_id}, personal_id=${personal_id}, colegio_id=${colegio_id}`);
    console.log(`📋 [HIJOS-DATOS-PUT] Body:`, { nombres, apellido_paterno, apellido_materno, email, sexo, fecha_nacimiento });
    
    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      console.error(`❌ [HIJOS-DATOS-PUT] Error: hijoId inválido: ${hijoId}`);
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }
    
    const hijoIdNum = parseInt(hijoId);
    console.log(`📋 [HIJOS-DATOS-PUT] hijoId convertido a número: ${hijoIdNum}`);

    if (!personal_id) {
      console.error('❌ [HIJOS-DATOS-PUT] Error: personal_id no encontrado en req.user');
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal (puede estar en personal.nro_documento o en usuarios.usuario)
    let nroDocumento = null;
    
    // Primero intentar obtener desde la tabla personal
    console.log(`📋 [HIJOS-DATOS-PUT] Buscando nro_documento en personal para personal_id=${personal_id}`);
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    console.log(`📋 [HIJOS-DATOS-PUT] Resultado personalData:`, personalData);

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
      console.log(`✅ [HIJOS-DATOS-PUT] nro_documento encontrado en personal: ${nroDocumento}`);
    } else {
      // Si no está en personal, obtener desde usuarios.usuario (que es el DNI)
      console.log(`📋 [HIJOS-DATOS-PUT] Buscando nro_documento en usuarios para usuario_id=${usuario_id}`);
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      
      console.log(`📋 [HIJOS-DATOS-PUT] Resultado usuarioData:`, usuarioData);
      
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
        console.log(`✅ [HIJOS-DATOS-PUT] nro_documento encontrado en usuarios: ${nroDocumento}`);
      }
    }

    if (!nroDocumento) {
      console.error(`❌ [HIJOS-DATOS-PUT] Error: No se encontró nro_documento para personal_id ${personal_id}, usuario_id ${usuario_id}, colegio_id ${colegio_id}`);
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    console.log(`📋 [HIJOS-DATOS-PUT] Verificando si alumno ${hijoIdNum} es hijo del docente con nro_documento ${nroDocumento}`);
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    console.log(`📋 [HIJOS-DATOS-PUT] Resultado verificación esHijo:`, esHijo);

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      console.error(`❌ [HIJOS-DATOS-PUT] Error: El alumno ${hijoIdNum} no es hijo del docente con nro_documento ${nroDocumento}`);
      console.error(`❌ [HIJOS-DATOS-PUT] Detalles: colegio_id=${colegio_id}, nro_documento=${nroDocumento}, hijoId=${hijoIdNum}`);
      return res.status(403).json({ error: 'No tienes permisos para editar estos datos. El alumno no está registrado como tu hijo.' });
    }

    console.log(`✅ [HIJOS-DATOS-PUT] Verificación exitosa: el alumno ${hijoIdNum} es hijo del docente`);

    // Obtener alumno actual
    console.log(`📋 [HIJOS-DATOS-PUT] Obteniendo datos del alumno con id=${hijoIdNum}, colegio_id=${colegio_id}`);
    const alumno = await query(
      `SELECT * FROM alumnos WHERE id = ? AND colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      console.error(`❌ [HIJOS-DATOS-PUT] Error: Alumno no encontrado con id=${hijoIdNum}, colegio_id=${colegio_id}`);
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    let fotoPath = alumnoData.foto;

    // Si se subió una nueva foto
    if (req.file) {
      // Eliminar foto anterior si existe
      if (alumnoData.foto && alumnoData.foto !== '') {
        const oldFotoPath = `/home/vanguard/intranet2026/backend/Static/Image/Fotos/${path.basename(alumnoData.foto)}`;
        if (fs.existsSync(oldFotoPath)) {
          fs.unlinkSync(oldFotoPath);
        }
      }
      
      // Guardar nueva foto - solo el nombre del archivo
      fotoPath = req.file.filename;
    }

    // Actualizar datos
    console.log(`📋 [HIJOS-DATOS-PUT] Actualizando datos del alumno con id=${hijoIdNum}`);
    
    // Permitir email vacío (null o string vacío)
    let emailFinal = null;
    if (email !== undefined && email !== null && email.trim() !== '') {
      emailFinal = email.trim();
    } else if (alumnoData.email) {
      emailFinal = alumnoData.email;
    }
    
    // Manejar fecha de nacimiento
    let fechaFinal = null;
    if (fecha_nacimiento && fecha_nacimiento.trim() !== '') {
      fechaFinal = fecha_nacimiento.trim();
    } else if (alumnoData.fecha_nacimiento) {
      fechaFinal = alumnoData.fecha_nacimiento;
    }
    
    console.log(`📋 [HIJOS-DATOS-PUT] Email final:`, emailFinal);
    console.log(`📋 [HIJOS-DATOS-PUT] Fecha final:`, fechaFinal);

    const salud = normalizeSaludBody(req.body, alumnoData);
    
    await execute(
      `UPDATE alumnos SET
        nombres = ?,
        apellido_paterno = ?,
        apellido_materno = ?,
        email = ?,
        sexo = ?,
        foto = ?,
        fecha_nacimiento = ?,
        alergias = ?,
        vacunas = ?,
        tipo_sangre = ?,
        enfermedades_sufridas = ?,
        otros_controles = ?,
        experiencias_traumaticas = ?
      WHERE id = ? AND colegio_id = ?`,
      [
        nombres || alumnoData.nombres,
        apellido_paterno || alumnoData.apellido_paterno,
        apellido_materno || alumnoData.apellido_materno,
        emailFinal,
        sexo !== undefined ? sexo : (alumnoData.sexo !== undefined ? alumnoData.sexo : null),
        fotoPath,
        fechaFinal,
        salud.alergias,
        salud.vacunas,
        salud.tipo_sangre,
        salud.enfermedades_sufridas,
        salud.otros_controles,
        salud.experiencias_traumaticas,
        hijoIdNum,
        colegio_id
      ]
    );

    // Obtener datos actualizados
    console.log(`📋 [HIJOS-DATOS-PUT] Obteniendo datos actualizados del alumno con id=${hijoIdNum}`);
    const alumnoActualizado = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    const respuesta = {
      message: 'Datos actualizados correctamente',
      alumno: {
        ...alumnoActualizado[0],
        ...pickSaludFields(alumnoActualizado[0])
      }
    };
    
    console.log(`✅ [HIJOS-DATOS-PUT] Datos actualizados exitosamente para hijoId: ${hijoIdNum}`);
    console.log(`🔵 ========== [HIJOS-DATOS-PUT] FIN DE PETICIÓN ==========\n`);
    
    res.json(respuesta);
  } catch (error) {
    console.error('❌ [HIJOS-DATOS-PUT] Error actualizando datos del hijo:', error);
    console.error('❌ [HIJOS-DATOS-PUT] Stack trace:', error.stack);
    console.error(`🔵 ========== [HIJOS-DATOS-PUT] FIN DE PETICIÓN (ERROR) ==========\n`);
    res.status(500).json({ error: 'Error al actualizar datos del alumno', details: error.message });
  }
});

/** Contactos y documentos de ficha del hijo (docente-apoderado). */
mountAlumnoFichaByIdRoutes(router, {
  pathPrefix: '/hijos',
  paramName: 'hijoId',
  assertAccess: async (req, alumnoId) => {
    const { colegio_id, usuario_id, personal_id } = req.user;
    if (!personal_id) return 'Información de usuario incompleta';
    let nroDocumento = null;
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );
    if (personalData?.[0]?.nro_documento) nroDocumento = personalData[0].nro_documento;
    else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      if (usuarioData?.[0]?.usuario) nroDocumento = usuarioData[0].usuario;
    }
    if (!nroDocumento) return 'No se encontró tu número de documento';
    const esHijo = await query(
      `SELECT COUNT(*) AS count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ? AND ap.nro_documento = ? AND a.id = ? AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, alumnoId, colegio_id]
    );
    if (!esHijo?.[0]?.count) return 'No tienes permisos sobre este alumno';
    return true;
  }
});

/**
 * POST /api/docente/hijos/:hijoId/reiniciar-contrasena
 * Reiniciar contraseña de un hijo (solo si es apoderado)
 * Establece la contraseña del alumno a su DNI
 */
router.post('/hijos/:hijoId/reiniciar-contrasena', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id } = req.user;

    console.log(`\n🔵 ========== [HIJOS-REINICIAR-PASSWORD] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-REINICIAR-PASSWORD] hijoId recibido: ${hijoId}`);
    console.log(`📋 [HIJOS-REINICIAR-PASSWORD] Usuario: usuario_id=${usuario_id}, personal_id=${personal_id}, colegio_id=${colegio_id}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      console.error(`❌ [HIJOS-REINICIAR-PASSWORD] Error: hijoId inválido: ${hijoId}`);
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!personal_id) {
      console.error('❌ [HIJOS-REINICIAR-PASSWORD] Error: personal_id no encontrado en req.user');
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal (puede estar en personal.nro_documento o en usuarios.usuario)
    let nroDocumento = null;
    
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
    } else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
      }
    }

    if (!nroDocumento) {
      console.error(`❌ [HIJOS-REINICIAR-PASSWORD] Error: No se encontró nro_documento`);
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      console.error(`❌ [HIJOS-REINICIAR-PASSWORD] Error: El alumno ${hijoIdNum} no es hijo del docente`);
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción. El alumno no está registrado como tu hijo.' });
    }

    // Obtener el DNI del alumno (usuario.usuario es el DNI)
    const usuarioAlumno = await query(
      `SELECT u.id as usuario_id, u.usuario as dni
       FROM usuarios u
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LIMIT 1`,
      [hijoIdNum, colegio_id]
    );

    if (!usuarioAlumno || usuarioAlumno.length === 0) {
      console.error(`❌ [HIJOS-REINICIAR-PASSWORD] Error: No se encontró usuario del alumno`);
      return res.status(404).json({ error: 'No se encontró el usuario del alumno' });
    }

    const dniAlumno = usuarioAlumno[0].dni;
    const usuarioIdAlumno = usuarioAlumno[0].usuario_id;

    if (!dniAlumno) {
      console.error(`❌ [HIJOS-REINICIAR-PASSWORD] Error: El alumno no tiene DNI registrado`);
      return res.status(400).json({ error: 'El alumno no tiene DNI registrado' });
    }

    // Generar hash SHA1 del DNI (igual que el sistema usa)
    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha1').update(String(dniAlumno)).digest('hex');

    // Actualizar contraseña del alumno
    await execute(
      `UPDATE usuarios SET password = ? WHERE id = ? AND alumno_id = ? AND colegio_id = ?`,
      [passwordHash, usuarioIdAlumno, hijoIdNum, colegio_id]
    );
    try {
      const { bumpTokenVersion } = require('../utils/tokenVersion');
      await bumpTokenVersion(execute, usuarioIdAlumno);
    } catch (e) {
      console.warn('[hijos/reiniciar-password] bumpTokenVersion:', e.message);
    }

    console.log(`✅ [HIJOS-REINICIAR-PASSWORD] Contraseña reiniciada exitosamente para hijoId: ${hijoIdNum}, DNI: ${dniAlumno}`);
    console.log(`🔵 ========== [HIJOS-REINICIAR-PASSWORD] FIN DE PETICIÓN ==========\n`);

    res.json({
      success: true,
      message: 'Se volvió a poner el DNI del estudiante como contraseña'
    });
  } catch (error) {
    console.error('❌ [HIJOS-REINICIAR-PASSWORD] Error reiniciando contraseña:', error);
    console.error('❌ [HIJOS-REINICIAR-PASSWORD] Stack trace:', error.stack);
    console.error(`🔵 ========== [HIJOS-REINICIAR-PASSWORD] FIN DE PETICIÓN (ERROR) ==========\n`);
    res.status(500).json({ error: 'Error al reiniciar la contraseña', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/qr
 * Obtener datos del hijo para generar QR (fotocheck)
 */
router.get('/hijos/:hijoId/qr', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-QR] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-QR] hijoId recibido: ${hijoId}`);

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    // Obtener datos del alumno (incl. foto para carnet QR)
    const alumno = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      console.error(`❌ [HIJOS-QR] Error: Alumno no encontrado`);
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    const matricula = await fetchMatriculaAnioActivoOperativa(
      query,
      alumnoData.id,
      colegio_id,
      anio_activo
    );

    // Obtener nombre del colegio
    const colegio = await query(
      `SELECT nombre FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';
    const matriculaData = matricula.length > 0 ? matricula[0] : null;

    const anioCarnet =
      anio_activo ??
      (matriculaData && matriculaData.grupo_anio != null ? matriculaData.grupo_anio : null) ??
      (await getAnioActivo(colegio_id));

    // Datos del apoderado del alumno (desde familias) para carnet: Apoderado, Celular, Dirección
    const apoderadoInfo = await query(
      `SELECT CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              ap.telefono_celular,
              ap.direccion
       FROM familias f
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
       WHERE f.alumno_id = ?
       LIMIT 1`,
      [colegio_id, alumnoData.id]
    );
    const apoderadoData = apoderadoInfo && apoderadoInfo.length > 0 ? apoderadoInfo[0] : null;
    const apoderado_nombre = apoderadoData ? (apoderadoData.nombre_completo || '').trim() : '';
    const apoderado_celular = apoderadoData ? (apoderadoData.telefono_celular || '').trim() : '';
    const direccion = apoderadoData ? (apoderadoData.direccion || '').trim() : '';

    // Construir texto del grupo
    let grupoTexto = '';
    if (matriculaData) {
      const gradoTexto = matriculaData.grado ? `${matriculaData.grado}°` : '';
      grupoTexto = `${matriculaData.nivel_nombre || ''} ${gradoTexto} ${matriculaData.seccion || ''}`.trim();
    }

    // Generar código QR (puede ser el DNI o un ID único)
    const qrData = alumnoData.nro_documento || `ALUMNO-${alumnoData.id}`;

    // Foto y logo en base64 para el carnet (evita CORS; el backend lee desde disco)
    let foto_url = null;
    let foto_base64 = null;
    if (alumnoData.foto && alumnoData.foto.trim() !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      foto_url = isProduction
        ? `${phpSystemUrl}/Static/Image/Fotos/${alumnoData.foto}`
        : `http://localhost:5000/Static/Image/Fotos/${alumnoData.foto}`;
      const baseFotosPath = process.env.STATIC_FOTOS_PATH || path.join(__dirname, '..', 'Static', 'Image', 'Fotos');
      let fotoPath = path.join(baseFotosPath, path.basename(alumnoData.foto));
      if (!fs.existsSync(fotoPath) && process.env.NODE_ENV === 'production') {
        fotoPath = path.join('/home/vanguard/intranet2026/backend/Static/Image/Fotos', path.basename(alumnoData.foto));
      }
      try {
        if (fs.existsSync(fotoPath)) {
          const buf = fs.readFileSync(fotoPath);
          const ext = (path.extname(alumnoData.foto) || '').toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          foto_base64 = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch (e) { /* ignorar */ }
    }

    let logo_url = null;
    let logo_base64 = null;
    const configLogo = await query(`SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`);
    if (configLogo && configLogo.length > 0 && configLogo[0].valor) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      logo_url = isProduction
        ? `${phpSystemUrl}/Static/Archivos/${configLogo[0].valor}`
        : `http://localhost:5000/Static/Archivos/${configLogo[0].valor}`;
      const baseArchivosPath = process.env.STATIC_ARCHIVOS_PATH || path.join(__dirname, '..', 'Static', 'Archivos');
      let logoPath = path.join(baseArchivosPath, path.basename(configLogo[0].valor));
      if (!fs.existsSync(logoPath) && process.env.NODE_ENV === 'production') {
        logoPath = path.join('/home/vanguard/intranet2026/backend/Static/Archivos', path.basename(configLogo[0].valor));
      }
      try {
        if (fs.existsSync(logoPath)) {
          const buf = fs.readFileSync(logoPath);
          const ext = (path.extname(configLogo[0].valor) || '').toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          logo_base64 = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch (e) { /* ignorar */ }
    }

    console.log(`✅ [HIJOS-QR] Datos QR obtenidos exitosamente para hijoId: ${hijoIdNum}`);
    console.log(`🔵 ========== [HIJOS-QR] FIN DE PETICIÓN ==========\n`);

    res.json({
      nombres: alumnoData.nombres || '',
      apellido_paterno: alumnoData.apellido_paterno || '',
      apellido_materno: alumnoData.apellido_materno || '',
      nombre_completo: `${alumnoData.nombres || ''} ${alumnoData.apellido_paterno || ''} ${alumnoData.apellido_materno || ''}`.trim(),
      grupo: grupoTexto,
      colegio_nombre: colegioNombre,
      anio: anioCarnet,
      qr_data: qrData,
      nro_documento: alumnoData.nro_documento || '',
      foto_url,
      foto_base64,
      logo_url,
      logo_base64,
      apoderado_nombre,
      apoderado_celular,
      direccion
    });
  } catch (error) {
    console.error('❌ [HIJOS-QR] Error obteniendo datos para QR:', error);
    console.error('❌ [HIJOS-QR] Stack trace:', error.stack);
    console.error(`🔵 ========== [HIJOS-QR] FIN DE PETICIÓN (ERROR) ==========\n`);
    res.status(500).json({ error: 'Error al obtener datos para QR', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/incidencias
 * Obtener todas las incidencias del hijo (sin filtrar por curso)
 */
router.get('/hijos/:hijoId/incidencias', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-INCIDENCIAS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-INCIDENCIAS] hijoId recibido: ${hijoId}`);

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    // Obtener matrícula del alumno para el año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({
        incidencias: [],
        total_incidencias: 0
      });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las incidencias del alumno (type = 1) del año activo
    const incidencias = await query(
      `SELECT ei.id, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? 
         AND ei.type = 1
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [matriculaId, anio_activo]
    );

    console.log(`✅ [HIJOS-INCIDENCIAS] Incidencias obtenidas: ${incidencias.length}`);
    console.log(`🔵 ========== [HIJOS-INCIDENCIAS] FIN DE PETICIÓN ==========\n`);

    res.json({
      incidencias: incidencias || [],
      total_incidencias: incidencias.length
    });
  } catch (error) {
    console.error('❌ [HIJOS-INCIDENCIAS] Error obteniendo incidencias:', error);
    res.status(500).json({ error: 'Error al obtener incidencias', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/estrellas
 * Obtener todas las estrellas del hijo (sin filtrar por curso)
 */
router.get('/hijos/:hijoId/estrellas', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-ESTRELLAS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-ESTRELLAS] hijoId recibido: ${hijoId}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!personal_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal
    let nroDocumento = null;
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
    } else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
      }
    }

    if (!nroDocumento) {
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estas estrellas. El alumno no está registrado como tu hijo.' });
    }

    // Obtener matrícula del alumno para el año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({
        estrellas: [],
        total_estrellas: 0
      });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las estrellas del alumno (type = 2) del año activo
    const estrellas = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? 
         AND ei.type = 2
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [matriculaId, anio_activo]
    );

    // Calcular total de estrellas
    const totalEstrellas = estrellas.reduce((sum, e) => sum + (e.points || 0), 0);

    console.log(`✅ [HIJOS-ESTRELLAS] Estrellas obtenidas: ${estrellas.length}, Total: ${totalEstrellas}`);
    console.log(`🔵 ========== [HIJOS-ESTRELLAS] FIN DE PETICIÓN ==========\n`);

    res.json({
      estrellas: estrellas || [],
      total_estrellas: totalEstrellas
    });
  } catch (error) {
    console.error('Error obteniendo estrellas del hijo:', error);
    res.status(500).json({ error: 'Error al obtener estrellas del alumno' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/asistencias
 * Obtener todas las asistencias de un hijo
 */
router.get('/hijos/:hijoId/asistencias', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-ASISTENCIAS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-ASISTENCIAS] hijoId recibido: ${hijoId}`);

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    // Obtener matrícula del alumno para el año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({
        asistencias: [],
        total_presentes: 0,
        total_tardanzas: 0,
        total_faltas: 0
      });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las asistencias del alumno del año activo
    const asistencias = await query(
      `SELECT ma.id, ma.fecha, ma.tipo, ma.hora_entrada, ma.hora_salida, ma.created_at
       FROM matriculas_asistencias ma
       WHERE ma.matricula_id = ?
       ORDER BY ma.fecha DESC`,
      [matriculaId]
    );

    // Calcular estadísticas
    const totalPresentes = asistencias.filter(a => a.tipo === 'PRESENTE' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
    const totalTardanzas = asistencias.filter(a => a.tipo === 'TARDANZA' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
    const totalFaltas = asistencias.filter(a => a.tipo === 'FALTA' || a.tipo === 'FALTA_JUSTIFICADA').length;

    console.log(`✅ [HIJOS-ASISTENCIAS] Asistencias obtenidas: ${asistencias.length}`);
    console.log(`📊 [HIJOS-ASISTENCIAS] Presentes: ${totalPresentes}, Tardanzas: ${totalTardanzas}, Faltas: ${totalFaltas}`);
    console.log(`🔵 ========== [HIJOS-ASISTENCIAS] FIN DE PETICIÓN ==========\n`);

    res.json({
      asistencias: asistencias || [],
      total_presentes: totalPresentes,
      total_tardanzas: totalTardanzas,
      total_faltas: totalFaltas
    });
  } catch (error) {
    console.error('Error obteniendo asistencias del hijo:', error);
    res.status(500).json({ error: 'Error al obtener asistencias', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/pagos
 * Obtener pagos del hijo agrupados por matrícula/año
 */
router.get('/hijos/:hijoId/pagos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-PAGOS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-PAGOS] hijoId recibido: ${hijoId}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!personal_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal
    let nroDocumento = null;
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
    } else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
      }
    }

    if (!nroDocumento) {
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos pagos. El alumno no está registrado como tu hijo.' });
    }

    // Obtener todas las matrículas del alumno
    const matriculas = await query(
      `SELECT m.id as matricula_id, m.alumno_id, g.anio, g.grado, g.seccion, n.nombre as nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       AND (m.estado = 0)
       ORDER BY g.anio DESC, g.grado ASC`,
      [hijoIdNum, colegio_id]
    );

    if (!matriculas || matriculas.length === 0) {
      return res.json({ matriculas: [] });
    }

    // Obtener configuración del colegio para calcular meses y fechas de vencimiento
    const colegioConfig = await query(
      `SELECT ciclo_pensiones, inicio_pensiones, pensiones_vencimiento, dias_tolerancia, anio_activo FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );

    const cicloPensiones = colegioConfig && colegioConfig.length > 0 ? colegioConfig[0].ciclo_pensiones : null;
    const inicioPensiones = colegioConfig && colegioConfig.length > 0 ? (colegioConfig[0].inicio_pensiones || 1) : 1;
    const anioActivo = colegioConfig && colegioConfig.length > 0 ? (colegioConfig[0].anio_activo || new Date().getFullYear()) : new Date().getFullYear();
    const pensionesVencimientoStr = colegioConfig && colegioConfig.length > 0 ? colegioConfig[0].pensiones_vencimiento : null;
    const diasTolerancia = colegioConfig && colegioConfig.length > 0 ? parseInt(colegioConfig[0].dias_tolerancia || 0) : 0;
    
    // Configuración de mora: S/. 1.00 por día (valor fijo según el usuario)
    const moraPorDia = 1.00;

    // Parsear pensiones_vencimiento (formato PHP serialize en base64)
    const phpSerialize = require('php-serialize');
    let vencimientosPensiones = {};
    if (pensionesVencimientoStr) {
      try {
        // El contenido viene en base64, primero decodificarlo
        let contenidoDeserializar = pensionesVencimientoStr;
        
        // Intentar decodificar base64 primero
        try {
          contenidoDeserializar = Buffer.from(pensionesVencimientoStr, 'base64').toString('utf-8');
        } catch (base64Error) {
          // Si no es base64, usar el string directamente
          console.log('No es base64, usando string directamente');
        }
        
        // Intentar deserializar
        const vencimientosDeserializados = phpSerialize.unserialize(contenidoDeserializar);
        vencimientosPensiones = vencimientosDeserializados || {};
      } catch (error) {
        console.error('Error deserializando pensiones_vencimiento:', error);
        console.error('Contenido de pensiones_vencimiento:', pensionesVencimientoStr);
        // Si falla la deserialización, intentar parsear como JSON
        try {
          if (typeof pensionesVencimientoStr === 'string' && pensionesVencimientoStr.startsWith('{')) {
            vencimientosPensiones = JSON.parse(pensionesVencimientoStr);
          } else {
            vencimientosPensiones = {};
          }
        } catch (jsonError) {
          console.error('Error parseando pensiones_vencimiento como JSON:', jsonError);
          vencimientosPensiones = {};
        }
      }
    }

    // Función para calcular fecha de vencimiento (similar a auth.routes.js)
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      if (!vencimiento || vencimiento === '') {
        // Si no hay configuración específica, usar el último día del mes correspondiente
        const mesPension = nroPension + 2; // Según sistema anterior
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        return `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
      }

      // Parsear el formato de vencimiento (puede ser: "dd", "dd-mm", o "dd-mm-yyyy")
      const partes = String(vencimiento).trim().split('-');
      
      if (partes.length === 1) {
        // Solo día: "31" -> fecha = "dd-(nroPension+2)-anio"
        const mesPension = nroPension + 2;
        return `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
      } else if (partes.length === 2) {
        // Día-mes: "31-01" -> fecha = "dd-mm-anio"
        return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
      } else {
        // Día-mes-año: puede ser "31-01-2026" o "31-01-20" (año con 2 dígitos)
        let añoFinal = partes[2];
        if (añoFinal.length === 2) {
          añoFinal = String(anio);
        }
        return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
      }
    };

    // Array de meses (índice 0 = Enero, 1 = Febrero, etc.)
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Función para obtener el nombre del mes según el número de pago
    // IMPORTANTE: Según el sistema anterior y el usuario:
    //   - tipo = 0 → Matrícula (no usa nro_pago para mes)
    //   - La numeración es: 1 = Matrícula, 2 = Marzo, 3 = Abril, etc.
    //   - Si inicio_pensiones = 2 (Marzo), nro_pago = 1 debe ser Marzo
    // Fórmula del sistema anterior (Pago.php línea 190, 265): MESES[nro_pago + inicio_pensiones - 1]
    // MESES es 0-indexed: [0=Enero, 1=Febrero, 2=Marzo, 3=Abril, ...]
    // inicio_pensiones en BD: 0=Enero, 1=Febrero, 2=Marzo (según AdminConfiguracion.jsx)
    // Ejemplo: Si inicio_pensiones = 2 (Marzo), nro_pago = 1:
    //   indice = 1 + 2 - 1 = 2 → Marzo ✓
    // Ejemplo: Si inicio_pensiones = 2 (Marzo), nro_pago = 2:
    //   indice = 2 + 2 - 1 = 3 → Abril ✓
    const getMesPension = (nroPago) => {
      if (cicloPensiones === 0 || cicloPensiones === '0') { // 0 = Mes
        // Fórmula del sistema anterior: indice = nro_pago + inicio_pensiones - 1
        const indiceMes = nroPago + inicioPensiones - 1;
        if (indiceMes >= 0 && indiceMes < MESES.length) {
          return MESES[indiceMes];
        }
      }
      return null;
    };

    // Obtener total_pensiones del colegio una sola vez
    const colegioTotalPensiones = await query(
      `SELECT total_pensiones FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const numPensiones = colegioTotalPensiones && colegioTotalPensiones.length > 0 
      ? parseInt(colegioTotalPensiones[0].total_pensiones || 10) 
      : 10;

    // Para cada matrícula, obtener sus pagos
    const matriculasConPagos = await Promise.all(
      matriculas.map(async (matricula) => {
        // Obtener el costo de la matrícula
        const costoInfo = await query(
          `SELECT c.pension, c.matricula 
           FROM matriculas m
           INNER JOIN costos c ON c.id = m.costo_id
           WHERE m.id = ? AND m.colegio_id = ? LIMIT 1`,
          [matricula.matricula_id, colegio_id]
        );

        // Obtener pagos existentes de esta matrícula
        const pagosExistentes = await query(
          `SELECT p.id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion, 
                  p.estado_pago, p.fecha_cancelado, p.nro_movimiento_banco, p.nro_movimiento_importado,
                  p.forma_pago, p.lugar_pago
           FROM pagos p
           WHERE p.matricula_id = ? AND p.estado = 'ACTIVO' AND p.colegio_id = ?
           ORDER BY p.tipo ASC, p.nro_pago ASC`,
          [matricula.matricula_id, colegio_id]
        );

        // Crear lista completa de pagos (existentes + pendientes)
        const pagosCompletos = [];
        const pension = costoInfo && costoInfo.length > 0 ? parseFloat(costoInfo[0].pension || 0) : 0;
        const matriculaCosto = costoInfo && costoInfo.length > 0 ? parseFloat(costoInfo[0].matricula || 0) : 0;

        // 1. Matrícula (tipo = 0)
        const matriculaPago = pagosExistentes.find(p => p.tipo === 0);
        if (matriculaPago) {
          pagosCompletos.push(matriculaPago);
        } else {
          // Crear pago pendiente de matrícula
          pagosCompletos.push({
            id: null,
            nro_pago: 0,
            monto: matriculaCosto,
            mora: 0,
            fecha_hora: null,
            tipo: 0,
            descripcion: '',
            estado_pago: 'PENDIENTE',
            fecha_cancelado: null,
            nro_movimiento_banco: null,
            nro_movimiento_importado: null,
            forma_pago: null,
            lugar_pago: null
          });
        }

        // 2. Pensiones (tipo = 1, nro_pago de 1 a numPensiones)
        for (let i = 1; i <= numPensiones; i++) {
          const pensionPago = pagosExistentes.find(p => p.tipo === 1 && p.nro_pago === i);
          if (pensionPago) {
            pagosCompletos.push(pensionPago);
          } else {
            // Crear pago pendiente de pensión
            pagosCompletos.push({
              id: null,
              nro_pago: i,
              monto: pension,
              mora: 0,
              fecha_hora: null,
              tipo: 1,
              descripcion: '',
              estado_pago: 'PENDIENTE',
              fecha_cancelado: null,
              nro_movimiento_banco: null,
              nro_movimiento_importado: null,
              forma_pago: null,
              lugar_pago: null
            });
          }
        }

        // Para cada pago, obtener la impresión (boleta) si existe y calcular fecha de vencimiento y mora
        const pagosConBoleta = await Promise.all(
          pagosCompletos.map(async (pago) => {
            // Solo buscar impresión si el pago tiene ID (existe en BD)
            let impresion = null;
            if (pago.id) {
              impresion = await query(
                `SELECT id, numero, serie, fecha_impresion, impreso
                 FROM impresiones
                 WHERE pago_id = ? AND tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND estado = 'ACTIVO'
                 ORDER BY id DESC
                 LIMIT 1`,
                [pago.id]
              );
            }

            // Determinar tipo de pago
            let tipoDescripcion = '';
            if (pago.tipo === 0) {
              tipoDescripcion = `MATRÍCULA ${matricula.anio}`;
            } else if (pago.tipo === 1) {
              // Pensión - usar el nombre del mes si está configurado
              const mesNombre = getMesPension(pago.nro_pago);
              if (mesNombre) {
                tipoDescripcion = `MENSUALIDAD ${mesNombre.toUpperCase()}`;
              } else {
                tipoDescripcion = `MENSUALIDAD ${pago.nro_pago}`;
              }
            } else if (pago.tipo === 3) {
              // Comedor - usar el nombre del mes
              const mesNombre = getMesPension(pago.nro_pago);
              if (mesNombre) {
                tipoDescripcion = `COMEDOR ${mesNombre.toUpperCase()}`;
              } else {
                tipoDescripcion = `COMEDOR ${pago.nro_pago}`;
              }
            } else {
              tipoDescripcion = pago.descripcion || `OTRO`;
            }

            // Calcular fecha de vencimiento y determinar si hubo mora
            let fechaVencimiento = null;
            let fechaVencimientoFormateada = null;
            let huboMora = false;
            let diasMora = 0;
            let montoMoraCalculado = 0; // Inicializar siempre

            // Solo calcular para pensiones (tipo = 1) y si tiene nro_pago válido
            if (pago.tipo === 1 && pago.nro_pago && pago.nro_pago > 0) {
              try {
                // Calcular fecha de vencimiento
                const fechaVencimientoStr = calcularFechaVencimiento(pago.nro_pago, matricula.anio, inicioPensiones);
                
                // Convertir dd-mm-yyyy a Date
                const partesFecha = fechaVencimientoStr.split('-');
                if (partesFecha.length === 3) {
                  fechaVencimiento = new Date(
                    parseInt(partesFecha[2]), // año
                    parseInt(partesFecha[1]) - 1, // mes (0-indexed)
                    parseInt(partesFecha[0]) // día
                  );
                  
                  // Formatear fecha para mostrar
                  fechaVencimientoFormateada = fechaVencimiento.toLocaleDateString('es-PE', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  });

                  // Calcular fecha límite (vencimiento + días de tolerancia)
                  const fechaLimite = new Date(fechaVencimiento);
                  fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
                  fechaLimite.setHours(23, 59, 59, 999);

                  // Si el pago está cancelado, verificar si se pagó después de la fecha límite
                  if (pago.estado_pago === 'CANCELADO' && pago.fecha_cancelado) {
                    const fechaCancelado = new Date(pago.fecha_cancelado);
                    fechaCancelado.setHours(0, 0, 0, 0);
                    
                    if (fechaCancelado > fechaLimite) {
                      huboMora = true;
                      // Calcular días de mora
                      const diffTime = fechaCancelado - fechaLimite;
                      diasMora = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                  } else if (pago.estado_pago === 'PENDIENTE') {
                    // Si está pendiente, verificar si ya pasó la fecha límite
                    const fechaActual = new Date();
                    fechaActual.setHours(0, 0, 0, 0);
                    
                    if (fechaActual > fechaLimite) {
                      huboMora = true;
                      // Calcular días de mora desde la fecha límite hasta hoy
                      const diffTime = fechaActual - fechaLimite;
                      diasMora = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                  }
                  
                  // Calcular monto de mora: días de mora * mora por día
                  if (huboMora && diasMora > 0) {
                    montoMoraCalculado = diasMora * moraPorDia;
                  }
                }
              } catch (error) {
                console.error(`Error calculando fecha de vencimiento para pago ${pago.id}:`, error);
              }
            }

            // Determinar monto de mora: usar el que está en BD si existe, sino calcular
            const montoMoraFinal = pago.mora && parseFloat(pago.mora) > 0 
              ? parseFloat(pago.mora) 
              : montoMoraCalculado;

            return {
              ...pago,
              tipo_descripcion: tipoDescripcion,
              total: parseFloat(pago.monto) + montoMoraFinal,
              fecha_vencimiento: fechaVencimiento ? moment(fechaVencimiento).tz('America/Lima').format('YYYY-MM-DD') : null,
              fecha_vencimiento_formateada: fechaVencimientoFormateada,
              hubo_mora: huboMora,
              dias_mora: diasMora,
              mora_calculada: montoMoraCalculado,
              mora_final: montoMoraFinal,
              boleta: impresion && impresion.length > 0 ? {
                numero: impresion[0].numero,
                serie: impresion[0].serie,
                serie_numero: `${String(impresion[0].serie).padStart(3, '0')}-${String(impresion[0].numero).padStart(7, '0')}`,
                fecha_impresion: impresion[0].fecha_impresion,
                impreso: impresion[0].impreso
              } : null
            };
          })
        );

        // Calcular totales para esta matrícula
        // Ya tenemos pension y matriculaCosto de arriba
        const totalPagar = matriculaCosto + (pension * numPensiones);

        // Total pagado: solo pagos cancelados de matrícula y mensualidades
        const totalPagado = pagosConBoleta
          .filter(p => p.estado_pago === 'CANCELADO' && (p.tipo === 0 || p.tipo === 1))
          .reduce((sum, p) => sum + parseFloat(p.monto) + parseFloat(p.mora || 0), 0);
        
        // Total adeuda: no puede ser negativo, mínimo 0
        const totalAdeuda = Math.max(0, totalPagar - totalPagado);

        return {
          matricula_id: matricula.matricula_id,
          anio: matricula.anio,
          grado: matricula.grado,
          seccion: matricula.seccion,
          nivel_nombre: matricula.nivel_nombre,
          grupo_texto: `${matricula.nivel_nombre} - ${matricula.grado}° ${matricula.seccion} - ${matricula.anio}`,
          pagos: pagosConBoleta,
          resumen: {
            total_pagar: totalPagar,
            total_pagado: totalPagado,
            total_adeuda: totalAdeuda
          }
        };
      })
    );

    console.log(`✅ [HIJOS-PAGOS] Pagos obtenidos para ${matriculasConPagos.length} matrícula(s)`);
    console.log(`🔵 ========== [HIJOS-PAGOS] FIN DE PETICIÓN ==========\n`);

    res.json({ matriculas: matriculasConPagos });
  } catch (error) {
    console.error('❌ [HIJOS-PAGOS] Error obteniendo pagos del hijo:', error);
    res.status(500).json({ error: 'Error al obtener pagos del hijo', details: error.message });
  }
});

/**
 * GET /api/docente/pagos/:pagoId/boleta
 * Obtener datos para generar boleta de pago
 */
router.get('/pagos/:pagoId/boleta', async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { colegio_id } = req.user;

    // Obtener datos del pago con información del alumno y matrícula
    const pagoData = await query(
      `SELECT 
        p.*,
        m.id as matricula_id,
        g.anio as matricula_anio,
        a.nombres as alumno_nombres,
        a.apellido_paterno as alumno_apellido_paterno,
        a.apellido_materno as alumno_apellido_materno,
        a.nro_documento as alumno_dni,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as alumno_nombre_completo,
        i.numero as boleta_numero,
        i.serie as boleta_serie,
        i.fecha_impresion as boleta_fecha_impresion
      FROM pagos p
      INNER JOIN matriculas m ON m.id = p.matricula_id
      INNER JOIN grupos g ON g.id = m.grupo_id
      INNER JOIN alumnos a ON a.id = m.alumno_id
      LEFT JOIN impresiones i ON i.pago_id = p.id AND i.tipo = 'PAGO' AND i.tipo_documento = 'BOLETA' AND i.estado = 'ACTIVO'
      WHERE p.id = ? AND p.colegio_id = ?
      ORDER BY i.id DESC
      LIMIT 1`,
      [pagoId, colegio_id]
    );

    if (pagoData.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const pago = pagoData[0];

    // Obtener datos de facturación del colegio
    const facturacionData = await query(
      `SELECT ruc, razon_social, direccion FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );

    // Obtener logo de boleta de la tabla config
    const configLogo = await query(
      `SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`
    );

    const facturacion = facturacionData.length > 0 ? facturacionData[0] : {};
    const logoFileName = configLogo.length > 0 ? configLogo[0].valor : null;

    // Construir URL del logo si existe
    let logoUrl = null;
    if (logoFileName) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logoUrl = `${phpSystemUrl}/Static/Archivos/${logoFileName}`;
      } else {
        logoUrl = `http://localhost:5000/Static/Archivos/${logoFileName}`;
      }
    }

    // Determinar descripción del pago
    let descripcionPago = '';
    if (pago.tipo === 0) {
      descripcionPago = `MATRÍCULA ${pago.matricula_anio}`;
    } else if (pago.tipo === 1) {
      // Obtener mes de pensión
      const colegioConfig = await query(
        `SELECT ciclo_pensiones, inicio_pensiones FROM colegios WHERE id = ? LIMIT 1`,
        [colegio_id]
      );
      const cicloPensiones = colegioConfig.length > 0 ? colegioConfig[0].ciclo_pensiones : null;
      const inicioPensiones = colegioConfig.length > 0 ? (colegioConfig[0].inicio_pensiones || 1) : 1;
      
      if (cicloPensiones === 0 || cicloPensiones === '0') {
        const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const indiceMes = pago.nro_pago + inicioPensiones - 1;
        if (indiceMes >= 0 && indiceMes < MESES.length) {
          descripcionPago = `MENSUALIDAD ${MESES[indiceMes].toUpperCase()}`;
        } else {
          descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
        }
      } else {
        descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
      }
    } else if (pago.tipo === 3) {
      descripcionPago = `COMEDOR ${pago.nro_pago}`;
    } else {
      descripcionPago = pago.descripcion || 'OTRO';
    }

    res.json({
      pago: {
        id: pago.id,
        tipo: pago.tipo,
        tipo_descripcion: descripcionPago,
        monto: parseFloat(pago.monto) || 0,
        mora: parseFloat(pago.mora) || 0,
        total: parseFloat(pago.monto) + parseFloat(pago.mora || 0),
        fecha_cancelado: pago.fecha_cancelado,
        estado_pago: pago.estado_pago,
        boleta_numero: pago.boleta_numero,
        boleta_serie: pago.boleta_serie,
        boleta_fecha_impresion: pago.boleta_fecha_impresion
      },
      alumno: {
        nombres: pago.alumno_nombres,
        apellido_paterno: pago.alumno_apellido_paterno,
        apellido_materno: pago.alumno_apellido_materno,
        nombre_completo: pago.alumno_nombre_completo,
        dni: pago.alumno_dni
      },
      facturacion: {
        ruc: facturacion.ruc || '',
        razon_social: facturacion.razon_social || '',
        direccion: facturacion.direccion || '',
        logo_url: logoUrl
      }
    });
  } catch (error) {
    console.error('Error obteniendo datos de boleta:', error);
    res.status(500).json({ error: 'Error al obtener datos de boleta', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/horario
 * Obtener horario del hijo
 */
router.get('/hijos/:hijoId/horario', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-HORARIO] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-HORARIO] hijoId recibido: ${hijoId}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!personal_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal
    let nroDocumento = null;
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
    } else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
      }
    }

    if (!nroDocumento) {
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver este horario. El alumno no está registrado como tu hijo.' });
    }

    // Obtener matrícula actual del alumno para obtener su grupo
    const matricula = await query(
      `SELECT m.grupo_id FROM matriculas m 
       INNER JOIN grupos g ON g.id = m.grupo_id 
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0) 
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      console.log('📅 [HIJOS-HORARIO] No se encontró matrícula para el año activo');
      return res.json({ horario: [] });
    }

    const grupoId = matricula[0].grupo_id;
    console.log('📅 [HIJOS-HORARIO] Grupo encontrado:', grupoId);

    const anioActivoInt = parseInt(anio_activo);

    // Obtener horario del grupo del alumno (igual que en alumno.routes.js)
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre AS curso_nombre,
         gh.descripcion AS descripcion,
         g.grado,
         g.seccion,
         n.nombre AS nivel_nombre,
         CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id AND a.colegio_id = ?
       LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN personal p ON p.id = COALESCE(a.personal_id, gh.personal_id)
       WHERE gh.anio = ? 
         AND (
           (a.grupo_id = ? AND a.colegio_id = ?) 
           OR 
           (gh.grupo_id = ? AND a.id IS NULL)
         )
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [colegio_id, anioActivoInt, grupoId, colegio_id, grupoId]
    );

    console.log(`📅 [HIJOS-HORARIO] Filas de horario encontradas: ${horarioCrudo ? horarioCrudo.length : 0}`);

    // Mapear a un formato estándar para el frontend (igual que en alumno.routes.js)
    const horario = (horarioCrudo || []).map((row) => {
      const titulo = row.curso_nombre || row.descripcion || '';
      const grupoTexto = row.nivel_nombre && row.grado && row.seccion
        ? `${row.nivel_nombre} - ${row.grado}° ${row.seccion}`
        : '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto,
        docente_nombre: row.docente_nombre || ''
      };
    });

    console.log(`✅ [HIJOS-HORARIO] Horario obtenido exitosamente: ${horario.length} registros`);
    console.log(`🔵 ========== [HIJOS-HORARIO] FIN DE PETICIÓN ==========\n`);

    res.json({ horario });
  } catch (error) {
    console.error('❌ [HIJOS-HORARIO] Error obteniendo horario del hijo:', error);
    res.status(500).json({ error: 'Error al obtener horario del hijo', details: error.message });
  }
});

/**
 * Misma vinculación apoderado–alumno que verificarHijoYUsuario (por DNI del personal),
 * sin exigir que el alumno tenga usuario activo (mensajes al docente como padre/madre).
 */
async function verificarHijoDocenteSoloVinculo(req, hijoId) {
  const { colegio_id, usuario_id, personal_id } = req.user;

  if (!hijoId || isNaN(parseInt(hijoId))) {
    throw new Error('ID de alumno inválido');
  }
  const hijoIdNum = parseInt(hijoId, 10);

  if (!personal_id) {
    throw new Error('Información de usuario incompleta. No se encontró personal_id.');
  }

  let nroDocumento = null;
  const personalData = await query(
    `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [personal_id, colegio_id]
  );

  if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
    nroDocumento = personalData[0].nro_documento;
  } else {
    const usuarioData = await query(
      `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
      [usuario_id, colegio_id, personal_id]
    );
    if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
      nroDocumento = usuarioData[0].usuario;
    }
  }

  if (!nroDocumento) {
    throw new Error('No se encontró tu número de documento. Contacta al administrador.');
  }

  const esHijo = await query(
    `SELECT COUNT(*) as count
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.colegio_id = ?
       AND ap.nro_documento = ?
       AND a.id = ?
       AND a.colegio_id = ?`,
    [colegio_id, nroDocumento, hijoIdNum, colegio_id]
  );

  if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
    throw new Error('No tienes permisos. El alumno no está registrado como tu hijo.');
  }

  return { hijoIdNum };
}

/**
 * Helper: Verificar que el docente tiene permisos sobre el hijo y obtener usuario_id del hijo
 */
async function verificarHijoYUsuario(req, hijoId) {
  console.log(`\n🔵 [VERIFICAR-HIJO] Iniciando verificación para hijoId: ${hijoId}`);
  const { colegio_id, usuario_id, personal_id } = req.user;
  console.log(`📋 [VERIFICAR-HIJO] User data:`, { colegio_id, usuario_id, personal_id });
  
  if (!hijoId || isNaN(parseInt(hijoId))) {
    console.error(`❌ [VERIFICAR-HIJO] ID de alumno inválido: ${hijoId}`);
    throw new Error('ID de alumno inválido');
  }

  const hijoIdNum = parseInt(hijoId);
  console.log(`📋 [VERIFICAR-HIJO] hijoIdNum: ${hijoIdNum}`);

  if (!personal_id) {
    console.error(`❌ [VERIFICAR-HIJO] personal_id no encontrado`);
    throw new Error('Información de usuario incompleta. No se encontró personal_id.');
  }

  // Obtener nro_documento del personal
  let nroDocumento = null;
  console.log(`📋 [VERIFICAR-HIJO] Buscando nro_documento en personal para personal_id=${personal_id}, colegio_id=${colegio_id}`);
  const personalData = await query(
    `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [personal_id, colegio_id]
  );
  console.log(`📋 [VERIFICAR-HIJO] Resultado personalData:`, personalData);

  if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
    nroDocumento = personalData[0].nro_documento;
    console.log(`✅ [VERIFICAR-HIJO] nro_documento encontrado en personal: ${nroDocumento}`);
  } else {
    console.log(`📋 [VERIFICAR-HIJO] Buscando nro_documento en usuarios para usuario_id=${usuario_id}, personal_id=${personal_id}, colegio_id=${colegio_id}`);
    const usuarioData = await query(
      `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
      [usuario_id, colegio_id, personal_id]
    );
    console.log(`📋 [VERIFICAR-HIJO] Resultado usuarioData:`, usuarioData);
    if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
      nroDocumento = usuarioData[0].usuario;
      console.log(`✅ [VERIFICAR-HIJO] nro_documento encontrado en usuarios: ${nroDocumento}`);
    }
  }

  if (!nroDocumento) {
    console.error(`❌ [VERIFICAR-HIJO] No se encontró nro_documento`);
    throw new Error('No se encontró tu número de documento. Contacta al administrador.');
  }

  // Verificar que el alumno es hijo del docente
  console.log(`📋 [VERIFICAR-HIJO] Verificando si alumno ${hijoIdNum} es hijo del docente con nro_documento ${nroDocumento}, colegio_id ${colegio_id}`);
  const esHijo = await query(
    `SELECT COUNT(*) as count
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.colegio_id = ?
       AND ap.nro_documento = ?
       AND a.id = ?
       AND a.colegio_id = ?`,
    [colegio_id, nroDocumento, hijoIdNum, colegio_id]
  );
  console.log(`📋 [VERIFICAR-HIJO] Resultado esHijo:`, esHijo);

  if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
    console.error(`❌ [VERIFICAR-HIJO] El alumno no está registrado como hijo. count: ${esHijo?.[0]?.count || 0}`);
    throw new Error('No tienes permisos. El alumno no está registrado como tu hijo.');
  }

  const { anio_activo } = req.user;
  const matriculaHijoOk = await personalHijoTieneMatriculaAnioActivoOperativa(
    query,
    nroDocumento,
    hijoIdNum,
    colegio_id,
    anio_activo
  );
  if (!matriculaHijoOk) {
    throw new Error(MENSAJE_SIN_MATRICULA);
  }

  // Obtener usuario_id del hijo
  console.log(`📋 [VERIFICAR-HIJO] Obteniendo usuario_id del hijo para alumno_id=${hijoIdNum}, colegio_id=${colegio_id}`);
  const usuarioHijo = await query(
    `SELECT u.id as usuario_id, a.id as alumno_id
     FROM alumnos a
     INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
     WHERE a.id = ? AND a.colegio_id = ?`,
    [hijoIdNum, colegio_id]
  );
  console.log(`📋 [VERIFICAR-HIJO] Resultado usuarioHijo:`, usuarioHijo);

  if (!usuarioHijo || usuarioHijo.length === 0) {
    console.error(`❌ [VERIFICAR-HIJO] El alumno no tiene un usuario activo`);
    throw new Error('El alumno no tiene un usuario activo.');
  }

  console.log(`✅ [VERIFICAR-HIJO] Verificación exitosa. alumnoId: ${usuarioHijo[0].alumno_id}, usuarioIdHijo: ${usuarioHijo[0].usuario_id}`);
  return {
    hijoId: hijoIdNum,
    usuarioIdHijo: usuarioHijo[0].usuario_id,
    alumnoId: usuarioHijo[0].alumno_id
  };
}

/**
 * POST /api/docente/hijos/:hijoId/mensajes/enviar
 * Docente que también es apoderado: remitente = su usuario (sesión docente); asunto/cuerpo con referencia al hijo/grado.
 */
router.post('/hijos/:hijoId/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { destinatarios, asunto, mensaje } = req.body;
    const { colegio_id, anio_activo, usuario_id: usuarioIdRemitente } = req.user;

    if (!usuarioIdRemitente) {
      return res.status(400).json({ error: 'No se pudo identificar al usuario.' });
    }

    await verificarHijoDocenteSoloVinculo(req, hijoId);
    const hijoIdNum = parseInt(hijoId, 10);

    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;

    if (!destinatariosArray || destinatariosArray.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    const ctxAlumno = await obtenerContextoAlumnoGrupoParaMensaje(colegio_id, anio_activo, hijoIdNum);
    const { asuntoFinal, mensajeFinal } = enriquecerMensajeApoderadoADocente({
      asuntoOriginal: asunto,
      mensajeOriginal: mensaje,
      ctx: ctxAlumno
    });

    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    setImmediate(async () => {
      try {
        const fechaHora = fechaHoraMySQLLima();
        const mensajesIds = [];
        const campanaDocenteHijoMsg = [];

        for (const destinatarioId of destinatariosArray) {
          try {
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuarioIdRemitente, destinatarioId, asuntoFinal, mensajeFinal, fechaHora]
            );

            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuarioIdRemitente, destinatarioId, asuntoFinal, mensajeFinal, fechaHora]
            );

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            campanaDocenteHijoMsg.push({
              destinatarioId: parseInt(destinatarioId, 10),
              mensajeRecibidoId: resultRecibido.insertId
            });
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
          }
        }

        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            try {
              for (const mensajeId of mensajesIds) {
                await execute(
                  `INSERT INTO mensajes_archivos (mensaje_id, nombre_archivo, archivo)
                   VALUES (?, ?, ?)`,
                  [mensajeId, file.originalname, file.filename]
                );
              }
            } catch (error) {
              console.error(`Error guardando archivo ${file.originalname}:`, error);
            }
          }
        }

        const idsTipoDh = destinatariosArray.map((id) => parseInt(id, 10));
        let mapTipoDocenteHijo = new Map();
        if (idsTipoDh.length > 0 && req.user?.colegio_id) {
          const trDh = await query(
            `SELECT id, tipo FROM usuarios WHERE id IN (${idsTipoDh.map(() => '?').join(',')}) AND colegio_id = ?`,
            [...idsTipoDh, req.user.colegio_id]
          );
          mapTipoDocenteHijo = new Map((trDh || []).map((r) => [parseInt(r.id, 10), r.tipo]));
        }
        try {
          if (campanaDocenteHijoMsg.length > 0) {
            const contenidoBell = `Nuevo mensaje: "${(asuntoFinal || 'Sin asunto').substring(0, 150)}".`;
            for (const row of campanaDocenteHijoMsg) {
              const td = mapTipoDocenteHijo.get(row.destinatarioId) || 'DOCENTE';
              let urlDest = '/docente/mensajes';
              if (td === 'APODERADO') urlDest = '/apoderado/mensajes';
              else if (td === 'ALUMNO') urlDest = '/alumno/mensajes';
              try {
                if (
                  await notificacionMensajeDuplicadaReciente(query, {
                    usuario_id: usuarioIdRemitente,
                    destinatario_id: row.destinatarioId,
                    accion_tipo: 'mensaje_nuevo',
                    contenido: contenidoBell
                  })
                ) {
                  continue;
                }
                await insertNotificacionUsuario(execute, {
                  usuario_id: usuarioIdRemitente,
                  destinatario_id: row.destinatarioId,
                  asunto: 'Nuevo mensaje',
                  contenido: contenidoBell,
                  estado: 'ENVIADO',
                  accion_tipo: 'mensaje_nuevo',
                  accion_payload: { mensaje_id: row.mensajeRecibidoId, hijo_id: hijoIdNum },
                  url_destino: urlDest
                });
              } catch (bellErr) {
                console.warn(`[DOCENTE-HIJOS MENSAJES] Campanita:`, bellErr.message);
              }
            }
          }
        } catch (bellErr2) {
          console.warn('[DOCENTE-HIJOS MENSAJES] Notificaciones in-app:', bellErr2.message);
        }

        try {
          if (destinatariosArray.length > 0 && req.user?.colegio_id) {
            const subsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
               WHERE usuario_id IN (${destinatariosArray.map(() => '?').join(',')})
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...destinatariosArray.map(id => parseInt(id)), req.user.colegio_id]
            );
            if ((subsData || []).length > 0) {
              const asuntoCorto = (asuntoFinal || 'Sin asunto').substring(0, 80);
              const pushItemsDh = (subsData || []).map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const td = mapTipoDocenteHijo.get(uid) || 'DOCENTE';
                let urlPush = '/docente/mensajes';
                if (td === 'APODERADO') urlPush = '/apoderado/mensajes';
                else if (td === 'ALUMNO') urlPush = '/alumno/mensajes';
                return {
                  subscription: {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                  },
                  payload: {
                    title: 'Nuevo mensaje',
                    body: asuntoCorto,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `mensaje-${Date.now()}`,
                    data: { url: urlPush, tipo: 'mensaje' }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsDh).catch((err) =>
                console.error('❌ [MENSAJES] Error push:', err)
              );
            }
          }
        } catch (pushErr) {
          console.error('❌ [MENSAJES] Error push:', pushErr);
        }

        console.log('✅ [DOCENTE-HIJOS] Mensaje al docente enviado por usuario docente/apoderado (remitente = cuenta docente)');
      } catch (bgError) {
        console.error('Error en procesamiento en segundo plano:', bgError);
      }
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: error.message || 'Error al enviar mensaje' });
  }
});

/**
 * POST /api/docente/hijos/:hijoId/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido (en nombre del hijo)
 */
router.post('/hijos/:hijoId/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    const { hijoId } = req.params;
    
    // Verificar permisos
    await verificarHijoYUsuario(req, hijoId);

    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    
    let imagenUrl;
    if (isProduction) {
      imagenUrl = `${phpSystemUrl}/Static/Archivos/${req.file.filename}`;
    } else {
      imagenUrl = `http://localhost:5000/Static/Archivos/${req.file.filename}`;
    }
    
    res.json({ url: imagenUrl });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: error.message || 'Error al subir la imagen' });
  }
});

/**
 * Rutas proxy para aula virtual del hijo - todas requieren verificación de permisos
 * Estas rutas actúan como proxy, verificando permisos y luego delegando a la lógica del alumno
 * IMPORTANTE: Las rutas específicas (tareas, examenes, etc.) deben estar ANTES de la ruta general (:asignaturaId)
 * para que Express las capture correctamente.
 */

/**
 * Middleware para verificar que las rutas proxy solo permitan GET (solo lectura)
 * Rechaza POST, PUT, DELETE para docentes/apoderados
 */
const soloLecturaProxy = (req, res, next) => {
  console.log(`🔵 [SOLO-LECTURA-PROXY] Método: ${req.method}, URL: ${req.originalUrl}`);
  if (req.method !== 'GET') {
    console.error(`❌ [SOLO-LECTURA-PROXY] Método no permitido: ${req.method}`);
    return res.status(403).json({ 
      error: 'Solo lectura permitida. Los apoderados y docentes solo pueden ver el contenido, no realizar acciones.' 
    });
  }
  console.log(`✅ [SOLO-LECTURA-PROXY] Método GET permitido, continuando...`);
  next();
};

// Proxy para obtener tareas (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/tareas', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-TAREAS] Nueva petición`);
    console.log(`📋 Params:`, req.params);
    console.log(`📋 Query:`, req.query);
    console.log(`📋 User:`, { usuario_id: req.user?.usuario_id, tipo: req.user?.tipo, personal_id: req.user?.personal_id });
    
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
      console.log(`✅ [HIJOS-AULA-VIRTUAL-TAREAS] Permisos verificados, alumnoId: ${alumnoId}`);
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-TAREAS] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }
    
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    console.log(`📋 [HIJOS-AULA-VIRTUAL-TAREAS] Verificando acceso a asignatura: asignatura_id=${asignatura_id}, alumnoId=${alumnoId}, colegio_id=${colegio_id}, anio_activo=${anio_activo}`);
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );
    console.log(`📋 [HIJOS-AULA-VIRTUAL-TAREAS] Resultado verificación asignatura:`, asignatura.length > 0 ? '✅ Encontrada' : '❌ No encontrada');

    if (asignatura.length === 0) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-TAREAS] El alumno no tiene acceso a esta asignatura`);
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener tareas (misma lógica que alumno)
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.asignatura_id = ? AND t.ciclo = ?
       ORDER BY t.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs de archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const tareasConArchivos = await Promise.all(tareas.map(async (tarea) => {
      const archivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );

      const archivosConUrls = archivos.map(archivo => {
        let archivoUrl = null;
        if (archivo.archivo && archivo.archivo !== '') {
          if (archivo.archivo.startsWith('http')) {
            archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl);
          } else if (archivo.archivo.startsWith('/Static/')) {
            const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
              : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
          } else {
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
              : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
          }
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });

      let enlaceUrl = null;
      if (tarea.enlace && tarea.enlace !== '') {
        enlaceUrl = tarea.enlace.trim();
      }

      return {
        ...tarea,
        archivos: archivosConUrls,
        enlace_url: enlaceUrl
      };
    }));

    res.json({ tareas: tareasConArchivos || [] });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: error.message || 'Error al obtener tareas' });
  }
});

// Proxy para obtener detalles de una tarea específica (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/tareas/:tareaId', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-TAREA-DETALLE] Nueva petición`);
    console.log(`📋 Params:`, req.params);
    console.log(`📋 User:`, { usuario_id: req.user?.usuario_id, tipo: req.user?.tipo, personal_id: req.user?.personal_id });
    
    const { hijoId, tareaId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    let alumnoId;
    let alumnoUsuarioId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
      alumnoUsuarioId = resultado.alumnoUsuarioId;
      console.log(`✅ [HIJOS-AULA-VIRTUAL-TAREA-DETALLE] Permisos verificados, alumnoId: ${alumnoId}, usuarioId: ${alumnoUsuarioId}`);
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-TAREA-DETALLE] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }

    // Verificar que el alumno tiene acceso a esta tarea
    const tarea = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              a.id as asignatura_id,
              c.nombre as curso_nombre,
              g.id as grupo_id
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE t.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [tareaId, alumnoId, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-TAREA-DETALLE] Tarea no encontrada o sin acceso`);
      return res.status(404).json({ error: 'Tarea no encontrada o sin acceso' });
    }

    const tareaData = tarea[0];

    // Obtener archivos de la tarea
    const archivos = await query(
      `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
      [tareaId]
    );

    // Construir URLs de archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return {
        ...archivo,
        archivo_url: archivoUrl
      };
    });

    // Obtener entregas del alumno para esta tarea
    const entregas = await query(
      `SELECT * FROM asignaturas_tareas_entregas
       WHERE tarea_id = ? AND alumno_id = ? AND tipo = 'ALUMNO'
       ORDER BY fecha_hora DESC`,
      [tareaId, alumnoId]
    );

    // Obtener nota del alumno para esta tarea
    const nota = await query(
      `SELECT nota FROM asignaturas_tareas_notas
       WHERE tarea_id = ? AND matricula_id IN (
         SELECT id FROM matriculas WHERE alumno_id = ? AND colegio_id = ? AND grupo_id = ?
       )
       LIMIT 1`,
      [tareaId, alumnoId, colegio_id, tareaData.grupo_id]
    );

    // Deserializar campo "visto" (formato PHP serialized)
    let vistos = [];
    try {
      if (tareaData.visto && tareaData.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaData.visto);
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    const visto = vistos.includes(alumnoId) ? 'SI' : 'NO';

    // Construir URL del enlace si existe
    let enlaceUrl = null;
    if (tareaData.enlace && tareaData.enlace !== '') {
      enlaceUrl = tareaData.enlace.trim();
    }

    res.json({
      tarea: {
        ...tareaData,
        archivos: archivosConUrls,
        entregas: entregas || [],
        nota: nota.length > 0 ? nota[0].nota : null,
        visto: visto,
        enlace_url: enlaceUrl
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalles de tarea:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalles de la tarea' });
  }
});

// Proxy para obtener exámenes (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/examenes', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-EXAMENES] Nueva petición`);
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-EXAMENES] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }
    
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener matrícula del hijo
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    // Obtener exámenes (misma lógica que alumno)
    const examenes = await query(
      `SELECT ae.*, 
              COUNT(DISTINCT ep.id) as total_preguntas
       FROM asignaturas_examenes ae
       LEFT JOIN asignaturas_examenes_preguntas ep ON ep.examen_id = ae.id
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       GROUP BY ae.id
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Agregar información adicional para cada examen (tiene_nota, puede_iniciar, etc.)
    const examenesConInfo = await Promise.all(examenes.map(async (examen) => {
      let tiene_nota = false;
      let intentos_usados = 0;
      
      if (matricula.length > 0) {
        // Verificar si tiene nota en la tabla de pruebas
        try {
          const pruebaConNota = await query(
            `SELECT puntaje FROM asignaturas_examenes_pruebas
             WHERE examen_id = ? AND matricula_id = ? AND estado = 'FINALIZADA' AND puntaje IS NOT NULL
             ORDER BY fecha_hora DESC
             LIMIT 1`,
            [examen.id, matricula[0].matricula_id]
          );
          
          tiene_nota = pruebaConNota.length > 0 && pruebaConNota[0].puntaje !== null;
        } catch (err) {
          console.error('Error verificando nota en pruebas:', err);
          tiene_nota = false;
        }
        
        // Contar intentos usados
        try {
          const intentosData = await query(
            `SELECT COUNT(*) as total FROM asignaturas_examenes_pruebas
             WHERE examen_id = ? AND matricula_id = ? AND estado = 'FINALIZADA'`,
            [examen.id, matricula[0].matricula_id]
          );
          
          intentos_usados = intentosData[0]?.total || 0;
        } catch (error) {
          console.error('Error contando intentos:', error);
          intentos_usados = 0;
        }
      }
      
      const archivo_pdf_url = buildArchivoPdfUrl(examen.archivo_pdf);
      const esPdf = esExamenTipoPdf(examen.tipo);
      return {
        ...examen,
        archivo_pdf_url,
        tiene_nota,
        intentos_usados,
        puede_iniciar:
          !esPdf &&
          examen.estado === 'ACTIVO' &&
          !tiene_nota &&
          (examen.intentos === 0 || intentos_usados < examen.intentos),
        puede_ver_pdf: esPdf && examen.estado === 'ACTIVO' && !!archivo_pdf_url
      };
    }));

    res.json({ examenes: examenesConInfo || [] });
  } catch (error) {
    console.error('Error obteniendo exámenes:', error);
    res.status(500).json({ error: error.message || 'Error al obtener exámenes' });
  }
});

// GET metadatos de un examen (vista hijo — mismo criterio de acceso que lista de exámenes)
router.get('/hijos/:hijoId/aula-virtual/examenes/:examenId', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
    } catch (error) {
      return res.status(403).json({ error: error.message || 'Sin permisos' });
    }

    const examen = await query(
      `SELECT ae.*, a.id as asignatura_id, g.id as grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumnoId, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin acceso' });
    }

    const row = examen[0];
    res.json({
      ...row,
      archivo_pdf_url: buildArchivoPdfUrl(row.archivo_pdf)
    });
  } catch (error) {
    console.error('Error obteniendo examen (hijo):', error);
    res.status(500).json({ error: error.message || 'Error al obtener examen' });
  }
});

// Proxy para obtener archivos (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/archivos', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-ARCHIVOS] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }
    
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener archivos (misma lógica que alumno)
    const archivos = await query(
      `SELECT * FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo;
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return {
        ...archivo,
        archivo_url: archivoUrl
      };
    });

    res.json({ archivos: archivosConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo archivos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener archivos' });
  }
});

// Proxy para obtener videos (SOLO GET - solo lectura)
router.get('/hijos/:hijoId/aula-virtual/videos', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-VIDEOS] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }
    
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener videos
    const videos = await query(
      `SELECT * FROM asignaturas_videos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ videos: videos || [] });
  } catch (error) {
    console.error('Error obteniendo videos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener videos' });
  }
});

// Proxy para obtener resultado de examen del hijo (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO] Nueva petición`);
    console.log(`📋 Params:`, req.params);
    console.log(`📋 User:`, { usuario_id: req.user?.usuario_id, tipo: req.user?.tipo, personal_id: req.user?.personal_id });
    
    const { hijoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    let alumnoId;
    let matriculaId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
      console.log(`✅ [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO] Permisos verificados, alumnoId: ${alumnoId}`);
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }

    // Obtener matrícula del hijo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    matriculaId = matricula[0].id;

    // Verificar que el examen existe y el hijo tiene acceso
    const examen = await query(
      `SELECT ae.*, a.grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumnoId, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin acceso' });
    }

    // Obtener resultado del examen del hijo
    const resultado = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ?
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matriculaId]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ error: 'No se encontró resultado para este examen' });
    }

    const resultadoData = resultado[0];

    res.json({
      resultado: resultadoData,
      examen: examen[0]
    });
  } catch (error) {
    console.error('Error obteniendo resultado del examen:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resultado del examen' });
  }
});

// Proxy para obtener detalles completos del resultado del examen del hijo usando examenId (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta con resultadoId
router.get('/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado/detalles', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO-DETALLES] Nueva petición`);
    console.log(`📋 Params:`, req.params);
    console.log(`📋 User:`, { usuario_id: req.user?.usuario_id, tipo: req.user?.tipo, personal_id: req.user?.personal_id });
    
    const { hijoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    let alumnoId;
    let matriculaId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
      console.log(`✅ [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO-DETALLES] Permisos verificados, alumnoId: ${alumnoId}`);
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-EXAMEN-RESULTADO-DETALLES] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }

    // Obtener matrícula del hijo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    matriculaId = matricula[0].id;

    // Obtener el resultado del examen del hijo
    const resultado = await query(
      `SELECT 
        aep.*,
        ae.titulo as examen_titulo,
        ae.tipo_puntaje,
        ae.puntos_correcta
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
       WHERE aep.examen_id = ? AND aep.matricula_id = ?
       ORDER BY aep.fecha_hora DESC
       LIMIT 1`,
      [examenId, matriculaId]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ error: 'No se encontró resultado para este examen' });
    }

    const resultadoInfo = resultado[0];

    // Obtener preguntas que vio el alumno (misma lógica que docente)
    let preguntaIds = [];
    try {
      if (resultadoInfo.preguntas && resultadoInfo.preguntas.trim() !== '') {
        try {
          preguntaIds = JSON.parse(resultadoInfo.preguntas);
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.preguntas, 'base64').toString('utf-8');
            preguntaIds = phpSerialize.unserialize(decoded) || [];
          } catch (phpError) {
            console.warn('Error parseando preguntas:', phpError);
            preguntaIds = [];
          }
        }
      }
    } catch (error) {
      console.warn('Error obteniendo preguntaIds:', error);
    }

    const preguntasConAlternativas = await fetchPreguntasConAlternativas(
      query,
      examenId,
      preguntaIds,
      'boolean'
    );

    // Parsear respuestas del alumno
    let respuestasAlumno = {};
    try {
      if (resultadoInfo.respuestas && resultadoInfo.respuestas.trim() !== '') {
        try {
          respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          } catch (phpError) {
            console.warn('Error parseando respuestas:', phpError);
            respuestasAlumno = {};
          }
        }
        
        // Normalizar claves a strings
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach(key => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      }
    } catch (parseError) {
      console.error('Error parseando respuestas del alumno:', parseError);
      respuestasAlumno = {};
    }

    res.json({
      resultado: resultadoInfo,
      preguntas: preguntasConAlternativas,
      respuestas: respuestasAlumno
    });
  } catch (error) {
    console.error('Error obteniendo detalles del resultado:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalles del resultado' });
  }
});

// Proxy para obtener detalles completos del resultado del examen del hijo usando resultadoId (SOLO GET - solo lectura)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta general /:asignaturaId
router.get('/hijos/:hijoId/aula-virtual/resultados/:resultadoId/detalles', soloLecturaProxy, async (req, res) => {
  try {
    console.log(`\n🔵 [HIJOS-AULA-VIRTUAL-RESULTADO-DETALLES] Nueva petición`);
    console.log(`📋 Params:`, req.params);
    console.log(`📋 User:`, { usuario_id: req.user?.usuario_id, tipo: req.user?.tipo, personal_id: req.user?.personal_id });
    
    const { hijoId, resultadoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
      console.log(`✅ [HIJOS-AULA-VIRTUAL-RESULTADO-DETALLES] Permisos verificados, alumnoId: ${alumnoId}`);
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-RESULTADO-DETALLES] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }

    // Obtener el resultado y verificar que pertenece al hijo
    const resultado = await query(
      `SELECT 
        aep.*,
        ae.titulo as examen_titulo,
        ae.tipo_puntaje,
        ae.puntos_correcta,
        m.alumno_id
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       WHERE aep.id = ? AND m.alumno_id = ? AND m.colegio_id = ?`,
      [resultadoId, alumnoId, colegio_id]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ error: 'Resultado no encontrado o sin acceso' });
    }

    const resultadoInfo = resultado[0];
    const examenId = resultadoInfo.examen_id;

    // Obtener preguntas que vio el alumno (misma lógica que docente)
    let preguntaIds = [];
    try {
      if (resultadoInfo.preguntas && resultadoInfo.preguntas.trim() !== '') {
        try {
          preguntaIds = JSON.parse(resultadoInfo.preguntas);
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.preguntas, 'base64').toString('utf-8');
            preguntaIds = phpSerialize.unserialize(decoded) || [];
          } catch (phpError) {
            console.warn('Error parseando preguntas:', phpError);
            preguntaIds = [];
          }
        }
      }
    } catch (error) {
      console.warn('Error obteniendo preguntaIds:', error);
    }

    const preguntasConAlternativas = await fetchPreguntasConAlternativas(
      query,
      examenId,
      preguntaIds,
      'boolean'
    );

    // Parsear respuestas del alumno
    let respuestasAlumno = {};
    try {
      if (resultadoInfo.respuestas && resultadoInfo.respuestas.trim() !== '') {
        try {
          respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
        } catch (jsonError) {
          try {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          } catch (phpError) {
            console.warn('Error parseando respuestas:', phpError);
            respuestasAlumno = {};
          }
        }
        
        // Normalizar claves a strings
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach(key => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      }
    } catch (parseError) {
      console.error('Error parseando respuestas del alumno:', parseError);
      respuestasAlumno = {};
    }

    res.json({
      resultado: resultadoInfo,
      preguntas: preguntasConAlternativas,
      respuestas: respuestasAlumno
    });
  } catch (error) {
    console.error('Error obteniendo detalles del resultado:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalles del resultado' });
  }
});

// Proxy para obtener enlaces (SOLO GET - solo lectura)
router.get('/hijos/:hijoId/aula-virtual/enlaces', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    let alumnoId;
    try {
      const resultado = await verificarHijoYUsuario(req, hijoId);
      alumnoId = resultado.alumnoId;
    } catch (error) {
      console.error(`❌ [HIJOS-AULA-VIRTUAL-ENLACES] Error verificando permisos:`, error.message);
      return res.status(403).json({ error: error.message || 'No tienes permisos para acceder a este recurso' });
    }
    
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener enlaces
    const enlaces = await query(
      `SELECT * FROM asignaturas_enlaces
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ enlaces: enlaces || [] });
  } catch (error) {
    console.error('Error obteniendo enlaces:', error);
    res.status(500).json({ error: error.message || 'Error al obtener enlaces' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/aula-virtual/:asignaturaId
 * Obtener datos del aula virtual de una asignatura (en nombre del hijo)
 * IMPORTANTE: Esta ruta debe estar DESPUÉS de todas las rutas específicas (tareas, examenes, etc.)
 * para que Express capture primero las rutas específicas.
 */
router.get('/hijos/:hijoId/aula-virtual/:asignaturaId', async (req, res) => {
  try {
    const { hijoId, asignaturaId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    const { alumnoId } = await verificarHijoYUsuario(req, hijoId);

    // Verificar que el hijo tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, c.nombre as curso_nombre,
              g.grado, g.seccion, n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignaturaId, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    const asignaturaData = asignatura[0];

    res.json({
      asignatura: {
        id: asignaturaData.id,
        curso_nombre: asignaturaData.curso_nombre,
        grado: asignaturaData.grado,
        seccion: asignaturaData.seccion,
        nivel_nombre: asignaturaData.nivel_nombre,
        docente_nombre: asignaturaData.docente_nombre || 'Docente',
        aula_virtual: asignaturaData.aula_virtual || '',
        habilitar_aula: asignaturaData.habilitar_aula || 'NO'
      },
      alumno_id: alumnoId
    });
  } catch (error) {
    console.error('Error obteniendo aula virtual:', error);
    res.status(500).json({ error: error.message || 'Error al obtener aula virtual' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/cursos
 * Obtener cursos asignados del hijo
 */
router.get('/hijos/:hijoId/cursos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-CURSOS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-CURSOS] hijoId recibido: ${hijoId}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!personal_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró personal_id.' });
    }

    // Obtener nro_documento del personal
    let nroDocumento = null;
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
      nroDocumento = personalData[0].nro_documento;
    } else {
      const usuarioData = await query(
        `SELECT usuario FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id = ? LIMIT 1`,
        [usuario_id, colegio_id, personal_id]
      );
      if (usuarioData && usuarioData.length > 0 && usuarioData[0].usuario) {
        nroDocumento = usuarioData[0].usuario;
      }
    }

    if (!nroDocumento) {
      return res.status(403).json({ error: 'No se encontró tu número de documento. Contacta al administrador.' });
    }

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos cursos. El alumno no está registrado como tu hijo.' });
    }

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.*, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    const matriculaData = matricula.length > 0 ? matricula[0] : null;
    const grupoId = matriculaData ? matriculaData.grupo_id : null;

    if (!grupoId) {
      return res.json({ cursos: [] });
    }

    // Obtener asignaturas (cursos) del alumno
    const cursos = await query(
      `SELECT DISTINCT
              a.id as asignatura_id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              c.imagen as curso_imagen,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              p.id as docente_id,
              p.foto as docente_foto,
              (SELECT u.id FROM usuarios u 
               WHERE u.personal_id = p.id AND u.estado = 'ACTIVO' 
               LIMIT 1) as docente_usuario_id,
              a.aula_virtual as link_aula_virtual
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Construir URLs de imágenes
    const cursosConImagenes = cursos.map(curso => {
      let cursoImagenUrl = null;
      if (curso.curso_imagen && curso.curso_imagen !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          cursoImagenUrl = `${phpSystemUrl}/Static/Image/Cursos/${curso.curso_imagen}`;
        } else {
          cursoImagenUrl = `http://localhost:5000/Static/Image/Cursos/${curso.curso_imagen}`;
        }
      }
      
      // Construir URL de foto del docente
      let docenteFotoUrl = null;
      if (curso.docente_foto && curso.docente_foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          docenteFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${curso.docente_foto}`;
        } else {
          docenteFotoUrl = `http://localhost:5000/Static/Image/Fotos/${curso.docente_foto}`;
        }
      }
      
      return {
        ...curso,
        curso_imagen_url: cursoImagenUrl,
        docente_foto_url: docenteFotoUrl,
        docente_usuario_id: curso.docente_usuario_id
      };
    });

    console.log(`✅ [HIJOS-CURSOS] Cursos obtenidos: ${cursosConImagenes.length}`);
    console.log(`🔵 ========== [HIJOS-CURSOS] FIN DE PETICIÓN ==========\n`);

    res.json({ cursos: cursosConImagenes });
  } catch (error) {
    console.error('❌ [HIJOS-CURSOS] Error obteniendo cursos:', error);
    res.status(500).json({ error: 'Error al obtener cursos', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/notas-detalladas
 * Obtener todas las notas detalladas del hijo agrupadas por curso
 */
router.get('/hijos/:hijoId/notas-detalladas', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;

    console.log(`\n🔵 ========== [HIJOS-NOTAS-DETALLADAS] NUEVA PETICIÓN ==========`);
    console.log(`📋 [HIJOS-NOTAS-DETALLADAS] hijoId recibido: ${hijoId}`);

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ asignaturas: [] });
    }

    const matriculaId = matricula[0].matricula_id;
    const grupoId = matricula[0].grupo_id;

    // Obtener todas las asignaturas del grupo
    const asignaturas = await query(
      `SELECT DISTINCT
              a.id as asignatura_id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              g.nivel_id,
              n.tipo_calificacion,
              n.tipo_calificacion_final,
              n.nota_aprobatoria,
              n.nota_maxima,
              n.nota_minima,
              c.peso_examen_mensual,
              c.examen_mensual
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Para cada asignatura, obtener las notas detalladas
    const asignaturasConNotas = await Promise.all(
      asignaturas.map(async (asignatura) => {
        // Obtener criterios de la asignatura
        const criterios = await query(
          `SELECT * FROM asignaturas_criterios
           WHERE asignatura_id = ? AND colegio_id = ?
           ORDER BY orden ASC`,
          [asignatura.asignatura_id, colegio_id]
        );

        // Obtener todos los indicadores
        const criterioIds = criterios.map(c => c.id);
        let todosIndicadores = [];
        if (criterioIds.length > 0) {
          todosIndicadores = await query(
            `SELECT * FROM asignaturas_indicadores
             WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
             ORDER BY criterio_id ASC, id ASC`,
            criterioIds
          );
        }

        // Agrupar indicadores por criterio
        const indicadoresPorCriterio = {};
        todosIndicadores.forEach(indicador => {
          if (!indicadoresPorCriterio[indicador.criterio_id]) {
            indicadoresPorCriterio[indicador.criterio_id] = [];
          }
          indicadoresPorCriterio[indicador.criterio_id].push(indicador);
        });

        // Agregar indicadores a cada criterio
        const criteriosConIndicadores = criterios.map(criterio => ({
          ...criterio,
          indicadores: indicadoresPorCriterio[criterio.id] || []
        }));

        // Obtener todas las notas detalladas
        const todasNotasDetalles = await query(
          `SELECT ciclo, data FROM notas_detalles
           WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Obtener todas las notas de criterios
        const todasNotasCriterios = await query(
          `SELECT criterio_id, nota, ciclo
           FROM notas n
           WHERE n.matricula_id = ? AND n.asignatura_id = ? AND n.ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Obtener todos los exámenes mensuales
        let todasExamenesMensuales = [];
        if (asignatura.examen_mensual === 'SI') {
          todasExamenesMensuales = await query(
            `SELECT nro, nota, ciclo FROM notas_examen_mensual
             WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
             ORDER BY ciclo ASC, nro ASC`,
            [matriculaId, asignatura.asignatura_id]
          );
        }

        // Obtener todos los promedios finales
        const todosPromedios = await query(
          `SELECT promedio, ciclo FROM promedios
           WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Organizar datos por ciclo
        const notasDetalladas = {};
        for (let ciclo = 1; ciclo <= 4; ciclo++) {
          // Obtener notas detalladas del ciclo
          const notaDetalle = todasNotasDetalles.find(nd => nd.ciclo === ciclo);
          if (notaDetalle && notaDetalle.data) {
            notasDetalladas[ciclo] = deserializarNotasDetalles(notaDetalle.data);
          } else {
            notasDetalladas[ciclo] = {};
          }

          // Crear mapa de notas por criterio para este ciclo
          const notasMap = {};
          todasNotasCriterios
            .filter(n => n.ciclo === ciclo)
            .forEach(nota => {
              notasMap[nota.criterio_id] = nota.nota;
            });

          // Agregar notas de criterios a cada criterio
          criteriosConIndicadores.forEach(criterio => {
            if (!criterio.notas) criterio.notas = {};
            criterio.notas[ciclo] = notasMap[criterio.id] || null;
          });

          // Agregar exámenes mensuales del ciclo
          if (asignatura.examen_mensual === 'SI') {
            const examenesCiclo = todasExamenesMensuales.filter(e => e.ciclo === ciclo);
            if (examenesCiclo.length > 0) {
              if (!notasDetalladas[ciclo].examen_mensual) {
                notasDetalladas[ciclo].examen_mensual = {};
              }
              examenesCiclo.forEach(examen => {
                notasDetalladas[ciclo].examen_mensual[examen.nro] = examen.nota;
              });
            }
          }

          // Agregar promedio final del ciclo
          const promedioCiclo = todosPromedios.find(p => p.ciclo === ciclo);
          notasDetalladas[ciclo].promedio_final = promedioCiclo ? promedioCiclo.promedio : null;
        }

        return {
          asignatura_id: asignatura.asignatura_id,
          curso_id: asignatura.curso_id,
          curso_nombre: asignatura.curso_nombre,
          nivel: {
            tipo_calificacion: asignatura.tipo_calificacion,
            tipo_calificacion_final: asignatura.tipo_calificacion_final,
            nota_aprobatoria: asignatura.nota_aprobatoria,
            nota_maxima: asignatura.nota_maxima,
            nota_minima: asignatura.nota_minima
          },
          examen_mensual: asignatura.examen_mensual === 'SI',
          peso_examen_mensual: asignatura.peso_examen_mensual || 0,
          criterios: criteriosConIndicadores,
          notas: notasDetalladas
        };
      })
    );

    // Obtener información del alumno
    const alumno = await query(
      `SELECT id, nombres, apellido_paterno, apellido_materno,
              CONCAT(apellido_paterno, ' ', apellido_materno, ', ', nombres) as nombre_completo
       FROM alumnos
       WHERE id = ?`,
      [hijoIdNum]
    );

    console.log(`✅ [HIJOS-NOTAS-DETALLADAS] Notas obtenidas para ${asignaturasConNotas.length} asignaturas`);
    console.log(`🔵 ========== [HIJOS-NOTAS-DETALLADAS] FIN DE PETICIÓN ==========\n`);

    res.json({
      alumno: alumno[0] || null,
      asignaturas: asignaturasConNotas
    });
  } catch (error) {
    console.error('❌ [HIJOS-NOTAS-DETALLADAS] Error obteniendo notas detalladas:', error);
    console.error('❌ [HIJOS-NOTAS-DETALLADAS] Stack trace:', error.stack);
    res.status(500).json({ error: 'Error al obtener notas detalladas', details: error.message });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/libreta-anios
 * Lista de años en que el hijo tiene matrícula (para selector de libreta por año)
 */
router.get('/hijos/:hijoId/libreta-anios', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id } = req.user;

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    const rows = await query(
      `SELECT g.anio FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY g.anio DESC`,
      [hijoIdNum, colegio_id]
    );
    const anios = (rows || []).map(r => r.anio).filter(Boolean);
    return res.json({ anios });
  } catch (error) {
    console.error('Error listando años libreta:', error);
    return res.status(500).json({ error: 'Error al obtener años' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/libreta
 * Obtener datos de la libreta del hijo (ciclo=bimestre, anio=opcional; si no se envía anio usa año activo)
 */
router.get('/hijos/:hijoId/libreta', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const ciclo = Math.max(1, Math.min(4, parseInt(req.query.ciclo) || 1));
    const anioParam = req.query.anio ? parseInt(req.query.anio, 10) : null;
    const { colegio_id, usuario_id, personal_id, anio_activo } = req.user;
    const anio = (anioParam && anioParam > 0) ? anioParam : anio_activo;

    console.log(`\n🔵 ========== [HIJOS-LIBRETA] NUEVA PETICIÓN ========== (ciclo=${ciclo})`);
    console.log(`📋 [HIJOS-LIBRETA] hijoId recibido: ${hijoId}`);

    const gate = await gateAlumnoHijoDocente(req, res, hijoId);
    if (!gate) return;
    const { hijoIdNum } = gate;

    // Obtener matrícula del alumno para el año indicado (anio activo o año seleccionado)
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id, m.alumno_id, g.nivel_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ 
        alumno: null,
        asignaturas: [],
        resumen: null
      });
    }

    const matriculaId = matricula[0].matricula_id;
    const grupoId = matricula[0].grupo_id;
    const nivelId = matricula[0].nivel_id;
    const rangosLibretaAsis = await fetchRangosCiclosParsed(query, colegio_id);

    // Obtener información del alumno y grupo (incluye tipo_calificacion para INICIAL cualitativa)
    const alumnoInfo = await query(
      `SELECT 
              a.id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              a.foto,
              a.fecha_nacimiento,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              u.usuario as codigo,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              n.tipo_calificacion,
              t.nombre as turno_nombre,
              g.anio,
              TRIM(CONCAT(COALESCE(p_mt.nombres,''), ' ', COALESCE(p_mt.apellidos,''))) AS maestro_tutor_nombre,
              TRIM(CONCAT(COALESCE(p_t2.nombres,''), ' ', COALESCE(p_t2.apellidos,''))) AS tutor2_nombre,
              TRIM(CONCAT(COALESCE(p_mt.nombres,''), ' ', COALESCE(p_mt.apellidos,''))) AS tutor_nombre
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LEFT JOIN personal p_mt ON p_mt.id = g.tutor_id AND g.tutor_id > 0 AND p_mt.colegio_id = ?
       LEFT JOIN personal p_t2 ON p_t2.id = g.tutor_id_2 AND COALESCE(g.tutor_id_2, 0) > 0 AND p_t2.colegio_id = ?
       WHERE m.id = ? AND m.colegio_id = ?`,
      [colegio_id, colegio_id, colegio_id, matriculaId, colegio_id]
    );

    if (!alumnoInfo || alumnoInfo.length === 0) {
      return res.status(404).json({ error: 'No se encontró información del alumno' });
    }

    const alumno = alumnoInfo[0];
    const fotoLibretaUrl = (() => {
      const f = alumno.foto;
      if (!f || String(f).trim() === '') return null;
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      return process.env.NODE_ENV === 'production'
        ? `${phpSystemUrl}/Static/Image/Fotos/${f}`
        : `http://localhost:5000/Static/Image/Fotos/${f}`;
    })();
    alumno.foto_url = fotoLibretaUrl;
    const esCualitativa = alumno.tipo_calificacion === 0 || (alumno.nivel_nombre || '').toUpperCase().includes('INICIAL');

    // Obtener título de la intranet desde la tabla colegios
    const colegioInfo = await query(
      `SELECT titulo_intranet FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const tituloIntranet = (colegioInfo && colegioInfo.length > 0 && colegioInfo[0].titulo_intranet) 
      ? colegioInfo[0].titulo_intranet 
      : 'INTRANET VANGUARD SCHOOLS';

    // === LIBRETA CUALITATIVA (INICIAL) ===
    if (esCualitativa) {
      const phpSerialize = require('php-serialize');
      const asignaturasCual = await query(
        `SELECT a.id as asignatura_id, c.id as curso_id, c.nombre as curso_nombre
         FROM asignaturas a
         INNER JOIN cursos c ON c.id = a.curso_id
         WHERE a.grupo_id = ? AND a.colegio_id = ?
         ORDER BY c.nombre ASC`,
        [grupoId, colegio_id]
      );

      const deserializarNotasDetallesLibreta = (dataString) => {
        if (!dataString || dataString === '') return {};
        try {
          try { return phpSerialize.unserialize(dataString) || {}; } catch (e) {
            const decoded = Buffer.from(dataString, 'base64').toString('binary');
            return phpSerialize.unserialize(decoded) || {};
          }
        } catch (err) { return {}; }
      };

      let usaLibretaInicialCustom = false;
      let cursosCualitativos = await Promise.all(asignaturasCual.map(async (asig) => {
        const criterios = await query(
          `SELECT * FROM asignaturas_criterios WHERE asignatura_id = ? AND colegio_id = ? ORDER BY orden ASC`,
          [asig.asignatura_id, colegio_id]
        );
        const criterioIds = criterios.map(c => c.id);
        let indicadores = [];
        if (criterioIds.length > 0) {
          indicadores = await query(
            `SELECT * FROM asignaturas_indicadores WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')}) ORDER BY criterio_id, id`,
            criterioIds
          );
        }
        const indicadoresPorCriterio = {};
        indicadores.forEach(ind => {
          if (!indicadoresPorCriterio[ind.criterio_id]) indicadoresPorCriterio[ind.criterio_id] = [];
          indicadoresPorCriterio[ind.criterio_id].push(ind);
        });

        const todasNotasCriterios = await query(
          `SELECT criterio_id, nota, ciclo FROM notas WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const notasCriterioMap = {};
        todasNotasCriterios.forEach(n => {
          if (!notasCriterioMap[n.criterio_id]) notasCriterioMap[n.criterio_id] = {};
          notasCriterioMap[n.criterio_id][n.ciclo] = n.nota;
        });

        const todasNotasDet = await query(
          `SELECT ciclo, data FROM notas_detalles WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const notasDetMap = {};
        todasNotasDet.forEach(nd => {
          notasDetMap[nd.ciclo] = deserializarNotasDetallesLibreta(nd.data);
        });

        let explicacionesIndicadores = [];
        try {
          explicacionesIndicadores = await query(
            `SELECT indicador_id, explicacion FROM notas_detalle_explicaciones_indicadores
             WHERE asignatura_id = ? AND matricula_id = ? AND ciclo = ? AND colegio_id = ?`,
            [asig.asignatura_id, matriculaId, ciclo, colegio_id]
          ) || [];
        } catch (e) { /* ignore */ }
        const explIndMap = {};
        explicacionesIndicadores.forEach(e => { explIndMap[e.indicador_id] = (e.explicacion || '').trim(); });

        const promediosAsig = await query(
          `SELECT ciclo, promedio FROM promedios WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const promediosMap = {};
        promediosAsig.forEach(p => { promediosMap[p.ciclo] = p.promedio; });

        const criteriosConNotas = criterios.map(cr => {
          const indicadoresCr = indicadoresPorCriterio[cr.id] || [];
          const indicadoresConNotas = indicadoresCr.map(ind => {
            const notasB = {};
            for (let cic = 1; cic <= 4; cic++) {
              const data = notasDetMap[cic] || {};
              const porCriterio = (data[cr.id] || data[String(cr.id)]) || {};
              const arr = porCriterio[ind.id] || porCriterio[String(ind.id)] || [];
              notasB[`nota_b${cic}`] = Array.isArray(arr) && arr.length > 0 ? (arr[0] != null ? String(arr[0]) : null) : null;
            }
            const explicacionCiclo = explIndMap[ind.id] || '';
            return { id: ind.id, descripcion: ind.descripcion, explicacion: explicacionCiclo, ...notasB };
          });
          const notasCriterio = notasCriterioMap[cr.id] || {};
          const nota_b1 = notasCriterio[1] != null ? String(notasCriterio[1]) : null;
          const nota_b2 = notasCriterio[2] != null ? String(notasCriterio[2]) : null;
          const nota_b3 = notasCriterio[3] != null ? String(notasCriterio[3]) : null;
          const nota_b4 = notasCriterio[4] != null ? String(notasCriterio[4]) : null;
          return {
            id: cr.id,
            descripcion: cr.descripcion,
            abreviatura: cr.abreviatura,
            indicadores: indicadoresConNotas,
            nota_b1, nota_b2, nota_b3, nota_b4
          };
        });

        return {
          asignatura_id: asig.asignatura_id,
          curso_id: asig.curso_id,
          curso_nombre: asig.curso_nombre,
          criterios: criteriosConNotas,
          promedio_b1: promediosMap[1] != null ? String(promediosMap[1]) : null,
          promedio_b2: promediosMap[2] != null ? String(promediosMap[2]) : null,
          promedio_b3: promediosMap[3] != null ? String(promediosMap[3]) : null,
          promedio_b4: promediosMap[4] != null ? String(promediosMap[4]) : null,
          promedio_final: null
        };
      }));

      try {
        const { tryBuildLibretaInicialCustomCursos } = require('../utils/libretaInicialCustomCursos');
        const customCourses = await tryBuildLibretaInicialCustomCursos(query, {
          grupoId,
          colegio_id,
          anioGrupo: alumno.anio,
          matriculaId,
          ciclo
        });
        if (customCourses && customCourses.length > 0) {
          cursosCualitativos = customCourses;
          usaLibretaInicialCustom = true;
        }
      } catch (e) {
        /* tablas libreta_inicial_* opcionales */
      }

      let recomendacionesTexto = '';
      const matriculaRow = await query(`SELECT recomendaciones FROM matriculas WHERE id = ?`, [matriculaId]);
      if (matriculaRow && matriculaRow[0] && matriculaRow[0].recomendaciones) {
        try {
          const decoded = Buffer.from(matriculaRow[0].recomendaciones, 'base64').toString('binary');
          const deserialized = phpSerialize.unserialize(decoded);
          if (deserialized && typeof deserialized === 'object' && deserialized[ciclo] && deserialized[ciclo].descripcion) {
            recomendacionesTexto = String(deserialized[ciclo].descripcion).trim();
          }
        } catch (e) { /* ignore */ }
      }

      const conductaProm = await query(
        `SELECT ciclo, promedio FROM promedios WHERE matricula_id = ? AND asignatura_id = -101 AND ciclo IN (1,2,3,4)`,
        [matriculaId]
      );
      const conductaMap = {};
      conductaProm.forEach(p => { conductaMap[p.ciclo] = p.promedio; });

      const inasistenciasB1 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 1);
      const inasistenciasB2 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 2);
      const inasistenciasB3 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 3);
      const inasistenciasB4 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 4);
      const tardanzasB1 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 1);
      const tardanzasB2 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 2);
      const tardanzasB3 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 3);
      const tardanzasB4 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 4);

      // Detalle de notas: explicaciones del docente por curso (bimestre seleccionado)
      let detalle_notas_cual = [];
      try {
        const detalleNotasRows = await query(
          `SELECT a.id as asignatura_id, c.nombre as curso_nombre,
                  CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre,
                  pr.promedio,
                  nde.explicacion
           FROM asignaturas a
           INNER JOIN cursos c ON c.id = a.curso_id
           LEFT JOIN personal p ON p.id = a.personal_id
           LEFT JOIN promedios pr ON pr.asignatura_id = a.id AND pr.matricula_id = ? AND pr.ciclo = ?
           LEFT JOIN notas_detalle_explicaciones nde ON nde.asignatura_id = a.id AND nde.matricula_id = ? AND nde.ciclo = ? AND nde.colegio_id = ?
           WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.id > 0
           ORDER BY c.nombre ASC`,
          [matriculaId, ciclo, matriculaId, ciclo, colegio_id, grupoId, colegio_id]
        );
        detalle_notas_cual = (detalleNotasRows || []).map(r => ({
          curso_nombre: r.curso_nombre || '-',
          docente_nombre: (r.docente_nombre || '').trim() || '-',
          promedio: r.promedio != null && r.promedio !== '' ? r.promedio : '-',
          explicacion: (r.explicacion || '').trim() || ''
        }));
      } catch (e) { console.error('[HIJOS-LIBRETA] Error detalle_notas cualitativa:', e); }
      if (usaLibretaInicialCustom) {
        detalle_notas_cual = [];
      }

      const resumenCual = {
        cantidad_cursos: { b1: cursosCualitativos.length, b2: cursosCualitativos.length, b3: cursosCualitativos.length, b4: cursosCualitativos.length },
        suma_notas: { b1: null, b2: null, b3: null, b4: null },
        promedio: { b1: null, b2: null, b3: null, b4: null, final: null },
        promedio_conducta: {
          b1: conductaMap[1] != null && conductaMap[1] !== '' ? conductaMap[1] : null,
          b2: conductaMap[2] != null && conductaMap[2] !== '' ? conductaMap[2] : null,
          b3: conductaMap[3] != null && conductaMap[3] !== '' ? conductaMap[3] : null,
          b4: conductaMap[4] != null && conductaMap[4] !== '' ? conductaMap[4] : null
        },
        orden_merito: { b1: null, b2: null, b3: null, b4: null },
        inasistencias: { b1: inasistenciasB1, b2: inasistenciasB2, b3: inasistenciasB3, b4: inasistenciasB4 },
        tardanzas: { b1: tardanzasB1, b2: tardanzasB2, b3: tardanzasB3, b4: tardanzasB4 }
      };

      console.log(`✅ [HIJOS-LIBRETA] Libreta cualitativa INICIAL obtenida exitosamente`);
      console.log(`🔵 ========== [HIJOS-LIBRETA] FIN DE PETICIÓN ==========\n`);

      return res.json({
        alumno,
        titulo_intranet: tituloIntranet,
        es_cualitativa: true,
        cursos_cualitativos: cursosCualitativos,
        areas: [],
        asignaturas_sin_area: [],
        resumen: resumenCual,
        recomendaciones: recomendacionesTexto,
        ciclo,
        detalle_notas: detalle_notas_cual
      });
    }

    // === LIBRETA CUANTITATIVA (PRIMARIA / SECUNDARIA) ===
    const libretaAreaOpts = { colegio_id, grupoId, nivelId };
    const areas = await fetchAreasLibretaConAsignaturas(query, libretaAreaOpts);
    const asignaturas = dedupeAsignaturasPorId(
      await fetchAsignaturasLibretaConArea(query, libretaAreaOpts)
    );

    // Obtener todos los promedios por bimestre de todas las asignaturas
    const todosPromedios = await query(
      `SELECT asignatura_id, ciclo, promedio
       FROM promedios
       WHERE matricula_id = ? AND ciclo IN (1, 2, 3, 4)
       ORDER BY asignatura_id ASC, ciclo ASC`,
      [matriculaId]
    );

    // Organizar promedios por asignatura
    const promediosPorAsignatura = {};
    todosPromedios.forEach(p => {
      if (!promediosPorAsignatura[p.asignatura_id]) {
        promediosPorAsignatura[p.asignatura_id] = {};
      }
      promediosPorAsignatura[p.asignatura_id][p.ciclo] = p.promedio;
    });

    // Agrupar asignaturas por área y calcular promedios
    const areasConAsignaturas = [];
    const asignaturasSinArea = [];
    const asignaturasYaUsadas = new Set();

    areas.forEach(area => {
      const asignaturasArea = filtrarAsignaturasDeArea(asignaturas, area.area_id, asignaturasYaUsadas);
      asignaturasArea.forEach((a) => asignaturasYaUsadas.add(a.asignatura_id));
      if (asignaturasArea.length > 0) {
        const asignaturasConPromedios = asignaturasArea.map(asignatura => {
          const promedios = promediosPorAsignatura[asignatura.asignatura_id] || {};
          const promedioB1 = promedios[1] || null;
          const promedioB2 = promedios[2] || null;
          const promedioB3 = promedios[3] || null;
          const promedioB4 = promedios[4] || null;
          
          // Calcular promedio final (promedio de los 4 bimestres)
          let promedioFinal = null;
          const promediosValidos = [promedioB1, promedioB2, promedioB3, promedioB4].filter(p => p !== null && p !== '' && p !== '-');
          if (promediosValidos.length > 0) {
            const suma = promediosValidos.reduce((sum, p) => {
              const num = parseFloat(p);
              return sum + (isNaN(num) ? 0 : num);
            }, 0);
            promedioFinal = Math.round(suma / promediosValidos.length);
          }

          return {
            asignatura_id: asignatura.asignatura_id,
            curso_id: asignatura.curso_id,
            curso_nombre: asignatura.curso_nombre,
            promedio_b1: promedioB1,
            promedio_b2: promedioB2,
            promedio_b3: promedioB3,
            promedio_b4: promedioB4,
            promedio_final: promedioFinal
          };
        });

        // Calcular promedio del área por bimestre
        const promedioAreaB1 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b1');
        const promedioAreaB2 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b2');
        const promedioAreaB3 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b3');
        const promedioAreaB4 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b4');
        const promedioAreaFinal = calcularPromedioArea(asignaturasConPromedios, 'promedio_final');

        areasConAsignaturas.push({
          area_id: area.area_id,
          area_nombre: area.area_nombre,
          promedio_b1: promedioAreaB1,
          promedio_b2: promedioAreaB2,
          promedio_b3: promedioAreaB3,
          promedio_b4: promedioAreaB4,
          promedio_final: promedioAreaFinal,
          asignaturas: asignaturasConPromedios
        });
      }
    });

    // Asignaturas sin área
    asignaturas.filter(a => !a.area_id && !asignaturasYaUsadas.has(a.asignatura_id)).forEach(asignatura => {
      const promedios = promediosPorAsignatura[asignatura.asignatura_id] || {};
      const promedioB1 = promedios[1] || null;
      const promedioB2 = promedios[2] || null;
      const promedioB3 = promedios[3] || null;
      const promedioB4 = promedios[4] || null;
      
      let promedioFinal = null;
      const promediosValidos = [promedioB1, promedioB2, promedioB3, promedioB4].filter(p => p !== null && p !== '' && p !== '-');
      if (promediosValidos.length > 0) {
        const suma = promediosValidos.reduce((sum, p) => {
          const num = parseFloat(p);
          return sum + (isNaN(num) ? 0 : num);
        }, 0);
        promedioFinal = Math.round(suma / promediosValidos.length);
      }

      asignaturasSinArea.push({
        asignatura_id: asignatura.asignatura_id,
        curso_id: asignatura.curso_id,
        curso_nombre: asignatura.curso_nombre,
        promedio_b1: promedioB1,
        promedio_b2: promedioB2,
        promedio_b3: promedioB3,
        promedio_b4: promedioB4,
        promedio_final: promedioFinal
      });
    });

    // Calcular cuadro resumen
    const totalCursos = asignaturas.length;
    const cantidadCursosB1 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[1] !== null && promedios[1] !== '' && promedios[1] !== '-';
    }).length;
    const cantidadCursosB2 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[2] !== null && promedios[2] !== '' && promedios[2] !== '-';
    }).length;
    const cantidadCursosB3 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[3] !== null && promedios[3] !== '' && promedios[3] !== '-';
    }).length;
    const cantidadCursosB4 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[4] !== null && promedios[4] !== '' && promedios[4] !== '-';
    }).length;

    // Suma de notas por bimestre
    const sumaNotasB1 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[1];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB2 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[2];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB3 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[3];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB4 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[4];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);

    // Promedio general por bimestre
    const promedioGeneralB1 = cantidadCursosB1 > 0 ? Math.round(sumaNotasB1 / cantidadCursosB1) : null;
    const promedioGeneralB2 = cantidadCursosB2 > 0 ? Math.round(sumaNotasB2 / cantidadCursosB2) : null;
    const promedioGeneralB3 = cantidadCursosB3 > 0 ? Math.round(sumaNotasB3 / cantidadCursosB3) : null;
    const promedioGeneralB4 = cantidadCursosB4 > 0 ? Math.round(sumaNotasB4 / cantidadCursosB4) : null;
    const promedioGeneralFinal = [promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
      .filter(p => p !== null).length > 0
      ? Math.round(([promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
          .filter(p => p !== null)
          .reduce((sum, p) => sum + p, 0)) / [promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
          .filter(p => p !== null).length)
      : null;

    // Promedio conducta (buscar en notas con asignatura_id = -101 o similar)
    const promedioConductaB1 = await obtenerPromedioConducta(matriculaId, 1);
    const promedioConductaB2 = await obtenerPromedioConducta(matriculaId, 2);
    const promedioConductaB3 = await obtenerPromedioConducta(matriculaId, 3);
    const promedioConductaB4 = await obtenerPromedioConducta(matriculaId, 4);
    const conductaVals = [promedioConductaB1, promedioConductaB2, promedioConductaB3, promedioConductaB4]
      .filter(v => v != null && v !== '' && v !== '-').map(v => parseFloat(v));
    const promedioConductaFinal = conductaVals.length > 0 ? Math.round(conductaVals.reduce((a, b) => a + b, 0) / conductaVals.length) : null;

    // Orden de mérito: ranking por promedio general por bimestre (todos los alumnos del grupo)
    const asignaturasIds = asignaturas.map(a => a.asignatura_id).filter(id => id !== -101);
    const ordenMeritoResult = await obtenerOrdenMerito(grupoId, matriculaId, asignaturasIds);
    const ordenMerito = ordenMeritoResult.puestos;
    const ordenMeritoDetalle = ordenMeritoResult.detalle || { b1: [], b2: [], b3: [], b4: [] };

    // Inasistencias y tardanzas por rango de fechas del bimestre (rangos del colegio o reparto por meses)
    const inasistenciasB1 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 1);
    const inasistenciasB2 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 2);
    const inasistenciasB3 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 3);
    const inasistenciasB4 = await contarInasistenciasBimestre(query, matriculaId, anio, rangosLibretaAsis, 4);

    const tardanzasB1 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 1);
    const tardanzasB2 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 2);
    const tardanzasB3 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 3);
    const tardanzasB4 = await contarTardanzasBimestre(query, matriculaId, anio, rangosLibretaAsis, 4);

    const resumen = {
      cantidad_cursos: {
        b1: cantidadCursosB1,
        b2: cantidadCursosB2,
        b3: cantidadCursosB3,
        b4: cantidadCursosB4
      },
      suma_notas: {
        b1: sumaNotasB1 > 0 ? sumaNotasB1 : null,
        b2: sumaNotasB2 > 0 ? sumaNotasB2 : null,
        b3: sumaNotasB3 > 0 ? sumaNotasB3 : null,
        b4: sumaNotasB4 > 0 ? sumaNotasB4 : null
      },
      promedio: {
        b1: promedioGeneralB1,
        b2: promedioGeneralB2,
        b3: promedioGeneralB3,
        b4: promedioGeneralB4,
        final: promedioGeneralFinal
      },
      promedio_conducta: {
        b1: promedioConductaB1,
        b2: promedioConductaB2,
        b3: promedioConductaB3,
        b4: promedioConductaB4,
        final: promedioConductaFinal
      },
      orden_merito: {
        b1: ordenMerito.b1,
        b2: ordenMerito.b2,
        b3: ordenMerito.b3,
        b4: ordenMerito.b4
      },
      orden_merito_detalle: ordenMeritoDetalle,
      inasistencias: {
        b1: inasistenciasB1,
        b2: inasistenciasB2,
        b3: inasistenciasB3,
        b4: inasistenciasB4
      },
      tardanzas: {
        b1: tardanzasB1,
        b2: tardanzasB2,
        b3: tardanzasB3,
        b4: tardanzasB4
      }
    };

    // Recomendaciones: solo la del bimestre seleccionado (sin prefijo "Bimestre X:")
    let recomendacionesTexto = '';
    const matriculaRow = await query(`SELECT recomendaciones FROM matriculas WHERE id = ?`, [matriculaId]);
    if (matriculaRow && matriculaRow[0] && matriculaRow[0].recomendaciones) {
      try {
        const phpSerialize = require('php-serialize');
        const decoded = Buffer.from(matriculaRow[0].recomendaciones, 'base64').toString('binary');
        const deserialized = phpSerialize.unserialize(decoded);
        if (deserialized && typeof deserialized === 'object' && deserialized[ciclo] && deserialized[ciclo].descripcion) {
          recomendacionesTexto = String(deserialized[ciclo].descripcion).trim();
        }
      } catch (e) { /* ignore */ }
    }

    // Detalle de notas: explicaciones del docente por curso (bimestre seleccionado)
    let detalle_notas = [];
    try {
      const detalleNotasRows = await query(
        `SELECT a.id as asignatura_id, c.nombre as curso_nombre,
                CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre,
                pr.promedio,
                nde.explicacion
         FROM asignaturas a
         INNER JOIN cursos c ON c.id = a.curso_id
         LEFT JOIN personal p ON p.id = a.personal_id
         LEFT JOIN promedios pr ON pr.asignatura_id = a.id AND pr.matricula_id = ? AND pr.ciclo = ?
         LEFT JOIN notas_detalle_explicaciones nde ON nde.asignatura_id = a.id AND nde.matricula_id = ? AND nde.ciclo = ? AND nde.colegio_id = ?
         WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.id > 0
         ORDER BY c.nombre ASC`,
        [matriculaId, ciclo, matriculaId, ciclo, colegio_id, grupoId, colegio_id]
      );
      detalle_notas = (detalleNotasRows || []).map(r => ({
        curso_nombre: r.curso_nombre || '-',
        docente_nombre: (r.docente_nombre || '').trim() || '-',
        promedio: r.promedio != null && r.promedio !== '' ? r.promedio : '-',
        explicacion: (r.explicacion || '').trim() || ''
      }));
    } catch (e) { console.error('[HIJOS-LIBRETA] Error detalle_notas:', e); }

    console.log(`✅ [HIJOS-LIBRETA] Libreta obtenida exitosamente`);
    console.log(`🔵 ========== [HIJOS-LIBRETA] FIN DE PETICIÓN ==========\n`);

    const rangos_letras = await obtenerRangosLetrasColegio(query, colegio_id);

    res.json({
      alumno,
      titulo_intranet: tituloIntranet,
      es_cualitativa: false,
      areas: areasConAsignaturas,
      asignaturas_sin_area: asignaturasSinArea,
      resumen,
      recomendaciones: recomendacionesTexto,
      ciclo,
      detalle_notas,
      rangos_letras,
    });
  } catch (error) {
    console.error('❌ [HIJOS-LIBRETA] Error obteniendo libreta:', error);
    console.error('❌ [HIJOS-LIBRETA] Stack trace:', error.stack);
    res.status(500).json({ error: 'Error al obtener libreta', details: error.message });
  }
});

// Función auxiliar para calcular promedio de área
function calcularPromedioArea(asignaturas, campo) {
  const promediosValidos = asignaturas
    .map(a => a[campo])
    .filter(p => p !== null && p !== '' && p !== '-');
  
  if (promediosValidos.length === 0) return null;
  
  const suma = promediosValidos.reduce((sum, p) => {
    const num = parseFloat(p);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  
  return Math.round(suma / promediosValidos.length);
}

// Función auxiliar para obtener promedio de conducta (asignatura_id = -101)
async function obtenerPromedioConducta(matriculaId, ciclo) {
  try {
    const rows = await query(
      `SELECT promedio FROM promedios WHERE matricula_id = ? AND asignatura_id = -101 AND ciclo = ?`,
      [matriculaId, ciclo]
    );
    if (rows && rows.length > 0 && rows[0].promedio !== null && rows[0].promedio !== '' && rows[0].promedio !== '-') {
      return rows[0].promedio;
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo promedio conducta:', error);
    return null;
  }
}

// Función auxiliar para calcular orden de mérito por bimestre (ranking por promedio general del grupo)
// Retorna { puestos: { b1, b2, b3, b4 }, detalle: { b1: [{ apellido_paterno, apellido_materno, nombres, promedio, puesto }], ... } }
async function obtenerOrdenMerito(grupoId, matriculaId, asignaturasIds) {
  try {
    if (!asignaturasIds || asignaturasIds.length === 0) {
      return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
    }
    const ids = asignaturasIds.filter(id => id !== -101 && id != null);
    if (ids.length === 0) {
      return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
    }

    const placeholders = ids.map(() => '?').join(',');
    const puestos = { b1: null, b2: null, b3: null, b4: null };
    const detalle = { b1: [], b2: [], b3: [], b4: [] };
    const matIdNum = parseInt(matriculaId, 10);

    // Matrículas del grupo con nombres de alumnos
    const matriculasGrupo = await query(
      `SELECT m.id as matricula_id, a.apellido_paterno, a.apellido_materno, a.nombres
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND (m.estado = 0)`,
      [grupoId]
    );
    const matriculaIds = (matriculasGrupo || []).map(m => m.matricula_id);
    if (matriculaIds.length === 0) return { puestos, detalle };

    const mapNombres = {};
    (matriculasGrupo || []).forEach(m => {
      mapNombres[m.matricula_id] = {
        apellido_paterno: m.apellido_paterno || '',
        apellido_materno: m.apellido_materno || '',
        nombres: m.nombres || ''
      };
    });

    const matPlaceholders = matriculaIds.map(() => '?').join(',');

    for (let ciclo = 1; ciclo <= 4; ciclo++) {
      const promedios = await query(
        `SELECT p.matricula_id, p.asignatura_id, p.promedio
         FROM promedios p
         WHERE p.matricula_id IN (${matPlaceholders})
           AND p.asignatura_id IN (${placeholders})
           AND p.ciclo = ?`,
        [...matriculaIds, ...ids, ciclo]
      );

      const sumaPorMatricula = {};
      const countPorMatricula = {};
      (promedios || []).forEach(row => {
        const mid = row.matricula_id;
        if (!sumaPorMatricula[mid]) { sumaPorMatricula[mid] = 0; countPorMatricula[mid] = 0; }
        const n = parseFloat(row.promedio);
        if (!isNaN(n)) { sumaPorMatricula[mid] += n; countPorMatricula[mid]++; }
      });

      const promedioGeneral = Object.keys(sumaPorMatricula).map(matId => ({
        matricula_id: parseInt(matId, 10),
        promedio: countPorMatricula[matId] > 0 ? sumaPorMatricula[matId] / countPorMatricula[matId] : 0
      }));
      promedioGeneral.sort((a, b) => b.promedio - a.promedio);

      const pos = promedioGeneral.findIndex(p => p.matricula_id === matIdNum);
      if (pos >= 0) puestos[`b${ciclo}`] = `Puesto ${String(pos + 1).padStart(2, '0')}`;

      // Lista para verificación: puesto asc, con nombres y promedio (con decimales)
      detalle[`b${ciclo}`] = promedioGeneral.map((p, idx) => {
        const nom = mapNombres[p.matricula_id] || {};
        return {
          apellido_paterno: nom.apellido_paterno,
          apellido_materno: nom.apellido_materno,
          nombres: nom.nombres,
          promedio: Math.round(p.promedio * 100) / 100,
          puesto: idx + 1
        };
      });
    }
    return { puestos, detalle };
  } catch (error) {
    console.error('Error obteniendo orden de mérito:', error);
    return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
  }
}

/**
 * POST /api/docente/comunicados
 * Crear nuevo comunicado (solo ADMINISTRADOR puede crear)
 */
const uploadComunicado = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Guardar en Static/Archivos/ del sistema PHP (compartido)
      const uploadPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `comunicado-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|jpg|jpeg|png|gif/i;
    if (allowedTypes.test(path.extname(file.originalname))) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

router.post('/comunicados', uploadComunicado.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    // Solo administradores o promotoría pueden crear comunicados
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden crear comunicados' });
    }

    const { descripcion, contenido, tipo, privacidad, show_in_home, estado } = req.body;

    if (!descripcion) {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    let archivoPath = '';
    if (req.file) {
      // Guardar ruta como /Static/Archivos/ (compartido con sistema PHP)
      archivoPath = `/Static/Archivos/${req.file.filename}`;
    }

    const tipoComunicado = tipo || (archivoPath ? 'ARCHIVO' : 'TEXTO');
    const fechaHora = fechaHoraMySQLLima();

    const estadoComunicado = (estado === 'INACTIVO') ? 'INACTIVO' : 'ACTIVO';

    const showInHomeFlag =
      show_in_home === true || show_in_home === 1 || show_in_home === '1' || show_in_home === 'true' ? 1 : 0;

    // Insertar comunicado
    const result = await execute(
      `INSERT INTO comunicados (colegio_id, descripcion, contenido, archivo, privacidad, fecha_hora, tipo, estado, show_in_home)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [colegio_id, descripcion, contenido || '', archivoPath, privacidad || '', fechaHora, tipoComunicado, estadoComunicado, showInHomeFlag]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'CREAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: result.insertId,
      descripcion: `Creó comunicado: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, contenido, tipo: tipoComunicado, archivo: archivoPath }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado creado correctamente',
      comunicado: {
        id: result.insertId,
        descripcion,
        contenido,
        archivo: archivoPath,
        tipo: tipoComunicado,
        fecha_hora: fechaHora
      }
    });

    // Campanita + push en segundo plano (alumnos, apoderados, docentes). Correo deshabilitado vía emailService.
    setImmediate(async () => {
      try {
        await notificarComunicadoNuevo({
          query,
          execute,
          colegio_id,
          usuario_emisor_id: usuario_id,
          comunicadoId: result.insertId,
          descripcion
        });
      } catch (err) {
        console.error('❌ [COMUNICADOS] Error notificaciones:', err);
      }
    });
  } catch (error) {
    console.error('Error creando comunicado:', error);
    res.status(500).json({ error: 'Error al crear comunicado' });
  }
});

/**
 * PUT /api/docente/comunicados/:id
 * Actualizar comunicado (solo ADMINISTRADOR)
 */
router.put('/comunicados/:id', uploadComunicado.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden editar comunicados' });
    }

    const { id } = req.params;
    const { descripcion, contenido, tipo, privacidad, show_in_home, estado } = req.body;

    // Verificar que el comunicado existe
    const comunicados = await query(
      `SELECT * FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (comunicados.length === 0) {
      return res.status(404).json({ error: 'Comunicado no encontrado' });
    }

    let archivoPath = comunicados[0].archivo || '';
    if (req.file) {
      archivoPath = `/Static/Archivos/${req.file.filename}`;
    }

    const tipoComunicado = tipo || (archivoPath ? 'ARCHIVO' : 'TEXTO');
    const estadoComunicado = (estado === 'INACTIVO') ? 'INACTIVO' : 'ACTIVO';

    const showInHomeFlag =
      show_in_home === true || show_in_home === 1 || show_in_home === '1' || show_in_home === 'true' ? 1 : 0;

    // Actualizar comunicado
    await execute(
      `UPDATE comunicados 
       SET descripcion = ?, contenido = ?, archivo = ?, privacidad = ?, tipo = ?, estado = ?, show_in_home = ?
       WHERE id = ? AND colegio_id = ?`,
      [descripcion, contenido || '', archivoPath, privacidad || '', tipoComunicado, estadoComunicado, showInHomeFlag, id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'ACTUALIZAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: parseInt(id),
      descripcion: `Actualizó comunicado: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(comunicados[0]),
      datos_nuevos: JSON.stringify({ descripcion, contenido, tipo: tipoComunicado, archivo: archivoPath }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado actualizado correctamente'
    });
  } catch (error) {
    console.error('Error actualizando comunicado:', error);
    res.status(500).json({ error: 'Error al actualizar comunicado' });
  }
});

/**
 * DELETE /api/docente/comunicados/:id
 * Eliminar comunicado (solo ADMINISTRADOR)
 */
router.delete('/comunicados/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar comunicados' });
    }

    const { id } = req.params;

    // Verificar que el comunicado existe
    const comunicados = await query(
      `SELECT * FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (comunicados.length === 0) {
      return res.status(404).json({ error: 'Comunicado no encontrado' });
    }

    // Eliminar comunicado
    await execute(
      `DELETE FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: parseInt(id),
      descripcion: `Eliminó comunicado: ${comunicados[0].descripcion}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(comunicados[0]),
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando comunicado:', error);
    res.status(500).json({ error: 'Error al eliminar comunicado' });
  }
});

/**
 * GET /api/docente/comunicados
 * Obtener comunicados (solo lectura, generados por admin)
 */
router.get('/comunicados', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo } = req.user;
    const { page = 1, limit = 12, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Construir query base
    // - Usuarios no-admin: solo ACTIVO del año activo
    // - Administrador/promotoría: todos los años y estados
    let querySql = `
      SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ?
    `;
    const params = [colegio_id];

    // Si NO es administrador ni promotoría, filtrar por año activo
    if (!esAdminOPromotoria(tipo)) {
      querySql += ` AND YEAR(c.fecha_hora) = ?`;
      params.push(anio_activo);
      querySql += ` AND c.estado = 'ACTIVO'`;
    }

    // Agregar búsqueda si existe
    if (search && search.trim() !== '') {
      querySql += ` AND (c.descripcion LIKE ? OR c.contenido LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    // Obtener total para paginación
    const countQuery = querySql.replace('SELECT c.*', 'SELECT COUNT(*) as total');
    const countResult = await query(countQuery, params);
    const total = countResult[0]?.total || 0;

    // Agregar ordenamiento y límites
    querySql += ` ORDER BY c.fecha_hora DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const comunicados = await query(querySql, params);

    // Construir URLs de archivos
    // IMPORTANTE: Los comunicados pueden venir de dos sistemas:
    // 1. Sistema PHP anterior: archivos en /Static/Archivos/
    // 2. Sistema nuevo (React/Node.js): archivos en /uploads/comunicados/
    // El backend detecta automáticamente el origen y construye la URL correcta
    const fs = require('fs');
    const path = require('path');
    const staticArchivosPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
    
    const comunicadosConUrls = (comunicados || []).map(com => {
      let archivoUrl = null;
      let archivoExiste = false;
      
      if (com.archivo && com.archivo.trim() !== '') {
        let nombreArchivo = com.archivo.trim();
        const isProduction = process.env.NODE_ENV === 'production';
        
        // DETECTAR ORIGEN DEL ARCHIVO:
        // Si empieza con /uploads/comunicados/ → Es del sistema nuevo (React/Node.js)
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        
        if (esSistemaNuevo) {
          // SISTEMA NUEVO: Archivo en /uploads/comunicados/
          // Construir URL desde el servidor Node.js
          if (nombreArchivo.startsWith('/uploads/')) {
            // Ya tiene la ruta completa relativa
            if (isProduction) {
              // En producción, usar el mismo dominio del backend
              archivoUrl = `https://sistema.vanguardschools.edu.pe${nombreArchivo}`;
            } else {
              // En desarrollo, usar localhost:5000
              archivoUrl = `http://localhost:5000${nombreArchivo}`;
            }
          } else {
            // Agregar la barra inicial si falta
            archivoUrl = isProduction
              ? `https://sistema.vanguardschools.edu.pe/${nombreArchivo}`
              : `http://localhost:5000/${nombreArchivo}`;
          }
          // Para sistema nuevo, verificar en backend/uploads/comunicados/
          const uploadsPath = path.join(__dirname, '../../uploads/comunicados', nombreArchivo.replace(/^\/?uploads\/comunicados\//, ''));
          archivoExiste = fs.existsSync(uploadsPath);
          console.log(`📄 Comunicado ID ${com.id} (SISTEMA NUEVO): ${com.archivo} -> ${archivoUrl} ${archivoExiste ? '✅' : '❌ NO EXISTE'}`);
        } else {
          // SISTEMA ANTERIOR (PHP): Archivo en /Static/Archivos/
          // Usar el subdominio correcto: nuevo.vanguardschools.edu.pe
          const dominioBase = 'https://sistema.vanguardschools.edu.pe';
          
          // Extraer solo el nombre del archivo para verificar existencia
          let nombreArchivoLimpio = nombreArchivo;
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
            // Extraer nombre del archivo de la URL
            nombreArchivoLimpio = nombreArchivo.split('/').pop();
          } else if (nombreArchivo.startsWith('/Static/Archivos/')) {
            nombreArchivoLimpio = nombreArchivo.replace('/Static/Archivos/', '');
          } else if (nombreArchivo.startsWith('Static/Archivos/')) {
            nombreArchivoLimpio = nombreArchivo.replace('Static/Archivos/', '');
          } else if (nombreArchivo.startsWith('/Static/')) {
            nombreArchivoLimpio = nombreArchivo.replace('/Static/', '');
          } else if (nombreArchivo.startsWith('Static/')) {
            nombreArchivoLimpio = nombreArchivo.replace('Static/', '');
          }
          nombreArchivoLimpio = nombreArchivoLimpio.replace(/^\/+/, '');
          
          // Si ya es una URL completa, validar y corregir si es necesario
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
            // Corregir errores comunes en URLs existentes
            archivoUrl = nombreArchivo
              .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, dominioBase)
              .replace(/vanguardschools\.comstatic/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/static/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/Static/gi, `${dominioBase}/Static`)
              .replace(/([^:]\/)\/+/g, '$1'); // Limpiar múltiples barras
          }
          // Si empieza con /Static/, construir URL completa
          else if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          }
          // Si empieza con Static/ (sin barra inicial), agregar la barra
          else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          }
          // Si es solo el nombre del archivo, construir ruta completa
          else {
            // Limpiar barras iniciales y construir URL correcta
            nombreArchivo = nombreArchivo.replace(/^\/+/, '');
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
          
          // Verificar si el archivo existe físicamente (solo para logging, no para bloquear)
          const archivoPath = path.join(staticArchivosPath, nombreArchivoLimpio);
          archivoExiste = fs.existsSync(archivoPath);
          
          // Siempre devolver la URL aunque el archivo no exista físicamente
          // (el archivo puede estar en otra ubicación o el sistema PHP puede manejarlo)
          console.log(`📄 Comunicado ID ${com.id} (SISTEMA ANTERIOR): ${com.archivo} -> ${archivoUrl} ${archivoExiste ? '✅' : '⚠️ NO VERIFICADO (archivo: ${nombreArchivoLimpio})'}`);
        }
      }

      return {
        ...com,
        archivo_url: archivoUrl, // Siempre devolver la URL (el sistema PHP puede manejarla aunque no exista físicamente)
        archivo_existe: archivoExiste // Información adicional para debugging
      };
    });

    res.json({
      comunicados: comunicadosConUrls,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo comunicados:', error);
    res.status(500).json({ error: 'Error al obtener comunicados' });
  }
});

/**
 * POST /api/docente/actividades
 * Crear nueva actividad (solo ADMINISTRADOR puede crear)
 */
router.post('/actividades', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    // Solo administradores o promotoría pueden crear actividades
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden crear actividades' });
    }

    const { descripcion, lugar, detalles, fecha_inicio, fecha_fin } = req.body;

    if (!descripcion || !fecha_inicio) {
      return res.status(400).json({ error: 'Descripción y fecha de inicio son requeridas' });
    }

    const fechaInicioStr = normalizarDatetimeMysqlEntrada(fecha_inicio);
    const fechaFinStr = normalizarDatetimeMysqlEntrada(fecha_fin || fecha_inicio);

    if (!fechaInicioStr) {
      return res.status(400).json({ error: 'Formato de fecha de inicio inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }
    if (!fechaFinStr) {
      return res.status(400).json({ error: 'Formato de fecha de fin inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }

    if (!esDatetimeMysqlValido(fechaInicioStr)) {
      return res.status(400).json({ error: 'Fecha de inicio inválida' });
    }

    if (compararDatetimeMysql(fechaFinStr, fechaInicioStr) < 0) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
    }

    // Insertar actividad
    const result = await execute(
      `INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [colegio_id, descripcion, lugar || '', detalles || '', fechaInicioStr, fechaFinStr, usuario_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'CREAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: result.insertId,
      descripcion: `Creó actividad: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, lugar, detalles, fecha_inicio, fecha_fin }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad creada correctamente',
      actividad: {
        id: result.insertId,
        descripcion,
        lugar,
        detalles,
        fecha_inicio: fechaInicioStr,
        fecha_fin: fechaFinStr
      }
    });
  } catch (error) {
    console.error('Error creando actividad:', error);
    res.status(500).json({ error: 'Error al crear actividad' });
  }
});

/**
 * PUT /api/docente/actividades/:id
 * Actualizar actividad (solo ADMINISTRADOR)
 */
router.put('/actividades/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden editar actividades' });
    }

    const { id } = req.params;
    const { descripcion, lugar, detalles, fecha_inicio, fecha_fin } = req.body;

    if (!descripcion || !fecha_inicio) {
      return res.status(400).json({ error: 'Descripción y fecha de inicio son requeridas' });
    }

    // Verificar que la actividad existe y pertenece al colegio
    const actividades = await query(
      `SELECT * FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (actividades.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    const fechaInicioStr = normalizarDatetimeMysqlEntrada(fecha_inicio);
    const fechaFinStr = normalizarDatetimeMysqlEntrada(fecha_fin || fecha_inicio);

    if (!fechaInicioStr) {
      return res.status(400).json({ error: 'Formato de fecha de inicio inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }
    if (!fechaFinStr) {
      return res.status(400).json({ error: 'Formato de fecha de fin inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }

    if (!esDatetimeMysqlValido(fechaInicioStr)) {
      return res.status(400).json({ error: 'Fecha de inicio inválida' });
    }

    if (compararDatetimeMysql(fechaFinStr, fechaInicioStr) < 0) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
    }

    // Actualizar actividad
    await execute(
      `UPDATE actividades 
       SET descripcion = ?, lugar = ?, detalles = ?, fecha_inicio = ?, fecha_fin = ?
       WHERE id = ? AND colegio_id = ?`,
      [descripcion, lugar || '', detalles || '', fechaInicioStr, fechaFinStr, id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'ACTUALIZAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: parseInt(id),
      descripcion: `Actualizó actividad: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(actividades[0]),
      datos_nuevos: JSON.stringify({ descripcion, lugar, detalles, fecha_inicio, fecha_fin }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando actividad:', error);
    res.status(500).json({ error: 'Error al actualizar actividad' });
  }
});

/**
 * DELETE /api/docente/actividades/:id
 * Eliminar actividad (solo ADMINISTRADOR)
 */
router.delete('/actividades/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (!esAdminOPromotoria(req.user.tipo)) {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar actividades' });
    }

    const { id } = req.params;

    // Verificar que la actividad existe
    const actividades = await query(
      `SELECT * FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (actividades.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    // Eliminar actividad
    await execute(
      `DELETE FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo === 'PROMOTORIA' ? 'PROMOTORIA' : 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: parseInt(id),
      descripcion: `Eliminó actividad: ${actividades[0].descripcion}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(actividades[0]),
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando actividad:', error);
    res.status(500).json({ error: 'Error al eliminar actividad' });
  }
});

/**
 * GET /api/docente/actividades
 * Obtener actividades del calendario (solo lectura)
 * IMPORTANTE: Para el menú Actividades, muestra TODAS las actividades del año actual (pasadas y futuras)
 * Para el CalendarioWidget, puede mostrar todas sin restricción si no se pasa parámetro de año
 */
router.get('/actividades', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { fecha, mes, anio } = req.query;

    // Si no se especifica año, usar año actual (para el menú Actividades)
    // Si se especifica año, usar ese año (para el calendario que puede navegar entre años)
    const añoFiltro = anio ? parseInt(anio) : new Date().getFullYear();

    let querySql = `
      ${ACTIVIDADES_SELECT_SQL}
      WHERE a.colegio_id = ?
        AND YEAR(a.fecha_inicio) = ?
    `;
    const params = [colegio_id, añoFiltro];

    // Si se pasa mes (1-12), filtrar por ese mes
    if (mes) {
      const mesNum = parseInt(mes);
      if (mesNum >= 1 && mesNum <= 12) {
        querySql += ` AND MONTH(a.fecha_inicio) = ?`;
        params.push(mesNum);
      }
    }

    // Si se pasa fecha, filtrar solo las que incluyen ese día en su rango
    if (fecha) {
      // Filtrar actividades que incluyen esta fecha en su rango
      // La fecha puede estar entre fecha_inicio y fecha_fin
      querySql += ` AND DATE(?) BETWEEN DATE(a.fecha_inicio) AND COALESCE(DATE(a.fecha_fin), DATE(a.fecha_inicio))`;
      params.push(fecha);
    }

    querySql += ` ORDER BY a.fecha_inicio ASC, a.fecha_fin ASC`;

    const actividades = await query(querySql, params);

    console.log(`📅 Actividades del año ${añoFiltro}${mes ? `, mes ${mes}` : ''}:`, actividades.length);

    res.json({ 
      actividades: actividades || [],
      anio: añoFiltro
    });
  } catch (error) {
    console.error('Error obteniendo actividades:', error);
    res.status(500).json({ error: 'Error al obtener actividades' });
  }
});

/**
 * GET /api/docente/mensajes/recibidos
 * Obtener mensajes recibidos con información completa del remitente
 */
router.get('/mensajes/recibidos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Obtener año del query si existe, sino mostrar todos
    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*, 
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as remitente_nombre_completo,
              CASE
                WHEN p.id IS NOT NULL THEN p.foto
                WHEN a.id IS NOT NULL THEN a.foto
                WHEN ap.id IS NOT NULL THEN ap.foto
                ELSE NULL
              END as remitente_foto,
              u1.tipo as remitente_tipo,
              u1.usuario as remitente_usuario
       FROM mensajes m
       INNER JOIN usuarios u1 ON u1.id = m.remitente_id
       LEFT JOIN personal p ON p.id = u1.personal_id
       LEFT JOIN alumnos a ON a.id = u1.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u1.apoderado_id
       WHERE m.destinatario_id = ? 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`;
    
    const queryParams = [usuario_id];
    
    // Agregar filtro por año solo si se especifica
    if (anioFiltro) {
      querySQL += ` AND YEAR(m.fecha_hora) = ?`;
      queryParams.push(anioFiltro);
    }

    const remitenteFiltro = req.query.remitente_id != null && String(req.query.remitente_id).trim() !== ''
      ? parseInt(String(req.query.remitente_id), 10)
      : null;
    if (remitenteFiltro != null && !Number.isNaN(remitenteFiltro)) {
      querySQL += ` AND m.remitente_id = ?`;
      queryParams.push(remitenteFiltro);
    }
    
    querySQL += ` ORDER BY m.fecha_hora DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);
    
    const mensajes = await query(querySQL, queryParams);

    // Obtener archivos adjuntos para cada mensaje
    for (const mensaje of mensajes) {
      mensaje.remitente_foto_url = urlStaticFotos(mensaje.remitente_foto);
      const archivos = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensaje.id]
      );
      mensaje.archivos = (archivos || []).map((archivo) => ({
        ...archivo,
        archivo_url: urlArchivoMensajeStatic(archivo.archivo),
      }));
    }

    // Contar total con mismo filtro de año
    let countSQL = `SELECT COUNT(*) as count
       FROM mensajes m
       WHERE m.destinatario_id = ? 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`;
    const countParams = [usuario_id];
    
    if (anioFiltro) {
      countSQL += ` AND YEAR(m.fecha_hora) = ?`;
      countParams.push(anioFiltro);
    }
    if (remitenteFiltro != null && !Number.isNaN(remitenteFiltro)) {
      countSQL += ` AND m.remitente_id = ?`;
      countParams.push(remitenteFiltro);
    }
    
    const total = await query(countSQL, countParams);

    res.json({ 
      mensajes: mensajes || [],
      pagination: {
        total: total[0]?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes recibidos:', error);
    res.status(500).json({ error: 'Error al obtener mensajes recibidos' });
  }
});

/**
 * GET /api/docente/mensajes/enviados
 * Obtener mensajes enviados con información completa del destinatario
 */
router.get('/mensajes/enviados', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Obtener año del query si existe, sino mostrar todos
    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*,
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as destinatario_nombre_completo,
              CASE
                WHEN p.id IS NOT NULL THEN p.foto
                WHEN a.id IS NOT NULL THEN a.foto
                WHEN ap.id IS NOT NULL THEN ap.foto
                ELSE NULL
              END as destinatario_foto,
              u2.tipo as destinatario_tipo,
              u2.usuario as destinatario_usuario
       FROM mensajes m
       INNER JOIN usuarios u2 ON u2.id = m.destinatario_id
       LEFT JOIN personal p ON p.id = u2.personal_id
       LEFT JOIN alumnos a ON a.id = u2.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u2.apoderado_id
       WHERE m.remitente_id = ? 
         AND m.tipo = 'ENVIADO'
         AND m.borrado = 'NO'`;
    
    const queryParams = [usuario_id];
    
    // Agregar filtro por año solo si se especifica
    if (anioFiltro) {
      querySQL += ` AND YEAR(m.fecha_hora) = ?`;
      queryParams.push(anioFiltro);
    }

    const destinatarioFiltro = req.query.destinatario_id != null && String(req.query.destinatario_id).trim() !== ''
      ? parseInt(String(req.query.destinatario_id), 10)
      : null;
    if (destinatarioFiltro != null && !Number.isNaN(destinatarioFiltro)) {
      querySQL += ` AND m.destinatario_id = ?`;
      queryParams.push(destinatarioFiltro);
    }
    
    querySQL += ` ORDER BY m.fecha_hora DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);
    
    const mensajes = await query(querySQL, queryParams);

    // Obtener archivos adjuntos para cada mensaje
    for (const mensaje of mensajes) {
      mensaje.destinatario_foto_url = urlStaticFotos(mensaje.destinatario_foto);
      const archivos = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensaje.id]
      );
      mensaje.archivos = (archivos || []).map((archivo) => ({
        ...archivo,
        archivo_url: urlArchivoMensajeStatic(archivo.archivo),
      }));
      // Debug: verificar archivos para mensajes enviados
      if (archivos && archivos.length > 0) {
        console.log(`📎 [MENSAJES ENVIADOS] Mensaje ID ${mensaje.id} (asunto: "${mensaje.asunto}") tiene ${archivos.length} archivo(s):`, archivos.map(a => a.nombre_archivo || a.archivo));
      } else {
        console.log(`⚠️ [MENSAJES ENVIADOS] Mensaje ID ${mensaje.id} (asunto: "${mensaje.asunto}") NO tiene archivos`);
      }
    }

    // Contar total con mismo filtro de año
    let countSQL = `SELECT COUNT(*) as count
       FROM mensajes m
       WHERE m.remitente_id = ? 
         AND m.tipo = 'ENVIADO'
         AND m.borrado = 'NO'`;
    const countParams = [usuario_id];
    
    if (anioFiltro) {
      countSQL += ` AND YEAR(m.fecha_hora) = ?`;
      countParams.push(anioFiltro);
    }
    if (destinatarioFiltro != null && !Number.isNaN(destinatarioFiltro)) {
      countSQL += ` AND m.destinatario_id = ?`;
      countParams.push(destinatarioFiltro);
    }
    
    const total = await query(countSQL, countParams);

    res.json({ 
      mensajes: mensajes || [],
      pagination: {
        total: total[0]?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes enviados:', error);
    res.status(500).json({ error: 'Error al obtener mensajes enviados' });
  }
});

/**
 * GET /api/docente/mensajes/buscar-destinatarios
 * Buscar destinatarios (alumnos, apoderados, grupos, personal) con búsqueda automática
 */
router.get('/mensajes/buscar-destinatarios', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { q = '' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ resultados: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const resultados = [];

    // Buscar alumnos (del año activo)
    const alumnos = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) as nombre_completo,
              'ALUMNO' as tipo,
              CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as info_adicional,
              a.foto
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.colegio_id = ?
         AND g.anio = ?
         AND (m.estado = 0)
         AND (
           a.nombres LIKE ? OR
           a.apellido_paterno LIKE ? OR
           a.apellido_materno LIKE ? OR
           CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, anio_activo, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    alumnos.forEach(al => {
      resultados.push({
        usuario_id: al.usuario_id,
        nombre_completo: al.nombre_completo.trim(),
        tipo: al.tipo,
        info_adicional: al.info_adicional,
        foto: al.foto
      });
    });

    // Buscar apoderados
    const apoderados = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              'APODERADO' as tipo,
              CONCAT('Padre/Madre de: ', a.nombres, ' ', a.apellido_paterno) as info_adicional,
              '' as foto
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.estado = 'ACTIVO'
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND (
           ap.nombres LIKE ? OR
           ap.apellido_paterno LIKE ? OR
           ap.apellido_materno LIKE ? OR
           CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    apoderados.forEach(ap => {
      resultados.push({
        usuario_id: ap.usuario_id,
        nombre_completo: ap.nombre_completo.trim(),
        tipo: ap.tipo,
        info_adicional: ap.info_adicional,
        foto: ap.foto
      });
    });

    // Buscar personal/docentes
    const personal = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo,
              'PERSONAL' as tipo,
              'Docente/Personal' as info_adicional,
              p.foto
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
         AND (
           p.nombres LIKE ? OR
           p.apellidos LIKE ? OR
           CONCAT(p.nombres, ' ', p.apellidos) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm]
    );

    personal.forEach(p => {
      resultados.push({
        usuario_id: p.usuario_id,
        nombre_completo: p.nombre_completo.trim(),
        tipo: p.tipo,
        info_adicional: p.info_adicional,
        foto: p.foto
      });
    });

    // Buscar grupos (para enviar a todos los alumnos del grupo)
    const grupos = await query(
      `SELECT g.id as grupo_id,
              CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as nombre_completo,
              'GRUPO' as tipo,
              CONCAT(COUNT(DISTINCT m.alumno_id), ' alumnos') as info_adicional,
              '' as foto
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
       WHERE g.colegio_id = ?
         AND g.anio = ?
         AND (
           CONCAT(g.grado, '° ', g.seccion) LIKE ? OR
           n.nombre LIKE ?
         )
       GROUP BY g.id, g.grado, g.seccion, n.nombre
       LIMIT 10`,
      [colegio_id, anio_activo, searchTerm, searchTerm]
    );

    grupos.forEach(g => {
      resultados.push({
        grupo_id: g.grupo_id,
        nombre_completo: String(g.nombre_completo || ''),
        tipo: String(g.tipo || 'GRUPO'),
        info_adicional: String(g.info_adicional || '0 alumnos'),
        foto: String(g.foto || '')
      });
    });

    res.json({ resultados: resultados.slice(0, 50) });
  } catch (error) {
    console.error('Error buscando destinatarios:', error);
    res.status(500).json({ error: 'Error al buscar destinatarios' });
  }
});

/**
 * GET /api/docente/mensajes/alumno/:alumnoId/usuario
 * Obtener usuario_id asociado a un alumnoId para envío de mensajes
 */
router.get('/mensajes/alumno/:alumnoId/usuario', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const { colegio_id } = req.user;

    if (!alumnoId) {
      return res.status(400).json({ error: 'ID de alumno es requerido' });
    }

    // Obtener usuario_id del alumno
    const usuario = await query(
      `SELECT u.id as usuario_id,
              CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) as nombre_completo,
              a.id as alumno_id
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
       WHERE a.id = ? AND a.colegio_id = ?`,
      [alumnoId, colegio_id]
    );

    if (!usuario || usuario.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado o sin usuario activo' });
    }

    res.json({ usuario: usuario[0] });
  } catch (error) {
    console.error('Error obteniendo usuario del alumno:', error);
    res.status(500).json({ error: 'Error al obtener usuario del alumno' });
  }
});

/**
 * GET /api/docente/mensajes/alumno/:alumnoId/apoderados-destinatarios
 * Usuarios (apoderados + docentes que son apoderados) para enviar mensaje solo a padres/madres del alumno
 */
router.get('/mensajes/alumno/:alumnoId/apoderados-destinatarios', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const { colegio_id } = req.user;
    const alumnoIdNum = parseInt(alumnoId, 10);
    if (!alumnoIdNum) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const al = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno
       FROM alumnos a WHERE a.id = ? AND a.colegio_id = ?`,
      [alumnoIdNum, colegio_id]
    );
    if (!al || al.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const apoderados = await query(
      `SELECT DISTINCT u.id as usuario_id, ap.nro_documento, ap.nombres, ap.apellido_paterno, ap.apellido_materno
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE f.alumno_id = ?
         AND ap.colegio_id = ?
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [alumnoIdNum, colegio_id, colegio_id]
    );

    const destinatarios = [];
    const vistos = new Set();
    for (const a of apoderados || []) {
      if (vistos.has(a.usuario_id)) continue;
      vistos.add(a.usuario_id);
      destinatarios.push({
        usuario_id: a.usuario_id,
        nombre_completo: `${a.nombres || ''} ${a.apellido_paterno || ''} ${a.apellido_materno || ''}`.trim() || 'Apoderado',
        tipo: 'apoderado',
      });
    }

    let apoderadoUsuarioIds = apoderados.map((x) => x.usuario_id);
    const apoderadoDnis = apoderados.map((x) => x.nro_documento).filter((d) => d && String(d).trim());

    if (apoderadoDnis.length > 0) {
      try {
        const placeholdersDni = apoderadoDnis.map(() => '?').join(',');
        let sqlQuery = `SELECT DISTINCT u.id as usuario_id,
          TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) as nombre_completo
         FROM usuarios u
         INNER JOIN personal p ON p.id = u.personal_id
         WHERE u.colegio_id = ?
           AND u.estado = 'ACTIVO'
           AND u.tipo = 'DOCENTE'
           AND (p.nro_documento IN (${placeholdersDni})
                OR u.usuario IN (${placeholdersDni}))`;
        const queryParams = [colegio_id, ...apoderadoDnis, ...apoderadoDnis];
        if (apoderadoUsuarioIds.length > 0) {
          sqlQuery += ` AND u.id NOT IN (${apoderadoUsuarioIds.map(() => '?').join(',')})`;
          queryParams.push(...apoderadoUsuarioIds);
        }
        const docentesApoderados = await query(sqlQuery, queryParams);
        for (const d of docentesApoderados || []) {
          if (vistos.has(d.usuario_id)) continue;
          vistos.add(d.usuario_id);
          destinatarios.push({
            usuario_id: d.usuario_id,
            nombre_completo: (d.nombre_completo || '').trim() || 'Docente / Apoderado',
            tipo: 'docente_apoderado',
          });
        }
      } catch (e) {
        console.warn('[apoderados-destinatarios] docentes-apoderados:', e.message);
      }
    }

    const alumnoNombre = `${al[0].apellido_paterno || ''} ${al[0].apellido_materno || ''}, ${al[0].nombres || ''}`.trim();

    res.json({
      alumno: { id: al[0].id, nombre_completo: alumnoNombre },
      destinatarios,
    });
  } catch (error) {
    console.error('Error obteniendo apoderados-destinatarios:', error);
    res.status(500).json({ error: 'Error al obtener apoderados del alumno' });
  }
});

/**
 * POST /api/docente/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido
 */
router.post('/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    // Misma URL pública que archivos adjuntos (Static/Archivos en dominio PHP), no localhost
    const imagenUrl = urlArchivoMensajeStatic(req.file.filename);

    res.json({ url: imagenUrl });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
});

/**
 * POST /api/docente/mensajes/enviar
 * Enviar mensaje (soporta múltiples destinatarios y grupos, archivos adjuntos y texto enriquecido)
 */
router.post('/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    console.log('📨 [ENVIAR MENSAJE] Inicio de procesamiento -', new Date().toISOString());
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const {
      destinatarios,
      grupos,
      asunto,
      mensaje,
      enviar_a,
      alcance,
      modo_conexiones,
      expand_apoderados_roles,
      contexto_alumno_id,
      contexto_grupo_id,
      mensaje_desde_tutoria
    } = req.body;
    // Multer puede dejar campos repetidos como array; capturar valores fijos para setImmediate
    const primerValorMultipart = (v) => {
      if (v === undefined || v === null) return undefined;
      return Array.isArray(v) ? v[0] : v;
    };
    const phpBaseMensajes = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const contextoAlumnoIdEnvio = primerValorMultipart(contexto_alumno_id);
    const contextoGrupoIdEnvio = primerValorMultipart(contexto_grupo_id);
    const enviarAValue = String(primerValorMultipart(enviar_a) || 'todos').toLowerCase();
    const enviarATipo = ['apoderados', 'alumnos', 'docentes', 'todos', 'todo_personal'].includes(enviarAValue)
      ? enviarAValue
      : 'todos';
    const alcanceValue = String(primerValorMultipart(alcance) || '').toLowerCase();
    const esConexionManual = primerValorMultipart(modo_conexiones) === 'true' || primerValorMultipart(modo_conexiones) === true;
    const expandApoderadosRoles = expand_apoderados_roles === 'true' || expand_apoderados_roles === true;

    let destinatariosArray = [];
    try {
      const d = typeof destinatarios === 'string' ? JSON.parse(destinatarios || '[]') : destinatarios;
      destinatariosArray = Array.isArray(d) ? d : [];
    } catch {
      destinatariosArray = [];
    }
    let gruposArray = [];
    try {
      const g = typeof grupos === 'string' ? JSON.parse(grupos || '[]') : grupos;
      gruposArray = Array.isArray(g) ? g : [];
    } catch {
      gruposArray = [];
    }
    gruposArray = gruposArray
      .map((x) => parseInt(x, 10))
      .filter((n) => !isNaN(n) && n > 0);
    destinatariosArray = destinatariosArray
      .map((x) => parseInt(x, 10))
      .filter((n) => !isNaN(n) && n > 0);

    let alcanceEnvio = alcanceValue === 'todos' ? 'todos' : 'grupos';
    if (gruposArray.length > 0) {
      alcanceEnvio = 'grupos';
    }

    const envioGlobalTodos = alcanceEnvio === 'todos';
    if (!envioGlobalTodos && (!destinatariosArray || destinatariosArray.length === 0) && (!gruposArray || gruposArray.length === 0)) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario o grupo' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    // Responder inmediatamente al cliente
    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Continuar el procesamiento en segundo plano
    setImmediate(async () => {
      try {
        let asuntoEnviar = asunto;
        let mensajeEnviar = mensaje;
        const esConexionEnvio = esConexionManual || (gruposArray && gruposArray.length > 0) || alcanceEnvio === 'todos';
        let refGrupoNotif = '';
        let remitenteNombre = 'Docente';
        try {
          const remitenteRows = await query(
            `SELECT COALESCE(
                      NULLIF(TRIM(CONCAT(COALESCE(p.nombres, ''), ' ', COALESCE(p.apellidos, ''))), ''),
                      NULLIF(TRIM(CONCAT(COALESCE(a.nombres, ''), ' ', COALESCE(a.apellido_paterno, ''), ' ', COALESCE(a.apellido_materno, ''))), ''),
                      NULLIF(TRIM(CONCAT(COALESCE(ap.nombres, ''), ' ', COALESCE(ap.apellido_paterno, ''), ' ', COALESCE(ap.apellido_materno, ''))), ''),
                      u.usuario
                    ) as remitente_nombre
             FROM usuarios u
             LEFT JOIN personal p ON p.id = u.personal_id
             LEFT JOIN alumnos a ON a.id = u.alumno_id
             LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
             WHERE u.id = ? AND u.colegio_id = ?
             LIMIT 1`,
            [usuario_id, colegio_id]
          );
          if (remitenteRows[0]?.remitente_nombre) {
            remitenteNombre = String(remitenteRows[0].remitente_nombre).trim();
          }
        } catch (err) {
          console.warn('[MENSAJES] No se pudo obtener nombre remitente:', err.message);
        }
        if (gruposArray && gruposArray.length > 0) {
          try {
            const gruposMeta = await obtenerMetaGruposConexiones(colegio_id, gruposArray);
            const enr = enriquecerMensajeConexionesFamiliares({
              asuntoOriginal: asunto,
              mensajeOriginal: mensaje,
              gruposMeta,
              personal_id: req.user.personal_id
            });
            asuntoEnviar = enr.asuntoFinal;
            mensajeEnviar = enr.mensajeFinal;
            refGrupoNotif = enr.refCorta || '';
          } catch (enrErr) {
            console.warn('⚠️ [MENSAJES] Enriquecimiento Conexiones familiares (grupo):', enrErr.message);
          }
        }

        // Obtener todos los usuarios destinatarios
        const usuariosDestinatarios = [];

        // Agregar destinatarios directos
        if (destinatariosArray && destinatariosArray.length > 0) {
          usuariosDestinatarios.push(...destinatariosArray);
        }

        // Cobertura global ("TODOS"): envía por perfil a todo el colegio
        if (alcanceEnvio === 'todos') {
          try {
            let usuariosGlobales = [];
            if (enviarATipo === 'alumnos') {
              usuariosGlobales = await query(
                `SELECT id as usuario_id FROM usuarios
                 WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'ALUMNO'`,
                [colegio_id]
              );
            } else if (enviarATipo === 'apoderados') {
              usuariosGlobales = await query(
                `SELECT id as usuario_id FROM usuarios
                 WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'APODERADO'`,
                [colegio_id]
              );
            } else if (enviarATipo === 'docentes') {
              usuariosGlobales = await query(
                `SELECT id as usuario_id FROM usuarios
                 WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'DOCENTE'`,
                [colegio_id]
              );
            } else if (enviarATipo === 'todo_personal') {
              // Solo cuentas de trabajo intranet (no alumnos ni apoderados). Un docente que también es apoderado
              // tiene usuario DOCENTE y recibe aquí; su usuario APODERADO no entra en esta lista.
              const tiposPersonal = ['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA', 'PSICOLOGA', 'DOCENTE', 'ASISTENCIA'];
              const ph = tiposPersonal.map(() => '?').join(',');
              usuariosGlobales = await query(
                `SELECT id AS usuario_id FROM usuarios
                 WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo IN (${ph})`,
                [colegio_id, ...tiposPersonal]
              );
            } else {
              // TODOS incluye administradores, promotoría, docentes, alumnos y apoderados
              usuariosGlobales = await query(
                `SELECT id as usuario_id FROM usuarios
                 WHERE colegio_id = ? AND estado = 'ACTIVO'`,
                [colegio_id]
              );
            }
            (usuariosGlobales || []).forEach((u) => {
              if (!usuariosDestinatarios.includes(u.usuario_id)) {
                usuariosDestinatarios.push(u.usuario_id);
              }
            });
          } catch (globalErr) {
            console.warn('⚠️ [ENVIAR MENSAJE] Error obteniendo destinatarios globales:', globalErr.message);
          }
        }

        // Expansión opcional:
        // si el destinatario enviado corresponde a una cuenta APODERADO, buscar la cuenta DOCENTE
        // del mismo padre/madre (mismo DNI) y agregarla como destinatario también.
        // Esto permite que quien entra como DOCENTE vea el mensaje en "Hijos a cargo".
        if (expandApoderadosRoles && usuariosDestinatarios.length > 0) {
          const usuariosIdsNumericos = Array.from(new Set(
            usuariosDestinatarios
              .map((id) => parseInt(id))
              .filter((n) => !isNaN(n))
          ));
          if (usuariosIdsNumericos.length > 0) {
            try {
              const apoderadosData = await query(
                `SELECT u.id as usuario_id, ap.nro_documento
                 FROM usuarios u
                 INNER JOIN apoderados ap ON ap.id = u.apoderado_id
                 WHERE u.id IN (${usuariosIdsNumericos.map(() => '?').join(',')})
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'
                   AND u.tipo = 'APODERADO'
                   AND ap.colegio_id = ?
                   AND ap.nro_documento IS NOT NULL
                   AND TRIM(CAST(ap.nro_documento AS CHAR)) != ''`,
                [...usuariosIdsNumericos, colegio_id, colegio_id]
              );

              const dnis = (apoderadosData || [])
                .map((x) => (x.nro_documento != null ? String(x.nro_documento).trim() : ''))
                .filter(Boolean);

              if (dnis.length > 0) {
                const docentesData = await query(
                  `SELECT DISTINCT u.id as usuario_id
                   FROM usuarios u
                   INNER JOIN personal p ON p.id = u.personal_id
                   WHERE u.colegio_id = ?
                     AND u.estado = 'ACTIVO'
                     AND u.tipo = 'DOCENTE'
                     AND p.nro_documento IS NOT NULL
                     AND TRIM(CAST(p.nro_documento AS CHAR)) != ''
                     AND p.nro_documento IN (${dnis.map(() => '?').join(',')})`,
                  [colegio_id, ...dnis]
                );

                const docentesIds = (docentesData || []).map((x) => x.usuario_id);
                for (const docenteId of docentesIds) {
                  if (!usuariosDestinatarios.includes(docenteId)) {
                    usuariosDestinatarios.push(docenteId);
                  }
                }
              }
            } catch (expandErr) {
              console.warn('⚠️ [MENSAJES] Error expandiendo destinatarios apoderados roles:', expandErr.message);
            }
          }
        }

        // Si hay grupos, obtener destinatarios según perfil seleccionado
        let totalAlumnosGrupos = 0;
        if (gruposArray && gruposArray.length > 0) {
          // Alumnos: solo si enviar_a es 'todos' o 'alumnos'
          if (enviarATipo === 'todos' || enviarATipo === 'alumnos') {
            const alumnosGrupos = await query(
              `SELECT DISTINCT u.id as usuario_id
               FROM grupos g
               INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
               INNER JOIN alumnos a ON a.id = m.alumno_id
               INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
               WHERE g.id IN (${gruposArray.map(() => '?').join(',')})
                 AND g.colegio_id = ?`,
              [...gruposArray, colegio_id]
            );
            totalAlumnosGrupos = alumnosGrupos.length;
            alumnosGrupos.forEach(al => {
              if (!usuariosDestinatarios.includes(al.usuario_id)) {
                usuariosDestinatarios.push(al.usuario_id);
              }
            });
          }

          // Apoderados y docentes-apoderados: solo si enviar_a es 'todos' o 'apoderados'
          if (enviarATipo === 'todos' || enviarATipo === 'apoderados') {
          try {
            const apoderadosGrupo = await query(
              `SELECT DISTINCT u.id as usuario_id, ap.nro_documento, ap.email
               FROM grupos g
               INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
               INNER JOIN alumnos a ON a.id = m.alumno_id
               INNER JOIN familias f ON f.alumno_id = a.id
               INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
               INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
               WHERE g.id IN (${gruposArray.map(() => '?').join(',')})`,
              [colegio_id, colegio_id, ...gruposArray]
            );
            const apoderadoIds = [];
            const apoderadoDnis = [];
            const apoderadosUnicos = [];
            const vistos = new Set();
            for (const ap of apoderadosGrupo || []) {
              if (vistos.has(ap.usuario_id)) continue;
              vistos.add(ap.usuario_id);
              apoderadosUnicos.push(ap);
              apoderadoIds.push(ap.usuario_id);
              if (ap.nro_documento) apoderadoDnis.push(ap.nro_documento);
            }
            apoderadoIds.forEach(id => {
              if (!usuariosDestinatarios.includes(id)) usuariosDestinatarios.push(id);
            });
            // Docentes que también son apoderados (mismo DNI): reciben mensaje en bandeja docente
            if (apoderadoDnis.length > 0) {
              const placeholdersDni = apoderadoDnis.map(() => '?').join(',');
              let sqlDocApod = `SELECT DISTINCT u.id FROM usuarios u
                INNER JOIN personal p ON p.id = u.personal_id
                WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
                  AND p.nro_documento IN (${placeholdersDni})`;
              const paramsDocApod = [colegio_id, ...apoderadoDnis];
              if (apoderadoIds.length > 0) {
                sqlDocApod += ` AND u.id NOT IN (${apoderadoIds.map(() => '?').join(',')})`;
                paramsDocApod.push(...apoderadoIds);
              }
              const docentesApoderados = await query(sqlDocApod, paramsDocApod);
              (docentesApoderados || []).forEach(d => {
                if (!usuariosDestinatarios.includes(d.id)) usuariosDestinatarios.push(d.id);
              });
              console.log(`📨 [ENVIAR MENSAJE] Apoderados: ${apoderadosUnicos.length}, docentes-apoderados: ${(docentesApoderados || []).length}`);
            }
          } catch (errApod) {
            console.warn('⚠️ [ENVIAR MENSAJE] Error obteniendo apoderados para bandeja:', errApod.message);
          }
          }

          // Docentes del grupo (asignaturas y tutoría): solo si enviar_a es 'todos' o 'docentes'
          if (enviarATipo === 'todos' || enviarATipo === 'docentes') {
            try {
              const docentesGrupo = await query(
                `SELECT DISTINCT u.id as usuario_id
                 FROM asignaturas a
                 INNER JOIN usuarios u ON u.personal_id = a.personal_id
                 WHERE a.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                   AND a.colegio_id = ?
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'
                   AND u.tipo = 'DOCENTE'`,
                [...gruposArray, colegio_id, colegio_id]
              );
              (docentesGrupo || []).forEach((d) => {
                if (!usuariosDestinatarios.includes(d.usuario_id)) {
                  usuariosDestinatarios.push(d.usuario_id);
                }
              });

              const tutoresGrupo = await fetchUsuariosTutoresGrupos(query, colegio_id, gruposArray);
              (tutoresGrupo || []).forEach((d) => {
                if (!usuariosDestinatarios.includes(d.usuario_id)) {
                  usuariosDestinatarios.push(d.usuario_id);
                }
              });
            } catch (errDocGrupos) {
              console.warn('⚠️ [ENVIAR MENSAJE] Error obteniendo docentes por grupos:', errDocGrupos.message);
            }
          }
        }

        // Cobertura por grupos + perfil «Todo el personal»: destinatarios = todo el staff del colegio
        // (los grupos solo enriquecen asunto/cuerpo; administración y demás roles no pertenecen a un aula).
        if (enviarATipo === 'todo_personal' && alcanceEnvio === 'grupos') {
          try {
            const tiposPersonal = ['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA', 'PSICOLOGA', 'DOCENTE', 'ASISTENCIA'];
            const ph = tiposPersonal.map(() => '?').join(',');
            const staffRows = await query(
              `SELECT id AS usuario_id FROM usuarios
               WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo IN (${ph})`,
              [colegio_id, ...tiposPersonal]
            );
            (staffRows || []).forEach((u) => {
              if (!usuariosDestinatarios.includes(u.usuario_id)) {
                usuariosDestinatarios.push(u.usuario_id);
              }
            });
          } catch (staffGrupoErr) {
            console.warn('⚠️ [ENVIAR MENSAJE] Error destinatarios todo_personal (grupos):', staffGrupoErr.message);
          }
        }

        const destinatariosUnicos = Array.from(
          new Set(
            (usuariosDestinatarios || [])
              .map((id) => parseInt(id, 10))
              .filter((id) => !isNaN(id) && id > 0 && id !== parseInt(usuario_id, 10))
          )
        );

        if (destinatariosUnicos.length === 0) {
          console.warn('⚠️ [ENVIAR MENSAJE] No hay destinatarios válidos para enviar');
          return;
        }

        // Crear un mensaje para cada destinatario
        const fechaHora = fechaHoraMySQLLima();
        let mensajesInsertados = 0;
        const mensajesIds = []; // Para asociar archivos

        // Historial unificado para panel admin de conexiones (1 envío = 1 registro)
        if (esConexionEnvio) {
          try {
            await execute(
              `CREATE TABLE IF NOT EXISTS conexiones_envios (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                colegio_id INT NOT NULL,
                remitente_id INT NOT NULL,
                fecha_hora DATETIME NOT NULL,
                asunto TEXT,
                mensaje LONGTEXT,
                alcance VARCHAR(20) NOT NULL,
                perfil_destino VARCHAR(20) NOT NULL,
                grupos_json LONGTEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )`
            );
            await execute(
              `INSERT INTO conexiones_envios
                (colegio_id, remitente_id, fecha_hora, asunto, mensaje, alcance, perfil_destino, grupos_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                colegio_id,
                usuario_id,
                fechaHora,
                asuntoEnviar,
                mensajeEnviar,
                alcanceEnvio === 'todos' ? 'TODOS' : 'GRUPOS',
                String(enviarATipo || 'todos').toUpperCase(),
                JSON.stringify(Array.isArray(gruposArray) ? gruposArray : [])
              ]
            );
          } catch (histErr) {
            console.warn('⚠️ [CONEXIONES] No se pudo registrar historial unificado:', histErr.message);
          }
        }

        // Insertar mensajes en la base de datos
        console.log(`📨 [ENVIAR MENSAJE] Procesando ${destinatariosUnicos.length} destinatario(s)`);
        /** Para campanita in-app: un registro por destinatario con el id del mensaje RECIBIDO */
        const campanaMensajesDocente = [];
        for (const destinatarioId of destinatariosUnicos) {
          try {
            let asuntoDest = asuntoEnviar;
            let mensajeDest = mensajeEnviar;
            try {
              const enrDocApod = await enriquecerMensajeDocenteParaDestinatario({
                colegio_id,
                anio_activo,
                personal_id,
                destinatarioUsuarioId: destinatarioId,
                asuntoOriginal: asunto,
                mensajeOriginal: mensajeEnviar,
                contexto_alumno_id: contextoAlumnoIdEnvio,
                contexto_grupo_id: contextoGrupoIdEnvio,
                gruposIds: gruposArray && gruposArray.length ? gruposArray : [],
                mensaje_desde_tutoria
              });
              if (enrDocApod) {
                asuntoDest = enrDocApod.asuntoFinal;
                mensajeDest = enrDocApod.mensajeFinal;
              }
            } catch (enrErr) {
              console.warn('⚠️ [ENVIAR MENSAJE] Contexto docente→apoderado:', enrErr.message);
            }

            mensajeDest = normalizarUrlsImagenesEnHtml(mensajeDest, phpBaseMensajes);

            // Mensaje para el remitente (tipo ENVIADO)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asuntoDest, mensajeDest, fechaHora]
            );
            console.log(`📨 [ENVIAR MENSAJE] Mensaje ENVIADO creado - ID: ${resultEnviado.insertId}, destinatario: ${destinatarioId}`);

            // Mensaje para el destinatario (tipo RECIBIDO)
            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asuntoDest, mensajeDest, fechaHora]
            );
            console.log(`📨 [ENVIAR MENSAJE] Mensaje RECIBIDO creado - ID: ${resultRecibido.insertId}, destinatario: ${destinatarioId}`);

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
            campanaMensajesDocente.push({
              destinatarioId: parseInt(destinatarioId, 10),
              mensajeRecibidoId: resultRecibido.insertId
            });
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
            // Continuar con los demás destinatarios aunque uno falle
          }
        }

        // Historial Conexiones Familiares: después de crear mensajes, guardar referencia a un RECIBIDO del envío
        // (los adjuntos se duplican en todos los mensaje_id; uno basta para listar en historial).
        const primerMensajeRecibidoId =
          campanaMensajesDocente.length > 0 ? campanaMensajesDocente[0].mensajeRecibidoId : null;
        if (gruposArray && gruposArray.length > 0) {
          try {
            for (const grupoId of gruposArray) {
              if (primerMensajeRecibidoId) {
                try {
                  await execute(
                    `INSERT INTO mensajes_grupos (remitente_id, grupo_id, asunto, mensaje, fecha_hora, mensaje_referencia_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [usuario_id, grupoId, asuntoEnviar, mensajeEnviar, fechaHora, primerMensajeRecibidoId]
                  );
                  console.log(
                    `📨 [MENSAJES_GRUPOS] Registro historial - grupo_id: ${grupoId}, ref mensaje_id: ${primerMensajeRecibidoId}`
                  );
                } catch (refErr) {
                  const em = String(refErr.message || '');
                  if (em.includes('Unknown column') && em.includes('mensaje_referencia_id')) {
                    await execute(
                      `INSERT INTO mensajes_grupos (remitente_id, grupo_id, asunto, mensaje, fecha_hora)
                       VALUES (?, ?, ?, ?, ?)`,
                      [usuario_id, grupoId, asuntoEnviar, mensajeEnviar, fechaHora]
                    );
                    console.warn(
                      `⚠️ [MENSAJES_GRUPOS] Migración 033 pendiente: historial sin mensaje_referencia_id (grupo ${grupoId})`
                    );
                  } else {
                    throw refErr;
                  }
                }
              } else {
                await execute(
                  `INSERT INTO mensajes_grupos (remitente_id, grupo_id, asunto, mensaje, fecha_hora)
                   VALUES (?, ?, ?, ?, ?)`,
                  [usuario_id, grupoId, asuntoEnviar, mensajeEnviar, fechaHora]
                );
                console.log(`📨 [MENSAJES_GRUPOS] Registro historial (sin ref) - grupo_id: ${grupoId}`);
              }
            }
          } catch (mgErr) {
            console.warn('⚠️ [MENSAJES_GRUPOS] Tabla mensajes_grupos puede no existir:', mgErr.message);
          }
        }

        // Guardar archivos adjuntos si existen
        // IMPORTANTE: Los archivos se guardan en Static/Archivos/ (compartido con sistema PHP)
        // Se sirven desde Apache mediante el Alias /Static
        if (req.files && req.files.length > 0) {
          console.log(`📎 [ENVIAR MENSAJE] Procesando ${req.files.length} archivo(s) para ${mensajesIds.length} mensaje(s)`);
          console.log(`📎 [ENVIAR MENSAJE] IDs de mensajes a asociar archivos:`, mensajesIds);
          for (const file of req.files) {
            try {
              // Insertar archivo para cada mensaje creado
              // El archivo ya está guardado en backend/uploads/mensajes/ por multer
              for (const mensajeId of mensajesIds) {
                await execute(
                  `INSERT INTO mensajes_archivos (mensaje_id, nombre_archivo, archivo)
                   VALUES (?, ?, ?)`,
                  [mensajeId, file.originalname, file.filename]
                );
                console.log(`📎 [ENVIAR MENSAJE] Archivo insertado - mensaje_id: ${mensajeId}, archivo: ${file.filename}, nombre: ${file.originalname}`);
              }
            } catch (error) {
              console.error(`❌ [ENVIAR MENSAJE] Error guardando archivo ${file.originalname}:`, error);
              // Continuar con los demás archivos aunque uno falle
            }
          }
          console.log(`📎 [ENVIAR MENSAJE] Total de archivos procesados: ${req.files.length} archivo(s) × ${mensajesIds.length} mensaje(s) = ${req.files.length * mensajesIds.length} registros en mensajes_archivos`);
        } else {
          console.log(`📎 [ENVIAR MENSAJE] No hay archivos adjuntos en la solicitud`);
        }

        // Registrar en auditoría (con formato correcto)
        try {
          let descripcionAuditoria = `Envió mensaje a ${destinatariosUnicos.length} destinatario(s)`;
          if (gruposArray && gruposArray.length > 0) {
            descripcionAuditoria += ` (${gruposArray.length} grupo(s) con ${totalAlumnosGrupos} alumno(s))`;
          }
          if (destinatariosArray && destinatariosArray.length > 0) {
            descripcionAuditoria += ` y ${destinatariosArray.length} destinatario(s) directo(s)`;
          }
          if (req.files && req.files.length > 0) {
            descripcionAuditoria += ` con ${req.files.length} archivo(s) adjunto(s)`;
          }
          
          registrarAccion({
            usuario_id: usuario_id,
            colegio_id: colegio_id,
            tipo_usuario: req.user.tipo || 'DOCENTE',
            accion: 'ENVIAR_MENSAJE',
            modulo: 'MENSAJES',
            entidad: 'mensajes',
            descripcion: descripcionAuditoria,
            datos_nuevos: {
              asunto: asuntoEnviar,
              total_destinatarios: destinatariosUnicos.length,
              grupos_seleccionados: gruposArray?.length || 0,
              alumnos_en_grupos: totalAlumnosGrupos,
              destinatarios_directos: destinatariosArray?.length || 0,
              archivos_adjuntos: req.files?.length || 0,
              ref_grupo_conexiones: refGrupoNotif || undefined
            },
            resultado: mensajesInsertados > 0 ? 'EXITOSO' : 'ERROR'
          });
        } catch (auditError) {
          console.error('Error en auditoría (no crítico):', auditError);
        }

        if (mensajesInsertados === 0) {
          console.error('No se pudieron insertar los mensajes');
          return;
        }

        // Campanita: una notificación por destinatario (incluye alumnos, apoderados, docentes y conexiones)
        try {
          if (campanaMensajesDocente.length > 0) {
            const idsCampana = [...new Set(campanaMensajesDocente.map((c) => c.destinatarioId))];
            const phC = idsCampana.map(() => '?').join(',');
            const tiposCampana = await query(
              `SELECT id, tipo FROM usuarios WHERE id IN (${phC}) AND colegio_id = ?`,
              [...idsCampana, colegio_id]
            );
            const tipoPorIdCampana = new Map((tiposCampana || []).map((r) => [parseInt(r.id, 10), r.tipo]));
            const tituloBell = esConexionEnvio ? 'Conexiones familiares' : 'Nuevo mensaje del docente';
            const refTxtBell = refGrupoNotif ? `${refGrupoNotif}. ` : '';
            const contenidoBell = `Remitente: ${remitenteNombre}. ${refTxtBell}Asunto: "${(asuntoEnviar || 'Sin asunto').substring(0, 150)}".`;
            const accionTipoBell = esConexionEnvio ? 'mensajes_conexiones' : 'mensaje_nuevo';
            for (const row of campanaMensajesDocente) {
              const tipoD = tipoPorIdCampana.get(row.destinatarioId) || 'APODERADO';
              let urlDest = '/alumno/mensajes';
              if (tipoD === 'APODERADO') urlDest = '/apoderado/mensajes';
              else if (tipoD === 'DOCENTE') urlDest = '/docente/mensajes';
              else if (tipoD === 'ADMINISTRADOR' || tipoD === 'PROMOTORIA') {
                urlDest = esConexionEnvio ? '/admin/conexiones' : '/admin/mensajes';
              }
              try {
                if (
                  await notificacionMensajeDuplicadaReciente(query, {
                    usuario_id,
                    destinatario_id: row.destinatarioId,
                    accion_tipo: accionTipoBell,
                    contenido: contenidoBell
                  })
                ) {
                  continue;
                }
                await insertNotificacionUsuario(execute, {
                  usuario_id,
                  destinatario_id: row.destinatarioId,
                  asunto: tituloBell,
                  contenido: contenidoBell,
                  estado: 'ENVIADO',
                  accion_tipo: accionTipoBell,
                  accion_payload: {
                    mensaje_id: row.mensajeRecibidoId,
                    grupos: gruposArray?.length ? gruposArray : undefined
                  },
                  url_destino: urlDest
                });
              } catch (campErr) {
                console.warn(`[MENSAJES] Notificación campanita destinatario ${row.destinatarioId}:`, campErr.message);
              }
            }
          }
        } catch (campanaErr) {
          console.warn('[MENSAJES] Error notificaciones campanita (no crítico):', campanaErr.message);
        }

        // Push notifications a todos los destinatarios (alumnos, apoderados, docentes)
        try {
          if (destinatariosUnicos.length > 0) {
            const idsPushD = [...new Set(destinatariosUnicos.map((id) => parseInt(id, 10)))];
            const trP = await query(
              `SELECT id, tipo FROM usuarios WHERE id IN (${idsPushD.map(() => '?').join(',')}) AND colegio_id = ?`,
              [...idsPushD, colegio_id]
            );
            const mapPushDocenteMsg = new Map((trP || []).map((r) => [parseInt(r.id, 10), r.tipo]));
            const subsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
               WHERE usuario_id IN (${destinatariosUnicos.map(() => '?').join(',')})
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...destinatariosUnicos, colegio_id]
            );
            if ((subsData || []).length > 0) {
              const asuntoCorto = (asuntoEnviar || 'Sin asunto').substring(0, 72);
              const pushItemsDoc = (subsData || []).map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const td = mapPushDocenteMsg.get(uid) || 'DOCENTE';
                let urlPush = urlMensajesPorTipoUsuario(td);
                if ((td === 'ADMINISTRADOR' || td === 'PROMOTORIA') && esConexionEnvio) {
                  urlPush = '/admin/conexiones';
                }
                return {
                  subscription: {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                  },
                  payload: {
                    title: esConexionEnvio ? 'Conexiones familiares' : 'Nuevo mensaje',
                    body: `${remitenteNombre}: ${asuntoCorto}`,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `mensaje-${Date.now()}`,
                    data: { url: urlPush, tipo: esConexionEnvio ? 'mensajes_conexiones' : 'mensaje' }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsDoc).catch((err) =>
                console.error('❌ [MENSAJES] Error push:', err)
              );
            }
          }
        } catch (pushErr) {
          console.error('❌ [MENSAJES] Error push:', pushErr);
        }

        // Correo solo a apoderados y docentes (cuenta MENSAJES). No a alumnos.
        try {
          const usuariosConEmail = await query(
            `SELECT u.id, COALESCE(ap.email, p.email) as email
             FROM usuarios u
             LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
             LEFT JOIN personal p ON p.id = u.personal_id
             WHERE u.id IN (${destinatariosUnicos.map(() => '?').join(',')})
               AND u.colegio_id = ?
               AND (u.tipo = 'APODERADO' OR u.tipo = 'DOCENTE')
               AND COALESCE(ap.email, p.email) IS NOT NULL
               AND TRIM(COALESCE(ap.email, p.email)) != ''`,
            [...destinatariosUnicos, colegio_id]
          );
          const emailsUnicos = new Map();
          (usuariosConEmail || []).forEach(u => {
            const email = (u.email || '').toLowerCase().trim();
            if (email && email.includes('@') && !emailsUnicos.has(email)) emailsUnicos.set(email, u.email);
          });
          const colegioInfo = await query(`SELECT nombre FROM colegios WHERE id = ?`, [colegio_id]);
          const colegioNombre = colegioInfo.length > 0 ? colegioInfo[0].nombre : 'Vanguard Schools';
          const tituloNotif = esConexionEnvio ? 'Mensaje — Conexiones familiares' : 'Nuevo mensaje del docente';
          const refMail = refGrupoNotif ? ` Origen: ${refGrupoNotif}.` : '';
          const contenidoNotif = `Remitente: ${remitenteNombre}.${refMail} Asunto: "${(asuntoEnviar || 'Sin asunto').substring(0, 150)}". Ingrese a Mensajes para ver el contenido.`;
          for (const email of emailsUnicos.values()) {
            enviarCorreoNotificacion(email, tituloNotif, contenidoNotif, colegioNombre, 'MENSAJES')
              .catch(err => console.warn(`❌ [MENSAJES] Error correo a ${email}:`, err.message));
          }
          if (emailsUnicos.size > 0) {
            console.log(`📧 [MENSAJES] Docente envió: correos a ${emailsUnicos.size} apoderado(s)/docente(s) (cuenta MENSAJES)`);
          }
        } catch (emailErr) {
          console.warn('❌ [MENSAJES] Error enviando correos:', emailErr.message);
        }

        let mensajeRespuesta = `Mensaje enviado a ${destinatariosUnicos.length} destinatario(s)`;
        if (gruposArray && gruposArray.length > 0) {
          mensajeRespuesta += ` (${gruposArray.length} grupo(s) con ${totalAlumnosGrupos} alumno(s))`;
        }
        if (destinatariosArray && destinatariosArray.length > 0) {
          mensajeRespuesta += ` y ${destinatariosArray.length} destinatario(s) directo(s)`;
        }

        console.log('✅ Mensaje enviado exitosamente:', mensajeRespuesta);
      } catch (bgError) {
        console.error('Error en procesamiento en segundo plano:', bgError);
      }
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

/**
 * DELETE /api/docente/mensajes/:mensajeId
 * Eliminar mensaje (marcar como borrado)
 */
router.delete('/mensajes/:mensajeId', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { mensajeId } = req.params;

    // Verificar que el mensaje pertenece al usuario
    const mensaje = await query(
      `SELECT id, remitente_id, destinatario_id, tipo 
       FROM mensajes 
       WHERE id = ? AND borrado = 'NO'`,
      [mensajeId]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const mensajeData = mensaje[0];
    
    // Solo el remitente puede eliminar mensajes ENVIADOS
    // Solo el destinatario puede eliminar mensajes RECIBIDOS
    const puedeEliminar = 
      (mensajeData.tipo === 'ENVIADO' && mensajeData.remitente_id === usuario_id) ||
      (mensajeData.tipo === 'RECIBIDO' && mensajeData.destinatario_id === usuario_id);

    if (!puedeEliminar) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
    }

    // Obtener información completa del mensaje antes de eliminarlo
    const mensajeCompleto = await query(
      `SELECT * FROM mensajes WHERE id = ?`,
      [mensajeId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje',
      entidad_id: parseInt(mensajeId),
      descripcion: `Eliminó mensaje${mensajeCompleto.length > 0 && mensajeCompleto[0].asunto ? `: "${mensajeCompleto[0].asunto}"` : ''} (ID: ${mensajeId})`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: mensajeCompleto.length > 0 ? JSON.stringify(mensajeCompleto[0]) : null,
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Marcar como borrado (soft delete)
    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id = ?`,
      [mensajeId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Mensaje eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({ error: 'Error al eliminar mensaje' });
  }
});

/**
 * PUT /api/docente/mensajes/marcar-leidos
 * Marcar varios mensajes recibidos como leídos (misma bandeja)
 * Body: { ids: number[] }
 */
router.put('/mensajes/marcar-leidos', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const rawIds = req.body?.ids;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: 'Debe enviar un array ids con al menos un id' });
    }
    const uniqueIds = [...new Set(rawIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n) && n > 0))];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: 'IDs no válidos' });
    }
    const placeholders = uniqueIds.map(() => '?').join(',');
    const result = await execute(
      `UPDATE mensajes SET estado = 'LEIDO'
       WHERE id IN (${placeholders})
         AND destinatario_id = ?
         AND tipo = 'RECIBIDO'
         AND borrado = 'NO'`,
      [...uniqueIds, usuario_id]
    );
    const marcados = typeof result.affectedRows === 'number' ? result.affectedRows : 0;
    res.json({
      success: true,
      marcados,
      message: marcados === 0 ? 'Ningún mensaje actualizado' : `${marcados} mensaje(s) marcado(s) como leído(s)`
    });
  } catch (error) {
    console.error('Error marcando mensajes como leídos (lote):', error);
    res.status(500).json({ error: 'Error al marcar mensajes como leídos' });
  }
});

/**
 * PUT /api/docente/mensajes/:mensajeId/marcar-leido
 * Marcar un mensaje como leído
 */
router.put('/mensajes/:mensajeId/marcar-leido', async (req, res) => {
  try {
    const { mensajeId } = req.params;
    const { usuario_id } = req.user;

    // Verificar que el mensaje existe y pertenece al usuario
    const mensaje = await query(
      `SELECT * FROM mensajes 
       WHERE id = ? AND destinatario_id = ? AND tipo = 'RECIBIDO' AND borrado = 'NO'`,
      [mensajeId, usuario_id]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    // Si ya está leído, no hacer nada
    if (mensaje[0].estado === 'LEIDO') {
      return res.json({ success: true, message: 'Mensaje ya estaba marcado como leído' });
    }

    // Marcar como leído
    await execute(
      `UPDATE mensajes SET estado = 'LEIDO' WHERE id = ?`,
      [mensajeId]
    );

    res.json({ success: true, message: 'Mensaje marcado como leído' });
  } catch (error) {
    console.error('Error marcando mensaje como leído:', error);
    res.status(500).json({ error: 'Error al marcar mensaje como leído' });
  }
});

/**
 * DELETE /api/docente/mensajes
 * Eliminar múltiples mensajes
 */
router.delete('/mensajes', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { mensajesIds } = req.body; // Array de IDs

    if (!mensajesIds || !Array.isArray(mensajesIds) || mensajesIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un ID de mensaje' });
    }

    // Verificar que todos los mensajes pertenecen al usuario
    const placeholders = mensajesIds.map(() => '?').join(',');
    const mensajes = await query(
      `SELECT id, remitente_id, destinatario_id, tipo 
       FROM mensajes 
       WHERE id IN (${placeholders}) AND borrado = 'NO'`,
      mensajesIds
    );

    if (mensajes.length === 0) {
      return res.status(404).json({ error: 'No se encontraron mensajes válidos' });
    }

    // Filtrar solo los mensajes que el usuario puede eliminar
    const mensajesAEliminar = mensajes.filter(m => 
      (m.tipo === 'ENVIADO' && m.remitente_id === usuario_id) ||
      (m.tipo === 'RECIBIDO' && m.destinatario_id === usuario_id)
    );

    if (mensajesAEliminar.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar estos mensajes' });
    }

    const idsAEliminar = mensajesAEliminar.map(m => m.id);
    const placeholdersEliminar = idsAEliminar.map(() => '?').join(',');

    // Marcar como borrado (soft delete)
    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje',
      entidad_id: null,
      descripcion: `Eliminó ${idsAEliminar.length} mensaje(s)`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ mensajes_eliminados: idsAEliminar.length, ids: idsAEliminar }),
      resultado: 'EXITOSO'
    });

    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: `${idsAEliminar.length} mensaje(s) eliminado(s) correctamente`,
      eliminados: idsAEliminar.length
    });
  } catch (error) {
    console.error('Error eliminando mensajes:', error);
    res.status(500).json({ error: 'Error al eliminar mensajes' });
  }
});

/**
 * GET /api/docente/mensajes/remitentes-opciones
 */
router.get('/mensajes/remitentes-opciones', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;

    let sql = `SELECT DISTINCT m.remitente_id AS id,
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END AS nombre
       FROM mensajes m
       INNER JOIN usuarios u1 ON u1.id = m.remitente_id
       LEFT JOIN personal p ON p.id = u1.personal_id
       LEFT JOIN alumnos a ON a.id = u1.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u1.apoderado_id
       WHERE m.destinatario_id = ?
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`;
    const params = [usuario_id];
    if (anioFiltro) {
      sql += ` AND YEAR(m.fecha_hora) = ?`;
      params.push(anioFiltro);
    }
    sql += ` ORDER BY nombre ASC`;
    const rows = await query(sql, params);
    res.json({ opciones: (rows || []).map((r) => ({ id: r.id, nombre: r.nombre || 'Usuario' })) });
  } catch (error) {
    console.error('Error obteniendo remitentes-opciones (docente):', error);
    res.status(500).json({ error: 'Error al obtener opciones de remitentes' });
  }
});

/**
 * GET /api/docente/mensajes/destinatarios-opciones
 */
router.get('/mensajes/destinatarios-opciones', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;

    let sql = `SELECT DISTINCT m.destinatario_id AS id,
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END AS nombre
       FROM mensajes m
       INNER JOIN usuarios u2 ON u2.id = m.destinatario_id
       LEFT JOIN personal p ON p.id = u2.personal_id
       LEFT JOIN alumnos a ON a.id = u2.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u2.apoderado_id
       WHERE m.remitente_id = ?
         AND m.tipo = 'ENVIADO'
         AND m.borrado = 'NO'`;
    const params = [usuario_id];
    if (anioFiltro) {
      sql += ` AND YEAR(m.fecha_hora) = ?`;
      params.push(anioFiltro);
    }
    sql += ` ORDER BY nombre ASC`;
    const rows = await query(sql, params);
    res.json({ opciones: (rows || []).map((r) => ({ id: r.id, nombre: r.nombre || 'Usuario' })) });
  } catch (error) {
    console.error('Error obteniendo destinatarios-opciones (docente):', error);
    res.status(500).json({ error: 'Error al obtener opciones de destinatarios' });
  }
});

/**
 * GET /api/docente/mensajes/anios-disponibles
 * Obtener lista de años disponibles en mensajes (recibidos y enviados)
 */
router.get('/mensajes/anios-disponibles', async (req, res) => {
  try {
    const { usuario_id } = req.user;

    // Obtener años únicos de mensajes recibidos y enviados
    const aniosRecibidos = await query(
      `SELECT DISTINCT YEAR(fecha_hora) as anio
       FROM mensajes
       WHERE destinatario_id = ? 
         AND tipo = 'RECIBIDO'
         AND borrado = 'NO'
       ORDER BY anio DESC`,
      [usuario_id]
    );

    const aniosEnviados = await query(
      `SELECT DISTINCT YEAR(fecha_hora) as anio
       FROM mensajes
       WHERE remitente_id = ? 
         AND tipo = 'ENVIADO'
         AND borrado = 'NO'
       ORDER BY anio DESC`,
      [usuario_id]
    );

    // Combinar y obtener años únicos
    const todosAnios = new Set();
    aniosRecibidos.forEach(r => todosAnios.add(r.anio));
    aniosEnviados.forEach(r => todosAnios.add(r.anio));

    const aniosArray = Array.from(todosAnios).sort((a, b) => b - a);

    res.json({ anios: aniosArray });
  } catch (error) {
    console.error('Error obteniendo años disponibles:', error);
    res.status(500).json({ error: 'Error al obtener años disponibles' });
  }
});

/**
 * GET /api/docente/notificaciones
 * Obtener notificaciones (solo lectura, generadas por admin)
 */
router.get('/notificaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener notificaciones para el docente
    // NOTA: Las asistencias se guardan en asistencia_registros, pero las notificaciones
    // se crean automáticamente en la tabla notificaciones cuando se registra asistencia.
    // Aquí solo mostramos las notificaciones de la tabla notificaciones.
    const notificaciones = await query(
      `SELECT 
         n.id,
         n.asunto as titulo,
         n.contenido as mensaje,
         n.fecha_hora,
         n.estado,
         COALESCE(n.leida, 0) as leida,
         n.accion_tipo,
         n.accion_payload,
         n.url_destino,
         n.destinatario_id,
         'NOTIFICACION' as tipo_origen
       FROM notificaciones n
       WHERE (n.para = 'TODOS' OR (n.para = 'USUARIO' AND n.destinatario_id = ?))
       ORDER BY n.fecha_hora DESC
       LIMIT 30`,
      [usuario_id]
    );

    const parsePayloadDoc = (raw) => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    // Mapear campos para compatibilidad con el frontend (usar leida si existe, sino estado antiguo)
    const notificacionesMapeadas = (notificaciones || []).map(n => ({
      id: n.id,
      titulo: n.titulo || n.asunto || 'Notificación del sistema',
      mensaje: n.mensaje || n.contenido || '',
      fecha_hora: n.fecha_hora,
      estado: (n.leida === 1 || n.leida === true) ? 'LEIDO' : 'NO_LEIDO',
      tipo_origen: n.tipo_origen || 'NOTIFICACION',
      accion_tipo: n.accion_tipo || null,
      accion_payload: parsePayloadDoc(n.accion_payload),
      url_destino: n.url_destino || null,
      destinatario_id: n.destinatario_id
    }));

    res.json({ notificaciones: notificacionesMapeadas });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

/**
 * PUT /api/docente/notificaciones/:id/marcar-leido
 * Marcar notificación como leída
 */
router.put('/notificaciones/:id/marcar-leido', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario_id } = req.user;

    const notif = await query(
      `SELECT id FROM notificaciones 
       WHERE id = ? AND (para = 'TODOS' OR (para = 'USUARIO' AND destinatario_id = ?))`,
      [id, usuario_id]
    );
    if (notif.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    await execute(
      `UPDATE notificaciones SET leida = 1 WHERE id = ?`,
      [id]
    );
    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error marcando notificación como leída:', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

/**
 * Función auxiliar para decodificar imágenes de publicaciones
 * Las imágenes vienen como base64_encode(serialize(array)) desde PHP
 */
function decodePublicacionImages(imagesString) {
  if (!imagesString || imagesString === '') {
    return [];
  }

  try {
    // Decodificar base64
    const decoded = Buffer.from(imagesString, 'base64').toString('utf-8');
    
    // El formato serialize de PHP para arrays es: a:N:{i:key1;s:len:"value1";i:key2;s:len:"value2";}
    // Ejemplo: a:2:{i:0;s:25:"/Static/Image/Publicaciones/img1.jpg";i:1;s:25:"/Static/Image/Publicaciones/img2.jpg";}
    if (decoded.startsWith('a:')) {
      const imagenes = [];
      // Extraer todas las rutas de imágenes del formato serialize
      const regex = /s:\d+:"([^"]+)"/g;
      let match;
      while ((match = regex.exec(decoded)) !== null) {
        const ruta = match[1];
        // Convertir ruta relativa a URL completa
        if (ruta.startsWith('/Static/')) {
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction) {
            // Usar el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
            imagenes.push(`https://sistema.vanguardschools.edu.pe${ruta}`);
          } else {
            // En desarrollo, las imágenes están en el servidor PHP
            imagenes.push(`http://localhost:5000${ruta}`);
          }
        } else if (ruta.startsWith('/uploads/')) {
          // Rutas de uploads del backend Node.js
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction) {
            // Usar el dominio del nuevo sistema React
            const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
            imagenes.push(`${frontendUrl}${ruta}`);
          } else {
            imagenes.push(`http://localhost:5000${ruta}`);
          }
        } else {
          // Si ya es una URL completa, normalizarla
          if (ruta.startsWith('http')) {
            // Reemplazar dominio antiguo por el correcto
            let normalized = ruta.replace(/https?:\/\/vanguardschools\.edu\.pe\/Static/g, 'https://sistema.vanguardschools.edu.pe/Static');
            normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/uploads/g, (match) => {
              const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
              return match.replace('https://vanguardschools.edu.pe', frontendUrl);
            });
            imagenes.push(normalized);
        } else {
          // Si ya es una URL completa o ruta relativa, usarla tal cual
          imagenes.push(ruta);
          }
        }
      }
      return imagenes;
    } else {
      // Intentar como JSON (por si acaso)
      try {
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Si no es JSON, tratar como string simple
        return [imagesString];
      }
    }
  } catch (error) {
    console.warn('Error decodificando imágenes de publicación:', error);
    return [];
  }
}

function limpiarUrlVideoCandidata(url) {
  return String(url || '').trim().replace(/[),.;!?]+$/g, '');
}

function esVideoIdYouTubeValido(videoId) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(videoId || '').trim());
}

function extraerVideoIdYouTube(urlValue) {
  const raw = limpiarUrlVideoCandidata(urlValue);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return esVideoIdYouTubeValido(candidate) ? candidate : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const watchId = parsed.searchParams.get('v') || '';
      if (esVideoIdYouTubeValido(watchId)) {
        return watchId;
      }

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live', 'v'].includes(part));
      if (markerIndex >= 0) {
        const candidate = parts[markerIndex + 1] || '';
        return esVideoIdYouTubeValido(candidate) ? candidate : '';
      }
    }
  } catch (error) {
    return '';
  }

  return '';
}

function extraerVideoPublicacionDesdeContenido(contenido) {
  const urls = String(contenido || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const url of urls) {
    const videoId = extraerVideoIdYouTube(url);
    if (videoId) {
      return {
        tipo_video: 'YOUTUBE',
        video_id: videoId
      };
    }
  }

  return {
    tipo_video: '',
    video_id: ''
  };
}

/**
 * GET /api/docente/publicaciones
 * Obtener publicaciones (feed tipo Facebook)
 * Filtra publicaciones según grupos con asignatura o tutoría (unión, sin duplicar).
 */
router.get('/publicaciones', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    const esAdmin = esAdminPromotoriaOpsicologa(req.user.tipo);

    let gruposIds = [];
    if (!esAdmin && personalId) {
      gruposIds = await obtenerGruposIdsAlcancePublicaciones(colegio_id, anio_activo, personalId);
    }

    // Obtener TODAS las publicaciones del colegio (filtrar después en JavaScript)
    // Esto es más simple y eficiente que construir una consulta SQL compleja
    const todasPublicaciones = await query(
      `SELECT p.*, 
              u.usuario as autor_usuario,
              u.id as autor_id,
              u.tipo as autor_tipo,
              COALESCE(
                CONCAT(pers.nombres, ' ', pers.apellidos),
                CONCAT(al.nombres, ' ', al.apellido_paterno, ' ', al.apellido_materno),
                u.usuario
              ) as autor_nombre_completo,
              COALESCE(pers.foto, al.foto) as autor_foto
       FROM publicaciones p
       LEFT JOIN usuarios u ON u.id = p.usuario_id
       LEFT JOIN personal pers ON pers.id = u.personal_id
       LEFT JOIN alumnos al ON al.id = u.alumno_id
       WHERE p.colegio_id = ?
       ORDER BY p.fecha_hora DESC
       LIMIT 100`,
      [colegio_id]
    );

    // Filtrar publicaciones según privacidad y grupos del docente (admin/promotoría: ver todas, incl. -2)
    const publicaciones = esAdmin
      ? todasPublicaciones.slice(0, 100)
      : todasPublicaciones.filter(pub => {
      // Si es pública (TODOS, '', '-1', NULL), siempre mostrar
      if (!pub.privacidad || pub.privacidad === '' || pub.privacidad === 'TODOS' || pub.privacidad === '-1') {
        return true;
      }

      // Si es para personal administrativo (-2), no mostrar (solo para admin)
      if (pub.privacidad === '-2') {
        return false;
      }

      // Si tiene grupos específicos, verificar si el docente tiene acceso
      if (gruposIds.length > 0) {
        const grupoIdsPub = pub.privacidad.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
        // Si la publicación es para alguno de los grupos del docente, mostrarla
        return grupoIdsPub.some(id => gruposIds.includes(id));
      }

      // Si no tiene grupos y la publicación es para grupos específicos, no mostrar
      return false;
    }).slice(0, 50); // Limitar a 50 después del filtro

    // Obtener todos los grupos del colegio para mapear IDs a nombres
    const gruposMap = {};
    try {
      const grupos = await query(
        `SELECT g.id, n.nombre as nivel_nombre, g.grado, g.seccion
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.colegio_id = ?`,
        [colegio_id]
      );
      grupos.forEach(grupo => {
        gruposMap[grupo.id] = `${grupo.nivel_nombre} ${grupo.grado}° ${grupo.seccion}`;
      });
    } catch (error) {
      console.warn('Error obteniendo grupos para publicaciones:', error);
    }

    // Decodificar imágenes y archivos de cada publicación
    const publicacionesConImagenes = publicaciones.map(pub => {
      // Decodificar privacidad (puede ser "TODOS", "-1", "-2", o IDs de grupos separados por comas)
      let paraTexto = 'Todos';
      if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1') {
        if (pub.privacidad === '-2') {
          paraTexto = 'Personal Administrativo';
        } else {
          // Es una lista de IDs de grupos separados por comas
          const grupoIds = pub.privacidad.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
          if (grupoIds.length > 0) {
            // Obtener nombres de los grupos desde el mapa
            const nombresGrupos = grupoIds
              .map(id => gruposMap[id])
              .filter(nombre => nombre); // Filtrar grupos que no se encontraron
            
            if (nombresGrupos.length > 0) {
              if (nombresGrupos.length === 1) {
                paraTexto = nombresGrupos[0];
              } else {
                paraTexto = nombresGrupos.join(', ');
              }
            } else {
              paraTexto = grupoIds.length === 1 ? '1 Grupo' : `${grupoIds.length} Grupos`;
            }
          }
        }
      }

      // Decodificar archivos (similar a imágenes)
      let archivos = [];
      if (pub.archivos && pub.archivos !== '') {
        try {
          const decoded = Buffer.from(pub.archivos, 'base64').toString('utf-8');
          if (decoded.startsWith('a:')) {
            const regex = /s:\d+:"([^"]+)"/g;
            let match;
            while ((match = regex.exec(decoded)) !== null) {
              archivos.push(match[1]);
            }
          }
        } catch (e) {
          console.warn('Error decodificando archivos:', e);
        }
      }

      const imagenesDecodificadas = decodePublicacionImages(pub.images);
      console.log(`📰 Publicación ID ${pub.id}: ${imagenesDecodificadas.length} imagen(es) decodificada(s)`, imagenesDecodificadas);
      
      // Construir URL completa de la foto del autor
      let autorFotoUrl = null;
      if (pub.autor_foto && pub.autor_foto !== '') {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Si ya es una URL completa, usarla directamente
        if (pub.autor_foto.startsWith('http')) {
          autorFotoUrl = pub.autor_foto;
        } else if (pub.autor_foto.startsWith('/uploads/')) {
          // Si ya tiene la ruta /uploads/, construir URL completa
          if (isProduction) {
            const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
            autorFotoUrl = `${frontendUrl}${pub.autor_foto}`;
          } else {
            autorFotoUrl = `http://localhost:5000${pub.autor_foto}`;
          }
        } else {
          // Es solo el nombre del archivo, determinar si es personal o alumno según el tipo de usuario
          const esPersonal = pub.autor_tipo === 'DOCENTE' || pub.autor_tipo === 'DIRECTOR' || pub.autor_tipo === 'ADMINISTRADOR';
          
          if (isProduction) {
            // Usar el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
            autorFotoUrl = `https://sistema.vanguardschools.edu.pe/Static/Image/Fotos/${pub.autor_foto}`;
          } else {
            // En desarrollo, usar la ruta de uploads según el tipo
            const uploadPath = esPersonal ? 'uploads/personal' : 'uploads/alumnos';
            autorFotoUrl = `http://localhost:5000/${uploadPath}/${pub.autor_foto}`;
          }
        }
      }

      return {
        ...pub,
        images: imagenesDecodificadas,
        archivos: archivos,
        para_texto: paraTexto,
        autor_foto_url: autorFotoUrl
      };
    });

    res.json({ publicaciones: publicacionesConImagenes || [] });
  } catch (error) {
    console.error('Error obteniendo publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

/**
 * POST /api/docente/publicaciones
 * Crear publicación (tipo Facebook)
 */
// Configurar multer para aceptar tanto imágenes como archivos
// Guardar directamente en /Static/ del sistema PHP (compartido con ambos sistemas)
const uploadPublicacionesCompleto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
      if (isImage) {
        // Guardar en Static/Image/Publicaciones/ del sistema PHP
        const uploadPath = '/home/vanguard/intranet2026/backend/Static/Image/Publicaciones';
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      } else {
        // Guardar en Static/Archivos/ del sistema PHP
        const uploadPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      }
    },
    filename: (req, file, cb) => {
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      if (isImage) {
        cb(null, `publicacion-${uniqueSuffix}${path.extname(file.originalname)}`);
      } else {
        cb(null, `archivo-${uniqueSuffix}${path.extname(file.originalname)}`);
      }
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Permitir imágenes y archivos
    const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
    const isFile = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/i.test(path.extname(file.originalname));
    
    if (isImage || isFile) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

router.post('/publicaciones', uploadPublicacionesCompleto.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'archivo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { contenido, compartir_con, grupos_ids } = req.body; // compartir_con: 'todos' o 'grupos', grupos_ids: array de IDs

    if (!contenido) {
      return res.status(400).json({ error: 'El contenido es requerido' });
    }

    let imagenPath = '';
    if (req.files && req.files.imagen && req.files.imagen[0]) {
      // Guardar ruta como /Static/Image/Publicaciones/ (compartido con sistema PHP)
      imagenPath = `/Static/Image/Publicaciones/${req.files.imagen[0].filename}`;
    }

    let archivoPath = '';
    if (req.files && req.files.archivo && req.files.archivo[0]) {
      // Verificar si el archivo es realmente un archivo (no imagen)
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(req.files.archivo[0].originalname)) || 
                      req.files.archivo[0].mimetype.startsWith('image/');
      if (!isImage) {
        // IMPORTANTE: Guardar solo el nombre del archivo (como el sistema PHP)
        // El sistema PHP guarda solo el nombre, no la ruta completa
        archivoPath = req.files.archivo[0].filename;
        
        // Verificar que el archivo se guardó correctamente
        const archivoCompleto = path.join('/home/vanguard/intranet2026/backend/Static/Archivos', archivoPath);
        if (fs.existsSync(archivoCompleto)) {
          const stats = fs.statSync(archivoCompleto);
          console.log('✅ Archivo guardado correctamente:', {
            nombre: archivoPath,
            tamaño: stats.size,
            ruta: archivoCompleto
          });
        } else {
          console.error('❌ Error: Archivo no encontrado después de guardar:', archivoCompleto);
        }
      } else {
        // Si es una imagen pero viene en el campo "archivo", tratarla como imagen
        if (!imagenPath) {
          imagenPath = `/Static/Image/Publicaciones/${req.files.archivo[0].filename}`;
        }
      }
    }

    // Preparar privacidad según compartir_con
    let privacidad = '-1'; // -1 = Todos por defecto
    let gruposArrayParsed = null;
    if (compartir_con === 'grupos' && grupos_ids) {
      gruposArrayParsed = typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids;
      if (Array.isArray(gruposArrayParsed) && gruposArrayParsed.length > 0) {
        privacidad = gruposArrayParsed.join(',');
      }
    }

    // Validar grupos permitidos (misma regla que alcance publicaciones: solo asignaturas si tiene; si no, tutoría)
    const personalIdPub = req.user.personal_id;
    const anioActivoPub = req.user.anio_activo;
    if (
      compartir_con === 'grupos' &&
      Array.isArray(gruposArrayParsed) &&
      gruposArrayParsed.length > 0 &&
      personalIdPub &&
      anioActivoPub &&
      !esAdminPromotoriaOpsicologa(req.user.tipo)
    ) {
      const permitidos = await obtenerGruposIdsAlcancePublicaciones(colegio_id, anioActivoPub, personalIdPub);
      const permitidosSet = new Set(permitidos.map((id) => Number(id)));
      const invalido = gruposArrayParsed.some((id) => !permitidosSet.has(Number(id)));
      if (invalido) {
        return res.status(403).json({
          error: 'No tiene permiso para publicar en uno o más de los grupos seleccionados'
        });
      }
    }

    // Preparar imágenes (serializar como PHP: base64_encode(serialize(array)))
    // IMPORTANTE: Usar php-serialize para garantizar formato EXACTO igual al sistema PHP
    const phpSerialize = require('php-serialize');
    let imagesSerialized = '';
    if (imagenPath) {
      console.log('📸 Guardando imagen:', imagenPath);
      const imagesArray = [imagenPath];
      // Usar php-serialize para serializar exactamente como PHP
      const serialized = phpSerialize.serialize(imagesArray);
      imagesSerialized = Buffer.from(serialized).toString('base64');
      console.log('✅ Imagen serializada:', {
        ruta: imagenPath,
        serializado: serialized.substring(0, 100) + '...',
        base64: imagesSerialized.substring(0, 50) + '...'
      });
    } else {
      console.log('⚠️ No hay imagen para guardar');
    }

    // Preparar archivos (serializar como PHP: base64_encode(serialize(array)))
    // IMPORTANTE: Usar php-serialize para garantizar formato EXACTO igual al sistema PHP
    let archivosSerialized = '';
    if (archivoPath) {
      const archivosArray = [archivoPath];
      // Usar php-serialize para serializar exactamente como PHP
      const serialized = phpSerialize.serialize(archivosArray);
      archivosSerialized = Buffer.from(serialized).toString('base64');
    }

    const videoPublicacion = extraerVideoPublicacionDesdeContenido(contenido);

    // Insertar publicación en MySQL
    // La tabla publicaciones tiene: id, colegio_id, usuario_id, contenido, tipo_video, video_id, images, archivos, privacidad, fecha_hora
    const fechaHora = fechaHoraMySQLLima();
    const result = await execute(
      `INSERT INTO publicaciones 
       (colegio_id, usuario_id, contenido, tipo_video, video_id, images, archivos, privacidad, fecha_hora)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuario_id,
        contenido,
        videoPublicacion.tipo_video,
        videoPublicacion.video_id,
        imagesSerialized,
        archivosSerialized,
        privacidad,
        fechaHora
      ]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'PUBLICACIONES',
      entidad: 'publicacion',
      entidad_id: result.insertId,
      descripcion: `Creó publicación ID: ${result.insertId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({
        contenido,
        compartir_con,
        grupos_ids,
        imagen: imagenPath,
        archivo: archivoPath,
        tipo_video: videoPublicacion.tipo_video,
        video_id: videoPublicacion.video_id
      }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Guardar el ID de la publicación para usar en notificaciones
    const publicacionId = result.insertId;

    // ========== CREAR NOTIFICACIONES PARA LA PUBLICACIÓN ==========
    // Hacer esto de forma asíncrona para no bloquear la respuesta
    setImmediate(async () => {
      try {
        console.log('📢 [PUBLICACIONES] Iniciando creación de notificaciones...');

        const colegioRow = await query('SELECT nombre FROM colegios WHERE id = ? LIMIT 1', [colegio_id]);
        const colegioNombre = colegioRow.length ? colegioRow[0].nombre : 'Vanguard Schools';
        
        // Obtener nombre del docente que crea la publicación
        const docenteInfo = await query(
          `SELECT CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo
           FROM personal p
           INNER JOIN usuarios u ON u.personal_id = p.id
           WHERE u.id = ? AND u.colegio_id = ? LIMIT 1`,
          [usuario_id, colegio_id]
        );
        
        const nombreDocente = docenteInfo.length > 0 ? docenteInfo[0].nombre_completo : 'Un docente';
        
        // Preparar título y mensaje de la notificación
        const tituloNotificacion = 'Nueva Publicación';
        // Limpiar HTML del contenido para el mensaje (solo primeros 200 caracteres)
        const contenidoLimpio = contenido.replace(/<[^>]*>/g, '').trim();
        const mensajeCorto = contenidoLimpio.length > 200 
          ? contenidoLimpio.substring(0, 200) + '...' 
          : contenidoLimpio;
        const mensajeNotificacion = `${nombreDocente} ha publicado: "${mensajeCorto}"`;

        let destinatarios = [];

        if (compartir_con === 'todos') {
          // Obtener TODOS los usuarios activos del colegio
          console.log('📢 [PUBLICACIONES] Creando notificaciones para TODOS los usuarios');
          
          const todosUsuarios = await query(
            `SELECT DISTINCT u.id, u.tipo
             FROM usuarios u
             WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'`,
            [colegio_id]
          );
          
          destinatarios = todosUsuarios.map(u => ({
            usuario_id: u.id,
            tipo: u.tipo
          }));
          
          console.log(`📢 [PUBLICACIONES] Encontrados ${destinatarios.length} usuarios para notificar (TODOS)`);
        } else if (compartir_con === 'grupos' && grupos_ids) {
          // Obtener destinatarios de los grupos específicos
          console.log('📢 [PUBLICACIONES] Creando notificaciones para grupos específicos');
          
          const gruposArray = typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids;
          
          if (gruposArray.length > 0) {
            // 1. Obtener alumnos de los grupos
            const alumnosGrupos = await query(
              `SELECT DISTINCT u.id, u.tipo, a.id as alumno_id
               FROM alumnos a
               INNER JOIN matriculas m ON m.alumno_id = a.id
               INNER JOIN usuarios u ON u.alumno_id = a.id
               WHERE m.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                 AND m.colegio_id = ?
                 AND (m.estado = 0)
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [...gruposArray, colegio_id, colegio_id]
            );
            
            // 2. Obtener apoderados de esos alumnos
            const alumnoIds = alumnosGrupos.map(a => a.alumno_id);
            let apoderadosIds = [];
            if (alumnoIds.length > 0) {
              const apoderadosData = await query(
                `SELECT DISTINCT u.id, u.tipo, ap.nro_documento
                 FROM apoderados ap
                 INNER JOIN familias f ON f.apoderado_id = ap.id
                 INNER JOIN usuarios u ON u.apoderado_id = ap.id
                 WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                   AND ap.colegio_id = ?
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'`,
                [...alumnoIds, colegio_id, colegio_id]
              );
              apoderadosIds = apoderadosData.map(a => ({ usuario_id: a.id, tipo: a.tipo }));
              
              // Obtener DNI de apoderados para buscar docentes-apoderados
              const apoderadoDnis = apoderadosData.map(a => a.nro_documento).filter(dni => dni);
              
              if (apoderadoDnis.length > 0) {
                // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
                const docentesApoderados = await query(
                  `SELECT DISTINCT u.id, u.tipo
                   FROM usuarios u
                   INNER JOIN personal p ON p.id = u.personal_id
                   WHERE u.colegio_id = ? 
                     AND u.estado = 'ACTIVO'
                     AND u.tipo = 'DOCENTE'
                     AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                          OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                     AND u.id NOT IN (${[...alumnosGrupos.map(a => a.id), ...apoderadosIds.map(a => a.usuario_id)].map(() => '?').join(',')})`, // Evitar duplicados
                  [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnosGrupos.map(a => a.id), ...apoderadosIds.map(a => a.usuario_id)]
                );
                
                const docentesApoderadosIds = docentesApoderados.map(d => ({ usuario_id: d.id, tipo: d.tipo }));
                apoderadosIds = [...apoderadosIds, ...docentesApoderadosIds];
                
                if (docentesApoderadosIds.length > 0) {
                  console.log(`📢 [PUBLICACIONES] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
                }
              }
            }
            
            // 3. Obtener docentes que enseñan en esos grupos (a través de asignaturas)
            const docentesGrupos = await query(
              `SELECT DISTINCT u.id, u.tipo
               FROM asignaturas a
               INNER JOIN usuarios u ON u.personal_id = a.personal_id
               WHERE a.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                 AND a.colegio_id = ?
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [...gruposArray, colegio_id, colegio_id]
            );
            
            // Combinar todos los destinatarios
            destinatarios = [
              ...alumnosGrupos.map(a => ({ usuario_id: a.id, tipo: a.tipo })),
              ...apoderadosIds,
              ...docentesGrupos.map(d => ({ usuario_id: d.id, tipo: d.tipo }))
            ];
            
            // Eliminar duplicados
            const uniqueDestinatarios = [];
            const seenIds = new Set();
            for (const dest of destinatarios) {
              if (!seenIds.has(dest.usuario_id)) {
                seenIds.add(dest.usuario_id);
                uniqueDestinatarios.push(dest);
              }
            }
            destinatarios = uniqueDestinatarios;
            
            console.log(`📢 [PUBLICACIONES] Encontrados ${destinatarios.length} usuarios para notificar (grupos: ${gruposArray.join(', ')})`);
          }
        }

        // Todos los usuarios ADMINISTRADOR del colegio reciben la notificación de nueva publicación
        // (incluido cuando el post es solo a grupos específicos; se deduplica por id)
        try {
          const adminsColegio = await query(
            `SELECT u.id, u.tipo FROM usuarios u
             WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'ADMINISTRADOR'`,
            [colegio_id]
          );
          const idsYa = new Set(destinatarios.map((d) => d.usuario_id));
          for (const row of adminsColegio || []) {
            if (!idsYa.has(row.id)) {
              idsYa.add(row.id);
              destinatarios.push({ usuario_id: row.id, tipo: 'ADMINISTRADOR' });
            }
          }
        } catch (eAdm) {
          console.warn('📢 [PUBLICACIONES] No se pudieron añadir destinatarios ADMINISTRADOR:', eAdm?.message);
        }

        // Crear notificaciones en la BD para cada destinatario
        if (destinatarios.length > 0) {
          console.log(`📢 [PUBLICACIONES] Creando ${destinatarios.length} notificaciones en la BD...`);
          
          for (const destinatario of destinatarios) {
            try {
              const urlPub = urlPublicacionPorTipoUsuario(destinatario.tipo);
              await insertNotificacionUsuario(execute, {
                usuario_id,
                destinatario_id: destinatario.usuario_id,
                asunto: tituloNotificacion,
                contenido: mensajeNotificacion,
                estado: 'NO ENVIADO',
                accion_tipo: 'publicacion',
                accion_payload: { publicacion_id: publicacionId },
                url_destino: urlPub
              });
            } catch (error) {
              console.error(`❌ [PUBLICACIONES] Error creando notificación para usuario ${destinatario.usuario_id}:`, error);
            }
          }
          
          console.log(`✅ [PUBLICACIONES] ${destinatarios.length} notificaciones creadas exitosamente`);
          
          // ========== ENVIAR PUSH NOTIFICATIONS ==========
          try {
            // Obtener suscripciones push de todos los destinatarios
            const usuarioIds = destinatarios.map(d => d.usuario_id);
            
            if (usuarioIds.length > 0) {
              const tipoPorUsuario = new Map(
                destinatarios.map((d) => [d.usuario_id, d.tipo])
              );
              const subscriptionsData = await query(
                `SELECT usuario_id, endpoint, p256dh, auth 
                 FROM push_subscriptions 
                 WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')}) 
                   AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
                [...usuarioIds, colegio_id]
              );
              
              // NOTA: Los docentes-apoderados ya están incluidos en 'destinatarios' desde la sección anterior,
              // por lo que no es necesario buscarlos nuevamente aquí para evitar duplicados.
              // Esta sección solo se mantiene para compatibilidad con código anterior, pero ya no es necesaria.
              
              if (subscriptionsData.length > 0) {
                const pushItems = subscriptionsData.map((sub) => {
                  const tipoU = tipoPorUsuario.get(sub.usuario_id) || 'DOCENTE';
                  const urlPush = urlPublicacionPorTipoUsuario(tipoU);
                  return {
                    subscription: {
                      endpoint: sub.endpoint,
                      keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    payload: {
                      title: tituloNotificacion,
                      body: mensajeNotificacion,
                      icon: '/icons/icon-192x192.png',
                      badge: '/icons/icon-192x192.png',
                      vibrate: [200, 100, 200],
                      tag: `publicacion-${publicacionId}`,
                      data: {
                        url: urlPush,
                        tipo: 'publicacion',
                        publicacion_id: publicacionId
                      }
                    }
                  };
                });
                
                console.log(`📱 [PUBLICACIONES] Enviando ${pushItems.length} push notifications...`);
                
                enviarPushNotificacionesIndividuales(pushItems)
                  .then(async (resultadosPush) => {
                    const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                    const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                    console.log(`✅ [PUBLICACIONES] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
                    if (fallidas > 0) {
                      console.log(`❌ [PUBLICACIONES] Errores en push notifications:`,
                        resultadosPush.filter(r => !r.resultado || !r.resultado.success).map(r => r.resultado?.error || 'Error desconocido')
                      );
                    }
                    const expiradas = resultadosPush.filter(r => r.resultado && r.resultado.expired && r.subscription?.endpoint);
                    for (const { subscription } of expiradas) {
                      try {
                        await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [subscription.endpoint]);
                      } catch (e) {
                        console.warn('❌ [PUBLICACIONES] Error marcando suscripción inactiva:', e.message);
                      }
                    }
                    if (expiradas.length > 0) {
                      console.log(`📱 [PUBLICACIONES] ${expiradas.length} suscripción(es) marcadas inactivas (410)`);
                    }
                  })
                  .catch(err => {
                    console.error(`❌ [PUBLICACIONES] Error en envío de push notifications:`, err);
                  });
              } else {
                console.log('⚠️ [PUBLICACIONES] No hay suscripciones push activas para enviar notificaciones');
              }

              // ========== ENVIAR CORREOS (solo apoderados y docentes-apoderados) con cuenta PUBLICACIONES ==========
              const destinatariosCorreo = destinatarios.filter(d => d.tipo === 'APODERADO' || d.tipo === 'DOCENTE');
              if (destinatariosCorreo.length > 0 && isEmailEnvioHabilitado()) {
                let enviadosCorreo = 0;
                for (const dest of destinatariosCorreo) {
                  let email = null;
                  if (dest.tipo === 'APODERADO') {
                    const ap = await query(
                      `SELECT ap.email FROM apoderados ap INNER JOIN usuarios u ON u.apoderado_id = ap.id WHERE u.id = ? AND ap.email IS NOT NULL AND ap.email != '' LIMIT 1`,
                      [dest.usuario_id]
                    );
                    email = ap.length ? ap[0].email : null;
                  } else if (dest.tipo === 'DOCENTE') {
                    const per = await query(
                      `SELECT p.email FROM personal p INNER JOIN usuarios u ON u.personal_id = p.id WHERE u.id = ? AND p.email IS NOT NULL AND p.email != '' LIMIT 1`,
                      [dest.usuario_id]
                    );
                    email = per.length ? per[0].email : null;
                  }
                  if (email) {
                    try {
                      const res = await enviarCorreoNotificacion(email, tituloNotificacion, mensajeNotificacion, colegioNombre, 'PUBLICACIONES');
                      if (res.success) enviadosCorreo++;
                    } catch (e) {
                      console.warn(`❌ [PUBLICACIONES] Error enviando correo a ${email}:`, e.message);
                    }
                  }
                }
                if (enviadosCorreo > 0) {
                  console.log(`📧 [PUBLICACIONES] Correos enviados: ${enviadosCorreo}/${destinatariosCorreo.length}`);
                }
              }
            }
          } catch (error) {
            console.error('❌ [PUBLICACIONES] Error enviando push notifications:', error);
            // No fallar el proceso si hay error en push notifications
          }
        } else {
          console.log('⚠️ [PUBLICACIONES] No se encontraron destinatarios para notificar');
        }
      } catch (error) {
        console.error('❌ [PUBLICACIONES] Error en proceso de notificaciones:', error);
        console.error('❌ [PUBLICACIONES] Stack:', error.stack);
      }
    });

    res.json({
      success: true,
      message: 'Publicación creada correctamente',
      publicacion: {
        id: result.insertId,
        contenido,
        compartir_con,
        grupos_ids: grupos_ids ? (typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids) : [],
        imagen: imagenPath,
        archivo: archivoPath
      }
    });
  } catch (error) {
    console.error('Error creando publicación:', error);
    res.status(500).json({ error: 'Error al crear publicación' });
  }
});

/**
 * DELETE /api/docente/publicaciones/:publicacionId
 * Eliminar publicación (autor o administrador/promotoría)
 */
router.delete('/publicaciones/:publicacionId', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { publicacionId } = req.params;
    const esAdmin = esAdminPromotoriaOpsicologa(req.user.tipo);

    // Verificar que la publicación existe y, si no es admin, que pertenece al usuario
    const publicaciones = await query(
      `SELECT p.* FROM publicaciones p
       WHERE p.id = ? AND p.colegio_id = ?`,
      [publicacionId, colegio_id]
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }

    if (!esAdmin && parseInt(publicaciones[0].usuario_id, 10) !== parseInt(usuario_id, 10)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta publicación' });
    }

    const publicacion = publicaciones[0];

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'PUBLICACIONES',
      entidad: 'publicacion',
      entidad_id: parseInt(publicacionId),
      descripcion: `Eliminó publicación ID: ${publicacionId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(publicacion),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar publicación de MySQL
    if (esAdmin) {
      await execute(
        `DELETE FROM publicaciones WHERE id = ? AND colegio_id = ?`,
        [publicacionId, colegio_id]
      );
    } else {
      await execute(
        `DELETE FROM publicaciones WHERE id = ? AND usuario_id = ? AND colegio_id = ?`,
        [publicacionId, usuario_id, colegio_id]
      );
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Publicación eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando publicación:', error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

/**
 * ============================================
 * AULA VIRTUAL - ENDPOINTS
 * ============================================
 */

/**
 * GET /api/docente/aula-virtual/config
 * Obtener configuración del aula virtual (total_notas del colegio)
 */
router.get('/aula-virtual/config', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    
    const colegio = await query(
      `SELECT total_notas FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    if (colegio.length === 0) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    res.json({ 
      total_notas: colegio[0].total_notas || 4 // Por defecto 4 bimestres
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

/**
 * GET /api/docente/aula-virtual/temas
 * Obtener temas de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/temas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener temas de la asignatura (asignaturas_temas NO tiene ciclo, se muestra todos)
    const temas = await query(
      `SELECT * FROM asignaturas_temas
       WHERE asignatura_id = ?
       ORDER BY fecha DESC, id DESC`,
      [asignatura_id]
    );

    res.json({ temas: temas || [] });
  } catch (error) {
    console.error('Error obteniendo temas:', error);
    res.status(500).json({ error: 'Error al obtener temas' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas
 * Obtener tareas de una asignatura (filtradas por ciclo/bimestre)
 */
router.get('/aula-virtual/tareas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener tareas de la asignatura filtradas por ciclo con información del docente
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.asignatura_id = ? AND t.ciclo = ?
       ORDER BY t.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Obtener archivos de cada tarea y construir URLs
    const isProduction = process.env.NODE_ENV === 'production';
    const tareasConArchivos = await Promise.all(tareas.map(async (tarea) => {
      // Obtener archivos de la tarea desde asignaturas_tareas_archivos
      const archivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );

      // Construir URLs para los archivos (usando PHP_SYSTEM_URL para compatibilidad con sistema anterior)
      // IMPORTANTE: El sistema PHP guarda solo el nombre del archivo en la BD
      // Debemos construir la URL completa agregando /Static/Archivos/ al inicio
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const archivosConUrls = archivos.map(archivo => {
        let archivoUrl = null;
        if (archivo.archivo && archivo.archivo !== '') {
          if (archivo.archivo.startsWith('http')) {
            // Ya es una URL completa, validar y corregir dominio si es necesario
            archivoUrl = archivo.archivo
              .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl)
              .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
              .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
              .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
          } else if (archivo.archivo.startsWith('/Static/')) {
            // Ruta completa con /Static/ (formato antiguo de nuestro sistema, corregir)
            // Extraer solo el nombre del archivo y construir URL correcta
            const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
              : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
            console.log('📄 [AULA VIRTUAL TAREA] Corrigiendo ruta duplicada:', {
              id: archivo.id,
              ruta_original: archivo.archivo,
              nombre_extraido: nombreArchivo,
              url_final: archivoUrl
            });
          } else if (archivo.archivo.startsWith('/uploads/')) {
            // Ruta relativa desde /uploads/ (formato antiguo, migrar a /Static/Archivos/)
            archivoUrl = isDevelopment
              ? `http://localhost:5000${archivo.archivo}`
              : `${phpSystemUrl}${archivo.archivo}`;
          } else {
            // Solo el nombre del archivo (formato correcto del sistema PHP)
            // Construir URL completa agregando /Static/Archivos/
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
              : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
          }
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });

      return {
        ...tarea,
        archivos: archivosConUrls,
        enlace_url: tarea.enlace || null
      };
    }));

    res.json({ tareas: tareasConArchivos || [] });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

/**
 * GET /api/docente/aula-virtual/sesiones
 * Obtener sesiones de una asignatura (filtradas por ciclo) - solo DOCENTE y ADMIN
 */
router.get('/aula-virtual/sesiones', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const sesiones = await query(
      `SELECT s.*, aa.nombre as tema_nombre
       FROM asignaturas_sesion_pdf s
       INNER JOIN asignaturas_archivos aa ON aa.id = s.tema_id
       WHERE s.asignatura_id = ? AND s.ciclo = ?
       ORDER BY s.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const sesionesConUrls = sesiones.map(s => {
      let archivoUrl = null;
      if (s.archivo && s.archivo !== '') {
        const nombre = s.archivo.startsWith('/Static/Archivos/') ? s.archivo.replace(/^\/Static\/Archivos\//, '') : s.archivo;
        archivoUrl = isDevelopment ? `http://localhost:5000/Static/Archivos/${nombre}` : `${phpSystemUrl}/Static/Archivos/${nombre}`;
      }
      return { ...s, archivo_url: archivoUrl };
    });

    res.json({ sesiones: sesionesConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo sesiones:', error);
    res.status(500).json({ error: 'Error al obtener sesiones' });
  }
});

/**
 * POST /api/docente/aula-virtual/sesiones
 * Crear una nueva sesión (tema + archivo PDF)
 */
router.post('/aula-virtual/sesiones', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, tema_id, descripcion, ciclo } = req.body;

    if (!asignatura_id || !tema_id || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, tema_id y ciclo son requeridos' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaAcceso);

    const tema = await query(`SELECT * FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`, [tema_id, asignatura_id]);
    if (tema.length === 0) {
      return res.status(400).json({ error: 'Tema no encontrado' });
    }

    const titulo = `SESION - ${tema[0].nombre}`;
    const archivoPath = req.file.filename;
    const fechaHora = fechaHoraMySQLLima();

    await execute(
      `INSERT INTO asignaturas_sesion_pdf (asignatura_id, tema_id, titulo, descripcion, archivo, ciclo, trabajador_id, fecha_hora, colegio_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asignatura_id, tema_id, titulo, descripcion || '', archivoPath, parseInt(ciclo), trabajadorId, fechaHora, colegio_id]
    );

    res.json({ success: true, message: 'Sesión creada correctamente' });
  } catch (error) {
    console.error('Error creando sesión:', error);
    res.status(500).json({ error: 'Error al crear sesión' });
  }
});

/**
 * PUT /api/docente/aula-virtual/sesiones/:id
 * Actualizar una sesión (tema, descripcion, archivo opcional)
 */
router.put('/aula-virtual/sesiones/:id', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tema_id, descripcion, ciclo } = req.body;

    const sesionRow = await verificarAccesoSesion(req, res, id, 's.*');
    if (!sesionRow) return;

    const asignatura_id = sesionRow.asignatura_id;
    if (!tema_id || !ciclo) {
      return res.status(400).json({ error: 'tema_id y ciclo son requeridos' });
    }

    const tema = await query(`SELECT * FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`, [tema_id, asignatura_id]);
    if (tema.length === 0) {
      return res.status(400).json({ error: 'Tema no encontrado' });
    }

    const titulo = `SESION - ${tema[0].nombre}`;
    let archivoPath = sesionRow.archivo;
    if (req.file) {
      archivoPath = req.file.filename;
    }

    await execute(
      `UPDATE asignaturas_sesion_pdf SET tema_id = ?, titulo = ?, descripcion = ?, archivo = ?, ciclo = ? WHERE id = ?`,
      [tema_id, titulo, descripcion || '', archivoPath, parseInt(ciclo), id]
    );

    res.json({ success: true, message: 'Sesión actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizando sesión:', error);
    res.status(500).json({ error: 'Error al actualizar sesión' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/sesiones/:id
 * Eliminar una sesión
 */
router.delete('/aula-virtual/sesiones/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sesionRow = await verificarAccesoSesion(req, res, id, 's.id');
    if (!sesionRow) return;

    await execute(`DELETE FROM asignaturas_sesion_pdf WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Sesión eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando sesión:', error);
    res.status(500).json({ error: 'Error al eliminar sesión' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas
 * Crear una nueva tarea
 */
router.post('/aula-virtual/tareas', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, titulo, descripcion, fecha_entrega, ciclo, enlace } = req.body;

    if (!asignatura_id || !titulo || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, titulo y ciclo son requeridos' });
    }

    // Vacío = proyecto sin plazo (solo material; sin 0 automático). Con fecha = flujo actual.
    const fechaEntregaNormalizada = (() => {
      const s = String(fecha_entrega || '').trim();
      if (!s || s === 'null' || s === 'undefined') return null;
      return s.slice(0, 10);
    })();

    if (!req.file && !enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaAcceso);

    // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
    // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
    // Si guardamos la ruta completa, se duplicaría: /Static/Archivos//Static/Archivos/...
    let archivoPath = '';
    if (req.file) {
      // Guardar solo el nombre del archivo (igual que el sistema PHP)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TAREA] Archivo guardado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Preparar datos para auditoría
    const datosNuevos = { titulo, descripcion, fecha_entrega: fechaEntregaNormalizada, ciclo, archivo: archivoPath, enlace };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = fechaMySQLLima(ahora);
    const hora = horaMySQLLima(ahora);
    const fechaHoraAud = fechaHoraMySQLLima(ahora);

    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'tarea',
        null, // Temporalmente null, se actualizará después
        `Creó tarea: "${titulo}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        fechaHoraAud,
        fecha,
        hora,
      ]
    );

    // Insertar la nueva tarea
    const fechaHora = fechaHoraMySQLLima(ahora);
    const result = await execute(
      `INSERT INTO asignaturas_tareas 
       (titulo, descripcion, fecha_hora, fecha_entrega, trabajador_id, asignatura_id, entregas, visto, archivos, ciclo, enlace)
       VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?, ?)`,
      [
        titulo,
        descripcion || '',
        fechaHora,
        fechaEntregaNormalizada,
        trabajadorId,
        asignatura_id,
        parseInt(ciclo),
        enlace || ''
      ]
    );

    // Actualizar auditoría con el ID de la tarea
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Si hay archivo, insertarlo en asignaturas_tareas_archivos (igual que en Temas)
    if (req.file && archivoPath) {
      await execute(
        `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
         VALUES (?, ?, ?)`,
        [result.insertId, req.file.originalname, archivoPath]
      );
      console.log('📄 [AULA VIRTUAL TAREA] Archivo insertado en BD:', {
        tarea_id: result.insertId,
        nombre: req.file.originalname,
        archivo: archivoPath
      });
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'tarea',
        nombre: titulo,
        usuario_id,
        colegio_id,
        anio_activo,
        fecha_entrega: fechaEntregaNormalizada,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      message: 'Tarea creada correctamente',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: 'Error al crear la tarea' });
  }
});

/**
 * PUT /api/docente/aula-virtual/tareas/:id
 * Actualizar una tarea
 */
router.put('/aula-virtual/tareas/:id', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { id } = req.params;
    const { asignatura_id, titulo, descripcion, fecha_entrega, ciclo, enlace } = req.body;

    if (!titulo || !ciclo) {
      return res.status(400).json({ error: 'titulo y ciclo son requeridos' });
    }

    const fechaEntregaNormalizada = (() => {
      const s = String(fecha_entrega || '').trim();
      if (!s || s === 'null' || s === 'undefined') return null;
      return s.slice(0, 10);
    })();

    const tareaActual = await verificarAccesoTarea(req, res, id, 't.*');
    if (!tareaActual) return;
    let archivoPath = null;

    // Si se subió un nuevo archivo, actualizar (guardar solo el nombre del archivo, como el sistema PHP)
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TAREA] Archivo actualizado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Si no hay archivo nuevo y no hay enlace, verificar que haya al menos uno existente
    if (!req.file && !enlace) {
      // Verificar si hay archivos existentes
      const archivosExistentes = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [id]
      );
      if (archivosExistentes.length === 0 && !tareaActual.enlace) {
        return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
      }
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { titulo, descripcion, fecha_entrega: fechaEntregaNormalizada, ciclo, archivo: archivoPath, enlace };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea',
      entidad_id: parseInt(id),
      descripcion: `Editó tarea: "${tareaActual.titulo}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(tareaActual),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar la tarea
    await execute(
      `UPDATE asignaturas_tareas 
       SET titulo = ?, descripcion = ?, fecha_entrega = ?, ciclo = ?, enlace = ?
       WHERE id = ?`,
      [
        titulo,
        descripcion || '',
        fechaEntregaNormalizada,
        parseInt(ciclo),
        enlace || '',
        id
      ]
    );

    // Si hay archivo nuevo, actualizar o insertar en asignaturas_tareas_archivos
    if (req.file && archivoPath) {
      // Eliminar archivos antiguos de esta tarea
      await execute(
        `DELETE FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [id]
      );
      
      // Insertar el nuevo archivo
      await execute(
        `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
         VALUES (?, ?, ?)`,
        [id, req.file.originalname, archivoPath]
      );
      console.log('📄 [AULA VIRTUAL TAREA] Archivo actualizado en BD:', {
        tarea_id: id,
        nombre: req.file.originalname,
        archivo: archivoPath
      });
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tarea actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizando tarea:', error);
    res.status(500).json({ error: 'Error al actualizar la tarea' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/tareas/:id
 * Eliminar una tarea
 */
router.delete('/aula-virtual/tareas/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { id } = req.params;

    const tareaActual = await verificarAccesoTarea(req, res, id, 't.*');
    if (!tareaActual) return;

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea',
      entidad_id: parseInt(id),
      descripcion: `Eliminó tarea: "${tareaActual.titulo}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(tareaActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar archivos asociados primero
    await execute(
      `DELETE FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
      [id]
    );

    // Eliminar la tarea
    await execute(
      `DELETE FROM asignaturas_tareas WHERE id = ?`,
      [id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando tarea:', error);
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas/:tareaId/entregas
 * Obtener lista de alumnos con entregas, visto, y notas para una tarea
 */
router.get('/aula-virtual/tareas/:tareaId/entregas', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { tareaId } = req.params;

    const tareaInfo = await verificarAccesoTarea(
      req,
      res,
      tareaId,
      `t.*, a.grupo_id, g.grado, g.seccion, g.id as grupo_id_real, c.nombre as curso_nombre,
       n.nota_minima, n.nota_maxima, n.tipo_calificacion, n.nombre as nivel_nombre`,
      'Tarea no encontrada o sin permisos',
      404,
      ` INNER JOIN cursos c ON c.id = a.curso_id
        INNER JOIN niveles n ON n.id = g.nivel_id`
    );
    if (!tareaInfo) return;

    const grupoId = tareaInfo.grupo_id_real || tareaInfo.grupo_id;

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener entregas de alumnos (URLs que subieron)
    const entregas = await query(
      `SELECT * FROM asignaturas_tareas_entregas
       WHERE tarea_id = ? AND tipo = 'ALUMNO'
       ORDER BY fecha_hora DESC`,
      [tareaId]
    );

    // Obtener notas de alumnos
    const notas = await query(
      `SELECT * FROM asignaturas_tareas_notas
       WHERE tarea_id = ?`,
      [tareaId]
    );

    // Deserializar campo "visto" (formato PHP serialized)
    // IMPORTANTE: El sistema PHP guarda un array de alumno_id, no un objeto
    let vistos = [];
    try {
      if (tareaInfo.visto && tareaInfo.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaInfo.visto);
        // Asegurar que sea un array
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    // Agrupar entregas por alumno_id
    const entregasPorAlumno = {};
    entregas.forEach(entrega => {
      if (!entregasPorAlumno[entrega.alumno_id]) {
        entregasPorAlumno[entrega.alumno_id] = [];
      }
      entregasPorAlumno[entrega.alumno_id].push({
        id: entrega.id,
        url: entrega.url,
        nombre: entrega.nombre,
        fecha_hora: entrega.fecha_hora
      });
    });

    // Crear mapa de notas por matricula_id
    const notasPorMatricula = {};
    notas.forEach(nota => {
      notasPorMatricula[nota.matricula_id] = nota.nota;
    });

    // Combinar datos
    // IMPORTANTE: El sistema PHP guarda alumno_id en el campo visto, no matricula_id
    const alumnosConDatos = alumnos.map((alumno, index) => {
      const entregasAlumno = entregasPorAlumno[alumno.alumno_id] || [];
      const nota = notasPorMatricula[alumno.matricula_id] || '';
      // El campo visto contiene un array de alumno_id (no matricula_id)
      const visto = Array.isArray(vistos) && vistos.includes(alumno.alumno_id) ? 'SI' : 'NO';

      return {
        numero: index + 1,
        alumno_id: alumno.alumno_id,
        matricula_id: alumno.matricula_id,
        nombre_completo: alumno.nombre_completo,
        nota: nota,
        visto: visto,
        archivos: entregasAlumno
      };
    });

    res.json({
      alumnos: alumnosConDatos,
      tarea: {
        id: tareaInfo.id,
        titulo: tareaInfo.titulo,
        curso_nombre: tareaInfo.curso_nombre,
        grado: tareaInfo.grado,
        seccion: tareaInfo.seccion,
        nota_minima: tareaInfo.nota_minima,
        nota_maxima: tareaInfo.nota_maxima,
        tipo_calificacion: tareaInfo.tipo_calificacion,
        nivel_nombre: tareaInfo.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error obteniendo entregas:', error);
    res.status(500).json({ error: 'Error al obtener entregas' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas/:tareaId/marcar-visto
 * Marcar una tarea como vista por un alumno (igual que sistema PHP setView)
 * Esta ruta puede ser llamada por alumnos cuando ven los detalles de una tarea
 */
router.post('/aula-virtual/tareas/:tareaId/marcar-visto', async (req, res) => {
  try {
    const { tareaId } = req.params;
    const { alumno_id } = req.user; // El alumno_id viene del token JWT

    if (!alumno_id) {
      return res.status(400).json({ error: 'alumno_id es requerido' });
    }

    // Obtener la tarea actual
    const tarea = await query(
      `SELECT * FROM asignaturas_tareas WHERE id = ?`,
      [tareaId]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const tareaActual = tarea[0];

    // Deserializar campo "visto" (formato PHP serialized)
    // El sistema PHP guarda un array de alumno_id
    let vistos = [];
    try {
      if (tareaActual.visto && tareaActual.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaActual.visto);
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    // Si el alumno_id no está en el array, agregarlo (igual que sistema PHP)
    if (!vistos.includes(alumno_id)) {
      vistos.push(alumno_id);
      
      // Serializar el array actualizado
      const phpSerialize = require('php-serialize');
      const vistoSerializado = phpSerialize.serialize(vistos);

      // Actualizar el campo visto en la BD
      await execute(
        `UPDATE asignaturas_tareas SET visto = ? WHERE id = ?`,
        [vistoSerializado, tareaId]
      );

      console.log('✅ [TAREA VISTO] Alumno marcó tarea como vista:', {
        tarea_id: tareaId,
        alumno_id: alumno_id,
        vistos_actualizados: vistos
      });
    }

    res.json({ 
      success: true, 
      message: 'Tarea marcada como vista',
      visto: true
    });
  } catch (error) {
    console.error('Error marcando tarea como vista:', error);
    res.status(500).json({ error: 'Error al marcar tarea como vista' });
  }
});

/**
 * PUT /api/docente/aula-virtual/tareas/:tareaId/entregas/:matriculaId/nota
 * Guardar o actualizar la nota de un alumno para una tarea
 */
router.put('/aula-virtual/tareas/:tareaId/entregas/:matriculaId/nota', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { tareaId, matriculaId } = req.params;
    const { nota } = req.body;

    const tarea = await verificarAccesoTarea(
      req,
      res,
      tareaId,
      't.*, a.grupo_id',
      'Tarea no encontrada o sin permisos'
    );
    if (!tarea) return;

    const grupoIdTarea = tarea.grupo_id;

    // Verificar que la matrícula existe y pertenece al grupo de la tarea
    const matricula = await query(
      `SELECT m.* FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND g.anio = ?`,
      [matriculaId, grupoIdTarea, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    // Eliminar nota existente si hay
    await execute(
      `DELETE FROM asignaturas_tareas_notas 
       WHERE tarea_id = ? AND matricula_id = ?`,
      [tareaId, matriculaId]
    );

    // Si la nota no está vacía, insertarla
    if (nota && nota.trim() !== '') {
      await execute(
        `INSERT INTO asignaturas_tareas_notas (tarea_id, matricula_id, nota)
         VALUES (?, ?, ?)`,
        [tareaId, matriculaId, nota.trim()]
      );
    }

    // Obtener información de la tarea para la descripción
    const tareaInfo = tarea;

    // Registrar auditoría ANTES de guardar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: nota && nota.trim() !== '' ? 'CREAR' : 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea_nota',
      entidad_id: null,
      descripcion: `${nota && nota.trim() !== '' ? 'Asignó' : 'Eliminó'} nota${nota && nota.trim() !== '' ? `: ${nota}` : ''} para tarea "${tareaInfo.titulo}" (ID: ${tareaId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ tarea_id: tareaId, matricula_id: matriculaId, nota }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Enviar notificaciones a apoderados de forma asíncrona
    if (nota && nota.trim() !== '') {
      setImmediate(async () => {
        try {
          // Obtener información del alumno, tarea y curso
          const infoNota = await query(
            `SELECT a.id as alumno_id, 
                    CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre,
                    t.titulo as tarea_titulo,
                    c.nombre as curso_nombre,
                    CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
                    g.grado, g.seccion, n.nombre AS nivel_nombre
             FROM matriculas m
             INNER JOIN alumnos a ON a.id = m.alumno_id
             INNER JOIN asignaturas_tareas t ON t.id = ?
             INNER JOIN asignaturas asig ON asig.id = t.asignatura_id
             INNER JOIN cursos c ON c.id = asig.curso_id
             INNER JOIN personal p ON p.id = asig.personal_id
             INNER JOIN grupos g ON g.id = asig.grupo_id
             LEFT JOIN niveles n ON n.id = g.nivel_id
             WHERE m.id = ?`,
            [tareaId, matriculaId]
          );

          if (infoNota.length > 0) {
            const { alumno_id, alumno_nombre, tarea_titulo, curso_nombre, docente_nombre, grado, seccion, nivel_nombre } = infoNota[0];
            const gradoTxt = grado ? `${grado}°` : '';
            const seccionTxt = seccion ? String(seccion).trim() : '';
            const aulaTxt = `${nivel_nombre || ''} ${gradoTxt} ${seccionTxt}`.trim();
            const prefijoAula = aulaTxt ? `Aula: ${aulaTxt} - ` : '';
            
            await crearNotificacionesApoderados({
              alumno_id: alumno_id,
              usuario_id: usuario_id,
              colegio_id: colegio_id,
              anio_activo: anio_activo,
              tituloNotificacion: 'Nota de Proyecto Asignada',
              mensajeNotificacion: `Alumno: ${alumno_nombre} - ${prefijoAula}recibió nota ${nota.trim()} en la tarea "${tarea_titulo}" - Curso: ${curso_nombre} - Docente: ${docente_nombre}`,
              tipoNotificacion: 'nota_tarea',
              dataExtra: {
                tarea_id: parseInt(tareaId),
                nota: nota.trim(),
                curso_nombre: curso_nombre
              }
            });
          }
        } catch (error) {
          console.error(`❌ [NOTA TAREA] Error en proceso de notificaciones:`, error);
        }
      });
    }

    res.json({ message: 'Nota guardada correctamente' });
  } catch (error) {
    console.error('Error guardando nota:', error);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas/:tareaId/asignar-registro
 * Obtener información para asignar tarea a registro (criterios e indicadores)
 */
router.get('/aula-virtual/tareas/:tareaId/asignar-registro', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { tareaId } = req.params;

    const tareaInfo = await verificarAccesoTarea(
      req,
      res,
      tareaId,
      `t.*, a.id as asignatura_id, a.grupo_id, g.grado, g.seccion, c.nombre as curso_nombre`,
      'Tarea no encontrada o sin permisos',
      404,
      ' INNER JOIN cursos c ON c.id = a.curso_id'
    );
    if (!tareaInfo) return;

    const ciclo = tareaInfo.ciclo;

    // Obtener criterios de la asignatura para este ciclo (ciclo = 0 significa todos los ciclos)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [tareaInfo.asignatura_id, colegio_id, ciclo]
    );

    // Obtener indicadores para cada criterio
    const criteriosConIndicadores = await Promise.all(criterios.map(async (criterio) => {
      const indicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id = ?
         ORDER BY id ASC`,
        [criterio.id]
      );
      return {
        ...criterio,
        indicadores: indicadores || []
      };
    }));

    res.json({
      tarea: {
        id: tareaInfo.id,
        titulo: tareaInfo.titulo,
        curso_nombre: tareaInfo.curso_nombre,
        grado: tareaInfo.grado,
        seccion: tareaInfo.seccion,
        ciclo: ciclo
      },
      asignatura_id: tareaInfo.asignatura_id,
      criterios: criteriosConIndicadores
    });
  } catch (error) {
    console.error('Error obteniendo datos para asignar registro:', error);
    res.status(500).json({ error: 'Error al obtener datos para asignar registro' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas/:tareaId/asignar-registro
 * Asignar notas de tarea al registro general de notas
 */
router.post('/aula-virtual/tareas/:tareaId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { tareaId } = req.params;
    const { criterio_id, cuadro } = req.body;

    if (!criterio_id || cuadro === undefined || cuadro === null) {
      return res.status(400).json({ error: 'criterio_id y cuadro son requeridos' });
    }

    const tareaInfo = await verificarAccesoTarea(
      req,
      res,
      tareaId,
      `t.*, a.id as asignatura_id, a.grupo_id, n.nota_minima`,
      'Tarea no encontrada o sin permisos',
      404,
      ' INNER JOIN niveles n ON n.id = g.nivel_id'
    );
    if (!tareaInfo) return;

    const asignaturaId = tareaInfo.asignatura_id;
    const ciclo = tareaInfo.ciclo;
    const grupoId = tareaInfo.grupo_id;

    // Parsear criterio_id (formato: "criterio_id_indicador_id")
    const ids = criterio_id.split('_');
    if (ids.length !== 2) {
      return res.status(400).json({ error: 'Formato de criterio_id inválido' });
    }
    const criterioId = parseInt(ids[0]);
    const indicadorId = parseInt(ids[1]);
    const cuadroIndex = parseInt(cuadro); // El cuadro viene como índice (0-based)

    // Obtener todas las matrículas del grupo
    const matriculas = await query(
      `SELECT m.id as matricula_id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener todas las notas de la tarea
    const notasTarea = await query(
      `SELECT * FROM asignaturas_tareas_notas WHERE tarea_id = ?`,
      [tareaId]
    );

    // Crear mapa de notas por matricula_id
    const notasPorMatricula = {};
    notasTarea.forEach(nota => {
      notasPorMatricula[nota.matricula_id] = nota.nota;
    });

    const phpSerialize = require('php-serialize');
    const notaMinimaRegistro = Number(tareaInfo?.nota_minima);
    const notaMinimaValida = Number.isFinite(notaMinimaRegistro) ? notaMinimaRegistro : 0;

    // Procesar cada matrícula
    for (const matricula of matriculas) {
      const matriculaId = matricula.matricula_id;
      const notaTarea = notasPorMatricula[matriculaId];

      // Si no hay nota para esta matrícula, continuar
      if (!notaTarea || notaTarea.trim() === '') {
        continue;
      }

      let notaTareaNumero = parseFloat(notaTarea);
      if (Number.isNaN(notaTareaNumero)) {
        continue;
      }
      if (notaTareaNumero < notaMinimaValida) {
        notaTareaNumero = notaMinimaValida;
      }
      const valorCuadro = notaTareaNumero.toString();

      // Obtener o crear Nota_Detalle
      let detalles = await query(
        `SELECT * FROM notas_detalles
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
        [matriculaId, asignaturaId, ciclo]
      );

      let datosDetalles = {};
      if (detalles.length > 0) {
        try {
          datosDetalles = phpSerialize.unserialize(detalles[0].data) || {};
        } catch (error) {
          console.warn('Error deserializando notas_detalles:', error);
          datosDetalles = {};
        }
      }

      // Inicializar estructura si no existe
      if (!datosDetalles[criterioId]) {
        datosDetalles[criterioId] = {};
      }
      if (!datosDetalles[criterioId][indicadorId]) {
        datosDetalles[criterioId][indicadorId] = {};
      }

      // Asignar la nota en la posición del cuadro
      datosDetalles[criterioId][indicadorId][cuadroIndex] = valorCuadro;

      // Serializar y guardar
      const dataSerializada = phpSerialize.serialize(datosDetalles);

      if (detalles.length > 0) {
        // Actualizar existente
        await execute(
          `UPDATE notas_detalles SET data = ? WHERE id = ?`,
          [dataSerializada, detalles[0].id]
        );
      } else {
        // Crear nuevo
        await execute(
          `INSERT INTO notas_detalles (matricula_id, asignatura_id, ciclo, data)
           VALUES (?, ?, ?, ?)`,
          [matriculaId, asignaturaId, ciclo, dataSerializada]
        );
      }
    }

    // Recalcular promedios de criterios y promedio final (similar a DocenteCursos)
    // Esto se puede hacer llamando a la misma lógica que se usa al guardar notas
    // Por ahora, solo guardamos los detalles y el sistema recalculará cuando se abra el registro

    // Registrar auditoría ANTES de responder (tareaInfo ya está declarado arriba)
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'notas_detalles',
      entidad_id: null,
      descripcion: `Asignó notas de tarea "${tareaInfo.titulo}" (ID: ${tareaId}) al registro - Criterio: ${criterioId}, Indicador: ${indicadorId}, Cuadro: ${cuadroIndex}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ tarea_id: tareaId, criterio_id, indicador_id: indicadorId, cuadro: cuadroIndex }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Notas asignadas al registro correctamente' });
  } catch (error) {
    console.error('Error asignando notas al registro:', error);
    res.status(500).json({ error: 'Error al asignar notas al registro' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/asignar-registro
 * Obtener información para asignar examen a registro (criterios e indicadores)
 */
router.get('/aula-virtual/examenes/:examenId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenInfo = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*, a.id as asignatura_id, a.grupo_id, g.grado, g.seccion, c.nombre as curso_nombre',
      'Examen no encontrado o sin permisos',
      404,
      ' INNER JOIN cursos c ON c.id = a.curso_id'
    );
    if (!examenInfo) return;

    const ciclo = examenInfo.ciclo;

    // Obtener criterios de la asignatura para este ciclo (ciclo = 0 significa todos los ciclos)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [examenInfo.asignatura_id, colegio_id, ciclo]
    );

    // Obtener indicadores para cada criterio
    const criteriosConIndicadores = await Promise.all(criterios.map(async (criterio) => {
      const indicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id = ?
         ORDER BY id ASC`,
        [criterio.id]
      );
      return {
        ...criterio,
        indicadores: indicadores || []
      };
    }));

    res.json({
      examen: {
        id: examenInfo.id,
        titulo: examenInfo.titulo,
        curso_nombre: examenInfo.curso_nombre,
        grado: examenInfo.grado,
        seccion: examenInfo.seccion,
        ciclo: ciclo
      },
      asignatura_id: examenInfo.asignatura_id,
      criterios: criteriosConIndicadores
    });
  } catch (error) {
    console.error('Error obteniendo datos para asignar registro:', error);
    res.status(500).json({ error: 'Error al obtener datos para asignar registro' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/asignar-registro
 * Asignar notas de examen al registro general de notas
 */
router.post('/aula-virtual/examenes/:examenId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { criterio_id, cuadro } = req.body;

    if (!criterio_id || cuadro === undefined || cuadro === null) {
      return res.status(400).json({ error: 'criterio_id y cuadro son requeridos' });
    }

    const examenInfo = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*, a.id as asignatura_id, a.grupo_id, n.nota_minima',
      'Examen no encontrado o sin permisos',
      404,
      ' INNER JOIN niveles n ON n.id = g.nivel_id'
    );
    if (!examenInfo) return;

    const asignaturaId = examenInfo.asignatura_id;
    const ciclo = examenInfo.ciclo;
    const grupoId = examenInfo.grupo_id;

    // Parsear criterio_id (formato: "criterio_id_indicador_id")
    const ids = criterio_id.split('_');
    if (ids.length !== 2) {
      return res.status(400).json({ error: 'Formato de criterio_id inválido' });
    }
    const criterioId = parseInt(ids[0]);
    const indicadorId = parseInt(ids[1]);
    const cuadroIndex = parseInt(cuadro); // El cuadro viene como índice (0-based)

    // Obtener todas las matrículas del grupo
    const matriculas = await query(
      `SELECT m.id as matricula_id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener el mejor puntaje de cada alumno para este examen
    // El mejor puntaje es el mayor puntaje de todas las pruebas del alumno
    const mejoresPuntajes = await query(
      `SELECT 
        aep.matricula_id,
        MAX(aep.puntaje) as mejor_puntaje
       FROM asignaturas_examenes_pruebas aep
       WHERE aep.examen_id = ?
       GROUP BY aep.matricula_id`,
      [examenId]
    );

    // Crear mapa de mejores puntajes por matricula_id
    const puntajesPorMatricula = {};
    mejoresPuntajes.forEach(resultado => {
      puntajesPorMatricula[resultado.matricula_id] = resultado.mejor_puntaje;
    });

    const phpSerialize = require('php-serialize');
    const notaMinimaRegistro = Number(examenInfo?.nota_minima);
    const notaMinimaValida = Number.isFinite(notaMinimaRegistro) ? notaMinimaRegistro : 0;

    // Procesar cada matrícula
    for (const matricula of matriculas) {
      const matriculaId = matricula.matricula_id;
      const mejorPuntaje = puntajesPorMatricula[matriculaId];

      // Solo omitir si el alumno no tiene ninguna prueba registrada para este examen
      // (el 0 es una nota válida y antes se saltaba por error al usar !mejorPuntaje)
      if (mejorPuntaje === undefined) {
        continue;
      }

      // Limitar el puntaje entre 0 y 20 (como en el sistema)
      let puntajeFinal = parseFloat(mejorPuntaje);
      if (Number.isNaN(puntajeFinal)) continue;
      if (puntajeFinal < 0) puntajeFinal = 0;
      if (puntajeFinal > 20) puntajeFinal = 20;

      // Aplicar mínimo de registro según configuración del nivel en BD
      const valorCuadro = Math.max(puntajeFinal, notaMinimaValida).toString();

      // Obtener o crear Nota_Detalle
      let detalles = await query(
        `SELECT * FROM notas_detalles
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
        [matriculaId, asignaturaId, ciclo]
      );

      let datosDetalles = {};
      if (detalles.length > 0) {
        try {
          datosDetalles = phpSerialize.unserialize(detalles[0].data) || {};
        } catch (error) {
          console.warn('Error deserializando notas_detalles:', error);
          datosDetalles = {};
        }
      }

      // Inicializar estructura si no existe
      if (!datosDetalles[criterioId]) {
        datosDetalles[criterioId] = {};
      }
      if (!datosDetalles[criterioId][indicadorId]) {
        datosDetalles[criterioId][indicadorId] = {};
      }

      // Asignar el puntaje en la posición del cuadro
      datosDetalles[criterioId][indicadorId][cuadroIndex] = valorCuadro;

      // Serializar y guardar
      const dataSerializada = phpSerialize.serialize(datosDetalles);

      if (detalles.length > 0) {
        // Actualizar existente
        await execute(
          `UPDATE notas_detalles SET data = ? WHERE id = ?`,
          [dataSerializada, detalles[0].id]
        );
      } else {
        // Crear nuevo
        await execute(
          `INSERT INTO notas_detalles (matricula_id, asignatura_id, ciclo, data)
           VALUES (?, ?, ?, ?)`,
          [matriculaId, asignaturaId, ciclo, dataSerializada]
        );
      }
    }

    // Registrar auditoría ANTES de responder
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'notas_detalles',
      entidad_id: null,
      descripcion: `Asignó notas de examen "${examenInfo.titulo}" (ID: ${examenId}) al registro - Criterio: ${criterioId}, Indicador: ${indicadorId}, Cuadro: ${cuadroIndex}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ examen_id: examenId, criterio_id, indicador_id: indicadorId, cuadro: cuadroIndex }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    res.json({ message: 'Notas asignadas al registro correctamente' });
  } catch (error) {
    console.error('Error asignando notas al registro:', error);
    res.status(500).json({ error: 'Error al asignar notas al registro' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes
 * Obtener exámenes de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/examenes', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener exámenes de la asignatura filtrados por ciclo con conteo de preguntas
    // IMPORTANTE: Habilitar automáticamente exámenes cuando llega la fecha/hora de inicio
    // Usar CONVERT_TZ para trabajar con zona horaria de Lima (UTC-5)
    const examenes = await query(
      `SELECT ae.*, 
              COUNT(DISTINCT ep.id) as total_preguntas
       FROM asignaturas_examenes ae
       LEFT JOIN asignaturas_examenes_preguntas ep ON ep.examen_id = ae.id
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       GROUP BY ae.id
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Habilitar automáticamente exámenes que llegaron a su fecha/hora de inicio
    // Solo si tienen fecha_desde y hora_desde válidas (no 0000-00-00)
    // Usar moment-timezone para obtener la hora actual en Lima de forma precisa
    const moment = require('moment-timezone');
    const ahoraLima = moment.tz('America/Lima');
    const fechaActual = ahoraLima.format('YYYY-MM-DD');
    const horaActual = ahoraLima.format('HH:mm');
    const fechaHoraActual = ahoraLima.format('YYYY-MM-DD HH:mm:ss');

    for (const examen of examenes) {
      try {
        // Convertir fecha_desde a string si es necesario (puede venir como Date object desde MySQL)
        let fechaDesdeStr = '';
        if (examen.fecha_desde) {
          if (typeof examen.fecha_desde === 'string') {
            // Validar que no sea una fecha inválida de MySQL (0000-00-00)
            if (examen.fecha_desde !== '0000-00-00' && examen.fecha_desde !== '0000-00-00 00:00:00') {
              fechaDesdeStr = examen.fecha_desde.split(' ')[0]; // Solo la fecha, sin hora
            }
          } else if (examen.fecha_desde instanceof Date) {
            // Verificar que la fecha sea válida antes de convertir
            if (!isNaN(examen.fecha_desde.getTime())) {
              fechaDesdeStr = moment(examen.fecha_desde).tz('America/Lima').format('YYYY-MM-DD');
            }
            // Si la fecha es inválida, simplemente no procesar este examen (fechaDesdeStr queda vacío)
          } else {
            // Intentar convertir a string
            const fechaStr = String(examen.fecha_desde);
            if (fechaStr !== '0000-00-00' && fechaStr !== '0000-00-00 00:00:00') {
              fechaDesdeStr = fechaStr.split(' ')[0];
            }
          }
        }

        // Convertir hora_desde a string si es necesario
        let horaDesdeStr = '';
        if (examen.hora_desde) {
          if (typeof examen.hora_desde === 'string') {
            horaDesdeStr = examen.hora_desde;
          } else {
            horaDesdeStr = String(examen.hora_desde);
          }
        }

        // Procesar cualquier examen con ventana fecha/hora válida.
        // Regla: la fecha/hora tiene prioridad para activar/desactivar automáticamente.
        const tieneConfiguracionFechaHora =
          fechaDesdeStr &&
          fechaDesdeStr !== '0000-00-00' &&
          fechaDesdeStr !== '0000-00-00 00:00:00' &&
          fechaDesdeStr.trim() !== '' &&
          horaDesdeStr &&
          horaDesdeStr !== '00:00:00' &&
          horaDesdeStr.trim() !== '';

        if (tieneConfiguracionFechaHora) {
          
          // Construir fecha/hora de inicio y fin del examen
          const fechaInicio = fechaDesdeStr.split(' ')[0].trim(); // Solo la fecha
          const horaInicio = horaDesdeStr.substring(0, 5); // HH:MM
          
          // Obtener fecha/hora de fin
          let fechaHastaStr = '';
          let horaHastaStr = '';
          if (examen.fecha_hasta) {
            if (typeof examen.fecha_hasta === 'string') {
              // Validar que no sea una fecha inválida de MySQL (0000-00-00)
              if (examen.fecha_hasta !== '0000-00-00' && examen.fecha_hasta !== '0000-00-00 00:00:00') {
                fechaHastaStr = examen.fecha_hasta.split(' ')[0]; // Solo la fecha, sin hora
              }
            } else if (examen.fecha_hasta instanceof Date) {
              // Verificar que la fecha sea válida antes de convertir
              if (!isNaN(examen.fecha_hasta.getTime())) {
                fechaHastaStr = moment(examen.fecha_hasta).tz('America/Lima').format('YYYY-MM-DD');
              }
              // Si la fecha es inválida, simplemente no procesar (fechaHastaStr queda vacío)
            } else {
              const fechaStr = String(examen.fecha_hasta);
              if (fechaStr !== '0000-00-00' && fechaStr !== '0000-00-00 00:00:00') {
                fechaHastaStr = fechaStr.split(' ')[0];
              }
            }
          }
          if (examen.hora_hasta) {
            if (typeof examen.hora_hasta === 'string') {
              horaHastaStr = examen.hora_hasta;
            } else {
              horaHastaStr = String(examen.hora_hasta);
            }
          }
          
          const fechaFin = fechaHastaStr.split(' ')[0].trim();
          const horaFin = horaHastaStr.substring(0, 5);
          
          // Validar que las fechas sean válidas (no 0000-00-00)
          if (fechaInicio === '0000-00-00' || fechaInicio === '' || fechaFin === '0000-00-00' || fechaFin === '') {
            continue; // Saltar este examen
          }
          
          // Comparar fecha y hora usando moment-timezone para precisión
          // IMPORTANTE: Usar zona horaria de Lima para la comparación
          const fechaInicioMoment = moment.tz(`${fechaInicio} ${horaInicio}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
          const fechaFinMoment = moment.tz(`${fechaFin} ${horaFin}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
          
          // Validar que las fechas sean válidas
          if (!fechaInicioMoment.isValid() || !fechaFinMoment.isValid()) {
            console.warn(`⚠️ Fecha inválida para examen ${examen.id}: fecha_desde=${fechaDesdeStr}, hora_desde=${horaDesdeStr}, fecha_hasta=${fechaHastaStr}, hora_hasta=${horaHastaStr}`);
            continue;
          }
          
          // IMPORTANTE: Solo habilitar si estamos DENTRO del rango de fechas/horas
          // - La fecha/hora de inicio ya pasó (al menos 1 minuto)
          // - La fecha/hora de fin aún no ha llegado
          const diferenciaInicioMs = ahoraLima.diff(fechaInicioMoment, 'milliseconds');
          const diferenciaFinMs = fechaFinMoment.diff(ahoraLima, 'milliseconds');
          
          // Log para debugging
          console.log(`🔍 [DEBUG] Examen ${examen.id} "${examen.titulo}":`, {
            fechaInicio: fechaInicioMoment.format('YYYY-MM-DD HH:mm:ss'),
            fechaFin: fechaFinMoment.format('YYYY-MM-DD HH:mm:ss'),
            ahora: ahoraLima.format('YYYY-MM-DD HH:mm:ss'),
            diferenciaInicioMs: diferenciaInicioMs,
            diferenciaFinMs: diferenciaFinMs,
            diferenciaInicioMin: (diferenciaInicioMs / 60000).toFixed(2),
            diferenciaFinMin: (diferenciaFinMs / 60000).toFixed(2)
          });
          
          // Si ya pasó la fecha/hora fin, SIEMPRE debe quedar INACTIVO.
          if (diferenciaFinMs <= 0) {
            if (examen.estado !== 'INACTIVO') {
              try {
                await execute(
                  `UPDATE asignaturas_examenes SET estado = 'INACTIVO' WHERE id = ?`,
                  [examen.id]
                );
                console.log(`⏰ Examen "${examen.titulo}" (ID: ${examen.id}) desactivado automáticamente (fecha/hora fin ya pasó: ${fechaFin} ${horaFin})`);
                examen.estado = 'INACTIVO'; // Actualizar en el objeto para la respuesta
                programarCierreIntentosPendientesExamen({
                  query,
                  execute,
                  examenId: examen.id,
                  motivoCierre: MOTIVO_CIERRE_EXAMEN.VENTANA_EXAMEN,
                });
              } catch (error) {
                console.error(`Error desactivando examen ${examen.id}:`, error);
              }
            }
          // Si está dentro de rango, debe quedar ACTIVO.
          } else if (diferenciaInicioMs >= 60000) {
            try {
              if (examen.estado !== 'ACTIVO') {
                await execute(
                  `UPDATE asignaturas_examenes SET estado = 'ACTIVO' WHERE id = ?`,
                  [examen.id]
                );
                console.log(`✅ Examen "${examen.titulo}" (ID: ${examen.id}) habilitado automáticamente (dentro del rango: ${fechaInicio} ${horaInicio} - ${fechaFin} ${horaFin}, ahora: ${fechaActual} ${horaActual})`);
                examen.estado = 'ACTIVO'; // Actualizar en el objeto para la respuesta
              }
            } catch (error) {
              console.error(`Error habilitando examen ${examen.id}:`, error);
            }
          } else if (diferenciaInicioMs < 0) {
            // La fecha/hora de inicio es futura
            console.log(`⏳ Examen "${examen.titulo}" (ID: ${examen.id}) aún no inicia. Faltan ${Math.abs(diferenciaInicioMs / 60000).toFixed(1)} minutos`);
            if (examen.estado !== 'INACTIVO') {
              try {
                await execute(
                  `UPDATE asignaturas_examenes SET estado = 'INACTIVO' WHERE id = ?`,
                  [examen.id]
                );
                console.log(`⏳ Examen "${examen.titulo}" (ID: ${examen.id}) forzado a INACTIVO (aún no inicia: ${fechaInicio} ${horaInicio})`);
                examen.estado = 'INACTIVO'; // Actualizar en el objeto para la respuesta
              } catch (error) {
                console.error(`Error desactivando examen ${examen.id}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error procesando examen ${examen.id} para habilitación automática:`, error);
        // Continuar con el siguiente examen en lugar de fallar todo
      }
    }

    const examenesConUrls = examenes.map((examen) => ({
      ...examen,
      archivo_pdf_url: buildArchivoPdfUrl(examen.archivo_pdf)
    }));

    res.json({ examenes: examenesConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo exámenes:', error);
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes
 * Crear un nuevo examen
 */
router.post('/aula-virtual/examenes', uploadAulaVirtual.single('archivo_pdf'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { 
      asignatura_id, 
      titulo, 
      tipo, 
      tipo_puntaje, 
      puntos_correcta, 
      penalizar_incorrecta, 
      penalizacion_incorrecta, 
      tiempo, 
      intentos, 
      orden_preguntas, 
      preguntas_max, 
      ciclo,
      estado: estadoSolicitado,
      habilitar_fecha_hora,
      fecha_desde,
      fecha_hasta,
      hora_desde,
      hora_hasta
    } = req.body;

    if (!asignatura_id || !titulo || !tipo || !ciclo || !estadoSolicitado) {
      return res.status(400).json({ error: 'asignatura_id, titulo, tipo, ciclo y estado son requeridos' });
    }

    let estadoFinal = estadoSolicitado;

    // Si es PDF, debe tener archivo
    if (tipo === 'PDF' && !req.file) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF para exámenes tipo PDF' });
    }

    // Si es VIRTUAL, validar campos requeridos
    if (tipo === 'VIRTUAL') {
      if (!tipo_puntaje || !tiempo) {
        return res.status(400).json({ error: 'tipo_puntaje y tiempo son requeridos para exámenes virtuales' });
      }
      // Si es GENERAL, también requiere puntos_correcta
      if (tipo_puntaje === 'GENERAL' && (!puntos_correcta || parseFloat(puntos_correcta) <= 0)) {
        return res.status(400).json({ error: 'puntos_correcta es requerido cuando tipo_puntaje es GENERAL' });
      }
    }

    const asignatura = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignatura) return;

    // Preparar valores para fecha y hora
    // Las columnas fecha_desde, fecha_hasta, hora_desde, hora_hasta son NOT NULL en la BD
    // Si no se habilita fecha y hora, usar valores por defecto (fecha actual y horas por defecto)
    let fechaDesde, fechaHasta, horaDesde, horaHasta;

    if (habilitar_fecha_hora === 'SI' || habilitar_fecha_hora === true) {
      // Si está habilitado, validar que los valores estén presentes
      if (!fecha_desde || !fecha_hasta || !hora_desde || !hora_hasta) {
        return res.status(400).json({ error: 'Si habilita fecha y hora, debe proporcionar fecha_desde, fecha_hasta, hora_desde y hora_hasta' });
      }
      fechaDesde = fecha_desde;
      fechaHasta = fecha_hasta;
      horaDesde = hora_desde;
      horaHasta = hora_hasta;
      
      // IMPORTANTE: Si se configuran fechas/horas, el estado debe ser INACTIVO automáticamente
      // El examen solo se activará automáticamente cuando esté dentro del rango de fechas/horas
      if (estadoFinal === 'ACTIVO') {
        console.log(`⚠️ Examen con fecha/hora configurada: forzando estado a INACTIVO (se activará automáticamente cuando llegue la hora)`);
        estadoFinal = 'INACTIVO';
      }
    } else {
      // Si no está habilitado, usar valores por defecto específicos
      fechaDesde = '0000-00-00';
      fechaHasta = '0000-00-00';
      horaDesde = '00:00:00';
      horaHasta = '00:00:00';
    }

    // Preparar archivo PDF si existe
    // IMPORTANTE: Guardar solo el nombre del archivo (compatible con sistema PHP)
    // El sistema PHP guarda solo el nombre: $archivo['new_name']
    let archivoPdf = '';
    if (req.file) {
      archivoPdf = req.file.filename; // Solo el nombre del archivo, sin ruta
      console.log('📄 [AULA VIRTUAL EXAMEN PDF] Archivo guardado (solo nombre):', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path_en_bd: archivoPdf, // Esto es lo que se guarda en la BD
        size: req.file.size
      });
    }

    // Valores por defecto para campos opcionales
    const tipoPuntaje = tipo === 'VIRTUAL' ? (tipo_puntaje || 'INDIVIDUAL') : 'INDIVIDUAL';
    // Si es INDIVIDUAL, usar 0 (el puntaje se asigna en cada pregunta)
    // Si es GENERAL, usar el valor proporcionado o 1.0 por defecto
    const puntosCorrecta = tipo === 'VIRTUAL' 
      ? (tipo_puntaje === 'GENERAL' ? (parseFloat(puntos_correcta) || 1.0) : 0.0)
      : 1.0;
    const penalizarIncorrecta = tipo === 'VIRTUAL' ? (penalizar_incorrecta || 'NO') : 'NO';
    const penalizacionIncorrecta = tipo === 'VIRTUAL' ? (parseFloat(penalizacion_incorrecta) || 0.0) : 0.0;
    const tiempoExamen = tipo === 'VIRTUAL' ? (parseInt(tiempo) || 60) : 0;
    const intentosExamen = tipo === 'VIRTUAL' ? (parseInt(intentos) || 1) : 1;
    const ordenPreguntas = tipo === 'VIRTUAL' ? (orden_preguntas || 'PREDETERMINADO') : 'PREDETERMINADO';
    const preguntasMax = tipo === 'VIRTUAL' ? (parseInt(preguntas_max) || 1) : 1;

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      titulo,
      tipo,
      tipo_puntaje: tipoPuntaje,
      puntos_correcta: puntosCorrecta,
      penalizar_incorrecta: penalizarIncorrecta,
      penalizacion_incorrecta: penalizacionIncorrecta,
      tiempo: tiempoExamen,
      intentos: intentosExamen,
      estado: estadoFinal,
      orden_preguntas: ordenPreguntas,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      hora_desde: horaDesde,
      hora_hasta: horaHasta,
      ciclo: parseInt(ciclo),
      preguntas_max: preguntasMax,
      archivo_pdf: archivoPdf
    };

    // Registrar acción en auditoría ANTES de crear el examen
    // Usaremos null para entidad_id temporalmente y lo actualizaremos después
    const ahora = new Date();
    const fecha = fechaMySQLLima(ahora);
    const hora = horaMySQLLima(ahora);
    const fechaHoraAud = fechaHoraMySQLLima(ahora);

    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'examen',
        null, // Temporalmente null, se actualizará después
        `Creó examen: "${titulo}" (${tipo})`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        fechaHoraAud,
        fecha,
        hora,
      ]
    );

    // Insertar el examen
    const result = await execute(
      `INSERT INTO asignaturas_examenes 
       (trabajador_id, titulo, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, 
        tiempo, intentos, estado, orden_preguntas, fecha_desde, fecha_hasta, hora_desde, hora_hasta, 
        asignatura_id, ciclo, preguntas_max, tipo, archivo_pdf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        personal_id,
        titulo,
        tipoPuntaje,
        puntosCorrecta,
        penalizarIncorrecta,
        penalizacionIncorrecta,
        tiempoExamen,
        intentosExamen,
        estadoFinal,
        ordenPreguntas,
        fechaDesde,
        fechaHasta,
        horaDesde,
        horaHasta,
        asignatura_id,
        parseInt(ciclo),
        preguntasMax,
        tipo,
        archivoPdf
      ]
    );

    // Actualizar el registro de auditoría con el ID del examen creado
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'examen',
        nombre: titulo,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });
    
    res.json({ 
      success: true, 
      message: 'Examen creado correctamente',
      examen_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando examen:', error);
    res.status(500).json({ error: 'Error al crear examen' });
  }
});

/**
 * PUT /api/docente/aula-virtual/examenes/:examenId
 * Actualizar un examen existente
 */
router.put('/aula-virtual/examenes/:examenId', uploadAulaVirtual.single('archivo_pdf'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { 
      titulo, 
      tipo, 
      tipo_puntaje, 
      puntos_correcta, 
      penalizar_incorrecta, 
      penalizacion_incorrecta, 
      tiempo, 
      intentos, 
      orden_preguntas, 
      preguntas_max, 
      ciclo,
      estado: estadoSolicitado,
      habilitar_fecha_hora,
      fecha_desde,
      fecha_hasta,
      hora_desde,
      hora_hasta
    } = req.body;

    if (!titulo || !tipo || !ciclo || !estadoSolicitado) {
      return res.status(400).json({ error: 'titulo, tipo, ciclo y estado son requeridos' });
    }

    let estadoFinal = estadoSolicitado;

    const examenRow = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*',
      'Examen no encontrado o sin permisos',
      404
    );
    if (!examenRow) return;
    const examen = [examenRow];

    // Si es PDF y se sube un nuevo archivo, validar
    if (tipo === 'PDF' && !req.file && !examen[0].archivo_pdf) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF para exámenes tipo PDF' });
    }

    // Si es VIRTUAL, validar campos requeridos
    if (tipo === 'VIRTUAL') {
      if (!tipo_puntaje || !tiempo) {
        return res.status(400).json({ error: 'tipo_puntaje y tiempo son requeridos para exámenes virtuales' });
      }
      // Si es GENERAL, también requiere puntos_correcta
      if (tipo_puntaje === 'GENERAL' && (!puntos_correcta || parseFloat(puntos_correcta) <= 0)) {
        return res.status(400).json({ error: 'puntos_correcta es requerido cuando tipo_puntaje es GENERAL' });
      }
    }

    // Preparar valores para fecha y hora
    let fechaDesde, fechaHasta, horaDesde, horaHasta;

    if (habilitar_fecha_hora === 'SI' || habilitar_fecha_hora === true) {
      // Si está habilitado, validar que los valores estén presentes
      if (!fecha_desde || !fecha_hasta || !hora_desde || !hora_hasta) {
        return res.status(400).json({ error: 'Si habilita fecha y hora, debe proporcionar fecha_desde, fecha_hasta, hora_desde y hora_hasta' });
      }
      fechaDesde = fecha_desde;
      fechaHasta = fecha_hasta;
      horaDesde = hora_desde;
      horaHasta = hora_hasta;
      
      // IMPORTANTE: Si se configuran fechas/horas, el estado debe ser INACTIVO automáticamente
      // El examen solo se activará automáticamente cuando esté dentro del rango de fechas/horas
      if (estadoFinal === 'ACTIVO') {
        console.log(`⚠️ Examen con fecha/hora configurada: forzando estado a INACTIVO (se activará automáticamente cuando llegue la hora)`);
        estadoFinal = 'INACTIVO';
      }
    } else {
      // Si no está habilitado, usar valores por defecto específicos
      fechaDesde = '0000-00-00';
      fechaHasta = '0000-00-00';
      horaDesde = '00:00:00';
      horaHasta = '00:00:00';
    }

    // Preparar archivo PDF si existe
    let archivoPdf = examen[0].archivo_pdf; // Mantener el archivo existente por defecto
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (compatible con sistema PHP)
      archivoPdf = req.file.filename; // Solo el nombre del archivo, sin ruta
      console.log('📄 [AULA VIRTUAL EXAMEN PDF] Archivo actualizado (solo nombre):', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path_en_bd: archivoPdf,
        size: req.file.size
      });
      // TODO: Eliminar archivo anterior si existe
    }

    // Valores por defecto para campos opcionales
    const tipoPuntaje = tipo === 'VIRTUAL' ? (tipo_puntaje || 'INDIVIDUAL') : 'INDIVIDUAL';
    const puntosCorrecta = tipo === 'VIRTUAL' 
      ? (tipo_puntaje === 'GENERAL' ? (parseFloat(puntos_correcta) || 1.0) : 0.0)
      : 1.0;
    const penalizarIncorrecta = tipo === 'VIRTUAL' ? (penalizar_incorrecta || 'NO') : 'NO';
    const penalizacionIncorrecta = tipo === 'VIRTUAL' ? (parseFloat(penalizacion_incorrecta) || 0.0) : 0.0;
    const tiempoExamen = tipo === 'VIRTUAL' ? (parseInt(tiempo) || 60) : 0;
    const intentosExamen = tipo === 'VIRTUAL' ? (parseInt(intentos) || 1) : 1;
    const ordenPreguntas = tipo === 'VIRTUAL' ? (orden_preguntas || 'PREDETERMINADO') : 'PREDETERMINADO';
    const preguntasMax = tipo === 'VIRTUAL' ? (parseInt(preguntas_max) || 1) : 1;

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      titulo,
      tipo,
      tipo_puntaje: tipoPuntaje,
      puntos_correcta: puntosCorrecta,
      penalizar_incorrecta: penalizarIncorrecta,
      penalizacion_incorrecta: penalizacionIncorrecta,
      tiempo: tiempoExamen,
      intentos: intentosExamen,
      estado: estadoFinal,
      orden_preguntas: ordenPreguntas,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      hora_desde: horaDesde,
      hora_hasta: horaHasta,
      ciclo: parseInt(ciclo),
      preguntas_max: preguntasMax,
      archivo_pdf: archivoPdf
    };

    // Registrar acción en auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `Editó examen: "${examen[0].titulo}" (ID: ${examenId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(examen[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar el examen
    await execute(
      `UPDATE asignaturas_examenes 
       SET titulo = ?, tipo_puntaje = ?, puntos_correcta = ?, penalizar_incorrecta = ?, 
           penalizacion_incorrecta = ?, tiempo = ?, intentos = ?, estado = ?, 
           orden_preguntas = ?, fecha_desde = ?, fecha_hasta = ?, hora_desde = ?, 
           hora_hasta = ?, ciclo = ?, preguntas_max = ?, tipo = ?, archivo_pdf = ?
       WHERE id = ?`,
      [
        titulo,
        tipoPuntaje,
        puntosCorrecta,
        penalizarIncorrecta,
        penalizacionIncorrecta,
        tiempoExamen,
        intentosExamen,
        estadoFinal,
        ordenPreguntas,
        fechaDesde,
        fechaHasta,
        horaDesde,
        horaHasta,
        parseInt(ciclo),
        preguntasMax,
        tipo,
        archivoPdf,
        examenId
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    res.json({ 
      success: true, 
      message: 'Examen actualizado correctamente'
    });
  } catch (error) {
    console.error('Error actualizando examen:', error);
    res.status(500).json({ error: 'Error al actualizar examen' });
  }
});

/**
 * GET /api/docente/examenes/verificar-intentos-pendientes
 * Cierra intentos ACTIVO vencidos / examen inactivo y reenvía notificaciones pendientes.
 */
router.get('/examenes/verificar-intentos-pendientes', async (req, res) => {
  try {
    const { verificarExamenesIntentosPendientes } = require('../utils/examenCerrarIntentosPendientes');
    setImmediate(async () => {
      try {
        await verificarExamenesIntentosPendientes();
      } catch (e) {
        console.error('[EXAMEN CIERRE AUTO] Error verificación manual:', e);
      }
    });
    res.json({ success: true, message: 'Verificación de intentos pendientes iniciada' });
  } catch (error) {
    console.error('Error iniciando verificación intentos examen:', error);
    res.status(500).json({ error: 'Error al iniciar verificación' });
  }
});

/**
 * PUT /api/docente/aula-virtual/examenes/:examenId/estado
 * Cambiar estado de un examen (ACTIVO/INACTIVO)
 */
router.put('/aula-virtual/examenes/:examenId/estado', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { estado } = req.body; // 'ACTIVO' o 'INACTIVO'

    if (!estado || !['ACTIVO', 'INACTIVO'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido. Debe ser ACTIVO o INACTIVO' });
    }

    const examenActual = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*',
      'Examen no encontrado o sin permisos',
      404
    );
    if (!examenActual) return;

    // Si el examen tiene ventana fecha/hora, la disponibilidad depende del rango.
    // No permitir activarlo manualmente fuera de la ventana vigente.
    if (estado === 'ACTIVO') {
      const normalizarFecha = (valor) => {
        if (!valor) return '';
        if (typeof valor === 'string') {
          if (valor === '0000-00-00' || valor === '0000-00-00 00:00:00') return '';
          return valor.split(' ')[0].trim();
        }
        if (valor instanceof Date && !isNaN(valor.getTime())) {
          return moment(valor).tz('America/Lima').format('YYYY-MM-DD');
        }
        const texto = String(valor);
        if (texto === '0000-00-00' || texto === '0000-00-00 00:00:00') return '';
        return texto.split(' ')[0].trim();
      };

      const normalizarHora = (valor) => {
        if (!valor) return '';
        const hora = String(valor).trim();
        if (!hora || hora === '00:00:00') return '';
        return hora.substring(0, 5);
      };

      const fechaInicio = normalizarFecha(examenActual.fecha_desde);
      const fechaFin = normalizarFecha(examenActual.fecha_hasta);
      const horaInicio = normalizarHora(examenActual.hora_desde);
      const horaFin = normalizarHora(examenActual.hora_hasta);
      const tieneVentana = fechaInicio && fechaFin && horaInicio && horaFin;

      if (tieneVentana) {
        const moment = require('moment-timezone');
        const ahoraLima = moment.tz('America/Lima');
        const inicio = moment.tz(`${fechaInicio} ${horaInicio}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
        const fin = moment.tz(`${fechaFin} ${horaFin}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');

        if (!inicio.isValid() || !fin.isValid()) {
          return res.status(400).json({ error: 'La ventana de fecha/hora del examen es inválida' });
        }

        if (ahoraLima.isBefore(inicio) || !ahoraLima.isBefore(fin)) {
          return res.status(400).json({
            error: 'No se puede activar manualmente este examen fuera del rango de fecha/hora. Actualiza la fecha de inicio/fin.'
          });
        }
      }
    }

    // Registrar acción en auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `${estado === 'ACTIVO' ? 'Habilitó' : 'Deshabilitó'} examen: "${examenActual.titulo}" (ID: ${examenId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify({ estado: examenActual.estado, titulo: examenActual.titulo }),
      datos_nuevos: JSON.stringify({ estado, titulo: examenActual.titulo }),
      resultado: 'EXITOSO'
    });

    // Actualizar estado
    await execute(
      `UPDATE asignaturas_examenes SET estado = ? WHERE id = ?`,
      [estado, examenId]
    );

    if (estado === 'INACTIVO') {
      programarCierreIntentosPendientesExamen({
        query,
        execute,
        examenId,
        motivoCierre: MOTIVO_CIERRE_EXAMEN.CIERRE_DOCENTE,
      });
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    // Si se activa el examen, enviar notificaciones a alumnos y apoderados
    if (estado === 'ACTIVO') {
      setImmediate(async () => {
        try {
          // Obtener información del examen y asignatura
          const examenInfo = await query(
            `SELECT ae.*, a.grupo_id, a.curso_id, c.nombre as curso_nombre,
                    CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo
             FROM asignaturas_examenes ae
             INNER JOIN asignaturas a ON a.id = ae.asignatura_id
             INNER JOIN cursos c ON c.id = a.curso_id
             INNER JOIN personal p ON p.id = a.personal_id
             WHERE ae.id = ?`,
            [examenId]
          );
          
          if (examenInfo.length > 0) {
            const { grupo_id, curso_nombre, docente_nombre_completo, titulo } = examenInfo[0];
            
            // Obtener alumnos del grupo
            const alumnos = await query(
              `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id
               FROM alumnos a
               INNER JOIN matriculas m ON m.alumno_id = a.id
               INNER JOIN usuarios u ON u.alumno_id = a.id
               WHERE m.grupo_id = ? 
                 AND m.colegio_id = ?
                 AND (m.estado = 0)
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [grupo_id, colegio_id, colegio_id]
            );
            
            const alumnoIds = alumnos.map(a => a.alumno_id);
            const alumnoUsuarioIds = alumnos.map(a => a.usuario_id);
            
            // Obtener apoderados de esos alumnos
            let apoderadoUsuarioIds = [];
            if (alumnoIds.length > 0) {
              const apoderados = await query(
                `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
                 FROM apoderados ap
                 INNER JOIN familias f ON f.apoderado_id = ap.id
                 INNER JOIN usuarios u ON u.apoderado_id = ap.id
                 WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                   AND ap.colegio_id = ?
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'`,
                [...alumnoIds, colegio_id, colegio_id]
              );
              apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
              
              // Obtener DNI de apoderados para buscar docentes-apoderados
              const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
              
              if (apoderadoDnis.length > 0) {
                // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
                const docentesApoderados = await query(
                  `SELECT DISTINCT u.id 
                   FROM usuarios u
                   INNER JOIN personal p ON p.id = u.personal_id
                   WHERE u.colegio_id = ? 
                     AND u.estado = 'ACTIVO'
                     AND u.tipo = 'DOCENTE'
                     AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                          OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                     AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`,
                  [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
                );
                
                const docentesApoderadosIds = docentesApoderados.map(u => u.id);
                apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
                
                if (docentesApoderadosIds.length > 0) {
                  console.log(`📚 [EXAMEN ACTIVADO] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
                }
              }
            }
            
            // Combinar todos los destinatarios
            const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];
            
            console.log(`📚 [EXAMEN ACTIVADO] Enviando notificaciones a ${todosDestinatarios.length} destinatarios (${alumnoUsuarioIds.length} alumnos, ${apoderadoUsuarioIds.length} apoderados incluyendo docentes)`);
            
            const tituloNotificacion = 'Examen Activado';
            const mensajeBaseExamen = `Examen: "${titulo}" - Curso: ${curso_nombre} - Docente: ${docente_nombre_completo}`;
            
            const mapaPadreHijos = new Map();
            const apoderadoUsuarioIdSet = new Set(
              apoderadoUsuarioIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n))
            );
            const registrarHijoPadre = (padreId, alumnoId, rowDatos) => {
              const uid = parseInt(padreId, 10);
              const aid = parseInt(alumnoId, 10);
              if (Number.isNaN(uid) || Number.isNaN(aid)) return;
              if (!mapaPadreHijos.has(uid)) mapaPadreHijos.set(uid, new Map());
              const inner = mapaPadreHijos.get(uid);
              if (inner.has(aid)) return;
              inner.set(aid, lineaAlumnoGrado(rowDatos));
            };
            
            if (alumnoIds.length > 0 && apoderadoUsuarioIds.length > 0) {
              const phAl = alumnoIds.map(() => '?').join(',');
              try {
                const rowsApod = await query(
                  `SELECT u.id AS padre_usuario_id,
                    a.id AS alumno_id,
                    TRIM(CONCAT(COALESCE(a.nombres,''),' ',COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''))) AS alumno_nombre,
                    g.grado, g.seccion, COALESCE(nl.nombre,'') AS nivel_nombre
                   FROM matriculas m
                   INNER JOIN alumnos a ON a.id = m.alumno_id
                   INNER JOIN grupos g ON g.id = m.grupo_id
                   LEFT JOIN niveles nl ON nl.id = g.nivel_id
                   INNER JOIN familias f ON f.alumno_id = a.id
                   INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
                   INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'APODERADO'
                   WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
                     AND a.id IN (${phAl})`,
                  [colegio_id, colegio_id, grupo_id, colegio_id, ...alumnoIds]
                );
                for (const r of rowsApod || []) {
                  registrarHijoPadre(r.padre_usuario_id, r.alumno_id, r);
                }
                const rowsDocApod = await query(
                  `SELECT DISTINCT u.id AS padre_usuario_id,
                    a.id AS alumno_id,
                    TRIM(CONCAT(COALESCE(a.nombres,''),' ',COALESCE(a.apellido_paterno,''),' ',COALESCE(a.apellido_materno,''))) AS alumno_nombre,
                    g.grado, g.seccion, COALESCE(nl.nombre,'') AS nivel_nombre
                   FROM matriculas m
                   INNER JOIN alumnos a ON a.id = m.alumno_id
                   INNER JOIN grupos g ON g.id = m.grupo_id
                   LEFT JOIN niveles nl ON nl.id = g.nivel_id
                   INNER JOIN familias f ON f.alumno_id = a.id
                   INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
                   INNER JOIN usuarios u ON u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
                   INNER JOIN personal p ON p.id = u.personal_id
                   WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
                     AND a.id IN (${phAl})
                     AND ap.nro_documento IS NOT NULL AND TRIM(ap.nro_documento) <> ''
                     AND (p.nro_documento = ap.nro_documento OR TRIM(u.usuario) = TRIM(ap.nro_documento))`,
                  [colegio_id, colegio_id, grupo_id, colegio_id, ...alumnoIds]
                );
                for (const r of rowsDocApod || []) {
                  registrarHijoPadre(r.padre_usuario_id, r.alumno_id, r);
                }
              } catch (eMap) {
                console.error('❌ [EXAMEN ACTIVADO] Error construyendo contexto apoderado/hijo:', eMap);
              }
            }
            
            const construirMensajeExamenActivado = (destinatarioIdNum, tipoUsuario) => {
              if (tipoUsuario === 'ALUMNO') return mensajeBaseExamen;
              if (!apoderadoUsuarioIdSet.has(destinatarioIdNum)) return mensajeBaseExamen;
              const inner = mapaPadreHijos.get(destinatarioIdNum);
              if (!inner || inner.size === 0) return mensajeBaseExamen;
              const prefijo = Array.from(inner.values()).join(' · ');
              return prefijo ? `${prefijo} — ${mensajeBaseExamen}` : mensajeBaseExamen;
            };
            
            let tipoPorDestinatarioExamen = new Map();
            if (todosDestinatarios.length > 0) {
              const phDest = todosDestinatarios.map(() => '?').join(',');
              const tiposRowsEx = await query(
                `SELECT id, tipo, alumno_id FROM usuarios WHERE id IN (${phDest})`,
                todosDestinatarios.map((id) => parseInt(id, 10))
              );
              tipoPorDestinatarioExamen = new Map(
                (tiposRowsEx || []).map((r) => [parseInt(r.id, 10), { tipo: r.tipo, alumno_id: r.alumno_id }])
              );
            }
            
            const asignatura_id_ex = examenInfo[0].asignatura_id;
            // Crear notificaciones en la BD
            if (todosDestinatarios.length > 0) {
              for (const destinatarioId of todosDestinatarios) {
                try {
                  const destNum = parseInt(destinatarioId, 10);
                  const urlEx = await obtenerUrlExamenActivado(query, destinatarioId, {
                    asignatura_id: asignatura_id_ex,
                    grupo_id,
                    examen_id: parseInt(examenId, 10)
                  });
                  const uMeta = tipoPorDestinatarioExamen.get(destNum) || {};
                  const u0 = { tipo: uMeta.tipo, alumno_id: uMeta.alumno_id };
                  const mensajeNotificacion = construirMensajeExamenActivado(destNum, u0.tipo);
                  await insertNotificacionUsuario(execute, {
                    usuario_id,
                    destinatario_id: destinatarioId,
                    asunto: tituloNotificacion,
                    contenido: mensajeNotificacion,
                    estado: 'NO ENVIADO',
                    accion_tipo: 'examen_activado',
                    accion_payload: {
                      examen_id: parseInt(examenId, 10),
                      asignatura_id: asignatura_id_ex,
                      grupo_id,
                      ...(u0.tipo === 'ALUMNO' && u0.alumno_id ? { alumno_id: u0.alumno_id } : {})
                    },
                    url_destino: urlEx
                  });
                } catch (error) {
                  console.error(`❌ [EXAMEN ACTIVADO] Error creando notificación para usuario ${destinatarioId}:`, error);
                }
              }
              
              console.log(`✅ [EXAMEN ACTIVADO] ${todosDestinatarios.length} notificaciones creadas en BD`);
              
              const subscriptionsData = await query(
                `SELECT usuario_id, endpoint, p256dh, auth 
                 FROM push_subscriptions 
                 WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
                   AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
                [...todosDestinatarios, colegio_id]
              );
              
              if (subscriptionsData.length > 0) {
                const pushItems = [];
                for (const sub of subscriptionsData) {
                  const urlPush = await obtenerUrlExamenActivado(query, sub.usuario_id, {
                    asignatura_id: asignatura_id_ex,
                    grupo_id,
                    examen_id: parseInt(examenId, 10)
                  });
                  const uidPush = parseInt(sub.usuario_id, 10);
                  const tipoPush = (tipoPorDestinatarioExamen.get(uidPush) || {}).tipo;
                  const bodyPush = construirMensajeExamenActivado(uidPush, tipoPush);
                  pushItems.push({
                    subscription: {
                      endpoint: sub.endpoint,
                      keys: { p256dh: sub.p256dh, auth: sub.auth }
                    },
                    payload: {
                      title: tituloNotificacion,
                      body: bodyPush,
                      icon: '/icons/icon-192x192.png',
                      badge: '/icons/icon-192x192.png',
                      vibrate: [200, 100, 200],
                      tag: `examen-activado-${examenId}`,
                      data: {
                        url: urlPush,
                        tipo: 'examen_activado',
                        examen_id: parseInt(examenId, 10)
                      }
                    }
                  });
                }
                
                console.log(`📱 [EXAMEN ACTIVADO] Enviando ${pushItems.length} push notifications...`);
                
                enviarPushNotificacionesIndividuales(pushItems)
                  .then(resultadosPush => {
                    const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                    const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                    console.log(`✅ [EXAMEN ACTIVADO] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
                  })
                  .catch(err => {
                    console.error(`❌ [EXAMEN ACTIVADO] Error en envío de push notifications:`, err);
                  });
              } else {
                console.log('⚠️ [EXAMEN ACTIVADO] No hay suscripciones push activas para enviar notificaciones');
              }
              
              // Correos deshabilitados para Crear/Activar Examen (solo push)
            }
          }
        } catch (error) {
          console.error(`❌ [EXAMEN ACTIVADO] Error en proceso de notificaciones:`, error);
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: `Examen ${estado === 'ACTIVO' ? 'habilitado' : 'deshabilitado'} correctamente`,
      estado
    });
  } catch (error) {
    console.error('Error cambiando estado del examen:', error);
    res.status(500).json({ error: 'Error al cambiar estado del examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/resultados
 * Obtener resultados de un examen
 */
router.get('/aula-virtual/examenes/:examenId/resultados', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenInfo = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*, a.grupo_id'
    );
    if (!examenInfo) return;

    const grupoId = examenInfo.grupo_id;
    if (!grupoId) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    // Obtener TODOS los alumnos del grupo con LEFT JOIN a resultados
    // Si no tienen resultado, devolver NULL para mostrar "-" en el frontend
    const resultados = await query(
      `SELECT 
        COALESCE(aep.id, NULL) as resultado_id,
        m.id as matricula_id,
        COALESCE(aep.fecha_hora, NULL) as fecha_hora,
        aep.puntaje as puntaje,
        aep.correctas as correctas,
        aep.incorrectas as incorrectas,
        COALESCE(aep.estado, NULL) as estado,
        COALESCE(aep.finalizado_por_salida, 'NO') as finalizado_por_salida,
        COALESCE(aep.motivo_cierre, NULL) as motivo_cierre,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
        a.nombres,
        a.apellido_paterno,
        a.apellido_materno
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       LEFT JOIN asignaturas_examenes_pruebas aep ON aep.matricula_id = m.id AND aep.examen_id = ?
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres ASC`,
      [examenId, grupoId, colegio_id]
    );

    res.json({ 
      examen: examenInfo,
      resultados: resultados || []
    });
  } catch (error) {
    console.error('Error obteniendo resultados del examen:', error);
    res.status(500).json({ error: 'Error al obtener resultados del examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/resultados/:resultadoId/detalles
 * Obtener detalles completos de un resultado de examen (preguntas y respuestas)
 */
router.get('/aula-virtual/resultados/:resultadoId/detalles', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { resultadoId } = req.params;

    const resultadoInfo = await verificarAccesoResultadoPrueba(
      req,
      res,
      resultadoId,
      `aep.*,
        ae.titulo as examen_titulo,
        ae.tipo_puntaje,
        ae.puntos_correcta,
        CONCAT(alum.apellido_paterno, ' ', alum.apellido_materno, ', ', alum.nombres) as nombre_completo`,
      'No tienes acceso a este resultado',
      403,
      ` INNER JOIN matriculas m ON m.id = aep.matricula_id
        INNER JOIN alumnos alum ON alum.id = m.alumno_id`
    );
    if (!resultadoInfo) return;
    const examenId = resultadoInfo.examen_id;

    // IMPORTANTE: Obtener solo las preguntas que realmente vio el alumno
    // El campo 'preguntas' puede estar en formato PHP serialize (base64) o JSON
    let preguntaIds = [];
    try {
      if (resultadoInfo.preguntas && resultadoInfo.preguntas.trim() !== '') {
        // Intentar primero como JSON (formato nuevo)
        try {
          preguntaIds = JSON.parse(resultadoInfo.preguntas);
          if (!Array.isArray(preguntaIds)) {
            preguntaIds = [];
          }
        } catch (jsonError) {
          // Si falla JSON, intentar como PHP serialize (formato antiguo)
          try {
            const phpSerialize = require('php-serialize');
            // Decodificar base64 primero (formato PHP: base64_encode(serialize(array)))
            const decoded = Buffer.from(resultadoInfo.preguntas, 'base64').toString('utf-8');
            // Deserializar el array PHP
            preguntaIds = phpSerialize.unserialize(decoded) || [];
            // Asegurar que sea un array
            if (!Array.isArray(preguntaIds)) {
              preguntaIds = [];
            }
          } catch (phpError) {
            console.warn('Error deserializando preguntas (ni JSON ni PHP serialize):', phpError);
            preguntaIds = [];
          }
        }
      }
    } catch (error) {
      console.warn('Error deserializando preguntas del resultado:', error);
      preguntaIds = [];
    }

    if (preguntaIds.length === 0) {
      console.warn('⚠️ Resultado sin preguntas guardadas, mostrando todas las preguntas del examen');
    }

    const preguntasConAlternativas = await fetchPreguntasConAlternativas(
      query,
      examenId,
      preguntaIds,
      'SI_NO'
    );

    // Parsear respuestas del alumno
    // El sistema nuevo usa JSON, pero el antiguo usaba PHP serialize (base64)
    // Intentar primero JSON, luego PHP serialize para compatibilidad
    let respuestasAlumno = {};
    try {
      if (resultadoInfo.respuestas && resultadoInfo.respuestas.trim() !== '') {
        // Intentar primero como JSON (formato nuevo)
        try {
          respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
        } catch (jsonError) {
          // Si falla JSON, intentar como PHP serialize (formato antiguo)
          try {
            const phpSerialize = require('php-serialize');
            // Decodificar base64 primero
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            // Deserializar el array PHP
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          } catch (phpError) {
            console.warn('Error parseando respuestas (ni JSON ni PHP serialize):', phpError);
            respuestasAlumno = {};
          }
        }
        
        // Asegurar que las claves sean strings para comparación consistente
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach(key => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      }
    } catch (parseError) {
      console.error('Error parseando respuestas del alumno:', parseError);
      console.error('Respuestas raw:', resultadoInfo.respuestas);
      // Si falla, respuestasAlumno queda como objeto vacío
      respuestasAlumno = {};
    }

    res.json({
      resultado: resultadoInfo,
      preguntas: preguntasConAlternativas,
      respuestas: respuestasAlumno
    });
    } catch (error) {
      console.error('Error obteniendo detalles del resultado:', error);
      res.status(500).json({ error: 'Error al obtener detalles del resultado' });
    }
  });

/**
 * DELETE /api/docente/aula-virtual/resultados/:resultadoId
 * Borrar un resultado de examen (permite que el alumno vuelva a dar el examen)
 */
router.delete('/aula-virtual/resultados/:resultadoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { resultadoId } = req.params;

    const resultadoInfo = await verificarAccesoResultadoPrueba(
      req,
      res,
      resultadoId,
      `aep.*,
        ae.titulo as examen_titulo,
        CONCAT(alum.apellido_paterno, ' ', alum.apellido_materno, ', ', alum.nombres) as nombre_completo`,
      'No tienes acceso a este resultado',
      403,
      ` INNER JOIN matriculas m ON m.id = aep.matricula_id
        INNER JOIN alumnos alum ON alum.id = m.alumno_id`
    );
    if (!resultadoInfo) return;

    // Registrar auditoría ANTES de eliminar
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'DELETE',
      modulo: 'Aula Virtual',
      entidad: 'Resultado de Examen',
      entidad_id: resultadoId,
      descripcion: `Resultado eliminado del examen "${resultadoInfo.examen_titulo}" del alumno ${resultadoInfo.nombre_completo}. El alumno podrá volver a dar el examen si tiene intentos disponibles.`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: {
        examen_id: resultadoInfo.examen_id,
        matricula_id: resultadoInfo.matricula_id,
        puntaje: resultadoInfo.puntaje,
        correctas: resultadoInfo.correctas,
        incorrectas: resultadoInfo.incorrectas,
        estado: resultadoInfo.estado
      },
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    // Eliminar el resultado
    await execute(
      `DELETE FROM asignaturas_examenes_pruebas WHERE id = ?`,
      [resultadoId]
    );

    res.json({ 
      success: true,
      message: 'Resultado eliminado correctamente. El alumno podrá volver a dar el examen si tiene intentos disponibles.'
    });
  } catch (error) {
    console.error('Error eliminando resultado del examen:', error);
    res.status(500).json({ error: 'Error al eliminar el resultado del examen' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/examenes/:examenId/resultados/todos
 * Eliminar todos los resultados de un examen (permite que todos los alumnos vuelvan a dar el examen)
 */
router.delete('/aula-virtual/examenes/:examenId/resultados/todos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenInfo = await verificarAccesoExamen(
      req,
      res,
      examenId,
      `ae.*,
        a.grupo_id,
        c.nombre as curso_nombre,
        g.grado,
        g.seccion,
        n.nombre as nivel_nombre`,
      'No tienes acceso a este examen',
      403,
      ' INNER JOIN cursos c ON c.id = a.curso_id INNER JOIN niveles n ON n.id = g.nivel_id'
    );
    if (!examenInfo) return;

    // Obtener todos los resultados del examen para auditoría
    const resultados = await query(
      `SELECT 
        aep.id,
        aep.matricula_id,
        aep.puntaje,
        aep.correctas,
        aep.incorrectas,
        aep.estado,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE aep.examen_id = ?`,
      [examenId]
    );

    const totalResultados = resultados.length;

    // Registrar auditoría ANTES de eliminar
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'DELETE',
      modulo: 'Aula Virtual',
      entidad: 'Resultados de Examen (Todos)',
      entidad_id: examenId,
      descripcion: `Se eliminaron todos los resultados (${totalResultados}) del examen "${examenInfo.titulo}". Los alumnos podrán volver a dar el examen si tienen intentos disponibles.`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: {
        examen_id: examenId,
        total_resultados: totalResultados,
        resultados: resultados.map(r => ({
          id: r.id,
          matricula_id: r.matricula_id,
          nombre_completo: r.nombre_completo,
          puntaje: r.puntaje,
          correctas: r.correctas,
          incorrectas: r.incorrectas
        }))
      },
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    // Eliminar todos los resultados del examen
    await execute(
      `DELETE FROM asignaturas_examenes_pruebas WHERE examen_id = ?`,
      [examenId]
    );

    res.json({ 
      success: true,
      message: `Se eliminaron ${totalResultados} resultado(s) correctamente. Los alumnos podrán volver a dar el examen si tienen intentos disponibles.`,
      total_eliminados: totalResultados
    });
  } catch (error) {
    console.error('Error eliminando todos los resultados del examen:', error);
    res.status(500).json({ error: 'Error al eliminar los resultados del examen' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/calificar
 * Recalcular calificaciones de todos los alumnos que han dado el examen
 * Toma en cuenta las respuestas del alumno y los parámetros actuales del examen
 */
router.post('/aula-virtual/examenes/:examenId/calificar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenInfo = await verificarAccesoExamen(req, res, examenId);
    if (!examenInfo) return;

    // Obtener todas las pruebas (resultados) del examen
    const pruebas = await query(
      `SELECT * FROM asignaturas_examenes_pruebas WHERE examen_id = ?`,
      [examenId]
    );

    if (pruebas.length === 0) {
      return res.json({ 
        success: true,
        message: 'No hay resultados para recalificar',
        recalificados: 0
      });
    }

    let recalificados = 0;
    let errores = 0;

    // Recalificar cada prueba
    for (const prueba of pruebas) {
      try {
        const calificacion = await finalizarPruebaConCalificacion({
          query,
          execute,
          pruebaRow: prueba,
          examenId
        });

        await execute(
          `UPDATE asignaturas_examenes_pruebas 
           SET puntaje = ?, correctas = ?, incorrectas = ?, estado = 'FINALIZADA'
           WHERE id = ?`,
          [
            calificacion.puntajeFinal,
            calificacion.correctas,
            calificacion.incorrectas,
            prueba.id
          ]
        );

        recalificados++;
      } catch (error) {
        console.error(`Error recalificando prueba ${prueba.id}:`, error);
        errores++;
      }
    }

    // Registrar auditoría
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'RECALIFICAR',
      modulo: 'Aula Virtual',
      entidad: 'Examen',
      entidad_id: examenId,
      descripcion: `Recalificó examen "${examenInfo.titulo}". ${recalificados} resultado(s) actualizado(s)${errores > 0 ? `, ${errores} error(es)` : ''}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: {
        examen_id: examenId,
        total_pruebas: pruebas.length,
        recalificados: recalificados,
        errores: errores
      },
      resultado: errores === 0 ? 'EXITOSO' : 'PARCIAL'
    }).catch(err => console.error('Error en auditoría:', err));

    res.json({ 
      success: true,
      message: errores === 0 
        ? `Se recalificaron ${recalificados} resultado(s) correctamente.`
        : `Se recalificaron ${recalificados} resultado(s). ${errores} error(es) encontrado(s).`,
      recalificados: recalificados,
      errores: errores,
      total: pruebas.length
    });
  } catch (error) {
    console.error('Error recalificando examen:', error);
    res.status(500).json({ error: 'Error al recalificar el examen' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/reparar-estados-inconsistentes
 * Pone estado FINALIZADA en pruebas que ya tienen puntaje pero siguen como ACTIVO (caso típico tras recalificar sin actualizar estado).
 */
router.post('/aula-virtual/examenes/:examenId/reparar-estados-inconsistentes', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenReparar = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.id, ae.titulo'
    );
    if (!examenReparar) return;

    const result = await execute(
      `UPDATE asignaturas_examenes_pruebas
       SET estado = 'FINALIZADA'
       WHERE examen_id = ? AND estado = 'ACTIVO' AND puntaje IS NOT NULL`,
      [examenId]
    );

    const arreglados = result.affectedRows ?? 0;

    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'REPARAR_ESTADOS_EXAMEN',
      modulo: 'Aula Virtual',
      entidad: 'Examen',
      entidad_id: parseInt(examenId, 10),
      descripcion: `Reparó estados inconsistentes en examen "${examenReparar.titulo}" (${arreglados} fila(s)).`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: { examen_id: examenId, arreglados }
    }).catch((err) => console.error('Error en auditoría reparar estados examen:', err));

    return res.json({
      success: true,
      arreglados,
      message:
        arreglados === 0
          ? 'No había pruebas con nota en estado ACTIVO. Nada que reparar.'
          : `Se corrigieron ${arreglados} resultado(s). Los alumnos deberían ver su examen como finalizado.`
    });
  } catch (error) {
    console.error('Error reparando estados de pruebas:', error);
    return res.status(500).json({ error: 'Error al reparar estados del examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/resultados/pdf
 * Generar PDF con los resultados del examen
 */
router.get('/aula-virtual/examenes/:examenId/resultados/pdf', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenInfo = await verificarAccesoExamen(
      req,
      res,
      examenId,
      `ae.*,
        a.grupo_id,
        c.nombre as curso_nombre,
        g.grado,
        g.seccion,
        n.nombre as nivel_nombre`,
      'No tienes acceso a este examen',
      403,
      ' INNER JOIN cursos c ON c.id = a.curso_id INNER JOIN niveles n ON n.id = g.nivel_id'
    );
    if (!examenInfo) return;

    const grupoId = examenInfo.grupo_id;
    
    if (!grupoId) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    // Obtener resultados
    const resultados = await query(
      `SELECT 
        COALESCE(aep.id, NULL) as resultado_id,
        m.id as matricula_id,
        COALESCE(aep.fecha_hora, NULL) as fecha_hora,
        aep.puntaje as puntaje,
        aep.correctas as correctas,
        aep.incorrectas as incorrectas,
        COALESCE(aep.estado, NULL) as estado,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
        a.nombres,
        a.apellido_paterno,
        a.apellido_materno
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       LEFT JOIN asignaturas_examenes_pruebas aep ON aep.matricula_id = m.id AND aep.examen_id = ?
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres ASC`,
      [examenId, grupoId, colegio_id]
    );

    // Calcular puntos por respuesta correcta
    const puntosPorRespuesta = examenInfo.tipo_puntaje === 'GENERAL' ? (examenInfo.puntos_correcta || 0) : 0;

    // Crear PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50,
      layout: 'portrait'
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Resultados_${examenInfo.titulo.replace(/[^a-z0-9]/gi, '_')}.pdf"`);

    // Pipe PDF a la respuesta
    doc.pipe(res);

    // Colores
    const colorHeader = '#667eea';
    const colorHeaderEnd = '#764ba2';
    const colorText = '#1f2937';
    const colorGray = '#6b7280';
    const colorGreen = '#10b981';
    const colorRed = '#ef4444';
    const colorBg = '#f3f4f6';

    // Header con gradiente (simulado con múltiples rectángulos)
    for (let i = 0; i < 80; i++) {
      const ratio = i / 80;
      const r = Math.floor(parseInt(colorHeader.slice(1, 3), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(1, 3), 16) * ratio);
      const g = Math.floor(parseInt(colorHeader.slice(3, 5), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(3, 5), 16) * ratio);
      const b = Math.floor(parseInt(colorHeader.slice(5, 7), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(5, 7), 16) * ratio);
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      doc.rect(0, i, 595, 1).fill(color);
    }
    
    // Título del header (sin emoji para evitar problemas de codificación)
    doc.fontSize(20)
       .fillColor('white')
       .font('Helvetica-Bold')
       .text('RESULTADOS', 50, 25, { align: 'left' });
    
    // Construir título completo: Examen - Curso - Grado - Nivel - Bimestre
    const gradoTexto = examenInfo.grado ? `${examenInfo.grado}°` : '';
    const seccionTexto = examenInfo.seccion || '';
    const gradoSeccion = `${gradoTexto} ${seccionTexto}`.trim();
    const bimestreTexto = examenInfo.ciclo ? `Bimestre ${examenInfo.ciclo}` : '';
    const tituloCompleto = `${examenInfo.titulo} - ${examenInfo.curso_nombre || ''} - ${gradoSeccion} - ${examenInfo.nivel_nombre || ''}${bimestreTexto ? ` - ${bimestreTexto}` : ''}`.replace(/\s+/g, ' ').trim();
    
    doc.fontSize(14)
       .fillColor('white')
       .font('Helvetica')
       .text(tituloCompleto, 50, 50, { align: 'left', width: 495 });

    let yPos = 120;

    // Información del examen
    doc.rect(50, yPos, 495, 40)
       .fill(colorBg)
       .stroke();
    
    doc.fontSize(11)
       .fillColor(colorText)
       .font('Helvetica-Bold')
       .text('EXAMEN:', 60, yPos + 10);
    
    doc.font('Helvetica')
       .text(examenInfo.titulo, 130, yPos + 10);
    
    if (examenInfo.tipo_puntaje === 'GENERAL') {
      doc.font('Helvetica-Bold')
         .text('PUNTAJE POR RESPUESTA CORRECTA:', 60, yPos + 25);
      
      doc.font('Helvetica')
         .text(`${puntosPorRespuesta} Punto(s)`, 280, yPos + 25);
    }

    yPos += 70;

    // Tabla de resultados
    const tableTop = yPos;
    const itemHeight = 25;
    const tableLeft = 50;
    const tableWidth = 495;
    
    // Encabezado de tabla con gradiente (simulado)
    for (let i = 0; i < itemHeight; i++) {
      const ratio = i / itemHeight;
      const r = Math.floor(parseInt(colorHeader.slice(1, 3), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(1, 3), 16) * ratio);
      const g = Math.floor(parseInt(colorHeader.slice(3, 5), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(3, 5), 16) * ratio);
      const b = Math.floor(parseInt(colorHeader.slice(5, 7), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(5, 7), 16) * ratio);
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      doc.rect(tableLeft, tableTop + i, tableWidth, 1).fill(color);
    }
    doc.rect(tableLeft, tableTop, tableWidth, itemHeight).stroke();
    
    // Columnas del encabezado
    const colWidths = [40, 250, 70, 70, 70];
    const headers = ['N°', 'APELLIDOS Y NOMBRES', 'PUNTAJE', 'CORRECTAS', 'INCORRECTAS'];
    let xPos = tableLeft;
    
    doc.fillColor('white')
       .font('Helvetica-Bold');
    
    headers.forEach((header, index) => {
      const align = index === 0 ? 'center' : (index === 1 ? 'left' : 'center');
      // Usar fuente más pequeña para CORRECTAS e INCORRECTAS
      const fontSize = (index === 3 || index === 4) ? 8 : 10;
      doc.fontSize(fontSize)
         .text(header, xPos + 5, tableTop + (index === 3 || index === 4 ? 10 : 8), { 
           width: colWidths[index] - 10, 
           align: align 
         });
      xPos += colWidths[index];
    });

    yPos = tableTop + itemHeight;

    // Filas de datos
    resultados.forEach((resultado, index) => {
      const tieneResultado = resultado.resultado_id !== null && resultado.resultado_id !== undefined;
      
      // Fondo alternado para filas
      if (index % 2 === 0) {
        doc.rect(tableLeft, yPos, tableWidth, itemHeight)
           .fill('#f9fafb')
           .stroke();
      } else {
        doc.rect(tableLeft, yPos, tableWidth, itemHeight)
           .fill('white')
           .stroke();
      }

      xPos = tableLeft;
      doc.fontSize(9)
         .fillColor(colorText)
         .font('Helvetica');

      // N°
      doc.text((index + 1).toString(), xPos + 5, yPos + 8, { 
        width: colWidths[0] - 10, 
        align: 'center' 
      });
      xPos += colWidths[0];

      // Nombre
      doc.text(resultado.nombre_completo, xPos + 5, yPos + 8, { 
        width: colWidths[1] - 10, 
        align: 'left' 
      });
      xPos += colWidths[1];

      // Puntaje
      const puntajeText = tieneResultado ? resultado.puntaje.toString() : '-';
      doc.fillColor(tieneResultado ? colorText : colorGray)
         .font('Helvetica-Bold')
         .text(puntajeText, xPos + 5, yPos + 8, { 
           width: colWidths[2] - 10, 
           align: 'center' 
         });
      xPos += colWidths[2];

      // Correctas
      const correctasText = tieneResultado ? resultado.correctas.toString() : '-';
      doc.fillColor(tieneResultado ? colorGreen : colorGray)
         .text(correctasText, xPos + 5, yPos + 8, { 
           width: colWidths[3] - 10, 
           align: 'center' 
         });
      xPos += colWidths[3];

      // Incorrectas
      const incorrectasText = tieneResultado ? resultado.incorrectas.toString() : '-';
      doc.fillColor(tieneResultado ? colorRed : colorGray)
         .text(incorrectasText, xPos + 5, yPos + 8, { 
           width: colWidths[4] - 10, 
           align: 'center' 
         });

      yPos += itemHeight;

      // Nueva página si es necesario (dejando espacio para el footer)
      if (yPos > 720) {
        doc.addPage();
        yPos = 50;
      }
    });

    // Pie de página (justo después de la tabla, sin espacio extra)
    const totalConResultado = resultados.filter(r => r.resultado_id !== null).length;
    const totalSinResultado = resultados.length - totalConResultado;
    
    // Asegurar que el footer esté en la misma página que la última fila
    if (yPos > 720) {
      // Si no cabe, mover a nueva página
      doc.addPage();
      yPos = 50;
    }
    
    yPos += 10; // Pequeño espacio después de la tabla
    
    doc.fontSize(9)
       .fillColor(colorGray)
       .font('Helvetica')
       .text(`Total de alumnos: ${resultados.length} | Con resultado: ${totalConResultado} | Sin resultado: ${totalSinResultado}`, 
             50, yPos, { align: 'center', width: 495 });

    // Finalizar PDF
    doc.end();

  } catch (error) {
    console.error('Error generando PDF de resultados:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el PDF' });
    }
  }
});

/**
 * DELETE /api/docente/aula-virtual/examenes/:examenId
 * Eliminar un examen (con cascada: alternativas -> preguntas -> examen)
 */
router.delete('/aula-virtual/examenes/:examenId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenActual = await verificarAccesoExamen(
      req,
      res,
      examenId,
      'ae.*',
      'Examen no encontrado o sin permisos',
      404
    );
    if (!examenActual) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, examenId))) {
      return;
    }

    // Obtener todas las preguntas del examen para la auditoría
    const preguntas = await query(
      `SELECT id FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );

    // Registrar acción en auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `Eliminó examen: "${examenActual.titulo}" (ID: ${examenId}) con ${preguntas.length} pregunta(s) y sus alternativas`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(examenActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativas de cada pregunta (cascada)
    for (const pregunta of preguntas) {
      await execute(
        `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
        [pregunta.id]
      );
    }

    // Eliminar preguntas del examen
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );

    // Bloque de contexto (sin FK en BD en algunos despliegues; evitar huérfanos)
    try {
      await execute(`DELETE FROM asignaturas_examenes_bloques WHERE examen_id = ?`, [examenId]);
    } catch (bloqueDel) {
      if (bloqueDel && bloqueDel.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('Eliminar bloque examen:', bloqueDel.message);
      }
    }

    // Eliminar el examen
    await execute(
      `DELETE FROM asignaturas_examenes WHERE id = ?`,
      [examenId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    res.json({ 
      success: true, 
      message: 'Examen eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando examen:', error);
    res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/archivos
 * Obtener archivos/temas interactivos de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/archivos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener archivos de la asignatura filtrados por ciclo (ordenados según el orden establecido)
    const archivos = await query(
      `SELECT * FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY orden ASC, id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs completas para los archivos (usando PHP_SYSTEM_URL para compatibilidad con sistema anterior)
    // IMPORTANTE: El sistema PHP guarda solo el nombre del archivo en la BD
    // Debemos construir la URL completa agregando /Static/Archivos/ al inicio
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      let enlaceUrl = null;

      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          // Ya es una URL completa, validar y corregir dominio si es necesario
          archivoUrl = archivo.archivo
            .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl)
            .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
        } else if (archivo.archivo.startsWith('/Static/')) {
          // Ruta completa con /Static/ (formato antiguo de nuestro sistema, corregir)
          // Extraer solo el nombre del archivo y construir URL correcta
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
          console.log('📄 [AULA VIRTUAL TEMA] Corrigiendo ruta duplicada:', {
            id: archivo.id,
            ruta_original: archivo.archivo,
            nombre_extraido: nombreArchivo,
            url_final: archivoUrl
          });
        } else if (archivo.archivo.startsWith('/uploads/')) {
          // Ruta relativa desde /uploads/ (formato antiguo, migrar a /Static/Archivos/)
          archivoUrl = isDevelopment
            ? `http://localhost:5000${archivo.archivo}`
            : `${phpSystemUrl}${archivo.archivo}`;
        } else {
          // Solo el nombre del archivo (formato correcto del sistema PHP)
          // Construir URL completa agregando /Static/Archivos/
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }

      if (archivo.enlace && archivo.enlace !== '') {
        // IMPORTANTE: Devolver el enlace tal cual está en la BD (sin normalizar)
        // El sistema PHP muestra el enlace directamente desde la BD
        // Si normalizamos aquí, puede causar problemas en el sistema PHP
        enlaceUrl = archivo.enlace.trim();
      }

      return {
        ...archivo,
        archivo_url: archivoUrl,
        enlace_url: enlaceUrl
      };
    });

    res.json({ archivos: archivosConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo archivos:', error);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

/**
 * GET /api/docente/aula-virtual/biblioteca-temas
 * Obtener temas de años anteriores (mismo curso, mismo grado) para la Biblioteca
 * Años: 2024 hasta (anio_activo - 1). Incluye temas de cualquier docente.
 */
router.get('/aula-virtual/biblioteca-temas', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Verificar acceso a la asignatura actual (docente titular o staff)
    const asignaturaActual = await fetchAsignaturaConAcceso(
      query,
      req,
      asignatura_id,
      'a.*, c.nombre as curso_nombre, g.grado, g.seccion, g.anio'
    );

    if (!asignaturaActual) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }
    const { curso_id, grado } = asignaturaActual;
    const anioMin = 2024;
    const anioMax = Math.max(anioMin, anio_activo - 1);

    if (anio_activo <= 2024) {
      return res.json({ porAnio: {}, años: [] });
    }

    // Obtener asignaturas del mismo curso y grado, años 2024 a anio_activo-1 (cualquier docente)
    const asignaturasAnteriores = await query(
      `SELECT a.id as asignatura_id, g.anio, c.nombre as curso_nombre, g.grado, g.seccion,
              CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN personal p ON p.id = a.personal_id
       WHERE a.curso_id = ? AND g.grado = ? AND a.colegio_id = ?
         AND g.anio >= ? AND g.anio <= ?
       ORDER BY g.anio DESC, g.seccion ASC`,
      [curso_id, grado, colegio_id, anioMin, anioMax]
    );

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';

    const porAnio = {};
    const añosSet = new Set();

    for (const asig of asignaturasAnteriores) {
      const temas = await query(
        `SELECT id, nombre, archivo, enlace, ciclo, orden, fecha_hora
         FROM asignaturas_archivos WHERE asignatura_id = ?
         ORDER BY ciclo ASC, orden ASC, id ASC`,
        [asig.asignatura_id]
      );

      const temasConUrl = temas.map(t => {
        let archivoUrl = null;
        if (t.archivo && t.archivo !== '') {
          if (t.archivo.startsWith('http')) {
            archivoUrl = t.archivo;
          } else {
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${t.archivo.replace(/^\/Static\/Archivos\//, '')}`
              : `${phpSystemUrl}/Static/Archivos/${t.archivo.replace(/^\/Static\/Archivos\//, '')}`;
          }
        }
        return {
          ...t,
          asignatura_id: asig.asignatura_id,
          asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
          docente_nombre: asig.docente_nombre || 'Docente',
          archivo_url: archivoUrl,
          enlace_url: t.enlace && t.enlace.trim() !== '' ? t.enlace.trim() : null
        };
      });

      if (temasConUrl.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...temasConUrl);
        añosSet.add(asig.anio);
      }
    }

    const años = Array.from(añosSet).sort((a, b) => b - a);

    res.json({ porAnio, años });
  } catch (error) {
    console.error('Error obteniendo biblioteca de temas:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de temas' });
  }
});

/**
 * POST /api/docente/aula-virtual/copiar-temas-biblioteca
 * Copiar temas seleccionados desde la biblioteca al año actual
 * Body: { asignatura_id, items: [{ asignatura_origen_id, tema_id }, ...] }
 */
router.post('/aula-virtual/copiar-temas-biblioteca', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, items } = req.body;

    if (!asignatura_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'asignatura_id e items son requeridos' });
    }

    const asignaturaDestino = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a la asignatura destino'
    );
    if (!asignaturaDestino) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaDestino);

    let copiados = 0;

    for (const item of items) {
      const { asignatura_origen_id, tema_id } = item;
      if (!asignatura_origen_id || !tema_id) continue;

      const tema = await query(
        `SELECT * FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`,
        [tema_id, asignatura_origen_id]
      );

      if (tema.length === 0) continue;

      const t = tema[0];
      const enlaceVal = (t.enlace && String(t.enlace).trim() !== '') ? t.enlace : '';

      await execute(
        `INSERT INTO asignaturas_archivos (asignatura_id, trabajador_id, nombre, archivo, enlace, fecha_hora, ciclo, orden, visto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [asignatura_id, trabajadorId, t.nombre, t.archivo || '', enlaceVal, fechaHoraMySQLLima(), t.ciclo, t.orden, t.visto || '']
      );
      copiados++;
    }

    res.json({ success: true, copiados });
  } catch (error) {
    console.error('Error copiando temas desde biblioteca:', error);
    res.status(500).json({ error: 'Error al copiar temas desde biblioteca' });
  }
});

// Helper: obtener asignaturas del mismo curso/grado, años 2024 a anio_activo-1
async function obtenerAsignaturasBiblioteca(req, asignatura_id) {
  const { colegio_id, anio_activo } = req.user;
  const asignaturaActual = await fetchAsignaturaConAcceso(
    query,
    req,
    asignatura_id,
    'a.*, c.nombre as curso_nombre, g.grado, g.seccion, g.anio'
  );
  if (!asignaturaActual) return null;
  const { curso_id, grado } = asignaturaActual;
  const anioMin = 2024;
  const anioMax = Math.max(anioMin, anio_activo - 1);
  if (anio_activo <= 2024) return { asignaturas: [], curso_id, grado };
  const asignaturas = await query(
    `SELECT a.id as asignatura_id, g.anio, c.nombre as curso_nombre, g.grado, g.seccion,
            CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN grupos g ON g.id = a.grupo_id
     LEFT JOIN personal p ON p.id = a.personal_id
     WHERE a.curso_id = ? AND g.grado = ? AND a.colegio_id = ?
       AND g.anio >= ? AND g.anio <= ?
     ORDER BY g.anio DESC, g.seccion ASC`,
    [curso_id, grado, colegio_id, anioMin, anioMax]
  );
  return { asignaturas };
}

/**
 * GET /api/docente/aula-virtual/biblioteca-tareas
 */
router.get('/aula-virtual/biblioteca-tareas', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const data = await obtenerAsignaturasBiblioteca(req, asignatura_id);
    if (!data) return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    const porAnio = {};
    const añosSet = new Set();
    for (const asig of data.asignaturas) {
      const items = await query(
        `SELECT id, titulo, descripcion, ciclo, fecha_entrega FROM asignaturas_tareas WHERE asignatura_id = ? ORDER BY ciclo ASC, id ASC`,
        [asig.asignatura_id]
      );
      const mapped = items.map(t => ({
        ...t,
        asignatura_id: asig.asignatura_id,
        asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
        docente_nombre: asig.docente_nombre || 'Docente'
      }));
      if (mapped.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...mapped);
        añosSet.add(asig.anio);
      }
    }
    res.json({ porAnio, años: Array.from(añosSet).sort((a, b) => b - a) });
  } catch (error) {
    console.error('Error biblioteca tareas:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de tareas' });
  }
});

/**
 * GET /api/docente/aula-virtual/biblioteca-examenes
 */
router.get('/aula-virtual/biblioteca-examenes', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const data = await obtenerAsignaturasBiblioteca(req, asignatura_id);
    if (!data) return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    const porAnio = {};
    const añosSet = new Set();
    for (const asig of data.asignaturas) {
      const items = await query(
        `SELECT id, titulo, ciclo FROM asignaturas_examenes WHERE asignatura_id = ? ORDER BY ciclo ASC, id ASC`,
        [asig.asignatura_id]
      );
      const mapped = items.map(e => ({
        ...e,
        asignatura_id: asig.asignatura_id,
        asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
        docente_nombre: asig.docente_nombre || 'Docente'
      }));
      if (mapped.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...mapped);
        añosSet.add(asig.anio);
      }
    }
    res.json({ porAnio, años: Array.from(añosSet).sort((a, b) => b - a) });
  } catch (error) {
    console.error('Error biblioteca examenes:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de exámenes' });
  }
});

/**
 * GET /api/docente/aula-virtual/biblioteca-videos
 */
router.get('/aula-virtual/biblioteca-videos', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const data = await obtenerAsignaturasBiblioteca(req, asignatura_id);
    if (!data) return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    const porAnio = {};
    const añosSet = new Set();
    for (const asig of data.asignaturas) {
      const items = await query(
        `SELECT id, descripcion, enlace, ciclo FROM asignaturas_videos WHERE asignatura_id = ? ORDER BY ciclo ASC, id ASC`,
        [asig.asignatura_id]
      );
      const mapped = items.map(v => ({
        ...v,
        asignatura_id: asig.asignatura_id,
        asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
        docente_nombre: asig.docente_nombre || 'Docente',
        enlace_url: v.enlace && v.enlace.trim() ? v.enlace.trim() : null
      }));
      if (mapped.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...mapped);
        añosSet.add(asig.anio);
      }
    }
    res.json({ porAnio, años: Array.from(añosSet).sort((a, b) => b - a) });
  } catch (error) {
    console.error('Error biblioteca videos:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de videos' });
  }
});

/**
 * GET /api/docente/aula-virtual/biblioteca-enlaces
 */
router.get('/aula-virtual/biblioteca-enlaces', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const data = await obtenerAsignaturasBiblioteca(req, asignatura_id);
    if (!data) return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    const porAnio = {};
    const añosSet = new Set();
    for (const asig of data.asignaturas) {
      const items = await query(
        `SELECT id, descripcion, enlace, ciclo FROM asignaturas_enlaces WHERE asignatura_id = ? ORDER BY ciclo ASC, id ASC`,
        [asig.asignatura_id]
      );
      const mapped = items.map(e => ({
        ...e,
        asignatura_id: asig.asignatura_id,
        asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
        docente_nombre: asig.docente_nombre || 'Docente',
        enlace_url: e.enlace && e.enlace.trim() ? e.enlace.trim() : null
      }));
      if (mapped.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...mapped);
        añosSet.add(asig.anio);
      }
    }
    res.json({ porAnio, años: Array.from(añosSet).sort((a, b) => b - a) });
  } catch (error) {
    console.error('Error biblioteca enlaces:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de enlaces' });
  }
});

/**
 * GET /api/docente/aula-virtual/biblioteca-sesiones
 * Sesiones PDF del mismo curso/grado en años anteriores (misma lógica que otras bibliotecas).
 */
router.get('/aula-virtual/biblioteca-sesiones', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id } = req.query;
    if (!asignatura_id) return res.status(400).json({ error: 'asignatura_id es requerido' });
    const data = await obtenerAsignaturasBiblioteca(req, asignatura_id);
    if (!data) return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const porAnio = {};
    const añosSet = new Set();
    for (const asig of data.asignaturas) {
      const items = await query(
        `SELECT s.id, s.tema_id, s.titulo, s.descripcion, s.archivo, s.ciclo
         FROM asignaturas_sesion_pdf s
         WHERE s.asignatura_id = ?
         ORDER BY s.ciclo ASC, s.id ASC`,
        [asig.asignatura_id]
      );
      const mapped = (items || []).map((s) => {
        let archivo_url = null;
        if (s.archivo && String(s.archivo).trim() !== '') {
          const nombre = String(s.archivo).startsWith('/Static/Archivos/')
            ? String(s.archivo).replace(/^\/Static\/Archivos\//, '')
            : String(s.archivo);
          archivo_url = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombre}`
            : `${phpSystemUrl}/Static/Archivos/${nombre}`;
        }
        return {
          ...s,
          nombre:
            (s.descripcion && String(s.descripcion).trim()) ||
            (s.titulo && String(s.titulo).trim()) ||
            'Sesión PDF',
          asignatura_id: asig.asignatura_id,
          asignatura_label: `${asig.curso_nombre} - ${asig.grado}° ${asig.seccion} (${asig.anio})`,
          docente_nombre: asig.docente_nombre || 'Docente',
          archivo_url,
        };
      });
      if (mapped.length > 0) {
        if (!porAnio[asig.anio]) porAnio[asig.anio] = [];
        porAnio[asig.anio].push(...mapped);
        añosSet.add(asig.anio);
      }
    }
    res.json({ porAnio, años: Array.from(añosSet).sort((a, b) => b - a) });
  } catch (error) {
    console.error('Error biblioteca sesiones:', error);
    res.status(500).json({ error: 'Error al obtener biblioteca de sesiones' });
  }
});

/**
 * POST /api/docente/aula-virtual/copiar-biblioteca
 * Copiar items desde biblioteca al año actual (tareas, examenes, videos, enlaces, sesiones)
 * Body: { asignatura_id, tipo: 'tareas'|'examenes'|'videos'|'enlaces'|'sesiones', items: [{ asignatura_origen_id, item_id }] }
 * Nota: El ciclo/bimestre se conserva al copiar
 */
router.post('/aula-virtual/copiar-biblioteca', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, tipo, items } = req.body;

    if (!asignatura_id || !tipo || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'asignatura_id, tipo e items son requeridos' });
    }

    const tiposValidos = ['tareas', 'examenes', 'videos', 'enlaces', 'sesiones'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser: tareas, examenes, videos, enlaces o sesiones' });
    }

    const asignaturaDestinoRow = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a la asignatura destino'
    );
    if (!asignaturaDestinoRow) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaDestinoRow);

    let copiados = 0;

    if (tipo === 'tareas') {
      for (const item of items) {
        const { asignatura_origen_id, item_id } = item;
        if (!asignatura_origen_id || !item_id) continue;
        const tarea = await query(`SELECT * FROM asignaturas_tareas WHERE id = ? AND asignatura_id = ?`, [item_id, asignatura_origen_id]);
        if (tarea.length === 0) continue;
        const t = tarea[0];
        const resultado = await execute(
          `INSERT INTO asignaturas_tareas (titulo, descripcion, fecha_hora, fecha_entrega, trabajador_id, asignatura_id, ciclo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.titulo, t.descripcion || '', fechaHoraMySQLLima(), t.fecha_entrega || null, trabajadorId, asignatura_id, t.ciclo]
        );
        const nuevaTareaId = resultado.insertId;
        const archivosTarea = await query(`SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`, [item_id]);
        for (const arch of archivosTarea) {
          await execute(`INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo) VALUES (?, ?, ?)`, [nuevaTareaId, arch.nombre, arch.archivo]);
        }
        copiados++;
      }
    } else if (tipo === 'examenes') {
      for (const item of items) {
        const { asignatura_origen_id, item_id } = item;
        if (!asignatura_origen_id || !item_id) continue;
        const examen = await query(`SELECT * FROM asignaturas_examenes WHERE id = ? AND asignatura_id = ?`, [item_id, asignatura_origen_id]);
        if (examen.length === 0) continue;
        const ex = examen[0];
        const resultado = await execute(
          `INSERT INTO asignaturas_examenes (trabajador_id, titulo, tipo, archivo_pdf, fecha_desde, fecha_hasta, hora_desde, hora_hasta, asignatura_id, ciclo, preguntas_max, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, tiempo, intentos, estado, orden_preguntas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [trabajadorId, ex.titulo, ex.tipo || 'VIRTUAL', ex.archivo_pdf || '', ex.fecha_desde || new Date(), ex.fecha_hasta || new Date(), ex.hora_desde || '08:00', ex.hora_hasta || '20:00', asignatura_id, ex.ciclo, ex.preguntas_max || 1, ex.tipo_puntaje || 'GENERAL', ex.puntos_correcta || 1, ex.penalizar_incorrecta || 'NO', ex.penalizacion_incorrecta || 0, ex.tiempo || 60, ex.intentos || 1, ex.estado || 'INACTIVO', ex.orden_preguntas || 'PREDETERMINADO']
        );
        const nuevoExamenId = resultado.insertId;
        try {
          const bloqueSrc = await query(
            `SELECT contenido, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
            [item_id]
          );
          if (bloqueSrc.length > 0) {
            const bs = bloqueSrc[0];
            const plain = (bs.contenido || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            const hasImg = bs.imagen && String(bs.imagen).trim();
            if (plain || hasImg) {
              await execute(
                `INSERT INTO asignaturas_examenes_bloques (examen_id, contenido, imagen) VALUES (?, ?, ?)`,
                [nuevoExamenId, bs.contenido || null, hasImg ? bs.imagen : null]
              );
            }
          }
        } catch (bloqueCopyErr) {
          if (bloqueCopyErr && bloqueCopyErr.code !== 'ER_NO_SUCH_TABLE') {
            console.warn('Copiar bloque examen (biblioteca):', bloqueCopyErr.message);
          }
        }
        const preguntas = await query(`SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`, [item_id]);
        const mapeoAlt = {};
        for (const p of preguntas) {
          const resP = await execute(
            `INSERT INTO asignaturas_examenes_preguntas (examen_id, descripcion, puntos, orden, tipo, imagen_puzzle, datos_adicionales) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nuevoExamenId, p.descripcion, p.puntos || 1, p.orden, p.tipo || 'ALTERNATIVAS', p.imagen_puzzle || '', p.datos_adicionales]
          );
          const nuevaPregId = resP.insertId;
          const alts = await query(`SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`, [p.id]);
          for (const alt of alts) {
            const resAlt = await execute(
              `INSERT INTO asignaturas_examenes_preguntas_alternativas (pregunta_id, descripcion, correcta, orden_posicion, par_id, zona_drop) VALUES (?, ?, ?, ?, ?, ?)`,
              [nuevaPregId, alt.descripcion, alt.correcta || 'NO', alt.orden_posicion, null, alt.zona_drop]
            );
            mapeoAlt[alt.id] = resAlt.insertId;
          }
        }
        for (const p of preguntas) {
          const alts = await query(`SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`, [p.id]);
          const nuevasPreguntas = await query(`SELECT id FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`, [nuevoExamenId]);
          const idx = preguntas.findIndex(x => x.id === p.id);
          const nuevaPregId = nuevasPreguntas[idx]?.id;
          if (!nuevaPregId) continue;
          const nuevasAlts = await query(`SELECT id FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`, [nuevaPregId]);
          for (let i = 0; i < alts.length; i++) {
            const alt = alts[i];
            const nuevaAltId = nuevasAlts[i]?.id;
            if (alt.par_id && mapeoAlt[alt.par_id] && nuevaAltId) {
              await execute(`UPDATE asignaturas_examenes_preguntas_alternativas SET par_id = ? WHERE id = ?`, [mapeoAlt[alt.par_id], nuevaAltId]);
            }
          }
        }
        copiados++;
      }
    } else if (tipo === 'videos') {
      for (const item of items) {
        const { asignatura_origen_id, item_id } = item;
        if (!asignatura_origen_id || !item_id) continue;
        const video = await query(`SELECT * FROM asignaturas_videos WHERE id = ? AND asignatura_id = ?`, [item_id, asignatura_origen_id]);
        if (video.length === 0) continue;
        const v = video[0];
        await execute(
          `INSERT INTO asignaturas_videos (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?)`,
          [asignatura_id, trabajadorId, v.descripcion || '', v.enlace || '', v.ciclo, fechaHoraMySQLLima()]
        );
        copiados++;
      }
    } else if (tipo === 'enlaces') {
      for (const item of items) {
        const { asignatura_origen_id, item_id } = item;
        if (!asignatura_origen_id || !item_id) continue;
        const enlace = await query(`SELECT * FROM asignaturas_enlaces WHERE id = ? AND asignatura_id = ?`, [item_id, asignatura_origen_id]);
        if (enlace.length === 0) continue;
        const e = enlace[0];
        await execute(
          `INSERT INTO asignaturas_enlaces (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora) VALUES (?, ?, ?, ?, ?, ?)`,
          [asignatura_id, trabajadorId, e.descripcion || '', e.enlace || '', e.ciclo, fechaHoraMySQLLima()]
        );
        copiados++;
      }
    } else if (tipo === 'sesiones') {
      const [destRow] = await query(`SELECT colegio_id FROM asignaturas WHERE id = ?`, [asignatura_id]);
      const colegioDest = destRow?.colegio_id || colegio_id;
      for (const item of items) {
        const { asignatura_origen_id, item_id } = item;
        if (!asignatura_origen_id || !item_id) continue;
        const sesionRows = await query(
          `SELECT * FROM asignaturas_sesion_pdf WHERE id = ? AND asignatura_id = ?`,
          [item_id, asignatura_origen_id]
        );
        if (sesionRows.length === 0) continue;
        const s = sesionRows[0];
        const temaDestinoId = await resolverTemaDestinoId(query, {
          temaOrigenId: s.tema_id,
          asignaturaOrigenId: asignatura_origen_id,
          asignaturaDestinoId: asignatura_id,
        });
        if (!temaDestinoId) continue;
        await execute(
          `INSERT INTO asignaturas_sesion_pdf (asignatura_id, tema_id, titulo, descripcion, archivo, ciclo, trabajador_id, fecha_hora, colegio_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            asignatura_id,
            temaDestinoId,
            s.titulo || 'SESION',
            s.descripcion || '',
            s.archivo,
            s.ciclo,
            trabajadorId,
            fechaHoraMySQLLima(),
            colegioDest,
          ]
        );
        copiados++;
      }
    }

    res.json({ success: true, copiados });
  } catch (error) {
    console.error('Error copiando desde biblioteca:', error);
    res.status(500).json({ error: 'Error al copiar desde biblioteca' });
  }
});

/**
 * PUT /api/docente/aula-virtual/archivos/ordenar
 * Actualizar el orden de los temas
 * IMPORTANTE: Esta ruta debe estar ANTES de /aula-virtual/archivos/:id
 */
router.put('/aula-virtual/archivos/ordenar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, ciclo, ordenes } = req.body;

    console.log('Datos recibidos para ordenar:', { asignatura_id, ciclo, ordenes, tipo_ciclo: typeof ciclo });

    if (!asignatura_id || ciclo === undefined || ciclo === null || !ordenes || !Array.isArray(ordenes)) {
      return res.status(400).json({ 
        error: 'asignatura_id, ciclo y ordenes (array) son requeridos',
        recibido: { asignatura_id, ciclo, ordenes: Array.isArray(ordenes) ? ordenes.length : 'no es array' }
      });
    }

    if (ordenes.length === 0) {
      return res.status(400).json({ error: 'El array de ordenes no puede estar vacío' });
    }

    // Asegurar que ciclo sea un número
    const cicloNum = parseInt(ciclo);
    if (isNaN(cicloNum)) {
      return res.status(400).json({ error: 'ciclo debe ser un número válido' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.id',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Validar que cada ordenItem tenga id y orden
    for (const ordenItem of ordenes) {
      const itemId = parseInt(ordenItem.id, 10);
      if (!Number.isFinite(itemId) || ordenItem.orden === undefined || ordenItem.orden === null) {
        return res.status(400).json({
          error: 'Cada elemento de ordenes debe tener id y orden',
          item_invalido: ordenItem,
        });
      }
    }

    const asignaturaIdNum = parseInt(asignatura_id, 10);
    const archivosIds = ordenes.map((item) => parseInt(item.id, 10));
    const archivosExistentes = await query(
      `SELECT id, ciclo FROM asignaturas_archivos
       WHERE id IN (${archivosIds.map(() => '?').join(',')})
       AND asignatura_id = ?`,
      [...archivosIds, asignaturaIdNum]
    );

    if (archivosExistentes.length !== archivosIds.length) {
      const idsExistentesSet = new Set(archivosExistentes.map((a) => Number(a.id)));
      const idsFaltantes = archivosIds.filter((id) => !idsExistentesSet.has(id));
      return res.status(400).json({
        error: 'Algunos archivos no existen o no pertenecen a esta asignatura',
        ids_faltantes: idsFaltantes,
      });
    }

    const cicloPorId = new Map(archivosExistentes.map((a) => [a.id, parseInt(a.ciclo, 10)]));
    const idsCicloDistinto = archivosIds.filter((id) => cicloPorId.get(id) !== cicloNum);
    if (idsCicloDistinto.length > 0) {
      return res.status(400).json({
        error: 'Algunos temas no pertenecen al bimestre seleccionado',
        ids_ciclo_distinto: idsCicloDistinto,
      });
    }

    let actualizados = 0;
    try {
      for (const ordenItem of ordenes) {
        const resultado = await execute(
          `UPDATE asignaturas_archivos
           SET orden = ?
           WHERE id = ? AND asignatura_id = ?`,
          [parseInt(ordenItem.orden, 10), parseInt(ordenItem.id, 10), asignaturaIdNum]
        );
        if (resultado.affectedRows > 0) actualizados += 1;
      }
    } catch (error) {
      console.error('Error actualizando orden individual:', error);
      throw error;
    }

    if (actualizados !== ordenes.length) {
      return res.status(400).json({
        error: 'No se pudo guardar el orden de todos los temas. Recargue e intente de nuevo.',
        actualizados,
        esperados: ordenes.length,
      });
    }

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: null,
      descripcion: `Reordenó ${ordenes.length} tema(s) en ciclo ${cicloNum}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ accion: 'REORDENAR', ordenes }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Orden actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando orden:', error);
    res.status(500).json({ error: 'Error al actualizar el orden' });
  }
});

/**
 * POST /api/docente/aula-virtual/archivos
 * Crear un nuevo tema interactivo (archivo)
 */
router.post('/aula-virtual/archivos', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, nombre, enlace, ciclo } = req.body;

    if (!asignatura_id || !nombre) {
      return res.status(400).json({ error: 'asignatura_id y nombre son requeridos' });
    }

    if (!req.file && !enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaAcceso);

    // Obtener el máximo orden para este ciclo
    const maxOrden = await query(
      `SELECT COALESCE(MAX(orden), 0) as max_orden FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?`,
      [asignatura_id, ciclo || 1]
    );

    const nuevoOrden = (maxOrden[0]?.max_orden || 0) + 1;

    // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
    // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
    // Si guardamos la ruta completa, se duplicaría: /Static/Archivos//Static/Archivos/...
    let archivoPath = '';
    if (req.file) {
      // Guardar solo el nombre del archivo (igual que el sistema PHP)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TEMA] Archivo guardado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // IMPORTANTE: Guardar el enlace tal cual (sin normalizar) para compatibilidad con sistema PHP
    // El sistema PHP muestra el enlace directamente desde la BD, igual que en "Enlaces"
    // Si normalizamos aquí, puede causar problemas en el sistema PHP
    const enlaceFinal = (enlace && enlace.trim() !== '') ? enlace.trim() : '';

    // Preparar datos para auditoría
    const datosNuevos = { nombre, ciclo: ciclo || 1, archivo: archivoPath, enlace: enlaceFinal };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = fechaMySQLLima(ahora);
    const hora = horaMySQLLima(ahora);
    const fechaHoraAud = fechaHoraMySQLLima(ahora);

    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'archivo',
        null, // Temporalmente null, se actualizará después
        `Creó tema: "${nombre}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        fechaHoraAud,
        fecha,
        hora,
      ]
    );

    const fechaHoraTema = fechaHoraMySQLLima(ahora);

    // Insertar el nuevo tema
    const result = await execute(
      `INSERT INTO asignaturas_archivos 
       (asignatura_id, trabajador_id, nombre, archivo, visto, fecha_hora, ciclo, enlace, orden)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`,
      [
        asignatura_id,
        trabajadorId,
        nombre,
        archivoPath,
        fechaHoraTema,
        ciclo || 1,
        enlaceFinal,
        nuevoOrden
      ]
    );

    // Actualizar auditoría con el ID del tema
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'tema',
        nombre: nombre,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      message: 'Tema creado correctamente',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando tema:', error);
    res.status(500).json({ error: 'Error al crear el tema' });
  }
});

/**
 * PUT /api/docente/aula-virtual/archivos/:id
 * Actualizar un tema interactivo
 */
router.put('/aula-virtual/archivos/:id', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;
    const { asignatura_id, nombre, enlace, ciclo } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'nombre es requerido' });
    }

    // Verificar que el tema existe y el usuario tiene acceso (docente titular o admin/promotoría)
    const accesoTema = await verificarAccesoTemaArchivo(req, res, id);
    if (!accesoTema) return;
    const temaActual = accesoTema.tema;

    let archivoPath = temaActual.archivo;

    // Si se subió un nuevo archivo, actualizar (guardar solo el nombre del archivo, como el sistema PHP)
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
      // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TEMA] Archivo actualizado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Si no hay archivo nuevo y no hay enlace, mantener el archivo existente
    if (!req.file && !enlace && !temaActual.archivo && !temaActual.enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    // IMPORTANTE: Guardar el enlace tal cual (sin normalizar) para compatibilidad con sistema PHP
    // El sistema PHP muestra el enlace directamente desde la BD, igual que en "Enlaces"
    // Si normalizamos aquí, puede causar problemas en el sistema PHP
    let enlaceFinal = temaActual.enlace || ''; // Mantener el existente por defecto
    if (enlace && enlace.trim() !== '') {
      enlaceFinal = enlace.trim(); // Guardar tal cual, sin normalizar
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { nombre, ciclo: ciclo || temaActual.ciclo, archivo: archivoPath, enlace: enlaceFinal };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: parseInt(id),
      descripcion: `Editó tema: "${temaActual.nombre}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(temaActual),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar el tema
    await execute(
      `UPDATE asignaturas_archivos 
       SET nombre = ?, archivo = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [
        nombre,
        archivoPath,
        enlaceFinal,
        ciclo || temaActual.ciclo,
        id
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tema actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando tema:', error);
    res.status(500).json({ error: 'Error al actualizar el tema' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/archivos/:id
 * Eliminar un tema interactivo
 */
router.delete('/aula-virtual/archivos/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;

    const accesoTema = await verificarAccesoTemaArchivo(req, res, id);
    if (!accesoTema) return;
    const temaActual = accesoTema.tema;

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: parseInt(id),
      descripcion: `Eliminó tema: "${temaActual.nombre}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(temaActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el tema
    await execute(
      `DELETE FROM asignaturas_archivos WHERE id = ?`,
      [id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tema eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando tema:', error);
    res.status(500).json({ error: 'Error al eliminar el tema' });
  }
});

/**
 * GET /api/docente/aula-virtual/videos
 * Obtener videos de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/videos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener videos de la asignatura filtrados por ciclo
    const videos = await query(
      `SELECT * FROM asignaturas_videos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ videos: videos || [] });
  } catch (error) {
    console.error('Error obteniendo videos:', error);
    res.status(500).json({ error: 'Error al obtener videos' });
  }
});

/**
 * GET /api/docente/aula-virtual/enlaces
 * Obtener enlaces de ayuda de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/enlaces', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    // Obtener enlaces de la asignatura filtrados por ciclo
    const enlaces = await query(
      `SELECT * FROM asignaturas_enlaces
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ enlaces: enlaces || [] });
  } catch (error) {
    console.error('Error obteniendo enlaces:', error);
    res.status(500).json({ error: 'Error al obtener enlaces' });
  }
});

/**
 * POST /api/docente/aula-virtual/videos
 * Crear un nuevo video
 */
router.post('/aula-virtual/videos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { asignatura_id, descripcion, enlace, ciclo } = req.body;

    console.log('📹 [VIDEO] Datos recibidos:', { asignatura_id, descripcion, enlace, ciclo });
    console.log('📹 [VIDEO] Usuario:', { usuario_id, colegio_id, personal_id, anio_activo });

    if (!asignatura_id || !descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, descripcion, enlace y ciclo son requeridos' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaAcceso);

    // Preparar datos para auditoría
    const datosNuevos = { asignatura_id, descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = fechaMySQLLima(ahora);
    const hora = horaMySQLLima(ahora);
    const fechaHoraAud = fechaHoraMySQLLima(ahora);

    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'video',
        null, // Temporalmente null, se actualizará después
        `Creó video: "${descripcion}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        fechaHoraAud,
        fecha,
        hora,
      ]
    );

    const fechaHoraVideo = fechaHoraMySQLLima(ahora);

    // Insertar video
    const result = await execute(
      `INSERT INTO asignaturas_videos (asignatura_id, descripcion, enlace, trabajador_id, fecha_hora, ciclo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [asignatura_id, descripcion, enlace, trabajadorId, fechaHoraVideo, ciclo]
    );

    // Actualizar auditoría con el ID del video
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'video',
        nombre: descripcion,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      success: true, 
      message: 'Video creado correctamente',
      video_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando video:', error);
    res.status(500).json({ error: 'Error al crear video' });
  }
});

/**
 * PUT /api/docente/aula-virtual/videos/:videoId
 * Actualizar un video
 */
router.put('/aula-virtual/videos/:videoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { videoId } = req.params;
    const { descripcion, enlace, ciclo } = req.body;

    if (!descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'descripcion, enlace y ciclo son requeridos' });
    }

    // Obtener video actual
    const videoActual = await query(
      `SELECT av.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_videos av
       INNER JOIN asignaturas a ON a.id = av.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE av.id = ?`,
      [videoId]
    );

    if (videoActual.length === 0) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      videoActual[0].asignatura_id,
      'a.id',
      'No tienes acceso a este video'
    );
    if (!asignaturaAcceso) return;

    // Preparar datos nuevos para auditoría
    const datosNuevos = { descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'video',
      entidad_id: parseInt(videoId),
      descripcion: `Editó video: "${videoActual[0].descripcion}" (ID: ${videoId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(videoActual[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar video
    await execute(
      `UPDATE asignaturas_videos 
       SET descripcion = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [descripcion, enlace, ciclo, videoId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Video actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando video:', error);
    res.status(500).json({ error: 'Error al actualizar video' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/videos/:videoId
 * Eliminar un video
 */
router.delete('/aula-virtual/videos/:videoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { videoId } = req.params;

    // Obtener video actual
    const videoActual = await query(
      `SELECT av.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_videos av
       INNER JOIN asignaturas a ON a.id = av.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE av.id = ?`,
      [videoId]
    );

    if (videoActual.length === 0) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    // Verificar acceso (docente titular o admin/promotoría)
    const asignaturaAccesoVideoDel = await verificarAccesoAsignatura(
      req,
      res,
      videoActual[0].asignatura_id,
      'a.id',
      'No tienes acceso a este video'
    );
    if (!asignaturaAccesoVideoDel) return;

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'video',
      entidad_id: parseInt(videoId),
      descripcion: `Eliminó video: "${videoActual[0].descripcion}" (ID: ${videoId})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(videoActual[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar video
    await execute(
      `DELETE FROM asignaturas_videos WHERE id = ?`,
      [videoId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Video eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando video:', error);
    res.status(500).json({ error: 'Error al eliminar video' });
  }
});

/**
 * POST /api/docente/aula-virtual/enlaces
 * Crear un nuevo enlace de ayuda
 */
router.post('/aula-virtual/enlaces', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { asignatura_id, descripcion, enlace, ciclo } = req.body;

    console.log('🔗 [ENLACE] Datos recibidos:', { asignatura_id, descripcion, enlace, ciclo });
    console.log('🔗 [ENLACE] Usuario:', { usuario_id, colegio_id, personal_id, anio_activo });

    if (!asignatura_id || !descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, descripcion, enlace y ciclo son requeridos' });
    }

    const asignaturaAcceso = await verificarAccesoAsignatura(
      req,
      res,
      asignatura_id,
      'a.*',
      'No tienes acceso a esta asignatura'
    );
    if (!asignaturaAcceso) return;

    const trabajadorId = trabajadorIdParaAsignatura(req, asignaturaAcceso);

    // Preparar datos para auditoría
    const datosNuevos = { asignatura_id, descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = fechaMySQLLima(ahora);
    const hora = horaMySQLLima(ahora);
    const fechaHoraAud = fechaHoraMySQLLima(ahora);

    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'enlace',
        null, // Temporalmente null, se actualizará después
        `Creó enlace: "${descripcion}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        fechaHoraAud,
        fecha,
        hora,
      ]
    );

    const fechaHoraEnlace = fechaHoraMySQLLima(ahora);

    // Insertar enlace
    const result = await execute(
      `INSERT INTO asignaturas_enlaces (asignatura_id, descripcion, enlace, trabajador_id, fecha_hora, ciclo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [asignatura_id, descripcion, enlace, trabajadorId, fechaHoraEnlace, ciclo]
    );

    // Actualizar auditoría con el ID del enlace
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'enlace',
        nombre: descripcion,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      success: true, 
      message: 'Enlace creado correctamente',
      enlace_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando enlace:', error);
    res.status(500).json({ error: 'Error al crear enlace' });
  }
});

/**
 * PUT /api/docente/aula-virtual/enlaces/:enlaceId
 * Actualizar un enlace de ayuda
 */
router.put('/aula-virtual/enlaces/:enlaceId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { enlaceId } = req.params;
    const { descripcion, enlace, ciclo } = req.body;

    if (!descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'descripcion, enlace y ciclo son requeridos' });
    }

    // Obtener enlace actual
    const enlaceActual = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_enlaces ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ?`,
      [enlaceId]
    );

    if (enlaceActual.length === 0) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }

    const asignaturaAccesoEnlacePut = await verificarAccesoAsignatura(
      req,
      res,
      enlaceActual[0].asignatura_id,
      'a.id',
      'No tienes acceso a este enlace'
    );
    if (!asignaturaAccesoEnlacePut) return;

    // Preparar datos nuevos para auditoría
    const datosNuevos = { descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'enlace',
      entidad_id: parseInt(enlaceId),
      descripcion: `Editó enlace: "${enlaceActual[0].descripcion}" (ID: ${enlaceId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(enlaceActual[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar enlace
    await execute(
      `UPDATE asignaturas_enlaces 
       SET descripcion = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [descripcion, enlace, ciclo, enlaceId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Enlace actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando enlace:', error);
    res.status(500).json({ error: 'Error al actualizar enlace' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/enlaces/:enlaceId
 * Eliminar un enlace de ayuda
 */
router.delete('/aula-virtual/enlaces/:enlaceId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { enlaceId } = req.params;

    // Obtener enlace actual
    const enlaceActual = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_enlaces ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ?`,
      [enlaceId]
    );

    if (enlaceActual.length === 0) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }

    const asignaturaAccesoEnlaceDel = await verificarAccesoAsignatura(
      req,
      res,
      enlaceActual[0].asignatura_id,
      'a.id',
      'No tienes acceso a este enlace'
    );
    if (!asignaturaAccesoEnlaceDel) return;

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'enlace',
      entidad_id: parseInt(enlaceId),
      descripcion: `Eliminó enlace: "${enlaceActual[0].descripcion}" (ID: ${enlaceId})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(enlaceActual[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar enlace
    await execute(
      `DELETE FROM asignaturas_enlaces WHERE id = ?`,
      [enlaceId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Enlace eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando enlace:', error);
    res.status(500).json({ error: 'Error al eliminar enlace' });
  }
});

/**
 * POST /api/docente/actividades/importar-calendario
 * Importar actividades desde calendarizacion.json a la base de datos
 * Solo para administradores o docentes autorizados
 */
router.post('/actividades/importar-calendario', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const fs = require('fs');
    const path = require('path');

    // Ruta al archivo JSON
    const jsonPath = path.join(__dirname, '../../../calendarizacion.json');

    // Verificar que el archivo existe
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Archivo calendarizacion.json no encontrado' });
    }

    // Leer el archivo JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const año = jsonData.año || 2026;
    const meses = jsonData.meses || {};

    console.log(`📅 Iniciando importación de actividades para el año ${año}`);

    let actividadesInsertadas = 0;
    let actividadesConError = 0;
    const errores = [];

    // Procesar cada mes
    for (const [mesNum, mesData] of Object.entries(meses)) {
      const mes = parseInt(mesNum);
      const eventos = mesData.eventos || [];

      console.log(`📅 Procesando mes ${mes} (${mesData.nombre}): ${eventos.length} eventos`);

      // Procesar cada evento del mes
      for (const evento of eventos) {
        try {
          let fechaInicio, fechaFin;
          const descripcion = evento.texto || '';
          const lugar = 'Colegio Vanguard';
          const detalles = evento.tipo || '';

          // Determinar fechas según si tiene día único o rango
          if (evento.dia) {
            // Evento de un solo día
            fechaInicio = new Date(año, mes - 1, evento.dia, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.dia, 23, 59, 59);
          } else if (evento.rango && evento.rango.inicio && evento.rango.fin) {
            // Evento con rango de días
            fechaInicio = new Date(año, mes - 1, evento.rango.inicio, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.rango.fin, 23, 59, 59);
          } else {
            // Si no tiene ni día ni rango válido, saltar
            console.warn(`⚠️ Evento sin fecha válida: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'No tiene día ni rango válido'
            });
            continue;
          }

          // Validar que las fechas sean válidas
          if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
            console.warn(`⚠️ Fecha inválida para evento: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'Fecha inválida'
            });
            continue;
          }

          // Formatear fechas para MySQL (YYYY-MM-DD HH:mm:ss), calendario Lima
          const fechaInicioStr = fechaHoraMySQLLima(fechaInicio);
          const fechaFinStr = fechaHoraMySQLLima(fechaFin);

          // Verificar si ya existe una actividad similar (evitar duplicados)
          const actividadesExistentes = await query(
            `SELECT id FROM actividades 
             WHERE colegio_id = ? 
             AND descripcion = ? 
             AND DATE(fecha_inicio) = DATE(?) 
             AND DATE(fecha_fin) = DATE(?)`,
            [colegio_id, descripcion, fechaInicioStr, fechaFinStr]
          );

          if (actividadesExistentes.length > 0) {
            console.log(`⏭️ Actividad ya existe, saltando: ${descripcion} (${fechaInicioStr})`);
            continue;
          }

          // Insertar actividad en la base de datos
          await execute(
            `INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [colegio_id, descripcion, lugar, detalles, fechaInicioStr, fechaFinStr, usuario_id]
          );

          actividadesInsertadas++;
          console.log(`✅ Actividad insertada: ${descripcion} (${fechaInicioStr} - ${fechaFinStr})`);

        } catch (error) {
          console.error(`❌ Error procesando evento:`, error);
          actividadesConError++;
          errores.push({
            evento: evento.texto || 'Desconocido',
            error: error.message
          });
        }
      }
    }

    // Registrar acción en auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'IMPORTAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividades',
      entidad_id: null,
      descripcion: `Importación de actividades desde calendarizacion.json - ${actividadesInsertadas} insertadas`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: {
        año,
        actividades_insertadas: actividadesInsertadas,
        actividades_con_error: actividadesConError
      },
      resultado: actividadesConError === 0 ? 'EXITOSO' : 'PARCIAL'
    });

    res.json({
      success: true,
      message: `Importación completada: ${actividadesInsertadas} actividades insertadas`,
      año,
      actividades_insertadas: actividadesInsertadas,
      actividades_con_error: actividadesConError,
      errores: errores.length > 0 ? errores : undefined
    });

  } catch (error) {
    console.error('Error importando actividades:', error);
    res.status(500).json({ 
      error: 'Error al importar actividades',
      detalles: error.message 
    });
  }
});

/**
 * ============================================================
 * ENDPOINTS PARA PREGUNTAS Y ALTERNATIVAS DE EXÁMENES
 * ============================================================
 */

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/preguntas
 * Obtener todas las preguntas de un examen
 */
router.get('/aula-virtual/examenes/:examenId/preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    const examenAcceso = await verificarAccesoExamen(req, res, examenId);
    if (!examenAcceso) return;

    // Obtener preguntas ordenadas por orden
    const preguntas = await query(
      `SELECT * FROM asignaturas_examenes_preguntas 
       WHERE examen_id = ? 
       ORDER BY orden ASC, id ASC`,
      [examenId]
    );

    let contenido_bloqueado_para_docente = false;
    if (req.user.tipo !== 'ADMINISTRADOR') {
      contenido_bloqueado_para_docente = await examenBloqueaEdicionContenidoDocente(query, examenId);
    }

    let bloque = null;
    try {
      const bloqueRows = await query(
        `SELECT id, examen_id, contenido, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
        [examenId]
      );
      if (bloqueRows && bloqueRows.length > 0) {
        const b = bloqueRows[0];
        bloque = {
          id: b.id,
          examen_id: b.examen_id,
          contenido: b.contenido || '',
          imagen: b.imagen || null,
          imagen_url: buildArchivoPdfUrl(b.imagen)
        };
      }
    } catch (bloqueErr) {
      if (bloqueErr && bloqueErr.code === 'ER_NO_SUCH_TABLE') {
        bloque = null;
      } else {
        throw bloqueErr;
      }
    }

    res.json({
      preguntas: preguntas || [],
      contenido_bloqueado_para_docente,
      bloque
    });
  } catch (error) {
    console.error('Error obteniendo preguntas:', error);
    res.status(500).json({ error: 'Error al obtener preguntas' });
  }
});

/**
 * PUT /api/docente/aula-virtual/examenes/:examenId/bloque
 * Crear o actualizar el bloque de contexto (texto enriquecido + imagen opcional). Una fila por examen.
 */
router.put('/aula-virtual/examenes/:examenId/bloque', uploadExamenBloqueImagen.single('imagen'), async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const contenido = req.body.contenido != null ? String(req.body.contenido) : '';
    const remove_imagen =
      req.body.remove_imagen === '1' ||
      req.body.remove_imagen === 'true' ||
      req.body.remove_imagen === true;

    if (!(await verificarAccesoExamen(req, res, examenId, 'ae.id'))) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, examenId))) {
      return;
    }

    const textoPlano = contenido.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    /** Imágenes incrustadas con Quill (toolbar imagen) no dejan texto plano; no tratar como vacío. */
    const tieneImagenEnHtml = /<img\s/i.test(contenido);
    let imagenNueva = null;
    if (req.file && req.file.filename) {
      imagenNueva = req.file.filename;
    }

    const existente = await query(
      `SELECT id, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
      [examenId]
    );

    let imagenFinal = null;
    if (imagenNueva) {
      imagenFinal = imagenNueva;
    } else if (remove_imagen) {
      imagenFinal = null;
    } else if (existente.length > 0) {
      imagenFinal = existente[0].imagen || null;
    }

    const tieneImagen = !!(imagenFinal && String(imagenFinal).trim());
    if (!textoPlano && !tieneImagen && !tieneImagenEnHtml) {
      if (existente.length > 0) {
        await execute(`DELETE FROM asignaturas_examenes_bloques WHERE examen_id = ?`, [examenId]);
      }
      return res.json({ success: true, bloque: null });
    }

    if (existente.length > 0) {
      await execute(
        `UPDATE asignaturas_examenes_bloques SET contenido = ?, imagen = ? WHERE examen_id = ?`,
        [contenido, imagenFinal, examenId]
      );
    } else {
      await execute(
        `INSERT INTO asignaturas_examenes_bloques (examen_id, contenido, imagen) VALUES (?, ?, ?)`,
        [examenId, contenido, imagenFinal]
      );
    }

    const bloqueRows = await query(
      `SELECT id, examen_id, contenido, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
      [examenId]
    );
    const b = bloqueRows[0];
    return res.json({
      success: true,
      bloque: {
        id: b.id,
        examen_id: b.examen_id,
        contenido: b.contenido || '',
        imagen: b.imagen || null,
        imagen_url: buildArchivoPdfUrl(b.imagen)
      }
    });
  } catch (error) {
    console.error('Error guardando bloque de examen:', error);
    const code = error && error.code ? String(error.code) : '';
    const msg = error && error.message ? String(error.message) : '';
    if (code === 'ER_NO_SUCH_TABLE' || msg.includes('ER_NO_SUCH_TABLE')) {
      return res.status(503).json({
        error:
          'La tabla del bloque de contexto aún no existe en la base de datos. Ejecute la migración 017_examen_bloque_contexto_mysql.sql.'
      });
    }
    res.status(500).json({ error: 'Error al guardar el bloque del examen' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/preguntas
 * Crear una nueva pregunta
 */
router.post('/aula-virtual/examenes/:examenId/preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { descripcion, tipo, puntos, datos_adicionales } = req.body;

    if (!descripcion || !tipo) {
      return res.status(400).json({ error: 'descripcion y tipo son requeridos' });
    }

    const examen = await verificarAccesoExamen(req, res, examenId, 'ae.*');
    if (!examen) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, examenId))) {
      return;
    }

    // Obtener el siguiente orden
    const ultimaPregunta = await query(
      `SELECT MAX(orden) as max_orden FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );
    const siguienteOrden = (ultimaPregunta[0]?.max_orden || 0) + 1;

    // Si el tipo de puntaje es INDIVIDUAL, puntos es requerido
    const puntosFinal = examen.tipo_puntaje === 'INDIVIDUAL' 
      ? (parseFloat(puntos) || 0) 
      : 0;

    // Preparar datos adicionales como JSON
    const datosAdicionalesJson = datos_adicionales ? JSON.stringify(datos_adicionales) : null;

    // Insertar pregunta
    const result = await execute(
      `INSERT INTO asignaturas_examenes_preguntas 
       (examen_id, descripcion, puntos, orden, tipo, imagen_puzzle, datos_adicionales)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        examenId,
        descripcion,
        puntosFinal,
        siguienteOrden,
        tipo,
        '', // imagen_puzzle por defecto vacío
        datosAdicionalesJson
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: result.insertId,
      descripcion: `Creó pregunta tipo ${tipo} para examen ID: ${examenId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, tipo, puntos: puntosFinal }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta creada correctamente',
      pregunta_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando pregunta:', error);
    res.status(500).json({ error: 'Error al crear pregunta' });
  }
});

/**
 * PUT /api/docente/aula-virtual/preguntas/:preguntaId
 * Actualizar una pregunta existente
 */
router.put('/aula-virtual/preguntas/:preguntaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;
    const { descripcion, tipo, puntos, orden, datos_adicionales } = req.body;

    const pregunta = await verificarAccesoPreguntaExamen(
      req,
      res,
      preguntaId,
      'ep.*, ae.asignatura_id, ep.examen_id'
    );
    if (!pregunta) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, pregunta.examen_id))) {
      return;
    }

    // Obtener examen para verificar tipo_puntaje
    const examen = await query(
      `SELECT tipo_puntaje FROM asignaturas_examenes WHERE id = ?`,
      [pregunta.examen_id]
    );

    const puntosFinal = examen[0]?.tipo_puntaje === 'INDIVIDUAL' 
      ? (parseFloat(puntos) || pregunta.puntos) 
      : pregunta.puntos;

    // Preparar datos adicionales como JSON
    const datosAdicionalesJson = datos_adicionales ? JSON.stringify(datos_adicionales) : null;

    // Datos anteriores para auditoría
    const datosAnteriores = {
      descripcion: pregunta.descripcion,
      tipo: pregunta.tipo,
      puntos: pregunta.puntos,
      orden: pregunta.orden
    };

    // Actualizar pregunta
    await execute(
      `UPDATE asignaturas_examenes_preguntas 
       SET descripcion = ?, tipo = ?, puntos = ?, orden = ?, datos_adicionales = ?
       WHERE id = ?`,
      [
        descripcion || pregunta.descripcion,
        tipo || pregunta.tipo,
        puntosFinal,
        orden !== undefined ? parseInt(orden) : pregunta.orden,
        datosAdicionalesJson,
        preguntaId
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: parseInt(preguntaId),
      descripcion: `Editó pregunta tipo ${tipo || pregunta.tipo} (ID: ${preguntaId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify({ descripcion, tipo, puntos: puntosFinal, orden }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando pregunta:', error);
    res.status(500).json({ error: 'Error al actualizar pregunta' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/preguntas/:preguntaId
 * Eliminar una pregunta y sus alternativas
 */
router.delete('/aula-virtual/preguntas/:preguntaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;

    const pregunta = await verificarAccesoPreguntaExamen(
      req,
      res,
      preguntaId,
      'ep.*, ae.asignatura_id, ep.examen_id'
    );
    if (!pregunta) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, pregunta.examen_id))) {
      return;
    }

    // Obtener alternativas para auditoría
    const alternativas = await query(
      `SELECT COUNT(*) as total FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
      [preguntaId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: parseInt(preguntaId),
      descripcion: `Eliminó pregunta tipo ${pregunta.tipo} (ID: ${preguntaId}) con ${alternativas[0]?.total || 0} alternativa(s)`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(pregunta),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativas primero (cascada)
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
      [preguntaId]
    );

    // Eliminar pregunta
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas WHERE id = ?`,
      [preguntaId]
    );

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando pregunta:', error);
    res.status(500).json({ error: 'Error al eliminar pregunta' });
  }
});

/**
 * GET /api/docente/aula-virtual/preguntas/:preguntaId/alternativas
 * Obtener todas las alternativas de una pregunta
 */
router.get('/aula-virtual/preguntas/:preguntaId/alternativas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;

    if (!(await verificarAccesoPreguntaExamen(req, res, preguntaId))) return;

    // Obtener alternativas
    const alternativas = await query(
      `SELECT * FROM asignaturas_examenes_preguntas_alternativas 
       WHERE pregunta_id = ? 
       ORDER BY id ASC`,
      [preguntaId]
    );

    res.json({ alternativas: alternativas || [] });
  } catch (error) {
    console.error('Error obteniendo alternativas:', error);
    res.status(500).json({ error: 'Error al obtener alternativas' });
  }
});

/**
 * POST /api/docente/aula-virtual/preguntas/:preguntaId/alternativas
 * Crear una nueva alternativa
 */
router.post('/aula-virtual/preguntas/:preguntaId/alternativas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;
    const { descripcion, correcta, orden_posicion, par_id, zona_drop } = req.body;

    if (!descripcion) {
      return res.status(400).json({ error: 'descripcion es requerido' });
    }

    const preguntaAlt = await verificarAccesoPreguntaExamen(
      req,
      res,
      preguntaId,
      'ep.*, ep.examen_id'
    );
    if (!preguntaAlt) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, preguntaAlt.examen_id))) {
      return;
    }

    // Insertar alternativa
    const result = await execute(
      `INSERT INTO asignaturas_examenes_preguntas_alternativas 
       (pregunta_id, descripcion, correcta, orden_posicion, par_id, zona_drop)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        preguntaId,
        descripcion,
        correcta === true || correcta === 'SI' ? 'SI' : 'NO',
        orden_posicion || null,
        par_id || null,
        zona_drop || null
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: result.insertId,
      descripcion: `Creó alternativa para pregunta ID: ${preguntaId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, correcta }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa creada correctamente',
      alternativa_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando alternativa:', error);
    res.status(500).json({ error: 'Error al crear alternativa' });
  }
});

/**
 * PUT /api/docente/aula-virtual/alternativas/:alternativaId
 * Actualizar una alternativa existente
 */
router.put('/aula-virtual/alternativas/:alternativaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { alternativaId } = req.params;
    const { descripcion, correcta, orden_posicion, par_id, zona_drop } = req.body;

    const alternativa = await verificarAccesoAlternativaExamen(
      req,
      res,
      alternativaId,
      'aa.*, ep.examen_id, aa.pregunta_id'
    );
    if (!alternativa) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, alternativa.examen_id))) {
      return;
    }

    // Datos anteriores para auditoría
    const datosAnteriores = {
      descripcion: alternativa.descripcion,
      correcta: alternativa.correcta
    };

    // Actualizar alternativa
    await execute(
      `UPDATE asignaturas_examenes_preguntas_alternativas 
       SET descripcion = ?, correcta = ?, orden_posicion = ?, par_id = ?, zona_drop = ?
       WHERE id = ?`,
      [
        descripcion || alternativa.descripcion,
        correcta !== undefined ? (correcta === true || correcta === 'SI' ? 'SI' : 'NO') : alternativa.correcta,
        orden_posicion !== undefined ? orden_posicion : alternativa.orden_posicion,
        par_id !== undefined ? par_id : alternativa.par_id,
        zona_drop !== undefined ? zona_drop : alternativa.zona_drop,
        alternativaId
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: parseInt(alternativaId),
      descripcion: `Editó alternativa (ID: ${alternativaId}) de pregunta ID: ${alternativa.pregunta_id}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify({ descripcion, correcta }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando alternativa:', error);
    res.status(500).json({ error: 'Error al actualizar alternativa' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/alternativas/:alternativaId
 * Eliminar una alternativa
 */
router.delete('/aula-virtual/alternativas/:alternativaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { alternativaId } = req.params;

    const alternativa = await verificarAccesoAlternativaExamen(
      req,
      res,
      alternativaId,
      'aa.*, ep.examen_id, aa.pregunta_id'
    );
    if (!alternativa) return;

    if (!(await assertDocentePuedeEditarContenidoExamenVirtual(req, res, query, alternativa.examen_id))) {
      return;
    }

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: parseInt(alternativaId),
      descripcion: `Eliminó alternativa (ID: ${alternativaId}) de pregunta ID: ${alternativa.pregunta_id}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(alternativa),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativa
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE id = ?`,
      [alternativaId]
    );

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando alternativa:', error);
    res.status(500).json({ error: 'Error al eliminar alternativa' });
  }
});

/**
 * Función para verificar y enviar notificaciones de tareas por vencer
 * Se ejecuta periódicamente para notificar a alumnos y apoderados
 */
async function verificarTareasPorVencer() {
  try {
    console.log('📅 [TAREAS POR VENCER] Iniciando verificación de tareas...');
    
    const moment = require('moment-timezone');
    const ahoraLima = moment.tz('America/Lima');
    const fechaActual = ahoraLima.format('YYYY-MM-DD');
    
    // Obtener todas las tareas activas con fecha de entrega en los próximos 3 días o hoy
    // Obtener año activo de cada colegio para filtrar correctamente
    const colegios = await query(
      `SELECT id, anio_activo FROM colegios WHERE estado = 'ACTIVO'`,
      []
    );
    
    let tareasPorVencer = [];
    
    // Para cada colegio, obtener tareas del año activo
    for (const colegio of colegios) {
      const anioActivo = colegio.anio_activo || new Date().getFullYear();
      
      const tareasColegio = await query(
        `SELECT t.*, 
                a.grupo_id, a.curso_id, a.colegio_id, a.personal_id,
                c.nombre as curso_nombre,
                CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo,
                g.anio, g.grado, g.seccion,
                n.nombre AS nivel_nombre
         FROM asignaturas_tareas t
         INNER JOIN asignaturas a ON a.id = t.asignatura_id
         INNER JOIN cursos c ON c.id = a.curso_id
         INNER JOIN personal p ON p.id = a.personal_id
         INNER JOIN grupos g ON g.id = a.grupo_id
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE t.fecha_entrega IS NOT NULL
           AND DATE(t.fecha_entrega) >= DATE(NOW())
           AND DATE(t.fecha_entrega) <= DATE(DATE_ADD(NOW(), INTERVAL 3 DAY))
           AND a.colegio_id = ?
           AND g.anio = ?
         ORDER BY t.fecha_entrega ASC`,
        [colegio.id, anioActivo]
      );
      
      tareasPorVencer = [...tareasPorVencer, ...tareasColegio];
    }
    
    if (tareasPorVencer.length === 0) {
      console.log('📅 [TAREAS POR VENCER] No hay tareas por vencer en los próximos 3 días');
      return;
    }
    
    console.log(`📅 [TAREAS POR VENCER] Encontradas ${tareasPorVencer.length} tareas por verificar`);
    
    // Procesar cada tarea
    for (const tarea of tareasPorVencer) {
      try {
        const fechaEntrega = moment.tz(tarea.fecha_entrega, 'America/Lima');
        const diasRestantes = fechaEntrega.diff(ahoraLima, 'days');
        
        // Determinar qué tipo de notificación enviar
        let tipoNotificacion = null;
        let mensajeNotificacion = '';
        
        if (diasRestantes === 0) {
          // Se vence hoy
          tipoNotificacion = 'HOY';
          mensajeNotificacion = `⚠️ El proyecto "${tarea.titulo}" se vence HOY - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 1) {
          // Falta 1 día
          tipoNotificacion = '1_DIA';
          mensajeNotificacion = `⏰ El proyecto "${tarea.titulo}" se vence MAÑANA - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 2) {
          // Faltan 2 días
          tipoNotificacion = '2_DIAS';
          mensajeNotificacion = `📅 El proyecto "${tarea.titulo}" se vence en 2 DÍAS - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 3) {
          // Faltan 3 días
          tipoNotificacion = '3_DIAS';
          mensajeNotificacion = `📅 El proyecto "${tarea.titulo}" se vence en 3 DÍAS - Curso: ${tarea.curso_nombre}`;
        }
        
        // Si no corresponde a ninguna notificación, saltar
        if (!tipoNotificacion) {
          continue;
        }

        const fechaLimaStr = fechaLimaYmd();
        const primeraVezHoy = await tryInsertPushCronDedup(
          'tarea_por_vencer',
          `${tarea.id}_${tipoNotificacion}`,
          fechaLimaStr
        );
        if (!primeraVezHoy) {
          console.log(
            `📅 [TAREAS POR VENCER] Ya procesado hoy (Lima) tarea ${tarea.id} (${tipoNotificacion}), omitiendo duplicado por reinicio`
          );
          continue;
        }

        // Obtener alumnos del grupo
        const alumnos = await query(
          `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id,
                  CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre
           FROM alumnos a
           INNER JOIN matriculas m ON m.alumno_id = a.id
           INNER JOIN usuarios u ON u.alumno_id = a.id
           WHERE m.grupo_id = ? 
             AND m.colegio_id = ?
             AND (m.estado = 0)
             AND u.colegio_id = ?
             AND u.estado = 'ACTIVO'`,
          [tarea.grupo_id, tarea.colegio_id, tarea.colegio_id]
        );
        
        // Obtener alumnos que YA entregaron la tarea (tienen entrega en asignaturas_tareas_entregas)
        const alumnosConEntrega = await query(
          `SELECT DISTINCT alumno_id 
           FROM asignaturas_tareas_entregas 
           WHERE tarea_id = ?`,
          [tarea.id]
        );
        
        const alumnosConEntregaIds = alumnosConEntrega.map(e => e.alumno_id);
        
        // Filtrar alumnos: solo los que NO han entregado
        const alumnosPendientes = alumnos.filter(a => !alumnosConEntregaIds.includes(a.alumno_id));
        
        const alumnoIds = alumnosPendientes.map(a => a.alumno_id);
        const alumnoUsuarioIds = alumnosPendientes.map(a => a.usuario_id);
        const alumnoNombrePorUsuarioId = new Map(
          alumnosPendientes.map((a) => [parseInt(a.usuario_id, 10), String(a.alumno_nombre || '').trim()])
        );
        
        console.log(`📅 [TAREAS POR VENCER] Tarea "${tarea.titulo}": ${alumnos.length} alumnos totales, ${alumnosConEntregaIds.length} ya entregaron, ${alumnoIds.length} pendientes`);
        
        // Obtener apoderados de esos alumnos
        let apoderadoUsuarioIds = [];
        if (alumnoIds.length > 0) {
          const apoderados = await query(
            `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
             FROM apoderados ap
             INNER JOIN familias f ON f.apoderado_id = ap.id
             INNER JOIN usuarios u ON u.apoderado_id = ap.id
             WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
               AND ap.colegio_id = ?
               AND u.colegio_id = ?
               AND u.estado = 'ACTIVO'`,
            [...alumnoIds, tarea.colegio_id, tarea.colegio_id]
          );
          apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
          
          // Obtener DNI de apoderados para buscar docentes-apoderados
          const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
          
          if (apoderadoDnis.length > 0) {
            // Obtener usuarios DOCENTE que también son apoderados
            const docentesApoderados = await query(
              `SELECT DISTINCT u.id 
               FROM usuarios u
               INNER JOIN personal p ON p.id = u.personal_id
               WHERE u.colegio_id = ? 
                 AND u.estado = 'ACTIVO'
                 AND u.tipo = 'DOCENTE'
                 AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                      OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                 AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`,
              [tarea.colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
            );
            
            const docentesApoderadosIds = docentesApoderados.map(u => u.id);
            apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
          }
        }
        
        // Combinar todos los destinatarios
        const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];

        const apoderadoAlumnosPorUsuario = new Map();
        if (apoderadoUsuarioIds.length > 0 && alumnoIds.length > 0) {
          try {
            const apoderadoAlumnos = await query(
              `SELECT u.id as usuario_id,
                      CONCAT(al.nombres, ' ', al.apellido_paterno, ' ', COALESCE(al.apellido_materno, '')) as alumno_nombre
               FROM usuarios u
               INNER JOIN apoderados ap ON ap.id = u.apoderado_id
               INNER JOIN familias f ON f.apoderado_id = ap.id
               INNER JOIN alumnos al ON al.id = f.alumno_id
               WHERE u.id IN (${apoderadoUsuarioIds.map(() => '?').join(',')})
                 AND f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                 AND u.colegio_id = ?
                 AND ap.colegio_id = ?`,
              [...apoderadoUsuarioIds, ...alumnoIds, tarea.colegio_id, tarea.colegio_id]
            );
            for (const row of apoderadoAlumnos || []) {
              const key = parseInt(row.usuario_id, 10);
              const nombre = String(row.alumno_nombre || '').trim();
              if (!apoderadoAlumnosPorUsuario.has(key)) apoderadoAlumnosPorUsuario.set(key, []);
              if (nombre) apoderadoAlumnosPorUsuario.get(key).push(nombre);
            }
          } catch (err) {
            console.warn('⚠️ [TAREAS POR VENCER] No se pudo mapear alumnos por apoderado:', err.message);
          }
        }
        
        if (todosDestinatarios.length === 0) {
          console.log(`⚠️ [TAREAS POR VENCER] No se encontraron destinatarios para tarea "${tarea.titulo}"`);
          continue;
        }
        
        // Preparar título de notificación
        let tituloNotificacion = '';
        if (tipoNotificacion === 'HOY') {
          tituloNotificacion = 'Proyecto se vence HOY';
        } else if (tipoNotificacion === '1_DIA') {
          tituloNotificacion = 'Proyecto se vence MAÑANA';
        } else if (tipoNotificacion === '2_DIAS') {
          tituloNotificacion = 'Proyecto se vence en 2 DÍAS';
        } else if (tipoNotificacion === '3_DIAS') {
          tituloNotificacion = 'Proyecto se vence en 3 DÍAS';
        }
        
        console.log(`📅 [TAREAS POR VENCER] Enviando notificaciones para tarea "${tarea.titulo}" (${tipoNotificacion}) a ${todosDestinatarios.length} destinatarios`);
        
        const asignaturaTarea = tarea.asignatura_id;
        const mensajePorDestinatario = new Map();
        const construirMensajePorDestinatario = (destinatarioId) => {
          const destId = parseInt(destinatarioId, 10);
          const alumnoDirecto = alumnoNombrePorUsuarioId.get(destId);
          const alumnosApoderado = apoderadoAlumnosPorUsuario.get(destId) || [];
          const gradoTxt = tarea.grado ? `${tarea.grado}°` : '';
          const seccionTxt = tarea.seccion ? String(tarea.seccion).trim() : '';
          const aulaTxt = `${tarea.nivel_nombre || ''} ${gradoTxt} ${seccionTxt}`.trim();
          let prefijoAlumno = '';
          if (alumnoDirecto) {
            prefijoAlumno = `Alumno: ${alumnoDirecto} - `;
          } else if (alumnosApoderado.length === 1) {
            prefijoAlumno = `Alumno: ${alumnosApoderado[0]} - `;
          } else if (alumnosApoderado.length > 1) {
            const muestra = alumnosApoderado.slice(0, 3).join(', ');
            const extra = alumnosApoderado.length > 3 ? ` (+${alumnosApoderado.length - 3})` : '';
            prefijoAlumno = `Alumnos: ${muestra}${extra} - `;
          }
          const prefijoAula = aulaTxt ? `Aula: ${aulaTxt} - ` : '';

          if (diasRestantes === 0) {
            return `⚠️ ${prefijoAlumno}${prefijoAula}El proyecto "${tarea.titulo}" se vence HOY - Curso: ${tarea.curso_nombre}`;
          }
          if (diasRestantes === 1) {
            return `⏰ ${prefijoAlumno}${prefijoAula}El proyecto "${tarea.titulo}" se vence MAÑANA - Curso: ${tarea.curso_nombre}`;
          }
          if (diasRestantes === 2) {
            return `📅 ${prefijoAlumno}${prefijoAula}El proyecto "${tarea.titulo}" se vence en 2 DÍAS - Curso: ${tarea.curso_nombre}`;
          }
          return `📅 ${prefijoAlumno}${prefijoAula}El proyecto "${tarea.titulo}" se vence en 3 DÍAS - Curso: ${tarea.curso_nombre}`;
        };

        // Crear notificaciones en la BD
        for (const destinatarioId of todosDestinatarios) {
          try {
            const mensajeDestinatario = construirMensajePorDestinatario(destinatarioId);
            mensajePorDestinatario.set(parseInt(destinatarioId, 10), mensajeDestinatario);
            const urlT = await obtenerUrlAulaVirtual(query, destinatarioId, {
              asignatura_id: asignaturaTarea,
              grupo_id: tarea.grupo_id,
              recurso_tipo: 'tarea',
              recurso_id: tarea.id
            });
            const uRows = await query(`SELECT tipo, alumno_id FROM usuarios WHERE id = ? LIMIT 1`, [destinatarioId]);
            const u0 = uRows[0] || {};
            await insertNotificacionUsuario(execute, {
              usuario_id: tarea.personal_id,
              destinatario_id: destinatarioId,
              asunto: tituloNotificacion,
              contenido: mensajeDestinatario,
              estado: 'NO ENVIADO',
              accion_tipo: 'tarea_por_vencer',
              accion_payload: {
                tarea_id: tarea.id,
                asignatura_id: asignaturaTarea,
                grupo_id: tarea.grupo_id,
                dias_restantes: diasRestantes,
                ...(u0.tipo === 'ALUMNO' && u0.alumno_id ? { alumno_id: u0.alumno_id } : {})
              },
              url_destino: urlT
            });
          } catch (error) {
            console.error(`❌ [TAREAS POR VENCER] Error creando notificación para usuario ${destinatarioId}:`, error);
          }
        }
        
        console.log(`✅ [TAREAS POR VENCER] ${todosDestinatarios.length} notificaciones creadas para tarea "${tarea.titulo}"`);
        
        const subscriptionsData = await query(
          `SELECT usuario_id, endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...todosDestinatarios, tarea.colegio_id]
        );
        
        if (subscriptionsData.length > 0) {
          const pushItems = [];
          for (const sub of subscriptionsData) {
            const urlPush = await obtenerUrlAulaVirtual(query, sub.usuario_id, {
              asignatura_id: asignaturaTarea,
              grupo_id: tarea.grupo_id,
              recurso_tipo: 'tarea',
              recurso_id: tarea.id
            });
            pushItems.push({
              subscription: {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              },
              payload: {
                title: tituloNotificacion,
                body: mensajePorDestinatario.get(parseInt(sub.usuario_id, 10)) || mensajeNotificacion,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                tag: `tarea-por-vencer-${tarea.id}-${tipoNotificacion}`,
                data: {
                  url: urlPush,
                  tipo: 'tarea_por_vencer',
                  tarea_id: tarea.id,
                  dias_restantes: diasRestantes
                }
              }
            });
          }
          
          enviarPushNotificacionesIndividuales(pushItems)
            .then(resultadosPush => {
              const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
              const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
              console.log(`✅ [TAREAS POR VENCER] Push notifications para "${tarea.titulo}": ${exitosas} exitosas, ${fallidas} fallidas`);
            })
            .catch(err => {
              console.error(`❌ [TAREAS POR VENCER] Error en envío de push notifications:`, err);
            });
        } else {
          console.log(`⚠️ [TAREAS POR VENCER] No hay suscripciones push activas para tarea "${tarea.titulo}"`);
        }

        // Correo solo a apoderados (cuenta principal GENERAL)
        if (apoderadoUsuarioIds.length > 0 && isEmailEnvioHabilitado()) {
          try {
            const colegioInfo = await query(`SELECT nombre FROM colegios WHERE id = ?`, [tarea.colegio_id]);
            const colegioNombre = colegioInfo.length > 0 ? colegioInfo[0].nombre : 'Vanguard Schools';
            const usuariosConEmail = await query(
              `SELECT DISTINCT u.id, COALESCE(ap.email, p.email) as email
               FROM usuarios u
               LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
               LEFT JOIN personal p ON p.id = u.personal_id
               WHERE u.id IN (${apoderadoUsuarioIds.map(() => '?').join(',')})
                 AND u.colegio_id = ?
                 AND COALESCE(ap.email, p.email) IS NOT NULL
                 AND TRIM(COALESCE(ap.email, p.email)) != ''`,
              [...apoderadoUsuarioIds, tarea.colegio_id]
            );
            const emailsUnicos = new Map();
            usuariosConEmail.forEach(u => {
              const email = (u.email || '').toLowerCase().trim();
              if (email && !emailsUnicos.has(email)) {
                emailsUnicos.set(email, { emailOriginal: u.email, usuarioId: parseInt(u.id, 10) });
              }
            });
            let enviadosCorreo = 0;
            for (const dataEmail of emailsUnicos.values()) {
              const contenidoEmail = mensajePorDestinatario.get(dataEmail.usuarioId) || mensajeNotificacion;
              try {
                const res = await enviarCorreoNotificacion(
                  dataEmail.emailOriginal,
                  tituloNotificacion,
                  contenidoEmail,
                  colegioNombre,
                  'GENERAL'
                );
                if (res && res.success) enviadosCorreo += 1;
              } catch (err) {
                console.error(`❌ [TAREAS POR VENCER] Error correo:`, err);
              }
            }
            if (enviadosCorreo > 0) {
              console.log(`📧 [TAREAS POR VENCER] Correos enviados: ${enviadosCorreo}/${emailsUnicos.size} para "${tarea.titulo}"`);
            }
          } catch (err) {
            console.error(`❌ [TAREAS POR VENCER] Error envío correos:`, err);
          }
        }
      } catch (error) {
        console.error(`❌ [TAREAS POR VENCER] Error procesando tarea ${tarea.id}:`, error);
      }
    }
    
    console.log('✅ [TAREAS POR VENCER] Verificación completada');
  } catch (error) {
    console.error('❌ [TAREAS POR VENCER] Error en verificación:', error);
  }
}

/**
 * Función para verificar tareas vencidas sin entrega:
 * 1. Asigna nota 0 a alumnos que no entregaron
 * 2. Notifica SOLO a apoderados (no al alumno)
 */
async function verificarTareasVencidasSinEntrega() {
  try {
    console.log('📅 [TAREAS VENCIDAS SIN ENTREGA] Iniciando verificación...');

    const colegios = await query(
      `SELECT id, anio_activo FROM colegios WHERE estado = 'ACTIVO'`,
      []
    );

    let tareasVencidas = [];

    for (const colegio of colegios) {
      const anioActivo = colegio.anio_activo || new Date().getFullYear();

      const tareasColegio = await query(
        `SELECT t.*, 
                a.grupo_id, a.curso_id, a.colegio_id, a.personal_id,
                c.nombre as curso_nombre,
                CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo,
                g.anio, g.grado, g.seccion,
                n.nombre AS nivel_nombre
         FROM asignaturas_tareas t
         INNER JOIN asignaturas a ON a.id = t.asignatura_id
         INNER JOIN cursos c ON c.id = a.curso_id
         INNER JOIN personal p ON p.id = a.personal_id
         INNER JOIN grupos g ON g.id = a.grupo_id
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE t.fecha_entrega IS NOT NULL
           AND DATE(t.fecha_entrega) < DATE(NOW())
           AND a.colegio_id = ?
           AND g.anio = ?
         ORDER BY t.fecha_entrega DESC`,
        [colegio.id, anioActivo]
      );

      tareasVencidas = [...tareasVencidas, ...tareasColegio];
    }

    if (tareasVencidas.length === 0) {
      console.log('📅 [TAREAS VENCIDAS SIN ENTREGA] No hay tareas vencidas pendientes');
      return;
    }

    console.log(`📅 [TAREAS VENCIDAS SIN ENTREGA] Encontradas ${tareasVencidas.length} tareas vencidas`);

    for (const tarea of tareasVencidas) {
      try {
        // Alumnos del grupo con matricula_id
        const alumnos = await query(
          `SELECT DISTINCT a.id as alumno_id, m.id as matricula_id,
                  CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno, '')) as alumno_nombre
           FROM alumnos a
           INNER JOIN matriculas m ON m.alumno_id = a.id
           WHERE m.grupo_id = ? 
             AND m.colegio_id = ?
             AND (m.estado = 0)`,
          [tarea.grupo_id, tarea.colegio_id]
        );

        const alumnosConEntrega = await query(
          `SELECT DISTINCT alumno_id FROM asignaturas_tareas_entregas WHERE tarea_id = ?`,
          [tarea.id]
        );
        const alumnosConEntregaIds = alumnosConEntrega.map(e => e.alumno_id);

        const alumnosConNota = await query(
          `SELECT matricula_id FROM asignaturas_tareas_notas WHERE tarea_id = ?`,
          [tarea.id]
        );
        const matriculaIdsConNota = new Set(alumnosConNota.map(n => n.matricula_id));

        // Alumnos que NO entregaron y NO tienen nota
        const alumnosSinEntregaYSinNota = alumnos.filter(
          a => !alumnosConEntregaIds.includes(a.alumno_id) && !matriculaIdsConNota.has(a.matricula_id)
        );

        if (alumnosSinEntregaYSinNota.length === 0) {
          continue;
        }

        console.log(`📅 [TAREAS VENCIDAS SIN ENTREGA] Tarea "${tarea.titulo}": ${alumnosSinEntregaYSinNota.length} alumnos sin entrega a procesar`);

        const apoderadoUsuarioIdsSet = new Set();
        const alumnoIdsParaApoderados = alumnosSinEntregaYSinNota.map(a => a.alumno_id);

        for (const alumno of alumnosSinEntregaYSinNota) {
          try {
            await execute(
              `INSERT INTO asignaturas_tareas_notas (tarea_id, matricula_id, nota)
               VALUES (?, ?, '0')`,
              [tarea.id, alumno.matricula_id]
            );
            console.log(`✅ [TAREAS VENCIDAS SIN ENTREGA] Nota 0 asignada a alumno ${alumno.alumno_id} (matrícula ${alumno.matricula_id})`);
          } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
              continue; // Ya existe nota, saltar
            }
            console.error(`❌ [TAREAS VENCIDAS SIN ENTREGA] Error asignando nota 0:`, err);
            continue;
          }

          const apoderados = await query(
            `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
             FROM apoderados ap
             INNER JOIN familias f ON f.apoderado_id = ap.id
             INNER JOIN usuarios u ON u.apoderado_id = ap.id
             WHERE f.alumno_id = ? AND ap.colegio_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
            [alumno.alumno_id, tarea.colegio_id, tarea.colegio_id]
          );
          apoderados.forEach(ap => apoderadoUsuarioIdsSet.add(ap.usuario_id));

          const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
          if (apoderadoDnis.length > 0) {
            const docentesApoderados = await query(
              `SELECT DISTINCT u.id FROM usuarios u
               INNER JOIN personal p ON p.id = u.personal_id
               WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
                 AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                      OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                 AND u.id NOT IN (${apoderados.map(() => '?').join(',')})`,
              [tarea.colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...apoderados.map(a => a.usuario_id)]
            );
            docentesApoderados.forEach(u => apoderadoUsuarioIdsSet.add(u.id));
          }
        }

        const apoderadoUsuarioIds = [...apoderadoUsuarioIdsSet];
        if (apoderadoUsuarioIds.length === 0) {
          console.log(`⚠️ [TAREAS VENCIDAS SIN ENTREGA] No hay apoderados para notificar en tarea "${tarea.titulo}"`);
          continue;
        }

        const fechaLimaVenc = fechaLimaYmd();
        const debeEnviarAvisos = await tryInsertPushCronDedup(
          'tarea_vencida_sin_entrega',
          String(tarea.id),
          fechaLimaVenc
        );
        if (!debeEnviarAvisos) {
          console.log(
            `📅 [TAREAS VENCIDAS SIN ENTREGA] Ya se enviaron avisos hoy (Lima) para tarea ${tarea.id}, omitiendo campanita/push/correo (notas ya aplicadas)`
          );
          continue;
        }

        const tituloNotificacion = 'Proyecto vencido sin entrega';
        const gradoTxt = tarea.grado ? `${tarea.grado}°` : '';
        const seccionTxt = tarea.seccion ? String(tarea.seccion).trim() : '';
        const aulaTxt = `${tarea.nivel_nombre || ''} ${gradoTxt} ${seccionTxt}`.trim();
        const prefijoAula = aulaTxt ? `Aula: ${aulaTxt} - ` : '';
        const mensajeNotificacionBase = `⚠️ ${prefijoAula}No se entregó el proyecto "${tarea.titulo}" dentro del plazo. Se asignó nota 0. - Curso: ${tarea.curso_nombre}`;
        const refAlumno = alumnosSinEntregaYSinNota[0];
        const urlRefApoderado =
          refAlumno && tarea.asignatura_id
            ? `/apoderado/hijos/${refAlumno.alumno_id}/aula-virtual/${tarea.asignatura_id}?abrir=tarea&id=${tarea.id}`
            : '/apoderado/hijos';

        const alumnosPorApoderado = new Map();
        if (apoderadoUsuarioIds.length > 0 && alumnoIdsParaApoderados.length > 0) {
          try {
            const mapRows = await query(
              `SELECT u.id as usuario_id,
                      CONCAT(al.nombres, ' ', al.apellido_paterno, ' ', COALESCE(al.apellido_materno, '')) as alumno_nombre
               FROM usuarios u
               INNER JOIN apoderados ap ON ap.id = u.apoderado_id
               INNER JOIN familias f ON f.apoderado_id = ap.id
               INNER JOIN alumnos al ON al.id = f.alumno_id
               WHERE u.id IN (${apoderadoUsuarioIds.map(() => '?').join(',')})
                 AND f.alumno_id IN (${alumnoIdsParaApoderados.map(() => '?').join(',')})
                 AND u.colegio_id = ?
                 AND ap.colegio_id = ?`,
              [...apoderadoUsuarioIds, ...alumnoIdsParaApoderados, tarea.colegio_id, tarea.colegio_id]
            );
            for (const row of mapRows || []) {
              const uid = parseInt(row.usuario_id, 10);
              const nombre = String(row.alumno_nombre || '').trim();
              if (!alumnosPorApoderado.has(uid)) alumnosPorApoderado.set(uid, []);
              if (nombre) alumnosPorApoderado.get(uid).push(nombre);
            }
          } catch (err) {
            console.warn('⚠️ [TAREAS VENCIDAS SIN ENTREGA] No se pudo mapear alumnos por apoderado:', err.message);
          }
        }

        const mensajePorApoderado = new Map();
        const construirMensajeVencido = (destinatarioId) => {
          const alumnosRef = alumnosPorApoderado.get(parseInt(destinatarioId, 10)) || [];
          if (alumnosRef.length === 1) {
            return `⚠️ Alumno: ${alumnosRef[0]} - ${prefijoAula}No entregó el proyecto "${tarea.titulo}" dentro del plazo. Se asignó nota 0. - Curso: ${tarea.curso_nombre}`;
          }
          if (alumnosRef.length > 1) {
            const muestra = alumnosRef.slice(0, 3).join(', ');
            const extra = alumnosRef.length > 3 ? ` (+${alumnosRef.length - 3})` : '';
            return `⚠️ Alumnos: ${muestra}${extra} - ${prefijoAula}No entregaron el proyecto "${tarea.titulo}" dentro del plazo. Se asignó nota 0. - Curso: ${tarea.curso_nombre}`;
          }
          return mensajeNotificacionBase;
        };

        for (const destinatarioId of apoderadoUsuarioIds) {
          try {
            const mensajeNotificacion = construirMensajeVencido(destinatarioId);
            mensajePorApoderado.set(parseInt(destinatarioId, 10), mensajeNotificacion);
            await insertNotificacionUsuario(execute, {
              usuario_id: tarea.personal_id,
              destinatario_id: destinatarioId,
              asunto: tituloNotificacion,
              contenido: mensajeNotificacion,
              estado: 'NO ENVIADO',
              accion_tipo: 'tarea_vencida_sin_entrega',
              accion_payload: {
                tarea_id: tarea.id,
                asignatura_id: tarea.asignatura_id,
                grupo_id: tarea.grupo_id,
                alumno_ids_afectados: alumnoIdsParaApoderados
              },
              url_destino: urlRefApoderado
            });
          } catch (err) {
            console.error(`❌ [TAREAS VENCIDAS SIN ENTREGA] Error creando notificación:`, err);
          }
        }

        const subscriptionsData = await query(
          `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions 
           WHERE usuario_id IN (${apoderadoUsuarioIds.map(() => '?').join(',')}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...apoderadoUsuarioIds, tarea.colegio_id]
        );
        if (subscriptionsData.length > 0) {
          const pushItems = subscriptionsData.map((sub) => ({
            subscription: {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            payload: {
              title: tituloNotificacion,
              body: mensajePorApoderado.get(parseInt(sub.usuario_id, 10)) || mensajeNotificacionBase,
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-192x192.png',
              vibrate: [200, 100, 200],
              tag: `tarea-vencida-sin-entrega-${tarea.id}`,
              data: {
                url: urlRefApoderado,
                tipo: 'tarea_vencida_sin_entrega',
                tarea_id: tarea.id
              }
            }
          }));
          enviarPushNotificacionesIndividuales(pushItems).catch(err =>
            console.error('❌ [TAREAS VENCIDAS SIN ENTREGA] Error push:', err)
          );
        }

        // Correo solo a apoderados (cuenta principal GENERAL)
        if (isEmailEnvioHabilitado()) {
          try {
            const colegioInfo = await query(`SELECT nombre FROM colegios WHERE id = ?`, [tarea.colegio_id]);
            const colegioNombre = colegioInfo[0]?.nombre || 'Vanguard Schools';
            const usuariosConEmail = await query(
              `SELECT DISTINCT u.id, COALESCE(ap.email, p.email) as email
               FROM usuarios u
               LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
               LEFT JOIN personal p ON p.id = u.personal_id
               WHERE u.id IN (${apoderadoUsuarioIds.map(() => '?').join(',')})
                 AND u.colegio_id = ? AND u.estado = 'ACTIVO'
                 AND COALESCE(ap.email, p.email) IS NOT NULL
                 AND TRIM(COALESCE(ap.email, p.email)) != ''`,
              [...apoderadoUsuarioIds, tarea.colegio_id]
            );
            const emailsUnicos = new Map();
            usuariosConEmail.forEach(u => {
              const email = (u.email || '').toLowerCase().trim();
              if (email && !emailsUnicos.has(email)) {
                emailsUnicos.set(email, { emailOriginal: u.email, usuarioId: parseInt(u.id, 10) });
              }
            });
            let enviadosCorreo = 0;
            for (const dataEmail of emailsUnicos.values()) {
              const contenidoEmail = mensajePorApoderado.get(dataEmail.usuarioId) || mensajeNotificacionBase;
              try {
                const res = await enviarCorreoNotificacion(
                  dataEmail.emailOriginal,
                  tituloNotificacion,
                  contenidoEmail,
                  colegioNombre,
                  'GENERAL'
                );
                if (res && res.success) enviadosCorreo += 1;
              } catch (err) {
                console.error(`❌ [TAREAS VENCIDAS SIN ENTREGA] Error correo:`, err);
              }
            }
            if (enviadosCorreo > 0) {
              console.log(
                `📧 [TAREAS VENCIDAS SIN ENTREGA] Correos enviados: ${enviadosCorreo}/${emailsUnicos.size} para "${tarea.titulo}"`
              );
            }
          } catch (err) {
            console.error(`❌ [TAREAS VENCIDAS SIN ENTREGA] Error correos:`, err);
          }
        }
      } catch (error) {
        console.error(`❌ [TAREAS VENCIDAS SIN ENTREGA] Error tarea ${tarea.id}:`, error);
      }
    }

    console.log('✅ [TAREAS VENCIDAS SIN ENTREGA] Verificación completada');
  } catch (error) {
    console.error('❌ [TAREAS VENCIDAS SIN ENTREGA] Error:', error);
  }
}

/**
 * GET /api/docente/tareas/verificar-vencimiento
 * Endpoint para verificar y enviar notificaciones de tareas por vencer
 * Se puede llamar periódicamente (cron job) o manualmente
 */
router.get('/tareas/verificar-vencimiento', async (req, res) => {
  try {
    // Ejecutar ambas verificaciones de forma asíncrona
    setImmediate(async () => {
      await verificarTareasPorVencer();
      await verificarTareasVencidasSinEntrega();
    });
    
    res.json({ 
      success: true, 
      message: 'Verificación de tareas por vencer y vencidas sin entrega iniciada' 
    });
  } catch (error) {
    console.error('Error iniciando verificación de tareas:', error);
    res.status(500).json({ error: 'Error al iniciar verificación' });
  }
});

// Exportar la función para uso interno (verificación automática)
// Exportar función helper para uso en otros módulos
module.exports = router;
module.exports.crearNotificacionesApoderados = crearNotificacionesApoderados;
module.exports.verificarTareasPorVencer = verificarTareasPorVencer;
module.exports.verificarTareasVencidasSinEntrega = verificarTareasVencidasSinEntrega;
module.exports.verificarExamenesIntentosPendientes = require('../utils/examenCerrarIntentosPendientes').verificarExamenesIntentosPendientes;

