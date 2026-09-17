/** Convierte el texto de la IA (plano o markdown) a HTML simple para el editor. */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeEnt(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pareceHtml(raw) {
  return /<(p|div|h[1-6]|ul|ol|li|strong|b|em|i|br)\b/i.test(String(raw || ''));
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

function textoCnebAHtml(raw) {
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
      out.push(
        `<p><strong>${escapeHtml(etiqueta)}.</strong> ${aplicarInline(escapeHtml(rest))}</p>`
      );
    } else {
      out.push(`<p>${aplicarInline(escapeHtml(t))}</p>`);
    }
  }
  flush();
  return out.join('');
}

function htmlATextoPlano(html) {
  if (!html) return '';
  if (!pareceHtml(html)) return String(html);
  return decodeEnt(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extraerPartes(inner) {
  const parts = [];
  const re = /<(strong|b|em|i)>([\s\S]*?)<\/\1>|([^<]+)/gi;
  let m;
  while ((m = re.exec(String(inner || '')))) {
    if (m[1]) {
      const text = decodeEnt(String(m[2] || '').replace(/<[^>]+>/g, ''));
      if (text) parts.push({ text, bold: /strong|b/i.test(m[1]) });
    } else if (m[3]) {
      const text = decodeEnt(m[3]);
      if (text) parts.push({ text, bold: false });
    }
  }
  return parts;
}

function htmlABloques(html) {
  const src = String(html || '').trim();
  if (!src) return [];
  if (!pareceHtml(src)) {
    return src
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ type: 'p', parts: [{ text: t, bold: false }] }));
  }
  const chunk = src
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|div)>/gi, '</$1>\n');
  const blocks = [];
  const re = /<(h[1-6]|p|li|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let found = false;
  while ((m = re.exec(chunk))) {
    found = true;
    const tag = m[1].toLowerCase();
    blocks.push({
      type: tag.startsWith('h') ? 'h' : tag === 'li' ? 'li' : 'p',
      parts: extraerPartes(m[2]),
    });
  }
  if (!found) {
    const plano = htmlATextoPlano(src);
    return plano
      .split(/\n+/)
      .filter(Boolean)
      .map((t) => ({ type: 'p', parts: [{ text: t, bold: false }] }));
  }
  return blocks.filter((b) => b.parts.some((p) => String(p.text || '').trim()));
}

module.exports = {
  pareceHtml,
  textoCnebAHtml,
  htmlATextoPlano,
  htmlABloques,
};
