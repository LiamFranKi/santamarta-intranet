const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('./mysql');
const { getColegioData } = require('./colegio');
const { cargarCorte } = require('./cnebAuxiliar');
const { cargarSesion } = require('./cnebSesionStore');

const ESCALA = [
  {
    letra: 'AD',
    titulo: 'Logro destacado',
    texto: 'Evidencia un nivel superior a lo esperado respecto a la competencia.',
  },
  {
    letra: 'A',
    titulo: 'Logro esperado',
    texto: 'Evidencia el nivel esperado, con manejo satisfactorio y en el tiempo previsto.',
  },
  {
    letra: 'B',
    titulo: 'En proceso',
    texto: 'Está próximo al nivel esperado; requiere acompañamiento por un tiempo razonable.',
  },
  {
    letra: 'C',
    titulo: 'En inicio',
    texto: 'Muestra progreso mínimo; necesita más tiempo de acompañamiento e intervención.',
  },
];

const COLOR = {
  ink: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
  teal: '#0f766e',
  tealBg: '#f0fdfa',
  red: '#C8102E',
  head: '#ecfdf5',
  AD: '#047857',
  A: '#047857',
  B: '#b45309',
  C: '#b91c1c',
};

function logoColegioPath() {
  const dir = path.join(__dirname, '..', 'public', 'assets', 'logos');
  for (const name of ['logo.png', 'logo-default.png']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function logoMineduPath() {
  const p = path.join(__dirname, '..', 'public', 'assets', 'logos', 'minedu.png');
  return fs.existsSync(p) ? p : null;
}

function pdfToBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 28,
      info: { Title: 'Informe CNEB', Author: 'Intranet Vanguard' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

function etiquetaNivel(nivel) {
  if (nivel === 'PRIMARIA') return 'Primaria';
  if (nivel === 'SECUNDARIA') return 'Secundaria';
  return 'Inicial';
}

function aulaLabel(grupo) {
  if (!grupo) return '';
  return [grupo.grado != null ? `${grupo.grado}` : '', grupo.seccion || ''].filter(Boolean).join(' ') || `Aula ${grupo.id}`;
}

function bimRoman(b) {
  return ['I', 'II', 'III', 'IV'][Math.max(1, Math.min(4, Number(b) || 4)) - 1];
}

function dibujarSelloMinedu(doc, x, y, w, h) {
  const logo = logoMineduPath();
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [w, h], align: 'right', valign: 'center' });
      return;
    } catch {
      /* sello dibujado */
    }
  }
  doc.save();
  doc.roundedRect(x, y, w, h, 4).fillAndStroke('#fff', COLOR.red);
  const band = 7;
  doc.rect(x + 1, y + 1, band, h - 2).fill(COLOR.red);
  doc.rect(x + 1 + band, y + 1, band, h - 2).fill('#fff');
  doc.rect(x + 1 + band * 2, y + 1, band, h - 2).fill(COLOR.red);
  const tx = x + band * 3 + 8;
  doc.fillColor(COLOR.red).font('Helvetica-Bold').fontSize(9).text('MINEDU', tx, y + 8, { width: w - band * 3 - 12 });
  doc.fillColor(COLOR.ink).font('Helvetica').fontSize(7).text('Currículo Nacional\nCNEB', tx, y + 20, {
    width: w - band * 3 - 12,
    lineGap: 1,
  });
  doc.restore();
}

