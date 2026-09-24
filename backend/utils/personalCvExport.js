/**
 * Datos para exportar currículum del personal (PDF en el cliente).
 * Solo personal activo. Sin sueldo.
 */
const fs = require('fs');
const path = require('path');
const { query } = require('./mysql');
const { getCvCompleto } = require('./personalCv');
const { sqlPersonalSinSuperadmin, personalEsSuperadmin } = require('./superadminOculto');
const { leerLogoParaCliente } = require('./logoColegio');

const TIPOS_PERSONAL_CV = [
  'ADMINISTRADOR',
  'DIRECTOR',
  'DOCENTE',
  'AUXILIAR',
  'SECRETARIA',
  'CAJERO',
  'ENFERMERA',
  'PROMOTORIA',
  'COORDINADOR',
  'PSICOLOGA',
  'ASISTENCIA',
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO',
];
const TIPOS_SET = new Set(TIPOS_PERSONAL_CV);

const FOTOS_LOCAL = path.join(__dirname, '..', 'Static', 'Image', 'Fotos');
const FOTOS_PROD = '/home/vanguard/intranet2026/backend/Static/Image/Fotos';
const MAX_FOTO_BYTES = 350 * 1024;

function tipoValido(raw) {
  const t = String(raw || '').trim().toUpperCase();
  return TIPOS_SET.has(t) ? t : '';
}

