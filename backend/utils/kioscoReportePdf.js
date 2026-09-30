const PDFDocument = require('pdfkit');

const OSCURO = '#1c1410';
const NARANJA = '#c2410c';
const CREMA = '#fff8f1';
const ARENA = '#f6efe7';
const TEXTO = '#241910';
const SUAVE = '#7a6554';

function fechaCorta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function soles(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}

function etiqueta(p) {
  if (p.estado === 'pedido') return 'Por atender';
  if (p.estado === 'rechazado') return 'Rechazado';
  if (p.pago === 'fiado') return 'Fiado';
  if (p.pago === 'pagado') return 'Pagado';
  if (p.pago === 'pendiente') return 'Pendiente';
  return p.estado || '';
}

function coincide(p, filtro) {
  const atendido = p.estado === 'aceptado' || p.estado === 'entregado';
  if (filtro === 'vendido') return atendido;
  if (filtro === 'pagado') return atendido && p.pago === 'pagado';
  if (filtro === 'fiado') return atendido && p.pago === 'fiado';
  if (filtro === 'pendiente') return atendido && p.pago === 'pendiente';
  if (filtro === 'rechazado') return p.estado === 'rechazado';
  if (filtro === 'espera') return p.estado === 'pedido';
  return true;
}

const NOMBRE_FILTRO = {
  todos: 'Todos',
  vendido: 'Vendidos',
  pagado: 'Pagados',
  fiado: 'Fiados',
  pendiente: 'Pendientes',
  rechazado: 'Rechazados',
  espera: 'Por atender',
};

function caja(doc, x, y, w, h, titulo, monto, detalle, énfasis) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fill(énfasis ? '#fff7ed' : '#ffffff');
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).stroke(énfasis ? '#fdba74' : '#eadfce');
  doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(titulo, x + 8, y + 8, { width: w - 16 });
  doc.fillColor(énfasis ? NARANJA : OSCURO).font('Helvetica-Bold').fontSize(13).text(monto, x + 8, y + 22, { width: w - 16 });
  doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(detalle, x + 8, y + 42, { width: w - 16 });
  doc.restore();
}

