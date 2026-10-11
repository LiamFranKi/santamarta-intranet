import api from '../services/api';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { getLibretaPdfLabelFillRgb } from './libretaPdfColors';
import { renderLibretaInicialBoleta } from './libretaInicialPdf';
import {
  buildValoresFilaLibreta,
  dibujarFilaValoresLibreta,
  dibujarCeldaNotaLibreta,
} from './libretaCuantitativaPdf';
import { normalizarRangosLetras } from './notaLetraConversion';
import { formatearTutoresLibreta } from './tutoresGrupoTexto';
import { descargarCnebHijoConAviso, esInicialEnAnio } from './cnebHijoPdfs';
import { esInicialLibretaPrevia } from './inicialLibretaPrevia';

export async function fetchYExportarLibretaAlumno(hijoId, ciclo = 1, anio = null) {
  try {
    const params = { ciclo };
    if (anio != null && anio > 0) params.anio = anio;
    const response = await api.get(`/docente/hijos/${hijoId}/libreta`, { params });
    await renderLibretaAlumnoPdf(response.data, ciclo);
  } catch (error) {
    console.error('Error generando libreta:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.response?.data?.error || 'No se pudo generar la libreta',
      confirmButtonText: 'Entendido',
    });
  }
}

/**
 * Selector año/bimestre + PDF de un solo alumno (Tutoría, Admin → Lista de alumnos, hijos).
 * Informe y libreta CNEB si ese año es cualitativo, o si el bimestre elegido es la prueba CNEB.
 * Inicial 2026 es la excepción: descarga la boleta de áreas e indicadores del aula.
 * Desde 2027, cualitativo (Inicial, Primaria o Secundaria) vuelve al CNEB.
 * La boleta numérica se usa en los demás bimestres. No borra notas.
 */
