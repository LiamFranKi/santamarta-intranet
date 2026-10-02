/**
 * Limpieza de un año ya cerrado: muro, chat, avisos y auditoría.
 * En disco solo borra archivos de esas publicaciones.
 * No toca temas, biblioteca, fotos de perfil, notas, matrículas ni pagos.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query, execute } = require('./mysql');
const { joinStaticFs } = require('./staticStorage');

const DIR_PUBLICACIONES = path.join('Image', 'Publicaciones');
const DIR_ARCHIVOS = 'Archivos';

function rangoAnio(anio) {
  return [`${anio}-01-01 00:00:00`, `${anio + 1}-01-01 00:00:00`];
}

function anioValido(anio, anioActivo) {
  const n = parseInt(anio, 10);
  const activo = parseInt(anioActivo, 10);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    return 'Elige un año válido.';
  }
  if (!Number.isInteger(activo)) {
    return 'No se pudo leer el año activo del colegio.';
  }
  if (n >= activo) {
    return `Solo se puede limpiar un año anterior al activo (${activo}).`;
  }
  return '';
}

function textoCampo(valor) {
  const raw = String(valor || '');
  if (!raw) return '';
  if (raw.includes('/Static/')) return raw;
  try {
    const dec = Buffer.from(raw, 'base64').toString('utf8');
    if (dec.includes('Static') || dec.startsWith('a:')) return dec;
  } catch (_) {
    /* el campo a veces ya viene en texto */
  }
  return raw;
}

function archivosDePublicacion(images, archivos) {
  const texto = `${textoCampo(images)}\n${textoCampo(archivos)}`;
  const fotos = new Set();
  const adjuntos = new Set();
  const reFoto = /\/Static\/Image\/Publicaciones\/([A-Za-z0-9._-]+)/g;
  const reAdj = /\/Static\/Archivos\/(archivo-[A-Za-z0-9._-]+)/g;
  let m;
  while ((m = reFoto.exec(texto))) fotos.add(m[1]);
  while ((m = reAdj.exec(texto))) adjuntos.add(m[1]);
  return { fotos: [...fotos], adjuntos: [...adjuntos] };
}

function basenameSeguro(valor) {
  const base = path.basename(String(valor || '').split('?')[0]);
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) return '';
  return base;
}

async function leerAnioActivo(colegioId) {
  const [row] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  return parseInt(row?.anio_activo, 10) || 0;
}

async function contar(sql, params) {
  try {
    const [row] = await query(sql, params);
    return Number(row?.n) || 0;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146) return 0;
    throw e;
  }
}

async function borrarSql(sql, params) {
  try {
    const result = await execute(sql, params);
    return Number(result?.affectedRows) || 0;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146) return 0;
    throw e;
  }
}

async function nombresProtegidos(nombres, idsBorrar) {
  const protegidos = new Set();
  const borrar = new Set(idsBorrar.map((id) => Number(id)));
  const lote = 30;
  for (let i = 0; i < nombres.length; i += lote) {
    const parte = nombres.slice(i, i + lote);
    const likesTema = parte.map(() => 'archivo LIKE ?').join(' OR ');
    try {
      const temas = await query(
        `SELECT archivo FROM asignaturas_archivos WHERE ${likesTema}`,
        parte.map((n) => `%${n}%`)
      );
      for (const row of temas || []) {
        const base = basenameSeguro(row.archivo);
        if (parte.includes(base)) protegidos.add(base);
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.errno !== 1146) throw e;
    }

    const likesPub = parte.map(() => '(images LIKE ? OR archivos LIKE ?)').join(' OR ');
    const otras = await query(
      `SELECT id, images, archivos FROM publicaciones WHERE ${likesPub}`,
      parte.flatMap((n) => [`%${n}%`, `%${n}%`])
    );
    for (const row of otras || []) {
      if (borrar.has(Number(row.id))) continue;
      const usados = archivosDePublicacion(row.images, row.archivos);
      for (const nombre of [...usados.fotos, ...usados.adjuntos]) {
        if (parte.includes(nombre)) protegidos.add(nombre);
      }
    }
  }
  return protegidos;
}

