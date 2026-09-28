const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('./mysql');
const { getColegioData } = require('./colegio');
const { cargarCorte } = require('./cnebAuxiliar');
const { cargarSesion } = require('./cnebSesionStore');
const { listarDesempenosCatalogo } = require('./cnebCatalogoSeed');
const { htmlABloques, htmlATextoPlano } = require('./cnebTextoRico');
const { bufferArchivoPropio, bufferPdfBonito } = require('./cnebMaterialArchivo');
const { DUA_CAT_LABEL, DUA_OPCIONES, leerDua, duaTieneAlgo } = require('./cnebDua');

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
  ADbg: '#d1fae5',
  Bbg: '#fef3c7',
  Cbg: '#fee2e2',
};

const FOOTER_RESERVE = 32;
const PIE_INFORME =
  'Documento interno del colegio, alineado al CNEB. El logo MINEDU es referencial y no sustituye el informe de SIAGIE.';
const PIE_LIBRETA =
  'Libreta del colegio · CNEB. El detalle curricular está en el Informe de progreso. No sustituye SIAGIE.';
const PIE_SESION = 'Para el docente titular o el suplente. No modifica el aula virtual ni las notas 0–20.';
const PIE_FICHA_MINEDU =
  'Ficha de aplicación alineada al CNEB. No reemplaza el informe oficial de SIAGIE ni las notas 0–20.';
const PIE_FICHA_COLEGIO = 'Ficha de trabajo del colegio. El niño dibuja o escribe; se archiva en el portafolio.';
const PIE_TEORIA = 'Texto para leer el tema. No es la ficha de trabajo ni una nota.';

function logoColegioPath() {
  const { rutaLogoColegioSync } = require('./logoColegio');
  return rutaLogoColegioSync();
}

function logoMineduPath() {
  const { rutaLogoVarianteSync } = require('./logoColegio');
  return rutaLogoVarianteSync('logo_minedu');
}

function dibujarLogoMinedu(doc, x, y, w, h) {
  const logo = logoMineduPath();
  if (logo) {
    try {
      const buf = fs.readFileSync(logo);
      doc.image(buf, x, y, { fit: [w, h], align: 'right', valign: 'center' });
      return true;
    } catch {
      try {
        doc.image(logo, x, y, { fit: [w, h], align: 'right', valign: 'center' });
        return true;
      } catch {
        /* sello dibujado */
      }
    }
  }
  return false;
}

function dibujarSelloMinedu(doc, x, y, w, h) {
  if (dibujarLogoMinedu(doc, x, y, w, h)) return;
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
  const top = 18;
  const mineduW = 228;
  const mineduH = 50;
  const logo = logoColegioPath();
  if (logo) {
    try {
      doc.image(logo, left, top, { fit: [72, 50], valign: 'center' });
    } catch {
      /* sin logo */
    }
  }
  dibujarSelloMinedu(doc, pageW - 28 - mineduW, top, mineduW, mineduH);
  const cx = left + 80;
  const cw = pageW - cx - mineduW - 40;
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10).text(
    String(colegioNombre || 'Institución educativa').toUpperCase(),
    cx,
    top + 2,
    { width: cw, align: 'center' }
  );
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(8.5).text(
    tituloOficial || 'INFORME DE PROGRESO DEL ESTUDIANTE',
    cx,
    top + 16,
    { width: cw, align: 'center' }
  );
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(subtitulo || '', cx, top + 30, {
    width: cw,
    align: 'center',
  });
  doc.moveTo(left, top + 56).lineTo(pageW - 28, top + 56).strokeColor(COLOR.teal).lineWidth(1.1).stroke();
  return top + 62;
}

function dibujarPieFijo(doc, texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return;
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const inner = doc.page.width - 56;
  const y = doc.page.height - 18;
  doc.save();
  doc.moveTo(28, y - 6).lineTo(28 + inner, y - 6).strokeColor(COLOR.line).lineWidth(0.4).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(6).text(t, 28, y - 2, {
    width: inner,
    align: 'center',
    lineBreak: false,
    ellipsis: true,
    height: 10,
  });
  doc.restore();
  doc.page.margins.bottom = prevBottom;
}

function pdfToBuffer(build, { title = 'Informe CNEB', pie = null } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 28, left: 28, right: 28, bottom: 0 },
      bufferPages: true,
      info: { Title: title, Author: 'Intranet Vanguard' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc))
      .then(() => {
        if (pie) {
          const range = doc.bufferedPageRange();
          for (let i = 0; i < range.count; i += 1) {
            doc.switchToPage(range.start + i);
            dibujarPieFijo(doc, pie);
          }
        }
        doc.end();
      })
      .catch(reject);
  });
}

