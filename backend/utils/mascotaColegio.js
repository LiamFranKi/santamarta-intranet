/**
 * Mascota del colegio: nombre, dibujo principal y dibujos de las fichas.
 * Vacío = Vanguarcito y los archivos que ya trae el servidor.
 */
const fs = require('fs');
const path = require('path');
const { query, execute } = require('./mysql');
const { assetsDir, publicBaseUrl } = require('./fichasIaPaths');
const { urlMascotaVanguarcito, resolveMascotaVanguarcitoArchivo } = require('../services/fichasIa/fichasIaMascota');

const NOMBRE_DEFECTO = 'Vanguarcito';
const DIR = path.join(__dirname, '..', 'uploads', 'mascotas');
const MAX_FICHAS = 12;

const SQL_TABLAS = [
  `CREATE TABLE IF NOT EXISTS mascota_colegio (
    colegio_id INT NOT NULL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL DEFAULT '',
    imagen VARCHAR(255) NOT NULL DEFAULT '',
    actualizado_en DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS mascota_ficha_imagen (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    colegio_id INT NOT NULL,
    archivo VARCHAR(255) NOT NULL,
    orden INT NOT NULL DEFAULT 0,
    KEY idx_mascota_ficha_colegio (colegio_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vanguarcito_uso (
    colegio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    usadas INT NOT NULL DEFAULT 0,
    PRIMARY KEY (colegio_id, usuario_id, fecha)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vanguarcito_mensaje (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    colegio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    rol VARCHAR(12) NOT NULL,
    texto MEDIUMTEXT NOT NULL,
    creado_en DATETIME NOT NULL,
    KEY idx_vanguarcito_msg (colegio_id, usuario_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

let tablasListas = null;

function idColegio(colegioId) {
  const n = parseInt(colegioId, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function nombreVisible(raw) {
  const n = String(raw || '')
    .replace(/[{}<>]/g, '')
    .trim()
    .slice(0, 80);
  return n || NOMBRE_DEFECTO;
}

function asegurarDirColegio(colegioId) {
  const dir = path.join(DIR, String(idColegio(colegioId)));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function asegurarTablas() {
  if (!tablasListas) {
    tablasListas = (async () => {
      for (const sql of SQL_TABLAS) await execute(sql);
      const extras = [
        ['preguntas_alumno', 'ALTER TABLE mascota_colegio ADD COLUMN preguntas_alumno INT NOT NULL DEFAULT 3'],
        ['preguntas_docente', 'ALTER TABLE mascota_colegio ADD COLUMN preguntas_docente INT NOT NULL DEFAULT 5'],
        ['preguntas_personal', 'ALTER TABLE mascota_colegio ADD COLUMN preguntas_personal INT NOT NULL DEFAULT 6'],
      ];
      for (const [col, ddl] of extras) {
        const rows = await query(
          `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mascota_colegio' AND COLUMN_NAME = ?`,
          [col]
        );
        if (!Number(rows?.[0]?.n)) await execute(ddl);
      }
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

function extSegura(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return ext === '.jpeg' ? '.jpg' : ext;
  return '.png';
}

