import { jsPDF } from 'jspdf';

const NAVY = [15, 39, 68];
const TEAL = [13, 148, 136];
const SLATE = [30, 41, 59];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const SOFT = [241, 245, 249];
const WHITE = [255, 255, 255];
const GOLD = [196, 154, 74];

const NIVEL_IDIOMA = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
  NATIVO: 'Nativo',
};

const TIPO_DOC = {
  TITULO: 'Título',
  CERTIFICADO: 'Certificado',
  OTRO: 'Documento',
};

function txt(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function iniciales(item) {
  const parts = `${item.nombres || ''} ${item.apellidos || ''}`.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => (p[0] || '').toUpperCase()).join('') || 'CV';
}

function fmtFechaCorta(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  return s;
}

function fmtRangoExp(row) {
  const ini = fmtFechaCorta(row.fecha_inicio) || '—';
  const fin = row.actual ? 'Actualidad' : fmtFechaCorta(row.fecha_fin) || '—';
  return `${ini} — ${fin}`;
}

function fmtRangoEstudio(row) {
  const ini = row.anio_inicio || '—';
  const fin = row.en_curso ? 'En curso' : row.anio_fin || '—';
  return `${ini} — ${fin}`;
}

function fmtFechaLarga(d) {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString('es-PE');
  }
}

function imageFormat(dataUrl) {
  return String(dataUrl).includes('image/png') ? 'PNG' : 'JPEG';
}