function dibujarMembrete(doc, { colegioNombre, subtitulo, tituloOficial }) {
  const pageW = doc.page.width;
  const left = 28;
  const top = 22;
  const logo = logoColegioPath();
  if (logo) {
    try {
      doc.image(logo, left, top, { fit: [78, 36], valign: 'center' });
    } catch {
      /* sin logo */
    }
  }
  dibujarSelloMinedu(doc, pageW - 28 - 148, top - 2, 148, 40);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10).text(String(colegioNombre || 'Institución educativa').toUpperCase(), left + 84, top, {
    width: pageW - 270,
    align: 'center',
  });
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(8.5).text(
    tituloOficial || 'INFORME DE PROGRESO DEL ESTUDIANTE',
    left + 84,
    top + 14,
    {
      width: pageW - 270,
      align: 'center',
    }
  );
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(subtitulo || '', left + 84, top + 26, {
    width: pageW - 270,
    align: 'center',
  });
  doc.moveTo(left, top + 42).lineTo(pageW - 28, top + 42).strokeColor(COLOR.teal).lineWidth(1.1).stroke();
  return top + 48;
}

function ensure(doc, y, need) {
  if (y + need < doc.page.height - 42) return y;
  doc.addPage();
  return 36;
}

function letraColor(letra) {
  const u = String(letra || '').toUpperCase();
  if (u === 'AD' || u === 'A') return COLOR.AD;
  if (u === 'B') return COLOR.B;
  if (u === 'C') return COLOR.C;
  return COLOR.muted;
}

