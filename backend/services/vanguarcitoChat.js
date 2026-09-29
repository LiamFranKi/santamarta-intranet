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

function tituloDe(pregunta) {
  const t = String(pregunta || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Chat';
  return t.length > 48 ? `${t.slice(0, 48).trim()}…` : t;
}

let chatListo = null;

function asegurarChat() {
  if (!chatListo) {
    chatListo = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS vanguarcito_conversacion (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          colegio_id INT NOT NULL,
          usuario_id INT NOT NULL,
          titulo VARCHAR(120) NOT NULL DEFAULT 'Chat',
          creado_en DATETIME NOT NULL,
          actualizado_en DATETIME NOT NULL,
          KEY idx_vg_conv (colegio_id, usuario_id, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      const cols = await query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vanguarcito_mensaje' AND COLUMN_NAME = 'conversacion_id'`
      );
      if (!Number(cols?.[0]?.n)) {
        await execute(
          `ALTER TABLE vanguarcito_mensaje
           ADD COLUMN conversacion_id INT NULL,
           ADD KEY idx_vanguarcito_conv (conversacion_id, id)`
        );
      }
      await agruparSueltos();
    })().catch((e) => {
      chatListo = null;
      throw e;
    });
  }
  return chatListo;
}

async function agruparSueltos() {
  const grupos = await query(
    `SELECT colegio_id, usuario_id, MIN(creado_en) AS desde
     FROM vanguarcito_mensaje
     WHERE conversacion_id IS NULL
     GROUP BY colegio_id, usuario_id`
  );
  for (const g of grupos || []) {
    const primero = await query(
      `SELECT texto FROM vanguarcito_mensaje
       WHERE colegio_id = ? AND usuario_id = ? AND conversacion_id IS NULL AND rol = 'usuario'
       ORDER BY id ASC LIMIT 1`,
      [g.colegio_id, g.usuario_id]
    );
    const ins = await execute(
      `INSERT INTO vanguarcito_conversacion (colegio_id, usuario_id, titulo, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, NOW())`,
      [g.colegio_id, g.usuario_id, tituloDe(primero?.[0]?.texto) || 'Chat anterior', g.desde || new Date()]
    );
    await execute(
      `UPDATE vanguarcito_mensaje SET conversacion_id = ?
       WHERE colegio_id = ? AND usuario_id = ? AND conversacion_id IS NULL`,
      [ins.insertId, g.colegio_id, g.usuario_id]
    );
  }
}

async function listarConversaciones(colegioId, usuarioId) {
  const rows = await query(
    `SELECT id, titulo, actualizado_en FROM vanguarcito_conversacion
     WHERE colegio_id = ? AND usuario_id = ?
     ORDER BY actualizado_en DESC, id DESC
     LIMIT 40`,
    [colegioId, usuarioId]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    titulo: String(r.titulo || 'Chat'),
    actualizado_en: r.actualizado_en,
  }));
}

async function conversacionPropia(colegioId, usuarioId, conversacionId) {
  const id = Number(conversacionId);
  if (!id) return null;
  const rows = await query(
    `SELECT id, titulo FROM vanguarcito_conversacion
     WHERE id = ? AND colegio_id = ? AND usuario_id = ? LIMIT 1`,
    [id, colegioId, usuarioId]
  );
  return rows?.[0] || null;
}

async function listarMensajes(colegioId, usuarioId, conversacionId, limite = 40) {
  const id = Number(conversacionId);
  if (!id) return [];
  const n = Math.min(80, Math.max(1, Number(limite) || 40));
  const rows = await query(
    `SELECT id, rol, texto, creado_en FROM vanguarcito_mensaje
     WHERE colegio_id = ? AND usuario_id = ? AND conversacion_id = ?
     ORDER BY id DESC LIMIT ${n}`,
    [colegioId, usuarioId, id]
  );
  return (rows || []).reverse().map((r) => ({
    id: r.id,
    rol: r.rol === 'modelo' ? 'modelo' : 'usuario',
    texto: String(r.texto || ''),
    creado_en: r.creado_en,
  }));
}

