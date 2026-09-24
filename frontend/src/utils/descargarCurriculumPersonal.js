import Swal from 'sweetalert2';
import api from '../services/api';
import { generarPdfCurriculums } from './exportCurriculumPersonalPdf';

export async function descargarCurriculumDesdeData(data) {
  const items = data?.items || (data?.item ? [data.item] : []);
  if (!items.length) {
    throw new Error('No hay datos para el currículum.');
  }
  await generarPdfCurriculums(items, {
    colegioNombre: data.colegio_nombre,
    logoBase64: data.logo_base64,
    filename: data.filename,
  });
}

export async function descargarCurriculumDesdeApi(url, params) {
  const { data } = await api.get(url, params ? { params } : undefined);
  await descargarCurriculumDesdeData(data);
  return data;
}

export async function descargarCurriculumConAviso(url, params, mensaje = 'Generando currículum…') {
  Swal.fire({
    title: mensaje,
    text: 'Esto puede tardar unos segundos si hay fotos.',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });
  try {
    const data = await descargarCurriculumDesdeApi(url, params);
    Swal.close();
    return data;
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo generar',
      text: e.response?.data?.error || e.message || 'Error al generar el PDF',
    });
    return null;
  }
}
