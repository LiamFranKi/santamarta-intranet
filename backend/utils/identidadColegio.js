/**
 * Nombre, marca y datos de contacto del colegio.
 * Si un campo de contacto está vacío, se usa el texto que ya tenían los correos,
 * para que el colegio actual no cambie hasta que lo escriban en Configuración.
 */
const { query } = require('./mysql');

const CONTACTO_RESPALDO = {
  direccion: 'Jr. Toribio de Luzuriaga Mz F lote 18 y 19 - SMP.',
  telefonos: 'Tel: 045 502 100 / 022 084 833',
  email: 'admin@vanguardschools.edu.pe',
};

async function leerIdentidadColegio(colegioId = 1) {
  let titulo = '';
  let nombre = '';
  let texto = '';
  let telefono = '';
  let correo = '';
  let direccionContacto = '';

  try {
    const col = await query(
      `SELECT nombre, titulo_intranet FROM colegios WHERE id = ? LIMIT 1`,
      [colegioId]
    );
    titulo = col?.[0]?.titulo_intranet != null ? String(col[0].titulo_intranet) : '';
    nombre = col?.[0]?.nombre != null ? String(col[0].nombre) : '';
  } catch (_) {
    titulo = '';
    nombre = '';
  }

  try {
    const rows = await query(
      `SELECT clave, valor FROM config
       WHERE clave IN ('texto_intranet', 'telefono_colegio', 'correo_contacto', 'direccion_contacto')`
    );
    const map = {};
    for (const r of rows || []) map[r.clave] = r.valor != null ? String(r.valor) : '';
    texto = map.texto_intranet || '';
    telefono = map.telefono_colegio || '';
    correo = map.correo_contacto || '';
    direccionContacto = map.direccion_contacto || '';
  } catch (_) {
    texto = '';
  }

  return {
    titulo: (titulo || nombre || 'Vanguard Schools').trim() || 'Vanguard Schools',
    marca: (texto || '').trim() || 'VanguardNet',
    telefono: (telefono || '').trim() || CONTACTO_RESPALDO.telefonos,
    correo: (correo || '').trim() || CONTACTO_RESPALDO.email,
    direccionContacto: (direccionContacto || '').trim() || CONTACTO_RESPALDO.direccion,
  };
}

/** Nombre público para correos: Título / Nombre del Colegio. No usa colegios.nombre ni VanguardNet. */
async function nombreParaCorreo(colegioId = 1) {
  const id = await leerIdentidadColegio(colegioId);
  return (id.titulo || '').trim() || 'Vanguard Schools';
}

async function marcaCreadorExcel(colegioId = 1) {
  try {
    const id = await leerIdentidadColegio(colegioId);
    return id.marca || 'VanguardNet';
  } catch (_) {
    return 'VanguardNet';
  }
}

module.exports = {
  CONTACTO_RESPALDO,
  leerIdentidadColegio,
  nombreParaCorreo,
  marcaCreadorExcel,
};
