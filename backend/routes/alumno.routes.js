const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { insertNotificacionUsuario, notificacionMensajeDuplicadaReciente } = require('../utils/notificacionInsert');
const phpSerialize = require('php-serialize');
const { fechaHoraMySQLLima, fechaMySQLLima, horaMySQLLima } = require('../utils/fechaHoraLima');
const { fetchPreguntasConAlternativas } = require('../utils/examenPreguntasAlternativas');
const { fetchMatriculaVigenteMasReciente } = require('../utils/matriculaVigente');
const { normalizarUrlsImagenesEnHtml, urlArchivoMensajeStatic } = require('../utils/mensajesHtml');
const { buildArchivoPdfUrl, esExamenTipoPdf } = require('../utils/examenArchivoPdfUrl');
const { esCompletarCorrecto } = require('../utils/examenCompletar');
const { findAlternativaMarcadaVF } = require('../utils/examenRespuestaIds');
const { etiquetaGradoGrupo } = require('../utils/notificacionExamenApoderadoTexto');
const { enviarCorreoHtml } = require('../services/emailService');
const {
  cargarRespuestasMergedDePrueba,
  persistirRespuestaPregunta,
  persistirRespuestasBulk
} = require('../utils/examenRespuestasLinea');
const {
  finalizarPruebaConCalificacion,
  aplicarEstadoFinalizadoPrueba
} = require('../utils/examenFinalizarPrueba');

/**
 * Lista de IDs de preguntas que el alumno vio (campo preguntas: base64 + PHP serialize).
 */
function parsePreguntaIdsVisiblesDesdePrueba(pruebaRow) {
  if (!pruebaRow || !pruebaRow.preguntas || String(pruebaRow.preguntas).trim() === '') {
    return null;
  }
  try {
    const decoded = Buffer.from(pruebaRow.preguntas, 'base64').toString('utf-8');
    const arr = phpSerialize.unserialize(decoded);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ids = arr.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
    return ids.length > 0 ? ids : null;
  } catch (e) {
    return null;
  }
}

/** Ventana (s) donde otro device_id distinto bloquea reanudar; configurable en despliegue (WiFi congestionado suele retardar pings). Clamp 60–900. */
const EXAM_SESSION_STALE_SECONDS = (() => {
  const raw = parseInt(process.env.EXAM_SESSION_STALE_SECONDS || '180', 10);
  if (!Number.isFinite(raw)) return 180;
  return Math.min(900, Math.max(60, raw));
})();

/** Pérdidas INTERNET_LOSS antes de poder cerrar el examen (otras violaciones usan umbral más bajo). */
const EXAM_VIOLACION_INTERNET_CIERRE = Math.max(
  2,
  parseInt(process.env.EXAM_VIOLACION_INTERNET_CIERRE || '4', 10) || 4
);

const EXAM_VIOLACION_GENERAL_CIERRE = 2;

function generarExamSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizarExamDeviceId(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  return str.slice(0, 120);
}

function tieneCamposSesionExamen(row) {
  if (!row || typeof row !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(row, 'exam_session_token') ||
    Object.prototype.hasOwnProperty.call(row, 'exam_session_device_id') ||
    Object.prototype.hasOwnProperty.call(row, 'exam_session_last_seen')
  );
}

function construirErrorSesionExamen() {
  return {
    error: 'El examen ya se está dando en otro dispositivo. Cierra el otro dispositivo para continuar.',
    code: 'EXAM_ALREADY_IN_PROGRESS'
  };
}

function segundosIdleSesionExamen(row) {
  const raw = row?.exam_session_last_seen;
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t) || t <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

async function actualizarSesionExamenPrueba(pruebaId, token, deviceId) {
  if (!pruebaId || !token) return;
  try {
    await execute(
      `UPDATE asignaturas_examenes_pruebas
       SET exam_session_token = ?,
           exam_session_device_id = ?,
           exam_session_last_seen = NOW()
       WHERE id = ?`,
      [String(token), deviceId ? String(deviceId) : null, pruebaId]
    );
  } catch (err) {
    // Compatibilidad: si aún no existen columnas en BD, no romper flujo de examen.
    if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) return;
    throw err;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToPlain(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolverTextoRespuesta(pregunta, respuestaAlumno) {
  const tipo = String(pregunta?.tipo || '').toUpperCase();
  const alternativas = Array.isArray(pregunta?.alternativas) ? pregunta.alternativas : [];
  if (respuestaAlumno === null || respuestaAlumno === undefined || respuestaAlumno === '') {
    return 'Sin responder';
  }

  if (tipo === 'ALTERNATIVAS' || tipo === 'VERDADERO_FALSO') {
    const alt = findAlternativaMarcadaVF(alternativas, respuestaAlumno);
    if (alt) {
      return htmlToPlain(alt.descripcion || `Alternativa ${alt.id}`) || `Alternativa ${alt.id}`;
    }
    return htmlToPlain(String(respuestaAlumno));
  }

  if (tipo === 'COMPLETAR' && typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    const partes = Object.entries(respuestaAlumno)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([idx, val]) => `${Number(idx) + 1}) ${htmlToPlain(val || '') || '___'}`);
    return partes.length > 0 ? partes.join(' | ') : 'Sin responder';
  }

  if (tipo === 'ORDENAR' && Array.isArray(respuestaAlumno)) {
    const parts = respuestaAlumno.map((id, i) => {
      const alt = alternativas.find((a) => Number(a.id) === Number(id));
      const txt = alt ? htmlToPlain(alt.descripcion || '') : String(id);
      return `${i + 1}) ${txt || id}`;
    });
    return parts.length > 0 ? parts.join(' | ') : 'Sin responder';
  }

  if ((tipo === 'EMPAREJAR' || tipo === 'ARRASTRAR_Y_SOLTAR') && typeof respuestaAlumno === 'object') {
    const pairs = Object.entries(respuestaAlumno).map(([k, v]) => {
      const left = htmlToPlain(
        alternativas.find((a) => Number(a.id) === Number(k))?.descripcion || String(k)
      );
      const right =
        typeof v === 'object' && v && v.zona
          ? `Zona ${htmlToPlain(v.zona)}`
          : htmlToPlain(String(v ?? ''));
      return `${left} -> ${right}`;
    });
    return pairs.length > 0 ? pairs.join(' | ') : 'Sin responder';
  }

  return htmlToPlain(String(respuestaAlumno));
}

/** Texto para bandeja Mensajes (apoderados y docentes–apoderado), mismo detalle que el correo HTML. */
function construirTextoPlanoComprobanteExamen({
  tituloExamen,
  alumnoNombre,
  cursoNombre,
  docenteNombre,
  etiquetaGrado,
  puntajeFinal,
  correctas,
  incorrectas,
  permiteMostrarNota,
  filasResumen
}) {
  const nl = '\n';
  const pts = permiteMostrarNota
    ? String(puntajeFinal)
    : 'Pendiente (el docente publicará la nota según la configuración del examen)';
  const cor = permiteMostrarNota ? String(correctas) : '-';
  const inc = permiteMostrarNota ? String(incorrectas) : '-';
  let t = '';
  t += `Comprobante de examen — ${tituloExamen}${nl}`;
  t += `Alumno: ${alumnoNombre}${nl}`;
  if (etiquetaGrado) t += `${etiquetaGrado}${nl}`;
  t += `Curso: ${cursoNombre}${nl}`;
  t += `Docente: ${docenteNombre}${nl}`;
  t += `Puntaje: ${pts}${nl}`;
  t += `Correctas: ${cor} · Incorrectas: ${inc}${nl}${nl}`;
  t += `Detalle de respuestas:${nl}`;
  for (const f of filasResumen || []) {
    t += `${f.nro}. ${f.pregunta}${nl}   → ${f.respuesta}${nl}`;
  }
  return t;
}

function construirHtmlResumenExamenCorreo(params) {
  const {
    colegioNombre,
    alumnoNombre,
    cursoNombre,
    docenteNombre,
    tituloExamen,
    etiquetaGrado,
    puntajeFinal,
    correctas,
    incorrectas,
    filasResumen
  } = params;

  const filasHtml = (filasResumen || [])
    .map((f) => {
      const estadoColor = f.sinResponder ? '#b45309' : '#166534';
      const estadoLabel = f.sinResponder ? 'Sin responder' : 'Respondida';
      return `<tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${f.nro}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${escapeHtml(f.pregunta)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${escapeHtml(f.respuesta)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:12px;font-weight:700;color:${estadoColor};">${estadoLabel}</td>
      </tr>`;
    })
    .join('');

  return `
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;padding:16px;">
    <tr><td align="center">
      <table role="presentation" style="max-width:820px;width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <tr>
          <td style="padding:24px 26px;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;">
            <div style="font-size:12px;opacity:.9;letter-spacing:.2px;">COMPROBANTE DE EXAMEN</div>
            <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(tituloExamen)}</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:.95;">${escapeHtml(colegioNombre || 'Vanguard Schools')}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 26px 6px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;width:32%;">Alumno</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(alumnoNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Curso</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(cursoNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Docente</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(docenteNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Grado / Sección</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(etiquetaGrado || '-')}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Resultado</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:700;">Puntaje: ${escapeHtml(puntajeFinal)} · Correctas: ${escapeHtml(correctas)} · Incorrectas: ${escapeHtml(incorrectas)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 26px 8px;color:#1e293b;font-size:14px;font-weight:700;">Respuestas marcadas por el alumno</td>
        </tr>
        <tr>
          <td style="padding:0 26px 20px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#eef2ff;">
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">#</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Pregunta</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Respuesta marcada</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Estado</th>
                </tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 26px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">
            Este correo es un comprobante automático de respuestas registradas al finalizar el examen.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

// Configurar multer para subir archivos de mensajes
const mensajesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Archivos/ del sistema PHP (compartido con ambos sistemas)
    const uploadPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
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

// Todas las rutas requieren autenticación y ser ALUMNO
router.use(authenticateToken);
router.use(requireUserType('ALUMNO'));

/**
 * GET /api/alumno/documentos-gestion
 * PDFs de gestión visibles para el perfil ALUMNO (o TODOS)
 */
router.get('/documentos-gestion', async (req, res) => {
  try {
    const { colegio_id, tipo } = req.user;
    const tipoUsuario = tipo || 'ALUMNO';
    const documentos = await query(
      `SELECT d.id, d.titulo, d.nombre_archivo_original, d.ruta_almacenamiento, d.perfil_destino,
              d.fecha_publicacion, d.created_at,
              c.nombre as categoria_nombre, c.orden as categoria_orden
       FROM gestion_documentos d
       INNER JOIN gestion_documentos_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
       WHERE d.colegio_id = ? AND d.activo = 1 AND c.activo = 1
         AND (d.perfil_destino = 'TODOS' OR d.perfil_destino = ?)
       ORDER BY c.orden ASC, d.created_at DESC`,
      [colegio_id, tipoUsuario]
    );
    const list = (documentos || []).map((d) => ({
      ...d,
      archivo_url: `/uploads/${d.ruta_almacenamiento}`
    }));
    res.json({ documentos: list });
  } catch (error) {
    console.error('Error listando documentos de gestión (alumno):', error);
    res.status(500).json({ error: error.message || 'Error al listar documentos' });
  }
});

/**
 * GET /api/alumno/dashboard
 * Obtener datos del dashboard del alumno
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    
    console.log('📊 [ALUMNO DASHBOARD] Iniciando carga para usuario:', usuario_id, 'colegio:', colegio_id, 'año:', anio_activo);

    // Obtener datos del alumno
    let alumno = [];
    try {
      alumno = await query(
        `SELECT a.*, u.tipo as tipo_usuario
         FROM alumnos a
         INNER JOIN usuarios u ON u.alumno_id = a.id
         WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
        [usuario_id, colegio_id]
      );
    } catch (error) {
      console.error('❌ [ALUMNO DASHBOARD] Error obteniendo datos del alumno:', error);
      return res.status(500).json({ error: 'Error al obtener datos del alumno', details: error.message });
    }

    if (alumno.length === 0) {
      console.warn('⚠️ [ALUMNO DASHBOARD] Alumno no encontrado para usuario:', usuario_id);
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    console.log('✅ [ALUMNO DASHBOARD] Alumno encontrado:', alumnoData.id);

    // Obtener matrícula actual del alumno
    let matricula = [];
    try {
      matricula = await query(
        `SELECT m.*, 
                g.grado, 
                g.seccion,
                n.nombre as nivel_nombre,
                t.nombre as turno_nombre
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         INNER JOIN niveles n ON n.id = g.nivel_id
         INNER JOIN turnos t ON t.id = g.turno_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
         AND (m.estado = 0)
         LIMIT 1`,
        [alumnoData.id, colegio_id, anio_activo]
      );
    } catch (error) {
      console.error('❌ [ALUMNO DASHBOARD] Error obteniendo matrícula:', error);
      // Continuar sin matrícula si hay error
      matricula = [];
    }

    const matriculaData = matricula.length > 0 ? matricula[0] : null;
    const grupoId = matriculaData ? matriculaData.grupo_id : null;
    console.log('✅ [ALUMNO DASHBOARD] Matrícula:', matriculaData ? `Grupo ${grupoId}` : 'Sin matrícula');

    // Tutor del grupo (mensajería: usuario_id del docente asignado como tutor)
    let tutorDashboard = null;
    if (grupoId) {
      try {
        const tutorRows = await query(
          `SELECT p.nombres,
                  p.apellidos,
                  p.foto,
                  u.id AS usuario_id
           FROM grupos g
           INNER JOIN personal p ON p.id = g.tutor_id AND p.colegio_id = g.colegio_id
           INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id AND u.estado = 'ACTIVO'
           WHERE g.id = ? AND g.colegio_id = ? AND g.tutor_id IS NOT NULL
           LIMIT 1`,
          [grupoId, colegio_id]
        );
        if (tutorRows.length > 0) {
          const tr = tutorRows[0];
          const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
          const isProduction = process.env.NODE_ENV === 'production';
          let fotoTutor = null;
          if (tr.foto && String(tr.foto).trim() !== '') {
            fotoTutor = isProduction
              ? `${phpSystemUrl}/Static/Image/Fotos/${tr.foto}`
              : `http://localhost:5000/Static/Image/Fotos/${tr.foto}`;
          }
          const nom = (tr.nombres || '').trim();
          const ape = (tr.apellidos || '').trim();
          tutorDashboard = {
            usuario_id: tr.usuario_id,
            nombres: nom,
            apellidos: ape,
            nombre_completo: [nom, ape].filter(Boolean).join(' ') || 'Tutor',
            foto: fotoTutor
          };
        }
      } catch (tutorErr) {
        console.warn('⚠️ [ALUMNO DASHBOARD] Tutor:', tutorErr.message);
      }
    }

    // Contar cursos asignados (asignaturas del grupo del alumno en el año activo)
    const cursosAsignados = grupoId ? await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    ) : [{ total: 0 }];

    // Contar docentes únicos que le enseñan (sin repetir docente)
    const totalDocentes = grupoId ? await query(
      `SELECT COUNT(DISTINCT a.personal_id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    ) : [{ total: 0 }];

    // Contar total de matrículas registradas (una por año)
    const totalMatriculas = await query(
      `SELECT COUNT(DISTINCT g.anio) as total
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?`,
      [alumnoData.id, colegio_id]
    );

    // Total Tardanzas (por ahora 0)
    const totalTardanzas = [{ total: 0 }];

    // Total Faltas (por ahora 0)
    const totalFaltas = [{ total: 0 }];

    // Contar mensajes no leídos (solo tipo RECIBIDO, igual que la lista de mensajes)
    const mensajesNoLeidos = await query(
      `SELECT COUNT(*) as total
       FROM mensajes m
       WHERE m.destinatario_id = ? 
         AND m.estado = 'NO_LEIDO' 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`,
      [usuario_id]
    );

    // Obtener asignaturas (cursos) del alumno
    // NOTA: No usar LEFT JOIN areas_curso porque esa tabla no existe en la BD
    const asignaturas = grupoId ? await query(
      `SELECT a.id,
              c.nombre as curso_nombre,
              c.imagen as curso_imagen,
              NULL as area_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombres,
              p.apellidos as docente_apellidos
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id, anio_activo]
    ) : [];

    // Próximos exámenes (del grupo del alumno)
    // IMPORTANTE: Incluir exámenes ACTIVOS e INACTIVOS con fecha >= hoy
    // Los exámenes INACTIVOS con fecha/hora se activarán automáticamente cuando llegue la hora
    // Similar a cómo funciona en el dashboard del docente (no filtra solo por ACTIVO)
    // IMPORTANTE: Devolver los mismos campos que el dashboard del docente para que el modal funcione igual
    const proximosExamenes = grupoId ? await query(
      `SELECT ae.*,
              COALESCE(ae.titulo, 'Examen') as titulo,
              c.nombre as asignatura_nombre,
              a.id as asignatura_id,
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
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND DATE(ae.fecha_desde) >= CURDATE()
       ORDER BY COALESCE(ae.fecha_desde, '9999-12-31') ASC
       LIMIT 10`,
      [grupoId, colegio_id, anio_activo]
    ) : [];

    // Próximas tareas (del grupo del alumno)
    // IMPORTANTE: Devolver los mismos campos que el dashboard del docente para que el modal funcione igual
    const proximasTareas = grupoId ? await query(
      `SELECT t.*,
              t.titulo,
              c.nombre as asignatura_nombre,
              a.id as asignatura_id,
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
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND DATE(t.fecha_entrega) >= DATE(NOW())
       ORDER BY t.fecha_entrega ASC
       LIMIT 10`,
      [grupoId, colegio_id, anio_activo]
    ) : [];

    // Actividades próximas (solo futuras del año actual)
    const añoActual = new Date().getFullYear();
    const actividades = await query(
      `SELECT a.*,
              DATE(a.fecha_inicio) as fecha_evento
       FROM actividades a
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       AND DATE(a.fecha_inicio) >= DATE(NOW())
       ORDER BY a.fecha_inicio ASC
       LIMIT 10`,
      [colegio_id, añoActual]
    );

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

    // Total estrellas (enrollment_incidents type=2) - acumulativas del año activo
    const matriculasAlumno = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [alumnoData.id, colegio_id, anio_activo]
    );
    const matriculaIds = matriculasAlumno.map(m => m.id);
    let totalEstrellas = 0;
    if (matriculaIds.length > 0) {
      const placeholders = matriculaIds.map(() => '?').join(',');
      const estrellasRows = await query(
        `SELECT COALESCE(SUM(ei.points), 0) as total
         FROM enrollment_incidents ei
         WHERE ei.enrollment_id IN (${placeholders}) AND ei.type = 2`,
        matriculaIds
      );
      totalEstrellas = parseInt(estrellasRows[0]?.total || 0, 10);
    }

    // Avatar actual (el de mayor nivel que tenga comprado)
    const sexoAlumno = alumnoData.sexo;
    const sexoAvatarBuscado = sexoAlumno;
    let avatarActual = [];
    try {
      if (sexoAvatarBuscado !== null) {
        avatarActual = await query(
          `SELECT asi.*, ass.created_at as fecha_compra
           FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ? AND (asi.sexo = ? OR asi.sexo IS NULL)
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoData.id, sexoAvatarBuscado]
        );
      } else {
        avatarActual = await query(
          `SELECT asi.*, ass.created_at as fecha_compra
           FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ?
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoData.id]
        );
      }
    } catch (err) {
      if (err.message && (err.message.includes('sexo') || err.code === 'ER_BAD_FIELD_ERROR')) {
        avatarActual = await query(
          `SELECT asi.*, ass.created_at as fecha_compra
           FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ?
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoData.id]
        );
      }
    }
    let avatarUrl = null;
    if (avatarActual.length > 0 && avatarActual[0].image) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      avatarUrl = process.env.NODE_ENV === 'production'
        ? `${phpSystemUrl}/Static/Image/Avatars/${avatarActual[0].image}`
        : `http://localhost:5000/Static/Image/Avatars/${avatarActual[0].image}`;
    }

    // Construir URL de foto
    let fotoUrl = null;
    if (alumnoData.foto && alumnoData.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumnoData.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumnoData.foto}`;
      }
    }

    // Avatar por bimestre (para widget) - nombre + descripcion + imagen
    let avatarWidget = null;
    try {
      const bimestre = await getAvatarBimestreEfectivo(colegio_id, anio_activo);
      const cols = 'id, bimestre, nombre, sexo, descripcion, imagen_base';
      const sexoAv = alumnoData.sexo !== null && alumnoData.sexo !== undefined ? alumnoData.sexo : 0;
      let bases = await query(`SELECT ${cols} FROM avatar_bases WHERE bimestre = ? AND sexo = ? LIMIT 1`, [bimestre, sexoAv]);
      if (bases.length === 0) bases = await query(`SELECT ${cols} FROM avatar_bases WHERE bimestre = ? LIMIT 1`, [bimestre]);
      if (bases.length > 0) {
        const row = bases[0];
        const getField = (r, keys) => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; const l = Object.keys(r).find((x) => x.toLowerCase() === keys[0].toLowerCase()); return l ? r[l] : ''; };
        const desc = String(getField(row, ['descripcion', 'Descripcion']) || '').trim();
        const equipado = await query(`SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ?`, [alumnoData.id, row.id]);
        const accId = equipado[0]?.accesorio_id;
        const baseUrl = getAvatarBaseUrlForReq(req);
        let imgUrl = row.imagen_base ? `${baseUrl}/${row.imagen_base}` : null;
        if (accId) {
          const acc = await query(`SELECT imagen_combinada FROM avatar_accesorios WHERE id = ?`, [accId]);
          if (acc.length > 0 && acc[0].imagen_combinada) imgUrl = `${baseUrl}/${acc[0].imagen_combinada}`;
        }
        avatarWidget = { nombre: row.nombre || 'Mi avatar', descripcion: desc, imagen_url: imgUrl, total_estrellas: totalEstrellas };
      }
    } catch (e) { /* ignorar si no existe avatar_bases */ }

    const responseData = {
      alumno: {
        id: alumnoData.id,
        nombres: alumnoData.nombres || 'Alumno',
        apellido_paterno: alumnoData.apellido_paterno || '',
        apellido_materno: alumnoData.apellido_materno || '',
        foto: fotoUrl
      },
      avatar_widget: avatarWidget,
      total_estrellas: totalEstrellas,
      avatar_actual: avatarActual.length > 0 ? {
        id: avatarActual[0].id,
        name: avatarActual[0].name,
        image: avatarActual[0].image,
        image_url: avatarUrl,
        level: avatarActual[0].level
      } : null,
      matricula: matriculaData ? {
        id: matriculaData.id,
        grado: matriculaData.grado,
        seccion: matriculaData.seccion,
        nivel_nombre: matriculaData.nivel_nombre,
        turno_nombre: matriculaData.turno_nombre,
        grupo_id: matriculaData.grupo_id,
        anio_lectivo: anio_activo
      } : null,
      tutor: tutorDashboard,
      estadisticas: {
        cursosAsignados: cursosAsignados[0]?.total || 0,
        totalDocentes: totalDocentes[0]?.total || 0,
        totalMatriculas: totalMatriculas[0]?.total || 0,
        totalTardanzas: totalTardanzas[0]?.total || 0,
        totalFaltas: totalFaltas[0]?.total || 0,
        mensajesNoLeidos: mensajesNoLeidos[0]?.total || 0
      },
      asignaturas: asignaturas || [],
      proximosExamenes: proximosExamenes || [],
      proximasTareas: proximasTareas || [],
      proximasActividades: actividades || [],
      comunicadoHome: comunicadoHomeData
    };
    
    console.log('✅ [ALUMNO DASHBOARD] Datos cargados exitosamente:', {
      estadisticas: responseData.estadisticas,
      asignaturas: responseData.asignaturas.length,
      examenes: responseData.proximosExamenes.length,
      tareas: responseData.proximasTareas.length,
      actividades: responseData.proximasActividades.length
    });
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ [ALUMNO DASHBOARD] Error general:', error);
    console.error('❌ [ALUMNO DASHBOARD] Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al obtener datos del dashboard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/alumno/cursos
 * Obtener cursos (asignaturas) del alumno
 */
router.get('/cursos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    
    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.*, u.tipo as tipo_usuario
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.*, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoData.id, colegio_id, anio_activo]
    );

    const matriculaData = matricula.length > 0 ? matricula[0] : null;
    const grupoId = matriculaData ? matriculaData.grupo_id : null;

    if (!grupoId) {
      return res.json({ cursos: [] });
    }

    // Obtener asignaturas (cursos) del alumno
    // IMPORTANTE: Igual que el sistema anterior - obtener asignaturas del grupo sin filtrar por año
    // El año ya está implícito en el grupo (grupoId ya corresponde al año activo)
    // Usar DISTINCT y subquery para evitar duplicados cuando un docente tiene múltiples usuarios activos
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
          docente_usuario_id: curso.docente_usuario_id // Asegurar que se incluya el usuario_id
        };
      });

    res.json({ cursos: cursosConImagenes });
  } catch (error) {
    console.error('Error obteniendo cursos del alumno:', error);
    res.status(500).json({ error: 'Error al obtener cursos' });
  }
});

/**
 * GET /api/alumno/matriculas
 * Obtener historial completo de matrículas del alumno
 */
router.get('/matriculas', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.*, u.tipo as tipo_usuario
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    // Obtener todas las matrículas del alumno ordenadas por año (más reciente primero)
    const matriculas = await query(
      `SELECT m.*, 
              g.grado, 
              g.seccion,
              g.anio,
              n.nombre as nivel_nombre,
              t.nombre as turno_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY g.anio DESC, m.fecha_registro DESC`,
      [alumnoData.id, colegio_id]
    );

    res.json({ matriculas: matriculas || [] });
  } catch (error) {
    console.error('Error obteniendo matrículas del alumno:', error);
    res.status(500).json({ error: 'Error al obtener matrículas' });
  }
});

/**
 * GET /api/alumno/docentes
 * Obtener docentes agrupados con sus cursos
 */
router.get('/docentes', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    
    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.*, u.tipo as tipo_usuario
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.*, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoData.id, colegio_id, anio_activo]
    );

    const matriculaData = matricula.length > 0 ? matricula[0] : null;
    const grupoId = matriculaData ? matriculaData.grupo_id : null;

    if (!grupoId) {
      return res.json({ docentes: [] });
    }

    // Obtener asignaturas (cursos) del alumno agrupadas por docente
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
               LIMIT 1) as docente_usuario_id
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY p.nombres ASC, p.apellidos ASC, c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Agrupar por docente
    const docentesMap = {};
    cursos.forEach(curso => {
      const docenteId = curso.docente_id;
      if (!docentesMap[docenteId]) {
        docentesMap[docenteId] = {
          docente_id: curso.docente_id,
          docente_nombre: curso.docente_nombre,
          docente_foto: curso.docente_foto,
          docente_usuario_id: curso.docente_usuario_id,
          cursos: []
        };
      }
      docentesMap[docenteId].cursos.push({
        curso_id: curso.curso_id,
        curso_nombre: curso.curso_nombre,
        curso_imagen: curso.curso_imagen,
        asignatura_id: curso.asignatura_id
      });
    });

    // Convertir a array y ordenar por nombres
    const docentes = Object.values(docentesMap).sort((a, b) => {
      // Extraer nombres para comparar
      const nombreA = a.docente_nombre || '';
      const nombreB = b.docente_nombre || '';
      return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    });

    // Construir URLs de imágenes
    const docentesConImagenes = docentes.map(docente => {
      let docenteFotoUrl = null;
      if (docente.docente_foto && docente.docente_foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          docenteFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${docente.docente_foto}`;
        } else {
          docenteFotoUrl = `http://localhost:5000/Static/Image/Fotos/${docente.docente_foto}`;
        }
      }
      
      return {
        ...docente,
        docente_foto_url: docenteFotoUrl
      };
    });

    res.json({ docentes: docentesConImagenes });
  } catch (error) {
    console.error('Error obteniendo docentes del alumno:', error);
    res.status(500).json({ error: 'Error al obtener docentes' });
  }
});

