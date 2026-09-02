import React from 'react';

function extDe(nombre, mime) {
  const n = String(nombre || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'img';
  if (m.includes('word') || /\.(docx?|odt)$/.test(n)) return 'doc';
  if (m.includes('excel') || m.includes('spreadsheet') || /\.(xlsx?|csv)$/.test(n)) return 'xls';
  return 'otro';
}

function IconoTipo({ tipo }) {
  if (tipo === 'pdf') {
    return (
      <svg className="re-arch-svg" viewBox="0 0 40 48" aria-hidden>
        <path d="M6 2h18l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#dc2626" />
        <path d="M24 2v10h10" fill="#fecaca" />
        <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800" fontFamily="Arial">PDF</text>
      </svg>
    );
  }
  if (tipo === 'img') {
    return (
      <svg className="re-arch-svg" viewBox="0 0 40 48" aria-hidden>
        <path d="M6 2h18l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#0284c7" />
        <path d="M24 2v10h10" fill="#bae6fd" />
        <circle cx="14" cy="24" r="3" fill="#fff" />
        <path d="M8 38l8-9 5 6 4-5 7 8H8z" fill="#e0f2fe" />
      </svg>
    );
  }
  if (tipo === 'doc') {
    return (
      <svg className="re-arch-svg" viewBox="0 0 40 48" aria-hidden>
        <path d="M6 2h18l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#2563eb" />
        <path d="M24 2v10h10" fill="#bfdbfe" />
        <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="Arial">DOC</text>
      </svg>
    );
  }
  if (tipo === 'xls') {
    return (
      <svg className="re-arch-svg" viewBox="0 0 40 48" aria-hidden>
        <path d="M6 2h18l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#15803d" />
        <path d="M24 2v10h10" fill="#bbf7d0" />
        <text x="20" y="34" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="Arial">XLS</text>
      </svg>
    );
  }
  return (
    <svg className="re-arch-svg" viewBox="0 0 40 48" aria-hidden>
      <path d="M6 2h18l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#64748b" />
      <path d="M24 2v10h10" fill="#e2e8f0" />
    </svg>
  );
}

export function ReunionArchivoCard({ archivo }) {
  const tipo = extDe(archivo.nombre_original, archivo.mime_type);
  return (
    <a className="re-arch-card" href={archivo.url} target="_blank" rel="noopener noreferrer" title={archivo.nombre_original}>
      <IconoTipo tipo={tipo} />
      <span className="re-arch-card-name">{archivo.nombre_original}</span>
      <span className="re-arch-card-open">Abrir</span>
    </a>
  );
}

export function ReunionSubirArchivo({ onChange, subiendo }) {
  return (
    <label className={`re-arch-tile-upload ${subiendo ? 'is-busy' : ''}`}>
      <input type="file" hidden multiple disabled={!!subiendo} onChange={onChange} />
      <span className="re-arch-upload-plus">+</span>
      <span className="re-arch-tile-upload-label">{subiendo ? 'Subiendo…' : 'Subir archivo'}</span>
    </label>
  );
}

export default function ReunionArchivosLista({ archivos, onSubir, puedeSubir, subiendo }) {
  const hay = (archivos || []).length > 0;
  return (
    <div className="re-detalle" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Documentos</h3>
      <p className="re-hint">
        {puedeSubir
          ? 'Puedes agregar más archivos ahora. Todos los convocados los ven.'
          : 'Documentos compartidos de la reunión.'}
      </p>
      <div className="re-archivos-lista">
        {(archivos || []).map((a) => (
          <ReunionArchivoCard key={a.id} archivo={a} />
        ))}
        {puedeSubir ? <ReunionSubirArchivo onChange={onSubir} subiendo={subiendo} /> : null}
      </div>
      {!hay && !puedeSubir ? <p className="re-hint">Aún no hay archivos.</p> : null}
    </div>
  );
}