function mimeDe(fsPath) {
  const ext = path.extname(fsPath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function dataUriDe(fsPath) {
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  try {
    const buf = fs.readFileSync(fsPath);
    return `data:${mimeDe(fsPath)};base64,${buf.toString('base64')}`;
  } catch (_) {
    return null;
  }
}

function urlSubida(colegioId, archivo) {
  const base = String(publicBaseUrl() || '').replace(/\/$/, '');
  return `${base}/uploads/mascotas/${idColegio(colegioId)}/${archivo}`;
}

function rutaPrincipalDefecto() {
  const nombre = resolveMascotaVanguarcitoArchivo();
  if (!nombre) return null;
  const full = path.join(assetsDir, nombre);
  return fs.existsSync(full) ? full : null;
}

function rutaImagenGuardada(colegioId, archivo) {
  const name = path.basename(String(archivo || ''));
  if (!name || name !== String(archivo || '')) return null;
  const full = path.join(DIR, String(idColegio(colegioId)), name);
  return fs.existsSync(full) ? full : null;
}

async function leerFila(colegioId) {
  const rows = await query(
    `SELECT nombre, imagen, preguntas_alumno, preguntas_docente, preguntas_personal
     FROM mascota_colegio WHERE colegio_id = ? LIMIT 1`,
    [idColegio(colegioId)]
  );
  return rows?.[0] || null;
}

async function listarFichas(colegioId) {
  const rows = await query(
    `SELECT id, archivo, orden FROM mascota_ficha_imagen WHERE colegio_id = ? ORDER BY orden ASC, id ASC`,
    [idColegio(colegioId)]
  );
  return (rows || [])
    .map((r) => {
      const fsPath = rutaImagenGuardada(colegioId, r.archivo);
      if (!fsPath) return null;
      return {
        id: r.id,
        archivo: r.archivo,
        fsPath,
        url: urlSubida(colegioId, r.archivo),
      };
    })
    .filter(Boolean);
}

async function leerMascota(colegioId) {
  const id = idColegio(colegioId);
  try {
    await asegurarTablas();
    const fila = await leerFila(id);
    const guardado = String(fila?.nombre || '').trim();
    const propia = rutaImagenGuardada(id, fila?.imagen);
    const fichas = await listarFichas(id);
    return {
      nombre_guardado: guardado,
      nombre: nombreVisible(guardado),
      imagen_url: propia ? urlSubida(id, path.basename(propia)) : urlMascotaVanguarcito(),
      imagen_propia: Boolean(propia),
      imagen_fs: propia || rutaPrincipalDefecto(),
      fichas: fichas.map((f) => ({ id: f.id, url: f.url })),
      fichas_fs: fichas,
      preguntas_alumno: numeroCupo(fila?.preguntas_alumno, 3),
      preguntas_docente: numeroCupo(fila?.preguntas_docente, 5),
      preguntas_personal: numeroCupo(fila?.preguntas_personal, 6),
    };
  } catch (e) {
    console.warn('[mascota] lectura con respaldo:', e.message);
    return {
      nombre_guardado: '',
      nombre: NOMBRE_DEFECTO,
      imagen_url: urlMascotaVanguarcito(),
      imagen_propia: false,
      imagen_fs: rutaPrincipalDefecto(),
      fichas: [],
      fichas_fs: [],
      preguntas_alumno: 3,
      preguntas_docente: 5,
      preguntas_personal: 6,
    };
  }
}

/** Dibujos de la hoja. Null = seguir con los avatares que ya trae el servidor. */
async function dibujosPropiosHoja(colegioId) {
  const mascota = await leerMascota(colegioId);
  if (!mascota.fichas_fs.length) return null;
  const lista = [];
  if (mascota.imagen_fs) {
    lista.push({
      archivo: path.basename(mascota.imagen_fs),
      fsPath: mascota.imagen_fs,
      url: mascota.imagen_url,
    });
  }
  for (const f of mascota.fichas_fs) {
    if (!lista.some((x) => path.resolve(x.fsPath) === path.resolve(f.fsPath))) {
      lista.push({ archivo: f.archivo, fsPath: f.fsPath, url: f.url });
    }
  }
  return lista.length ? lista : null;
}

async function rutaPrincipalSiPropia(colegioId) {
  const mascota = await leerMascota(colegioId);
  return mascota.imagen_propia ? mascota.imagen_fs : null;
}

async function guardarNombre(colegioId, nombre) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const limpio = String(nombre || '')
    .replace(/[{}<>]/g, '')
    .trim()
    .slice(0, 80);
  const existe = await query(`SELECT colegio_id FROM mascota_colegio WHERE colegio_id = ? LIMIT 1`, [id]);
  if (existe?.length) {
    await execute(
      `UPDATE mascota_colegio SET nombre = ?, actualizado_en = NOW() WHERE colegio_id = ?`,
      [limpio, id]
    );
  } else {
    await execute(
      `INSERT INTO mascota_colegio (colegio_id, nombre, imagen, actualizado_en) VALUES (?, ?, '', NOW())`,
      [id, limpio]
    );
  }
  return leerMascota(id);
}

function copiarArchivo(tempPath, dest) {
  fs.copyFileSync(tempPath, dest);
  try {
    if (tempPath && fs.existsSync(tempPath) && path.resolve(tempPath) !== path.resolve(dest)) {
      fs.unlinkSync(tempPath);
    }
  } catch (_) {
    /* el temporal de multer puede vivir en otro disco */
  }
}

async function guardarImagenPrincipal(colegioId, tempPath, originalName) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const dir = asegurarDirColegio(id);
  const filename = `principal-${Date.now()}${extSegura(originalName)}`;
  const dest = path.join(dir, filename);
  copiarArchivo(tempPath, dest);
  const previa = await leerFila(id);
  if (existeNombre(previa)) {
    await execute(
      `UPDATE mascota_colegio SET imagen = ?, actualizado_en = NOW() WHERE colegio_id = ?`,
      [filename, id]
    );
  } else {
    await execute(
      `INSERT INTO mascota_colegio (colegio_id, nombre, imagen, actualizado_en) VALUES (?, '', ?, NOW())`,
      [id, filename]
    );
  }
  const vieja = previa?.imagen ? rutaImagenGuardada(id, previa.imagen) : null;
  if (vieja && path.basename(vieja) !== filename) {
    try {
      fs.unlinkSync(vieja);
    } catch (_) {
      /* seguir */
    }
  }
  return leerMascota(id);
}

