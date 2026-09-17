import DOMPurify from 'dompurify';

export function pareceHtml(raw) {
  return /<(p|div|h[1-6]|ul|ol|li|strong|b|em|i|br)\b/i.test(String(raw || ''));
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function aplicarInline(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,]|$)/g, '$1<em>$2</em>');
}

const ETIQUETAS = [
  'Motivación',
  'Saberes previos',
  'Problematización',
  'Propósito',
  'Actividades',
  'Materiales',
  'Evidencia',
  'Metacognición',
  'Consignas',
  'Instrucciones',
];

export function textoCnebAHtml(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  if (pareceHtml(src)) return src;

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null;
  const flush = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const ol = t.match(/^(\d+)[.)]\s+(.+)$/);
    const ul = t.match(/^[-•●]\s+(.+)$/);
    const etiqueta = ETIQUETAS.find((e) => new RegExp(`^${e}\\s*[:.]`, 'i').test(t));
    if (ol) {
      if (list !== 'ol') {
        flush();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${aplicarInline(escapeHtml(ol[2]))}</li>`);
      continue;
    }
    if (ul) {
      if (list !== 'ul') {
        flush();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${aplicarInline(escapeHtml(ul[1]))}</li>`);
      continue;
    }
    flush();
    if (etiqueta) {
      const rest = t.replace(new RegExp(`^${etiqueta}\\s*[:.]\\s*`, 'i'), '');
      out.push(`<p><strong>${escapeHtml(etiqueta)}.</strong> ${aplicarInline(escapeHtml(rest))}</p>`);
    } else {
      out.push(`<p>${aplicarInline(escapeHtml(t))}</p>`);
    }
  }
  flush();
  return out.join('');
}

export function sanitizarCnebHtml(html) {
  return DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'span'],
    ALLOWED_ATTR: [],
  });
}

export function htmlVacio(html) {
  const plano = String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return !plano;
}
