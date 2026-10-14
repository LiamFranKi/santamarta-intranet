import { getPublicStaticBaseUrl, urlDeEsteColegio } from './staticUrl';

function limpiarUrlCandidata(url) {
  return String(url || '').trim().replace(/[),.;!?]+$/g, '');
}

function esVideoIdYouTubeValido(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || '').trim());
}

export function extraerVideoIdYouTube(value) {
  const raw = limpiarUrlCandidata(value);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = String(url.hostname || '').toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const candidate = url.pathname.split('/').filter(Boolean)[0] || '';
      return esVideoIdYouTubeValido(candidate) ? candidate : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const watchId = url.searchParams.get('v') || '';
      if (esVideoIdYouTubeValido(watchId)) return watchId;

      const parts = url.pathname.split('/').filter(Boolean);
      const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live', 'v'].includes(part));
      if (markerIndex >= 0) {
        const candidate = parts[markerIndex + 1] || '';
        return esVideoIdYouTubeValido(candidate) ? candidate : '';
      }
    }
  } catch {
    return '';
  }

  return '';
}

export function resolverVideoPublicacion(pub) {
  const tipoVideo = String(pub?.tipo_video || '').trim().toUpperCase();
  const videoIdActual = String(pub?.video_id || '').trim();

  if (tipoVideo === 'YOUTUBE' && esVideoIdYouTubeValido(videoIdActual)) {
    return {
      tipo: 'YOUTUBE',
      videoId: videoIdActual,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoIdActual}?rel=0`,
    };
  }

  const contenido = String(pub?.contenido || '');
  const urls = contenido.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const url of urls) {
    const videoId = extraerVideoIdYouTube(url);
    if (videoId) {
      return {
        tipo: 'YOUTUBE',
        videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
      };
    }
  }

  return null;
}

export function normalizarUrlImagenPublicacion(url) {
  if (!url) return url;
  return urlDeEsteColegio(String(url)) || url;
}

export function construirUrlArchivoPublicacion(archivo) {
  const valor = String(archivo || '').trim();
  if (!valor) return '';
  if (valor.startsWith('http')) return urlDeEsteColegio(valor) || valor;
  const base = getPublicStaticBaseUrl();
  if (valor.startsWith('/Static/')) return `${base}${valor}`;
  return `${base}/Static/Archivos/${valor}`;
}