function escribirReporteKioscoPdf(res, data, filtro) {
  const clave = NOMBRE_FILTRO[filtro] ? filtro : 'todos';
  const pedidos = (data.pedidos || []).filter((p) => coincide(p, clave)).slice(0, 500);
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  const archivo = `kiosco_${data.desde}_${data.hasta}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
  doc.pipe(res);

  const izquierda = 36;
  const ancho = 523;
  doc.rect(0, 0, doc.page.width, 78).fill(OSCURO);
  doc.fillColor('#fff8f1').font('Helvetica-Bold').fontSize(18).text('Cierre de caja', izquierda, 22, { width: ancho });
  doc.font('Helvetica').fontSize(10).fillColor('#fed7aa').text(
    `Kiosco cafetín  ·  ${fechaCorta(data.desde)} al ${fechaCorta(data.hasta)}  ·  ${NOMBRE_FILTRO[clave]}`,
    izquierda,
    46,
    { width: ancho }
  );

  doc.fillColor(TEXTO);
  let y = 96;
  const c = data.cierre || {};
  const tarjetas = [
    ['Vendido', c.vendido, false],
    ['Pagado', c.pagado, true],
    ['Fiado', c.fiado, false],
    ['Pendiente', c.pendiente, false],
    ['Rechazado', c.rechazado, false],
    ['Por atender', c.espera, false],
  ];
  const tw = (ancho - 16) / 3;
  tarjetas.forEach((t, i) => {
    const col = i % 3;
    const fila = Math.floor(i / 3);
    caja(
      doc,
      izquierda + col * (tw + 8),
      y + fila * 72,
      tw,
      64,
      t[0],
      soles(t[1]?.total),
      `${t[1]?.n || 0} pedido${t[1]?.n === 1 ? '' : 's'}`,
      t[2]
    );
  });
  y += 156;
  doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(
    'Lo pagado entró a caja. Lo fiado se atendió y sigue debiendo. Al pagarlo, ese monto sale de la deuda. Lo rechazado no se vendió.',
    izquierda,
    y,
    { width: ancho }
  );
  y += 28;

  const cabezal = () => {
    doc.rect(izquierda, y, ancho, 18).fill(NARANJA);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Fecha', izquierda + 6, y + 5, { width: 78 });
    doc.text('Cliente', izquierda + 86, y + 5, { width: 210 });
    doc.text('Situación', izquierda + 300, y + 5, { width: 90 });
    doc.text('Total', izquierda + 400, y + 5, { width: 110, align: 'right' });
    y += 18;
  };
  cabezal();

  if (!pedidos.length) {
    doc.fillColor(SUAVE).font('Helvetica').fontSize(9).text('No hay pedidos en este filtro.', izquierda, y + 8);
    y += 28;
  }
  pedidos.forEach((p, i) => {
    const alto = p.detalle ? 28 : 16;
    if (y + alto > 760) {
      doc.addPage();
      y = 48;
      cabezal();
    }
    if (i % 2 === 0) doc.rect(izquierda, y, ancho, alto).fill(i % 4 === 0 ? CREMA : ARENA);
    doc.fillColor(TEXTO).font('Helvetica').fontSize(8);
    doc.text(`${fechaCorta(p.fecha)} ${p.hora || ''}`, izquierda + 6, y + 4, { width: 78 });
    doc.font('Helvetica-Bold').text(p.cliente || 'Sin nombre', izquierda + 86, y + 4, { width: 210, ellipsis: true });
    doc.font('Helvetica').fillColor(SUAVE).text(etiqueta(p), izquierda + 300, y + 4, { width: 90 });
    doc.fillColor(OSCURO).font('Helvetica-Bold').text(soles(p.total), izquierda + 400, y + 4, { width: 110, align: 'right' });
    if (p.detalle) {
      doc.font('Helvetica').fontSize(7).fillColor(SUAVE).text(p.detalle, izquierda + 86, y + 15, { width: 420, ellipsis: true });
    }
    y += alto;
  });
  if ((data.pedidos || []).filter((p) => coincide(p, clave)).length > pedidos.length) {
    y += 8;
    doc.fillColor(SUAVE).fontSize(8).text('El PDF muestra los primeros 500 pedidos del filtro. El cierre de arriba suma el rango completo.', izquierda, y, { width: ancho });
    y += 16;
  }

  y += 16;
  if (y > 700) {
    doc.addPage();
    y = 48;
  }
  doc.fillColor(OSCURO).font('Helvetica-Bold').fontSize(12).text('Lo que se vendió', izquierda, y);
  y += 18;
  const productos = data.productos || [];
  if (!productos.length) {
    doc.fillColor(SUAVE).font('Helvetica').fontSize(9).text('En este rango no hay productos vendidos ni rechazados.', izquierda, y);
  }
  productos.slice(0, 80).forEach((p, i) => {
    if (y > 760) {
      doc.addPage();
      y = 48;
    }
    if (i % 2 === 0) doc.rect(izquierda, y, ancho, 16).fill(CREMA);
    doc.fillColor(TEXTO).font('Helvetica').fontSize(8).text(p.nombre, izquierda + 6, y + 4, { width: 250, ellipsis: true });
    doc.fillColor(SUAVE).text(`${p.vendidos} vendidos`, izquierda + 260, y + 4, { width: 80 });
    doc.text(p.no_vendidos ? `${p.no_vendidos} no vendidos` : '', izquierda + 340, y + 4, { width: 80 });
    doc.fillColor(OSCURO).font('Helvetica-Bold').text(soles(p.monto), izquierda + 420, y + 4, { width: 90, align: 'right' });
    y += 16;
  });

  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(i);
    doc.fillColor(SUAVE).font('Helvetica').fontSize(8).text(
      `Kiosco cafetín   ·   ${i + 1} / ${rango.count}`,
      izquierda,
      812,
      { width: ancho, align: 'right' }
    );
  }
  doc.end();
}

module.exports = { escribirReporteKioscoPdf };
