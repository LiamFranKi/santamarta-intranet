/**
 * Genera PDF de notas para TUTORÍA - un grupo con todos sus cursos, hoja por hoja
 * Igual formato que CURSOS ASIGNADOS - REGISTRAR NOTAS - Imprimir
 */
import jsPDF from 'jspdf';

// Helpers para cálculo de promedios (solo datos de API, sin ediciones)
function calcPromedioIndicador(alumno, criterioId, indicadorId) {
  const vals = alumno.notas_detalladas?.[criterioId]?.[indicadorId];
  if (!vals || !Array.isArray(vals)) {
    const obj = alumno.notas_detalladas?.[criterioId]?.[indicadorId];
    if (obj && typeof obj === 'object') {
      const arr = Object.keys(obj).sort((a, b) => parseInt(a) - parseInt(b)).map(k => obj[k]);
      const nums = arr.map(n => parseFloat(n)).filter(n => !isNaN(n) && n !== null && n !== '');
      return nums.length > 0 ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : null;
    }
    return null;
  }
  const nums = vals.map(n => parseFloat(n)).filter(n => !isNaN(n) && n !== null && n !== '');
  return nums.length > 0 ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : null;
}

function calcPromedioCriterio(datosNotas, matriculaId, criterioId) {
  const criterio = datosNotas?.criterios?.find(c => c.id === criterioId);
  if (!criterio) return null;
  const alumno = datosNotas?.alumnos?.find(a => a.matricula_id === matriculaId);
  if (!alumno) return null;

  if (criterio.indicadores && criterio.indicadores.length > 0) {
    const proms = criterio.indicadores
      .map(ind => calcPromedioIndicador(alumno, criterioId, ind.id))
      .filter(p => p !== null);
    return proms.length > 0 ? Math.round(proms.reduce((s, p) => s + p, 0) / proms.length) : null;
  }
  const nota = alumno.notas_criterios?.[criterioId];
  if (nota !== undefined && nota !== null && nota !== '') {
    const n = parseFloat(nota);
    return !isNaN(n) ? Math.round(n) : null;
  }
  return null;
}

function calcPromedioFinal(datosNotas, matriculaId) {
  if (!datosNotas?.criterios) return null;
  const tipo = datosNotas.curso?.nivel?.tipo_calificacion_final || 0;

  if (tipo === 1) {
    let sumaP = 0, sumaPesos = 0;
    datosNotas.criterios.forEach(c => {
      const prom = calcPromedioCriterio(datosNotas, matriculaId, c.id);
      const peso = parseFloat(c.peso) || 0;
      if (prom !== null && peso > 0) {
        sumaP += (prom * peso / 100);
        sumaPesos += peso;
      }
    });
    if (datosNotas.curso.examen_mensual) {
      const alumno = datosNotas.alumnos?.find(a => a.matricula_id === matriculaId);
      const e1 = parseFloat(alumno?.examenes_mensuales?.[1] || 0);
      const e2 = parseFloat(alumno?.examenes_mensuales?.[2] || 0);
      if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0) {
        const promEx = Math.round((e1 + e2) / 2);
        const pesoEx = datosNotas.curso.peso_examen_mensual || 0;
        if (pesoEx > 0) { sumaP += (promEx * pesoEx / 100); sumaPesos += pesoEx; }
      }
    }
    return sumaPesos > 0 ? Math.round(sumaP) : null;
  }

  const proms = datosNotas.criterios
    .map(c => calcPromedioCriterio(datosNotas, matriculaId, c.id))
    .filter(p => p !== null);
  if (proms.length === 0) return null;
  let suma = proms.reduce((s, p) => s + p, 0), count = proms.length;
  if (datosNotas.curso.examen_mensual) {
    const alumno = datosNotas.alumnos?.find(a => a.matricula_id === matriculaId);
    const e1 = parseFloat(alumno?.examenes_mensuales?.[1] || 0);
    const e2 = parseFloat(alumno?.examenes_mensuales?.[2] || 0);
    if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0) {
      suma += Math.round((e1 + e2) / 2);
      count += 1;
    }
  }
  return Math.round(suma / count);
}

