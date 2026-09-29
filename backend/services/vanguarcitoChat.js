/**
 * Chat de texto. No genera imágenes ni videos.
 * PDF, Excel y Word salen del texto ya respondido y no gastan una pregunta.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const ExcelJS = require('exceljs');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { query, execute } = require('../utils/mysql');
const { leerMascota } = require('../utils/mascotaColegio');
const { leerIdentidadColegio } = require('../utils/identidadColegio');
const { geminiDisponible, modelosAProbar } = require('./fichasIa/geminiFichaService');
const { htmlStringToPdf } = require('./fichasIa/renderFichaPdf');
const { moduloActivo } = require('../utils/modulosSistema');

const ILIMITADOS = new Set(['ADMINISTRADOR', 'PROMOTORIA']);
const DENEGADOS = new Set(['APODERADO', 'KIOSCO', 'ASISTENCIA']);

function fechaLima(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function perfilDe(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (DENEGADOS.has(t)) return null;
  if (ILIMITADOS.has(t)) return 'ilimitado';
  if (t === 'ALUMNO') return 'alumno';
  if (t === 'DOCENTE') return 'docente';
  return 'personal';
}

function cupoDe(perfil, mascota) {
  if (perfil === 'ilimitado') return null;
  if (perfil === 'alumno') return mascota.preguntas_alumno;
  if (perfil === 'docente') return mascota.preguntas_docente;
  return mascota.preguntas_personal;
}

function pideMedioVisual(texto) {
  const t = String(texto || '');
  const cosa = /\b(im[aá]gen(?:es)?|foto|dibujo|ilustraci[oó]n|video|v[ií]deo|gif|png|jpg)\b/i.test(t);
  const accion = /\b(genera|generar|crea|crear|dibuja|dibujar|pinta|pintar|hazme|graba|grabar)\b/i.test(t);
  return cosa && accion;
}

async function usadasHoy(colegioId, usuarioId) {
  const rows = await query(
    `SELECT usadas FROM vanguarcito_uso WHERE colegio_id = ? AND usuario_id = ? AND fecha = ? LIMIT 1`,
    [colegioId, usuarioId, fechaLima()]
  );
  return Number(rows?.[0]?.usadas) || 0;
}

async function sumarUso(colegioId, usuarioId) {
  const fecha = fechaLima();
  const upd = await execute(
    `UPDATE vanguarcito_uso SET usadas = usadas + 1 WHERE colegio_id = ? AND usuario_id = ? AND fecha = ?`,
    [colegioId, usuarioId, fecha]
  );
  if (upd?.affectedRows) return usadasHoy(colegioId, usuarioId);
  try {
    await execute(
      `INSERT INTO vanguarcito_uso (colegio_id, usuario_id, fecha, usadas) VALUES (?, ?, ?, 1)`,
      [colegioId, usuarioId, fecha]
    );
  } catch (e) {
    if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062) throw e;
    await execute(
      `UPDATE vanguarcito_uso SET usadas = usadas + 1 WHERE colegio_id = ? AND usuario_id = ? AND fecha = ?`,
      [colegioId, usuarioId, fecha]
    );
  }
  return usadasHoy(colegioId, usuarioId);
}

async function listarMensajes(colegioId, usuarioId, limite = 40) {
  const n = Math.min(80, Math.max(1, Number(limite) || 40));
  const rows = await query(
    `SELECT id, rol, texto, creado_en FROM vanguarcito_mensaje
     WHERE colegio_id = ? AND usuario_id = ?
     ORDER BY id DESC LIMIT ${n}`,
    [colegioId, usuarioId]
  );
  return (rows || []).reverse().map((r) => ({
    id: r.id,
    rol: r.rol === 'modelo' ? 'modelo' : 'usuario',
    texto: String(r.texto || ''),
    creado_en: r.creado_en,
  }));
}

async function guardarMensaje(colegioId, usuarioId, rol, texto) {
  const ins = await execute(
    `INSERT INTO vanguarcito_mensaje (colegio_id, usuario_id, rol, texto, creado_en) VALUES (?, ?, ?, ?, NOW())`,
    [colegioId, usuarioId, rol, String(texto || '').slice(0, 20000)]
  );
  return ins?.insertId || null;
}

async function estadoChat(user) {
  const colegioId = Number(user.colegio_id) || 1;
  const usuarioId = Number(user.usuario_id);
  const perfil = perfilDe(user.tipo);
  const mascota = await leerMascota(colegioId);
  const identidad = await leerIdentidadColegio(colegioId).catch(() => null);
  if (!perfil) {
    return { permitido: false, nombre: mascota.nombre, imagen_url: mascota.imagen_url };
  }
  const cupo = cupoDe(perfil, mascota);
  const usadas = perfil === 'ilimitado' ? 0 : await usadasHoy(colegioId, usuarioId);
  const mensajes = await listarMensajes(colegioId, usuarioId);
  return {
    permitido: true,
    disponible: geminiDisponible(),
    nombre: mascota.nombre,
    imagen_url: mascota.imagen_url,
    colegio: identidad?.titulo || 'el colegio',
    perfil,
    ilimitado: perfil === 'ilimitado',
    cupo,
    usadas: perfil === 'ilimitado' ? null : usadas,
    restantes: perfil === 'ilimitado' ? null : Math.max(0, cupo - usadas),
    mensajes,
  };
}

async function llamarTexto(apiKey, modelo, contents) {
  const body = {
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await axios.post(url, body, {
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
  });
  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

async function responder(user, texto) {
  const colegioId = Number(user.colegio_id) || 1;
  const usuarioId = Number(user.usuario_id);
  const perfil = perfilDe(user.tipo);
  if (!perfil) {
    const e = new Error('Este perfil no usa el asistente.');
    e.status = 403;
    throw e;
  }
  if (!(await moduloActivo('herramientas.vanguarcito'))) {
    const e = new Error('El asistente está apagado.');
    e.status = 403;
    throw e;
  }
  const pregunta = String(texto || '').trim();
  if (pregunta.length < 2) {
    const e = new Error('Escriba una pregunta.');
    e.status = 400;
    throw e;
  }
  if (pregunta.length > 2000) {
    const e = new Error('La pregunta es demasiado larga.');
    e.status = 400;
    throw e;
  }

  const mascota = await leerMascota(colegioId);
  const identidad = await leerIdentidadColegio(colegioId).catch(() => null);
  const cupo = cupoDe(perfil, mascota);
  const usadas = perfil === 'ilimitado' ? 0 : await usadasHoy(colegioId, usuarioId);
  if (cupo != null && usadas >= cupo) {
    const e = new Error(`Hoy ya usó sus ${cupo} preguntas. Mañana vuelven a empezar.`);
    e.status = 429;
    throw e;
  }

  const nombre = mascota.nombre;
  let respuesta;
  if (pideMedioVisual(pregunta)) {
    respuesta = `${nombre} solo responde con texto. No crea imágenes ni videos. Si le sirve, puede bajar esta explicación en PDF, Excel o Word.`;
  } else {
    if (!geminiDisponible()) {
      const e = new Error('La IA no está activada en el servidor.');
      e.status = 503;
      throw e;
    }
    const previos = await listarMensajes(colegioId, usuarioId, 8);
    const contents = [
      {
        role: 'user',
        parts: [{
          text: `Eres ${nombre}, asistente de texto del colegio ${identidad?.titulo || 'el colegio'}, en Perú.
Hablas con un ${perfil === 'alumno' ? 'alumno' : perfil === 'docente' ? 'docente' : perfil === 'personal' ? 'trabajador del colegio' : 'administrador'}.
Responde en español, claro y breve. Usa listas cuando ayuden.
No generes imágenes, videos, dibujos ni enlaces a archivos multimedia. Si te piden eso, di que solo das texto y que pueden descargar la respuesta en PDF, Excel o Word.
No inventes notas, deudas, asistencias ni datos privados. Si no tienes el dato, dilo.
Responde solo el mensaje útil, sin presentarte en cada respuesta.`,
        }],
      },
      {
        role: 'model',
        parts: [{ text: `Entendido. Soy ${nombre} y respondo solo con texto.` }],
      },
    ];
    for (const m of previos) {
      contents.push({
        role: m.rol === 'modelo' ? 'model' : 'user',
        parts: [{ text: m.texto.slice(0, 4000) }],
      });
    }
    contents.push({ role: 'user', parts: [{ text: pregunta }] });

    const apiKey = String(process.env.GOOGLE_AI_API_KEY || '').trim();
    const modelos = modelosAProbar().slice(0, 2);
    let ultimo;
    for (const modelo of modelos) {
      try {
        respuesta = await llamarTexto(apiKey, modelo, contents);
        if (respuesta) break;
      } catch (err) {
        ultimo = err;
        if (err.response?.status !== 404 && err.response?.status !== 400) break;
      }
    }
    if (!respuesta) {
      const e = new Error('La IA no pudo responder ahora. Intente de nuevo en un momento.');
      e.status = 502;
      e.causa = ultimo?.response?.data?.error?.message || ultimo?.message;
      throw e;
    }
  }

  await guardarMensaje(colegioId, usuarioId, 'usuario', pregunta);
  const idRespuesta = await guardarMensaje(colegioId, usuarioId, 'modelo', respuesta);
  let usadasNuevas = usadas;
  if (cupo != null && !pideMedioVisual(pregunta)) {
    usadasNuevas = await sumarUso(colegioId, usuarioId);
  }
  return {
    respuesta,
    id: idRespuesta,
    ilimitado: perfil === 'ilimitado',
    cupo,
    usadas: perfil === 'ilimitado' ? null : usadasNuevas,
    restantes: perfil === 'ilimitado' ? null : Math.max(0, cupo - usadasNuevas),
  };
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function htmlRespuesta(nombre, colegio, texto) {
  const cuerpo = esc(texto).replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 28px; }
  h1 { font-size: 20px; color: #047857; margin: 0 0 4px; }
  p.meta { color: #64748b; font-size: 12px; margin: 0 0 16px; }
  .texto { font-size: 14px; line-height: 1.55; }
</style></head><body>
  <h1>${esc(nombre)}</h1>
  <p class="meta">${esc(colegio)} · Respuesta de texto</p>
  <div class="texto">${cuerpo}</div>
</body></html>`;
}

async function archivoPdf(nombre, colegio, texto) {
  const html = htmlRespuesta(nombre, colegio, texto);
  const pdfPath = path.join(os.tmpdir(), `vg-${Date.now()}.pdf`);
  await htmlStringToPdf(html, pdfPath, {
    deviceScaleFactor: 1,
    reutilizar: true,
    waitUntil: 'domcontentloaded',
    preferCSSPageSize: true,
    timeout: 25000,
    margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
  });
  const buffer = fs.readFileSync(pdfPath);
  fs.unlink(pdfPath, () => {});
  return { buffer, mime: 'application/pdf', ext: 'pdf' };
}

async function archivoExcel(nombre, texto) {
  const wb = new ExcelJS.Workbook();
  wb.creator = nombre;
  const ws = wb.addWorksheet('Respuesta');
  ws.columns = [{ header: nombre, key: 'linea', width: 100 }];
  String(texto || '').split(/\n/).forEach((linea) => ws.addRow({ linea }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FF047857' } };
  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

function xml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function archivoWord(nombre, colegio, texto) {
  const parrafos = String(texto || '').split(/\n/).map((linea) => (
    `<w:p><w:r><w:t xml:space="preserve">${xml(linea) || ' '}</w:t></w:r></w:p>`
  )).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xml(nombre)}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xml(colegio)}</w:t></w:r></w:p>
    ${parrafos}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    const zip = archiver('zip', { zlib: { level: 9 } });
    zip.on('error', reject);
    zip.pipe(stream);
    zip.append(contentTypes, { name: '[Content_Types].xml' });
    zip.append(rels, { name: '_rels/.rels' });
    zip.append(documentXml, { name: 'word/document.xml' });
    zip.finalize();
  });
  return {
    buffer,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  };
}

async function exportar(user, texto, formato) {
  const perfil = perfilDe(user.tipo);
  if (!perfil) {
    const e = new Error('Este perfil no usa el asistente.');
    e.status = 403;
    throw e;
  }
  const cuerpo = String(texto || '').trim();
  if (!cuerpo) {
    const e = new Error('No hay texto para descargar.');
    e.status = 400;
    throw e;
  }
  const colegioId = Number(user.colegio_id) || 1;
  const mascota = await leerMascota(colegioId);
  const identidad = await leerIdentidadColegio(colegioId).catch(() => null);
  const colegio = identidad?.titulo || 'Colegio';
  const tipo = String(formato || '').toLowerCase();
  if (tipo === 'pdf') return archivoPdf(mascota.nombre, colegio, cuerpo);
  if (tipo === 'xlsx') return archivoExcel(mascota.nombre, cuerpo);
  if (tipo === 'docx') return archivoWord(mascota.nombre, colegio, cuerpo);
  const e = new Error('Formato no permitido.');
  e.status = 400;
  throw e;
}

module.exports = {
  estadoChat,
  responder,
  exportar,
  perfilDe,
};
