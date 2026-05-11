/**
 * Libreta PDF Nivel Inicial (cualitativa): cabecera con foto o iniciales, escala / semáforo,
 * tabla por cursos e indicadores desde la API.
 */

export function pdfGetInitialsLibreta(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

function edadAniosDesdeFecha(fechaStr) {
  if (!fechaStr) return null;
  const s = String(fechaStr).slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

async function loadImageDataUrl(url) {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('load'));
      img.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

export function getNotaCualitativaPdfStyle(notaRaw) {
  const s = String(notaRaw ?? '').trim().toUpperCase();
  if (s === 'AD' || s === 'A') {
    return { fill: [220, 252, 231], stroke: [74, 222, 128], text: [22, 101, 52] };
  }
  if (s === 'B') {
    return { fill: [254, 249, 195], stroke: [250, 204, 21], text: [113, 63, 18] };
  }
  if (s === 'C') {
    return { fill: [254, 226, 226], stroke: [248, 113, 113], text: [127, 29, 29] };
  }
  return { fill: [248, 250, 252], stroke: [203, 213, 225], text: [51, 65, 85] };
}

function drawRoundedRect(doc, x, y, w, h, r, style) {
  const nx = Number(x) || 0;
  const ny = Number(y) || 0;
  const nw = Math.max(0.01, Number(w) || 0);
  const nh = Math.max(0.01, Number(h) || 0);
  const nr = Math.max(0, Math.min(Number(r) || 0, nw / 2, nh / 2));
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(nx, ny, nw, nh, nr, nr, style);
  } else {
    doc.rect(nx, ny, nw, nh, style);
  }
}

/**
 * @param {object} doc instancia jsPDF
 * @param {object} opts opciones de página y datos
 * @returns {Promise<void>}
 */
export async function renderLibretaInicialBoleta(doc, opts) {
  const {
    datosLibreta,
    pageWidth,
    pageHeight,
    margin,
    contentWidth,
    borderWidth,
    colorLabel,
    colorData,
    cicloSel,
    yStart,
    logoHeightMm = 0
  } = opts;

  const a = datosLibreta.alumno || {};
  const fotoUrl = a.foto_url || null;
  const bimRoman = ['I', 'II', 'III', 'IV'][(cicloSel || 1) - 1] || 'I';
  let yPos = Math.max(yStart, margin + (logoHeightMm || 0) + 2);

  const headerHeight = 5;
  const colAreaWidth = 78;
  const colNotaWidth = 20;
  const colDetalleWidth = contentWidth - colAreaWidth - colNotaWidth;

  const ensureSpace = (needH) => {
    if (yPos + needH > pageHeight - 24) {
      doc.addPage();
      yPos = margin;
    }
  };

  doc.setLineWidth(borderWidth);
  doc.setDrawColor(71, 85, 105);

  const bannerH = 12;
  ensureSpace(bannerH + 42);
  doc.setFillColor(...colorLabel);
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 2.5, 'F');
  doc.setDrawColor(
    Math.max(0, colorLabel[0] - 35),
    Math.max(0, colorLabel[1] - 35),
    Math.max(0, colorLabel[2] - 35)
  );
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 2.5, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('Libreta de desarrollo y aprendizaje', margin + contentWidth / 2, yPos + 5.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `${a.nivel_nombre || 'Nivel Inicial'} · Bimestre ${bimRoman} · Año ${a.anio ?? '-'}`,
    margin + contentWidth / 2,
    yPos + 9.8,
    { align: 'center' }
  );
  yPos += bannerH + 3.5;

  const blockH = 42;
  ensureSpace(blockH + 35);
  const photoSize = 26;
  const photoX = margin + 4;
  const photoY = yPos + (blockH - photoSize) / 2;
  const dataX = photoX + photoSize + 5;
  const dataW = Math.max(40, contentWidth - (dataX - margin) - 5);

  doc.setFillColor(255, 255, 255);
  drawRoundedRect(doc, margin, yPos, contentWidth, blockH, 2.5, 'FD');

  doc.setFillColor(
    Math.min(255, colorLabel[0] + 25),
    Math.min(255, colorLabel[1] + 25),
    Math.min(255, colorLabel[2] + 25)
  );
  drawRoundedRect(doc, photoX - 1.2, photoY - 1.2, photoSize + 2.4, photoSize + 2.4, 3, 'F');
  doc.setFillColor(255, 255, 255);
  drawRoundedRect(doc, photoX, photoY, photoSize, photoSize, 2.5, 'F');

  const fotoData = await loadImageDataUrl(fotoUrl);
  let fotoPintada = false;
  if (fotoData) {
    try {
      const fmt = fotoData.includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(fotoData, fmt, photoX + 0.6, photoY + 0.6, photoSize - 1.2, photoSize - 1.2, undefined, 'FAST');
      fotoPintada = true;
    } catch {
      fotoPintada = false;
    }
  }
  if (!fotoPintada) {
    doc.setFillColor(...colorLabel);
    drawRoundedRect(doc, photoX, photoY, photoSize, photoSize, 2.2, 'F');
    const initials = pdfGetInitialsLibreta(a.nombre_completo || '');
    doc.setTextColor(55, 71, 79);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(initials, photoX + photoSize / 2, photoY + photoSize / 2 + 2.2, { align: 'center' });
  }

  doc.setFontSize(7.8);
  let dy = yPos + 4.5;
  const filaDato = (etiq, valor) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`${etiq}`, dataX, dy);
    const wE = doc.getTextWidth(`${etiq} `);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const v = valor != null && String(valor).trim() !== '' ? String(valor) : '—';
    const lineas = doc.splitTextToSize(v, dataW - wE - 1);
    doc.text(lineas[0] || '—', dataX + wE, dy);
    dy += lineas.length > 1 ? 3.8 * lineas.length : 4.2;
  };

  filaDato('Alumno', a.nombre_completo);
  filaDato('Código', a.codigo);
  const edad = edadAniosDesdeFecha(a.fecha_nacimiento);
  filaDato('Edad', edad != null ? `${edad} años` : '—');
  filaDato('Aula', `${a.grado}° ${a.seccion || ''}`.trim());
  filaDato('Turno', a.turno_nombre);
  filaDato('Tutor(a)', a.tutor_nombre || 'No asignado');

  yPos += blockH + 3;

  const escalaH = 21;
  ensureSpace(escalaH + 20);
  doc.setFillColor(250, 250, 252);
  drawRoundedRect(doc, margin, yPos, contentWidth, escalaH, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(30, 41, 59);
  doc.text('Escala de logro (semáforo)', margin + 3, yPos + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text('Verde: AD y A · Amarillo: B · Rojo: C', margin + 3, yPos + 8.5);

  const defs = [
    { code: 'AD', txt: 'Destacado', rgb: [34, 197, 94] },
    { code: 'A', txt: 'Logrado', rgb: [74, 222, 128] },
    { code: 'B', txt: 'En proceso', rgb: [234, 179, 8] },
    { code: 'C', txt: 'En inicio', rgb: [239, 68, 68] }
  ];
  const slotW = (contentWidth - 10) / 4;
  defs.forEach((d, i) => {
    const x0 = margin + 5 + i * slotW;
    doc.setFillColor(...d.rgb);
    if (typeof doc.circle === 'function') {
      doc.circle(x0 + 3.2, yPos + 14.5, 2.3, 'F');
    } else {
      doc.rect(x0 + 1, yPos + 12.5, 4.5, 4.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(d.code, x0 + 7.5, yPos + 15.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.text(d.txt, x0 + 2, yPos + 19);
  });
  yPos += escalaH + 2.5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setDrawColor(71, 85, 105);
  doc.setFillColor(...colorLabel);
  doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
  doc.text('Áreas y competencias', margin + colAreaWidth / 2, yPos + 3.5, { align: 'center' });
  doc.rect(margin + colAreaWidth, yPos, colNotaWidth, headerHeight, 'FD');
  doc.text('Nota', margin + colAreaWidth + colNotaWidth / 2, yPos + 3.5, { align: 'center' });
  doc.rect(margin + colAreaWidth + colNotaWidth, yPos, colDetalleWidth, headerHeight, 'FD');
  doc.text('Descripción de la nota', margin + colAreaWidth + colNotaWidth + colDetalleWidth / 2, yPos + 3.5, {
    align: 'center'
  });
  yPos += headerHeight;

  const bimLabel = cicloSel;
  const getNota = (item) => {
    const nota = item[`nota_b${bimLabel}`];
    return nota !== null && nota !== '' && nota !== undefined ? String(nota) : '-';
  };
  const getTextoDetalle = (item) => {
    const expl = (item.explicacion || '').trim();
    if (expl) return expl;
    return getNota(item) !== '-' ? getNota(item) : '-';
  };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);

  (datosLibreta.cursos_cualitativos || []).forEach((curso) => {
    ensureSpace(headerHeight + 8);
    doc.setDrawColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...colorLabel);
    doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
    doc.setTextColor(17, 24, 39);
    doc.text(String(curso.curso_nombre || '').toUpperCase(), margin + 2, yPos + 3.5);
    const vCurso = curso[`promedio_b${bimLabel}`];
    doc.setFillColor(...colorLabel);
    doc.rect(margin + colAreaWidth, yPos, colNotaWidth, headerHeight, 'FD');
    const promTxt =
      vCurso !== null && vCurso !== '' && vCurso !== '-' ? String(vCurso) : '-';
    doc.text(promTxt, margin + colAreaWidth + colNotaWidth / 2, yPos + 3.5, { align: 'center' });
    doc.setFillColor(...colorLabel);
    doc.rect(margin + colAreaWidth + colNotaWidth, yPos, colDetalleWidth, headerHeight, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.text('—', margin + colAreaWidth + colNotaWidth + colDetalleWidth / 2, yPos + 3.5, { align: 'center' });
    yPos += headerHeight;

    (curso.criterios || []).forEach((cr) => {
      if (cr.indicadores && cr.indicadores.length > 0) {
        cr.indicadores.forEach((ind) => {
          const textoDetalle = getTextoDetalle(ind);
          const lineas = doc.splitTextToSize(textoDetalle || '—', colDetalleWidth - 4);
          const descFull = (ind.descripcion || ind.abreviatura || '').trim() || '—';
          const lineasDesc = doc.splitTextToSize(descFull, colAreaWidth - 4);
          const rowHeight = Math.max(headerHeight, Math.max(lineasDesc.length, 1) * 3.8 + 4, lineas.length * 3.8 + 4);
          ensureSpace(rowHeight + 2);
          doc.setDrawColor(71, 85, 105);
          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, rowHeight, 'FD');
          doc.setTextColor(30, 41, 59);
          let yd = yPos + 4;
          lineasDesc.forEach((ln) => {
            doc.text(ln, margin + 2, yd);
            yd += 3.8;
          });
          const notaStr = getNota(ind);
          const st = getNotaCualitativaPdfStyle(notaStr);
          doc.setDrawColor(...st.stroke);
          doc.setFillColor(...st.fill);
          doc.rect(margin + colAreaWidth, yPos, colNotaWidth, rowHeight, 'FD');
          doc.setTextColor(...st.text);
          doc.setFont('helvetica', 'bold');
          doc.text(notaStr, margin + colAreaWidth + colNotaWidth / 2, yPos + rowHeight / 2 + 1.2, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.setDrawColor(71, 85, 105);
          doc.setFillColor(...colorData);
          doc.rect(margin + colAreaWidth + colNotaWidth, yPos, colDetalleWidth, rowHeight, 'FD');
          let yy = yPos + 4;
          lineas.forEach((l) => {
            doc.text(l, margin + colAreaWidth + colNotaWidth + 2, yy);
            yy += 3.8;
          });
          yPos += rowHeight;
        });
      } else {
        const textoDetalle = getTextoDetalle(cr);
        const lineas = doc.splitTextToSize(textoDetalle || '—', colDetalleWidth - 4);
        const descFull = (cr.descripcion || cr.abreviatura || '').trim() || '—';
        const lineasDesc = doc.splitTextToSize(descFull, colAreaWidth - 4);
        const rowHeight = Math.max(headerHeight, Math.max(lineasDesc.length, 1) * 3.8 + 4, lineas.length * 3.8 + 4);
        ensureSpace(rowHeight + 2);
        doc.setDrawColor(71, 85, 105);
        doc.setFillColor(...colorData);
        doc.rect(margin, yPos, colAreaWidth, rowHeight, 'FD');
        let yd = yPos + 4;
        lineasDesc.forEach((ln) => {
          doc.text(ln, margin + 2, yd);
          yd += 3.8;
        });
        const notaStr = getNota(cr);
        const st = getNotaCualitativaPdfStyle(notaStr);
        doc.setDrawColor(...st.stroke);
        doc.setFillColor(...st.fill);
        doc.rect(margin + colAreaWidth, yPos, colNotaWidth, rowHeight, 'FD');
        doc.setTextColor(...st.text);
        doc.setFont('helvetica', 'bold');
        doc.text(notaStr, margin + colAreaWidth + colNotaWidth / 2, yPos + rowHeight / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.setFillColor(...colorData);
        doc.rect(margin + colAreaWidth + colNotaWidth, yPos, colDetalleWidth, rowHeight, 'FD');
        let yy = yPos + 4;
        lineas.forEach((l) => {
          doc.text(l, margin + colAreaWidth + colNotaWidth + 2, yy);
          yy += 3.8;
        });
        yPos += rowHeight;
      }
    });
  });

  yPos += 4;

  const resumenWidth = 96;
  const recomWidth = contentWidth - resumenWidth - 8;
  const resumenInicioY = yPos;

  ensureSpace(28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setFillColor(...colorLabel);
  doc.rect(margin, yPos, resumenWidth, headerHeight, 'FD');
  doc.setTextColor(17, 24, 39);
  doc.text('Cuadro resumen', margin + resumenWidth / 2, yPos + 3.5, { align: 'center' });
  yPos += headerHeight;
  const resumen = datosLibreta.resumen || {};
  const filasResumen = [
    ['Cursos', [resumen.cantidad_cursos?.b1, resumen.cantidad_cursos?.b2, resumen.cantidad_cursos?.b3, resumen.cantidad_cursos?.b4]],
    ['Conducta', [resumen.promedio_conducta?.b1, resumen.promedio_conducta?.b2, resumen.promedio_conducta?.b3, resumen.promedio_conducta?.b4]],
    ['Inasistencias', [resumen.inasistencias?.b1, resumen.inasistencias?.b2, resumen.inasistencias?.b3, resumen.inasistencias?.b4]],
    ['Tardanzas', [resumen.tardanzas?.b1, resumen.tardanzas?.b2, resumen.tardanzas?.b3, resumen.tardanzas?.b4]]
  ];
  const colResumenArea = 52;
  const colResumenBim = (resumenWidth - colResumenArea) / 4;
  filasResumen.forEach(([label, vals]) => {
    ensureSpace(headerHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...colorLabel);
    doc.rect(margin, yPos, colResumenArea, headerHeight, 'FD');
    doc.text(label, margin + 2, yPos + 3.5);
    doc.setFont('helvetica', 'normal');
    for (let i = 0; i < 4; i++) {
      const v = vals[i];
      doc.setFillColor(...colorData);
      doc.rect(margin + colResumenArea + i * colResumenBim, yPos, colResumenBim, headerHeight, 'FD');
      doc.setTextColor(30, 41, 59);
      doc.text(
        i + 1 <= cicloSel && v !== null && v !== undefined && v !== '' ? String(v) : '—',
        margin + colResumenArea + (i + 0.5) * colResumenBim,
        yPos + 3.5,
        { align: 'center' }
      );
    }
    yPos += headerHeight;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Observaciones del tutor(a)', margin + resumenWidth + 8, resumenInicioY + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  const textoRecom = (datosLibreta.recomendaciones || '').trim() || '(Sin observaciones)';
  const lineasRecom = doc.splitTextToSize(textoRecom, recomWidth - 4);
  let recomY = resumenInicioY + 5;
  lineasRecom.forEach((linea) => {
    if (recomY > pageHeight - 30) {
      doc.addPage();
      recomY = margin;
    }
    doc.text(linea, margin + resumenWidth + 8, recomY);
    recomY += 3.8;
  });
  yPos = Math.max(yPos, recomY + 6);

  ensureSpace(22);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  const firmaWidth = 72;
  const firmaX = (pageWidth - firmaWidth) / 2;
  doc.setLineWidth(0.45);
  doc.setDrawColor(30, 41, 59);
  doc.line(firmaX, yPos, firmaX + firmaWidth, yPos);
  yPos += 11;
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección Académica', firmaX + firmaWidth / 2, yPos, { align: 'center' });
}