function clipPhotoRounded(dataUrl, wPx, hPx, rPx) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = wPx * scale;
        canvas.height = hPx * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(rPx, 0);
        ctx.arcTo(wPx, 0, wPx, hPx, rPx);
        ctx.arcTo(wPx, hPx, 0, hPx, rPx);
        ctx.arcTo(0, hPx, 0, 0, rPx);
        ctx.arcTo(0, 0, wPx, 0, rPx);
        ctx.closePath();
        ctx.clip();
        const ir = img.width / img.height;
        const tr = wPx / hPx;
        let dw = wPx;
        let dh = hPx;
        let dx = 0;
        let dy = 0;
        if (ir > tr) {
          dw = hPx * ir;
          dx = (wPx - dw) / 2;
        } else {
          dh = wPx / ir;
          dy = (hPx - dh) / 2;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function loadRemoteAsDataUrl(url) {
  if (!url) return Promise.resolve(null);
  return fetch(url, { mode: 'cors' })
    .then((r) => (r.ok ? r.blob() : null))
    .then(
      (blob) =>
        new Promise((resolve) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
}

async function resolverFotoData(item) {
  if (item.foto_base64) return item.foto_base64;
  if (item.foto_url) return loadRemoteAsDataUrl(item.foto_url);
  return null;
}

function drawHeader(doc, { pageW, colegioNombre, logoData, logoFmt }) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 28, pageW, 1.6, 'F');

  if (logoData) {
    try {
      doc.addImage(logoData, logoFmt, 11, 5.2, 17, 17);
    } catch {
      /* logo opcional */
    }
  }

  const left = logoData ? 32 : 14;
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CURRICULUM VITAE', left, 13.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 214, 229);
  doc.text(txt(colegioNombre) || 'Vanguard Schools', left, 20.4);
}

function drawFooter(doc, { pageW, pageH, colegioNombre, fechaLabel }) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(14, pageH - 12, pageW - 14, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${txt(colegioNombre) || 'Vanguard Schools'}  ·  ${fechaLabel}`, 14, pageH - 7);
    doc.text(`Página ${i} de ${total}`, pageW - 14, pageH - 7, { align: 'right' });
  }
}

function ensureSpace(doc, state, need) {
  if (state.y + need <= state.pageH - 16) return;
  doc.addPage();
  drawHeader(doc, state);
  state.y = 36;
}

function sectionTitle(doc, state, title) {
  ensureSpace(doc, state, 14);
  const x = 14;
  doc.setFillColor(...TEAL);
  doc.roundedRect(x, state.y, 2.2, 7.2, 0.6, 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), x + 5.5, state.y + 5.4);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.45);
  const tw = doc.getTextWidth(title.toUpperCase());
  doc.line(x + 5.5, state.y + 7.4, x + 5.5 + Math.min(tw, 70), state.y + 7.4);
  state.y += 12;
}

function emptyLine(doc, state, msg) {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(msg, 14, state.y);
  state.y += 8;
}

function drawIdentity(doc, state, item, photoData) {
  const x = 14;
  const photoW = 32;
  const photoH = 38;
  const textX = x + photoW + 7;
  const textW = state.pageW - textX - 14;

  doc.setFillColor(...SOFT);
  doc.roundedRect(x - 0.4, state.y - 0.4, photoW + 0.8, photoH + 0.8, 2.2, 2.2, 'F');

  if (photoData) {
    try {
      doc.addImage(photoData, imageFormat(photoData), x, state.y, photoW, photoH);
    } catch {
      photoData = null;
    }
  }
  if (!photoData) {
    doc.setFillColor(15, 39, 68);
    doc.roundedRect(x, state.y, photoW, photoH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text(iniciales(item), x + photoW / 2, state.y + photoH / 2 + 2, { align: 'center' });
  }

  let ty = state.y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  const nombreLines = doc.splitTextToSize(txt(item.nombre_completo) || 'Personal', textW);
  doc.text(nombreLines, textX, ty);
  ty += nombreLines.length * 6.2;

  const cargo = txt(item.cargo) || txt(item.usuario_tipo);
  if (cargo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    const cargoLines = doc.splitTextToSize(cargo, textW);
    doc.text(cargoLines, textX, ty);
    ty += cargoLines.length * 4.6 + 1.5;
  }

  if (txt(item.profesion) && txt(item.profesion) !== cargo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(txt(item.profesion), textX, ty);
    ty += 5;
  }

  const contactos = [];
  if (txt(item.telefono)) contactos.push(`Tel. ${txt(item.telefono)}`);
  if (txt(item.email)) contactos.push(txt(item.email));
  if (txt(item.nro_documento)) contactos.push(`DNI ${txt(item.nro_documento)}`);
  if (contactos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const cLines = doc.splitTextToSize(contactos.join('   ·   '), textW);
    doc.text(cLines, textX, ty);
    ty += cLines.length * 4.2;
  }

  if (txt(item.direccion)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const dLines = doc.splitTextToSize(txt(item.direccion), textW);
    doc.text(dLines, textX, ty);
    ty += dLines.length * 3.8;
  }

  state.y = Math.max(state.y + photoH, ty) + 8;
}

function drawEstudios(doc, state, list) {
  sectionTitle(doc, state, 'Formación académica');
  if (!list.length) {
    emptyLine(doc, state, 'Sin estudios registrados.');
    return;
  }
  list.forEach((row) => {
    const titulo = [txt(row.carrera), txt(row.nivel)].filter(Boolean).join('  ·  ') || 'Estudio';
    const inst = txt(row.institucion);
    const periodo = fmtRangoEstudio(row);
    const lines = doc.splitTextToSize(titulo, state.contentW - 36);
    ensureSpace(doc, state, 8 + lines.length * 4.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(lines, 14, state.y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEAL);
    doc.text(periodo, state.pageW - 14, state.y, { align: 'right' });
    state.y += lines.length * 4.4;
    if (inst) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      const instLines = doc.splitTextToSize(inst, state.contentW);
      doc.text(instLines, 14, state.y);
      state.y += instLines.length * 4;
    }
    state.y += 3.2;
  });
  state.y += 2;
}

function drawIdiomas(doc, state, list) {
  sectionTitle(doc, state, 'Idiomas');
  if (!list.length) {
    emptyLine(doc, state, 'Sin idiomas registrados.');
    return;
  }
  const chips = list.map((row) => {
    const nivel = NIVEL_IDIOMA[String(row.nivel || '').toUpperCase()] || row.nivel || '';
    return `${txt(row.idioma)}${nivel ? ` (${nivel})` : ''}`;
  });
  const text = chips.join('    ·    ');
  const lines = doc.splitTextToSize(text, state.contentW);
  ensureSpace(doc, state, 6 + lines.length * 4.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(lines, 14, state.y);
  state.y += lines.length * 4.6 + 6;
}

function drawExperiencia(doc, state, list) {
  sectionTitle(doc, state, 'Experiencia laboral');
  if (!list.length) {
    emptyLine(doc, state, 'Sin experiencia registrada.');
    return;
  }
  list.forEach((row) => {
    const cargo = txt(row.cargo) || 'Cargo';
    const empresa = txt(row.empresa);
    const periodo = fmtRangoExp(row);
    const desc = txt(row.descripcion);
    const cargoLines = doc.splitTextToSize(cargo, state.contentW - 36);
    const descLines = desc ? doc.splitTextToSize(desc, state.contentW) : [];
    ensureSpace(doc, state, 12 + cargoLines.length * 4.4 + descLines.length * 4);

    doc.setFillColor(...TEAL);
    doc.circle(15.2, state.y - 0.6, 1.05, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(cargoLines, 19, state.y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEAL);
    doc.text(periodo, state.pageW - 14, state.y, { align: 'right' });
    state.y += cargoLines.length * 4.4;

    if (empresa) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(empresa, 19, state.y);
      state.y += 4.4;
    }
    if (descLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...SLATE);
      doc.text(descLines, 19, state.y);
      state.y += descLines.length * 3.9;
    }
    state.y += 4;
  });
}

function drawDocumentos(doc, state, list) {
  sectionTitle(doc, state, 'Documentos');
  if (!list.length) {
    emptyLine(doc, state, 'Sin documentos registrados.');
    return;
  }
  list.forEach((row) => {
    const tipo = TIPO_DOC[String(row.tipo || '').toUpperCase()] || row.tipo || 'Documento';
    const titulo = txt(row.titulo) || 'Documento';
    const line = `${tipo}  ·  ${titulo}`;
    const lines = doc.splitTextToSize(line, state.contentW - 6);
    ensureSpace(doc, state, 5 + lines.length * 4.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE);
    doc.text(`•  ${lines[0]}`, 14, state.y);
    if (lines.length > 1) {
      doc.text(lines.slice(1), 19.5, state.y + 4.1);
    }
    state.y += lines.length * 4.2 + 1.8;
  });
}

async function dibujarPersona(doc, state, item) {
  const rawFoto = await resolverFotoData(item);
  const photoData = rawFoto ? await clipPhotoRounded(rawFoto, 190, 226, 14) : null;
  drawHeader(doc, state);
  state.y = 36;
  drawIdentity(doc, state, item, photoData);
  drawEstudios(doc, state, item.estudios || []);
  drawIdiomas(doc, state, item.idiomas || []);
  drawExperiencia(doc, state, item.experiencia || []);
  drawDocumentos(doc, state, item.documentos || []);
}

/**
 * Genera y descarga el PDF de uno o varios currículums.
 */
export async function generarPdfCurriculums(items, opts = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    throw new Error('No hay personal para generar el currículum.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const state = {
    pageW,
    pageH,
    contentW: pageW - 28,
    y: 36,
    colegioNombre: opts.colegioNombre || '',
    logoData: opts.logoBase64 || null,
    logoFmt: imageFormat(opts.logoBase64 || ''),
  };

  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) doc.addPage();
    await dibujarPersona(doc, state, list[i]);
  }

  drawFooter(doc, {
    pageW,
    pageH,
    colegioNombre: state.colegioNombre,
    fechaLabel: `Generado el ${fmtFechaLarga(new Date())}`,
  });

  const filename = opts.filename || (list.length === 1 ? 'CV_Personal.pdf' : 'Curriculums_Personal.pdf');
  doc.save(filename);
}
