import api from '../services/api';
import Swal from 'sweetalert2';
import { renderLibretaAlumnoPdf } from './exportLibretaAlumnoPdf';
import { esNivelInicial } from './esNivelInicial';

function etiquetaGrupoArchivo(grupo) {
  const nivel = String(grupo?.nivel_nombre || 'Grupo').replace(/\s+/g, '_');
  const grado = grupo?.grado != null ? `${grupo.grado}` : '';
  const sec = String(grupo?.seccion || '').replace(/\s+/g, '_');
  return `${nivel}_${grado}_${sec}`.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Grupo';
}

async function promptAnioCicloLibretas({ anioEsperado, añosDisponibles, SwalInst = Swal }) {
  const años = [...new Set([...(añosDisponibles || []), anioEsperado].filter(Number.isFinite))].sort(
    (a, b) => b - a
  );
  const optsAnio = años
    .map((y) => `<option value="${y}"${y === anioEsperado ? ' selected' : ''}>${y}</option>`)
    .join('');

  const { isConfirmed, value } = await SwalInst.fire({
    title: 'Ver Libretas del aula',
    html: `
      <p style="text-align:left;margin:0 0 12px;color:#475569;font-size:0.92rem">
        Se generará un PDF con la libreta de cada alumno matriculado (una sección por alumno).
      </p>
      <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Año</label>
      <select id="swal-lib-anio" class="swal2-input" style="width:100%;margin-bottom:12px">${optsAnio}</select>
      <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Bimestre</label>
      <select id="swal-lib-ciclo" class="swal2-input" style="width:100%">
        <option value="1">I Bimestre</option>
        <option value="2">II Bimestre</option>
        <option value="3">III Bimestre</option>
        <option value="4">IV Bimestre</option>
      </select>`,
    showCancelButton: true,
    confirmButtonText: 'Generar PDF',
    cancelButtonText: 'Cancelar',
    focusConfirm: false,
    preConfirm: () => {
      const anioSel = parseInt(document.getElementById('swal-lib-anio')?.value, 10);
      const cicloSel = parseInt(document.getElementById('swal-lib-ciclo')?.value, 10) || 1;
      if (!Number.isFinite(anioSel)) {
        SwalInst.showValidationMessage('Seleccione un año válido');
        return false;
      }
      return { anio: anioSel, ciclo: cicloSel };
    },
  });

  if (!isConfirmed || !value) return null;
  return value;
}

/**
 * Exporta un PDF multipágina con la libreta de todos los alumnos del grupo.
 */