async function guardarMensaje(colegioId, usuarioId, conversacionId, rol, texto) {
  const ins = await execute(
    `INSERT INTO vanguarcito_mensaje (colegio_id, usuario_id, conversacion_id, rol, texto, creado_en)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [colegioId, usuarioId, conversacionId, rol, String(texto || '').slice(0, 20000)]
  );
  await execute(
    `UPDATE vanguarcito_conversacion SET actualizado_en = NOW() WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
    [conversacionId, colegioId, usuarioId]
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
  await asegurarChat();
  const cupo = cupoDe(perfil, mascota);
  const usadas = perfil === 'ilimitado' ? 0 : await usadasHoy(colegioId, usuarioId);
  const conversaciones = await listarConversaciones(colegioId, usuarioId);
  const abierta = conversaciones[0] || null;
  const mensajes = abierta ? await listarMensajes(colegioId, usuarioId, abierta.id) : [];
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
    conversacion_id: abierta?.id || null,
    titulo: abierta?.titulo || '',
    conversaciones,
    mensajes,
  };
}

async function abrirConversacion(user, conversacionId) {
  const colegioId = Number(user.colegio_id) || 1;
  const usuarioId = Number(user.usuario_id);
  if (!perfilDe(user.tipo)) {
    const e = new Error('Este perfil no usa el asistente.');
    e.status = 403;
    throw e;
  }
  await asegurarChat();
  const conv = await conversacionPropia(colegioId, usuarioId, conversacionId);
  if (!conv) {
    const e = new Error('No se encontró esa conversación.');
    e.status = 404;
    throw e;
  }
  return {
    id: conv.id,
    titulo: String(conv.titulo || 'Chat'),
    mensajes: await listarMensajes(colegioId, usuarioId, conv.id),
  };
}

