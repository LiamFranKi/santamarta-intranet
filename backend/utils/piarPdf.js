const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getColegioData } = require('./colegio');
const { fechaHoraTextoLima, fechaTextoLima } = require('./fechaHoraLima');
const {
  PIAR_CAT_LABEL,
  PIAR_KPI_LABEL,
  PIAR_ESCALA_LABEL,
  PIAR_ESTADO_LABEL,
  etiquetaApoyo,
  parseJsonPiar,
} = require('./piarEtiquetas');

const COLOR = {
  ink: '#1e1b4b',
  muted: '#57534e',
  line: '#d6d3d1',
  violet: '#5b21b6',
  violetSoft: '#f5f3ff',
  teal: '#0f766e',
  cream: '#fffbeb',
  white: '#ffffff',
};

function logoColegioPath() {
  const dir = path.join(__dirname, '..', 'public', 'assets', 'logos');
  for (const name of ['logo.png', 'logo-default.png']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function pageBottom(doc) {
  return doc.page.height - 48;
}

function ensureY(doc, y, need) {
  if (y + need < pageBottom(doc)) return y;
  doc.addPage();
  return 48;
}

function dibujarMembrete(doc, { colegioNombre, titulo, subtitulo }) {
  const pageW = doc.page.width;
  const left = 40;
  const top = 28;
  const logo = logoColegioPath();
  if (logo) {
    try {
      doc.image(logo, left, top, { fit: [58, 46], valign: 'center' });
    } catch {
      /* sin logo */
    }
  }
  const cx = left + (logo ? 70 : 0);
  const cw = pageW - cx - 40;
  doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10).text(
    String(colegioNombre || 'Institución educativa').toUpperCase(),
    cx,
    top + 2,
    { width: cw, align: 'center' }
  );
  doc.fillColor(COLOR.violet).font('Helvetica-Bold').fontSize(12).text(titulo, cx, top + 16, {
    width: cw,
    align: 'center',
  });
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(subtitulo || '', cx, top + 32, {
    width: cw,
    align: 'center',
  });
  doc.moveTo(left, top + 52).lineTo(pageW - 40, top + 52).strokeColor(COLOR.violet).lineWidth(1.4).stroke();
  doc.moveTo(left, top + 55).lineTo(pageW - 40, top + 55).strokeColor(COLOR.teal).lineWidth(0.6).stroke();
  return top + 66;
}

function seccionTitulo(doc, y, texto) {
  y = ensureY(doc, y, 22);
  const inner = doc.page.width - 80;
  doc.roundedRect(40, y, inner, 18, 3).fill(COLOR.violet);
  doc.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(9).text(texto, 48, y + 5, { width: inner - 16 });
  return y + 26;
}

function htmlATextoPlano(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bloqueTexto(doc, y, etiqueta, valor) {
  const inner = doc.page.width - 80;
  const plano = htmlATextoPlano(valor);
  const txt = plano || '—';
  doc.font('Helvetica').fontSize(9);
  const h = Math.max(28, doc.heightOfString(txt, { width: inner - 16 }) + 22);
  y = ensureY(doc, y, h + 6);
  doc.roundedRect(40, y, inner, h, 4).fillAndStroke(COLOR.violetSoft, COLOR.line);
  doc.fillColor(COLOR.violet).font('Helvetica-Bold').fontSize(7.5).text(etiqueta.toUpperCase(), 48, y + 6, {
    width: inner - 16,
  });
  doc.fillColor(COLOR.ink).font('Helvetica').fontSize(9).text(txt, 48, y + 16, { width: inner - 16 });
  return y + h + 8;
}

function piePagina(doc, texto, pagina, total) {
  const w = doc.page.width - 80;
  doc.moveTo(40, doc.page.height - 40).lineTo(doc.page.width - 40, doc.page.height - 40).strokeColor(COLOR.line).lineWidth(0.5).stroke();
  doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7).text(texto, 40, doc.page.height - 32, {
    width: w * 0.72,
    align: 'left',
  });
  doc.fillColor(COLOR.violet).font('Helvetica-Bold').fontSize(7).text(`${pagina} / ${total}`, 40, doc.page.height - 32, {
    width: w,
    align: 'right',
  });
}

function volcarPies(doc, texto) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    piePagina(doc, texto, i + 1, range.count);
  }
}

