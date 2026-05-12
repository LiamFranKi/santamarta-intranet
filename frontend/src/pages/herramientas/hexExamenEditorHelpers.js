/** Utilidades compartidas del editor de exámenes de herramientas (mismo criterio que aula virtual). */
import Swal from 'sweetalert2';

export function attachQuillImageUploadHandler(quill, api, uploadEndpoint = '/docente/mensajes/subir-imagen') {
  if (!quill || !api) return;
  const toolbar = quill.getModule('toolbar');
  if (!toolbar) return;
  // Evita duplicar handlers si el efecto React se vuelve a ejecutar con el mismo editor y URL.
  if (quill.__elccQuillImageEndpoint === uploadEndpoint) return;
  quill.__elccQuillImageEndpoint = uploadEndpoint;
  toolbar.addHandler('image', () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        Swal.fire('Error', 'La imagen no puede ser mayor a 8MB', 'error');
        return;
      }
      if (!file.type.startsWith('image/')) {
        Swal.fire('Error', 'Solo se permiten imágenes', 'error');
        return;
      }
      try {
        const formData = new FormData();
        formData.append('imagen', file);
        const { data } = await api.post(uploadEndpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const range = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
        quill.insertEmbed(range.index, 'image', data.url);
        quill.setSelection(range.index + 1);
      } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo subir la imagen', 'error');
      }
    };
  });
}

export function textoPlano(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function mapExamenFromApi(e) {
  if (!e) return emptyExamenMeta();
  return {
    titulo: e.titulo || '',
    descripcion: e.descripcion || '',
    estado: e.estado || 'BORRADOR',
    modo: e.modo || 'MIXTO',
    fecha_inicio: e.fecha_inicio ? String(e.fecha_inicio).slice(0, 10) : '',
    fecha_fin: e.fecha_fin ? String(e.fecha_fin).slice(0, 10) : '',
    mensaje_agradecimiento: e.mensaje_agradecimiento || '¡Gracias por tu participación!',
    intentos_max: e.intentos_max || 1,
    mostrar_nota: e.mostrar_nota || 'AL_ENVIAR',
    escala_max: e.escala_max != null ? Number(e.escala_max) : 100,
    tiempo_minutos: e.tiempo_minutos != null ? Number(e.tiempo_minutos) : 60,
    tipo_puntaje: e.tipo_puntaje === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'GENERAL',
    puntos_correcta: e.puntos_correcta != null ? Number(e.puntos_correcta) : 1,
    penalizar_incorrecta: e.penalizar_incorrecta === 'SI' ? 'SI' : 'NO',
    penalizacion_incorrecta: e.penalizacion_incorrecta != null ? Number(e.penalizacion_incorrecta) : 0,
    orden_preguntas: e.orden_preguntas === 'ALEATORIO' ? 'ALEATORIO' : 'PREDETERMINADO',
    preguntas_max: e.preguntas_max != null ? Number(e.preguntas_max) : 1,
    habilitar_fecha_hora: !!(e.fecha_inicio || e.fecha_fin),
    bloque_contenido: e.bloque_contenido || '',
    bloque_imagen_url: e.bloque_imagen_url || ''
  };
}

export function emptyExamenMeta() {
  return {
    titulo: '',
    descripcion: '',
    estado: 'BORRADOR',
    modo: 'MIXTO',
    fecha_inicio: '',
    fecha_fin: '',
    mensaje_agradecimiento: '¡Gracias por tu participación!',
    intentos_max: 1,
    mostrar_nota: 'AL_ENVIAR',
    escala_max: 100,
    tiempo_minutos: 60,
    tipo_puntaje: 'GENERAL',
    puntos_correcta: 1,
    penalizar_incorrecta: 'NO',
    penalizacion_incorrecta: 0,
    orden_preguntas: 'PREDETERMINADO',
    preguntas_max: 1,
    habilitar_fecha_hora: false,
    bloque_contenido: '',
    bloque_imagen_url: ''
  };
}

/** Copia profunda de opciones + datos de fila para el editor (evita mutar estado compartido). */
export function clonePreguntaForm(p) {
  if (!p) return nuevaPreguntaLocal();
  const tipo = String(p.tipo || 'ALTERNATIVAS').toUpperCase();
  let opciones = {};
  if (tipo === 'ALTERNATIVAS') {
    const o = p.opciones || {};
    const opts = Array.isArray(o.opciones) ? o.opciones.map((x) => String(x ?? '')) : ['', '', '', ''];
    opciones = {
      opciones: [...opts],
      correcta: typeof o.correcta === 'number' && !Number.isNaN(o.correcta) ? o.correcta : 0
    };
  } else if (tipo === 'VERDADERO_FALSO') {
    const o = p.opciones || {};
    opciones = { correcta: o.correcta === false ? false : true };
  } else {
    opciones = {};
  }
  const id = p.id != null ? p.id : undefined;
  const _localKey =
    p._localKey || (id != null ? `id-${id}` : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  return {
    ...(id != null ? { id } : {}),
    _localKey,
    texto: p.texto ?? '',
    tipo,
    opciones,
    puntos: p.puntos ?? 1,
    solo_informativo: !!p.solo_informativo,
    obligatoria: p.obligatoria !== false
  };
}

export function nuevaPreguntaLocal() {
  return {
    _localKey: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    texto: '',
    tipo: 'ALTERNATIVAS',
    opciones: {
      opciones: ['', '', '', ''],
      correcta: 0
    },
    puntos: 1,
    solo_informativo: false,
    obligatoria: true
  };
}

export function mapPreguntasFromApi(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((p) =>
    clonePreguntaForm({
      id: p.id,
      texto: p.texto || '',
      tipo: p.tipo || 'ALTERNATIVAS',
      opciones: p.opciones || {},
      puntos: p.puntos ?? 1,
      solo_informativo: !!p.solo_informativo,
      obligatoria: p.obligatoria !== false
    })
  );
}