async function planArchivos(colegioId, anio) {
  const [desde, hasta] = rangoAnio(anio);
  let filas = [];
  try {
    filas = await query(
      `SELECT id, images, archivos FROM publicaciones
       WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
      [colegioId, desde, hasta]
    );
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146) {
      return { filas: 0, archivos: [], bytes: 0, protegidos: 0 };
    }
    throw e;
  }
  const candidatos = new Map();
  for (const row of filas || []) {
    const { fotos, adjuntos } = archivosDePublicacion(row.images, row.archivos);
    for (const nombre of fotos) {
      candidatos.set(nombre, { nombre, dir: DIR_PUBLICACIONES });
    }
    for (const nombre of adjuntos) {
      candidatos.set(nombre, { nombre, dir: DIR_ARCHIVOS });
    }
  }
  const nombres = [...candidatos.keys()];
  const protegidos = nombres.length
    ? await nombresProtegidos(nombres, (filas || []).map((row) => row.id))
    : new Set();
  const archivos = [];
  let bytes = 0;
  for (const item of candidatos.values()) {
    if (protegidos.has(item.nombre)) continue;
    const full = joinStaticFs(item.dir, item.nombre);
    const relativo = path.relative(joinStaticFs(), full);
    if (relativo.startsWith('..') || path.isAbsolute(relativo)) continue;
    let tam = 0;
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      tam = st.size;
    } catch (_) {
      continue;
    }
    bytes += tam;
    archivos.push({ ...item, bytes: tam });
  }
  return {
    filas: (filas || []).length,
    archivos,
    bytes,
    protegidos: protegidos.size,
  };
}

async function resumen(colegioId, anio) {
  const anioActivo = await leerAnioActivo(colegioId);
  const error = anioValido(anio, anioActivo);
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }
  const [desde, hasta] = rangoAnio(anio);
  const [chat, notificaciones, auditoria, plan] = await Promise.all([
    contar(
      `SELECT COUNT(*) AS n
       FROM chat_mensajes m
       INNER JOIN chat_salas s ON s.id = m.sala_id
       WHERE s.colegio_id = ? AND m.created_at >= ? AND m.created_at < ?`,
      [colegioId, desde, hasta]
    ),
    contar(
      `SELECT COUNT(*) AS n
       FROM notificaciones n
       LEFT JOIN usuarios dest ON dest.id = n.destinatario_id
       LEFT JOIN usuarios rem ON rem.id = n.usuario_id
       WHERE n.fecha_hora >= ? AND n.fecha_hora < ?
         AND (dest.colegio_id = ? OR (n.destinatario_id IS NULL AND rem.colegio_id = ?))`,
      [desde, hasta, colegioId, colegioId]
    ),
    contar(
      `SELECT COUNT(*) AS n FROM auditoria_logs
       WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
      [colegioId, desde, hasta]
    ),
    planArchivos(colegioId, anio),
  ]);
  return {
    anio: parseInt(anio, 10),
    anio_activo: anioActivo,
    publicaciones: plan.filas,
    archivos: plan.archivos.length,
    bytes: plan.bytes,
    protegidos: plan.protegidos,
    chat,
    notificaciones,
    auditoria,
  };
}