function tituloNombre(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function nombreCompleto(row) {
  const ap = String(row.apellidos || '').trim();
  const nom = tituloNombre(row.nombres);
  if (ap && nom) return `${ap.toUpperCase()}, ${nom}`;
  return (ap || nom || 'Personal').toUpperCase();
}

function nombreArchivoCv(row, masivo, tipo) {
  const safe = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
  if (masivo) {
    return tipo ? `Curriculums_${safe(tipo) || 'Personal'}.pdf` : 'Curriculums_Personal.pdf';
  }
  const ap = safe(row.apellidos) || 'Personal';
  const nom = safe(row.nombres) || 'CV';
  return `CV_${ap}_${nom}.pdf`;
}

function dataUrlDesdeArchivo(fsPath) {
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  try {
    const stat = fs.statSync(fsPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FOTO_BYTES) return null;
    const buf = fs.readFileSync(fsPath);
    const ext = path.extname(fsPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function buscarFotoEnDisco(nombreArchivo) {
  const base = path.basename(String(nombreArchivo || ''));
  if (!base || base.includes('..')) return null;
  const candidatos = [
    path.join(FOTOS_LOCAL, base),
    path.join(FOTOS_PROD, base),
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolverFotoPersonal(fotoRaw) {
  const raw = String(fotoRaw || '').trim();
  if (!raw) return { foto_url: null, foto_base64: null };

  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  const isProduction = process.env.NODE_ENV === 'production';

  if (/^https?:\/\//i.test(raw)) {
    return { foto_url: raw, foto_base64: dataUrlDesdeArchivo(buscarFotoEnDisco(raw)) };
  }

  if (raw.startsWith('/Static/Image/Fotos/') || raw.startsWith('/uploads/')) {
    const baseName = path.basename(raw);
    const foto_url = isProduction
      ? raw.startsWith('/Static/')
        ? `${phpSystemUrl}${raw}`
        : raw
      : `http://localhost:5000${raw}`;
    return { foto_url, foto_base64: dataUrlDesdeArchivo(buscarFotoEnDisco(baseName)) };
  }

  const foto_url = isProduction
    ? `${phpSystemUrl}/Static/Image/Fotos/${raw}`
    : `http://localhost:5000/Static/Image/Fotos/${raw}`;
  return { foto_url, foto_base64: dataUrlDesdeArchivo(buscarFotoEnDisco(raw)) };
}

function telefonoPrincipal(row) {
  const cel = String(row.telefono_celular || '').trim();
  const fijo = String(row.telefono_fijo || '').trim();
  return cel || fijo || '';
}

function mapItem(row, cv) {
  const foto = resolverFotoPersonal(row.foto);
  return {
    personal_id: row.id,
    nombres: row.nombres || '',
    apellidos: row.apellidos || '',
    nombre_completo: nombreCompleto(row),
    cargo: String(row.cargo || '').trim(),
    profesion: String(row.profesion || '').trim(),
    email: String(row.email || '').trim(),
    telefono: telefonoPrincipal(row),
    telefono_fijo: String(row.telefono_fijo || '').trim(),
    nro_documento: String(row.nro_documento || '').trim(),
    direccion: String(row.direccion || '').trim(),
    fecha_nacimiento: row.fecha_nacimiento || null,
    usuario_tipo: row.usuario_tipo || '',
    foto_url: foto.foto_url,
    foto_base64: foto.foto_base64,
    estudios: cv.estudios || [],
    idiomas: cv.idiomas || [],
    experiencia: (cv.experiencia || []).map((x) => ({
      ...x,
      fecha_inicio: x.fecha_inicio ? String(x.fecha_inicio).slice(0, 10) : null,
      fecha_fin: x.fecha_fin ? String(x.fecha_fin).slice(0, 10) : null,
    })),
    documentos: (cv.documentos || []).map((d) => ({
      tipo: d.tipo,
      titulo: d.titulo,
    })),
  };
}

async function nombreColegio(colegioId) {
  const rows = await query('SELECT nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  return String(rows[0]?.nombre || 'Vanguard Schools').trim();
}

function sqlActivo(aliasP = 'p') {
  return `EXISTS (
    SELECT 1 FROM usuarios ux
    WHERE ux.personal_id = ${aliasP}.id
      AND ux.colegio_id = ${aliasP}.colegio_id
      AND ux.estado = 'ACTIVO'
      AND (ux.tipo IS NULL OR ux.tipo <> 'SUPERADMINISTRADOR')
  )`;
}

async function listarPersonalActivo(colegioId, { tipo, personalId } = {}) {
  const where = ['p.colegio_id = ?', sqlPersonalSinSuperadmin('p'), sqlActivo('p')];
  const params = [colegioId];

  if (tipo) {
    where.push(`EXISTS (
      SELECT 1 FROM usuarios ux
      WHERE ux.personal_id = p.id
        AND ux.colegio_id = p.colegio_id
        AND ux.estado = 'ACTIVO'
        AND ux.tipo = ?
    )`);
    params.push(tipo);
  }

  if (personalId) {
    where.push('p.id = ?');
    params.push(personalId);
  }

  const filtroTipoJoin = tipo ? 'AND uu.tipo = ?' : '';
  const listParams = [];
  if (tipo) listParams.push(tipo);
  listParams.push(...params);

  return query(
    `SELECT p.id, p.nombres, p.apellidos, p.nro_documento, p.email, p.telefono_celular,
            p.telefono_fijo, p.cargo, p.profesion, p.direccion, p.foto, p.fecha_nacimiento,
            u.tipo AS usuario_tipo
     FROM personal p
     LEFT JOIN usuarios u ON u.id = (
       SELECT uu.id
       FROM usuarios uu
       WHERE uu.personal_id = p.id
         AND uu.colegio_id = p.colegio_id
         AND uu.estado = 'ACTIVO'
         ${filtroTipoJoin}
       ORDER BY uu.id ASC
       LIMIT 1
     )
     WHERE ${where.join(' AND ')}
     ORDER BY p.apellidos ASC, p.nombres ASC`,
    listParams
  );
}

async function getCvMap(personalIds, colegioId) {
  const map = new Map();
  for (const id of personalIds) {
    map.set(Number(id), { estudios: [], idiomas: [], experiencia: [], documentos: [] });
  }
  if (!personalIds.length) return map;

  const placeholders = personalIds.map(() => '?').join(',');
  const params = [colegioId, ...personalIds];

  const [estudios, idiomas, experiencia, documentos] = await Promise.all([
    query(
      `SELECT personal_id, nivel, institucion, carrera, anio_inicio, anio_fin, en_curso, orden
       FROM personal_estudios
       WHERE colegio_id = ? AND personal_id IN (${placeholders})
       ORDER BY orden ASC, id ASC`,
      params
    ),
    query(
      `SELECT personal_id, idioma, nivel, orden
       FROM personal_idiomas
       WHERE colegio_id = ? AND personal_id IN (${placeholders})
       ORDER BY orden ASC, id ASC`,
      params
    ),
    query(
      `SELECT personal_id, empresa, cargo, fecha_inicio, fecha_fin, actual, descripcion, orden
       FROM personal_experiencia
       WHERE colegio_id = ? AND personal_id IN (${placeholders})
       ORDER BY orden ASC, id ASC`,
      params
    ),
    query(
      `SELECT personal_id, tipo, titulo
       FROM personal_documentos
       WHERE colegio_id = ? AND personal_id IN (${placeholders})
       ORDER BY id DESC`,
      params
    ),
  ]);

  const push = (rows, key) => {
    (rows || []).forEach((row) => {
      const bucket = map.get(Number(row.personal_id));
      if (bucket) bucket[key].push(row);
    });
  };
  push(estudios, 'estudios');
  push(idiomas, 'idiomas');
  push(experiencia, 'experiencia');
  push(documentos, 'documentos');
  return map;
}

async function catalogoCurriculums(colegioId) {
  const rows = await listarPersonalActivo(colegioId, {});
  return {
    ok: true,
    tipos: TIPOS_PERSONAL_CV,
    personal: (rows || []).map((r) => ({
      id: r.id,
      nombre: nombreCompleto(r),
      cargo: String(r.cargo || '').trim(),
      usuario_tipo: r.usuario_tipo || '',
    })),
  };
}

async function exportarCurriculums(colegioId, { tipo, personalId } = {}) {
  const tipoF = tipoValido(tipo);
  const pid = personalId ? parseInt(personalId, 10) : 0;
  const rows = await listarPersonalActivo(colegioId, {
    tipo: tipoF || '',
    personalId: Number.isFinite(pid) && pid > 0 ? pid : 0,
  });

  const ids = (rows || []).map((r) => r.id);
  const [cvMap, colegio_nombre, logo] = await Promise.all([
    getCvMap(ids, colegioId),
    nombreColegio(colegioId),
    leerLogoParaCliente().catch(() => ({ logo_base64: null })),
  ]);

  const items = (rows || []).map((row) => mapItem(row, cvMap.get(Number(row.id)) || {}));
  const uno = items.length === 1 ? items[0] : null;

  return {
    ok: true,
    colegio_nombre,
    logo_base64: logo?.logo_base64 || null,
    total: items.length,
    filename: nombreArchivoCv(uno, items.length !== 1, tipoF),
    items,
  };
}

/**
 * Un CV concreto (admin menú o el propio trabajador).
 * No exige estado ACTIVO: quien ya está viendo la ficha / su perfil puede descargarlo.
 */
async function exportarCurriculumUno(colegioId, personalId, { exigirActivo = false } = {}) {
  const pid = parseInt(personalId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, status: 400, error: 'ID inválido' };
  }
  if (await personalEsSuperadmin(query, pid, colegioId)) {
    return { ok: false, status: 404, error: 'Personal no encontrado' };
  }

  if (exigirActivo) {
    const data = await exportarCurriculums(colegioId, { personalId: pid });
    if (!data.items.length) {
      return { ok: false, status: 404, error: 'Personal no encontrado o inactivo' };
    }
    return data;
  }

  const rows = await query(
    `SELECT p.id, p.nombres, p.apellidos, p.nro_documento, p.email, p.telefono_celular,
            p.telefono_fijo, p.cargo, p.profesion, p.direccion, p.foto, p.fecha_nacimiento,
            u.tipo AS usuario_tipo
     FROM personal p
     LEFT JOIN usuarios u ON u.id = (
       SELECT uu.id
       FROM usuarios uu
       WHERE uu.personal_id = p.id AND uu.colegio_id = p.colegio_id
       ORDER BY (uu.estado = 'ACTIVO') DESC, uu.id ASC
       LIMIT 1
     )
     WHERE p.id = ? AND p.colegio_id = ? AND ${sqlPersonalSinSuperadmin('p')}
     LIMIT 1`,
    [pid, colegioId]
  );
  if (!rows.length) {
    return { ok: false, status: 404, error: 'Personal no encontrado' };
  }

  const [cv, colegio_nombre, logo] = await Promise.all([
    getCvCompleto(pid, colegioId),
    nombreColegio(colegioId),
    leerLogoParaCliente().catch(() => ({ logo_base64: null })),
  ]);

  const item = mapItem(rows[0], cv);
  return {
    ok: true,
    colegio_nombre,
    logo_base64: logo?.logo_base64 || null,
    total: 1,
    filename: nombreArchivoCv(item, false, ''),
    items: [item],
  };
}

module.exports = {
  TIPOS_PERSONAL_CV,
  catalogoCurriculums,
  exportarCurriculums,
  exportarCurriculumUno,
};