/**
 * GET /api/alumno/horario
 * Obtener horario del alumno basado en su grupo
 */
router.get('/horario', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    console.log('📅 [ALUMNO HORARIO] Iniciando carga para usuario:', usuario_id, 'colegio:', colegio_id, 'año:', anio_activo);

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.id FROM alumnos a INNER JOIN usuarios u ON u.alumno_id = a.id WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      console.log('📅 [ALUMNO HORARIO] Alumno no encontrado');
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoId = alumno[0].id;
    console.log('📅 [ALUMNO HORARIO] Alumno encontrado:', alumnoId);

    // Obtener matrícula actual del alumno para obtener su grupo
    const matricula = await query(
      `SELECT m.grupo_id FROM matriculas m 
       INNER JOIN grupos g ON g.id = m.grupo_id 
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0) 
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      console.log('📅 [ALUMNO HORARIO] No se encontró matrícula para el año activo');
      return res.json({ horario: [] });
    }

    const grupoId = matricula[0].grupo_id;
    console.log('📅 [ALUMNO HORARIO] Grupo encontrado:', grupoId);

    const anioActivoInt = parseInt(anio_activo);

    // Obtener horario del grupo del alumno
    // Incluye horarios con asignaturas Y horarios manuales (recreos, talleres, etc.)
    // Los horarios manuales tienen descripcion pero pueden no tener asignatura_id válido
    // Usamos LEFT JOIN para incluir ambos tipos de horarios
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

    console.log(`📅 [ALUMNO HORARIO] Filas de horario encontradas: ${horarioCrudo ? horarioCrudo.length : 0}`);
    if (horarioCrudo && horarioCrudo.length > 0) {
      console.log('📅 [ALUMNO HORARIO] Primera fila de horario:', horarioCrudo[0]);
    }

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
        grupo: grupoTexto,
        docente_nombre: row.docente_nombre || ''
      };
    });

    console.log(`📅 [ALUMNO HORARIO] Horario procesado: ${horario.length} registros`);
    res.json({ horario });
  } catch (error) {
    console.error('📅 [ALUMNO HORARIO] Error obteniendo horario del alumno:', error);
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

/**
 * GET /api/alumno/notificaciones
 * Obtener notificaciones del alumno
 */
router.get('/notificaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;

    // Obtener notificaciones para el alumno
    // NOTA: Las asistencias se guardan en asistencia_registros, pero las notificaciones
    // se crean automáticamente en la tabla notificaciones para los apoderados.
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

    const parsePayload = (raw) => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    // Mapear campos para compatibilidad con el frontend
    const notificacionesMapeadas = (notificaciones || []).map(n => ({
      id: n.id,
      titulo: n.titulo || 'Notificación del sistema', // SIEMPRE debe tener título
      mensaje: n.mensaje || n.contenido || '',
      fecha_hora: n.fecha_hora,
      estado: (n.leida === 1 || n.leida === true) ? 'LEIDO' : 'NO_LEIDO',
      tipo_origen: n.tipo_origen || 'NOTIFICACION',
      accion_tipo: n.accion_tipo || null,
      accion_payload: parsePayload(n.accion_payload),
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
 * PUT /api/alumno/notificaciones/:id/marcar-leido
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

    await execute(`UPDATE notificaciones SET leida = 1 WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error marcando notificación como leída:', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

/**
 * GET /api/alumno/avatares/resumen
 * Resumen ligero: avatar actual y total estrellas (para widget del dashboard)
 */
router.get('/avatares/resumen', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;

    const alumno = await query(
      `SELECT a.id, a.sexo FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [req.user.usuario_id, colegio_id]
    );
    if (alumno.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });

    const alumnoId = alumno[0].id;
    const matriculas = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [alumnoId, colegio_id, anio_activo]
    );
    const matriculaIds = matriculas.map(m => m.id);
    let totalEstrellas = 0;
    if (matriculaIds.length > 0) {
      const ph = matriculaIds.map(() => '?').join(',');
      const r = await query(
        `SELECT COALESCE(SUM(points), 0) as t FROM enrollment_incidents WHERE enrollment_id IN (${ph}) AND type = 2`,
        matriculaIds
      );
      totalEstrellas = parseInt(r[0]?.t || 0, 10);
    }

    const sexoAlumno = alumno[0].sexo;
    const sexoAvatar = sexoAlumno;
    let avatarActual = [];
    try {
      if (sexoAvatar !== null) {
        avatarActual = await query(
          `SELECT asi.* FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ? AND (asi.sexo = ? OR asi.sexo IS NULL)
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoId, sexoAvatar]
        );
      } else {
        avatarActual = await query(
          `SELECT asi.* FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ?
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoId]
        );
      }
    } catch (err) {
      if (err.message && (err.message.includes('sexo') || err.code === 'ER_BAD_FIELD_ERROR')) {
        avatarActual = await query(
          `SELECT asi.* FROM avatar_shop_sales ass
           INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
           WHERE ass.student_id = ?
           ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
          [alumnoId]
        );
      } else {
        throw err;
      }
    }

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `${phpSystemUrl}/Static/Image/Avatars/`
      : 'http://localhost:5000/Static/Image/Avatars/';

    let avatar_actual = null;
    if (avatarActual.length > 0) {
      const a = avatarActual[0];
      avatar_actual = {
        id: a.id,
        name: a.name,
        description: a.description || '',
        price: a.price != null ? a.price : 0,
        image: a.image,
        image_url: a.image ? `${baseUrl}${a.image}` : null,
        level: a.level
      };
    }

    res.json({ avatar_actual, total_estrellas: totalEstrellas });
  } catch (error) {
    console.error('Error obteniendo resumen avatar:', error);
    res.status(500).json({ avatar_actual: null, total_estrellas: 0 });
  }
});