function etiquetaNivel(nivel) {
  if (nivel === 'PRIMARIA') return 'Primaria';
  if (nivel === 'SECUNDARIA') return 'Secundaria';
  return 'Inicial';
}

function fechaEs(v) {
  if (!v) return 'Sin fecha';
  const raw = String(v);
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return 'Sin fecha';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${dt.getFullYear()}`;
}

function limpiarEncabezadoFicha(html) {
  return String(html || '')
    .replace(/<p[^>]*>\s*(?:<strong>)?\s*Nombre\s*:?\s*(?:<\/strong>)?[\s_.\-–—]*<\/p>/gi, '')
    .replace(/<p[^>]*>\s*(?:<strong>)?\s*Fecha\s*:?\s*(?:<\/strong>)?[\s_.\-–—]*<\/p>/gi, '')
    .replace(/(?:<br\s*\/?>\s*)?(?:<strong>)?\s*Nombre\s*:?\s*(?:<\/strong>)?\s*[_—\-.]{3,}[^<]*/gi, '')
    .replace(/(?:<br\s*\/?>\s*)?(?:<strong>)?\s*Fecha\s*:?\s*(?:<\/strong>)?\s*[_—\-.]{3,}[^<]*/gi, '');
}

function aulaLabel(grupo) {
  if (!grupo) return '';
  return [grupo.grado != null ? `${grupo.grado}` : '', grupo.seccion || ''].filter(Boolean).join(' ') || `Aula ${grupo.id}`;
}

function bimRoman(b) {
  return ['I', 'II', 'III', 'IV'][Math.max(1, Math.min(4, Number(b) || 4)) - 1];
}

function pageBottom(doc) {
  return doc.page.height - FOOTER_RESERVE;
}

function ensure(doc, y, need) {
  if (y + Math.max(12, need) <= pageBottom(doc)) return y;
  doc.addPage();
  return 36;
}

function letraValida(letra) {
  const u = String(letra || '').trim().toUpperCase();
  return u === 'AD' || u === 'A' || u === 'B' || u === 'C' ? u : '';
}

function letraFondo(letra) {
  const u = letraValida(letra);
  if (u === 'AD' || u === 'A') return COLOR.ADbg;
  if (u === 'B') return COLOR.Bbg;
  if (u === 'C') return COLOR.Cbg;
  return '#fff';
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

function nombresCapacidad(capacidades) {
  return (capacidades || [])
    .map((c) => (typeof c === 'string' ? c : c?.nombre))
    .map((n) => String(n || '').trim())
    .filter(Boolean);
}

function filtrarDesempenos(lista, { nivel, corte }) {
  const all = lista || [];
  if (!Number.isFinite(Number(corte)) || Number(corte) <= 0) return all;
  if (String(nivel || '').toUpperCase() === 'INICIAL') {
    const f = all.filter((d) => Number(d.edad) === Number(corte));
    return f.length ? f : all;
  }
  const f = all.filter((d) => Number(d.grado) === Number(corte));
  return f.length ? f : all;
}

function etiquetaCorte(nivel, corte) {
  if (!Number.isFinite(Number(corte)) || Number(corte) <= 0) return '';
  return String(nivel || '').toUpperCase() === 'INICIAL' ? `${corte} años` : `${corte}.º`;
}

async function cargarMarcoCompetencias(competencias, { nivel, corte }) {
  const list = competencias || [];
  if (!list.length) return [];
  const ids = list.map((c) => c.id);
  const ph = ids.map(() => '?').join(',');
  let capacidades = [];
  let desempenos = [];
  try {
    capacidades = await query(
      `SELECT id, competencia_id, nombre, orden FROM cneb_capacidades
       WHERE competencia_id IN (${ph}) ORDER BY orden ASC, id ASC`,
      ids
    );
  } catch {
    capacidades = [];
  }
  try {
    desempenos = await listarDesempenosCatalogo(ids);
  } catch {
    desempenos = [];
  }
  const capBy = new Map();
  (capacidades || []).forEach((x) => {
    if (!capBy.has(x.competencia_id)) capBy.set(x.competencia_id, []);
    capBy.get(x.competencia_id).push(x);
  });
  const desBy = new Map();
  (desempenos || []).forEach((x) => {
    if (!desBy.has(x.competencia_id)) desBy.set(x.competencia_id, []);
    desBy.get(x.competencia_id).push(x);
  });
  return list.map((c) => ({
    ...c,
    capacidades: capBy.get(c.id) || c.capacidades || [],
    desempenos: filtrarDesempenos(desBy.get(c.id) || c.desempenos || [], { nivel, corte }),
  }));
}

function dibujarTextoFluido(doc, texto, x, y, width, { fontSize = 8, color = COLOR.ink, bold = false } = {}) {
  const t = String(texto || '');
  if (!t) return y;
  doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
  const h = doc.heightOfString(t, { width, lineGap: 1.2 });
  if (y + Math.min(h, fontSize + 4) > pageBottom(doc)) {
    doc.addPage();
    y = 36;
  }
  const maxH = Math.max(fontSize + 2, pageBottom(doc) - y);
  doc.text(t, x, y, { width, lineGap: 1.2, height: maxH });
  return Math.min(doc.y + 2, pageBottom(doc));
}

function dibujarMarcoCneb(doc, y, inner, {
  x = 28,
  competenciaNombre,
  letra = null,
  capacidades,
  estandar,
  desempenos,
  edadLabel,
}) {
  const nombre = String(competenciaNombre || 'Competencia').trim();
  const letraTxt = letraValida(letra);
  const badgeW = letraTxt ? 40 : 0;
  const textW = Math.max(80, inner - 16 - badgeW);
  doc.font('Helvetica-Bold').fontSize(8);
  const textH = doc.heightOfString(nombre, { width: textW, lineGap: 1.4 });
  const headH = Math.max(22, textH + 12);
  y = ensure(doc, y, headH + 8);
  doc.rect(x, y, inner, headH).fill(COLOR.teal);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(nombre, x + 8, y + 6, {
    width: textW,
    lineGap: 1.4,
  });
  if (letraTxt) {
    const bw = 32;
    const bh = 16;
    const bx = x + inner - badgeW + 2;
    const by = y + (headH - bh) / 2;
    doc.roundedRect(bx, by, bw, bh, 3).fill('#fff');
    doc.fillColor(letraColor(letraTxt)).font('Helvetica-Bold').fontSize(9).text(letraTxt, bx, by + 3.5, {
      width: bw,
      align: 'center',
    });
  }
  y += headH + 8;

  y = ensure(doc, y, 16);
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(7.5).text('CAPACIDADES', x, y);
  y += 11;
  const caps = nombresCapacidad(capacidades);
  if (!caps.length) {
    y = dibujarTextoFluido(doc, 'Sin capacidades en el catálogo.', x, y, inner, { color: COLOR.muted });
  } else {
    caps.forEach((n) => {
      y = dibujarTextoFluido(doc, `•  ${n}`, x, y, inner);
    });
  }

  y += 3;
  y = ensure(doc, y, 16);
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(7.5).text('ESTÁNDAR DE APRENDIZAJE', x, y);
  y += 11;
  const est = String(estandar || '').trim();
  if (!est) {
    y = dibujarTextoFluido(doc, 'Sin estándar cargado.', x, y, inner, { color: COLOR.muted });
  } else {
    y = dibujarTextoFluido(doc, est, x, y, inner);
  }

  y += 3;
  y = ensure(doc, y, 16);
  const desTitulo = edadLabel ? `DESEMPEÑOS · ${String(edadLabel).toUpperCase()}` : 'DESEMPEÑOS';
  doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(7.5).text(desTitulo, x, y);
  y += 11;
  const des = desempenos || [];
  if (!des.length) {
    y = dibujarTextoFluido(doc, 'Sin desempeños para esta edad.', x, y, inner, { color: COLOR.muted });
  } else {
    des.forEach((d, i) => {
      y = dibujarTextoFluido(doc, `${i + 1}. ${d.texto || d}`, x, y, inner);
    });
  }
  return y + 8;
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

function dibujarAlumnoInforme(doc, { alumno, competencias, valores, meta, startY, edadLabel }) {
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
  y += 22;

  if (!(competencias || []).length) {
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(
      'En este bimestre todavía no hay competencias trabajadas en sesiones de esta aula.',
      28,
      y,
      { width: inner }
    );
    y += 28;
  }

  agruparAreas(competencias).forEach(([area, comps]) => {
    y = ensure(doc, y, 22);
    doc.rect(28, y, inner, 16).fill(COLOR.teal);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(String(area || 'Área').toUpperCase(), 32, y + 4, {
      width: inner - 8,
      lineBreak: false,
      ellipsis: true,
    });
    y += 20;
    comps.forEach((c) => {
      const v = map.get(`${alumno.matricula_id}_${c.id}`);
      y = dibujarMarcoCneb(doc, y, inner, {
        competenciaNombre: c.nombre,
        letra: v?.letra,
        capacidades: c.capacidades,
        estandar: c.estandar_ciclo,
        desempenos: c.desempenos,
        edadLabel,
      });
    });
  });

  const conc = conclusionAlumno(valores, alumno.matricula_id);
  const concText = conc || 'Sin conclusión descriptiva registrada.';
  y = ensure(doc, y, 48);
  doc.rect(28, y, inner, 14).fillAndStroke(COLOR.head, COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(8).text('Conclusión descriptiva del periodo', 32, y + 3.5);
  y += 14;
  doc.font('Helvetica').fontSize(8);
  const concH = Math.max(28, Math.min(doc.heightOfString(concText, { width: inner - 8 }) + 10, 90));
  y = ensure(doc, y, concH);
  doc.rect(28, y, inner, concH).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(concText, 32, y + 5, {
    width: inner - 8,
    height: concH - 8,
  });
  y += concH + 10;

  y = ensure(doc, y, 72);
  y = dibujarEscala(doc, y, inner);
  y = dibujarFirmas(doc, y + 4, inner);
  return y;
}

function dibujarAlumnoLibreta(doc, { alumno, competencias, valores, meta, startY }) {
  let y = startY;
  const inner = doc.page.width - 56;
  const map = new Map();
  (valores || []).forEach((v) => map.set(`${v.matricula_id}_${v.competencia_id}`, v));

  filaDato(doc, y, 'ESTUDIANTE', alumno.nombre, 28, inner * 0.68);
  filaDato(doc, y, 'DNI', alumno.dni || '—', 28 + inner * 0.68, inner * 0.32);
  y += 16;
  filaDato(doc, y, 'AULA', aulaLabel(meta.grupo), 28, inner * 0.34);
  filaDato(doc, y, 'NIVEL', etiquetaNivel(meta.nivel), 28 + inner * 0.34, inner * 0.34);
  filaDato(doc, y, 'PERIODO', `${bimRoman(meta.bimestre)} bimestre · ${meta.anio}`, 28 + inner * 0.68, inner * 0.32);
  y += 20;
  y = dibujarTextoFluido(
    doc,
    'Resumen del bimestre: nivel de logro por competencia. El detalle (capacidades, estándar y desempeños) está en el Informe de progreso.',
    28,
    y,
    inner,
    { fontSize: 8, color: COLOR.muted }
  );
  y += 10;

  const colLetra = 38;
  const colArea = Math.round(inner * 0.26);
  const colComp = inner - colArea - colLetra;
  const headH = 16;
  y = ensure(doc, y, 40);
  doc.rect(28, y, colArea, headH).fill(COLOR.teal);
  doc.rect(28 + colArea, y, colComp, headH).fill(COLOR.teal);
  doc.rect(28 + colArea + colComp, y, colLetra, headH).fill(COLOR.teal);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('ÁREA', 32, y + 4.5, { width: colArea - 8 });
  doc.text('COMPETENCIA', 32 + colArea, y + 4.5, { width: colComp - 8 });
  doc.text('NL', 28 + colArea + colComp, y + 4.5, { width: colLetra, align: 'center' });
  y += headH;

  agruparAreas(competencias).forEach(([area, comps]) => {
    comps.forEach((c, i) => {
      const letra = letraValida(map.get(`${alumno.matricula_id}_${c.id}`)?.letra);
      const nombre = String(c.nombre || 'Competencia').trim();
      doc.font('Helvetica').fontSize(8);
      const nameH = Math.max(22, doc.heightOfString(nombre, { width: colComp - 10, lineGap: 1.3 }) + 10);
      y = ensure(doc, y, nameH);
      const bg = i % 2 === 0 ? '#fff' : COLOR.tealBg;
      doc.rect(28, y, colArea, nameH).fillAndStroke(bg, COLOR.line);
      doc.rect(28 + colArea, y, colComp, nameH).fillAndStroke(bg, COLOR.line);
      doc.rect(28 + colArea + colComp, y, colLetra, nameH).fillAndStroke(letra ? letraFondo(letra) : bg, COLOR.line);
      doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(7).text(String(area || 'Área'), 32, y + 6, {
        width: colArea - 8,
        lineGap: 1.2,
      });
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(8).text(nombre, 32 + colArea, y + 6, {
        width: colComp - 10,
        lineGap: 1.3,
      });
      if (letra) {
        doc.fillColor(letraColor(letra)).font('Helvetica-Bold').fontSize(11).text(letra, 28 + colArea + colComp, y + nameH / 2 - 5, {
          width: colLetra,
          align: 'center',
        });
      }
      y += nameH;
    });
  });

  const conc = conclusionAlumno(valores, alumno.matricula_id);
  const concText = conc || 'Sin conclusión descriptiva registrada.';
  y += 10;
  y = ensure(doc, y, 48);
  doc.rect(28, y, inner, 14).fillAndStroke(COLOR.head, COLOR.line);
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(8).text('Conclusión descriptiva del periodo', 32, y + 3.5);
  y += 14;
  doc.font('Helvetica').fontSize(8);
  const concH = Math.max(28, Math.min(doc.heightOfString(concText, { width: inner - 8 }) + 10, 80));
  y = ensure(doc, y, concH);
  doc.rect(28, y, inner, concH).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(concText, 32, y + 5, {
    width: inner - 8,
    height: concH - 8,
  });
  y += concH + 10;

  y = ensure(doc, y, 72);
  y = dibujarEscala(doc, y, inner);
  y = dibujarFirmas(doc, y + 4, inner);
  return y;
}

async function cargarDatosPdfCneb(cid, { anio, bimestre, grupoId, nivel, matriculaId }) {
  const colegio = await getColegioData(cid);
  const grupo = await metaGrupo(cid, grupoId);
  const { alumnos, competencias, valores, sesiones } = await cargarCorte(cid, {
    anio,
    bimestre,
    grupoId,
    nivel,
  });
  const idsTrabajadas = new Set(
    (sesiones || [])
      .map((s) => s.competencia_id)
      .filter((id) => id != null && id !== '')
      .map((id) => String(id))
  );
  const trabajadas = (competencias || []).filter((c) => idsTrabajadas.has(String(c.id)));
  const corte = Number(grupo?.grado);
  const edadLabel = etiquetaCorte(nivel, corte);
  const competenciasMarco = await cargarMarcoCompetencias(trabajadas, { nivel, corte });
  const lista = matriculaId
    ? (alumnos || []).filter((a) => Number(a.matricula_id) === Number(matriculaId))
    : alumnos || [];
  if (!lista.length) {
    const e = new Error('No hay estudiantes para el documento.');
    e.code = 'CNEB_SIN_ALUMNOS';
    throw e;
  }
  return {
    colegio,
    grupo,
    lista,
    competenciasMarco,
    valores,
    edadLabel,
    meta: { anio, bimestre, nivel, grupo },
    subtitulo: `${etiquetaNivel(nivel)} · ${aulaLabel(grupo)} · Bimestre ${bimRoman(bimestre)} · ${anio}`,
  };
}

async function informePdfBuffer(cid, { anio, bimestre, grupoId, nivel, matriculaId }) {
  const data = await cargarDatosPdfCneb(cid, { anio, bimestre, grupoId, nivel, matriculaId });
  const buf = await pdfToBuffer(async (doc) => {
    data.lista.forEach((al, i) => {
      if (i > 0) doc.addPage();
      const startY = dibujarMembrete(doc, { colegioNombre: data.colegio?.nombre, subtitulo: data.subtitulo });
      dibujarAlumnoInforme(doc, {
        alumno: al,
        competencias: data.competenciasMarco,
        valores: data.valores,
        meta: data.meta,
        startY,
        edadLabel: data.edadLabel,
      });
    });
  }, { title: 'Informe de progreso CNEB', pie: PIE_INFORME });
  const who = matriculaId ? `alumno_${matriculaId}` : 'aula';
  return {
    buffer: buf,
    filename: `informe_cneb_${nivel}_${anio}_b${bimestre}_${who}.pdf`,
  };
}

async function libretaPdfBuffer(cid, { anio, bimestre, grupoId, nivel, matriculaId }) {
  const data = await cargarDatosPdfCneb(cid, { anio, bimestre, grupoId, nivel, matriculaId });
  const buf = await pdfToBuffer(async (doc) => {
    data.lista.forEach((al, i) => {
      if (i > 0) doc.addPage();
      const startY = dibujarMembrete(doc, {
        colegioNombre: data.colegio?.nombre,
        subtitulo: data.subtitulo,
        tituloOficial: 'LIBRETA DE INFORMACIÓN · CNEB',
      });
      dibujarAlumnoLibreta(doc, {
        alumno: al,
        competencias: data.competenciasMarco,
        valores: data.valores,
        meta: data.meta,
        startY,
      });
    });
  }, { title: 'Libreta CNEB', pie: PIE_LIBRETA });
  const who = matriculaId ? `alumno_${matriculaId}` : 'aula';
  return {
    buffer: buf,
    filename: `libreta_cneb_${nivel}_${anio}_b${bimestre}_${who}.pdf`,
  };
}

function dibujarTextoRico(doc, html, x, y, width, { fontSize = 9, maxY = null } = {}) {
  const bloques = htmlABloques(html);
  const limite = maxY != null ? maxY : null;
  const cabe = (yy) => limite == null || yy + fontSize + 1 < limite;
  if (!bloques.length) {
    const plano = htmlATextoPlano(html) || '—';
    const hOpt = limite != null ? { width, height: Math.max(12, limite - y) } : { width };
    doc.fillColor(COLOR.ink).font('Helvetica').fontSize(fontSize).text(plano, x, y, hOpt);
    return Math.min(doc.y + 4, limite || doc.y + 4);
  }
  bloques.forEach((b) => {
    if (!cabe(y)) return;
    if (limite == null) y = ensure(doc, y, fontSize + 2);
    const indent = b.type === 'li' ? 12 : 0;
    const parts = b.parts.length ? b.parts : [{ text: ' ', bold: false }];
    if (b.type === 'li') {
      doc.fillColor(COLOR.ink).font('Helvetica').fontSize(fontSize).text('•', x, y, { width: 10 });
    }
    const blockH = limite != null ? Math.max(10, limite - y) : undefined;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      doc
        .fillColor(COLOR.ink)
        .font(p.bold || b.type === 'h' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(b.type === 'h' ? fontSize + 1 : fontSize)
        .text(`${p.text}`, i === 0 ? x + indent : undefined, i === 0 ? y : undefined, {
          width: width - indent,
          continued: !last,
          lineGap: 1.2,
          ...(blockH != null && i === 0 ? { height: blockH } : {}),
        });
    });
    y = doc.y + (b.type === 'h' ? 4 : 3);
    if (limite != null && y > limite) y = limite;
  });
  return y;
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
    '',
    '',
    '1. Dibuja o escribe lo que hicimos hoy.',
    '2. ¿Qué aprendiste?',
    '3. ¿Qué te resultó fácil o difícil?',
    cotejo ? `\nPara el docente (cotejo):\n${cotejo}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function dibujarFirmasFicha(doc, y, inner) {
  const w = (inner - 24) / 2;
  doc.moveTo(36, y + 18).lineTo(36 + w, y + 18).strokeColor(COLOR.line).stroke();
  doc.moveTo(36 + w + 24, y + 18).lineTo(36 + inner, y + 18).strokeColor(COLOR.line).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text('Estudiante / familia', 36, y + 22, {
    width: w,
    align: 'center',
  });
  doc.text('Docente', 36 + w + 24, y + 22, { width: w, align: 'center' });
  return y + 36;
}

function dibujarCajaActividad(doc, { y, inner, texto, etiqueta }) {
  const firmasH = 40;
  const room = pageBottom(doc) - y;
  const cajaTop = y;
  let cajaH = room - firmasH;
  if (cajaH < 40) cajaH = Math.max(28, room - 34);
  if (etiqueta) {
    doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(8).text(etiqueta, 36, cajaTop - 12, { width: inner });
  }
  doc.rect(36, cajaTop, inner, cajaH).strokeColor(COLOR.line).stroke();
  dibujarTextoRico(doc, texto, 44, cajaTop + 6, inner - 16, {
    fontSize: 9,
    maxY: cajaTop + cajaH - 6,
  });
  return cajaTop + cajaH + 8;
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
  y += 16;
  filaDato(doc, y, 'ÁREA', ses.area_nombre || 'Taller interno', 36, inner * 0.5);
  filaDato(doc, y, 'FECHA', fecha, 36 + inner * 0.5, inner * 0.5);
  y += 16;
  filaDato(doc, y, 'COMPET.', ses.competencia_nombre || '—', 36, minedu ? inner * 0.72 : inner);
  if (minedu) {
    const edad = etiquetaCorte(ses.nivel_cneb, ses.corte);
    filaDato(doc, y, 'EDAD', edad || '—', 36 + inner * 0.72, inner * 0.28);
  }
  y += 16;
  filaDato(doc, y, 'NOMBRE', ' ', 36, inner * 0.62);
  filaDato(doc, y, 'FECHA', ' ', 36 + inner * 0.62, inner * 0.38);
  y += 22;
  const texto = limpiarEncabezadoFicha(textoFichaSesion(ses));

  if (minedu) {
    const caps = nombresCapacidad(ses.capacidades).slice(0, 4);
    doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(7.5).text('CAPACIDADES', 36, y);
    y += 10;
    if (!caps.length) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text('Sin capacidades en el catálogo.', 36, y);
      y += 11;
    } else {
      caps.forEach((n) => {
        doc.fillColor(COLOR.ink).font('Helvetica').fontSize(7).text(`•  ${n}`, 36, y, {
          width: inner,
          height: 10,
          ellipsis: true,
        });
        y += 11;
      });
    }
    y += 2;
    const des = (ses.desempenos || []).slice(0, 5);
    doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(7.5).text('DESEMPEÑOS A OBSERVAR', 36, y);
    y += 11;
    if (!des.length) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text('Sin desempeños para esta edad.', 36, y);
      y += 12;
    } else {
      des.forEach((d, i) => {
        doc.rect(36, y + 1, 7, 7).strokeColor(COLOR.line).stroke();
        doc.fillColor(COLOR.ink).font('Helvetica').fontSize(7).text(`${i + 1}. ${d.texto || d}`, 48, y, {
          width: inner - 16,
          height: 16,
          ellipsis: true,
        });
        y += 17;
      });
    }
    y += 14;
  }

  y = dibujarCajaActividad(doc, {
    y,
    inner,
    texto,
    etiqueta: minedu ? 'ACTIVIDAD DEL ESTUDIANTE' : null,
  });
  dibujarFirmasFicha(doc, y, inner);
}