function filaDato(doc, y, label, value, x, w) {
  doc.rect(x, y, 42, 16).fillAndStroke(COLOR.head, COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(6.5).text(label, x + 2, y + 5, { width: 38 });
  doc.rect(x + 42, y, w - 42, 16).fillAndStroke('#fff', COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica').fontSize(8).text(String(value || '—'), x + 46, y + 4, { width: w - 50 });
}

function dibujarEscala(doc, y, inner) {
  const colW = inner / 4;
  ESCALA.forEach((e, i) => {
    const x = 28 + i * colW;
    doc.rect(x, y, colW, 26).fillAndStroke(i % 2 === 0 ? COLOR.head : '#fff', COLOR.line);
    doc.fillColor(letraColor(e.letra)).font('Helvetica-Bold').fontSize(8).text(e.letra, x + 4, y + 3, {
      width: 22,
    });
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(6.5).text(e.titulo, x + 26, y + 4, {
      width: colW - 32,
    });
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(5.6).text(e.texto, x + 4, y + 13, {
      width: colW - 8,
      height: 12,
      ellipsis: true,
    });
  });
  return y + 28;
}

function dibujarFirmas(doc, y, inner) {
  const w = (inner - 16) / 3;
  ['Docente / tutor', 'Dirección', 'Padre / madre / apoderado'].forEach((t, i) => {
    const x = 28 + i * (w + 8);
    doc.moveTo(x, y + 18).lineTo(x + w, y + 18).strokeColor(COLOR.line).lineWidth(0.7).stroke();
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text(t, x, y + 21, { width: w, align: 'center' });
  });
  return y + 34;
}

function agruparAreas(competencias) {
  const map = new Map();
  (competencias || []).forEach((c) => {
    const key = c.area_nombre || 'Área';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  return [...map.entries()];
}

function conclusionAlumno(valores, matriculaId) {
  const texts = (valores || [])
    .filter((v) => Number(v.matricula_id) === Number(matriculaId) && String(v.conclusion || '').trim())
    .map((v) => String(v.conclusion).trim());
  return [...new Set(texts)].join(' ');
}

async function metaGrupo(cid, grupoId) {
  const [g] = await query(
    `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
    [grupoId, cid]
  );
  return g || null;
}

function dibujarAlumnoInforme(doc, { alumno, competencias, valores, meta, startY }) {
  let y = startY;
  const pageW = doc.page.width;
  const inner = pageW - 56;
  const map = new Map();
  (valores || []).forEach((v) => map.set(`${v.matricula_id}_${v.competencia_id}`, v));

  filaDato(doc, y, 'ESTUDIANTE', alumno.nombre, 28, inner * 0.68);
  filaDato(doc, y, 'DNI', alumno.dni || '—', 28 + inner * 0.68, inner * 0.32);
  y += 16;
  filaDato(doc, y, 'AULA', aulaLabel(meta.grupo), 28, inner * 0.34);
  filaDato(doc, y, 'NIVEL', etiquetaNivel(meta.nivel), 28 + inner * 0.34, inner * 0.34);
  filaDato(doc, y, 'PERIODO', `${bimRoman(meta.bimestre)} bimestre · ${meta.anio}`, 28 + inner * 0.68, inner * 0.32);
  y += 20;

  const areas = agruparAreas(competencias);
  const pieFijo = 92;
  const usable = doc.page.height - y - pieFijo;
  const nRows = areas.reduce((acc, [, comps]) => acc + 1 + comps.length, 0) + 2;
  const rowH = Math.max(11, Math.min(14, Math.floor(usable / Math.max(8, nRows))));

  areas.forEach(([area, comps]) => {
    doc.rect(28, y, inner, rowH).fillAndStroke(COLOR.teal, COLOR.teal);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7).text(area.toUpperCase(), 32, y + 2.5, {
      width: inner - 8,
      height: rowH - 3,
      ellipsis: true,
      lineBreak: false,
    });
    y += rowH;
    comps.forEach((c, i) => {
      const bg = i % 2 === 0 ? '#fff' : COLOR.tealBg;
      const v = map.get(`${alumno.matricula_id}_${c.id}`);
      const letra = v?.letra || '—';
      doc.rect(28, y, inner - 32, rowH).fillAndStroke(bg, COLOR.line);
      doc.rect(28 + inner - 32, y, 32, rowH).fillAndStroke('#fff', COLOR.line);
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(7).text(c.nombre, 32, y + 2.5, {
        width: inner - 42,
        height: rowH - 3,
        ellipsis: true,
        lineBreak: false,
      });
      doc.fillColor(letraColor(letra)).font('Helvetica-Bold').fontSize(8).text(letra, 28 + inner - 32, y + 2, {
        width: 32,
        align: 'center',
      });
      y += rowH;
    });
  });

  const conc = conclusionAlumno(valores, alumno.matricula_id);
  y += 6;
  doc.rect(28, y, inner, 11).fillAndStroke(COLOR.head, COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(7).text('Conclusión descriptiva del periodo', 32, y + 2.5);
  y += 11;
  const concH = 22;
  doc.rect(28, y, inner, concH).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text(conc || 'Sin conclusión descriptiva registrada.', 32, y + 4, {
    width: inner - 8,
    height: concH - 6,
    ellipsis: true,
  });
  y += concH + 8;

  y = dibujarEscala(doc, y, inner);
  y = dibujarFirmas(doc, y + 4, inner);
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(6).text(
    'Documento interno del colegio, alineado al CNEB. El logo MINEDU es referencial y no convierte este archivo en informe oficial de SIAGIE.',
    28,
    doc.page.height - 18,
    { width: inner, align: 'center' }
  );
  return y;
}

async function informePdfBuffer(cid, { anio, bimestre, grupoId, nivel, matriculaId }) {
  const colegio = await getColegioData(cid);
  const grupo = await metaGrupo(cid, grupoId);
  const { alumnos, competencias, valores } = await cargarCorte(cid, { anio, bimestre, grupoId, nivel });
  const lista = matriculaId
    ? (alumnos || []).filter((a) => Number(a.matricula_id) === Number(matriculaId))
    : alumnos || [];
  if (!lista.length) {
    const e = new Error('No hay estudiantes para el informe.');
    e.code = 'CNEB_SIN_ALUMNOS';
    throw e;
  }
  const meta = { anio, bimestre, nivel, grupo };
  const subtitulo = `${etiquetaNivel(nivel)} · ${aulaLabel(grupo)} · Bimestre ${bimRoman(bimestre)} · ${anio}`;
  const buf = await pdfToBuffer(async (doc) => {
    lista.forEach((al, i) => {
      if (i > 0) doc.addPage();
      const startY = dibujarMembrete(doc, { colegioNombre: colegio?.nombre, subtitulo });
      dibujarAlumnoInforme(doc, { alumno: al, competencias, valores, meta, startY });
    });
  });
  const who = matriculaId ? `alumno_${matriculaId}` : `aula`;
  return {
    buffer: buf,
    filename: `informe_cneb_${nivel}_${anio}_b${bimestre}_${who}.pdf`,
  };
}

function momentoTitulo(tipo) {
  if (tipo === 'inicio') return 'Inicio';
  if (tipo === 'cierre') return 'Cierre';
  return 'Desarrollo';
}

function textoFichaSesion(ses) {
  const guardada = String(ses?.ficha_estudiante || '').trim();
  if (guardada) return guardada;
  const cotejo = (ses?.cotejo || []).map((c, i) => `${i + 1}. ${c.item}`).join('\n');
  return [
    `Ficha de trabajo — ${ses?.titulo || 'Sesión'}`,
    'Nombre: ____________________    Fecha: __________',
    '',
    '1. Dibuja o escribe lo que hicimos hoy.',
    '2. ¿Qué aprendiste?',
    '3. ¿Qué te resultó fácil o difícil?',
    cotejo ? `\nPara el docente (cotejo):\n${cotejo}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function dibujarFichaPagina(doc, { colegio, ses, grupo, fecha, formato }) {
  const minedu = String(formato || '').toLowerCase() === 'minedu';
  const inner = doc.page.width - 72;
  let y = dibujarMembrete(doc, {
    colegioNombre: colegio?.nombre,
    subtitulo: `${etiquetaNivel(ses.nivel_cneb)} · ${aulaLabel(grupo) || 'Aula'} · ${fecha}`,
    tituloOficial: minedu ? 'FICHA DE APLICACIÓN · CNEB / MINEDU' : 'FICHA DE TRABAJO DEL ESTUDIANTE',
  });
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12).text(ses.titulo || 'Sesión', 36, y, { width: inner });
  y += 18;
  filaDato(doc, y, 'ÁREA', ses.area_nombre || 'Taller interno', 36, inner * 0.5);
  filaDato(doc, y, 'FECHA', fecha, 36 + inner * 0.5, inner * 0.5);
  y += 16;
  filaDato(doc, y, 'COMPET.', ses.competencia_nombre || '—', 36, inner);
  y += 22;
  filaDato(doc, y, 'NOMBRE', '________________________________', 36, inner * 0.62);
  filaDato(doc, y, 'EDAD', '______', 36 + inner * 0.62, inner * 0.38);
  y += 24;
  const texto = textoFichaSesion(ses);
  const th = Math.max(80, doc.heightOfString(texto, { width: inner - 16, fontSize: 10 }) + 16);
  y = ensure(doc, y, Math.min(th, 200));
  doc.rect(36, y, inner, Math.min(th, doc.page.height - y - 90)).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.ink).font('Helvetica').fontSize(10).text(texto, 44, y + 8, {
    width: inner - 16,
  });
  y += Math.min(th, doc.page.height - y - 90) + 16;
  y = ensure(doc, y, 70);
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(
    minedu
      ? 'Evidencia física alineada al CNEB. No reemplaza el informe oficial de SIAGIE ni las notas 0–20.'
      : 'Evidencia del colegio. El docente o el niño completa la ficha; se archiva en el portafolio.',
    36,
    y,
    { width: inner }
  );
  y += 28;
  const w = (inner - 24) / 2;
  doc.moveTo(36, y + 22).lineTo(36 + w, y + 22).strokeColor(COLOR.line).stroke();
  doc.moveTo(36 + w + 24, y + 22).lineTo(36 + inner, y + 22).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text('Estudiante / familia', 36, y + 26, { width: w, align: 'center' });
  doc.text('Docente', 36 + w + 24, y + 26, { width: w, align: 'center' });
}

async function sesionPdfBuffer(cid, sesionId, { parte = 'sesion', formato = 'colegio' } = {}) {
  const ses = await cargarSesion(cid, sesionId);
  if (!ses) return null;
  const colegio = await getColegioData(cid);
  const grupo = ses.grupo_id ? await metaGrupo(cid, ses.grupo_id) : null;
  const fecha = ses.fecha_sesion ? String(ses.fecha_sesion).slice(0, 10) : 'Sin fecha';
  const slug = String(ses.titulo || 'sesion')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  if (String(parte || '').toLowerCase() === 'ficha') {
    const buf = await pdfToBuffer(async (doc) => {
      dibujarFichaPagina(doc, { colegio, ses, grupo, fecha, formato });
    });
    return { buffer: buf, filename: `ficha_cneb_${ses.id}_${slug}.pdf` };
  }
  const subtitulo = `Sesión de aprendizaje · ${etiquetaNivel(ses.nivel_cneb)} · ${ses.duracion_min} min`;
  const buf = await pdfToBuffer(async (doc) => {
    let y = dibujarMembrete(doc, {
      colegioNombre: colegio?.nombre,
      subtitulo,
      tituloOficial: 'SESIÓN DE APRENDIZAJE · CNEB',
    });
    const inner = doc.page.width - 72;
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(13).text(ses.titulo || 'Sesión', 36, y, { width: inner });
    y += 20;
    filaDato(doc, y, 'ÁREA', ses.area_nombre || 'Taller interno', 36, inner * 0.5);
    filaDato(doc, y, 'AULA', aulaLabel(grupo), 36 + inner * 0.5, inner * 0.5);
    y += 16;
    filaDato(doc, y, 'COMPET.', ses.competencia_nombre || '—', 36, inner * 0.5);
    filaDato(doc, y, 'FECHA', fecha, 36 + inner * 0.5, inner * 0.5);
    y += 22;
    if (ses.proposito) {
      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(8).text('PROPÓSITO', 36, y);
      y += 12;
      const ph = doc.heightOfString(ses.proposito, { width: inner, fontSize: 9 }) + 4;
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(9).text(ses.proposito, 36, y, { width: inner });
      y += ph + 8;
    }
    ['inicio', 'desarrollo', 'cierre'].forEach((tipo) => {
      const mins = ses.minutos?.[tipo] ?? 0;
      const texto = ses.momentos?.[tipo] || '—';
      y = ensure(doc, y, 40);
      doc.rect(36, y, inner, 16).fillAndStroke(COLOR.teal, COLOR.teal);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9).text(`${momentoTitulo(tipo)}  ·  ${mins} min`, 42, y + 4);
      y += 18;
      const th = Math.max(24, doc.heightOfString(texto, { width: inner - 8, fontSize: 9 }) + 8);
      y = ensure(doc, y, th);
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(9).text(texto, 40, y, { width: inner - 8 });
      y += th + 8;
    });
    const cotejo = ses.cotejo || [];
    if (cotejo.length) {
      y = ensure(doc, y, 24);
      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(9).text('Lista de cotejo', 36, y);
      y += 14;
      cotejo.forEach((c, i) => {
        y = ensure(doc, y, 16);
        doc.fillColor(COLOR.ink).font('Helvetica').fontSize(8.5).text(`${i + 1}. ${c.item}`, 40, y, { width: inner - 8 });
        y += 14;
      });
    }
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(6.5).text(
      'Para el docente titular o el suplente. No modifica el aula virtual ni las notas 0–20.',
      36,
      doc.page.height - 28,
      { width: inner, align: 'center' }
    );
    if (String(ses.ficha_estudiante || '').trim()) {
      doc.addPage();
      dibujarFichaPagina(doc, { colegio, ses, grupo, fecha, formato });
    }
  });
  return { buffer: buf, filename: `sesion_cneb_${ses.id}_${slug}.pdf` };
}

module.exports = { informePdfBuffer, sesionPdfBuffer };
