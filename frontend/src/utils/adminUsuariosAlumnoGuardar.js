/** Payload y foto para editar alumno (evita mandar campos de más que traban el PUT). */

export function payloadAlumnoEdit(form = {}) {
  return {
    apellido_paterno: form.apellido_paterno ?? '',
    apellido_materno: form.apellido_materno ?? '',
    nombres: form.nombres ?? '',
    nro_documento: form.nro_documento ?? '',
    fecha_nacimiento: String(form.fecha_nacimiento || '').slice(0, 10),
    email: form.email ?? '',
    usuario_estado: form.usuario_estado || 'ACTIVO',
    alergias: form.alergias ?? '',
    vacunas: form.vacunas ?? '',
    tipo_sangre: form.tipo_sangre ?? 0,
    enfermedades_sufridas: form.enfermedades_sufridas ?? '',
    otros_controles: form.otros_controles ?? '',
    experiencias_traumaticas: form.experiencias_traumaticas ?? '',
  };
}

export function mensajeErrorGuardar(e) {
  if (e?.code === 'ECONNABORTED' || String(e?.message || '').includes('timeout')) {
    return 'El servidor tardó demasiado. Intente de nuevo; si la foto es pesada, use una más liviana.';
  }
  if (!e?.response) {
    return 'No hay conexión con el servidor. Revise la red e intente otra vez.';
  }
  return e.response?.data?.error || 'No se pudo guardar';
}

/** Reduce fotos de celular (8–15 MB) a JPEG liviano para no chocar con el límite de 5 MB. */
export function comprimirFotoPerfil(file, { maxLado = 1280, calidad = 0.82 } = {}) {
  if (!file || typeof file === 'string' || !String(file.type || '').startsWith('image/')) {
    return Promise.resolve(file);
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const finish = (out) => {
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onload = () => {
      let { width, height } = img;
      const mayor = Math.max(width, height) || 1;
      if (mayor > maxLado) {
        const s = maxLado / mayor;
        width = Math.max(1, Math.round(width * s));
        height = Math.max(1, Math.round(height * s));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return finish(file);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return finish(file);
          const nombre = String(file.name || 'foto.jpg').replace(/\.[^.]+$/, '.jpg');
          finish(new File([blob], nombre, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        calidad
      );
    };
    img.onerror = () => finish(file);
    img.src = url;
  });
}