function pdfToBuffer(build, pieTexto) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: { Title: 'PIAR', Author: 'Intranet Vanguard' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(build(doc))
      .then(() => {
        volcarPies(doc, pieTexto);
        doc.end();
      })
      .catch(reject);
  });
}

function tryPdfImageFromDataUrl(doc, dataUrl, x, y, maxW = 140, maxH = 48) {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return false;
  try {
    const buf = Buffer.from(m[2], 'base64');
    doc.image(buf, x, y, { fit: [maxW, maxH] });
    return true;
  } catch {
    return false;
  }
}

async function piarPdfBuffer(cid, p, { seguimiento = [] } = {}) {
  const colegio = await getColegioData(cid).catch(() => null);
  const adj = parseJsonPiar(p.ajustes_checklist_json, {}) || {};
  const objs = parseJsonPiar(p.objetivos_json, []);
  const kpi = parseJsonPiar(p.evaluacion_kpi_json, {}) || {};
  const estado = PIAR_ESTADO_LABEL[p.estado] || p.estado || '—';

  return pdfToBuffer((doc) => {
    let y = dibujarMembrete(doc, {
      colegioNombre: colegio?.nombre,
      titulo: 'PLAN INDIVIDUAL DE AJUSTES RAZONABLES',
      subtitulo: 'Documento institucional · Psicología y aula · Uso interno del colegio',
    });
    const inner = doc.page.width - 80;
    doc.roundedRect(40, y, inner, 46, 6).fillAndStroke('#faf5ff', COLOR.line);
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12).text(p.alumno_nombre || 'Estudiante', 50, y + 8, {
      width: inner - 20,
    });
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8.5).text(
      [
        p.grupo_aula_etiqueta || '',
        `Año ${p.anio}`,
        `Versión ${p.numero_version}`,
        estado,
      ]
        .filter(Boolean)
        .join('  ·  '),
      50,
      y + 26,
      { width: inner - 20 }
    );
    y += 58;

    y = seccionTitulo(doc, y, '1. Identificación y responsables');
    y = bloqueTexto(doc, y, 'Elaboración', p.elaborado_por_nombre || '—');
    y = bloqueTexto(doc, y, 'Docente responsable en aula', p.docente_responsable_nombre || '—');
    y = bloqueTexto(doc, y, 'Coordinación', p.coordinador_nombre || '—');
    y = bloqueTexto(doc, y, 'Fecha de elaboración', fechaTextoLima(p.fecha_elaboracion));
    y = bloqueTexto(doc, y, 'Próxima revisión', fechaTextoLima(p.fecha_revision));

    y = seccionTitulo(doc, y, '2. Retrato del estudiante');
    y = bloqueTexto(doc, y, 'Fortalezas', p.fortalezas);
    y = bloqueTexto(doc, y, 'Áreas de apoyo', p.areas_dificultad);
    y = bloqueTexto(doc, y, 'Estilo de aprendizaje', p.estilo_aprendizaje);
    y = bloqueTexto(doc, y, 'Diagnóstico (si aplica)', p.diagnostico);
    y = bloqueTexto(doc, y, 'Observaciones', p.observaciones_relevantes);

    y = seccionTitulo(doc, y, '3. Apoyos (ajustes razonables)');
    const porCat = Object.keys(PIAR_CAT_LABEL);
    porCat.forEach((cat) => {
      const keys = Array.isArray(adj[cat]) ? adj[cat] : [];
      const labels = keys.map(etiquetaApoyo).join('  ·  ') || '—';
      y = bloqueTexto(doc, y, PIAR_CAT_LABEL[cat], labels);
    });

    y = seccionTitulo(doc, y, '4. Objetivos');
    if (Array.isArray(objs) && objs.some((o) => o && (o.objetivo || o.indicador))) {
      objs.forEach((o, i) => {
        if (!o || (!o.objetivo && !o.indicador)) return;
        y = bloqueTexto(doc, y, `Objetivo ${i + 1}`, `${o.objetivo || '—'}\nIndicador: ${o.indicador || '—'}`);
      });
    } else {
      y = bloqueTexto(doc, y, 'Objetivos', 'Sin objetivos registrados.');
    }

    const kpiBits = ['participacion', 'comprension', 'autonomia']
      .filter((k) => kpi[k])
      .map((k) => PIAR_KPI_LABEL[k]);
    y = bloqueTexto(
      doc,
      y,
      'Indicadores de seguimiento',
      `${kpiBits.length ? kpiBits.join(', ') : '—'}\nEscala: ${PIAR_ESCALA_LABEL[kpi.escala] || kpi.escala || '—'}`
    );

    y = seccionTitulo(doc, y, '5. Seguimiento en aula');
    y = bloqueTexto(doc, y, 'Estrategias del docente', p.estrategias_docentes);
    y = bloqueTexto(doc, y, 'Frecuencia', p.frecuencia_aplicacion);
    y = bloqueTexto(doc, y, 'Avances observados', p.avances_observados);
    y = bloqueTexto(doc, y, 'Ajustes tras revisión', p.ajustes_necesarios_revision);

    y = seccionTitulo(doc, y, '6. Bitácora');
    if (seguimiento && seguimiento.length) {
      seguimiento.forEach((s) => {
        const rol = String(s.autor_tipo || '') === 'DOCENTE' ? 'Docente' : 'Psicología';
        y = bloqueTexto(doc, y, `${rol} · ${fechaHoraTextoLima(s.created_at)}`, s.contenido);
      });
    } else {
      y = bloqueTexto(doc, y, 'Bitácora', 'Sin notas aún.');
    }
  }, 'Documento interno. No reemplaza informe médico ni el informe de progreso CNEB.');
}