/**
 * GET /api/alumno/avatares/tienda
 * Tienda de avatares filtrada por género del alumno
 */
router.get('/avatares/tienda', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;

    const alumno = await query(
      `SELECT a.id, a.sexo FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [req.user.usuario_id, colegio_id]
    );
    if (alumno.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });

    const alumnoId = alumno[0].id;
    const sexoAlumno = alumno[0].sexo;
    // sexo: 0=Femenino, 1=Masculino - mostrar avatares del mismo género
    const sexoAvatar = sexoAlumno;

    // Total estrellas acumulativas
    const matriculas = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [alumnoId, colegio_id, anio_activo]
    );
    const matriculaIds = matriculas.map(m => m.id);
    let totalEstrellas = 0;
    if (matriculaIds.length > 0) {
      const ph = matriculaIds.map(() => '?').join(',');
      const r = await query(
        `SELECT COALESCE(SUM(points), 0) as t FROM enrollment_incidents WHERE enrollment_id IN (${ph}) AND type = 2`,
        matriculaIds
      );
      totalEstrellas = parseInt(r[0]?.t || 0, 10);
    }

    // Items de la tienda (filtrar por sexo si existe columna, sino todos)
    let items = [];
    try {
      if (sexoAvatar !== null) {
        items = await query(
          `SELECT asi.* FROM avatar_shop_items asi
           WHERE asi.sexo = ? OR asi.sexo IS NULL
           ORDER BY asi.level ASC, asi.id ASC`,
          [sexoAvatar]
        );
      } else {
        items = await query(`SELECT * FROM avatar_shop_items ORDER BY level ASC, id ASC`);
      }
    } catch (err) {
      if (err.message && (err.message.includes('sexo') || err.code === 'ER_BAD_FIELD_ERROR')) {
        items = await query(`SELECT * FROM avatar_shop_items ORDER BY level ASC, id ASC`);
      } else {
        throw err;
      }
    }

    // Avatares ya comprados por el alumno
    const comprados = await query(
      `SELECT item_id FROM avatar_shop_sales WHERE student_id = ?`,
      [alumnoId]
    );
    const idsComprados = new Set(comprados.map(c => c.item_id));

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const baseAvatarUrl = process.env.NODE_ENV === 'production'
      ? `${phpSystemUrl}/Static/Image/Avatars/`
      : 'http://localhost:5000/Static/Image/Avatars/';

    const itemsConEstado = items.map(it => ({
      ...it,
      ya_comprado: idsComprados.has(it.id),
      image_url: it.image ? `${baseAvatarUrl}${it.image}` : null,
      puede_comprar: it.price === 0 || totalEstrellas >= (it.price || 0)
    }));

    // Avatar actual (mayor level comprado, mismo género que el alumno)
    let avatarActual = [];
    if (sexoAvatar !== null && sexoAvatar !== undefined) {
      avatarActual = await query(
        `SELECT asi.* FROM avatar_shop_sales ass
         INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
         WHERE ass.student_id = ? AND (asi.sexo = ? OR asi.sexo IS NULL)
         ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
        [alumnoId, sexoAvatar]
      );
    }
    if (avatarActual.length === 0) {
      avatarActual = await query(
        `SELECT asi.* FROM avatar_shop_sales ass
         INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
         WHERE ass.student_id = ?
         ORDER BY asi.level DESC, ass.created_at DESC LIMIT 1`,
        [alumnoId]
      );
    }
    let avatarActualData = null;
    if (avatarActual.length > 0) {
      const a = avatarActual[0];
      avatarActualData = {
        id: a.id,
        name: a.name,
        description: a.description || '',
        price: a.price != null ? a.price : 0,
        image: a.image,
        image_url: a.image ? `${baseAvatarUrl}${a.image}` : null,
        level: a.level
      };
    }

    res.json({
      items: itemsConEstado,
      total_estrellas: totalEstrellas,
      avatar_actual: avatarActualData
    });
  } catch (error) {
    console.error('Error obteniendo tienda de avatares:', error);
    const msg = error.message || 'Error al cargar la tienda';
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes('avatar_shop'))) {
      return res.json({ items: [], total_estrellas: 0, avatar_actual: null });
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/alumno/avatares/comprar/:itemId
 * Comprar/desbloquear avatar (las estrellas no se gastan, son umbral)
 */
router.post('/avatares/comprar/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    const alumno = await query(
      `SELECT a.id, a.sexo FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [req.user.usuario_id, colegio_id]
    );
    if (alumno.length === 0) return res.status(404).json({ error: 'Alumno no encontrado' });

    const alumnoId = alumno[0].id;
    const sexoAlumno = alumno[0].sexo;
    const sexoAvatar = sexoAlumno;

    const item = await query(
      `SELECT * FROM avatar_shop_items WHERE id = ?`,
      [itemId]
    );
    if (item.length === 0) return res.status(404).json({ error: 'Avatar no encontrado' });

    const yaComprado = await query(
      `SELECT id FROM avatar_shop_sales WHERE student_id = ? AND item_id = ?`,
      [alumnoId, itemId]
    );
    if (yaComprado.length > 0) {
      return res.status(400).json({ error: 'Ya tienes este avatar' });
    }

    // Verificar género (solo si la columna sexo existe y el item lo tiene definido)
    if (typeof item[0].sexo === 'number' && sexoAvatar !== null && item[0].sexo !== sexoAvatar) {
      return res.status(400).json({ error: 'Este avatar no está disponible para tu perfil' });
    }

    // Total estrellas
    const matriculas = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [alumnoId, colegio_id, anio_activo]
    );
    const matriculaIds = matriculas.map(m => m.id);
    let totalEstrellas = 0;
    if (matriculaIds.length > 0) {
      const ph = matriculaIds.map(() => '?').join(',');
      const r = await query(
        `SELECT COALESCE(SUM(points), 0) as t FROM enrollment_incidents WHERE enrollment_id IN (${ph}) AND type = 2`,
        matriculaIds
      );
      totalEstrellas = parseInt(r[0]?.t || 0, 10);
    }

    const price = parseInt(item[0].price || 0, 10);
    if (price > 0 && totalEstrellas < price) {
      return res.status(400).json({
        error: `Necesitas al menos ${price} estrellas para desbloquear este avatar. Tienes ${totalEstrellas}.`
      });
    }

    const now = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO avatar_shop_sales (student_id, item_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [alumnoId, itemId, now, now]
    );

    res.json({
      success: true,
      message: '¡Avatar desbloqueado!',
      avatar: {
        id: item[0].id,
        name: item[0].name,
        image: item[0].image,
        image_url: item[0].image
          ? `${process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe'}/Static/Image/Avatars/${item[0].image}`
          : null
      }
    });
  } catch (error) {
    console.error('Error comprando avatar:', error);
    res.status(500).json({ error: 'Error al comprar el avatar' });
  }
});

// --- Sistema de avatares por bimestre (tablas avatar_bases, avatar_accesorios, etc.) ---
const getBimestreActual = () => {
  const m = new Date().getMonth() + 1; // 1-12
  return Math.min(4, Math.max(1, Math.ceil(m / 3)));
};

/**
 * Obtiene el bimestre actual según los rangos de ciclos de notas del colegio (Configuración → NOTAS).
 * Si no hay rangos configurados o la fecha no cae en ninguno, usa getBimestreActual().
 */
const getBimestreActualFromConfig = async (colegio_id, anio_activo) => {
  try {
    const rows = await query(
      'SELECT rangos_ciclos_notas FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    if (!rows || rows.length === 0 || !rows[0].rangos_ciclos_notas) return getBimestreActual();

    let rangos = {};
    try {
      rangos = phpSerialize.unserialize(rows[0].rangos_ciclos_notas) || {};
    } catch (e) {
      try {
        rangos = JSON.parse(rows[0].rangos_ciclos_notas) || {};
      } catch (e2) {
        return getBimestreActual();
      }
    }

    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const parseDdMm = (str) => {
      if (!str || typeof str !== 'string') return null;
      const parts = str.trim().split('-');
      if (parts.length < 2) return null;
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(d) || isNaN(m) || m < 1 || m > 12) return null;
      return new Date(anio, m - 1, d);
    };

    for (let ciclo = 1; ciclo <= 4; ciclo++) {
      const key = ciclo.toString();
      const r = rangos[key] || rangos[ciclo];
      if (!r || !r.inicio || !r.final) continue;
      const inicioDate = parseDdMm(r.inicio);
      const finalDate = parseDdMm(r.final);
      if (!inicioDate || !finalDate) continue;
      inicioDate.setHours(0, 0, 0, 0);
      finalDate.setHours(23, 59, 59, 999);
      if (hoy >= inicioDate && hoy <= finalDate) return ciclo;
    }
  } catch (err) {
    console.warn('getBimestreActualFromConfig:', err.message);
  }
  return getBimestreActual();
};

/**
 * Compatibilidad de avatar: si no existe configuración en el bimestre actual,
 * usar bimestre 1 para no cortar progreso de alumnos.
 */
const getAvatarBimestreEfectivo = async (colegio_id, anio_activo) => {
  const bimestreActual = await getBimestreActualFromConfig(colegio_id, anio_activo);
  if (bimestreActual === 1) return 1;
  try {
    const rows = await query(
      'SELECT id FROM avatar_bases WHERE bimestre = ? LIMIT 1',
      [bimestreActual]
    );
    if (rows && rows.length > 0) return bimestreActual;
  } catch (err) {
    console.warn('getAvatarBimestreEfectivo:', err.message);
  }
  return 1;
};

const baseAvatarBimestreUrl = () => (process.env.NODE_ENV === 'production'
  ? `${process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe'}/Static/Image/Avatars/`
  : 'http://localhost:5000/Static/Image/Avatars/');

/** URL base para imágenes de avatares (misma que admin: /api/static/avatars para que carguen desde Node) */
function getAvatarBaseUrlForReq(req) {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5000/api/static/avatars';
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  let protocol = req.get('x-forwarded-proto') || req.protocol;
  if (!protocol || protocol === 'http') protocol = 'https'; // Evitar Mixed Content: forzar HTTPS en producción
  if (host) return `${protocol}://${host}/api/static/avatars`;
  const fallback = process.env.API_PUBLIC_URL || process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  return fallback.replace(/\/$/, '') + '/api/static/avatars';
}

const getAlumnoIdAndSexo = async (req) => {
  const { colegio_id } = req.user;
  const alumno = await query(
    `SELECT a.id, a.sexo FROM alumnos a
     INNER JOIN usuarios u ON u.alumno_id = a.id
     WHERE u.id = ? AND u.colegio_id = ?`,
    [req.user.usuario_id, colegio_id]
  );
  if (alumno.length === 0) return null;
  return { alumnoId: alumno[0].id, sexo: alumno[0].sexo };
};

