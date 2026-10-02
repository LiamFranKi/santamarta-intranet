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

function rutaArchivoSegura(dir, nombre) {
  const full = joinStaticFs(dir, nombre);
  const relativo = path.relative(joinStaticFs(), full);
  if (!nombre || relativo.startsWith('..') || path.isAbsolute(relativo)) return '';
  return full;
}

async function listarArchivosAnio(colegioId, anio, avisar = () => {}) {
  const [desde, hasta] = rangoAnio(anio);
  const candidatos = new Map();
  let ultimo = 0;
  let filas = 0;
  try {
    for (;;) {
      const lote = await query(
        `SELECT id, images, archivos FROM publicaciones
         WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ? AND id > ?
         ORDER BY id
         LIMIT 200`,
        [colegioId, desde, hasta, ultimo]
      );
      if (!lote?.length) break;
      filas += lote.length;
      for (const row of lote) {
        ultimo = Number(row.id) || ultimo;
        const { fotos, adjuntos } = archivosDePublicacion(row.images, row.archivos);
        for (const nombre of fotos) candidatos.set(`p:${nombre}`, { nombre, dir: DIR_PUBLICACIONES });
        for (const nombre of adjuntos) candidatos.set(`a:${nombre}`, { nombre, dir: DIR_ARCHIVOS });
      }
      avisar({ pct: 10, paso: 0, etapa: `Leyendo publicaciones (${filas})…` });
    }
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146) {
      return [];
    }
    throw e;
  }
  return [...candidatos.values()].filter((item) => rutaArchivoSegura(item.dir, item.nombre));
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
  const [publicaciones, chat, notificaciones, auditoria] = await Promise.all([
    contar(
      `SELECT COUNT(*) AS n FROM publicaciones
       WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
      [colegioId, desde, hasta]
    ),
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
       INNER JOIN usuarios dest ON dest.id = n.destinatario_id
       WHERE dest.colegio_id = ? AND n.fecha_hora >= ? AND n.fecha_hora < ?`,
      [colegioId, desde, hasta]
    ),
    contar(
      `SELECT COUNT(*) AS n FROM auditoria_logs
       WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
      [colegioId, desde, hasta]
    ),
  ]);
  return {
    anio: parseInt(anio, 10),
    anio_activo: anioActivo,
    publicaciones,
    chat,
    notificaciones,
    auditoria,
  };
}

async function ejecutar(colegioId, anio, avisar = () => {}) {
  avisar({ pct: 6, paso: 0, etapa: 'Revisando qué se va a borrar…' });
  const antes = await resumen(colegioId, anio);
  const [desde, hasta] = rangoAnio(anio);

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
  avisar({ pct: 64, paso: 4, etapa: 'Buscando fotos de esas publicaciones…' });
  const plan = await listarArchivosAnio(colegioId, anio, avisar);
  avisar({ pct: 70, paso: 4, etapa: 'Borrando publicaciones…' });
  const publicaciones = await borrarSql(
    `DELETE FROM publicaciones
     WHERE colegio_id = ? AND fecha_hora >= ? AND fecha_hora < ?`,
    [colegioId, desde, hasta]
  );

  let archivos = 0;
  let bytes = 0;
  const noBorrados = [];
  const totalArchivos = plan.length;
  avisar({ pct: 78, paso: 5, etapa: totalArchivos ? 'Borrando fotos del disco…' : 'No hay fotos que borrar…' });
  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    if (i % 8 === 0 || i === plan.length - 1) {
      const avance = totalArchivos ? Math.round((i / totalArchivos) * 18) : 18;
      avisar({ pct: 78 + avance, paso: 5, etapa: `Borrando fotos ${i + 1} de ${totalArchivos}…` });
    }
    const full = rutaArchivoSegura(item.dir, item.nombre);
    if (!full) continue;
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
