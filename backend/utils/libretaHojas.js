/**
 * Hojas extra de la libreta. Si la clave no existe, se conserva lo de hoy:
 * conducta sí, puestos no, detalle por curso no.
 */
const CLAVES = {
  conducta: 'libreta_hoja_conducta',
  puestos: 'libreta_hoja_puestos',
  detalle: 'libreta_hoja_detalle',
};

function encendida(valor, defecto) {
  if (valor == null || String(valor).trim() === '') return defecto;
  const s = String(valor).trim().toLowerCase();
  if (s === '1' || s === 'si' || s === 'sí' || s === 'true' || s === 'on') return true;
  if (s === '0' || s === 'no' || s === 'false' || s === 'off') return false;
  return defecto;
}

async function leerHojasLibreta(query) {
  const rows = await query(
    `SELECT clave, valor FROM config WHERE clave IN (?, ?, ?)`,
    [CLAVES.conducta, CLAVES.puestos, CLAVES.detalle]
  );
  const map = {};
  (rows || []).forEach((r) => { map[r.clave] = r.valor; });
  return {
    conducta: encendida(map[CLAVES.conducta], true),
    puestos: encendida(map[CLAVES.puestos], false),
    detalle: encendida(map[CLAVES.detalle], false),
  };
}

module.exports = { leerHojasLibreta, CLAVES };