function dibujarTeoriaPagina(doc, { colegio, ses, grupo, fecha }) {
  const inner = doc.page.width - 72;
  let y = dibujarMembrete(doc, {
    colegioNombre: colegio?.nombre,
    subtitulo: `${etiquetaNivel(ses.nivel_cneb)} · ${aulaLabel(grupo) || 'Aula'} · ${fecha}`,
    tituloOficial: 'PARA LEER · TEORÍA DEL TEMA',
  });
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12).text(ses.titulo || 'Sesión', 36, y, { width: inner });
  y += 18;
  const texto = String(ses.material_teoria || '').trim();
  if (!texto) {
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9).text(
      'Esta sesión todavía no tiene texto de teoría.',
      36,
      y,
      { width: inner }
    );
    return;
  }
  dibujarTextoRico(doc, texto, 36, y, inner, { fontSize: 11 });
}

async function sesionPdfBuffer(cid, sesionId, { parte = 'sesion', formato = 'colegio' } = {}) {
  const ses = await cargarSesion(cid, sesionId);
  if (!ses) return null;
  const colegio = await getColegioData(cid);
  const grupo = ses.grupo_id ? await metaGrupo(cid, ses.grupo_id) : null;
  const fecha = fechaEs(ses.fecha_sesion);
  const slug = String(ses.titulo || 'sesion')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  if (String(parte || '').toLowerCase() === 'teoria') {
    const propio = bufferArchivoPropio(ses, 'teoria');
    if (propio) return propio;
    try {
      const bonito = await bufferPdfBonito({ ses, colegio, grupo, fecha, parte: 'teoria' });
      if (bonito) return bonito;
    } catch (e) {
      console.error('[cneb/pdf teoria]', e.message);
    }
    const buf = await pdfToBuffer(async (doc) => {
      dibujarTeoriaPagina(doc, { colegio, ses, grupo, fecha });
    }, { title: 'Teoría del tema', pie: PIE_TEORIA });
    return { buffer: buf, filename: `teoria_cneb_${ses.id}_${slug}.pdf`, contentType: 'application/pdf' };
  }
  if (String(parte || '').toLowerCase() === 'ficha') {
    const minedu = String(formato || '').toLowerCase() === 'minedu';
    if (!minedu) {
      const propio = bufferArchivoPropio(ses, 'ficha');
      if (propio) return propio;
      try {
        const bonito = await bufferPdfBonito({ ses, colegio, grupo, fecha, parte: 'ficha' });
        if (bonito) return bonito;
      } catch (e) {
        console.error('[cneb/pdf ficha]', e.message);
      }
    }
    const buf = await pdfToBuffer(async (doc) => {
      dibujarFichaPagina(doc, { colegio, ses, grupo, fecha, formato });
    }, { title: 'Ficha CNEB', pie: minedu ? PIE_FICHA_MINEDU : PIE_FICHA_COLEGIO });
    const pref = minedu ? 'ficha_minedu' : 'ficha_cneb';
    return { buffer: buf, filename: `${pref}_${ses.id}_${slug}.pdf`, contentType: 'application/pdf' };
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
    let capsSes = ses.capacidades || [];
    let estSes = ses.estandar_ciclo || '';
    let desSes = ses.desempenos || [];
    if (ses.competencia_id && (!capsSes.length || !desSes.length || !String(estSes).trim())) {
      const [marco] = await cargarMarcoCompetencias(
        [{ id: ses.competencia_id, nombre: ses.competencia_nombre, estandar_ciclo: estSes }],
        { nivel: ses.nivel_cneb, corte: ses.corte }
      );
      if (marco) {
        if (!capsSes.length) capsSes = marco.capacidades;
        if (!String(estSes).trim()) estSes = marco.estandar_ciclo;
        if (!desSes.length) desSes = marco.desempenos;
      }
    }
    y = dibujarMarcoCneb(doc, y, inner, {
      x: 36,
      competenciaNombre: ses.competencia_nombre || 'Competencia',
      capacidades: capsSes,
      estandar: estSes,
      desempenos: desSes,
      edadLabel: etiquetaCorte(ses.nivel_cneb, ses.corte),
    });
    if (ses.proposito) {
      y = ensure(doc, y, 20);
      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(8).text('PROPÓSITO', 36, y);
      y += 12;
      y = dibujarTextoFluido(doc, ses.proposito, 36, y, inner, { fontSize: 9 });
      y += 6;
    }
    ['inicio', 'desarrollo', 'cierre'].forEach((tipo) => {
      const mins = ses.minutos?.[tipo] ?? 0;
      const texto = ses.momentos?.[tipo] || '—';
      y = ensure(doc, y, 20);
      doc.rect(36, y, inner, 16).fillAndStroke(COLOR.teal, COLOR.teal);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9).text(`${momentoTitulo(tipo)}  ·  ${mins} min`, 42, y + 4);
      y += 18;
      y = dibujarTextoRico(doc, texto, 40, y, inner - 8, { fontSize: 9 });
      y += 6;
    });
    const cotejo = ses.cotejo || [];
    if (cotejo.length) {
      y = ensure(doc, y, 18);
      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(9).text('Lista de cotejo', 36, y);
      y += 12;
      cotejo.forEach((c, i) => {
        y = dibujarTextoFluido(doc, `${i + 1}. ${c.item}`, 40, y, inner - 8, { fontSize: 8.5 });
      });
    }
    const dua = leerDua(ses.dua || ses.dua_json);
    if (duaTieneAlgo(dua)) {
      y = ensure(doc, y, 22);
      doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(9).text('DUA de esta sesión (evidencia de aula)', 36, y);
      y += 12;
      Object.keys(DUA_OPCIONES).forEach((cat) => {
        const labs = (dua[cat] || []).map((k) => DUA_OPCIONES[cat].find((x) => x.key === k)?.label || k);
        if (!labs.length) return;
        y = dibujarTextoFluido(doc, `${DUA_CAT_LABEL[cat]}: ${labs.join(' · ')}`, 40, y, inner - 8, { fontSize: 8.5 });
      });
      if (dua.nota) {
        y = dibujarTextoFluido(doc, `Nota: ${dua.nota}`, 40, y, inner - 8, { fontSize: 8.5 });
      }
      const procs = dua.procedimientos || [];
      if (procs.length) {
        y = ensure(doc, y, 16);
        y = dibujarTextoFluido(
          doc,
          'Procedimiento de hoy (ajustes de esta sesión con el/los estudiante(s) que tienen PIAR):',
          40,
          y,
          inner - 8,
          { fontSize: 8.5 }
        );
        procs.forEach((p) => {
          const quien = String(p.nombre || '').trim() || 'Estudiante con apoyos';
          y = dibujarTextoFluido(doc, `${quien}: ${p.texto}`, 40, y, inner - 8, { fontSize: 8.5 });
        });
      }
      y += 4;
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text(
        'Registro institucional de diseño inclusivo. No modifica SIAGIE ni identifica diagnósticos en la ficha del estudiante.',
        36,
        y,
        { width: inner }
      );
      y += 14;
    }
    if (String(ses.ficha_estudiante || '').trim()) {
      doc.addPage();
      dibujarFichaPagina(doc, { colegio, ses, grupo, fecha, formato: 'colegio' });
    }
  }, { title: 'Sesión CNEB', pie: PIE_SESION });
  return { buffer: buf, filename: `sesion_cneb_${ses.id}_${slug}.pdf` };
}

module.exports = { informePdfBuffer, libretaPdfBuffer, sesionPdfBuffer };