const getTotalEstrellasAlumno = async (alumnoId, colegio_id, anio_activo) => {
  const matriculas = await query(
    `SELECT m.id FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
    [alumnoId, colegio_id, anio_activo]
  );
  const matriculaIds = matriculas.map(m => m.id);
  if (matriculaIds.length === 0) return 0;
  const ph = matriculaIds.map(() => '?').join(',');
  const r = await query(
    `SELECT COALESCE(SUM(points), 0) as t FROM enrollment_incidents WHERE enrollment_id IN (${ph}) AND type = 2`,
    matriculaIds
  );
  return parseInt(r[0]?.t || 0, 10);
};

/**
 * GET /api/alumno/avatares-bimestre/resumen
 * Resumen: avatar actual (imagen a mostrar), total estrellas, bimestre
 */
router.get('/avatares-bimestre/resumen', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const bimestre = req.query.bimestre ? parseInt(req.query.bimestre, 10) : await getAvatarBimestreEfectivo(colegio_id, anio_activo);
    const data = await getAlumnoIdAndSexo(req);
    if (!data) return res.status(404).json({ error: 'Alumno no encontrado' });
    const { alumnoId, sexo } = data;
    const totalEstrellas = await getTotalEstrellasAlumno(alumnoId, colegio_id, anio_activo);

    const cols = 'id, bimestre, nombre, sexo, descripcion, historia, imagen_base, orden';
    const sexoAv = sexo !== null && sexo !== undefined ? sexo : 0;
    let base = await query(
      `SELECT ${cols} FROM avatar_bases WHERE bimestre = ? AND sexo = ? LIMIT 1`,
      [bimestre, sexoAv]
    );
    if (base.length === 0) {
      base = await query(`SELECT ${cols} FROM avatar_bases WHERE bimestre = ? LIMIT 1`, [bimestre]);
    }
    if (base.length === 0) {
      return res.json({
        avatar_imagen_url: null,
        avatar_base: null,
        total_estrellas: totalEstrellas,
        bimestre,
        mensaje: 'No hay avatar configurado para este bimestre.'
      });
    }

    const baseRow = base[0];
    const safeStr = (v) => {
      if (v == null || v === undefined) return '';
      if (Buffer.isBuffer(v)) return v.toString('utf8');
      return String(v || '').trim();
    };
    const getField = (row, keys) => {
      for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
      const lower = Object.keys(row).find((x) => x.toLowerCase() === keys[0].toLowerCase());
      return lower ? row[lower] : '';
    };
    const descripcionStr = safeStr(getField(baseRow, ['descripcion', 'Descripcion', 'DESCRIPCION']));
    const historiaStr = safeStr(getField(baseRow, ['historia', 'Historia', 'HISTORIA']));

    const equipado = await query(
      `SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ?`,
      [alumnoId, baseRow.id]
    );
    const accesorioId = equipado[0]?.accesorio_id || null;
    const baseUrl = getAvatarBaseUrlForReq(req);
    let imagenUrl = baseRow.imagen_base ? `${baseUrl}/${baseRow.imagen_base}` : null;
    if (accesorioId) {
      const acc = await query(
        `SELECT imagen_combinada FROM avatar_accesorios WHERE id = ?`,
        [accesorioId]
      );
      if (acc.length > 0 && acc[0].imagen_combinada) {
        imagenUrl = `${baseUrl}/${acc[0].imagen_combinada}`;
      }
    }
    if (!imagenUrl && baseRow.imagen_base) imagenUrl = `${baseUrl}/${baseRow.imagen_base}`;

    res.json({
      avatar_imagen_url: imagenUrl,
      avatar_base: {
        id: baseRow.id,
        bimestre: baseRow.bimestre,
        nombre: baseRow.nombre,
        sexo: baseRow.sexo,
        descripcion: descripcionStr,
        historia: historiaStr
      },
      total_estrellas: totalEstrellas,
      bimestre
    });
  } catch (error) {
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes('avatar_bases'))) {
      return res.json({ avatar_imagen_url: null, avatar_base: null, total_estrellas: 0, bimestre: 1, mensaje: 'Sistema de avatares por bimestre no configurado.' });
    }
    console.error('Error avatares-bimestre resumen:', error);
    res.status(500).json({ error: 'Error al obtener resumen de avatar' });
  }
});

/**
 * GET /api/alumno/avatares-bimestre/bases
 * Listar avatares base (por bimestre y opcionalmente sexo)
 */
router.get('/avatares-bimestre/bases', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user || {};
    const bimestre = req.query.bimestre ? parseInt(req.query.bimestre, 10) : await getAvatarBimestreEfectivo(colegio_id, anio_activo);
    const sexo = req.query.sexo !== undefined ? parseInt(req.query.sexo, 10) : null;
    let bases = [];
    if (sexo !== null && !isNaN(sexo)) {
      bases = await query(`SELECT * FROM avatar_bases WHERE bimestre = ? AND sexo = ? ORDER BY orden, id`, [bimestre, sexo]);
    } else {
      bases = await query(`SELECT * FROM avatar_bases WHERE bimestre = ? ORDER BY sexo, orden, id`, [bimestre]);
    }
    const baseUrl = getAvatarBaseUrlForReq(req);
    const list = bases.map(b => ({
      ...b,
      imagen_base_url: b.imagen_base ? `${baseUrl}/${b.imagen_base}` : null
    }));
    res.json({ bases: list, bimestre });
  } catch (error) {
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes('avatar_bases'))) {
      return res.json({ bases: [], bimestre: 1 });
    }
    console.error('Error listando bases avatares-bimestre:', error);
    res.status(500).json({ error: 'Error al listar avatares base' });
  }
});

/**
 * GET /api/alumno/avatares-bimestre/bases/:baseId/accesorios
 * Listar accesorios de un avatar base (con estado desbloqueado / puede desbloquear para el alumno)
 */
router.get('/avatares-bimestre/bases/:baseId/accesorios', async (req, res) => {
  try {
    const { baseId } = req.params;
    const data = await getAlumnoIdAndSexo(req);
    if (!data) return res.status(404).json({ error: 'Alumno no encontrado' });
    const { alumnoId } = data;
    const { colegio_id, anio_activo } = req.user;
    const totalEstrellas = await getTotalEstrellasAlumno(alumnoId, colegio_id, anio_activo);

    const accesorios = await query(
      `SELECT * FROM avatar_accesorios WHERE avatar_base_id = ? ORDER BY orden, id`,
      [baseId]
    );
    let desbloqueadoIds = new Set();
    if (accesorios.length > 0) {
      const desbloqueos = await query(
        `SELECT accesorio_id FROM alumno_avatar_desbloqueos WHERE student_id = ? AND accesorio_id IN (${accesorios.map(() => '?').join(',')})`,
        [alumnoId, ...accesorios.map(a => a.id)]
      );
      desbloqueadoIds = new Set((desbloqueos || []).map(d => d.accesorio_id));
    }
    const equipado = await query(
      `SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ?`,
      [alumnoId, baseId]
    );
    const equipadoId = equipado[0]?.accesorio_id || null;
    const baseUrl = getAvatarBaseUrlForReq(req);
    const list = accesorios.map(a => ({
      ...a,
      imagen_accesorio_url: a.imagen_accesorio ? `${baseUrl}/${a.imagen_accesorio}` : null,
      imagen_combinada_url: a.imagen_combinada ? `${baseUrl}/${a.imagen_combinada}` : null,
      desbloqueado: desbloqueadoIds.has(a.id),
      puede_desbloquear: totalEstrellas >= (a.puntuacion_requerida || 0),
      equipado: equipadoId === a.id
    }));
    res.json({ accesorios: list, total_estrellas: totalEstrellas });
  } catch (error) {
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes('avatar_accesorios'))) {
      return res.json({ accesorios: [], total_estrellas: 0 });
    }
    console.error('Error listando accesorios avatares-bimestre:', error);
    res.status(500).json({ error: 'Error al listar accesorios' });
  }
});

/**
 * POST /api/alumno/avatares-bimestre/desbloquear/:accesorioId
 * Desbloquear accesorio si el alumno tiene puntuación suficiente
 */
router.post('/avatares-bimestre/desbloquear/:accesorioId', async (req, res) => {
  try {
    const { accesorioId } = req.params;
    const data = await getAlumnoIdAndSexo(req);
    if (!data) return res.status(404).json({ error: 'Alumno no encontrado' });
    const { alumnoId } = data;
    const { colegio_id, anio_activo } = req.user;
    const totalEstrellas = await getTotalEstrellasAlumno(alumnoId, colegio_id, anio_activo);

    const acc = await query(`SELECT * FROM avatar_accesorios WHERE id = ?`, [accesorioId]);
    if (acc.length === 0) return res.status(404).json({ error: 'Accesorio no encontrado' });
    const required = parseInt(acc[0].puntuacion_requerida || 0, 10);
    if (totalEstrellas < required) {
      return res.status(400).json({
        error: `Necesitas al menos ${required} estrellas. Tienes ${totalEstrellas}.`
      });
    }
    const exist = await query(
      `SELECT id FROM alumno_avatar_desbloqueos WHERE student_id = ? AND accesorio_id = ?`,
      [alumnoId, accesorioId]
    );
    if (exist.length > 0) {
      return res.json({ success: true, message: 'Ya tenías este accesorio desbloqueado.' });
    }
    await execute(
      `INSERT INTO alumno_avatar_desbloqueos (student_id, accesorio_id) VALUES (?, ?)`,
      [alumnoId, accesorioId]
    );
    res.json({ success: true, message: '¡Accesorio desbloqueado!' });
  } catch (error) {
    console.error('Error desbloqueando accesorio:', error);
    res.status(500).json({ error: 'Error al desbloquear accesorio' });
  }
});

/**
 * PUT /api/alumno/avatares-bimestre/equipar
 * Body: { avatar_base_id, accesorio_id } (accesorio_id null = solo base)
 */
router.put('/avatares-bimestre/equipar', async (req, res) => {
  try {
    const { avatar_base_id, accesorio_id } = req.body || {};
    const data = await getAlumnoIdAndSexo(req);
    if (!data) return res.status(404).json({ error: 'Alumno no encontrado' });
    const alumnoId = data.alumnoId;
    if (!avatar_base_id) return res.status(400).json({ error: 'Falta avatar_base_id' });

    if (accesorio_id != null) {
      const acc = await query(
        `SELECT id FROM avatar_accesorios WHERE id = ? AND avatar_base_id = ?`,
        [accesorio_id, avatar_base_id]
      );
      if (acc.length === 0) return res.status(400).json({ error: 'Accesorio no pertenece a este avatar' });
      const desbloqueo = await query(
        `SELECT id FROM alumno_avatar_desbloqueos WHERE student_id = ? AND accesorio_id = ?`,
        [alumnoId, accesorio_id]
      );
      if (desbloqueo.length === 0) return res.status(400).json({ error: 'Debes desbloquear este accesorio primero' });
    }

    const exist = await query(
      `SELECT 1 FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ?`,
      [alumnoId, avatar_base_id]
    );
    if (exist.length > 0) {
      await execute(
        `UPDATE alumno_avatar_equipado SET accesorio_id = ? WHERE student_id = ? AND avatar_base_id = ?`,
        [accesorio_id || null, alumnoId, avatar_base_id]
      );
    } else {
      await execute(
        `INSERT INTO alumno_avatar_equipado (student_id, avatar_base_id, accesorio_id) VALUES (?, ?, ?)`,
        [alumnoId, avatar_base_id, accesorio_id || null]
      );
    }
    res.json({ success: true, message: 'Avatar actualizado.' });
  } catch (error) {
    console.error('Error equipando accesorio:', error);
    res.status(500).json({ error: 'Error al equipar' });
  }
});

/**
 * GET /api/alumno/actividades
 * Obtener actividades del colegio (solo lectura para alumno)
 */
router.get('/actividades', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { anio } = req.query;

    // Si no se especifica año, usar año actual
    const añoFiltro = anio ? parseInt(anio) : new Date().getFullYear();

    // Obtener todas las actividades del año especificado
    const actividades = await query(
      `SELECT a.*
       FROM actividades a
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       ORDER BY a.fecha_inicio ASC`,
      [colegio_id, añoFiltro]
    );

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
 * GET /api/alumno/publicaciones
 * Obtener publicaciones (solo las de TODOS y las de su grupo)
 */
router.get('/publicaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener grupo del alumno
    const alumno = await query(
      `SELECT a.id FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoId = alumno[0].id;

    // Obtener matrícula y grupo del alumno
    const matricula = await query(
      `SELECT m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    const grupoId = matricula.length > 0 ? matricula[0].grupo_id : null;

    // Obtener publicaciones: solo las de TODOS y las de su grupo
    // El campo en la BD es 'privacidad': '-1' = TODOS, '-2' = Personal Administrativo, o IDs de grupos separados por comas
    let publicaciones = [];
    try {
      if (grupoId) {
        publicaciones = await query(
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
           AND (p.privacidad = '-1' OR p.privacidad = '' OR p.privacidad IS NULL 
                OR (p.privacidad LIKE ? OR p.privacidad LIKE ? OR p.privacidad LIKE ? OR p.privacidad = ?))
           ORDER BY p.fecha_hora DESC
           LIMIT 50`,
          // Coincidir grupo en lista CSV: medio, primero, último, o único (antes faltaba el último → no veían el 3er grupo)
          [colegio_id, `%,${grupoId},%`, `${grupoId},%`, `%,${grupoId}`, String(grupoId)]
        );
      } else {
        // Si no tiene grupo, solo mostrar publicaciones de TODOS
        publicaciones = await query(
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
           AND (p.privacidad = '-1' OR p.privacidad = '' OR p.privacidad IS NULL)
           ORDER BY p.fecha_hora DESC
           LIMIT 50`,
          [colegio_id]
        );
      }
    } catch (error) {
      console.error('Error obteniendo publicaciones:', error);
      // Continuar con array vacío en caso de error
      publicaciones = [];
    }

    // Obtener todos los grupos del colegio para mapear IDs a nombres
    const gruposMap = {};
    try {
      const grupos = await query(
        `SELECT id, CONCAT(grado, '° ', seccion) as nombre
         FROM grupos
         WHERE colegio_id = ? AND anio = ?`,
        [colegio_id, anio_activo]
      );
      grupos.forEach(g => {
        gruposMap[g.id] = g.nombre;
      });
    } catch (error) {
      console.warn('Error obteniendo grupos para mapeo:', error);
    }

    // Procesar publicaciones
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';

    const publicacionesProcesadas = publicaciones.map(pub => {
      // Decodificar imágenes (formato PHP: base64_encode(serialize(array)))
      let images = [];
      if (pub.images && pub.images.trim() !== '') {
        try {
          const decoded = Buffer.from(pub.images, 'base64').toString('utf-8');
          const deserialized = phpSerialize.unserialize(decoded);
          if (Array.isArray(deserialized)) {
            images = deserialized.map(img => {
              if (img.startsWith('http')) {
                return img;
              } else if (img.startsWith('/Static/')) {
                return `${phpSystemUrl}${img}`;
              } else {
                return `${phpSystemUrl}/Static/Image/Publicaciones/${img}`;
              }
            });
          }
        } catch (error) {
          console.warn('Error decodificando imágenes de publicación:', error);
        }
      }

      // Decodificar archivos (igual que docente: usar regex en lugar de unserialize directo)
      let archivos = [];
      if (pub.archivos && pub.archivos.trim() !== '') {
        try {
          let decoded = pub.archivos;
          // Intentar decodificar base64 si es necesario
          try {
            const base64Decoded = Buffer.from(pub.archivos, 'base64').toString('utf-8');
            if (base64Decoded.startsWith('a:')) {
              decoded = base64Decoded;
            }
          } catch (e) {
            // Si no es base64, usar directamente
            decoded = pub.archivos;
          }
          
          if (decoded.startsWith('a:')) {
            // Usar regex para extraer nombres de archivos (mismo método que docente)
            const regex = /s:\d+:"([^"]+)"/g;
            let match;
            while ((match = regex.exec(decoded)) !== null) {
              archivos.push(match[1]);
            }
          }
        } catch (error) {
          console.warn('Error decodificando archivos de publicación:', error);
        }
      }

      // Construir URL completa de la foto del autor (igual que docente)
      let autorFotoUrl = null;
      if (pub.autor_foto && pub.autor_foto !== '') {
        // Si ya es una URL completa, usarla directamente
        if (pub.autor_foto.startsWith('http')) {
          autorFotoUrl = pub.autor_foto;
        } else if (pub.autor_foto.startsWith('/uploads/')) {
          // Si ya tiene la ruta /uploads/, construir URL completa
          if (isProduction) {
            autorFotoUrl = `${frontendUrl}${pub.autor_foto}`;
          } else {
            autorFotoUrl = `http://localhost:5000${pub.autor_foto}`;
          }
        } else {
          // Es solo el nombre del archivo, determinar si es personal o alumno según el tipo de usuario
          const esPersonal = pub.autor_tipo === 'DOCENTE' || pub.autor_tipo === 'DIRECTOR' || pub.autor_tipo === 'ADMINISTRADOR';
          
          if (isProduction) {
            // Usar el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
            autorFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${pub.autor_foto}`;
          } else {
            // En desarrollo, usar la ruta de uploads según el tipo
            const uploadPath = esPersonal ? 'uploads/personal' : 'uploads/alumnos';
            autorFotoUrl = `http://localhost:5000/${uploadPath}/${pub.autor_foto}`;
          }
        }
      }

      // Procesar grupos (si privacidad contiene IDs de grupos)
      let gruposNombres = [];
      if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1' && pub.privacidad !== '-2') {
        const grupoIds = pub.privacidad.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
        gruposNombres = grupoIds.map(id => gruposMap[id] || `Grupo ${id}`).filter(Boolean);
      }
      
      // Determinar compartir_con basado en privacidad
      let compartirCon = 'TODOS';
      if (pub.privacidad === '-2') {
        compartirCon = 'PERSONAL';
      } else if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1' && pub.privacidad !== '-2') {
        compartirCon = 'GRUPO';
      }

      // Devolver en el mismo formato que docente (para compatibilidad con PublicacionesWidget)
      return {
        id: pub.id,
        contenido: pub.contenido || '',
        tipo_video: pub.tipo_video || '',
        video_id: pub.video_id || '',
        images: images,
        archivos: archivos,
        compartir_con: compartirCon,
        grupos: gruposNombres,
        fecha_hora: pub.fecha_hora,
        para_texto: compartirCon === 'TODOS' ? 'Todos' : (gruposNombres.length > 0 ? gruposNombres.join(', ') : 'Grupos específicos'),
        autor_id: pub.autor_id,
        autor_usuario: pub.autor_usuario,
        autor_nombre_completo: pub.autor_nombre_completo || pub.autor_usuario || 'Usuario',
        autor_foto_url: autorFotoUrl, // Campo que usa el frontend
        autor_tipo: pub.autor_tipo,
        // Mantener también el objeto autor para compatibilidad
        autor: {
          id: pub.autor_id,
          usuario: pub.autor_usuario,
          nombre_completo: pub.autor_nombre_completo || pub.autor_usuario || 'Usuario',
          foto: autorFotoUrl,
          tipo: pub.autor_tipo
        }
      };
    });

    res.json({ publicaciones: publicacionesProcesadas || [] });
  } catch (error) {
    console.error('Error obteniendo publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

/**
 * GET /api/alumno/perfil
 * Obtener perfil del alumno
 */
router.get('/perfil', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;

    const alumno = await query(
      `SELECT a.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    // Obtener todos los apoderados vinculados al alumno
    const apoderados = await query(
      `SELECT ap.*, 
              CASE 
                WHEN ap.parentesco = 0 THEN 'Padre'
                WHEN ap.parentesco = 1 THEN 'Madre'
                WHEN ap.parentesco = 2 THEN 'Tutor'
                WHEN ap.parentesco = 3 THEN 'Abuelo(a)'
                WHEN ap.parentesco = 4 THEN 'Otro'
                ELSE 'Otro'
              END as parentesco_nombre
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       WHERE f.alumno_id = ? AND ap.colegio_id = ?
       ORDER BY ap.parentesco ASC, ap.apellido_paterno ASC, ap.apellido_materno ASC, ap.nombres ASC`,
      [alumnoData.id, colegio_id]
    );

    // Separar padre y madre
    const padre = apoderados.find(a => a.parentesco === 0) || null;
    const madre = apoderados.find(a => a.parentesco === 1) || null;

    // Construir URL de foto
    let fotoUrl = null;
    if (alumnoData.foto && alumnoData.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumnoData.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumnoData.foto}`;
      }
    }

    res.json({
      id: alumnoData.id,
      nombres: alumnoData.nombres,
      apellido_paterno: alumnoData.apellido_paterno,
      apellido_materno: alumnoData.apellido_materno,
      dni: alumnoData.dni,
      email: alumnoData.email || null,
      sexo: alumnoData.sexo !== undefined ? alumnoData.sexo : null,
      foto: fotoUrl,
      fecha_nacimiento: alumnoData.fecha_nacimiento,
      apoderados: (apoderados || []).map((ap) => ({
        id: ap.id,
        parentesco: ap.parentesco,
        parentesco_nombre: ap.parentesco_nombre || 'Apoderado',
        nombres: ap.nombres || '',
        apellido_paterno: ap.apellido_paterno || '',
        apellido_materno: ap.apellido_materno || '',
        telefono_fijo: ap.telefono_fijo || '',
        telefono_celular: ap.telefono_celular || '',
        email: ap.email || ''
      })),
      padre: padre ? {
        nombres: padre.nombres || '',
        apellido_paterno: padre.apellido_paterno || '',
        apellido_materno: padre.apellido_materno || '',
        telefono_fijo: padre.telefono_fijo || '',
        telefono_celular: padre.telefono_celular || '',
        email: padre.email || ''
      } : null,
      madre: madre ? {
        nombres: madre.nombres || '',
        apellido_paterno: madre.apellido_paterno || '',
        apellido_materno: madre.apellido_materno || '',
        telefono_fijo: madre.telefono_fijo || '',
        telefono_celular: madre.telefono_celular || '',
        email: madre.email || ''
      } : null
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * PUT /api/alumno/perfil
 * Actualizar perfil del alumno (incluyendo foto)
 */
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

const uploadAlumno = multer({
  storage: alumnoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

router.put('/perfil', uploadAlumno.single('foto'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { nombres, apellido_paterno, apellido_materno, email, sexo, fecha_nacimiento } = req.body;

    // Obtener alumno actual
    const alumno = await query(
      `SELECT a.* FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
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

    // Actualizar datos (solo campos que existen en la tabla alumnos)
    await execute(
      `UPDATE alumnos SET
        nombres = ?,
        apellido_paterno = ?,
        apellido_materno = ?,
        email = ?,
        sexo = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ?`,
      [
        nombres || alumnoData.nombres,
        apellido_paterno || alumnoData.apellido_paterno,
        apellido_materno || alumnoData.apellido_materno,
        email || alumnoData.email || null,
        sexo !== undefined ? sexo : (alumnoData.sexo !== undefined ? alumnoData.sexo : null),
        fotoPath,
        fecha_nacimiento || alumnoData.fecha_nacimiento || null,
        alumnoData.id
      ]
    );

    // Obtener perfil actualizado
    const alumnoActualizado = await query(
      `SELECT a.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    const alumnoDataActualizado = alumnoActualizado[0];

    // Construir URL de foto
    let fotoUrl = null;
    if (alumnoDataActualizado.foto && alumnoDataActualizado.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumnoDataActualizado.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumnoDataActualizado.foto}`;
      }
    }

    res.json({
      id: alumnoDataActualizado.id,
      nombres: alumnoDataActualizado.nombres,
      apellido_paterno: alumnoDataActualizado.apellido_paterno,
      apellido_materno: alumnoDataActualizado.apellido_materno,
      dni: alumnoDataActualizado.dni,
      email: alumnoDataActualizado.email || null,
      sexo: alumnoDataActualizado.sexo !== undefined ? alumnoDataActualizado.sexo : null,
      foto: fotoUrl,
      fecha_nacimiento: alumnoDataActualizado.fecha_nacimiento
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

/**
 * PUT /api/alumno/perfil/password
 * Cambiar contraseña del alumno
 */
router.put('/perfil/password', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    // Obtener usuario
    const usuarios = await query(
      `SELECT u.* FROM usuarios u
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuario = usuarios[0];

    // Validar contraseña actual
    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha1').update(password_actual).digest('hex');
    
    if (usuario.password !== passwordHash) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Actualizar contraseña
    const newPasswordHash = crypto.createHash('sha1').update(password_nueva).digest('hex');
    await execute(
      `UPDATE usuarios SET password = ? WHERE id = ?`,
      [newPasswordHash, usuario_id]
    );

    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

/**
 * GET /api/alumno/qr
 * Obtener datos del alumno para QR/carnet (misma estructura que apoderado/hijos/:id/qr)
 */
router.get('/qr', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del alumno (incl. foto para carnet)
    const alumno = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto,
              u.usuario as nro_documento
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
       WHERE u.id = ? AND a.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    const matricula = await fetchMatriculaVigenteMasReciente(query, alumnoData.id, colegio_id);

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

    // Apoderado del alumno (para carnet: Apoderado, Celular, Dirección)
    const apoderadoInfo = await query(
      `SELECT ap.id, CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              ap.telefono_celular,
              ap.direccion
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       WHERE f.alumno_id = ? AND ap.colegio_id = ?
       LIMIT 1`,
      [alumnoData.id, colegio_id]
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

    const qrData = alumnoData.nro_documento || `ALUMNO-${alumnoData.id}`;

    // Foto y logo en base64 para el carnet (igual que apoderado/hijos/:id/qr)
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
      foto_url: foto_url || null,
      foto_base64: foto_base64 || null,
      logo_url: logo_url || null,
      logo_base64: logo_base64 || null,
      apoderado_nombre,
      apoderado_celular,
      direccion
    });
  } catch (error) {
    console.error('Error obteniendo datos para QR:', error);
    res.status(500).json({ error: 'Error al obtener datos para QR' });
  }
});

/**
 * GET /api/alumno/comunicados
 * Obtener comunicados (solo lectura, generados por admin)
 */
router.get('/comunicados', async (req, res) => {
  try {
    console.log('📥 [ALUMNO COMUNICADOS] GET /comunicados - Iniciando, año activo:', req.user?.anio_activo);
    const { colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 12, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Construir query base - Solo activos del año activo
    let querySql = `
      SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ? AND YEAR(c.fecha_hora) = ? AND c.estado = 'ACTIVO'
    `;
    const params = [colegio_id, anio_activo];

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

    // Construir URLs de archivos (igual que en docente)
    const fs = require('fs');
    const path = require('path');
    const staticArchivosPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
    
    const comunicadosConUrls = (comunicados || []).map(com => {
      let archivoUrl = null;
      let archivoExiste = false;
      
      if (com.archivo && com.archivo.trim() !== '') {
        let nombreArchivo = com.archivo.trim();
        const isProduction = process.env.NODE_ENV === 'production';
        
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        
        if (esSistemaNuevo) {
          if (nombreArchivo.startsWith('/uploads/')) {
            archivoUrl = isProduction
              ? `https://sistema.vanguardschools.edu.pe${nombreArchivo}`
              : `http://localhost:5000${nombreArchivo}`;
          } else {
            archivoUrl = isProduction
              ? `https://sistema.vanguardschools.edu.pe/${nombreArchivo}`
              : `http://localhost:5000/${nombreArchivo}`;
          }
          // Para sistema nuevo, verificar en backend/uploads/comunicados/
          const uploadsPath = path.join(__dirname, '../../uploads/comunicados', nombreArchivo.replace(/^\/?uploads\/comunicados\//, ''));
          archivoExiste = fs.existsSync(uploadsPath);
        } else {
          const dominioBase = 'https://sistema.vanguardschools.edu.pe';
          
          // Extraer solo el nombre del archivo para verificar existencia
          let nombreArchivoLimpio = nombreArchivo;
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
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
          
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
            archivoUrl = nombreArchivo
              .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, dominioBase)
              .replace(/vanguardschools\.comstatic/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/static/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/Static/gi, `${dominioBase}/Static`)
              .replace(/([^:]\/)\/+/g, '$1');
          } else if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          } else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          } else {
            nombreArchivo = nombreArchivo.replace(/^\/+/, '');
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
          
          // Verificar si el archivo existe físicamente (solo para logging, no para bloquear)
          const archivoPath = path.join(staticArchivosPath, nombreArchivoLimpio);
          archivoExiste = fs.existsSync(archivoPath);
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
 * GET /api/alumno/mensajes/recibidos
 * Obtener mensajes recibidos con información completa del remitente
 */
router.get('/mensajes/recibidos', async (req, res) => {
  try {
    console.log('📥 [ALUMNO MENSAJES] GET /mensajes/recibidos - Iniciando');
    const { usuario_id, colegio_id } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*, 
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as remitente_nombre_completo,
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

    // Contar total
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
 * GET /api/alumno/mensajes/enviados
 * Obtener mensajes enviados con información completa del destinatario
 */
router.get('/mensajes/enviados', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*,
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as destinatario_nombre_completo,
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

    // Contar total
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
 * GET /api/alumno/mensajes/buscar-destinatarios
 * Buscar destinatarios (solo docentes y personal administrativo, NO otros alumnos)
 */
router.get('/mensajes/buscar-destinatarios', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { q = '' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ resultados: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const resultados = [];

    // Buscar personal (docentes, directores, administradores)
    const personal = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo,
              u.tipo as tipo,
              p.cargo as info_adicional
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
         AND (p.nombres LIKE ? OR p.apellidos LIKE ? OR u.usuario LIKE ?)
       ORDER BY p.nombres, p.apellidos
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm]
    );

    personal.forEach(p => {
      resultados.push({
        usuario_id: p.usuario_id,
        nombre_completo: p.nombre_completo,
        tipo: p.tipo,
        info_adicional: p.info_adicional || p.tipo
      });
    });

    res.json({ resultados: resultados.slice(0, 20) });
  } catch (error) {
    console.error('Error buscando destinatarios:', error);
    res.status(500).json({ error: 'Error al buscar destinatarios' });
  }
});

/**
 * POST /api/alumno/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido
 */
router.post('/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    const imagenUrl = urlArchivoMensajeStatic(req.file.filename);

    res.json({ url: imagenUrl });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
});

/**
 * POST /api/alumno/mensajes/enviar
 * Enviar mensaje (solo a docentes y personal administrativo, NO a otros alumnos)
 */
router.post('/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { destinatarios, asunto, mensaje } = req.body;

    const phpBaseMensajes = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';

    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;

    if (!destinatariosArray || destinatariosArray.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    // Procesar en segundo plano
    setImmediate(async () => {
      try {
        const fechaHora = fechaHoraMySQLLima();
        let mensajesInsertados = 0;
        const mensajesIds = [];
        const mensajeCuerpo = normalizarUrlsImagenesEnHtml(mensaje, phpBaseMensajes);
        let remitenteNombre = 'Alumno';
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
          console.warn('[MENSAJES ALUMNO] No se pudo obtener nombre remitente:', err.message);
        }

        const campanaAlumnoMensajes = [];
        for (const destinatarioId of destinatariosArray) {
          try {
            // Mensaje para el remitente (tipo ENVIADO)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensajeCuerpo, fechaHora]
            );

            // Mensaje para el destinatario (tipo RECIBIDO)
            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensajeCuerpo, fechaHora]
            );

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
            campanaAlumnoMensajes.push({
              destinatarioId: parseInt(destinatarioId, 10),
              mensajeRecibidoId: resultRecibido.insertId
            });
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
          }
        }

        // Guardar archivos adjuntos si existen
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

        let mapTipoAlumnoMensajes = new Map();
        try {
          if (campanaAlumnoMensajes.length > 0) {
            const idsC = [...new Set(campanaAlumnoMensajes.map((c) => c.destinatarioId))];
            const tiposC = await query(
              `SELECT id, tipo FROM usuarios WHERE id IN (${idsC.map(() => '?').join(',')}) AND colegio_id = ?`,
              [...idsC, colegio_id]
            );
            mapTipoAlumnoMensajes = new Map((tiposC || []).map((r) => [parseInt(r.id, 10), r.tipo]));
            const contenidoBell = `Remitente: ${remitenteNombre}. Asunto: "${(asunto || 'Sin asunto').substring(0, 150)}".`;
            for (const row of campanaAlumnoMensajes) {
              const td = mapTipoAlumnoMensajes.get(row.destinatarioId) || 'DOCENTE';
              let urlDest = '/docente/mensajes';
              if (td === 'APODERADO') urlDest = '/apoderado/mensajes';
              else if (td === 'ALUMNO') urlDest = '/alumno/mensajes';
              try {
                if (
                  await notificacionMensajeDuplicadaReciente(query, {
                    usuario_id,
                    destinatario_id: row.destinatarioId,
                    accion_tipo: 'mensaje_nuevo',
                    contenido: contenidoBell
                  })
                ) {
                  continue;
                }
                await insertNotificacionUsuario(execute, {
                  usuario_id,
                  destinatario_id: row.destinatarioId,
                  asunto: 'Nuevo mensaje (alumno)',
                  contenido: contenidoBell,
                  estado: 'ENVIADO',
                  accion_tipo: 'mensaje_nuevo',
                  accion_payload: { mensaje_id: row.mensajeRecibidoId },
                  url_destino: urlDest
                });
              } catch (bellErr) {
                console.warn('[MENSAJES ALUMNO] Campanita:', bellErr.message);
              }
            }
          }
        } catch (bellErr2) {
          console.warn('[MENSAJES ALUMNO] Notificaciones in-app:', bellErr2.message);
        }

        // Enviar push notifications a los destinatarios
        try {
          if (destinatariosArray.length > 0) {
            const subsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
               WHERE usuario_id IN (${destinatariosArray.map(() => '?').join(',')})
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...destinatariosArray.map(id => parseInt(id)), colegio_id]
            );
            if ((subsData || []).length > 0) {
              const asuntoCorto = (asunto || 'Sin asunto').substring(0, 60);
              const pushItemsAl = (subsData || []).map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const td = mapTipoAlumnoMensajes.get(uid) || 'DOCENTE';
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
                    body: `${remitenteNombre}: ${asuntoCorto}`,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `mensaje-${Date.now()}`,
                    data: { url: urlPush, tipo: 'mensaje' }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsAl).catch((err) =>
                console.error('❌ [MENSAJES] Error push:', err)
              );
            }
          }
        } catch (pushErr) {
          console.error('❌ [MENSAJES] Error enviando push:', pushErr);
        }

        console.log('✅ Mensaje enviado exitosamente');
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
 * PUT /api/alumno/mensajes/marcar-leidos
 * Marcar varios mensajes recibidos como leídos
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
    console.error('Error marcando mensajes como leídos (lote, alumno):', error);
    res.status(500).json({ error: 'Error al marcar mensajes como leídos' });
  }
});

/**
 * PUT /api/alumno/mensajes/:mensajeId/marcar-leido
 * Marcar un mensaje como leído
 */
router.put('/mensajes/:mensajeId/marcar-leido', async (req, res) => {
  try {
    const { mensajeId } = req.params;
    const { usuario_id } = req.user;

    const mensaje = await query(
      `SELECT id, estado FROM mensajes 
       WHERE id = ? AND destinatario_id = ? AND tipo = 'RECIBIDO' AND borrado = 'NO'`,
      [mensajeId, usuario_id]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (mensaje[0].estado === 'LEIDO') {
      return res.json({ success: true, message: 'Mensaje ya estaba marcado como leído' });
    }

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
 * GET /api/alumno/mensajes/remitentes-opciones
 * Lista de remitentes distintos (bandeja recibidos) para filtro
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
    console.error('Error obteniendo remitentes-opciones:', error);
    res.status(500).json({ error: 'Error al obtener opciones de remitentes' });
  }
});

/**
 * GET /api/alumno/mensajes/destinatarios-opciones
 * Lista de destinatarios distintos (bandeja enviados) para filtro
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
    console.error('Error obteniendo destinatarios-opciones:', error);
    res.status(500).json({ error: 'Error al obtener opciones de destinatarios' });
  }
});

/**
 * GET /api/alumno/mensajes/anios-disponibles
 * Obtener lista de años disponibles en mensajes
 */
router.get('/mensajes/anios-disponibles', async (req, res) => {
  try {
    console.log('📥 [ALUMNO MENSAJES] GET /mensajes/anios-disponibles - Iniciando');
    const { usuario_id } = req.user;

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
 * DELETE /api/alumno/mensajes
 * Eliminar múltiples mensajes
 */
router.delete('/mensajes', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const { mensajesIds } = req.body;

    if (!mensajesIds || !Array.isArray(mensajesIds) || mensajesIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un ID de mensaje' });
    }

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

    const mensajesAEliminar = mensajes.filter(m => 
      (m.tipo === 'ENVIADO' && m.remitente_id === usuario_id) ||
      (m.tipo === 'RECIBIDO' && m.destinatario_id === usuario_id)
    );

    if (mensajesAEliminar.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar estos mensajes' });
    }

    const idsAEliminar = mensajesAEliminar.map(m => m.id);
    const placeholdersEliminar = idsAEliminar.map(() => '?').join(',');

    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

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
 * GET /api/alumno/aula-virtual/archivos
 * Obtener archivos/temas interactivos de una asignatura (solo lectura para alumnos)
 */
router.get('/aula-virtual/archivos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el alumno tiene acceso a esta asignatura (está matriculado en el grupo)
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumno_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener archivos de la asignatura filtrados por ciclo
    const archivos = await query(
      `SELECT * FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY orden ASC, id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs completas para los archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      let enlaceUrl = null;

      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo
            .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl)
            .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else if (archivo.archivo.startsWith('/uploads/')) {
          archivoUrl = isDevelopment
            ? `http://localhost:5000${archivo.archivo}`
            : `${phpSystemUrl}${archivo.archivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }

      if (archivo.enlace && archivo.enlace !== '') {
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
 * GET /api/alumno/aula-virtual/tareas
 * Obtener tareas de una asignatura (solo lectura para alumnos)
 */
router.get('/aula-virtual/tareas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el alumno tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumno_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener tareas de la asignatura filtradas por ciclo
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
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

/**
 * GET /api/alumno/aula-virtual/examenes
 * Obtener exámenes de una asignatura (solo lectura para alumnos)
 */
router.get('/aula-virtual/examenes', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el alumno tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumno_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener exámenes de la asignatura filtrados por ciclo
    // IMPORTANTE: Mostrar TODOS los exámenes, independientemente de si tienen preguntas o no
    const examenes = await query(
      `SELECT ae.*,
              (SELECT COUNT(*) FROM asignaturas_examenes_preguntas WHERE examen_id = ae.id) as total_preguntas
       FROM asignaturas_examenes ae
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltro]
    );
    
    console.log(`📝 Exámenes encontrados para asignatura ${asignatura_id}, ciclo ${cicloFiltro}:`, examenes.length);

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    // Para cada examen, verificar si el alumno ya tiene nota
    const examenesConInfo = await Promise.all(examenes.map(async (examen) => {
      let tiene_nota = false;
      let intentos_usados = 0;
      
      if (matricula.length > 0) {
        // Verificar si tiene nota en la tabla de pruebas (la tabla asignaturas_examenes_notas no existe)
        // La tabla asignaturas_examenes_pruebas usa matricula_id y puntaje
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
        // La tabla usa matricula_id (no alumno_id)
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
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

/**
 * GET /api/alumno/examenes/:examenId
 * Obtener detalles de un examen
 */
router.get('/examenes/:examenId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;

    // Verificar acceso al examen
    const examen = await query(
      `SELECT ae.*, a.id as asignatura_id, g.id as grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumno_id, colegio_id, anio_activo]
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
    console.error('Error obteniendo examen:', error);
    res.status(500).json({ error: 'Error al obtener examen' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/iniciar
 * Iniciar un examen (crear prueba)
 */
router.post('/examenes/:examenId/iniciar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    // Verificar acceso y que el examen esté activo
    const examen = await query(
      `SELECT ae.*, a.id as asignatura_id, g.id as grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumno_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin acceso' });
    }

    if (examen[0].estado !== 'ACTIVO') {
      return res.status(400).json({ error: 'El examen no está activo' });
    }

    if (esExamenTipoPdf(examen[0].tipo)) {
      return res.status(400).json({
        error:
          'Este examen es material en PDF. Ábrelo desde el aula virtual; no uses “Iniciar prueba” en línea.'
      });
    }

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Verificar intentos (la tabla usa matricula_id, no alumno_id)
    const intentosUsados = await query(
      `SELECT COUNT(*) as total FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'FINALIZADA'`,
      [examenId, matricula[0].matricula_id]
    );

    if (examen[0].intentos > 0 && (intentosUsados[0]?.total || 0) >= examen[0].intentos) {
      return res.status(400).json({ error: 'Has agotado todos los intentos disponibles' });
    }

    // Verificar si ya tiene una prueba en progreso (la tabla usa matricula_id, fecha_hora y estado 'ACTIVO')
    const pruebaEnProgreso = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (pruebaEnProgreso.length > 0) {
      const row = pruebaEnProgreso[0];
      if (tieneCamposSesionExamen(row)) {
        const tokenGuardado = String(row.exam_session_token || '').trim();
        const deviceGuardado = String(row.exam_session_device_id || '').trim();
        const idleSegundos = segundosIdleSesionExamen(row);
        const otroDispositivoActivo =
          !!tokenGuardado &&
          !!deviceGuardado &&
          !!deviceIdHeader &&
          deviceGuardado !== deviceIdHeader &&
          idleSegundos <= EXAM_SESSION_STALE_SECONDS;
        if (otroDispositivoActivo) {
          return res.status(409).json(construirErrorSesionExamen());
        }
      }
      // Para que el front no re-aleatorice ni sobrescriba guardar-preguntas al recargar
      const pregunta_ids = parsePreguntaIdsVisiblesDesdePrueba(row);
      let respuestasJson = {};
      try {
        respuestasJson = await cargarRespuestasMergedDePrueba(query, row);
      } catch (e) {
        if (row.respuestas && String(row.respuestas).trim() !== '') {
          try {
            respuestasJson = JSON.parse(row.respuestas);
          } catch (e2) {
            console.warn('[iniciar examen] respuestas JSON inválidas, usando vacío:', row.id);
          }
        }
      }
      const sessionToken = String(row.exam_session_token || '').trim() || generarExamSessionToken();
      await actualizarSesionExamenPrueba(
        row.id,
        sessionToken,
        deviceIdHeader || String(row.exam_session_device_id || '').trim() || null
      );
      return res.json({
        prueba_id: row.id,
        fecha_inicio: row.fecha_hora,
        fecha_expiracion: row.expiracion,
        respuestas: respuestasJson,
        pregunta_ids,
        session_token: sessionToken
      });
    }

    // Crear nueva prueba
    const fechaInicio = new Date();
    const fechaExpiracion = examen[0].tiempo > 0 
      ? new Date(fechaInicio.getTime() + (examen[0].tiempo * 60 * 1000))
      : null;

    const resultado = await execute(
      `INSERT INTO asignaturas_examenes_pruebas 
       (examen_id, matricula_id, fecha_hora, expiracion, estado, respuestas, preguntas)
       VALUES (?, ?, ?, ?, 'ACTIVO', '{}', '')`,
      [examenId, matricula[0].matricula_id, fechaInicio, fechaExpiracion]
    );
    const sessionToken = generarExamSessionToken();
    await actualizarSesionExamenPrueba(resultado.insertId, sessionToken, deviceIdHeader || null);

    res.json({
      prueba_id: resultado.insertId,
      fecha_inicio: fechaInicio,
      fecha_expiracion: fechaExpiracion,
      respuestas: {},
      pregunta_ids: null,
      session_token: sessionToken
    });
  } catch (error) {
    console.error('Error iniciando examen:', error);
    res.status(500).json({ error: 'Error al iniciar examen' });
  }
});

/**
 * GET /api/alumno/examenes/:examenId/preguntas
 * Obtener preguntas del examen (con alternativas)
 */
router.get('/examenes/:examenId/preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;

    // Verificar acceso
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumno_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin acceso' });
    }

    // Obtener preguntas
    const preguntas = await query(
      `SELECT * FROM asignaturas_examenes_preguntas
       WHERE examen_id = ?
       ORDER BY orden ASC`,
      [examenId]
    );

    // Obtener alternativas para cada pregunta
    const preguntasConAlternativas = await Promise.all(preguntas.map(async (pregunta) => {
      const alternativas = await query(
        `SELECT * FROM asignaturas_examenes_preguntas_alternativas
         WHERE pregunta_id = ?
         ORDER BY id ASC`,
        [pregunta.id]
      );

      return {
        ...pregunta,
        alternativas: alternativas || []
      };
    }));

    let bloque = null;
    try {
      const phpBase =
        String(process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe').replace(/\/$/, '');
      const bloqueRows = await query(
        `SELECT contenido, imagen FROM asignaturas_examenes_bloques WHERE examen_id = ? LIMIT 1`,
        [examenId]
      );
      if (bloqueRows && bloqueRows.length > 0) {
        const b = bloqueRows[0];
        const contenidoHtml = normalizarUrlsImagenesEnHtml(b.contenido || '', phpBase);
        const imagen_url = buildArchivoPdfUrl(b.imagen);
        const plain = (contenidoHtml || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        const tieneImagenEnHtml = /<img\s/i.test(contenidoHtml || '');
        if (plain || imagen_url || tieneImagenEnHtml) {
          bloque = { contenido: contenidoHtml || '', imagen_url };
        }
      }
    } catch (bloqueErr) {
      if (bloqueErr && bloqueErr.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[alumno preguntas] bloque examen:', bloqueErr.message);
      }
    }

    res.json({ preguntas: preguntasConAlternativas, bloque });
  } catch (error) {
    console.error('Error obteniendo preguntas:', error);
    res.status(500).json({ error: 'Error al obtener preguntas' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/guardar-preguntas
 * Guardar los IDs de las preguntas que verá el alumno (para compatibilidad con sistema antiguo)
 */
router.post('/examenes/:examenId/guardar-preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;
    const { pregunta_ids } = req.body;

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Obtener prueba en progreso
    const prueba = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (prueba.length === 0) {
      return res.status(404).json({ error: 'No hay una prueba en progreso' });
    }

    // Guardar preguntas en formato PHP serialize (base64) para compatibilidad con sistema antiguo
    const phpSerialize = require('php-serialize');
    const preguntasSerializadas = phpSerialize.serialize(pregunta_ids);
    const preguntasBase64 = Buffer.from(preguntasSerializadas).toString('base64');

    // Actualizar campo preguntas
    await execute(
      `UPDATE asignaturas_examenes_pruebas
       SET preguntas = ?
       WHERE id = ?`,
      [preguntasBase64, prueba[0].id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando preguntas:', error);
    res.status(500).json({ error: 'Error al guardar preguntas' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/respuestas
 * Guardar respuestas del estudiante
 */
router.post('/examenes/:examenId/respuestas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;
    const { respuestas } = req.body;
    const tokenSesionHeader = String(req.headers['x-exam-session-token'] || '').trim();
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Obtener prueba en progreso (la tabla usa matricula_id y estado 'ACTIVO')
    const prueba = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (prueba.length === 0) {
      // Idempotencia: si el intento ya fue finalizado (por tiempo/seguridad/manual),
      // responder éxito para evitar falso error en frontend por doble submit.
      const ultimaPrueba = await query(
        `SELECT id, estado, puntaje, correctas, incorrectas
         FROM asignaturas_examenes_pruebas
         WHERE examen_id = ? AND matricula_id = ?
         ORDER BY fecha_hora DESC
         LIMIT 1`,
        [examenId, matricula[0].matricula_id]
      );
      if (ultimaPrueba.length > 0 && String(ultimaPrueba[0].estado) === 'FINALIZADA') {
        return res.json({
          success: true,
          already_finalized: true,
          puntaje: Number(ultimaPrueba[0].puntaje || 0),
          correctas: Number(ultimaPrueba[0].correctas || 0),
          incorrectas: Number(ultimaPrueba[0].incorrectas || 0)
        });
      }
      return res.status(404).json({ error: 'No hay una prueba en progreso' });
    }

    if (tieneCamposSesionExamen(prueba[0])) {
      const tokenGuardado = String(prueba[0].exam_session_token || '').trim();
      if (tokenGuardado && tokenSesionHeader && tokenGuardado !== tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      if (tokenGuardado && !tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      await actualizarSesionExamenPrueba(
        prueba[0].id,
        tokenGuardado || tokenSesionHeader || generarExamSessionToken(),
        deviceIdHeader || String(prueba[0].exam_session_device_id || '').trim() || null
      );
    }

    // Actualizar respuestas (merge + líneas por pregunta; mantiene JSON legacy)
    const examenRows = await query(`SELECT * FROM asignaturas_examenes WHERE id = ?`, [examenId]);
    const preguntasAll = await fetchPreguntasConAlternativas(query, examenId, [], 'SI_NO');
    const preguntasPorId = {};
    for (const p of preguntasAll) {
      preguntasPorId[p.id] = p;
    }
    const incoming =
      respuestas && typeof respuestas === 'object' && !Array.isArray(respuestas) ? respuestas : {};
    await persistirRespuestasBulk({
      query,
      execute,
      pruebaId: prueba[0].id,
      respuestasIncoming: incoming,
      examenRow: examenRows[0] || null,
      preguntasPorId
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando respuestas:', error);
    res.status(500).json({ error: 'Error al guardar respuestas' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/respuesta-linea
 * Guarda UNA respuesta (pregunta) vinculada al intento activo. Retrocompatible con JSON legacy.
 */
router.post('/examenes/:examenId/respuesta-linea', async (req, res) => {
  try {
    const { colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;
    const { pregunta_id, respuesta } = req.body || {};
    const tokenSesionHeader = String(req.headers['x-exam-session-token'] || '').trim();
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    const preguntaId = parseInt(pregunta_id, 10);
    if (Number.isNaN(preguntaId) || preguntaId <= 0) {
      return res.status(400).json({ error: 'pregunta_id inválido' });
    }

    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    const prueba = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (prueba.length === 0) {
      const ultimaPrueba = await query(
        `SELECT id, estado, puntaje, correctas, incorrectas
         FROM asignaturas_examenes_pruebas
         WHERE examen_id = ? AND matricula_id = ?
         ORDER BY fecha_hora DESC
         LIMIT 1`,
        [examenId, matricula[0].matricula_id]
      );
      if (ultimaPrueba.length > 0 && String(ultimaPrueba[0].estado) === 'FINALIZADA') {
        return res.json({
          success: true,
          already_finalized: true,
          puntaje: Number(ultimaPrueba[0].puntaje || 0)
        });
      }
      return res.status(404).json({ error: 'No hay una prueba en progreso' });
    }

    if (tieneCamposSesionExamen(prueba[0])) {
      const tokenGuardado = String(prueba[0].exam_session_token || '').trim();
      if (tokenGuardado && tokenSesionHeader && tokenGuardado !== tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      if (tokenGuardado && !tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      await actualizarSesionExamenPrueba(
        prueba[0].id,
        tokenGuardado || tokenSesionHeader || generarExamSessionToken(),
        deviceIdHeader || String(prueba[0].exam_session_device_id || '').trim() || null
      );
    }

    const examenRows = await query(`SELECT * FROM asignaturas_examenes WHERE id = ?`, [examenId]);
    const preguntasAll = await fetchPreguntasConAlternativas(query, examenId, [preguntaId], 'SI_NO');
    const preguntaRow = preguntasAll.find((p) => parseInt(p.id, 10) === preguntaId);
    if (!preguntaRow) {
      return res.status(404).json({ error: 'Pregunta no encontrada en este examen' });
    }

    const { evaluacion } = await persistirRespuestaPregunta({
      query,
      execute,
      pruebaId: prueba[0].id,
      preguntaId,
      respuesta,
      examenRow: examenRows[0] || null,
      preguntaRow
    });

    res.json({
      success: true,
      prueba_id: prueba[0].id,
      pregunta_id: preguntaId,
      es_correcta: evaluacion ? evaluacion.esCorrecta : null,
      puntos_parciales: evaluacion ? evaluacion.puntosPregunta : null
    });
  } catch (error) {
    console.error('Error guardando respuesta-linea:', error);
    res.status(500).json({ error: 'Error al guardar respuesta' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/finalizar
 * Finalizar examen
 */
router.post('/examenes/:examenId/finalizar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;
    const tokenSesionHeader = String(req.headers['x-exam-session-token'] || '').trim();
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Obtener prueba en progreso (la tabla usa matricula_id y estado 'ACTIVO')
    const prueba = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (prueba.length === 0) {
      // Idempotencia: si ya se finalizó el intento, devolver éxito para que el front no muestre error.
      const ultimaPrueba = await query(
        `SELECT id, estado, puntaje, correctas, incorrectas
         FROM asignaturas_examenes_pruebas
         WHERE examen_id = ? AND matricula_id = ?
         ORDER BY fecha_hora DESC
         LIMIT 1`,
        [examenId, matricula[0].matricula_id]
      );
      if (ultimaPrueba.length > 0 && String(ultimaPrueba[0].estado) === 'FINALIZADA') {
        return res.json({
          success: true,
          already_finalized: true,
          puntaje: Number(ultimaPrueba[0].puntaje || 0),
          correctas: Number(ultimaPrueba[0].correctas || 0),
          incorrectas: Number(ultimaPrueba[0].incorrectas || 0)
        });
      }
      return res.status(404).json({ error: 'No hay una prueba en progreso' });
    }

    if (tieneCamposSesionExamen(prueba[0])) {
      const tokenGuardado = String(prueba[0].exam_session_token || '').trim();
      if (tokenGuardado && tokenSesionHeader && tokenGuardado !== tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      if (tokenGuardado && !tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      await actualizarSesionExamenPrueba(
        prueba[0].id,
        tokenGuardado || tokenSesionHeader || generarExamSessionToken(),
        deviceIdHeader || String(prueba[0].exam_session_device_id || '').trim() || null
      );
    }

    const calificacion = await finalizarPruebaConCalificacion({
      query,
      execute,
      pruebaRow: prueba[0],
      examenId
    });

    await aplicarEstadoFinalizadoPrueba(execute, prueba[0].id, calificacion);

    const examen = [calificacion.examenRow];
    const preguntas = calificacion.preguntas;
    const respuestas = calificacion.respuestas;
    const puntajeFinal = calificacion.puntajeFinal;
    const correctas = calificacion.correctas;
    const incorrectas = calificacion.incorrectas;
    const detalles = calificacion.detalles;
    const puntosObtenidos = calificacion.puntosObtenidos;
    const puntosTotal = calificacion.puntosTotal;

    // Enviar notificaciones a apoderados de forma asíncrona
    // Solo si el examen permite ver la nota inmediatamente
    setImmediate(async () => {
      try {
        // Obtener información del examen para verificar si se puede ver la nota
        const examenInfo = await query(
          `SELECT ae.*, a.grupo_id, c.nombre as curso_nombre,
                  CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
                  CONCAT(a2.nombres, ' ', a2.apellido_paterno, ' ', COALESCE(a2.apellido_materno, '')) as alumno_nombre,
                  g.grado, g.seccion, COALESCE(nl.nombre, '') AS nivel_nombre
           FROM asignaturas_examenes ae
           INNER JOIN asignaturas a ON a.id = ae.asignatura_id
           INNER JOIN cursos c ON c.id = a.curso_id
           INNER JOIN personal p ON p.id = a.personal_id
           INNER JOIN matriculas m ON m.id = ?
           INNER JOIN alumnos a2 ON a2.id = m.alumno_id
           INNER JOIN grupos g ON g.id = m.grupo_id
           LEFT JOIN niveles nl ON nl.id = g.nivel_id
           WHERE ae.id = ?`,
          [matricula[0].matricula_id, examenId]
        );

        if (examenInfo.length > 0) {
          const examenData = examenInfo[0];
          const titulo = examenData.titulo;
          const curso_nombre = examenData.curso_nombre;
          const docente_nombre = examenData.docente_nombre;
          const alumno_nombre = examenData.alumno_nombre;
          const mostrar_nota = examenData.mostrar_nota; // Puede no existir en la tabla
          const etiquetaGradoApod = etiquetaGradoGrupo({
            grado: examenData.grado,
            seccion: examenData.seccion,
            nivel_nombre: examenData.nivel_nombre
          });
          const sufijoGradoApod = etiquetaGradoApod ? ` — ${etiquetaGradoApod}` : '';

          const filasResumen = (preguntas || []).map((pregunta, idx) => {
            const respuestaAlumno = respuestas[pregunta.id.toString()] ?? respuestas[pregunta.id] ?? null;
            const preguntaTexto = htmlToPlain(pregunta.descripcion || `Pregunta ${idx + 1}`);
            const respuestaTexto = resolverTextoRespuesta(pregunta, respuestaAlumno);
            return {
              nro: idx + 1,
              pregunta: preguntaTexto || `Pregunta ${idx + 1}`,
              respuesta: respuestaTexto || 'Sin responder',
              sinResponder: !respuestaTexto || respuestaTexto === 'Sin responder'
            };
          });
          const permiteNota =
            mostrar_nota === undefined || mostrar_nota === null || mostrar_nota === 'SI';
          const puedeMostrarNotaEnCampanitas = permiteNota;

          const textoComprobanteInterno = construirTextoPlanoComprobanteExamen({
            tituloExamen: titulo || 'Examen',
            alumnoNombre: alumno_nombre || 'Alumno',
            cursoNombre: curso_nombre || 'Curso',
            docenteNombre: docente_nombre || 'Docente',
            etiquetaGrado: etiquetaGradoApod ? `Grado / aula: ${etiquetaGradoApod}` : '',
            puntajeFinal,
            correctas,
            incorrectas,
            permiteMostrarNota: permiteNota,
            filasResumen
          });

          try {
            const { crearNotificacionesApoderados } = require('./docente.routes');
            await crearNotificacionesApoderados({
              alumno_id: parseInt(alumno_id),
              usuario_id: usuario_id,
              colegio_id: colegio_id,
              anio_activo: anio_activo,
              tituloNotificacion: 'Examen Finalizado',
              mensajeNotificacion: puedeMostrarNotaEnCampanitas
                ? `${alumno_nombre} finalizó el examen "${titulo}" con ${puntajeFinal} puntos (${correctas} correctas, ${incorrectas} incorrectas) - Curso: ${curso_nombre} - Docente: ${docente_nombre}${sufijoGradoApod}`
                : `[Comprobante] ${alumno_nombre} terminó "${titulo}". Revise Mensajes para el detalle (nota puede estar pendiente según el docente).`,
              tipoNotificacion: 'examen_finalizado',
              soloMensajesInternos: !puedeMostrarNotaEnCampanitas,
              dataExtra: {
                examen_id: parseInt(examenId),
                puntaje: puntajeFinal,
                puntos_total: puntosTotal,
                correctas: correctas,
                incorrectas: incorrectas
              },
              mensajeInterno: {
                asunto: `Comprobante de examen: ${titulo || 'Examen'} – ${alumno_nombre || 'Alumno'}`,
                texto: textoComprobanteInterno
              }
            });
          } catch (notifExErr) {
            console.error('[EXAMEN FINALIZADO] Error notificaciones/mensajes familiares:', notifExErr);
          }

          // Enviar comprobante por correo al alumno y apoderados con respuestas marcadas
          try {
            const alumnoEmailRows = await query(
              `SELECT
                 COALESCE(NULLIF(TRIM(al.email), ''), CASE WHEN u.usuario LIKE '%@%' THEN u.usuario ELSE NULL END) AS email
               FROM usuarios u
               INNER JOIN alumnos al ON al.id = u.alumno_id
               WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
               LIMIT 1`,
              [usuario_id, colegio_id]
            );
            const apoderadosEmailRows = await query(
              `SELECT DISTINCT ap.email AS email
               FROM apoderados ap
               INNER JOIN familias f ON f.apoderado_id = ap.id
               WHERE f.alumno_id = ? AND ap.colegio_id = ?
                 AND ap.email IS NOT NULL AND TRIM(ap.email) != ''`,
              [alumno_id, colegio_id]
            );

            const correosUnicos = new Map();
            const agregarCorreo = (email) => {
              const em = String(email || '').trim();
              if (!em || !em.includes('@')) return;
              const key = em.toLowerCase();
              if (!correosUnicos.has(key)) correosUnicos.set(key, em);
            };
            (alumnoEmailRows || []).forEach((r) => agregarCorreo(r.email));
            (apoderadosEmailRows || []).forEach((r) => agregarCorreo(r.email));

            if (correosUnicos.size > 0) {
              const permiteNotaMail = permiteNota;
              const puntajeLabel = permiteNotaMail ? String(puntajeFinal) : 'No disponible aún';
              const correctasLabel = permiteNotaMail ? String(correctas) : '-';
              const incorrectasLabel = permiteNotaMail ? String(incorrectas) : '-';
              const htmlCorreo = construirHtmlResumenExamenCorreo({
                colegioNombre: 'Vanguard Schools',
                alumnoNombre: alumno_nombre || 'Alumno',
                cursoNombre: curso_nombre || 'Curso',
                docenteNombre: docente_nombre || 'Docente',
                tituloExamen: titulo || 'Examen',
                etiquetaGrado: etiquetaGradoApod || '',
                puntajeFinal: puntajeLabel,
                correctas: correctasLabel,
                incorrectas: incorrectasLabel,
                filasResumen
              });
              const asuntoCorreo = `Comprobante de examen: ${titulo || 'Examen'} - ${alumno_nombre || 'Alumno'}`;
              const envios = [];
              for (const email of correosUnicos.values()) {
                envios.push(
                  enviarCorreoHtml(email, asuntoCorreo, htmlCorreo, 'Vanguard Schools', 'EXAMEN')
                );
              }
              await Promise.allSettled(envios);
            } else {
              console.log('📧 [EXAMEN FINALIZADO] Sin correos válidos para enviar comprobante (alumno/apoderados)');
            }
          } catch (emailError) {
            console.error('❌ [EXAMEN FINALIZADO] Error enviando comprobante por correo:', emailError?.message || emailError);
          }
        }
      } catch (error) {
        console.error(`❌ [EXAMEN FINALIZADO] Error en proceso de notificaciones:`, error);
      }
    });

    res.json({
      success: true,
      puntaje: puntajeFinal,
      puntos_obtenidos: puntosObtenidos,
      puntos_total: puntosTotal,
      correctas: correctas,
      incorrectas: incorrectas
    });
  } catch (error) {
    console.error('Error finalizando examen:', error);
    res.status(500).json({ error: 'Error al finalizar examen' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/sesion-ping
 * Mantiene exam_session_last_seen sin reenviar respuestas (aulas WiFi: menos carga que autosave largo).
 */
router.post('/examenes/:examenId/sesion-ping', async (req, res) => {
  try {
    const { colegio_id, anio_activo, alumno_id } = req.user || {};
    const { examenId } = req.params;
    const tokenSesionHeader = String(req.headers['x-exam-session-token'] || '').trim();
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    const prueba = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (prueba.length === 0) {
      return res.status(404).json({ error: 'No hay una prueba en progreso' });
    }

    if (tieneCamposSesionExamen(prueba[0])) {
      const tokenGuardado = String(prueba[0].exam_session_token || '').trim();
      if (tokenGuardado && tokenSesionHeader && tokenGuardado !== tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      if (tokenGuardado && !tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      await actualizarSesionExamenPrueba(
        prueba[0].id,
        tokenGuardado || tokenSesionHeader || generarExamSessionToken(),
        deviceIdHeader || String(prueba[0].exam_session_device_id || '').trim() || null
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[sesion-ping examen]', error);
    res.status(500).json({ error: 'Error al registrar actividad de sesión' });
  }
});

/**
 * POST /api/alumno/examenes/:examenId/violaciones
 * Registrar violación (salir de ventana)
 */
router.post('/examenes/:examenId/violaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user || {};
    const { examenId } = req.params;
    const { tipo, timestamp } = req.body;
    const tokenSesionHeader = String(req.headers['x-exam-session-token'] || '').trim();
    const deviceIdHeader = normalizarExamDeviceId(req.headers['x-exam-device-id']);

    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    const pruebasActivas = await query(
      `SELECT id, examen_id, matricula_id, preguntas
       FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ? AND estado = 'ACTIVO'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (pruebasActivas.length === 0) {
      return res.json({
        success: true,
        warning: 'No hay prueba activa para registrar la violación'
      });
    }

    const pruebaActiva = pruebasActivas[0];
    if (tieneCamposSesionExamen(pruebaActiva)) {
      const tokenGuardado = String(pruebaActiva.exam_session_token || '').trim();
      if (tokenGuardado && tokenSesionHeader && tokenGuardado !== tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      if (tokenGuardado && !tokenSesionHeader) {
        return res.status(409).json(construirErrorSesionExamen());
      }
      await actualizarSesionExamenPrueba(
        pruebaActiva.id,
        tokenGuardado || tokenSesionHeader || generarExamSessionToken(),
        deviceIdHeader || String(pruebaActiva.exam_session_device_id || '').trim() || null
      );
    }
    const tipoNormalizado = String(tipo || 'DESCONOCIDA').slice(0, 60);
    const esCierreInmediatoPorFoco = tipoNormalizado === 'OUT_OF_FOCUS_7S';
    const esEventoInternet = tipoNormalizado === 'INTERNET_LOSS';
    const cierreInmediato = esCierreInmediatoPorFoco;

    const [estadoActualViolaciones] = await query(
      `SELECT id, violaciones_count, ultima_violacion_tipo,
              TIMESTAMPDIFF(SECOND, ultima_violacion_fecha, NOW()) AS segundos_desde_ultima
       FROM asignaturas_examenes_pruebas
       WHERE id = ?
       LIMIT 1`,
      [pruebaActiva.id]
    );

    const segundosDesdeUltima = Number(estadoActualViolaciones?.segundos_desde_ultima);
    const tieneViolacionReciente = Number.isFinite(segundosDesdeUltima) && segundosDesdeUltima >= 0 && segundosDesdeUltima <= 2;
    if (tieneViolacionReciente) {
      return res.json({
        success: true,
        action: 'WARNING',
        violations: Number(estadoActualViolaciones?.violaciones_count || 0),
        message: 'Evento duplicado de seguridad ignorado'
      });
    }

    await execute(
      `UPDATE asignaturas_examenes_pruebas
       SET violaciones_count = COALESCE(violaciones_count, 0) + 1,
           ultima_violacion_tipo = ?,
           ultima_violacion_fecha = NOW()
       WHERE id = ?`,
      [tipoNormalizado, pruebaActiva.id]
    );

    const [pruebaActualizada] = await query(
      `SELECT id, violaciones_count
       FROM asignaturas_examenes_pruebas
       WHERE id = ?
       LIMIT 1`,
      [pruebaActiva.id]
    );

    const violacionesCount = Number(pruebaActualizada?.violaciones_count || 0);
    let accion = 'WARNING';
    let mensajeAccion = 'Advertencia registrada';

    const umbralParaCerrar =
      esEventoInternet ? EXAM_VIOLACION_INTERNET_CIERRE : EXAM_VIOLACION_GENERAL_CIERRE;
    if (cierreInmediato || violacionesCount >= umbralParaCerrar) {
      const motivoCierre = esEventoInternet
        ? 'CERRADO_POR_INTERNET'
        : esCierreInmediatoPorFoco
          ? 'FUERA_DE_FOCO'
          : 'SALIDA_DE_PANTALLA';

      const pruebaFullRows = await query(
        `SELECT * FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`,
        [pruebaActiva.id]
      );
      const pruebaFull = pruebaFullRows[0];
      if (pruebaFull) {
        const calificacion = await finalizarPruebaConCalificacion({
          query,
          execute,
          pruebaRow: pruebaFull,
          examenId
        });
        await aplicarEstadoFinalizadoPrueba(execute, pruebaActiva.id, calificacion, {
          finalizado_por_salida: 'SI',
          motivo_cierre: motivoCierre,
          fecha_cierre_forzado: true
        });
      }

      accion = 'AUTO_FINALIZED';
      mensajeAccion = esEventoInternet
        ? 'Examen finalizado por pérdida de internet'
        : esCierreInmediatoPorFoco
          ? 'Examen finalizado por estar fuera de foco'
          : 'Examen finalizado por violaciones de seguridad';
    }

    // Registrar en auditoría usando la estructura correcta
    try {
      const ahora = new Date();
      const fecha = fechaMySQLLima(ahora);
      const hora = horaMySQLLima(ahora);
      const fechaHoraStr = fechaHoraMySQLLima(ahora);

      await execute(
        `INSERT INTO auditoria_logs 
         (usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
          descripcion, datos_nuevos, resultado, fecha_hora, fecha, hora)
         VALUES (?, ?, 'ALUMNO', 'VIOLACION_EXAMEN', 'EXAMENES', 'examen', ?, ?, ?, 'EXITOSO', ?, ?, ?)`,
        [
          usuario_id || null, 
          colegio_id || null, 
          examenId, 
          `Violación de examen: ${tipoNormalizado} (conteo: ${violacionesCount})`, 
          JSON.stringify({ tipo: tipoNormalizado, timestamp, violacionesCount, accion }), 
          fechaHoraStr, 
          fecha, 
          hora
        ]
      );
    } catch (auditError) {
      // Si hay error en auditoría, solo loguear pero no fallar
      console.warn('No se pudo registrar violación en auditoría:', auditError.message);
    }

    res.json({
      success: true,
      action: accion,
      violations: violacionesCount,
      message: mensajeAccion,
      reason: accion === 'AUTO_FINALIZED'
        ? (esEventoInternet
            ? 'CERRADO_POR_INTERNET'
            : esCierreInmediatoPorFoco
              ? 'FUERA_DE_FOCO'
              : 'SALIDA_DE_PANTALLA')
        : null
    });
  } catch (error) {
    console.error('Error registrando violación:', error);
    // No devolver error 500, solo loguear
    res.json({ success: false, message: 'Violación registrada localmente' });
  }
});

/**
 * GET /api/alumno/aula-virtual/videos
 * Obtener videos de una asignatura (solo lectura para alumnos)
 */
router.get('/aula-virtual/videos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el alumno tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumno_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

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
 * GET /api/alumno/aula-virtual/enlaces
 * Obtener enlaces de ayuda de una asignatura (solo lectura para alumnos)
 */
router.get('/aula-virtual/enlaces', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el alumno tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [asignatura_id, alumno_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

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
 * GET /api/alumno/aula-virtual/tareas/:tareaId
 * Obtener detalles completos de una tarea (con archivos, nota, entregas del alumno)
 */
router.get('/aula-virtual/tareas/:tareaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { tareaId } = req.params;

    // Verificar que el alumno tiene acceso a esta tarea
    const tarea = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              a.id as asignatura_id,
              c.nombre as curso_nombre
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE t.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [tareaId, alumno_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaData = tarea[0];

    // Obtener archivos adjuntos de la tarea
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
        archivoUrl = isDevelopment
          ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
          : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
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
      [tareaId, alumno_id]
    );

    // Obtener matrícula del alumno para obtener la nota
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    let nota = null;
    if (matricula.length > 0) {
      const notaData = await query(
        `SELECT nota FROM asignaturas_tareas_notas
         WHERE tarea_id = ? AND matricula_id = ?`,
        [tareaId, matricula[0].matricula_id]
      );
      if (notaData.length > 0) {
        nota = notaData[0].nota || '-';
      }
    }

    res.json({
      tarea: {
        id: tareaData.id,
        titulo: tareaData.titulo,
        descripcion: tareaData.descripcion,
        fecha_hora: tareaData.fecha_hora,
        fecha_entrega: tareaData.fecha_entrega,
        docente_nombre: tareaData.docente_nombre,
        curso_nombre: tareaData.curso_nombre,
        enlace: tareaData.enlace || null,
        archivos: archivosConUrls,
        entregas: entregas,
        nota: nota || '-'
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalles de tarea:', error);
    res.status(500).json({ error: 'Error al obtener detalles de la tarea' });
  }
});

/**
 * GET /api/alumno/examenes/:examenId/resultado
 * Obtener el resultado del examen del alumno
 */
router.get('/examenes/:examenId/resultado', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Verificar que el examen existe y el alumno tiene acceso
    const examen = await query(
      `SELECT ae.*, a.grupo_id
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE ae.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [examenId, alumno_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin acceso' });
    }

    // Obtener resultado del examen del alumno
    const resultado = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE examen_id = ? AND matricula_id = ?
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [examenId, matricula[0].matricula_id]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ error: 'No se encontró resultado para este examen' });
    }

    res.json({
      resultado: resultado[0],
      examen: examen[0]
    });
  } catch (error) {
    console.error('Error obteniendo resultado del examen:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resultado del examen' });
  }
});

/**
 * GET /api/alumno/examenes/:examenId/resultado/detalles
 * Obtener detalles completos del resultado del examen (preguntas y respuestas)
 */
router.get('/examenes/:examenId/resultado/detalles', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { examenId } = req.params;

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [alumno_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'No se encontró la matrícula del alumno' });
    }

    // Obtener el resultado del examen
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
      [examenId, matricula[0].matricula_id]
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

    // Respuestas: líneas por pregunta + JSON legacy (retrocompatible)
    let respuestasAlumno = {};
    try {
      respuestasAlumno = await cargarRespuestasMergedDePrueba(query, resultadoInfo);
    } catch (mergeErr) {
      console.warn('[resultado/detalles] merge respuestas:', mergeErr.message);
      try {
        if (resultadoInfo.respuestas && resultadoInfo.respuestas.trim() !== '') {
          try {
            respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
          } catch (jsonError) {
            const phpSerialize = require('php-serialize');
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          }
        }
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach((key) => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      } catch (parseError) {
        console.error('Error parseando respuestas del alumno:', parseError);
        respuestasAlumno = {};
      }
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

/**
 * POST /api/alumno/aula-virtual/tareas/:tareaId/entregar
 * Enviar la URL de la entrega del alumno
 */
router.post('/aula-virtual/tareas/:tareaId/entregar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, alumno_id } = req.user;
    const { tareaId } = req.params;
    const { url } = req.body;

    if (!url || url.trim() === '') {
      return res.status(400).json({ error: 'La URL es requerida' });
    }

    // Verificar que el alumno tiene acceso a esta tarea
    const tarea = await query(
      `SELECT t.*, a.grupo_id
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE t.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
       LIMIT 1`,
      [tareaId, alumno_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    // Verificar que la fecha de entrega no haya pasado
    const fechaEntrega = new Date(tarea[0].fecha_entrega);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fechaEntrega.setHours(0, 0, 0, 0);

    if (hoy > fechaEntrega) {
      return res.status(400).json({ error: 'La fecha de entrega ya ha pasado' });
    }

    // Insertar la entrega
    const fechaHora = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO asignaturas_tareas_entregas 
       (alumno_id, tarea_id, archivo, url, nombre, fecha_hora, tipo, mensaje)
       VALUES (?, ?, '', ?, ?, ?, 'ALUMNO', '')`,
      [alumno_id, tareaId, url.trim(), url.trim(), fechaHora]
    );

    res.json({
      success: true,
      message: 'Entrega enviada correctamente'
    });
  } catch (error) {
    console.error('Error enviando entrega:', error);
    res.status(500).json({ error: 'Error al enviar la entrega' });
  }
});

/**
 * POST /api/alumno/aula-virtual/tareas/:tareaId/marcar-visto
 * Marcar una tarea como vista por el alumno
 */
router.post('/aula-virtual/tareas/:tareaId/marcar-visto', async (req, res) => {
  try {
    const { tareaId } = req.params;
    const { alumno_id } = req.user;

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
    let vistos = [];
    try {
      if (tareaActual.visto && tareaActual.visto !== '') {
        const deserialized = phpSerialize.unserialize(tareaActual.visto);
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    // Si el alumno_id no está en el array, agregarlo
    if (!vistos.includes(alumno_id)) {
      vistos.push(alumno_id);
      
      // Serializar el array actualizado
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
 * GET /api/alumno/cursos/:asignaturaId/horario
 * Obtener horario de un curso específico del alumno
 */
router.get('/cursos/:asignaturaId/horario', async (req, res) => {
  try {
    const { asignaturaId } = req.params;
    const { usuario_id, colegio_id, anio_activo } = req.user;

    if (!asignaturaId) {
      return res.status(400).json({ error: 'ID de asignatura es requerido' });
    }

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.id FROM alumnos a INNER JOIN usuarios u ON u.alumno_id = a.id WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoId = alumno[0].id;

    // Obtener matrícula actual del alumno para obtener su grupo
    const matricula = await query(
      `SELECT m.grupo_id FROM matriculas m 
       INNER JOIN grupos g ON g.id = m.grupo_id 
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0) 
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.json({ horario: [] });
    }

    const grupoId = matricula[0].grupo_id;

    // Verificar que el alumno tiene acceso a esta asignatura (debe estar en su grupo)
    const asignatura = await query(
      `SELECT a.*, c.id as curso_id, c.nombre as curso_nombre,
              g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignaturaId, grupoId, colegio_id, anio_activo]
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
         n.nombre        AS nivel_nombre,
         CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = a.grupo_id
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       LEFT JOIN personal p    ON p.id = COALESCE(a.personal_id, gh.personal_id)
       WHERE gh.anio = ?
         AND a.id = ?
         AND a.grupo_id = ?
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [anioActivoInt, asignaturaId, grupoId]
    );

    // Mapear a un formato estándar para el frontend
    const horario = (horarioCrudo || []).map((row) => {
      const titulo = row.curso_nombre || row.descripcion || '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        curso_nombre: row.curso_nombre,
        docente_nombre: row.docente_nombre || ''
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
 * GET /api/alumno/cursos/:asignaturaId/notas-detalladas
 * Obtener notas detalladas de un curso específico del alumno
 */
router.get('/cursos/:asignaturaId/notas-detalladas', async (req, res) => {
  try {
    const { asignaturaId } = req.params;
    const { usuario_id, colegio_id, anio_activo } = req.user;

    if (!asignaturaId || isNaN(parseInt(asignaturaId))) {
      return res.status(400).json({ error: 'ID de asignatura inválido' });
    }

    const asignaturaIdNum = parseInt(asignaturaId);

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.id FROM alumnos a INNER JOIN usuarios u ON u.alumno_id = a.id WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoId = alumno[0].id;

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ asignatura: null });
    }

    const matriculaId = matricula[0].matricula_id;
    const grupoId = matricula[0].grupo_id;

    // Verificar que el alumno tiene acceso a esta asignatura (debe estar en su grupo)
    const asignatura = await query(
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
       WHERE a.id = ? AND a.grupo_id = ? AND a.colegio_id = ?`,
      [asignaturaIdNum, grupoId, colegio_id]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const asignaturaData = asignatura[0];

    // Función auxiliar para deserializar notas detalladas
    const deserializarNotasDetalles = (dataString) => {
      if (!dataString || dataString === '') {
        return {};
      }

      try {
        try {
          const deserialized = phpSerialize.unserialize(dataString);
          return deserialized || {};
        } catch (e) {
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
    };

    // Obtener criterios de la asignatura
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ?
       ORDER BY orden ASC`,
      [asignaturaIdNum, colegio_id]
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
      [matriculaId, asignaturaIdNum]
    );

    // Obtener todas las notas de criterios
    const todasNotasCriterios = await query(
      `SELECT criterio_id, nota, ciclo
       FROM notas n
       WHERE n.matricula_id = ? AND n.asignatura_id = ? AND n.ciclo IN (1, 2, 3, 4)`,
      [matriculaId, asignaturaIdNum]
    );

    // Obtener todos los exámenes mensuales
    let todasExamenesMensuales = [];
    if (asignaturaData.examen_mensual === 'SI') {
      todasExamenesMensuales = await query(
        `SELECT nro, nota, ciclo FROM notas_examen_mensual
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
         ORDER BY ciclo ASC, nro ASC`,
        [matriculaId, asignaturaIdNum]
      );
    }

    // Obtener todos los promedios finales (tabla 'promedios', no 'notas_promedio_final')
    let todasPromediosFinales = [];
    try {
      todasPromediosFinales = await query(
        `SELECT ciclo, promedio as promedio_final FROM promedios
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
        [matriculaId, asignaturaIdNum]
      );
    } catch (errProm) {
      console.warn('No se pudo obtener promedios (tabla promedios):', errProm.message);
    }

    // Construir estructura de notas por ciclo
    const notasPorCiclo = { 1: {}, 2: {}, 3: {}, 4: {} };

    // Procesar notas detalladas
    todasNotasDetalles.forEach(notaDetalle => {
      const ciclo = notaDetalle.ciclo;
      if (ciclo >= 1 && ciclo <= 4) {
        const deserialized = deserializarNotasDetalles(notaDetalle.data);
        notasPorCiclo[ciclo] = { ...notasPorCiclo[ciclo], ...deserialized };
      }
    });

    // Procesar notas de criterios
    todasNotasCriterios.forEach(notaCriterio => {
      const ciclo = notaCriterio.ciclo;
      if (ciclo >= 1 && ciclo <= 4) {
        if (!notasPorCiclo[ciclo].criterios) {
          notasPorCiclo[ciclo].criterios = {};
        }
        notasPorCiclo[ciclo].criterios[notaCriterio.criterio_id] = notaCriterio.nota;
      }
    });

    // Procesar exámenes mensuales
    todasExamenesMensuales.forEach(examen => {
      const ciclo = examen.ciclo;
      if (ciclo >= 1 && ciclo <= 4) {
        if (!notasPorCiclo[ciclo].examen_mensual) {
          notasPorCiclo[ciclo].examen_mensual = {};
        }
        notasPorCiclo[ciclo].examen_mensual[examen.nro] = examen.nota;
      }
    });

    // Procesar promedios finales
    todasPromediosFinales.forEach(promedio => {
      const ciclo = promedio.ciclo;
      if (ciclo >= 1 && ciclo <= 4) {
        notasPorCiclo[ciclo].promedio_final = promedio.promedio_final;
      }
    });

    // Construir respuesta
    const criteriosConNotas = criteriosConIndicadores.map(criterio => {
      const notasCriterio = {};
      [1, 2, 3, 4].forEach(ciclo => {
        notasCriterio[ciclo] = notasPorCiclo[ciclo].criterios?.[criterio.id] || null;
      });

      return {
        ...criterio,
        notas: notasCriterio
      };
    });

    res.json({
      asignatura: {
        asignatura_id: asignaturaData.asignatura_id,
        curso_id: asignaturaData.curso_id,
        curso_nombre: asignaturaData.curso_nombre,
        nivel: {
          tipo_calificacion: asignaturaData.tipo_calificacion,
          tipo_calificacion_final: asignaturaData.tipo_calificacion_final,
          nota_aprobatoria: asignaturaData.nota_aprobatoria,
          nota_maxima: asignaturaData.nota_maxima,
          nota_minima: asignaturaData.nota_minima
        },
        peso_examen_mensual: asignaturaData.peso_examen_mensual,
        examen_mensual: asignaturaData.examen_mensual === 'SI',
        criterios: criteriosConNotas,
        notas: notasPorCiclo
      }
    });
  } catch (error) {
    console.error('Error obteniendo notas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener notas detalladas' });
  }
});

module.exports = router;