function existeNombre(fila) {
  return Boolean(fila);
}

async function quitarImagenPrincipal(colegioId) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const previa = await leerFila(id);
  const vieja = previa?.imagen ? rutaImagenGuardada(id, previa.imagen) : null;
  if (previa) {
    await execute(
      `UPDATE mascota_colegio SET imagen = '', actualizado_en = NOW() WHERE colegio_id = ?`,
      [id]
    );
  }
  if (vieja) {
    try {
      fs.unlinkSync(vieja);
    } catch (_) {
      /* seguir */
    }
  }
  return leerMascota(id);
}

async function agregarImagenesFicha(colegioId, archivos) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const actuales = await listarFichas(id);
  const cupo = MAX_FICHAS - actuales.length;
  if (cupo <= 0) {
    const e = new Error(`Puede subir hasta ${MAX_FICHAS} dibujos.`);
    e.status = 400;
    throw e;
  }
  const dir = asegurarDirColegio(id);
  const usar = (archivos || []).slice(0, cupo);
  let orden = actuales.length;
  for (const file of usar) {
    orden += 1;
    const filename = `ficha-${Date.now()}-${orden}${extSegura(file.originalname)}`;
    copiarArchivo(file.path, path.join(dir, filename));
    await execute(
      `INSERT INTO mascota_ficha_imagen (colegio_id, archivo, orden) VALUES (?, ?, ?)`,
      [id, filename, orden]
    );
  }
  return leerMascota(id);
}

async function quitarImagenFicha(colegioId, imagenId) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const imgId = parseInt(imagenId, 10);
  const rows = await query(
    `SELECT id, archivo FROM mascota_ficha_imagen WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [imgId, id]
  );
  if (!rows?.length) return leerMascota(id);
  await execute(`DELETE FROM mascota_ficha_imagen WHERE id = ? AND colegio_id = ?`, [imgId, id]);
  const fsPath = rutaImagenGuardada(id, rows[0].archivo);
  if (fsPath) {
    try {
      fs.unlinkSync(fsPath);
    } catch (_) {
      /* seguir */
    }
  }
  return leerMascota(id);
}

function numeroCupo(valor, defecto) {
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n) || n < 0) return defecto;
  return Math.min(n, 100);
}

async function guardarCupos(colegioId, body) {
  await asegurarTablas();
  const id = idColegio(colegioId);
  const alumno = numeroCupo(body?.preguntas_alumno, 3);
  const docente = numeroCupo(body?.preguntas_docente, 5);
  const personal = numeroCupo(body?.preguntas_personal, 6);
  const existe = await query(`SELECT colegio_id FROM mascota_colegio WHERE colegio_id = ? LIMIT 1`, [id]);
  if (existe?.length) {
    await execute(
      `UPDATE mascota_colegio
       SET preguntas_alumno = ?, preguntas_docente = ?, preguntas_personal = ?, actualizado_en = NOW()
       WHERE colegio_id = ?`,
      [alumno, docente, personal, id]
    );
  } else {
    await execute(
      `INSERT INTO mascota_colegio
        (colegio_id, nombre, imagen, preguntas_alumno, preguntas_docente, preguntas_personal, actualizado_en)
       VALUES (?, '', '', ?, ?, ?, NOW())`,
      [id, alumno, docente, personal]
    );
  }
  return leerMascota(id);
}

function paraCliente(mascota) {
  return {
    nombre: mascota.nombre_guardado,
    nombre_visible: mascota.nombre,
    imagen_url: mascota.imagen_url,
    imagen_propia: mascota.imagen_propia,
    fichas: mascota.fichas,
    preguntas_alumno: mascota.preguntas_alumno,
    preguntas_docente: mascota.preguntas_docente,
    preguntas_personal: mascota.preguntas_personal,
  };
}

module.exports = {
  NOMBRE_DEFECTO,
  nombreVisible,
  dataUriDe,
  leerMascota,
  dibujosPropiosHoja,
  rutaPrincipalSiPropia,
  guardarNombre,
  guardarImagenPrincipal,
  quitarImagenPrincipal,
  agregarImagenesFicha,
  quitarImagenFicha,
  guardarCupos,
  numeroCupo,
  paraCliente,
  MAX_FICHAS,
};
