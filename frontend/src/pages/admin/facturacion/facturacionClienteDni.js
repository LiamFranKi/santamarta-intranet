import api from '../../../services/api';

function nombreAlumno(a) {
  return [a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ').trim();
}

function nombrePersonal(p) {
  return [p.apellido_paterno, p.apellido_materno, p.nombres].filter(Boolean).join(' ').trim();
}

/**
 * Busca alumno o personal por DNI y devuelve nombre sugerido (legacy boletas).
 */
export async function buscarClientePorDni(dni, tipoCliente = 'ALUMNO') {
  const doc = String(dni || '').trim();
  if (doc.length < 8) {
    return { encontrado: false, nombre: '' };
  }

  try {
    if (tipoCliente === 'DOCENTE') {
      const { data } = await api.get('/admin/usuarios/personal-por-dni', { params: { dni: doc } });
      if (data.encontrado) {
        return { encontrado: true, nombre: nombrePersonal(data), tipo: 'DOCENTE' };
      }
      return { encontrado: false, nombre: '' };
    }

    const { data } = await api.get('/admin/usuarios/alumnos/por-dni', { params: { dni: doc } });
    if (data.encontrado && data.alumno) {
      return { encontrado: true, nombre: nombreAlumno(data.alumno), tipo: 'ALUMNO' };
    }
    return { encontrado: false, nombre: '' };
  } catch {
    return { encontrado: false, nombre: '' };
  }
}
