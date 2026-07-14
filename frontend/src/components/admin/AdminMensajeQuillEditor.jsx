import React, { useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminMensajeQuillEditor.css';

const MODULES = {
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

const MODULES_COMPACT = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

const FORMATS = [
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
 * Editor Quill con subida de imágenes.
 * @param {string} [uploadUrl] endpoint FormData field `imagen` (default mensajes docente)
 * @param {boolean} [compact] toolbar y altura reducidos (preguntas/opciones de encuesta)
 */
export default function AdminMensajeQuillEditor({
  value,
  onChange,
  placeholder,
  compact = false,
  uploadUrl = '/docente/mensajes/subir-imagen',
}) {
  const quillRef = useRef(null);
  const modules = compact ? MODULES_COMPACT : MODULES;

  useEffect(() => {
    const t = window.setTimeout(() => {
      const quill = quillRef.current?.getEditor?.();
      if (!quill) return;
      const toolbar = quill.getModule('toolbar');
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
          const file = input.files?.[0];
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
            const { data } = await api.post(uploadUrl, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            const imagenUrl = data.url;
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', imagenUrl);
            quill.setSelection(range.index + 1);
          } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo subir la imagen', 'error');
          }
        };
      });
    }, 0);
    return () => clearTimeout(t);
  }, [uploadUrl]);

  return (
    <div className={`admin-mensaje-quill-wrap${compact ? ' admin-mensaje-quill-compact' : ''}`}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder || 'Escriba su mensaje...'}
        modules={modules}
        formats={FORMATS}
      />
    </div>
  );
}