async function ejecutar(colegioId, anio, avisar = () => {}) {
  avisar({ pct: 6, paso: 0, etapa: 'Revisando qué se va a borrar…' });
  const antes = await resumen(colegioId, anio);
  const [desde, hasta] = rangoAnio(anio);
  const plan = await planArchivos(colegioId, anio);

  avisar({ pct: 18, paso: 1, etapa: 'Borrando el chat…' });
  const chat = await borrarSql(
    `DELETE m FROM chat_mensajes m
     INNER JOIN chat_salas s ON s.id = m.sala_id
     WHERE s.colegio_id = ? AND m.created_at >= ? AND m.created_at < ?`,
    [colegioId, desde, hasta]
  );
  avisar({ pct: 36, paso: 2, etapa: 'Borrando avisos…' });
  const notificaciones = await borrarSql(
    `DELETE n FROM notificaciones n
     LEFT JOIN usuarios dest ON dest.id = n.destinatario_id
     LEFT JOIN usuarios rem ON rem.id = n.usuario_id
     WHERE n.fecha_hora >= ? AND n.fecha_hora < ?
       AND (dest.colegio_id = ? OR (n.destinatario_id IS NULL AND rem.colegio_id = ?))`,
    [desde, hasta, colegioId, colegioId]
  );
  avisar({ pct: 52, paso: 3, etapa: 'Borrando el registro de auditoría…' });
  const auditoria = await borrarSql(
    `DELETE FROM auditoria_logs
     WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
    [colegioId, desde, hasta]
  );
  avisar({ pct: 68, paso: 4, etapa: 'Borrando publicaciones…' });
  const publicaciones = await borrarSql(
    `DELETE FROM publicaciones
     WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
    [colegioId, desde, hasta]
  );

  let archivos = 0;
  let bytes = 0;
  const noBorrados = [];
  const totalArchivos = plan.archivos.length;
  avisar({ pct: 78, paso: 5, etapa: totalArchivos ? 'Borrando fotos del disco…' : 'No hay fotos que borrar…' });
  for (let i = 0; i < plan.archivos.length; i += 1) {
    const item = plan.archivos[i];
    if (i % 8 === 0 || i === plan.archivos.length - 1) {
      const avance = totalArchivos ? Math.round((i / totalArchivos) * 18) : 18;
      avisar({ pct: 78 + avance, paso: 5, etapa: `Borrando fotos ${i + 1} de ${totalArchivos}…` });
    }
    const full = joinStaticFs(item.dir, item.nombre);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const tam = fs.statSync(full).size;
        fs.unlinkSync(full);
        archivos += 1;
        bytes += tam;
      }
    } catch (e) {
      noBorrados.push(item.nombre);
    }
  }

  avisar({ pct: 100, paso: 6, etapa: 'Listo' });
  return {
    ...antes,
    borrados: { publicaciones, chat, notificaciones, auditoria, archivos, bytes },
    no_borrados: noBorrados,
  };
}

const trabajos = new Map();

function iniciar(colegioId, anio) {
  for (const job of trabajos.values()) {
    if (job.colegioId === colegioId && !job.listo) {
      const err = new Error('Ya hay una limpieza en curso.');
      err.status = 409;
      throw err;
    }
  }
  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    id,
    colegioId,
    anio: parseInt(anio, 10),
    pct: 0,
    paso: 0,
    etapa: 'Preparando…',
    listo: false,
    error: '',
    resultado: null,
  };
  trabajos.set(id, job);
  ejecutar(colegioId, anio, (parcial) => Object.assign(job, parcial))
    .then((resultado) => {
      job.listo = true;
      job.pct = 100;
      job.paso = 6;
      job.etapa = 'Listo';
      job.resultado = resultado;
    })
    .catch((e) => {
      job.listo = true;
      job.error = e.message || 'No se pudo limpiar el año.';
      job.etapa = job.error;
    });
  setTimeout(() => trabajos.delete(id), 30 * 60 * 1000);
  return { id: job.id, pct: job.pct, etapa: job.etapa, paso: job.paso };
}

function verTrabajo(id, colegioId) {
  const job = trabajos.get(String(id || ''));
  if (!job || job.colegioId !== colegioId) return null;
  return {
    id: job.id,
    pct: job.pct,
    paso: job.paso,
    etapa: job.etapa,
    listo: job.listo,
    error: job.error,
    resultado: job.listo ? job.resultado : null,
  };
}

module.exports = { resumen, ejecutar, anioValido, iniciar, verTrabajo };
