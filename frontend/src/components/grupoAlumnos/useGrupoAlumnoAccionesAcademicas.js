import { useState, useCallback } from 'react';
import api from '../../services/api';
import { esNivelInicial } from '../../utils/esNivelInicial';
import Swal from 'sweetalert2';
import { SwalSobreModal } from '../../utils/swalSobreModal';
import { exportGrupoCarnetsPdfA4 } from '../../utils/carnetQrPdf';
import { fetchYExportarLibretaAlumno } from '../../utils/exportLibretaAlumnoPdf';
import { idNumericoIncidenciaEliminable } from '../../utils/incidenciasAlumnoUi';

function nombreAlumno(a) {
  return [a?.apellido_paterno, a?.apellido_materno, a?.nombres].filter(Boolean).join(' ').trim() || 'Alumno';
}

/**
 * Acciones académicas por alumno (admin → Grados → Lista de alumnos → Opciones).
 */
export function useGrupoAlumnoAccionesAcademicas({ grupoId, grupoInfo, puedeEliminarIncidencias = false }) {
  const [alumnoSel, setAlumnoSel] = useState(null);
  const [modalIncidencias, setModalIncidencias] = useState(false);
  const [incidencias, setIncidencias] = useState([]);
  const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  const [modalAsistencias, setModalAsistencias] = useState(false);
  const [asistencias, setAsistencias] = useState([]);
  const [loadingAsistencias, setLoadingAsistencias] = useState(false);
  const [totalesAsistencias, setTotalesAsistencias] = useState({
    presentes: 0,
    tardanzas: 0,
    faltas: 0,
  });
  const [modalNotas, setModalNotas] = useState(false);
  const [notasDetalladas, setNotasDetalladas] = useState(null);
  const [cicloNotas, setCicloNotas] = useState(1);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [eliminandoIncidenciaId, setEliminandoIncidenciaId] = useState(null);

  const cerrarModales = useCallback(() => {
    setModalIncidencias(false);
    setModalAsistencias(false);
    setModalNotas(false);
    setAlumnoSel(null);
    setIncidencias([]);
    setAsistencias([]);
    setTotalesAsistencias({ presentes: 0, tardanzas: 0, faltas: 0 });
    setNotasDetalladas(null);
    setEliminandoIncidenciaId(null);
  }, []);

  const cargarIncidenciasAlumno = useCallback(async (alumno) => {
    if (!grupoId || !alumno?.id) return;
    const { data } = await api.get(`/admin/academico/grupos/${grupoId}/alumnos/${alumno.id}/incidencias`);
    setIncidencias(data.incidencias || []);
  }, [grupoId]);

  const abrirIncidencias = useCallback(async (alumno) => {
    setAlumnoSel(alumno);
    setLoadingIncidencias(true);
    setModalIncidencias(true);
    try {
      await cargarIncidenciasAlumno(alumno);
    } catch (e) {
      setModalIncidencias(false);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar incidencias' });
    } finally {
      setLoadingIncidencias(false);
    }
  }, [cargarIncidenciasAlumno]);

  const eliminarIncidencia = useCallback(async (incidencia) => {
    if (!puedeEliminarIncidencias || !grupoId || !alumnoSel?.id) return;
    const incidentId = idNumericoIncidenciaEliminable(incidencia);
    if (!incidentId) {
      await SwalSobreModal.fire({
        icon: 'info',
        title: 'No se puede eliminar',
        text: 'Las tardanzas, vestimenta y olvido de QR se corrigen en su módulo (asistencia o presentación), no desde aquí.',
      });
      return;
    }
    const result = await SwalSobreModal.fire({
      title: '¿Eliminar esta incidencia?',
      text: 'Se quitará del historial y se recalculará la nota de conducta del bimestre. Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    setEliminandoIncidenciaId(incidencia.id);
    try {
      await api.delete(
        `/admin/academico/grupos/${grupoId}/alumnos/${alumnoSel.id}/incidencias/${incidentId}`
      );
      await cargarIncidenciasAlumno(alumnoSel);
      await SwalSobreModal.fire({
        title: 'Eliminada',
        text: 'La incidencia se eliminó y la conducta del bimestre se está actualizando.',
        icon: 'success',
      });
    } catch (error) {
      console.error(error);
      await SwalSobreModal.fire({
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo eliminar la incidencia',
        icon: 'error',
      });
    } finally {
      setEliminandoIncidenciaId(null);
    }
  }, [puedeEliminarIncidencias, grupoId, alumnoSel, cargarIncidenciasAlumno]);

  const abrirAsistenciasAlumno = useCallback(async (alumno) => {
    setAlumnoSel(alumno);
    setLoadingAsistencias(true);
    setModalAsistencias(true);
    try {
      const { data } = await api.get(`/docente/hijos/${alumno.id}/asistencias`);
      setAsistencias(data.asistencias || []);
      setTotalesAsistencias({
        presentes: data.total_presentes ?? 0,
        tardanzas: data.total_tardanzas ?? 0,
        faltas: data.total_faltas ?? 0,
      });
    } catch (e) {
      setModalAsistencias(false);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar asistencias' });
    } finally {
      setLoadingAsistencias(false);
    }
  }, []);

  const abrirQr = useCallback(
    async (alumno) => {
      if (!grupoId) return;
      setAlumnoSel(alumno);
      try {
        Swal.fire({ title: 'Generando carnet…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { data } = await api.get(`/admin/academico/grupos/${grupoId}/qr-carnets`);
        Swal.close();
        const carnets = data.carnets || [];
        const uno = carnets.find((c) => Number(c.alumno_id) === Number(alumno.id));
        if (!uno) {
          await Swal.fire({
            icon: 'warning',
            title: 'Sin carnet',
            text: 'No se encontró carnet QR para este alumno en el grupo.',
          });
          return;
        }
        const sec = String(grupoInfo?.seccion || '').replace(/\s+/g, '_');
        const fileBase = `Carnet_QR_${String(grupoInfo?.nivel_nombre || 'Grupo').replace(/\s+/g, '_')}_${grupoInfo?.grado || ''}_${sec}`;
        await exportGrupoCarnetsPdfA4([uno], { fileBase });
        await Swal.fire({ icon: 'success', title: 'PDF listo', text: 'Carnet QR exportado.' });
      } catch (e) {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo generar el QR' });
      }
    },
    [grupoId, grupoInfo]
  );

  const abrirNotasDetalladas = useCallback(async (alumno) => {
    setAlumnoSel(alumno);
    setCicloNotas(1);
    setModalNotas(true);
    setLoadingNotas(true);
    try {
      const { data } = await api.get(`/docente/hijos/${alumno.id}/notas-detalladas`);
      setNotasDetalladas(data);
    } catch (e) {
      setModalNotas(false);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar las notas' });
    } finally {
      setLoadingNotas(false);
    }
  }, []);

  const abrirLibreta = useCallback(async (alumno) => {
    try {
      const { data } = await api.get(`/docente/hijos/${alumno.id}/libreta-anios`);
      const anios = data?.anios || [];
      if (!anios.length) {
        Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay años con matrícula para este alumno.' });
        return;
      }
      const anioDefault = grupoInfo?.anio && anios.includes(grupoInfo.anio) ? grupoInfo.anio : anios[0];
      const { value: result } = await Swal.fire({
        title: 'Exportar libreta',
        html: `
          <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Año</label>
          <select id="swal-anio" class="swal2-input" style="width:100%;margin-bottom:12px">
            ${anios.map((a) => `<option value="${a}" ${a === anioDefault ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
          <label style="display:block;text-align:left;font-weight:600;margin-bottom:4px">Bimestre</label>
          <select id="swal-ciclo" class="swal2-input" style="width:100%">
            <option value="1">Bimestre 1</option><option value="2">Bimestre 2</option>
            <option value="3">Bimestre 3</option><option value="4">Bimestre 4</option>
          </select>`,
        showCancelButton: true,
        confirmButtonText: 'Descargar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => ({
          anio: parseInt(document.getElementById('swal-anio').value, 10),
          ciclo: parseInt(document.getElementById('swal-ciclo').value, 10),
        }),
      });
      if (!result) return;
      Swal.fire({ title: 'Generando libreta…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      await fetchYExportarLibretaAlumno(alumno.id, result.ciclo, result.anio);
      Swal.close();
    } catch (e) {
      Swal.close();
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo generar la libreta' });
    }
  }, [grupoInfo?.anio]);

  const ejecutarAccion = useCallback(
    async (accion, alumno) => {
      switch (accion) {
        case 'asistencias':
          await abrirAsistenciasAlumno(alumno);
          break;
        case 'incidencias':
          await abrirIncidencias(alumno);
          break;
        case 'imprimir_qr':
          await abrirQr(alumno);
          break;
        case 'notas_detalladas':
          if (esNivelInicial(grupoInfo)) {
            Swal.fire({
              icon: 'info',
              title: 'Nivel Inicial',
              text: 'En Inicial consulte las calificaciones en Ver libreta.',
            });
            break;
          }
          await abrirNotasDetalladas(alumno);
          break;
        case 'ver_libreta':
          await abrirLibreta(alumno);
          break;
        default:
          break;
      }
    },
    [abrirAsistenciasAlumno, abrirIncidencias, abrirQr, abrirNotasDetalladas, abrirLibreta]
  );

  return {
    nombreAlumno,
    ejecutarAccion,
    cerrarModales,
    alumnoSel,
    modalIncidencias,
    setModalIncidencias,
    incidencias,
    loadingIncidencias,
    puedeEliminarIncidencias,
    eliminarIncidencia,
    eliminandoIncidenciaId,
    modalAsistencias,
    setModalAsistencias,
    asistencias,
    loadingAsistencias,
    totalesAsistencias,
    modalNotas,
    setModalNotas,
    notasDetalladas,
    cicloNotas,
    setCicloNotas,
    loadingNotas,
  };
}
