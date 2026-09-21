import api from '../services/api';
import Swal from 'sweetalert2';

async function mensajeErrorBlob(error) {
  const data = error?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const t = await data.text();
      const j = JSON.parse(t);
      return j.error || t || 'No se pudo generar el PDF.';
    } catch {
      return error.message || 'No se pudo generar el PDF.';
    }
  }
  return error?.response?.data?.error || error?.message || 'No se pudo generar el PDF.';
}

export function urlCnebPdfHijo(apiBase, hijoId, tipo) {
  const base = String(apiBase || '/docente/hijos').replace(/\/$/, '');
  if (base.includes('/apoderado/')) {
    return `${base}/${hijoId}/cneb/${tipo}.pdf`;
  }
  return `${base}/${hijoId}/cneb-pdf/${tipo}`;
}

export async function descargarCnebHijoPdf({ apiBase, hijoId, tipo, anio, bimestre }) {
  const url = urlCnebPdfHijo(apiBase, hijoId, tipo);
  const res = await api.get(url, {
    params: { anio, bimestre },
    responseType: 'blob',
    timeout: 120000,
  });
  const type = String(res.headers['content-type'] || '');
  if (type.includes('application/json')) {
    const t = await res.data.text();
    const j = JSON.parse(t);
    throw new Error(j.error || 'No se pudo generar el PDF.');
  }
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download =
    tipo === 'informe'
      ? `informe_cneb_${hijoId}_b${bimestre}.pdf`
      : `libreta_cneb_${hijoId}_b${bimestre}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function esInicialEnAnio(niveles, anio) {
  const n = niveles?.[String(anio)] || niveles?.[anio];
  return Boolean(n?.inicial);
}

export async function descargarCnebHijoConAviso({ apiBase, hijoId, tipo, anio, bimestre }) {
  Swal.fire({ title: 'Generando PDF…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    await descargarCnebHijoPdf({ apiBase, hijoId, tipo, anio, bimestre });
    Swal.close();
    await Swal.fire({
      icon: 'success',
      title: tipo === 'informe' ? 'Informe listo' : 'Libreta lista',
      text: 'El PDF se descargó correctamente.',
    });
    return true;
  } catch (error) {
    Swal.close();
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: await mensajeErrorBlob(error),
    });
    return false;
  }
}

export { mensajeErrorBlob };