export async function promptYExportarLibretaAlumno(
  alumnoId,
  { anioDefault, apiBase = '/docente/hijos', grupoEsInicial } = {}
) {
  const id = parseInt(alumnoId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    await Swal.fire({ icon: 'error', title: 'Error', text: 'Alumno no válido.' });
    return false;
  }
  try {
    const base = String(apiBase || '/docente/hijos').replace(/\/$/, '');
    const { data } = await api.get(`${base}/${id}/libreta-anios`);
    const anios = [...new Set((data?.anios || []).map((y) => parseInt(y, 10)).filter((y) => Number.isFinite(y) && y > 0))].sort(
      (a, b) => b - a
    );
    if (!anios.length) {
      await Swal.fire({
        icon: 'info',
        title: 'Sin datos',
        text: 'No hay años con matrícula para este alumno.',
      });
      return false;
    }
    const niveles = data?.niveles || {};
    const pref = parseInt(anioDefault, 10);
    const anioSel = anios.includes(pref) ? pref : anios[0];
    const nivelDe = (y) => niveles?.[String(y)] || niveles?.[y] || {};
    const esLibretaPreviaAnio = (y) => esInicialLibretaPrevia(y, nivelDe(y).nivel_nombre);
    const anioCualitativo = (y) => {
      if (esLibretaPreviaAnio(y)) return false;
      if (grupoEsInicial === true) return true;
      if (grupoEsInicial === false) return false;
      return esInicialEnAnio(niveles, y);
    };
    const cnebBimestreDe = (y) => {
      const n = nivelDe(y);
      const b = Number(n?.cneb_bimestre);
      return b >= 1 && b <= 4 ? b : null;
    };
    const usaCnebDoc = (y, ciclo) => {
      if (esLibretaPreviaAnio(y)) return false;
      return anioCualitativo(y) || cnebBimestreDe(y) === Number(ciclo);
    };
    const puedeCnebAlgunaVez = anios.some((y) => usaCnebDoc(y, cnebBimestreDe(y) || 1) || anioCualitativo(y));
    const textoHint = (y, ciclo) => {
      if (esLibretaPreviaAnio(y)) {
        return 'Se descargará la libreta de Inicial de este bimestre, con las áreas e indicadores del aula.';
      }
      if (anioCualitativo(y)) {
        return 'En un nivel cualitativo puede descargar la <b>libreta</b> (resumen para la familia) o el <b>informe de progreso</b> (detalle CNEB).';
      }
      const b = cnebBimestreDe(y);
      if (b && Number(ciclo) === b) {
        return `El <b>${b}.º bimestre</b> de este nivel se evalúa con CNEB. Los otros bimestres descargan la boleta numérica, con las notas que ya tienen.`;
      }
      if (b) {
        return `Este bimestre descarga la boleta numérica. El ${b}.º bimestre descarga la libreta CNEB.`;
      }
      return 'Se descargará la libreta de este alumno.';
    };
    const { isConfirmed, value } = await Swal.fire({
      title: usaCnebDoc(anioSel, 1) ? 'Libreta e informe' : 'Ver Libreta',
      html: `
        <p id="swal-libreta-alumno-hint" style="text-align:left;margin:0 0 12px;color:#475569;font-size:0.92rem">
          ${textoHint(anioSel, 1)}
        </p>
        <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Año</label>
        <select id="swal-libreta-alumno-anio" class="swal2-input" style="width:100%;margin-bottom:12px">
          ${anios.map((a) => `<option value="${a}"${a === anioSel ? ' selected' : ''}>${a}</option>`).join('')}
        </select>
        <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Bimestre</label>
        <select id="swal-libreta-alumno-ciclo" class="swal2-input" style="width:100%">
          <option value="1">I Bimestre</option>
          <option value="2">II Bimestre</option>
          <option value="3">III Bimestre</option>
          <option value="4">IV Bimestre</option>
        </select>
        ${puedeCnebAlgunaVez
          ? `<div id="swal-cneb-doc-box" style="text-align:left;margin-top:14px;padding:10px 12px;background:#f0fdfa;border-radius:10px;border:1px solid #99f6e4;${usaCnebDoc(anioSel, 1) ? '' : 'display:none'}">
              <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer;font-size:0.92rem">
                <input type="radio" name="swal-cneb-doc" value="libreta" checked style="margin-top:3px">
                <span><b>Libreta</b> — resumen con letras AD/A/B/C, para el hogar.</span>
              </label>
              <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:0.92rem">
                <input type="radio" name="swal-cneb-doc" value="informe" style="margin-top:3px">
                <span><b>Informe de progreso</b> — completo (capacidades, estándar y desempeños).</span>
              </label>
            </div>`
          : ''}
      `,
      showCancelButton: true,
      confirmButtonText: 'Descargar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const sel = document.getElementById('swal-libreta-alumno-anio');
        const cicloSel = document.getElementById('swal-libreta-alumno-ciclo');
        const box = document.getElementById('swal-cneb-doc-box');
        const hint = document.getElementById('swal-libreta-alumno-hint');
        const sync = () => {
          const y = parseInt(sel?.value, 10);
          const ciclo = parseInt(cicloSel?.value, 10) || 1;
          const cneb = usaCnebDoc(y, ciclo);
          if (box) box.style.display = cneb ? 'block' : 'none';
          if (hint) hint.innerHTML = textoHint(y, ciclo);
          const popup = document.querySelector('.swal2-title');
          if (popup) popup.textContent = cneb ? 'Libreta e informe' : 'Ver Libreta';
        };
        sel?.addEventListener('change', sync);
        cicloSel?.addEventListener('change', sync);
        sync();
      },
      preConfirm: () => ({
        anio: parseInt(document.getElementById('swal-libreta-alumno-anio')?.value, 10),
        ciclo: parseInt(document.getElementById('swal-libreta-alumno-ciclo')?.value, 10),
        tipo: document.querySelector('input[name="swal-cneb-doc"]:checked')?.value || 'libreta',
      }),
    });
    if (!isConfirmed || !value) return false;
    const usarCneb = usaCnebDoc(value.anio, value.ciclo);
    if (usarCneb) {
      return descargarCnebHijoConAviso({
        apiBase: base,
        hijoId: id,
        tipo: value.tipo === 'informe' ? 'informe' : 'libreta',
        anio: value.anio,
        bimestre: value.ciclo,
      });
    }
    Swal.fire({ title: 'Generando libreta…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const params = { ciclo: value.ciclo };
      if (value.anio > 0) params.anio = value.anio;
      const response = await api.get(`${base}/${id}/libreta`, { params });
      Swal.close();
      await renderLibretaAlumnoPdf(response.data, value.ciclo);
      return true;
    } catch (error) {
      Swal.close();
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo generar la libreta',
        confirmButtonText: 'Entendido',
      });
      return false;
    }
  } catch (e) {
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: e.response?.data?.error || 'No se pudo generar la libreta',
    });
    return false;
  }
}

