import React, { useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

const PIEZAS = [
  {
    tipo: 'teoria',
    titulo: 'Teoría del tema',
    ayuda: 'Lo que el estudiante lee. Si sube un archivo, el padre ve ese archivo.',
  },
  {
    tipo: 'ficha',
    titulo: 'Ficha de trabajo',
    ayuda: 'La hoja para dibujar o escribir. Va aparte de la teoría.',
  },
];

export default function CnebMaterialTarjetas({
  apiBase,
  sesionId,
  iaActiva = false,
  archivoTeoria = '',
  archivoFicha = '',
  tieneTextoTeoria = false,
  tieneTextoFicha = false,
  onCambio,
  onVerPdf,
}) {
  const [ocupado, setOcupado] = useState('');
  const archivos = { teoria: archivoTeoria, ficha: archivoFicha };
  const textos = { teoria: tieneTextoTeoria, ficha: tieneTextoFicha };

  const subir = async (tipo, file) => {
    if (!file || !sesionId) return;
    const fd = new FormData();
    fd.append('tipo', tipo);
    fd.append('archivo', file);
    setOcupado(tipo);
    try {
      const { data } = await api.post(`${apiBase}/sesiones/${sesionId}/material`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (onCambio) onCambio(tipo, data.archivo || '1');
      await Swal.fire({
        icon: 'success',
        title: tipo === 'ficha' ? 'Ficha actualizada' : 'Teoría actualizada',
        text: 'El padre de familia verá este archivo.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo subir',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setOcupado('');
    }
  };

  const quitar = async (tipo) => {
    setOcupado(tipo);
    try {
      await api.delete(`${apiBase}/sesiones/${sesionId}/material`, { params: { tipo } });
      if (onCambio) onCambio(tipo, '');
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo quitar el archivo',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setOcupado('');
    }
  };

  if (!sesionId) {
    return (
      <p className="cneb-muted">
        Guarde la sesión para subir la teoría y la ficha. El padre las ve en el aula.
      </p>
    );
  }

  return (
    <div className="cneb-material-grid">
      {PIEZAS.map((p) => {
        const propio = Boolean(archivos[p.tipo]);
        const generado = Boolean(textos[p.tipo]);
        return (
          <article key={p.tipo} className="cneb-material-card">
            <h3>{p.titulo}</h3>
            <p>
              {propio
                ? 'El padre ve el archivo que usted subió.'
                : generado
                  ? 'Listo con el diseño del colegio (logo y mascotas). Si no le convence, cámbielo por su archivo.'
                  : iaActiva
                    ? 'Todavía no hay texto. Genere la sesión o suba su archivo.'
                    : p.ayuda}
            </p>
            <div className="cneb-material-actions">
              {(generado || propio) && onVerPdf ? (
                <button type="button" className="cneb-btn ghost" onClick={() => onVerPdf(p.tipo)}>
                  Ver PDF
                </button>
              ) : null}
              <label className="cneb-btn primary cneb-material-file">
                {ocupado === p.tipo ? 'Subiendo…' : propio ? 'Cambiar archivo' : 'Subir archivo'}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"
                  hidden
                  disabled={Boolean(ocupado)}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) subir(p.tipo, f);
                  }}
                />
              </label>
              {propio ? (
                <button type="button" className="cneb-btn ghost" onClick={() => quitar(p.tipo)} disabled={Boolean(ocupado)}>
                  {generado ? 'Volver al de la IA' : 'Quitar archivo'}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