async function actaReunionPdfBuffer(cid, r) {
  const colegio = await getColegioData(cid).catch(() => null);
  return pdfToBuffer((doc) => {
    let y = dibujarMembrete(doc, {
      colegioNombre: colegio?.nombre,
      titulo: 'ACTA DE REUNIÓN CON LA FAMILIA',
      subtitulo: 'Psicología · Documento institucional',
    });
    const inner = doc.page.width - 80;
    doc.roundedRect(40, y, inner, 40, 6).fillAndStroke('#faf5ff', COLOR.line);
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12).text(r.alumno_nombre || 'Estudiante', 50, y + 8, {
      width: inner - 20,
    });
    const refReu = r.fecha_reunion || r.updated_at || r.created_at;
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8.5).text(
      `${fechaHoraTextoLima(refReu)}  ·  ${r.estado === 'CERRADA' ? 'Acta cerrada' : r.estado || ''}`,
      50,
      y + 24,
      { width: inner - 20 }
    );
    y += 52;
    y = bloqueTexto(doc, y, 'Participantes', r.participantes);
    y = bloqueTexto(doc, y, 'Temas tratados', r.temas_tratados);
    y = bloqueTexto(doc, y, 'Acuerdos', r.acuerdos);
    y = bloqueTexto(doc, y, 'Compromisos de la familia', r.compromisos_familia);
    y = bloqueTexto(doc, y, 'Compromisos del colegio', r.compromisos_colegio);

    y = seccionTitulo(doc, y, 'Firmas registradas en intranet');
    const firmas = [
      ['Familia / apoderado', r.firma_padre_imagen],
      ['Psicología', r.firma_psicologia_imagen],
      ['Docente', r.firma_docente_imagen],
    ];
    firmas.forEach(([etiq, img]) => {
      y = ensureY(doc, y, 70);
      doc.fillColor(COLOR.violet).font('Helvetica-Bold').fontSize(8).text(etiq, 40, y);
      y += 12;
      if (!tryPdfImageFromDataUrl(doc, img, 40, y, 160, 42)) {
        doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text('(Sin firma digital en este documento)', 40, y);
        y += 16;
      } else {
        y += 50;
      }
    });
  }, 'Documento generado por la intranet. Las firmas corresponden a las capturadas en el expediente.');
}

module.exports = {
  piarPdfBuffer,
  actaReunionPdfBuffer,
};