/**
 * @param {object} [options]
 * @param {import('jspdf').jsPDF} [options.doc] — documento existente (export grupal)
 * @param {boolean} [options.save=true] — si false, no descarga (solo dibuja en doc)
 * @param {boolean} [options.addPageBefore=false] — nueva página antes de este alumno
 */
export async function renderLibretaAlumnoPdf(datosLibreta, ciclo = 1, options = {}) {
  const { doc: externalDoc, save = true, addPageBefore = false } = options;
  try {
      if (!datosLibreta || !datosLibreta.alumno) {
        if (save) {
          Swal.fire({
            icon: 'info',
            title: 'Sin datos',
            text: 'No hay datos disponibles para generar la libreta',
            confirmButtonText: 'Entendido',
          });
        }
        return externalDoc || null;
      }

      const doc =
        externalDoc ||
        new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

      if (addPageBefore) {
        doc.addPage();
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 5;
      const paddingVertical = 20; // Padding superior e inferior aumentado
      const contentWidth = pageWidth - (margin * 2);

      // Logo de la libreta (subido) o, si no hay, el logo a color. Sin archivo fijo.
      let logoWidth = 0;
      let logoHeight = 0;
      let fondoData = null;
      let fondoImg = null;
      const cargarImagenPdf = async (url) => {
        if (!url) return null;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('imagen'));
          img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return { img, data: canvas.toDataURL('image/png') };
      };
      try {
        const { imagenesLibretaPdf } = await import('./pdfReporteColegioLogo');
        const { header, fondo } = await imagenesLibretaPdf();
        const cabecera = await cargarImagenPdf(header).catch(() => null);
        if (cabecera) {
          logoWidth = 20;
          logoHeight = (cabecera.img.height / cabecera.img.width) * logoWidth;
          doc.addImage(cabecera.data, 'PNG', margin, margin, logoWidth, logoHeight);
        }
        const marca = await cargarImagenPdf(fondo).catch(() => null);
        if (marca) {
          fondoImg = marca.img;
          fondoData = marca.data;
        }
      } catch (error) {
        console.log('No se pudo cargar el logo, continuando sin él');
      }

      // Título de la intranet en la esquina superior derecha
      const tituloIntranet = datosLibreta.titulo_intranet || 'INTRANET VANGUARD SCHOOLS';
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0); // Color negro explícito
      const tituloX = pageWidth - margin - 5; // 5mm desde el borde derecho
      doc.text(tituloIntranet.toUpperCase(), tituloX, margin + 5, { align: 'right' });

      // Marca de agua: fondo de la libreta, o el mismo logo de cabecera
      if (fondoData && fondoImg) {
        try {
          const watermarkCanvas = document.createElement('canvas');
          watermarkCanvas.width = fondoImg.width;
          watermarkCanvas.height = fondoImg.height;
          const watermarkCtx = watermarkCanvas.getContext('2d');
          watermarkCtx.globalAlpha = 0.2;
          watermarkCtx.drawImage(fondoImg, 0, 0);
          const watermarkData = watermarkCanvas.toDataURL('image/png');

          const watermarkWidth = 150;
          const watermarkHeight = (fondoImg.height / fondoImg.width) * watermarkWidth;
          const watermarkX = (pageWidth - watermarkWidth) / 2; // Centrado horizontal
          const watermarkY = (pageHeight - watermarkHeight) / 2; // Centrado vertical
          
          doc.addImage(watermarkData, 'PNG', watermarkX, watermarkY, watermarkWidth, watermarkHeight);
        } catch (error) {
          console.log('No se pudo agregar el watermark del logo');
        }
      }

      const cicloSel = datosLibreta.ciclo || ciclo || 1;
      const esInicial = datosLibreta.es_cualitativa && datosLibreta.cursos_cualitativos;
      const headerHeight = 5;
      const borderWidth = 0.5;
      const colorLabel = getLibretaPdfLabelFillRgb(datosLibreta);
      const colorData = [255, 255, 255];

      if (esInicial) {
        const yBanner = Math.max(margin + 12, margin + (logoHeight || 18) + 1);
        await renderLibretaInicialBoleta(doc, {
          datosLibreta,
          pageWidth,
          pageHeight,
          margin,
          contentWidth,
          borderWidth,
          colorLabel,
          colorData,
          cicloSel,
          yStart: yBanner,
          logoHeightMm: logoHeight || 0
        });
      } else {
      let yPos = margin + paddingVertical;
      // Header con título (Primaria / Secundaria)
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('BOLETA DE INFORMACIÓN ACADÉMICA', pageWidth / 2, yPos + 10, { align: 'center' });
      yPos += 20;

      doc.setFontSize(9);
      doc.setLineWidth(borderWidth);
      doc.setDrawColor(0, 0, 0);

      // Fila 1: ALUMNO y CÓDIGO
      // Label ALUMNO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos ALUMNO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 95, headerHeight, 'FD');
      // Label CÓDIGO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos CÓDIGO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('ALUMNO', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.nombre_completo || '-', margin + 87.5, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('CÓDIGO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.codigo || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Fila 2: GRADO/SECCIÓN, NIVEL, TURNO
      // Label GRADO/SECCIÓN (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos GRADO/SECCIÓN (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 30, headerHeight, 'FD');
      // Label NIVEL (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 70, yPos, 30, headerHeight, 'FD');
      // Datos NIVEL (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 100, yPos, 35, headerHeight, 'FD');
      // Label TURNO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos TURNO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.text('GRADO / SECCIÓN', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(`${datosLibreta.alumno.grado}° ${datosLibreta.alumno.seccion || ''}`, margin + 55, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('NIVEL', margin + 85, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.nivel_nombre || '-', margin + 117.5, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text('TURNO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.turno_nombre || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Fila 3: PROFESOR/TUTOR y AÑO
      // Label PROFESOR/TUTOR (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, 40, headerHeight, 'FD');
      // Datos PROFESOR/TUTOR (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 40, yPos, 95, headerHeight, 'FD');
      // Label AÑO (azul)
      doc.setFillColor(...colorLabel);
      doc.rect(margin + 135, yPos, 30, headerHeight, 'FD');
      // Datos AÑO (blanco)
      doc.setFillColor(...colorData);
      doc.rect(margin + 165, yPos, 35, headerHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.text('TUTORES', margin + 20, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      const tutorLibretaTxt = formatearTutoresLibreta(datosLibreta.alumno);
      doc.text(
        tutorLibretaTxt.length > 72 ? `${tutorLibretaTxt.slice(0, 69)}…` : tutorLibretaTxt,
        margin + 87.5,
        yPos + 3.5,
        { align: 'center' }
      );
      doc.setFont('helvetica', 'bold');
      doc.text('AÑO', margin + 150, yPos + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(datosLibreta.alumno.anio?.toString() || '-', margin + 182.5, yPos + 3.5, { align: 'center' });
      yPos += headerHeight + 5; // 5mm de espacio entre cuadros

      const numCols = 5;
      const colAreaWidth = 80;
      const colBimestreWidth = (contentWidth - colAreaWidth) / numCols;
      const rangosLetras = normalizarRangosLetras(datosLibreta.rangos_letras);

        // ========== LAYOUT CUANTITATIVO (PRIMARIA/SECUNDARIA) ==========
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setLineWidth(borderWidth);
      
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
      doc.text('ÁREAS CURRICULARES', margin + colAreaWidth / 2, yPos + 3.5, { align: 'center' });
      let xPos = margin + colAreaWidth;
      for (let c = 1; c <= 4; c++) {
        doc.setFillColor(...colorLabel);
        doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
        doc.text(`B - ${c}`, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
        xPos += colBimestreWidth;
      }
      doc.setFillColor(...colorLabel);
      doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
      doc.text('PF', xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      // Áreas y asignaturas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      datosLibreta.areas.forEach(area => {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin;
        }
        const areaValores = buildValoresFilaLibreta(area, cicloSel);

        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
        doc.text(area.area_nombre.toUpperCase(), margin + 2, yPos + 3.5);
        dibujarFilaValoresLibreta(doc, {
          xStart: margin + colAreaWidth,
          y: yPos,
          colWidth: colBimestreWidth,
          rowHeight: headerHeight,
          valores: areaValores,
          fillRgb: colorLabel,
          rangosLetras,
          cicloSel,
        });
        yPos += headerHeight;

        doc.setFont('helvetica', 'normal');
        area.asignaturas.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }
          const asigValores = buildValoresFilaLibreta(asignatura, cicloSel);

          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          dibujarFilaValoresLibreta(doc, {
            xStart: margin + colAreaWidth,
            y: yPos,
            colWidth: colBimestreWidth,
            rowHeight: headerHeight,
            valores: asigValores,
            fillRgb: colorData,
            rangosLetras,
            cicloSel,
          });
          yPos += headerHeight;
        });
      });

      if (datosLibreta.asignaturas_sin_area && datosLibreta.asignaturas_sin_area.length > 0) {
        datosLibreta.asignaturas_sin_area.forEach(asignatura => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = margin + paddingVertical;
          }
          const asigValores = buildValoresFilaLibreta(asignatura, cicloSel);

          doc.setFillColor(...colorData);
          doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
          doc.text(asignatura.curso_nombre.toUpperCase(), margin + 2, yPos + 3.5);
          dibujarFilaValoresLibreta(doc, {
            xStart: margin + colAreaWidth,
            y: yPos,
            colWidth: colBimestreWidth,
            rowHeight: headerHeight,
            valores: asigValores,
            fillRgb: colorData,
            rangosLetras,
            cicloSel,
          });
          yPos += headerHeight;
        });
      }

      yPos += 5;

      if (yPos > pageHeight - 70) {
        doc.addPage();
        yPos = margin + paddingVertical;
      }

      const resumen = datosLibreta.resumen;
      const resumenWidth = colAreaWidth + (colBimestreWidth * numCols);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(...colorLabel);
      doc.rect(margin, yPos, resumenWidth, headerHeight, 'FD');
      doc.text('CUADRO RESUMEN', margin + resumenWidth / 2, yPos + 3.5, { align: 'center' });
      yPos += headerHeight;

      doc.setFont('helvetica', 'normal');
      const cantB = []; for (let c = 1; c <= 4; c++) cantB.push(c <= cicloSel ? resumen.cantidad_cursos[`b${c}`] : null);
      const sumaB = []; for (let c = 1; c <= 4; c++) sumaB.push(c <= cicloSel ? resumen.suma_notas[`b${c}`] : null);
      const promB = []; for (let c = 1; c <= 4; c++) promB.push(c <= cicloSel ? resumen.promedio[`b${c}`] : null);
      const condB = []; for (let c = 1; c <= 4; c++) condB.push(c <= cicloSel ? resumen.promedio_conducta[`b${c}`] : null);
      const condIncB = []; for (let c = 1; c <= 4; c++) condIncB.push(c <= cicloSel ? resumen.conducta_incidencias?.[`b${c}`] : null);
      const condPresB = []; for (let c = 1; c <= 4; c++) condPresB.push(c <= cicloSel ? resumen.conducta_presentacion?.[`b${c}`] : null);
      const condTardNotaB = []; for (let c = 1; c <= 4; c++) condTardNotaB.push(c <= cicloSel ? resumen.conducta_tardanzas?.[`b${c}`] : null);
      const condOlvidoB = []; for (let c = 1; c <= 4; c++) condOlvidoB.push(c <= cicloSel ? resumen.conducta_olvido_qr?.[`b${c}`] : null);
      const ordB = []; for (let c = 1; c <= 4; c++) ordB.push(c <= cicloSel ? resumen.orden_merito[`b${c}`] : null);
      const inasB = []; for (let c = 1; c <= 4; c++) inasB.push(c <= cicloSel ? resumen.inasistencias[`b${c}`] : null);
      const tardB = []; for (let c = 1; c <= 4; c++) tardB.push(c <= cicloSel ? resumen.tardanzas[`b${c}`] : null);

      const dibFila = (label, arr, def = '-') => {
        // Ocultas en impresión (no borrar: datos y filas siguen calculados).
        if (
          label === 'COND. INCIDENCIAS' ||
          label === 'COND. PRESENTACIÓN' ||
          label === 'COND. TARDANZAS' ||
          label === 'COND. OLVIDO QR'
        ) {
          return;
        }
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yPos, colAreaWidth, headerHeight, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin + 2, yPos + 3.5);
        doc.setFont('helvetica', 'normal');
        xPos = margin + colAreaWidth;
        arr.forEach((v) => {
          doc.setFillColor(...colorData);
          doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
          doc.text(v !== null && v !== undefined && v !== '' ? String(v) : def, xPos + colBimestreWidth / 2, yPos + 3.5, { align: 'center' });
          xPos += colBimestreWidth;
        });
        let col5Val = '-';
        if (label === 'PROMEDIO') {
          col5Val = promB.filter(p => p != null && p !== '').length > 0
            ? String(Math.round(promB.filter(p => p != null && p !== '').map(Number).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / promB.filter(p => p != null && p !== '').length))
            : (resumen.promedio?.final != null ? String(resumen.promedio.final) : '-');
        } else if (label === 'PROMEDIO CONDUCTA') {
          col5Val = resumen.promedio_conducta?.final != null && resumen.promedio_conducta.final !== ''
            ? String(resumen.promedio_conducta.final) : (condB.filter(c => c != null && c !== '').length > 0
              ? String(Math.round(condB.filter(c => c != null && c !== '').map(Number).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / condB.filter(c => c != null && c !== '').length))
              : '-');
        }
        doc.setFillColor(...colorData);
        if (label === 'PROMEDIO' && col5Val !== '-') {
          dibujarCeldaNotaLibreta(doc, {
            x: xPos,
            y: yPos,
            w: colBimestreWidth,
            h: headerHeight,
            valor: col5Val,
            fillRgb: colorData,
            esPf: true,
            rangosLetras,
          });
        } else {
          doc.rect(xPos, yPos, colBimestreWidth, headerHeight, 'FD');
          doc.text(
            (label === 'PROMEDIO' || label === 'PROMEDIO CONDUCTA') && col5Val !== '-'
              ? col5Val
              : '-',
            xPos + colBimestreWidth / 2,
            yPos + 3.5,
            { align: 'center' }
          );
        }
        yPos += headerHeight;
      };

      dibFila('CANTIDAD DE CURSOS', cantB);
      dibFila('SUMA DE NOTAS', sumaB);
      dibFila('PROMEDIO', promB, '-');
      dibFila('PROMEDIO CONDUCTA', condB, '-');
      dibFila('COND. INCIDENCIAS', condIncB, '-');
      dibFila('COND. PRESENTACIÓN', condPresB, '-');
      dibFila('COND. TARDANZAS', condTardNotaB, '-');
      dibFila('COND. OLVIDO QR', condOlvidoB, '-');
      dibFila('ORDEN DE MÉRITO', ordB);
      dibFila('N° DE INASISTENCIAS', inasB, '0');
      dibFila('N° DE TARDANZAS', tardB, '0');
      yPos += 20; // 20mm de espacio después del cuadro resumen (5mm original + 15mm adicionales)

      // Footer: Recomendaciones
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Recomendaciones:', margin, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const textoRecomendaciones = (datosLibreta.recomendaciones || '').trim() || '(Sin recomendaciones)';
      const lineasRecomendaciones = doc.splitTextToSize(textoRecomendaciones, pageWidth - 2 * margin);
      lineasRecomendaciones.forEach((linea) => {
        doc.text(linea, margin, yPos);
        yPos += 5;
      });
      yPos += 25; // Más espacio entre Recomendaciones y la firma

      // Firma solo de Dirección Académica (centrada)
      doc.setFontSize(8);
      const firmaWidth = 70;
      const firmaX = (pageWidth - firmaWidth) / 2; // Centrar
      doc.setLineWidth(0.5); // Grosor de línea de 0.5mm
      doc.setDrawColor(0, 0, 0);
      doc.line(firmaX, yPos, firmaX + firmaWidth, yPos); // Línea de firma
      yPos += 12; // Más espacio entre línea y texto "Dirección Académica"

      doc.setFont('helvetica', 'bold'); // Texto en negrita
      doc.text('Dirección Académica', firmaX + firmaWidth / 2, yPos, { align: 'center' });

      // Libreta: por ahora solo la Boleta de Información Académica.
      // Código conservado; poner en true para volver a incluir estas hojas.
      const INCLUIR_HOJA_DETALLE_NOTAS_LIBRETA = false;
      const INCLUIR_HOJA_ORDEN_MERITO_LIBRETA = false;

      // Sección Detalle de Notas (explicaciones del docente por curso) — antes del Reporte de Orden de Mérito
      let detalleNotasDoc = datosLibreta.detalle_notas || [];
      if (INCLUIR_HOJA_DETALLE_NOTAS_LIBRETA && detalleNotasDoc.length === 0 && datosLibreta.areas) {
        // Fallback: construir desde areas/asignaturas_sin_area cuando no hay detalle_notas
        const items = [];
        (datosLibreta.areas || []).forEach(ar => {
          (ar.asignaturas || []).forEach(as => {
            const prom = as[`promedio_b${cicloSel}`];
            items.push({ curso_nombre: as.curso_nombre || '-', docente_nombre: '-', promedio: prom != null && prom !== '' ? prom : '-', explicacion: '-' });
          });
        });
        (datosLibreta.asignaturas_sin_area || []).forEach(as => {
          const prom = as[`promedio_b${cicloSel}`];
          items.push({ curso_nombre: as.curso_nombre || '-', docente_nombre: '-', promedio: prom != null && prom !== '' ? prom : '-', explicacion: '-' });
        });
        detalleNotasDoc = items;
      }
      if (INCLUIR_HOJA_DETALLE_NOTAS_LIBRETA && detalleNotasDoc.length > 0) {
        doc.addPage();
        let yDet = margin + 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Detalle de Notas — Explicaciones por Curso', margin, yDet);
        yDet += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(
          datosLibreta.es_cualitativa
            ? `DESCRIPCIÓN DE LA NOTA — ${datosLibreta.alumno?.grado}° ${datosLibreta.alumno?.seccion || ''}`
            : `Bimestre ${['I', 'II', 'III', 'IV'][(cicloSel || 1) - 1]} — ${datosLibreta.alumno?.grado}° ${datosLibreta.alumno?.seccion || ''}`,
          margin,
          yDet
        );
        yDet += 10;

        const colCurso = 45;
        const colDocente = 50;
        const colProm = 18;
        const colExp = pageWidth - margin * 2 - colCurso - colDocente - colProm;
        doc.setFillColor(...colorLabel);
        doc.rect(margin, yDet, colCurso, 6, 'FD');
        doc.rect(margin + colCurso, yDet, colDocente, 6, 'FD');
        doc.rect(margin + colCurso + colDocente, yDet, colProm, 6, 'FD');
        doc.rect(margin + colCurso + colDocente + colProm, yDet, colExp, 6, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Curso', margin + colCurso / 2, yDet + 4, { align: 'center' });
        doc.text('Docente', margin + colCurso + colDocente / 2, yDet + 4, { align: 'center' });
        doc.text('Prom.', margin + colCurso + colDocente + colProm / 2, yDet + 4, { align: 'center' });
        doc.text('Explicación', margin + colCurso + colDocente + colProm + colExp / 2, yDet + 4, { align: 'center' });
        yDet += 6;
        doc.setFont('helvetica', 'normal');
        detalleNotasDoc.forEach((row) => {
          const expl = (row.explicacion || '').trim() || '-';
          const curso = (row.curso_nombre || '-').trim();
          const docente = (row.docente_nombre || '-').trim();
          const lineasExp = doc.splitTextToSize(expl, colExp - 4);
          const lineasCurso = doc.splitTextToSize(curso, colCurso - 4);
          const lineasDocente = doc.splitTextToSize(docente, colDocente - 4);
          const filaAlt = Math.max(6, Math.max(lineasExp.length, lineasCurso.length, lineasDocente.length) * 4) + 4;
          if (yDet + filaAlt > pageHeight - 25) { doc.addPage(); yDet = margin; }
          doc.setFillColor(240, 247, 255);
          doc.rect(margin, yDet, colCurso, filaAlt, 'FD');
          doc.rect(margin + colCurso, yDet, colDocente, filaAlt, 'FD');
          doc.rect(margin + colCurso + colDocente, yDet, colProm, filaAlt, 'FD');
          doc.rect(margin + colCurso + colDocente + colProm, yDet, colExp, filaAlt, 'FD');
          let yyCurso = yDet + 4;
          lineasCurso.forEach((l) => { doc.text(l, margin + 2, yyCurso); yyCurso += 4; });
          let yyDocente = yDet + 4;
          lineasDocente.forEach((l) => { doc.text(l, margin + colCurso + 2, yyDocente); yyDocente += 4; });
          doc.text(String(row.promedio || '-'), margin + colCurso + colDocente + colProm / 2, yDet + filaAlt / 2 + 1.5, { align: 'center' });
          let yy = yDet + 4;
          lineasExp.forEach((l) => { doc.text(l, margin + colCurso + colDocente + colProm + 2, yy); yy += 4; });
          yDet += filaAlt;
        });
      }

      // Segunda hoja(s): lista de verificación orden de mérito por bimestre (solo libretas numéricas)
      const ordenMeritoDetalle = datosLibreta.resumen?.orden_merito_detalle;
      if (INCLUIR_HOJA_ORDEN_MERITO_LIBRETA && ordenMeritoDetalle && cicloSel >= 1) {
        const bimestresLabel = ['I', 'II', 'III', 'IV'];
        const colPuesto = 18;
        const colPromedio = 28;
        const colNombres = pageWidth - margin * 2 - colPuesto - colPromedio;
        for (let b = 1; b <= cicloSel; b++) {
          doc.addPage();
          let yP = margin + 12;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(`Reporte de Orden de Mérito — Bimestre ${bimestresLabel[b - 1]}`, margin, yP);
          yP += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`${datosLibreta.alumno.grado}° ${datosLibreta.alumno.seccion || ''} — ${datosLibreta.alumno.nivel_nombre || ''} — ${datosLibreta.alumno.anio || ''}`, margin, yP);
          yP += 8;
          const list = ordenMeritoDetalle[`b${b}`] || [];
          doc.setFillColor(...colorLabel);
          doc.rect(margin, yP, colPuesto, 6, 'FD');
          doc.rect(margin + colPuesto, yP, colNombres, 6, 'FD');
          doc.rect(margin + colPuesto + colNombres, yP, colPromedio, 6, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('Puesto', margin + colPuesto / 2, yP + 4, { align: 'center' });
          doc.text('Apellidos y Nombres', margin + colPuesto + colNombres / 2, yP + 4, { align: 'center' });
          doc.text('Promedio', margin + colPuesto + colNombres + colPromedio / 2, yP + 4, { align: 'center' });
          yP += 6;
          doc.setFont('helvetica', 'normal');
          list.forEach((row) => {
            if (yP > pageHeight - 20) { doc.addPage(); yP = margin; }
            const nombreCompleto = `${row.apellido_paterno || ''} ${row.apellido_materno || ''} ${row.nombres || ''}`.trim() || '-';
            doc.setFillColor(...colorData);
            doc.rect(margin, yP, colPuesto, 5, 'FD');
            doc.rect(margin + colPuesto, yP, colNombres, 5, 'FD');
            doc.rect(margin + colPuesto + colNombres, yP, colPromedio, 5, 'FD');
            doc.text(String(row.puesto), margin + colPuesto / 2, yP + 3.5, { align: 'center' });
            doc.text(nombreCompleto, margin + colPuesto + 2, yP + 3.5);
            doc.text(typeof row.promedio === 'number' ? row.promedio.toFixed(2) : String(row.promedio), margin + colPuesto + colNombres + colPromedio / 2, yP + 3.5, { align: 'center' });
            yP += 5;
          });
        }
      }
      } // fin else layout cuantitativo

      if (save) {
        const nombreArchivo = `Libreta_${datosLibreta.alumno.apellido_paterno?.replace(/\s+/g, '_') || 'libreta'}_${new Date().getTime()}.pdf`;
        doc.save(nombreArchivo);
      }
      return doc;
  } catch (error) {
    console.error('Error render libreta:', error);
    if (save) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo generar la libreta',
        confirmButtonText: 'Entendido',
      });
    }
    return externalDoc || null;
  }
}
