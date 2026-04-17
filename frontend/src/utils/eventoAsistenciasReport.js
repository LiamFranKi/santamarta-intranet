import { jsPDF } from 'jspdf';

function nombreDesdePartes(n, ap, am) {
  return [n, ap, am].filter(Boolean).join(' ').trim() || '—';
}

function labelGrupo(g) {
  if (!g || g.grupo_id == null) return 'Sin grupo asignado';
  const sec = g.grupo_seccion ? String(g.grupo_seccion).trim() : '';
  const parts = [
    g.nivel_nombre,
    g.grupo_grado != null && g.grupo_grado !== '' ? `${g.grupo_grado}°` : '',
    sec
  ].filter(Boolean);
  return parts.join(' · ');
}

function sortKeyAlumnoFromRow(row) {
  const ap = row.alumno_apellido_paterno || '';
  const am = row.alumno_apellido_materno || '';
  const n = row.alumno_nombres || '';
  return `${ap} ${am} ${n}`.trim().toLocaleLowerCase();
}

function sortKeyGrupo(g) {
  if (!g || g.grupo_id == null) {
    return [1, 999999, 'zzzz', 9999, 'zzzz'];
  }
  const nid = Number(g.nivel_id) || 0;
  const nom = (g.nivel_nombre || '').toLocaleLowerCase();
  const gr = parseInt(g.grupo_grado, 10);
  const grNum = Number.isFinite(gr) ? gr : 999;
  const sec = (g.grupo_seccion || '').toLocaleLowerCase();
  return [0, nid, nom, grNum, sec];
}

function compareGrupoKeys(a, b) {
  const ka = sortKeyGrupo(a);
  const kb = sortKeyGrupo(b);
  for (let i = 0; i < ka.length; i += 1) {
    const va = ka[i];
    const vb = kb[i];
    if (va === vb) continue;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
  }
  return 0;
}

/**
 * Agrupa apoderados + visitantes por grupo del alumno; ordena grupos y alumnos.
 * @returns {{ groups: Array<{ label: string, grupo: object|null, rows: Array<object> }>, total: number }}
 */
export function buildEventoAsistenciasReport(asistencias, visitantes) {
  const asist = Array.isArray(asistencias) ? asistencias : [];
  const visit = Array.isArray(visitantes) ? visitantes : [];

  const buckets = new Map();

  const pushRow = (grupoRef, row) => {
    const key = grupoRef && grupoRef.grupo_id != null ? `g:${grupoRef.grupo_id}` : 'sin';
    if (!buckets.has(key)) {
      buckets.set(key, { grupo: grupoRef && grupoRef.grupo_id != null ? grupoRef : null, rows: [] });
    }
    buckets.get(key).rows.push(row);
  };

  for (const a of asist) {
    const grupo = {
      grupo_id: a.grupo_id,
      grupo_grado: a.grupo_grado,
      grupo_seccion: a.grupo_seccion,
      nivel_nombre: a.nivel_nombre,
      nivel_id: a.nivel_id
    };
    pushRow(grupo, {
      rowKey: `a-${a.id}`,
      tipo: 'apoderado',
      alumno: nombreDesdePartes(a.alumno_nombres, a.alumno_apellido_paterno, a.alumno_apellido_materno),
      asistente: nombreDesdePartes(a.apoderado_nombres, a.apoderado_apellido_paterno, a.apoderado_apellido_materno),
      telefono: a.apoderado_telefono || '—',
      email: a.apoderado_email || '—',
      parentesco: '—',
      _sort: sortKeyAlumnoFromRow(a)
    });
  }

  for (const v of visit) {
    const grupo = {
      grupo_id: v.grupo_id,
      grupo_grado: v.grupo_grado,
      grupo_seccion: v.grupo_seccion,
      nivel_nombre: v.nivel_nombre,
      nivel_id: v.nivel_id
    };
    const alumnoNom = v.alumno_id
      ? nombreDesdePartes(v.alumno_nombres, v.alumno_apellido_paterno, v.alumno_apellido_materno)
      : '—';
    const sortAl =
      v.alumno_id && (v.alumno_apellido_paterno || v.alumno_apellido_materno || v.alumno_nombres)
        ? sortKeyAlumnoFromRow(v)
        : (v.nombre_completo || '').toLocaleLowerCase();
    pushRow(grupo, {
      rowKey: `v-${v.id}`,
      tipo: 'visitante',
      alumno: alumnoNom,
      asistente: v.nombre_completo || '—',
      telefono: v.telefono || '—',
      email: v.correo || '—',
      parentesco: v.parentesco || '—',
      _sort: sortAl
    });
  }

  const groups = [];
  for (const [, bucket] of buckets) {
    bucket.rows.sort((x, y) => String(x._sort).localeCompare(String(y._sort), 'es', { sensitivity: 'base' }));
    bucket.rows.forEach((r, i) => {
      r.num = i + 1;
      delete r._sort;
    });
    const gref = bucket.grupo;
    groups.push({
      label: labelGrupo(gref),
      grupo: gref,
      rows: bucket.rows
    });
  }

  groups.sort((A, B) => compareGrupoKeys(A.grupo, B.grupo));

  const total = asist.length + visit.length;
  return { groups, total };
}

