import React from 'react';
import { sanitizarCnebHtml, textoCnebAHtml } from '../../utils/cnebTextoRico';

export default function CnebHtmlVista({ html, className = '', vacio = '' }) {
  const src = textoCnebAHtml(html);
  if (!src) {
    return vacio ? <p className={className}>{vacio}</p> : null;
  }
  return (
    <div
      className={`cneb-rich ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: sanitizarCnebHtml(src) }}
    />
  );
}