function getNotaValor(alumno, criterioId, indicadorId, indice) {
  const nd = alumno.notas_detalladas?.[criterioId]?.[indicadorId];
  if (!nd) return '';
  const arr = Array.isArray(nd) ? nd : (typeof nd === 'object' ? Object.keys(nd).sort((a, b) => parseInt(a) - parseInt(b)).map(k => nd[k]) : []);
  return arr[indice] !== undefined && arr[indice] !== null ? String(arr[indice]) : '';
}

/**
 * Agrega una página de notas para un curso al documento PDF
 */
function agregarPaginaCurso(doc, datosNotas, ciclo) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;

  const colorHeader = [245, 249, 242];
  const colorBorder = [221, 221, 221];
  const colorText = [51, 51, 51];
  const colorBlue = [52, 152, 219];
  const colorBlueBar = [52, 152, 219];
  const colorName = [41, 128, 185];
  const colorBelowMin = [231, 76, 60];
  const colorBelowMinBg = [253, 233, 217];
  const nombresBimestres = ['I', 'II', 'III', 'IV'];

  const titulo = `${datosNotas.curso.curso_nombre.toUpperCase()} - ${datosNotas.curso.grado}° ${datosNotas.curso.seccion} - ${datosNotas.curso.nivel_nombre.toUpperCase()} - BIMESTRE ${nombresBimestres[ciclo - 1] || ciclo}`;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorText);
  doc.text(titulo, margin, yPosition);
  yPosition += 8;

  doc.setFillColor(...colorBlueBar);
  doc.rect(margin, yPosition, contentWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Rango de notas: ${datosNotas.curso.nivel.nota_minima} - ${datosNotas.curso.nivel.nota_maxima}.`, margin + contentWidth / 2, yPosition + 4.5, { align: 'center' });
  yPosition += 10;

  const calcularAnchoCriterio = (c) => {
    if (!c.indicadores || c.indicadores.length === 0) return 12;
    const total = c.indicadores.reduce((s, i) => s + (i.cuadros || 1), 0);
    return Math.max(12, (total * 4) + total + 6);
  };

  const colN = 8, colNombre = 45, colProm = 15;
  let anchoTotalCriterios = 0;
  const anchosCriterios = datosNotas.criterios.map(c => {
    const ancho = calcularAnchoCriterio(c);
    anchoTotalCriterios += ancho;
    return { criterio: c, ancho };
  });

  let anchoExamenMensual = 0;
  if (datosNotas.curso.examen_mensual) {
    anchoExamenMensual = 20;
    anchoTotalCriterios += anchoExamenMensual;
  }

  const anchoDisponible = contentWidth - colN - colNombre - colProm;
  let factorEscala = anchoTotalCriterios > anchoDisponible ? anchoDisponible / anchoTotalCriterios : 1;
  let anchoTotalAjustado = 0;
  anchosCriterios.forEach(item => {
    item.ancho = Math.max(12, item.ancho * factorEscala);
    anchoTotalAjustado += item.ancho;
  });
  if (datosNotas.curso.examen_mensual) {
    anchoExamenMensual = Math.max(15, anchoExamenMensual * factorEscala);
    anchoTotalAjustado += anchoExamenMensual;
  }
  const diff = anchoDisponible - anchoTotalAjustado;
  if (diff > 0 && anchosCriterios.length > 0) {
    const ajuste = diff / (anchosCriterios.length + (datosNotas.curso.examen_mensual ? 1 : 0));
    anchosCriterios.forEach(item => { item.ancho += ajuste; });
    if (datosNotas.curso.examen_mensual) anchoExamenMensual += ajuste;
  }

  // Header
  doc.setFillColor(...colorHeader);
  doc.rect(margin, yPosition, colN, 12, 'F');
  doc.rect(margin + colN, yPosition, colNombre, 12, 'F');
  let xPos = margin + colN + colNombre;
  anchosCriterios.forEach(item => {
    doc.rect(xPos, yPosition, item.ancho, 12, 'F');
    xPos += item.ancho;
  });
  if (datosNotas.curso.examen_mensual) {
    doc.rect(xPos, yPosition, anchoExamenMensual, 12, 'F');
    xPos += anchoExamenMensual;
  }
  doc.rect(xPos, yPosition, colProm, 12, 'F');
  doc.setDrawColor(...colorBorder);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPosition, contentWidth, 12);
  doc.setTextColor(...colorText);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('N°', margin + colN / 2, yPosition + 4, { align: 'center' });
  doc.text('APELLIDOS Y NOMBRES', margin + colN + colNombre / 2, yPosition + 4, { align: 'center' });
  xPos = margin + colN + colNombre;
  anchosCriterios.forEach(item => {
    doc.text((item.criterio.descripcion || '').toUpperCase().slice(0, 20), xPos + item.ancho / 2, yPosition + 3.5, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${item.criterio.peso}%)`, xPos + item.ancho / 2, yPosition + 8, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    xPos += item.ancho;
  });
  if (datosNotas.curso.examen_mensual) {
    doc.text('EX. MENSUAL', xPos + anchoExamenMensual / 2, yPosition + 3.5, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${datosNotas.curso.peso_examen_mensual}%)`, xPos + anchoExamenMensual / 2, yPosition + 8, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    xPos += anchoExamenMensual;
  }
  doc.text('PROM.', xPos + colProm / 2, yPosition + 4, { align: 'center' });
  doc.setLineWidth(0.2);
  let xDiv = margin + colN;
  doc.line(xDiv, yPosition, xDiv, yPosition + 12);
  xDiv += colNombre;
  doc.line(xDiv, yPosition, xDiv, yPosition + 12);
  anchosCriterios.forEach(item => {
    xDiv += item.ancho;
    doc.line(xDiv, yPosition, xDiv, yPosition + 12);
  });
  if (datosNotas.curso.examen_mensual) {
    xDiv += anchoExamenMensual;
    doc.line(xDiv, yPosition, xDiv, yPosition + 12);
  }
  yPosition += 12;

  const alturaFila = 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  datosNotas.alumnos.forEach((alumno, index) => {
    if (yPosition + alturaFila > pageHeight - 15) {
      doc.addPage('l', 'a4');
      yPosition = margin;
      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, colN, 12, 'F');
      doc.rect(margin + colN, yPosition, colNombre, 12, 'F');
      xPos = margin + colN + colNombre;
      anchosCriterios.forEach(item => {
        doc.rect(xPos, yPosition, item.ancho, 12, 'F');
        xPos += item.ancho;
      });
      if (datosNotas.curso.examen_mensual) {
        doc.rect(xPos, yPosition, anchoExamenMensual, 12, 'F');
        xPos += anchoExamenMensual;
      }
      doc.rect(xPos, yPosition, colProm, 12, 'F');
      doc.setDrawColor(...colorBorder);
      doc.rect(margin, yPosition, contentWidth, 12);
      doc.setTextColor(...colorText);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('N°', margin + colN / 2, yPosition + 4, { align: 'center' });
      doc.text('APELLIDOS Y NOMBRES', margin + colN + colNombre / 2, yPosition + 4, { align: 'center' });
      xPos = margin + colN + colNombre;
      anchosCriterios.forEach(item => {
        doc.text((item.criterio.descripcion || '').toUpperCase().slice(0, 20), xPos + item.ancho / 2, yPosition + 3.5, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`(${item.criterio.peso}%)`, xPos + item.ancho / 2, yPosition + 8, { align: 'center' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        xPos += item.ancho;
      });
      if (datosNotas.curso.examen_mensual) {
        doc.text('EX. MENSUAL', xPos + anchoExamenMensual / 2, yPosition + 3.5, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`(${datosNotas.curso.peso_examen_mensual}%)`, xPos + anchoExamenMensual / 2, yPosition + 8, { align: 'center' });
        xPos += anchoExamenMensual;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('PROM.', xPos + colProm / 2, yPosition + 4, { align: 'center' });
      doc.setLineWidth(0.2);
      xDiv = margin + colN;
      doc.line(xDiv, yPosition, xDiv, yPosition + 12);
      xDiv += colNombre;
      doc.line(xDiv, yPosition, xDiv, yPosition + 12);
      anchosCriterios.forEach(item => {
        xDiv += item.ancho;
        doc.line(xDiv, yPosition, xDiv, yPosition + 12);
      });
      if (datosNotas.curso.examen_mensual) {
        xDiv += anchoExamenMensual;
        doc.line(xDiv, yPosition, xDiv, yPosition + 12);
      }
      yPosition += 12;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
    }

    if (index % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(margin, yPosition, contentWidth, alturaFila, 'F');
    }
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.2);
    doc.rect(margin, yPosition, contentWidth, alturaFila);
    doc.setLineWidth(0.1);
    xDiv = margin + colN;
    doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
    xDiv += colNombre;
    doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
    anchosCriterios.forEach(item => {
      xDiv += item.ancho;
      doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
    });
    if (datosNotas.curso.examen_mensual) {
      xDiv += anchoExamenMensual;
      doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
    }

    doc.setTextColor(...colorText);
    doc.text(alumno.numero.toString(), margin + colN / 2, yPosition + 5.5, { align: 'center' });
    doc.setTextColor(...colorName);
    doc.text((alumno.nombre_completo || '').slice(0, 35), margin + colN + 2, yPosition + 5.5);

    xPos = margin + colN + colNombre;
    anchosCriterios.forEach(item => {
      const criterio = item.criterio;
      const anchoC = item.ancho;
      const tieneInd = criterio.indicadores && criterio.indicadores.length > 0;
      if (tieneInd) {
        const totalCuadros = criterio.indicadores.reduce((s, i) => s + (i.cuadros || 1), 0);
        const anchoCuadro = 4.5, altoCuadro = 5.5;
        const padV = (alturaFila - altoCuadro) / 2;
        let xNota = xPos + Math.max(1.5, (anchoC - (totalCuadros * 4.5 + (totalCuadros - 1) * 0.5 + 1 + 5.5)) / 2);
        criterio.indicadores.forEach(indicador => {
          for (let i = 0; i < (indicador.cuadros || 1); i++) {
            const val = getNotaValor(alumno, criterio.id, indicador.id, i);
            doc.setDrawColor(...colorBorder);
            doc.rect(xNota, yPosition + padV, anchoCuadro, altoCuadro);
            if (val) doc.text(val, xNota + anchoCuadro / 2, yPosition + padV + altoCuadro / 2 + 1.5, { align: 'center' });
            xNota += anchoCuadro + 0.5;
          }
        });
        const promC = calcPromedioCriterio(datosNotas, alumno.matricula_id, criterio.id);
        xNota += 1;
        if (promC !== null) {
          const esBajo = promC < datosNotas.curso.nivel.nota_aprobatoria;
          doc.setFillColor(...(esBajo ? colorBelowMinBg : [249, 249, 249]));
          doc.rect(xNota, yPosition + padV, 5.5, altoCuadro, 'F');
          doc.setDrawColor(...colorBorder);
          doc.rect(xNota, yPosition + padV, 5.5, altoCuadro);
          doc.setTextColor(...(esBajo ? colorBelowMin : colorBlue));
          doc.setFont('helvetica', 'bold');
          doc.text(String(promC), xNota + 2.75, yPosition + padV + 3.5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
        } else {
          doc.setDrawColor(...colorBorder);
          doc.rect(xNota, yPosition + padV, 5.5, altoCuadro);
        }
      } else {
        const notaD = alumno.notas_criterios?.[criterio.id] || '';
        if (notaD) doc.text(notaD, xPos + anchoC / 2, yPosition + 5.5, { align: 'center' });
      }
      xPos += anchoC;
    });

    if (datosNotas.curso.examen_mensual) {
      const e1 = alumno.examenes_mensuales?.[1] || '';
      const e2 = alumno.examenes_mensuales?.[2] || '';
      const padV = (alturaFila - 5.5) / 2;
      let xE = xPos + 2;
      doc.setDrawColor(...colorBorder);
      doc.rect(xE, yPosition + padV, 4.5, 5.5);
      if (e1) doc.text(String(e1), xE + 2.25, yPosition + padV + 3.5, { align: 'center' });
      xE += 5;
      doc.rect(xE, yPosition + padV, 4.5, 5.5);
      if (e2) doc.text(String(e2), xE + 2.25, yPosition + padV + 3.5, { align: 'center' });
      xE += 6.5;
      const promEx = (parseFloat(e1) && parseFloat(e2)) ? Math.round((parseFloat(e1) + parseFloat(e2)) / 2) : null;
      if (promEx !== null) {
        doc.setFillColor(249, 249, 249);
        doc.rect(xE, yPosition + padV, 5.5, 5.5, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(xE, yPosition + padV, 5.5, 5.5);
        doc.setTextColor(...colorBlue);
        doc.setFont('helvetica', 'bold');
        doc.text(String(promEx), xE + 2.75, yPosition + padV + 3.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setDrawColor(...colorBorder);
        doc.rect(xE, yPosition + padV, 5.5, 5.5);
      }
      xPos += anchoExamenMensual;
    }

    const promFinal = calcPromedioFinal(datosNotas, alumno.matricula_id) || alumno.promedio_final;
    const padL = (colProm - 5.5) / 2;
    const padV = (alturaFila - 5.5) / 2;
    if (promFinal) {
      const esBajo = parseFloat(promFinal) < datosNotas.curso.nivel.nota_aprobatoria;
      doc.setFillColor(...(esBajo ? colorBelowMinBg : [249, 249, 249]));
      doc.rect(xPos + padL, yPosition + padV, 5.5, 5.5, 'F');
      doc.setDrawColor(...colorBorder);
      doc.rect(xPos + padL, yPosition + padV, 5.5, 5.5);
      doc.setTextColor(...(esBajo ? colorBelowMin : colorBlue));
      doc.setFont('helvetica', 'bold');
      doc.text(String(promFinal), xPos + colProm / 2, yPosition + padV + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    } else {
      doc.setDrawColor(...colorBorder);
      doc.rect(xPos + padL, yPosition + padV, 5.5, 5.5);
    }
    doc.setTextColor(...colorText);
    yPosition += alturaFila;
  });

  const fecha = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generado: ${fecha}`, margin, pageHeight - 8);
}

/**
 * Genera y descarga PDF con notas de todos los cursos del grupo
 * @param {Array} cursos - Array de { curso, alumnos, criterios, ciclo }
 * @param {Object} grupo - { grado, seccion }
 */
export function generarPDFNotasTutoria(cursos, grupo) {
  if (!cursos || cursos.length === 0) return false;

  const doc = new jsPDF('l', 'mm', 'a4');
  const ciclo = cursos[0]?.ciclo || 1;

  cursos.forEach((item, idx) => {
    if (idx > 0) doc.addPage('l', 'a4');
    agregarPaginaCurso(doc, item, ciclo);
  });

  const nombreArchivo = `Notas_Tutoria_${grupo?.grado || ''}°_${grupo?.seccion || ''}_${new Date().getTime()}.pdf`;
  doc.save(nombreArchivo);
  return true;
}