function safeFileName(s) {
  return String(s || 'evento')
    .replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

/**
 * PDF horizontal con tablas por grupo.
 */
export function exportEventoAsistenciasPdf({
  titulo,
  fechaEventoTexto,
  generadoTexto,
  report
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = margin;

  const newPage = () => {
    doc.addPage();
    y = margin;
  };

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Asistencias — ${titulo || 'Evento'}`, margin, y);
  y += 9;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (fechaEventoTexto) {
    doc.text(fechaEventoTexto, margin, y);
    y += 5.5;
  }
  doc.setTextColor(80, 80, 80);
  doc.text(generadoTexto || '', margin, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  const colX = [margin, margin + 12, margin + 62, margin + 128, margin + 178, margin + 228];
  const maxW = [10, 48, 62, 46, 48, pageW - margin - colX[5]];
  const lh = 3.1;

  const drawHeader = () => {
    const bandH = 6;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(74, 131, 193);
    doc.rect(margin, y - 4, pageW - 2 * margin, bandH, 'F');
    doc.setTextColor(255, 255, 255);
    const heads = ['#', 'Alumno', 'Apoderado / asistente', 'Teléfono', 'Correo', 'Parentesco'];
    heads.forEach((ht, i) => doc.text(ht, colX[i], y));
    doc.setTextColor(0, 0, 0);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
  };

  const colLines = (txt, w) => doc.splitTextToSize(String(txt || '—'), w);

  for (const g of report.groups) {
    if (!g.rows.length) continue;

    if (y + 20 > pageH - margin) newPage();
    doc.setFillColor(219, 234, 254);
    doc.rect(margin, y - 3.5, pageW - 2 * margin, 6.5, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 41, 66);
    doc.text(g.label, margin + 2, y + 0.5);
    doc.setTextColor(0, 0, 0);
    y += 7;
    drawHeader();

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');

    for (const r of g.rows) {
      const L = [
        [String(r.num)],
        colLines(r.alumno, maxW[1]),
        colLines(r.asistente, maxW[2]),
        colLines(r.telefono, maxW[3]),
        colLines(r.email, maxW[4]),
        colLines(r.parentesco, maxW[5])
      ];
      const nLines = Math.max(...L.map((arr) => arr.length), 1);
      const rowH = nLines * lh + 1.5;

      if (y + rowH > pageH - margin) {
        newPage();
        doc.setFillColor(219, 234, 254);
        doc.rect(margin, y - 3.5, pageW - 2 * margin, 6.5, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 41, 66);
        doc.text(`${g.label} (continuación)`, margin + 2, y + 0.5);
        doc.setTextColor(0, 0, 0);
        y += 7;
        drawHeader();
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
      }

      const y0 = y;
      for (let i = 0; i < nLines; i += 1) {
        const yy = y0 + i * lh;
        if (L[0][i] != null) doc.text(L[0][i], colX[0], yy);
        if (L[1][i] != null) doc.text(L[1][i], colX[1], yy);
        if (L[2][i] != null) doc.text(L[2][i], colX[2], yy);
        if (L[3][i] != null) doc.text(L[3][i], colX[3], yy);
        if (L[4][i] != null) doc.text(L[4][i], colX[4], yy);
        if (L[5][i] != null) doc.text(L[5][i], colX[5], yy);
      }
      y = y0 + rowH;
    }
    y += 4;
  }

  if (y + 12 > pageH - margin) newPage();
  doc.setFillColor(239, 246, 255);
  doc.rect(margin, y - 3, pageW - 2 * margin, 9, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 27, 75);
  doc.text(`Total de participantes: ${report.total}`, margin + 2, y + 3.5);
  doc.setTextColor(0, 0, 0);

  doc.save(`asistencias-${safeFileName(titulo)}.pdf`);
}
