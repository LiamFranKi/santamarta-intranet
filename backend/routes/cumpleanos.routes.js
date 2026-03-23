/**
 * Rutas de Cumpleaños del Mes
 * Widget flotante para mostrar cumpleaños filtrados por mes y perfil
 * Cada rol ve: Personal, Alumnos y Apoderados según su alcance
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireUserType('DOCENTE', 'ALUMNO', 'APODERADO', 'ADMINISTRADOR', 'PROMOTORIA'));

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
    if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA') {
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
         WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, colegio_id, anio_activo]
      );

      grupoIds = [...new Set([...(gruposDocente || []).map(g => g.id), ...(gruposTutor || []).map(g => g.id)])];
    } else if (tipo === 'ALUMNO' && alumno_id) {
      const grupos = await query(
        `SELECT m.grupo_id as id FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)`,
        [alumno_id, colegio_id, anio_activo]
      );
      grupoIds = grupos.map(g => g.id);
    } else if (tipo === 'APODERADO' && apoderado_id) {
      const grupos = await query(
        `SELECT DISTINCT g.id FROM familias f
         INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)`,
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
            AND (m.estado = 0 OR m.estado = 4)`;
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
            AND (m.estado = 0 OR m.estado = 4)`;
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
            AND (m.estado = 0 OR m.estado = 4)`;
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
            AND (m.estado = 0 OR m.estado = 4)`;
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
