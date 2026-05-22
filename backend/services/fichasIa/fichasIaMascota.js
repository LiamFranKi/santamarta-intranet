const fs = require('fs');
const path = require('path');
const { assetsDir, urlAssets } = require('../../utils/fichasIaPaths');

/** Orden de preferencia para la mascota “Vanguarcito” en la intranet. */
const CANDIDATOS_MASCOTA = [
  'vanguarcito.png',
  'mascota-vanguarcito.png',
  'avatar-nino.png',
  'avatar-nino1.png',
  'avatar-nina1.png',
];

function resolveMascotaVanguarcitoArchivo() {
  for (const nombre of CANDIDATOS_MASCOTA) {
    if (fs.existsSync(path.join(assetsDir, nombre))) return nombre;
  }
  return null;
}

function urlMascotaVanguarcito() {
  const archivo = resolveMascotaVanguarcitoArchivo();
  return archivo ? urlAssets(archivo) : null;
}

module.exports = { urlMascotaVanguarcito, resolveMascotaVanguarcitoArchivo, CANDIDATOS_MASCOTA };