async function renombrarConversacion(user, conversacionId, titulo) {
  const colegioId = Number(user.colegio_id) || 1;
  const usuarioId = Number(user.usuario_id);
  if (!perfilDe(user.tipo)) {
    const e = new Error('Este perfil no usa el asistente.');
    e.status = 403;
    throw e;
  }
  const limpio = String(titulo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (limpio.length < 1) {
    const e = new Error('Escriba un título.');
    e.status = 400;
    throw e;
  }
  await asegurarChat();
  const conv = await conversacionPropia(colegioId, usuarioId, conversacionId);
  if (!conv) {
    const e = new Error('No se encontró esa conversación.');
    e.status = 404;
    throw e;
  }
  await execute(
    `UPDATE vanguarcito_conversacion SET titulo = ? WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
    [limpio, conv.id, colegioId, usuarioId]
  );
  return { id: conv.id, titulo: limpio };
}

async function eliminarConversacion(user, conversacionId) {
  const colegioId = Number(user.colegio_id) || 1;
  const usuarioId = Number(user.usuario_id);
  if (!perfilDe(user.tipo)) {
    const e = new Error('Este perfil no usa el asistente.');
    e.status = 403;
    throw e;
  }
  await asegurarChat();
  const conv = await conversacionPropia(colegioId, usuarioId, conversacionId);
  if (!conv) {
    const e = new Error('No se encontró esa conversación.');
    e.status = 404;
    throw e;
  }
  await execute(
    `DELETE FROM vanguarcito_mensaje WHERE conversacion_id = ? AND colegio_id = ? AND usuario_id = ?`,
    [conv.id, colegioId, usuarioId]
  );
  await execute(
    `DELETE FROM vanguarcito_conversacion WHERE id = ? AND colegio_id = ? AND usuario_id = ?`,
    [conv.id, colegioId, usuarioId]
  );
  return { ok: true };
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

async function responder(user, texto, conversacionId) {
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
  await asegurarChat();
  let conv = await conversacionPropia(colegioId, usuarioId, conversacionId);
  if (conversacionId && !conv) {
    const e = new Error('No se encontró esa conversación.');
    e.status = 404;
    throw e;
  }
  let respuesta;
  if (pideMedioVisual(pregunta)) {
    respuesta = `${nombre} solo responde con texto. No crea imágenes ni videos. Si le sirve, puede bajar esta explicación en PDF, Excel o Word.`;
  } else {
    if (!geminiDisponible()) {
      const e = new Error('La IA no está activada en el servidor.');
      e.status = 503;
      throw e;
    }
    const previos = conv ? await listarMensajes(colegioId, usuarioId, conv.id, 8) : [];
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

  if (!conv) {
    const ins = await execute(
      `INSERT INTO vanguarcito_conversacion (colegio_id, usuario_id, titulo, creado_en, actualizado_en)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [colegioId, usuarioId, tituloDe(pregunta)]
    );
    conv = { id: ins.insertId, titulo: tituloDe(pregunta) };
  }
  await guardarMensaje(colegioId, usuarioId, conv.id, 'usuario', pregunta);
  const idRespuesta = await guardarMensaje(colegioId, usuarioId, conv.id, 'modelo', respuesta);
  let usadasNuevas = usadas;
  if (cupo != null && !pideMedioVisual(pregunta)) {
    usadasNuevas = await sumarUso(colegioId, usuarioId);
  }
  return {
    respuesta,
    id: idRespuesta,
    conversacion_id: conv.id,
    titulo: String(conv.titulo || tituloDe(pregunta)),
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

function fechaLegible() {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function bloquesTexto(texto) {
  const out = [];
  let buf = [];
  let lista = null;
  const flushP = () => {
    if (!buf.length) return;
    out.push({ tipo: 'p', texto: buf.join(' ') });
    buf = [];
  };
  const flushL = () => {
    if (!lista) return;
    out.push(lista);
    lista = null;
  };
  for (const raw of String(texto || '').split(/\n/)) {
    const linea = raw.trim();
    if (!linea) {
      flushP();
      flushL();
      continue;
    }
    const num = linea.match(/^\d+[.)]\s+(.*)$/);
    const bull = linea.match(/^[-*•]\s+(.*)$/);
    if (num) {
      flushP();
      if (!lista || lista.tipo !== 'ol') {
        flushL();
        lista = { tipo: 'ol', items: [] };
      }
      lista.items.push(num[1]);
      continue;
    }
    if (bull) {
      flushP();
      if (!lista || lista.tipo !== 'ul') {
        flushL();
        lista = { tipo: 'ul', items: [] };
      }
      lista.items.push(bull[1]);
      continue;
    }
    flushL();
    buf.push(linea);
  }
  flushP();
  flushL();
  return out.length ? out : [{ tipo: 'p', texto: String(texto || '') }];
}

function inlineHtml(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function htmlRespuesta(nombre, colegio, texto) {
  const partes = bloquesTexto(texto).map((b) => {
    if (b.tipo === 'ul' || b.tipo === 'ol') {
      const tag = b.tipo;
      const items = b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    return `<p>${inlineHtml(b.texto)}</p>`;
  }).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; }
  header { background: #ecfdf5; border-bottom: 4px solid #059669; padding: 22px 28px 16px; }
  h1 { font-size: 22px; color: #065f46; margin: 0 0 4px; }
  p.meta { color: #475569; font-size: 12px; margin: 0; }
  article { padding: 8px 28px 20px; font-size: 14px; line-height: 1.6; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 1.2rem; }
  li { margin: 0 0 4px; }
  strong { color: #065f46; }
  footer { margin: 8px 28px 0; padding-top: 10px; border-top: 1px solid #a7f3d0; color: #64748b; font-size: 11px; }
</style></head><body>
  <header>
    <h1>${esc(nombre)}</h1>
    <p class="meta">${esc(colegio)} · ${esc(fechaLegible())}</p>
  </header>
  <article>${partes}</article>
  <footer>${esc(nombre)} · ${esc(colegio)}</footer>
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

function richDe(linea) {
  const partes = String(linea || '').split(/(\*\*.+?\*\*)/g).filter((p) => p !== '');
  return {
    richText: partes.map((p) => {
      const fuerte = p.startsWith('**') && p.endsWith('**') && p.length > 4;
      const text = fuerte ? p.slice(2, -2) : p;
      return {
        text,
        font: fuerte
          ? { bold: true, size: 12, color: { argb: 'FF065F46' }, name: 'Calibri' }
          : { size: 12, color: { argb: 'FF0F172A' }, name: 'Calibri' },
      };
    }),
  };
}

async function archivoExcel(nombre, colegio, texto) {
  const wb = new ExcelJS.Workbook();
  wb.creator = nombre;
  const ws = wb.addWorksheet('Respuesta');
  ws.columns = [{ width: 18 }, { width: 88 }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = nombre;
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 28;
  ws.mergeCells('A2:B2');
  ws.getCell('A2').value = `${colegio} · ${fechaLegible()}`;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF065F46' }, name: 'Calibri' };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
  ws.getRow(2).height = 20;
  let fila = 4;
  let par = false;
  for (const b of bloquesTexto(texto)) {
    const lineas = b.tipo === 'p'
      ? [b.texto]
      : b.items.map((it, i) => (b.tipo === 'ol' ? `${i + 1}. ${it}` : `• ${it}`));
    for (const linea of lineas) {
      ws.mergeCells(`A${fila}:B${fila}`);
      const cell = ws.getCell(`A${fila}`);
      cell.value = richDe(linea);
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (par) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ws.getRow(fila).height = 22;
      par = !par;
      fila += 1;
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

function xml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runsWord(linea, base) {
  const partes = String(linea || ' ').split(/(\*\*.+?\*\*)/g).filter((p) => p !== '');
  return (partes.length ? partes : [' ']).map((p) => {
    const fuerte = p.startsWith('**') && p.endsWith('**') && p.length > 4;
    const text = fuerte ? p.slice(2, -2) : p;
    const color = fuerte ? '065F46' : (base.color || '0F172A');
    const bold = fuerte || base.bold ? '<w:b/>' : '';
    return `<w:r><w:rPr>${bold}<w:color w:val="${color}"/><w:sz w:val="${base.sz || '22'}"/><w:szCs w:val="${base.sz || '22'}"/></w:rPr><w:t xml:space="preserve">${xml(text) || ' '}</w:t></w:r>`;
  }).join('');
}

function parrafoWord(linea, base) {
  return `<w:p><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr>${runsWord(linea, base)}</w:p>`;
}

async function archivoWord(nombre, colegio, texto) {
  const cuerpo = bloquesTexto(texto).map((b) => {
    if (b.tipo === 'p') return parrafoWord(b.texto, { sz: '22' });
    return b.items.map((it, i) => parrafoWord(b.tipo === 'ol' ? `${i + 1}. ${it}` : `• ${it}`, { sz: '22' })).join('');
  }).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${parrafoWord(nombre, { bold: true, color: '065F46', sz: '36' })}
    ${parrafoWord(`${colegio} · ${fechaLegible()}`, { color: '475569', sz: '20' })}
    ${cuerpo}
    ${parrafoWord(`${nombre} · ${colegio}`, { color: '64748B', sz: '18' })}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1008" w:right="1008" w:bottom="1008" w:left="1008"/></w:sectPr>
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
  if (tipo === 'xlsx') return archivoExcel(mascota.nombre, colegio, cuerpo);
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
  abrirConversacion,
  renombrarConversacion,
  eliminarConversacion,
};
