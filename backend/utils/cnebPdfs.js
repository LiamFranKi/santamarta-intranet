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

function pdfToBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
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

function dibujarMembrete(doc, { colegioNombre, subtitulo }) {
  const pageW = doc.page.width;
  const left = 36;
  const top = 28;
  const logo = logoColegioPath();
  if (logo) {
    try {
      doc.image(logo, left, top, { fit: [92, 40], valign: 'center' });
    } catch {
      /* sin logo */
    }
  }
  dibujarSelloMinedu(doc, pageW - 36 - 132, top, 132, 42);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(11).text(String(colegioNombre || 'Institución educativa').toUpperCase(), left + 100, top + 2, {
    width: pageW - 280,
    align: 'center',
  });
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(9).text('INFORME DE PROGRESO DEL ESTUDIANTE', left + 100, top + 18, {
    width: pageW - 280,
    align: 'center',
  });
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(subtitulo || '', left + 100, top + 32, {
    width: pageW - 280,
    align: 'center',
  });
  doc.moveTo(left, top + 50).lineTo(pageW - 36, top + 50).strokeColor(COLOR.teal).lineWidth(1.2).stroke();
  return top + 58;
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

function dibujarEscala(doc, y) {
  y = ensure(doc, y, 78);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(8).text('Escala de calificación (CNEB / MINEDU)', 36, y);
  y += 12;
  ESCALA.forEach((e) => {
    doc.fillColor(letraColor(e.letra)).font('Helvetica-Bold').fontSize(8).text(e.letra, 36, y, { width: 18 });
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(7.5).text(e.titulo, 56, y, { width: 90 });
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.muted).text(e.texto, 148, y, { width: 410 });
    y += 14;
  });
  return y + 4;
}

function dibujarFirmas(doc, y) {
  y = ensure(doc, y, 70);
  const w = (doc.page.width - 72 - 24) / 3;
  ['Docente / tutor', 'Dirección', 'Padre / madre / apoderado'].forEach((t, i) => {
    const x = 36 + i * (w + 12);
    doc.moveTo(x, y + 28).lineTo(x + w, y + 28).strokeColor(COLOR.line).lineWidth(0.8).stroke();
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(t, x, y + 32, { width: w, align: 'center' });
  });
  return y + 52;
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
  const inner = pageW - 72;
  const map = new Map();
  (valores || []).forEach((v) => map.set(`${v.matricula_id}_${v.competencia_id}`, v));

  y = ensure(doc, y, 40);
  filaDato(doc, y, 'ESTUDIANTE', alumno.nombre, 36, inner * 0.68);
  filaDato(doc, y, 'DNI', alumno.dni || '—', 36 + inner * 0.68, inner * 0.32);
  y += 16;
  filaDato(doc, y, 'AULA', aulaLabel(meta.grupo), 36, inner * 0.34);
  filaDato(doc, y, 'NIVEL', etiquetaNivel(meta.nivel), 36 + inner * 0.34, inner * 0.34);
  filaDato(doc, y, 'PERIODO', `${bimRoman(meta.bimestre)} bimestre · ${meta.anio}`, 36 + inner * 0.68, inner * 0.32);
  y += 24;

  const areas = agruparAreas(competencias);
  areas.forEach(([area, comps]) => {
    y = ensure(doc, y, 22 + comps.length * 16);
    doc.rect(36, y, inner, 16).fillAndStroke(COLOR.teal, COLOR.teal);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(area.toUpperCase(), 42, y + 4, { width: inner - 12 });
    y += 16;
    comps.forEach((c, i) => {
      y = ensure(doc, y, 18);
      const bg = i % 2 === 0 ? '#fff' : COLOR.tealBg;
      const v = map.get(`${alumno.matricula_id}_${c.id}`);
      const letra = v?.letra || '—';
      doc.rect(36, y, inner - 36, 16).fillAndStroke(bg, COLOR.line);
      doc.rect(36 + inner - 36, y, 36, 16).fillAndStroke('#fff', COLOR.line);
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(7.5).text(c.nombre, 42, y + 4, { width: inner - 50 });
      doc.fillColor(letraColor(letra)).font('Helvetica-Bold').fontSize(9).text(letra, 36 + inner - 36, y + 4, {
        width: 36,
        align: 'center',
      });
      y += 16;
    });
    y += 6;
  });

  const conc = conclusionAlumno(valores, alumno.matricula_id);
  y = ensure(doc, y, 48);
  doc.rect(36, y, inner, 12).fillAndStroke(COLOR.head, COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(7.5).text('Conclusión descriptiva del periodo', 42, y + 3);
  y += 12;
  const concH = Math.max(28, doc.heightOfString(conc || 'Sin conclusión descriptiva registrada.', { width: inner - 12, fontSize: 8 }) + 10);
  y = ensure(doc, y, concH);
  doc.rect(36, y, inner, concH).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(conc || 'Sin conclusión descriptiva registrada.', 42, y + 6, {
    width: inner - 12,
  });
  y += concH + 10;

  y = dibujarEscala(doc, y);
  y = dibujarFirmas(doc, y);
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(6.5).text(
    'Documento interno del colegio, alineado al CNEB. No reemplaza el informe oficial que genera SIAGIE.',
    36,
    doc.page.height - 28,
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

async function sesionPdfBuffer(cid, sesionId) {
  const ses = await cargarSesion(cid, sesionId);
  if (!ses) return null;
  const colegio = await getColegioData(cid);
  const grupo = ses.grupo_id ? await metaGrupo(cid, ses.grupo_id) : null;
  const fecha = ses.fecha_sesion ? String(ses.fecha_sesion).slice(0, 10) : 'Sin fecha';
  const subtitulo = `Sesión de aprendizaje · ${etiquetaNivel(ses.nivel_cneb)} · ${ses.duracion_min} min`;
  const buf = await pdfToBuffer(async (doc) => {
    let y = dibujarMembrete(doc, { colegioNombre: colegio?.nombre, subtitulo });
    const inner = doc.page.width - 72;
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(13).text(ses.titulo || 'Sesión', 36, y, { width: inner });
    y += 20;
    filaDato(doc, y, 'ÁREA', ses.area_nombre || '—', 36, inner * 0.5);
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
  });
  const slug = String(ses.titulo || 'sesion')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  return { buffer: buf, filename: `sesion_cneb_${ses.id}_${slug}.pdf` };
}

module.exports = { informePdfBuffer, sesionPdfBuffer };
