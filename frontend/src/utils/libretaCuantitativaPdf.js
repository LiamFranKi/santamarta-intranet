import { numeroALetra, textoNotaPf, normalizarRangosLetras } from './notaLetraConversion';

/**
 * Dibuja celda de bimestre (B-1…B-4) o PF simple.
 * @param {boolean} esPf - si true, divide número + letra
 */
export function dibujarCeldaNotaLibreta(
  doc,
  {
    x,
    y,
    w,
    h,
    valor,
    fillRgb,
    esPf = false,
    rangosLetras = [],
    fontSize = 8,
    textY = null,
  }
) {
  const ty = textY != null ? textY : y + 3.5;
  doc.setFillColor(...fillRgb);
  doc.rect(x, y, w, h, 'FD');

  if (!esPf) {
    const txt =
      valor !== null && valor !== undefined && valor !== '' && valor !== '-'
        ? String(valor)
        : '-';
    doc.text(txt, x + w / 2, ty, { align: 'center' });
    return;
  }

  const numTxt = textoNotaPf(valor);
  const letra =
    numTxt !== '-'
      ? numeroALetra(valor, normalizarRangosLetras(rangosLetras)) || '-'
      : '-';

  const wNum = w * 0.55;
  const wLet = w - wNum;
  const midX = x + wNum;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.line(midX, y, midX, y + h);

  doc.text(numTxt, x + wNum / 2, ty, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.text(letra, midX + wLet / 2, ty, { align: 'center' });
  doc.setFont('helvetica', 'normal');
}

/**
 * Pinta fila de valores (4 bimestres + PF).
 */
export function dibujarFilaValoresLibreta(
  doc,
  {
    xStart,
    y,
    colWidth,
    rowHeight,
    valores,
    fillRgb,
    rangosLetras,
    cicloSel,
  }
) {
  let xPos = xStart;
  valores.forEach((promedio, idx) => {
    const esPf = idx === valores.length - 1;
    const esBim = idx < 4;
    const mostrar =
      esPf || (esBim && idx + 1 <= (cicloSel || 1))
        ? promedio
        : null;

    dibujarCeldaNotaLibreta(doc, {
      x: xPos,
      y,
      w: colWidth,
      h: rowHeight,
      valor: mostrar,
      fillRgb,
      esPf,
      rangosLetras,
    });
    xPos += colWidth;
  });
  return xPos;
}

export function calcularPromedioFinalHastaCiclo(obj, cicloSel) {
  const vals = [];
  for (let c = 1; c <= cicloSel; c++) {
    const v = obj[`promedio_b${c}`];
    if (v !== null && v !== '' && v !== '-') vals.push(parseFloat(v));
  }
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((s, n) => s + (Number.isNaN(n) ? 0 : n), 0) / vals.length);
}

export function buildValoresFilaLibreta(obj, cicloSel) {
  const vals = [];
  for (let c = 1; c <= 4; c++) {
    vals.push(c <= cicloSel ? obj[`promedio_b${c}`] : null);
  }
  vals.push(calcularPromedioFinalHastaCiclo(obj, cicloSel));
  return vals;
}
