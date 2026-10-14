/**
 * Plantillas de login y de la web, y colores.
 * Vacío o "actual" = el diseño que ya está en uso.
 */
const { query, execute } = require('./mysql');
const { upsertClave } = require('./logoColegio');
const { urlFondoConfig } = require('./staticStorage');

const LOGIN = ['actual', 'partido', 'tarjeta', 'amplio', 'compacto'];
const WEB = ['actual', 'barra', 'sobre-banner', 'editorial', 'tarjetas', 'sobrio'];
const FONDO = ['color', 'imagen'];
const CLAVES = [
  'login_plantilla', 'login_fondo_modo', 'web_plantilla',
  'color_primario', 'color_secundario', 'color_acento',
  'color_navbar', 'color_fondo', 'intranet_fondo_modo', 'intranet_fondo',
  'web_intranet_url', 'web_titulo', 'web_lema', 'web_lema_verde',
];

function unoDe(valor, lista, defecto) {
  const v = String(valor || '').trim().toLowerCase();
  return lista.includes(v) ? v : defecto;
}

function urlIntranet(valor, estricto) {
  const v = String(valor || '').trim();
  if (!v) return '';
  let u;
  try {
    u = new URL(v);
  } catch (e) {
    if (!estricto) return '';
    const err = new Error('La dirección de la intranet debe empezar por http:// o https://');
    err.status = 400;
    throw err;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    if (!estricto) return '';
    const err = new Error('La dirección de la intranet debe empezar por http:// o https://');
    err.status = 400;
    throw err;
  }
  const ruta = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  return `${u.origin}${ruta}${u.search}`;
}

function fraseTitulo(valor) {
  return String(valor || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function colorHex(valor) {
  const v = String(valor || '').trim();
  if (!v) return '';
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '';
}

async function mapaConfig() {
  const rows = await query(
    `SELECT clave, valor FROM config
     WHERE clave IN (${CLAVES.map(() => '?').join(', ')})`,
    CLAVES
  );
  const map = {};
  for (const row of rows || []) map[row.clave] = row.valor;
  return map;
}

async function fondoColegio(colegioId) {
  try {
    const rows = await query(
      'SELECT login_background FROM colegios WHERE id = ? LIMIT 1',
      [colegioId]
    );
    return urlFondoConfig(rows?.[0]?.login_background);
  } catch {
    return null;
  }
}

async function leerApariencia(colegioId) {
  const map = await mapaConfig().catch(() => ({}));
  const fondo = await fondoColegio(colegioId);
  return {
    login_plantilla: unoDe(map.login_plantilla, LOGIN, 'actual'),
    login_fondo_modo: unoDe(map.login_fondo_modo, FONDO, 'color'),
    login_fondo: fondo,
    web_plantilla: unoDe(map.web_plantilla, WEB, 'actual'),
    color_primario: colorHex(map.color_primario),
    color_secundario: colorHex(map.color_secundario),
    color_acento: colorHex(map.color_acento),
    color_navbar: colorHex(map.color_navbar),
    color_fondo: colorHex(map.color_fondo),
    intranet_fondo_modo: unoDe(map.intranet_fondo_modo, FONDO, 'color'),
    intranet_fondo: urlFondoConfig(map.intranet_fondo),
    web_intranet_url: urlIntranet(map.web_intranet_url, false),
    web_titulo: fraseTitulo(map.web_titulo),
    web_lema: fraseTitulo(map.web_lema),
    web_lema_verde: fraseTitulo(map.web_lema_verde),
  };
}

async function guardarApariencia(colegioId, body, archivoFondo, archivoIntranet) {
  const campos = [];
  if (body.login_plantilla != null) {
    campos.push(['login_plantilla', unoDe(body.login_plantilla, LOGIN, 'actual')]);
  }
  if (body.login_fondo_modo != null) {
    campos.push(['login_fondo_modo', unoDe(body.login_fondo_modo, FONDO, 'color')]);
  }
  if (body.web_plantilla != null) {
    campos.push(['web_plantilla', unoDe(body.web_plantilla, WEB, 'actual')]);
  }
  if (body.color_primario != null) campos.push(['color_primario', colorHex(body.color_primario)]);
  if (body.color_secundario != null) campos.push(['color_secundario', colorHex(body.color_secundario)]);
  if (body.color_acento != null) campos.push(['color_acento', colorHex(body.color_acento)]);
  if (body.color_navbar != null) campos.push(['color_navbar', colorHex(body.color_navbar)]);
  if (body.color_fondo != null) campos.push(['color_fondo', colorHex(body.color_fondo)]);
  if (body.web_intranet_url != null) {
    campos.push(['web_intranet_url', urlIntranet(body.web_intranet_url, true)]);
  }
  if (body.web_titulo != null) campos.push(['web_titulo', fraseTitulo(body.web_titulo)]);
  if (body.web_lema != null) campos.push(['web_lema', fraseTitulo(body.web_lema)]);
  if (body.web_lema_verde != null) campos.push(['web_lema_verde', fraseTitulo(body.web_lema_verde)]);
  if (body.intranet_fondo_modo != null) {
    campos.push(['intranet_fondo_modo', unoDe(body.intranet_fondo_modo, FONDO, 'color')]);
  }
  if (archivoIntranet) campos.push(['intranet_fondo', archivoIntranet]);
  if (String(body.quitar_fondo_intranet || '') === '1') campos.push(['intranet_fondo', '']);

  for (const [clave, valor] of campos) {
    await upsertClave(clave, valor);
  }

  if (archivoFondo) {
    await execute(
      'UPDATE colegios SET login_background = ? WHERE id = ?',
      [archivoFondo, colegioId]
    );
  } else if (String(body.quitar_fondo || '') === '1') {
    await execute('UPDATE colegios SET login_background = NULL WHERE id = ?', [colegioId]);
  }

  return leerApariencia(colegioId);
}

module.exports = {
  LOGIN,
  WEB,
  leerApariencia,
  guardarApariencia,
};
