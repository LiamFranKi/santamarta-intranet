import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Swal from 'sweetalert2';
import api from '../services/api';
import AdjuntosPendientes from './mensajes/AdjuntosPendientes';
import '../pages/AlumnoMensajes.css';

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'bullet',
  'color',
  'background',
  'align',
  'link',
  'image',
];

/**
 * Modal para enviar mensaje solo a la psicóloga del colegio (mismo flujo que ApoderadoMensajes: Quill, adjuntos, imagen en editor).
 */
export default function ApoderadoPsicologaMensajeModal({ open, onClose, psicologa }) {
  const quillRef = React.useRef(null);
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const reset = useCallback(() => {
    setAsunto('');
    setContenido('');
    setArchivosAdjuntos([]);
    setEnviando(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open || !psicologa?.usuario_id) return undefined;
    const raf = window.requestAnimationFrame(() => {
      const quillEl = quillRef.current;
      if (!quillEl) return;
      const quill = quillEl.getEditor();
      const toolbar = quill.getModule('toolbar');
      const handler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'La imagen no puede ser mayor a 5MB', 'error');
            return;
          }
          if (!file.type.startsWith('image/')) {
            Swal.fire('Error', 'Solo se permiten archivos de imagen', 'error');
            return;
          }
          try {
            const formData = new FormData();
            formData.append('imagen', file);
            const response = await api.post('/apoderado/mensajes/subir-imagen', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            const imagenUrl = response.data.url;
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (error) {
            console.error('Error subiendo imagen:', error);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      };
      toolbar.addHandler('image', handler);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, psicologa?.usuario_id]);

  const handleArchivoChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setArchivosAdjuntos((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const eliminarArchivo = (index) => {
    setArchivosAdjuntos((prev) => prev.filter((_, i) => i !== index));
  };

  const enviarMensaje = async () => {
    if (!psicologa?.usuario_id) return;
    if (enviando) return;
    if (!asunto.trim()) {
      Swal.fire('Error', 'El asunto es requerido', 'error');
      return;
    }
    const contenidoLimpio = contenido.replace(/<[^>]*>/g, '').trim();
    if (!contenidoLimpio) {
      Swal.fire('Error', 'El mensaje es requerido', 'error');
      return;
    }
    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('destinatarios', JSON.stringify([psicologa.usuario_id]));
      formData.append('grupos', JSON.stringify([]));
      formData.append('asunto', asunto.trim());
      formData.append('mensaje', contenido);
      archivosAdjuntos.forEach((archivo) => {
        formData.append('archivos', archivo);
      });
      await api.post('/apoderado/mensajes/enviar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Swal.fire({
        title: 'Mensaje enviado',
        text: 'La psicóloga recibirá su mensaje en Mensajes.',
        icon: 'success',
        confirmButtonText: 'Aceptar',
      });
      reset();
      onClose();
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al enviar el mensaje', 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (!open || !psicologa) return null;

  const modal = (
    <div
      className="mensaje-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="psi-msg-modal-title"
      onClick={() => !enviando && onClose()}
    >
      <div
        className="mensaje-modal psi-redactar-psicologa-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mensaje-modal-header">
          <h3 id="psi-msg-modal-title">Mensaje a la psicóloga</h3>
          <button type="button" className="mensaje-modal-close" onClick={() => !enviando && onClose()} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="psi-redactar-psicologa-modal__body">
          <div className="nuevo-mensaje-form" style={{ maxWidth: '100%' }}>
            <div className="form-group">
              <label>Para:</label>
              <div className="psi-dest-fijo">
                <strong>{psicologa.nombre_completo}</strong>
                <span className="psi-dest-fijo__rol">Psicóloga</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="psi-msg-asunto">Asunto:</label>
              <input
                id="psi-msg-asunto"
                type="text"
                className="form-input"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto del mensaje"
                disabled={enviando}
              />
            </div>
            <div className="form-group">
              <label htmlFor="psi-msg-editor">Mensaje:</label>
              <div id="psi-msg-editor-wrap">
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={contenido}
                  onChange={setContenido}
                  placeholder="Escribe tu mensaje aquí..."
                  readOnly={enviando}
                  modules={QUILL_MODULES}
                  formats={QUILL_FORMATS}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Archivos adjuntos:</label>
              <div className="archivos-container">
                <input
                  type="file"
                  id="psi-msg-archivos"
                  multiple
                  onChange={handleArchivoChange}
                  style={{ display: 'none' }}
                  disabled={enviando}
                />
                <label htmlFor="psi-msg-archivos" className="btn-adjuntar-archivo">
                  Adjuntar archivos
                </label>
                <AdjuntosPendientes
                  archivos={archivosAdjuntos}
                  onQuitar={eliminarArchivo}
                  inputId="psi-msg-archivos"
                />
              </div>
            </div>
            <p className="psi-msg-hint">Puede insertar imágenes en el texto con el botón de imagen del editor.</p>
            <div className="form-actions">
              <button type="button" className="btn-cancelar" onClick={() => !enviando && onClose()} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className="btn-enviar" onClick={enviarMensaje} disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar mensaje'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
