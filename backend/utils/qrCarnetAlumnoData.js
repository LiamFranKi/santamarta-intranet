/**
 * Datos del carnet QR por alumno (misma estructura que GET /apoderado/hijos/:id/qr).
 * Usado por admin (lote por grupo) y reutilizable.
 */
const path = require('path');
const fs = require('fs');

function fotoUrlYPath(alumnoFoto, phpSystemUrl, isProduction, baseFotosPath) {
  if (!alumnoFoto || String(alumnoFoto).trim() === '') {
    return { foto_url: null, fotoPath: null };
  }
  const foto_url = isProduction
    ? `${phpSystemUrl}/Static/Image/Fotos/${alumnoFoto}`
    : `http://localhost:5000/Static/Image/Fotos/${alumnoFoto}`;
  let fotoPath = path.join(baseFotosPath, path.basename(alumnoFoto));
  if (!fs.existsSync(fotoPath) && isProduction) {
    fotoPath = path.join('/home/vanguard/intranet2026/backend/Static/Image/Fotos', path.basename(alumnoFoto));
  }
  return { foto_url, fotoPath };
}

function leerFotoBase64(fotoPath, alumnoFoto) {
  if (!fotoPath || !fs.existsSync(fotoPath)) return null;
  try {
    const buf = fs.readFileSync(fotoPath);
    const ext = (path.extname(alumnoFoto) || '').toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

async function leerLogoBoletaBase64(query) {
  const configLogo = await query(`SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`);
  if (!configLogo || !configLogo.length || !configLogo[0].valor) {
    return { logo_url: null, logo_base64: null };
  }
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  const isProduction = process.env.NODE_ENV === 'production';
  const logo_url = isProduction
    ? `${phpSystemUrl}/Static/Archivos/${configLogo[0].valor}`
    : `http://localhost:5000/Static/Archivos/${configLogo[0].valor}`;
  const baseArchivosPath = process.env.STATIC_ARCHIVOS_PATH || path.join(__dirname, '..', 'Static', 'Archivos');
  let logoPath = path.join(baseArchivosPath, path.basename(configLogo[0].valor));
  if (!fs.existsSync(logoPath) && isProduction) {
    logoPath = path.join('/home/vanguard/intranet2026/backend/Static/Archivos', path.basename(configLogo[0].valor));
  }
  let logo_base64 = null;
  try {
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      const ext = (path.extname(configLogo[0].valor) || '').toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      logo_base64 = `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch (e) {
    /* ignorar */
  }
  return { logo_url, logo_base64 };
}

/**
 * Matrícula del alumno en el grupo indicado (no la “vigente” genérica: evita mezclar aulas).
 */
async function fetchMatriculaAlumnoEnGrupo(query, alumnoId, grupoId, colegio_id) {
  return query(
    `SELECT m.id AS matricula_id, m.alumno_id, g.grado, g.seccion, g.anio AS grupo_anio, n.nombre AS nivel_nombre
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     LIMIT 1`,
    [alumnoId, grupoId, colegio_id]
  );
}

/**
 * Un registro de carnet por alumno en un grupo concreto.
 * Incluye alumno_id / matricula_id para trazabilidad en el cliente.
 */
async function buildQrCarnetPayloadForAlumnoEnGrupo(query, { colegio_id, alumno_id, grupo_id, anio_activo }) {
  const alumno = await query(
    `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto, u.usuario as nro_documento
     FROM alumnos a
     LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
     WHERE a.id = ? AND a.colegio_id = ?`,
    [alumno_id, colegio_id]
  );
  if (!alumno || !alumno.length) return null;

  const alumnoData = alumno[0];
  const matricula = await fetchMatriculaAlumnoEnGrupo(query, alumno_id, grupo_id, colegio_id);
  if (!matricula || !matricula.length) return null;

  const matriculaData = matricula[0];

  const colegio = await query(`SELECT nombre FROM colegios WHERE id = ?`, [colegio_id]);
  const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';

  const anioCarnet =
    anio_activo ??
    (matriculaData.grupo_anio != null ? matriculaData.grupo_anio : null) ??
    matriculaData.grupo_anio;

  const apoderadoInfo = await query(
    `SELECT CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
            ap.telefono_celular,
            ap.direccion
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     WHERE f.alumno_id = ? AND ap.colegio_id = ?
     ORDER BY f.id ASC
     LIMIT 1`,
    [alumno_id, colegio_id]
  );
  const apoderadoData = apoderadoInfo && apoderadoInfo.length > 0 ? apoderadoInfo[0] : null;
  const apoderado_nombre = apoderadoData ? (apoderadoData.nombre_completo || '').trim() : '';
  const apoderado_celular = apoderadoData ? (apoderadoData.telefono_celular || '').trim() : '';
  const direccion = apoderadoData ? (apoderadoData.direccion || '').trim() : '';

  let grupoTexto = '';
  const gradoTexto = matriculaData.grado ? `${matriculaData.grado}°` : '';
  grupoTexto = `${matriculaData.nivel_nombre || ''} ${gradoTexto} ${matriculaData.seccion || ''}`.trim();

  const qrDataStr = alumnoData.nro_documento || `ALUMNO-${alumnoData.id}`;

  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  const isProduction = process.env.NODE_ENV === 'production';
  const baseFotosPath = process.env.STATIC_FOTOS_PATH || path.join(__dirname, '..', 'Static', 'Image', 'Fotos');
  const { foto_url, fotoPath } = fotoUrlYPath(alumnoData.foto, phpSystemUrl, isProduction, baseFotosPath);
  const foto_base64 = leerFotoBase64(fotoPath, alumnoData.foto);

  return {
    alumno_id: alumnoData.id,
    matricula_id: matriculaData.matricula_id,
    nombres: alumnoData.nombres || '',
    apellido_paterno: alumnoData.apellido_paterno || '',
    apellido_materno: alumnoData.apellido_materno || '',
    nombre_completo: `${alumnoData.nombres || ''} ${alumnoData.apellido_paterno || ''} ${alumnoData.apellido_materno || ''}`.trim(),
    grupo: grupoTexto,
    colegio_nombre: colegioNombre,
    anio: anioCarnet,
    qr_data: qrDataStr,
    nro_documento: alumnoData.nro_documento || '',
    foto_url,
    foto_base64,
    apoderado_nombre,
    apoderado_celular,
    direccion,
  };
}

module.exports = {
  buildQrCarnetPayloadForAlumnoEnGrupo,
  leerLogoBoletaBase64,
};