export async function exportLibretasGrupoPdf({
  grupo,
  alumnosApiUrl,
  anioEsperado,
  añosDisponibles,
  SwalInst = Swal,
  cnebApiBase = '/admin/cneb',
}) {
  const anioDef = anioEsperado ?? grupo?.anio ?? new Date().getFullYear();
  const params = await promptAnioCicloLibretas({
    anioEsperado: anioDef,
    añosDisponibles,
    SwalInst,
  });
  if (!params) return false;

  const { anio, ciclo } = params;

  if (esNivelInicial(grupo) && grupo?.id) {
    SwalInst.fire({
      title: 'Generando libretas CNEB…',
      allowOutsideClick: false,
      didOpen: () => SwalInst.showLoading(),
    });
    try {
      const res = await api.get(`${String(cnebApiBase).replace(/\/$/, '')}/export/libreta.pdf`, {
        params: { nivel: 'INICIAL', grupo_id: grupo.id, bimestre: ciclo },
        responseType: 'blob',
        timeout: 120000,
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `libretas_cneb_${etiquetaGrupoArchivo(grupo)}_b${ciclo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      SwalInst.close();
      await SwalInst.fire({ icon: 'success', title: 'Libretas listas', text: 'El PDF del aula se descargó.' });
      return true;
    } catch (e) {
      SwalInst.close();
      let msg = e.response?.data?.error || e.message || 'No se pudo generar la libreta CNEB.';
      if (typeof Blob !== 'undefined' && e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          msg = j.error || msg;
        } catch {
          /* keep */
        }
      }
      await SwalInst.fire({ icon: 'error', title: 'Error', text: msg });
      return false;
    }
  }

  SwalInst.fire({
    title: 'Cargando alumnos…',
    allowOutsideClick: false,
    didOpen: () => SwalInst.showLoading(),
  });

  let alumnos = [];
  try {
    const { data } = await api.get(alumnosApiUrl);
    alumnos = data?.alumnos || [];
  } catch (e) {
    SwalInst.close();
    await SwalInst.fire({
      icon: 'error',
      title: 'Error',
      text: e.response?.data?.error || 'No se pudo cargar la lista de alumnos',
    });
    return false;
  }

  if (!alumnos.length) {
    SwalInst.close();
    await SwalInst.fire({
      icon: 'info',
      title: 'Sin alumnos',
      text: 'Este grupo no tiene alumnos matriculados.',
    });
    return false;
  }

  const nivelCneb = (() => {
    const u = String(grupo?.nivel_nombre || '').toUpperCase();
    if (u.includes('SECUNDARIA')) return 'SECUNDARIA';
    if (u.includes('PRIMARIA')) return 'PRIMARIA';
    return null;
  })();
  const primero = alumnos.find((a) => a.alumno_id || a.id);
  let bimestrePrueba = null;
  if (nivelCneb && primero) {
    try {
      const { data: aniosData } = await api.get(`/docente/hijos/${primero.alumno_id ?? primero.id}/libreta-anios`);
      const info = aniosData?.niveles?.[String(anio)];
      const b = Number(info?.cneb_bimestre);
      if (b >= 1 && b <= 4) bimestrePrueba = b;
    } catch {
      bimestrePrueba = null;
    }
  }
  if (nivelCneb && bimestrePrueba && Number(ciclo) === bimestrePrueba && grupo?.id) {
    SwalInst.update({ title: 'Generando libretas CNEB…' });
    try {
      const res = await api.get(`${String(cnebApiBase).replace(/\/$/, '')}/export/libreta.pdf`, {
        params: { nivel: nivelCneb, grupo_id: grupo.id, bimestre: ciclo },
        responseType: 'blob',
        timeout: 120000,
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `libretas_cneb_${etiquetaGrupoArchivo(grupo)}_b${ciclo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      SwalInst.close();
      await SwalInst.fire({ icon: 'success', title: 'Libretas listas', text: 'El PDF del aula se descargó.' });
      return true;
    } catch (e) {
      SwalInst.close();
      let msg = e.response?.data?.error || e.message || 'No se pudo generar la libreta CNEB.';
      if (typeof Blob !== 'undefined' && e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          msg = j.error || msg;
        } catch {
          /* keep */
        }
      }
      await SwalInst.fire({ icon: 'error', title: 'Error', text: msg });
      return false;
    }
  }

  SwalInst.update({ title: `Generando libretas (0 / ${alumnos.length})…` });

  let doc = null;
  let generadas = 0;
  let primera = true;

  for (let i = 0; i < alumnos.length; i += 1) {
    const al = alumnos[i];
    const alumnoId = al.alumno_id ?? al.id;
    if (!alumnoId) continue;

    SwalInst.update({ title: `Generando libretas (${i + 1} / ${alumnos.length})…` });

    try {
      const { data: libreta } = await api.get(`/docente/hijos/${alumnoId}/libreta`, {
        params: { ciclo, anio },
      });
      if (!libreta?.alumno) continue;

      doc = await renderLibretaAlumnoPdf(libreta, ciclo, {
        doc,
        save: false,
        addPageBefore: !primera,
      });
      generadas += 1;
      primera = false;
    } catch (err) {
      console.warn('[exportLibretasGrupoPdf] alumno', alumnoId, err);
    }
  }

  SwalInst.close();

  if (!doc || generadas === 0) {
    await SwalInst.fire({
      icon: 'info',
      title: 'Sin libretas',
      text: 'No se encontraron datos de libreta para los alumnos de este aula en el período seleccionado.',
    });
    return false;
  }

  const nombreArchivo = `Libretas_${etiquetaGrupoArchivo(grupo)}_B${ciclo}_${anio}.pdf`;
  doc.save(nombreArchivo);

  await SwalInst.fire({
    icon: 'success',
    title: 'PDF generado',
    text: `Se incluyeron ${generadas} libreta(s) en el archivo.`,
    timer: 2800,
    showConfirmButton: false,
  });
  return true;
}

/**
 * Abre libretas del aula (PDF multipágina, igual que apoderado — incluye INICIAL).
 */
export async function abrirVerLibretasGrupo(grupo, {
  alumnosApiUrl,
  anioEsperado,
  añosDisponibles,
  SwalInst = Swal,
  cnebApiBase = '/admin/cneb',
}) {
  await exportLibretasGrupoPdf({
    grupo,
    alumnosApiUrl,
    anioEsperado,
    añosDisponibles,
    SwalInst,
    cnebApiBase,
  });
}
