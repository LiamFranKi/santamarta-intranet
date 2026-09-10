/**
 * Rutas de Cumpleaños del Mes
 * Widget flotante para mostrar cumpleaños filtrados por mes y perfil
 * Cada rol ve: Personal, Alumnos y Apoderados según su alcance
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const { query } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { fetchMatriculaVigenteMasReciente } = require('../utils/matriculaVigente');
const { obtenerPayloadBienvenidaModal } = require('../services/cumpleanosPushService');

router.use(authenticateToken);
router.use(
  requireUserType(
    'DOCENTE',
    'ALUMNO',
    'APODERADO',
    'ADMINISTRADOR',
    'PROMOTORIA',
    'SECRETARIA',
    'PSICOLOGA',
    'COORDINADOR'
  )
);

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * GET /api/cumpleanos/config
 * Obtener si debe mostrarse la ventana de cumpleaños (config Mostrar Ventana Cumpleaños)
 */
router.get('/config', async (req, res) => {
  try {
    const configs = await query(`SELECT valor FROM config WHERE clave = 'show_birthday_window' LIMIT 1`);
    const show_birthday_window = (configs[0]?.valor || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO';
    res.json({ show_birthday_window });
  } catch (error) {
    console.error('Error obteniendo config cumpleaños:', error);
    res.json({ show_birthday_window: 'NO' });
  }
});

/**
 * GET /api/cumpleanos/bienvenida
 * Modal al iniciar sesión: HTML ya sustituido (plantilla ventana) si aplica.
 */
router.get('/bienvenida', async (req, res) => {
  try {
    const payload = await obtenerPayloadBienvenidaModal(req.user);
    res.json(payload);
  } catch (error) {
    console.error('Error cumpleaños bienvenida:', error);
    res.json({ show_modal: false });
  }
});

/**
 * GET /api/cumpleanos/detalle/:id
 * id: p-{personal_id} | a-{alumno_id} | ap-{apoderado_id}
 * Datos para modal + envío de mensaje (usuario destino y tipo para el front).
 */
router.get('/detalle/:id', async (req, res) => {
  try {
    const rawId = String(req.params.id || '');
    let kind;
    let entityId;
    if (rawId.startsWith('ap-')) {
      kind = 'apoderado';
      entityId = parseInt(rawId.slice(3), 10);
    } else if (rawId.startsWith('a-')) {
      kind = 'alumno';
      entityId = parseInt(rawId.slice(2), 10);
    } else if (rawId.startsWith('p-')) {
      kind = 'personal';
      entityId = parseInt(rawId.slice(2), 10);
    } else {
      return res.status(400).json({ error: 'Identificador de cumpleaños no válido' });
    }
    if (!entityId || Number.isNaN(entityId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { colegio_id, anio_activo, tipo, personal_id, alumno_id, apoderado_id } = req.user;

    /** Misma lógica de alcance que GET / (grupos visibles). */
    let grupoIds = [];
    if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA' || tipo === 'SECRETARIA' || tipo === 'PSICOLOGA' || tipo === 'COORDINADOR') {
      grupoIds = null;
    } else if (tipo === 'DOCENTE' && personal_id) {
      const gruposDocente = await query(
        `SELECT DISTINCT g.id FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
        [personal_id, colegio_id, anio_activo]
      );
      const gruposTutor = await query(
        `SELECT DISTINCT g.id FROM grupos g
         WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
           AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, personal_id, colegio_id, anio_activo]
      );
      grupoIds = [...new Set([...(gruposDocente || []).map((g) => g.id), ...(gruposTutor || []).map((g) => g.id)])];
    } else if (tipo === 'ALUMNO' && alumno_id) {
      const grupos = await query(
        `SELECT m.grupo_id as id FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
        [alumno_id, colegio_id, anio_activo]
      );
      grupoIds = grupos.map((g) => g.id);
    } else if (tipo === 'APODERADO' && apoderado_id) {
      const grupos = await query(
        `SELECT DISTINCT g.id FROM familias f
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
        [apoderado_id, colegio_id, anio_activo]
      );
      grupoIds = grupos.map((g) => g.id);
    }

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';

    const buildFotoUrl = (fotoFileName) => {
      if (!fotoFileName || !String(fotoFileName).trim()) return null;
      const name = path.basename(fotoFileName);
      return isProduction
        ? `${phpSystemUrl}/Static/Image/Fotos/${name}`
        : `http://localhost:5000/Static/Image/Fotos/${name}`;
    };

    const edadQueCumple = (fechaNac) => {
      if (!fechaNac) return null;
      const d = new Date(fechaNac);
      if (Number.isNaN(d.getTime())) return null;
      return new Date().getFullYear() - d.getFullYear();
    };

    if (kind === 'personal') {
      const rows = await query(
        `SELECT p.id, CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) as nombre_completo,
                p.foto, p.fecha_nacimiento
         FROM personal p WHERE p.id = ? AND p.colegio_id = ?`,
        [entityId, colegio_id]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'No encontrado' });
      }
      const u = await query(
        `SELECT id, tipo FROM usuarios WHERE personal_id = ? AND colegio_id = ? AND estado = 'ACTIVO' LIMIT 1`,
        [entityId, colegio_id]
      );
      if (!u || u.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado para este personal' });
      }
      const p = rows[0];
      return res.json({
        id: rawId,
        nombre_completo: (p.nombre_completo || '').trim(),
        perfil: 'Personal',
        tipo_mensaje: 'PERSONAL',
        tipo_mensaje_ui: 'PERSONAL',
        usuario_tipo: u[0].tipo,
        grado_texto: '—',
        edad_que_cumple: edadQueCumple(p.fecha_nacimiento),
        foto_url: buildFotoUrl(p.foto),
        usuario_id: u[0].id
      });
    }

    if (kind === 'alumno') {
      const tiene = await query(
        `SELECT a.id FROM alumnos a WHERE a.id = ? AND a.colegio_id = ?`,
        [entityId, colegio_id]
      );
      if (!tiene || tiene.length === 0) {
        return res.status(404).json({ error: 'Alumno no encontrado' });
      }
      let inScope = false;
      if (grupoIds === null) {
        const m = await query(
          `SELECT 1 FROM matriculas m INNER JOIN grupos g ON g.id = m.grupo_id
           WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0) LIMIT 1`,
          [entityId, colegio_id, anio_activo]
        );
        inScope = m && m.length > 0;
      } else if (grupoIds.length === 0) {
        inScope = false;
      } else {
        const ph = grupoIds.map(() => '?').join(',');
        const m = await query(
          `SELECT 1 FROM matriculas m WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.grupo_id IN (${ph}) AND (m.estado = 0) LIMIT 1`,
          [entityId, colegio_id, ...grupoIds]
        );
        inScope = m && m.length > 0;
      }
      if (!inScope) {
        return res.status(403).json({ error: 'No tienes permiso para ver este cumpleaños' });
      }

      const alumno = await query(
        `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto, a.fecha_nacimiento
         FROM alumnos a WHERE a.id = ? AND a.colegio_id = ?`,
        [entityId, colegio_id]
      );
      const arow = alumno[0];
      const nombreCompleto = `${arow.nombres || ''} ${arow.apellido_paterno || ''} ${arow.apellido_materno || ''}`.trim();
      const u = await query(
        `SELECT id, tipo FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND estado = 'ACTIVO' LIMIT 1`,
        [entityId, colegio_id]
      );
      if (!u || u.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado para este alumno' });
      }

      const matricula = await fetchMatriculaVigenteMasReciente(query, entityId, colegio_id);
      const md = matricula && matricula.length > 0 ? matricula[0] : null;
      let gradoTexto = '—';
      if (md) {
        const gradoTxt = md.grado ? `${md.grado}°` : '';
        gradoTexto = `${md.nivel_nombre || ''} ${gradoTxt} ${md.seccion || ''}`.trim() || '—';
      }

      return res.json({
        id: rawId,
        nombre_completo: nombreCompleto,
        perfil: 'Alumno',
        tipo_mensaje: 'ALUMNO',
        tipo_mensaje_ui: 'ALUMNO',
        usuario_tipo: u[0].tipo,
        grado_texto: gradoTexto,
        edad_que_cumple: edadQueCumple(arow.fecha_nacimiento),
        foto_url: buildFotoUrl(arow.foto),
        usuario_id: u[0].id,
        info_adicional: gradoTexto !== '—' ? gradoTexto : null
      });
    }

    // apoderado (foto opcional según BD; si no existe columna, el despliegue usará avatar por defecto)
    const apRows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.fecha_nacimiento
       FROM apoderados ap WHERE ap.id = ? AND ap.colegio_id = ?`,
      [entityId, colegio_id]
    );
    if (!apRows || apRows.length === 0) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }
    let inScopeAp = false;
    if (grupoIds === null) {
      const m = await query(
        `SELECT 1 FROM familias f
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0) LIMIT 1`,
        [entityId, colegio_id, anio_activo]
      );
      inScopeAp = m && m.length > 0;
    } else if (grupoIds.length === 0) {
      inScopeAp = false;
    } else {
      const ph = grupoIds.map(() => '?').join(',');
      const m = await query(
        `SELECT 1 FROM familias f
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND m.grupo_id IN (${ph}) AND (m.estado = 0) LIMIT 1`,
        [entityId, colegio_id, ...grupoIds]
      );
      inScopeAp = m && m.length > 0;
    }
    if (!inScopeAp) {
      return res.status(403).json({ error: 'No tienes permiso para ver este cumpleaños' });
    }

    const ap = apRows[0];
    const nombreCompleto = `${ap.nombres || ''} ${ap.apellido_paterno || ''} ${ap.apellido_materno || ''}`.trim();
    const u = await query(
      `SELECT id, tipo FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? AND estado = 'ACTIVO' LIMIT 1`,
      [entityId, colegio_id]
    );
    if (!u || u.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado para este apoderado' });
    }

    return res.json({
      id: rawId,
      nombre_completo: nombreCompleto,
      perfil: 'Apoderado',
      tipo_mensaje: 'APODERADO',
      tipo_mensaje_ui: 'APODERADO',
      usuario_tipo: u[0].tipo,
      grado_texto: '—',
      edad_que_cumple: edadQueCumple(ap.fecha_nacimiento),
      foto_url: null,
      usuario_id: u[0].id
    });
  } catch (error) {
    console.error('Error detalle cumpleaños:', error);
    res.status(500).json({ error: 'Error al obtener el detalle' });
  }
});

/**
 * GET /api/cumpleanos?mes=2&perfil=PERSONAL|ALUMNO|APODERADO|TODOS
 * mes: 1-12 (opcional, default mes actual)
 * perfil: PERSONAL, ALUMNO, APODERADO, TODOS (opcional, default TODOS)
 */
router.get('/', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id, alumno_id, apoderado_id } = req.user;
    const mes = parseInt(req.query.mes, 10) || (new Date().getMonth() + 1);
    const perfilFiltro = (req.query.perfil || 'TODOS').toUpperCase();

    if (mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)' });
    }

    const resultado = [];

    // Personal (docentes/trabajadores) - todos del colegio (personal tiene: apellidos, nombres)
    if (perfilFiltro === 'PERSONAL' || perfilFiltro === 'TODOS') {
      const personal = await query(
        `SELECT 
          p.id, 
          CONCAT(COALESCE(p.apellidos,''), ', ', COALESCE(p.nombres,'')) as nombre,
          p.fecha_nacimiento,
          DAY(p.fecha_nacimiento) as dia,
          'Personal' as perfil
         FROM personal p
         WHERE p.colegio_id = ? 
           AND p.fecha_nacimiento IS NOT NULL 
           AND p.fecha_nacimiento != '0000-00-00'
           AND MONTH(p.fecha_nacimiento) = ?`,
        [colegio_id, mes]
      );
      resultado.push(...personal.map(r => ({
        id: `p-${r.id}`,
        nombre: r.nombre,
        fecha: r.fecha_nacimiento,
        dia: r.dia,
        perfil: 'Personal'
      })));
    }

    // Alumnos y Apoderados según el alcance del rol
    let grupoIds = [];
    if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA' || tipo === 'SECRETARIA' || tipo === 'PSICOLOGA' || tipo === 'COORDINADOR') {
      grupoIds = null; // Todos los grupos del colegio en el año activo (igual que admin)
    } else if (tipo === 'DOCENTE' && personal_id) {
      // Para docentes, combinar grupos por asignaturas dictadas + grupos donde es tutor.
      // Esto cubre casos donde no dicta cursos pero sí tiene tutoría.
      const gruposDocente = await query(
        `SELECT DISTINCT g.id FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
        [personal_id, colegio_id, anio_activo]
      );

      const gruposTutor = await query(
        `SELECT DISTINCT g.id
         FROM grupos g
         WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
           AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, personal_id, colegio_id, anio_activo]
      );

      grupoIds = [...new Set([...(gruposDocente || []).map(g => g.id), ...(gruposTutor || []).map(g => g.id)])];
    } else if (tipo === 'ALUMNO' && alumno_id) {
      const grupos = await query(
        `SELECT m.grupo_id as id FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
        [alumno_id, colegio_id, anio_activo]
      );
      grupoIds = grupos.map(g => g.id);
    } else if (tipo === 'APODERADO' && apoderado_id) {
      const grupos = await query(
        `SELECT DISTINCT g.id FROM familias f
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
        [apoderado_id, colegio_id, anio_activo]
      );
      grupoIds = grupos.map(g => g.id);
    }

    const tieneGrupos = grupoIds === null || (Array.isArray(grupoIds) && grupoIds.length > 0);

    if (tieneGrupos && (perfilFiltro === 'ALUMNO' || perfilFiltro === 'TODOS')) {
      let alumnosQuery;
      const paramsAlumnos = [colegio_id, mes];
      if (grupoIds === null) {
        alumnosQuery = `SELECT a.id, CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre,
          a.fecha_nacimiento, DAY(a.fecha_nacimiento) as dia
          FROM alumnos a
          INNER JOIN matriculas m ON m.alumno_id = a.id
          INNER JOIN grupos g ON g.id = m.grupo_id
          WHERE a.colegio_id = ? AND g.anio = ?
            AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
            AND MONTH(a.fecha_nacimiento) = ?
            AND (m.estado = 0)`;
        paramsAlumnos.splice(1, 0, anio_activo);
      } else {
        const placeholders = grupoIds.map(() => '?').join(',');
        alumnosQuery = `SELECT a.id, CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre,
          a.fecha_nacimiento, DAY(a.fecha_nacimiento) as dia
          FROM alumnos a
          INNER JOIN matriculas m ON m.alumno_id = a.id
          WHERE a.colegio_id = ? AND m.grupo_id IN (${placeholders})
            AND a.fecha_nacimiento IS NOT NULL AND a.fecha_nacimiento != '0000-00-00'
            AND MONTH(a.fecha_nacimiento) = ?
            AND (m.estado = 0)`;
        paramsAlumnos.splice(1, 0, ...grupoIds);
      }
      const alumnos = await query(alumnosQuery, paramsAlumnos);
      resultado.push(...alumnos.map(r => ({
        id: `a-${r.id}`,
        nombre: r.nombre,
        fecha: r.fecha_nacimiento,
        dia: r.dia,
        perfil: 'Alumno'
      })));
    }

    if (tieneGrupos && (perfilFiltro === 'APODERADO' || perfilFiltro === 'TODOS')) {
      let apoderadosQuery;
      const paramsApod = [colegio_id, mes];
      if (grupoIds === null) {
        apoderadosQuery = `SELECT DISTINCT ap.id, CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres) as nombre,
          ap.fecha_nacimiento, DAY(ap.fecha_nacimiento) as dia
          FROM apoderados ap
          INNER JOIN familias f ON f.apoderado_id = ap.id
          INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
          INNER JOIN grupos g ON g.id = m.grupo_id
          WHERE ap.colegio_id = ? AND g.anio = ?
            AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
            AND MONTH(ap.fecha_nacimiento) = ?
            AND (m.estado = 0)`;
        paramsApod.splice(1, 0, anio_activo);
      } else {
        const placeholders = grupoIds.map(() => '?').join(',');
        apoderadosQuery = `SELECT DISTINCT ap.id, CONCAT(ap.apellido_paterno, ' ', ap.apellido_materno, ', ', ap.nombres) as nombre,
          ap.fecha_nacimiento, DAY(ap.fecha_nacimiento) as dia
          FROM apoderados ap
          INNER JOIN familias f ON f.apoderado_id = ap.id
          INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
          WHERE ap.colegio_id = ? AND m.grupo_id IN (${placeholders})
            AND ap.fecha_nacimiento IS NOT NULL AND ap.fecha_nacimiento != '0000-00-00'
            AND MONTH(ap.fecha_nacimiento) = ?
            AND (m.estado = 0)`;
        paramsApod.splice(1, 0, ...grupoIds);
      }
      const apoderados = await query(apoderadosQuery, paramsApod);
      resultado.push(...apoderados.map(r => ({
        id: `ap-${r.id}`,
        nombre: r.nombre,
        fecha: r.fecha_nacimiento,
        dia: r.dia,
        perfil: 'Apoderado'
      })));
    }

    // Ordenar por día del mes
    resultado.sort((a, b) => (a.dia || 0) - (b.dia || 0));

    // Formatear fecha para mostrar (ej: "01 de Febrero") - usar dia de SQL para evitar NaN con formatos MySQL
    const mesNombre = MESES[mes - 1];
    const cumpleanos = resultado.map(r => {
      const diaNum = r.dia != null && !isNaN(Number(r.dia)) ? parseInt(r.dia, 10) : null;
      const diaStr = (diaNum != null && diaNum >= 1 && diaNum <= 31)
        ? String(diaNum).padStart(2, '0')
        : '--';
      return {
        id: r.id,
        fecha: `${diaStr} de ${mesNombre}`,
        nombre: r.nombre,
        perfil: r.perfil
      };
    });

    const configs = await query(`SELECT valor FROM config WHERE clave = 'show_birthday_window' LIMIT 1`);
    const show_birthday_window = (configs[0]?.valor || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO';

    res.json({
      cumpleanos,
      mes: mesNombre,
      mesNum: mes,
      show_birthday_window
    });
  } catch (error) {
    console.error('Error obteniendo cumpleaños:', error);
    res.status(500).json({ error: 'Error al obtener cumpleaños' });
  }
});

module.exports = router;
