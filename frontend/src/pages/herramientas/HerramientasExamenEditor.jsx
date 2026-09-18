import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import '../DocenteAulaVirtual-gamificado.css';
import './HerramientasExamenes.css';
import {
  attachQuillImageUploadHandler,
  clonePreguntaForm,
  emptyExamenMeta,
  mapExamenFromApi,
  mapPreguntasFromApi,
  nuevaPreguntaLocal,
  textoPlano
} from './hexExamenEditorHelpers';
import { HEX_AUDIENCIAS, HEX_AUD_PERSONAL, HEX_AUD_TODOS } from './hexAudiencias';

function preguntaKey(p) {
  return p.id != null ? `id-${p.id}` : p._localKey;
}

function SortablePreguntaHex({ pregunta, examenMeta, bloqueado, onEditar, onEliminar }) {
  const pid = preguntaKey(pregunta);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pid,
    disabled: bloqueado
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  const puntosMostrar =
    pregunta.tipo === 'COMPROMISO' || pregunta.solo_informativo
      ? 0
      : examenMeta.tipo_puntaje === 'GENERAL'
        ? examenMeta.puntos_correcta || 0
        : pregunta.puntos || 0;
  const tipoColor = {
    ALTERNATIVAS: { bg: '#dbeafe', color: '#1e40af' },
    VERDADERO_FALSO: { bg: '#d1fae5', color: '#065f46' },
    RESPUESTA_CORTA: { bg: '#e0e7ff', color: '#3730a3' },
    COMPROMISO: { bg: '#fef3c7', color: '#92400e' }
  }[pregunta.tipo] || { bg: '#f3f4f6', color: '#374151' };

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? 'dragging' : ''}>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <div
          {...(bloqueado ? {} : attributes)}
          {...(bloqueado ? {} : listeners)}
          className="drag-handle"
          style={{
            cursor: bloqueado ? 'not-allowed' : 'grab',
            fontSize: '1.2rem',
            userSelect: 'none',
            opacity: bloqueado ? 0.35 : 1
          }}
          title={bloqueado ? 'Reordenar deshabilitado' : 'Arrastrar para reordenar'}
        >
          ⋮⋮
        </div>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <div
          dangerouslySetInnerHTML={{ __html: pregunta.texto || '<span style="color:#9ca3af">(sin texto)</span>' }}
          style={{ maxHeight: '72px', overflow: 'hidden', lineHeight: 1.5, color: '#1f2937' }}
        />
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <span
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: '600',
            backgroundColor: tipoColor.bg,
            color: tipoColor.color,
            display: 'inline-block'
          }}
        >
          {String(pregunta.tipo || '').replace(/_/g, ' ')}
        </span>
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, color: '#6366f1' }}>{puntosMostrar}</td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
          <button type="button" className="btn-opciones" title="Editar" onClick={() => onEditar(pregunta)} disabled={bloqueado}>
            ✏️
          </button>
          <button
            type="button"
            className="btn-opciones"
            title="Eliminar"
            onClick={() => onEliminar(pregunta)}
            disabled={bloqueado}
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white'
            }}
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Modal datos del examen — mismo patrón visual que ExamenForm (aula virtual) + campos institucionales */
function ModalDatosExamen({ open, onClose, examenMeta, setExamenMeta, guardando }) {
  if (!open) return null;
  return createPortal(
    <div className="modal-tema-overlay" onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-tema-header">
          <h2>📝 Datos del examen (herramientas)</h2>
          <button type="button" className="modal-tema-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-tema-body">
          <div className="form-group">
            <label htmlFor="hex-titulo">Título *</label>
            <input
              id="hex-titulo"
              className="form-input"
              value={examenMeta.titulo}
              onChange={(e) => setExamenMeta({ ...examenMeta, titulo: e.target.value })}
              placeholder="Ej: Evaluación institucional"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-desc">Descripción</label>
            <textarea
              id="hex-desc"
              className="form-input"
              rows={3}
              value={examenMeta.descripcion}
              onChange={(e) => setExamenMeta({ ...examenMeta, descripcion: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-modo">Modo institucional *</label>
            <select
              id="hex-modo"
              className="form-input"
              value={examenMeta.modo}
              onChange={(e) => setExamenMeta({ ...examenMeta, modo: e.target.value })}
            >
              <option value="PRACTICA">Práctica</option>
              <option value="CALIFICADO">Calificatorio</option>
              <option value="MIXTO">Mixto</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hex-estado">Estado *</label>
            <select
              id="hex-estado"
              className="form-input"
              value={examenMeta.estado}
              onChange={(e) => setExamenMeta({ ...examenMeta, estado: e.target.value })}
            >
              <option value="BORRADOR">BORRADOR</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="CERRADO">CERRADO</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hex-tipo-puntaje">Calificación (como examen virtual)</label>
            <select
              id="hex-tipo-puntaje"
              className="form-input"
              value={examenMeta.tipo_puntaje}
              onChange={(e) => setExamenMeta({ ...examenMeta, tipo_puntaje: e.target.value })}
            >
              <option value="GENERAL">GENERAL</option>
              <option value="INDIVIDUAL">INDIVIDUAL</option>
            </select>
          </div>
          {examenMeta.tipo_puntaje === 'GENERAL' && (
            <>
              <div className="form-group">
                <label htmlFor="hex-puntos-corr">Puntos por respuesta correcta *</label>
                <input
                  id="hex-puntos-corr"
                  type="number"
                  className="form-input"
                  min="0"
                  step="0.5"
                  value={examenMeta.puntos_correcta}
                  onChange={(e) => setExamenMeta({ ...examenMeta, puntos_correcta: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="hex-penalizar">Penalizar incorrecta</label>
                <select
                  id="hex-penalizar"
                  className="form-input"
                  value={examenMeta.penalizar_incorrecta}
                  onChange={(e) => setExamenMeta({ ...examenMeta, penalizar_incorrecta: e.target.value })}
                >
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </div>
              {examenMeta.penalizar_incorrecta === 'SI' && (
                <div className="form-group">
                  <label htmlFor="hex-penalizacion">Penalización por incorrecta</label>
                  <input
                    id="hex-penalizacion"
                    type="number"
                    className="form-input"
                    min="0"
                    value={examenMeta.penalizacion_incorrecta}
                    onChange={(e) => setExamenMeta({ ...examenMeta, penalizacion_incorrecta: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
            </>
          )}
          <div className="form-group">
            <label htmlFor="hex-tiempo">Tiempo (minutos) *</label>
            <input
              id="hex-tiempo"
              type="number"
              className="form-input"
              min="1"
              value={examenMeta.tiempo_minutos}
              onChange={(e) => setExamenMeta({ ...examenMeta, tiempo_minutos: parseInt(e.target.value, 10) || 60 })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-intentos">Intentos permitidos</label>
            <input
              id="hex-intentos"
              type="number"
              className="form-input"
              min="1"
              max="20"
              value={examenMeta.intentos_max}
              onChange={(e) => setExamenMeta({ ...examenMeta, intentos_max: parseInt(e.target.value, 10) || 1 })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-orden-p">Orden de preguntas</label>
            <select
              id="hex-orden-p"
              className="form-input"
              value={examenMeta.orden_preguntas}
              onChange={(e) => setExamenMeta({ ...examenMeta, orden_preguntas: e.target.value })}
            >
              <option value="PREDETERMINADO">PREDETERMINADO</option>
              <option value="ALEATORIO">ALEATORIO</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hex-pmax">Preguntas máx. *</label>
            <input
              id="hex-pmax"
              type="number"
              className="form-input"
              min="1"
              value={examenMeta.preguntas_max}
              onChange={(e) => setExamenMeta({ ...examenMeta, preguntas_max: parseInt(e.target.value, 10) || 1 })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-escala">Escala / referencia máx.</label>
            <input
              id="hex-escala"
              type="number"
              className="form-input"
              min="0"
              value={examenMeta.escala_max}
              onChange={(e) => setExamenMeta({ ...examenMeta, escala_max: Number(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="hex-mostrar-nota">Mostrar nota</label>
            <select
              id="hex-mostrar-nota"
              className="form-input"
              value={examenMeta.mostrar_nota}
              onChange={(e) => setExamenMeta({ ...examenMeta, mostrar_nota: e.target.value })}
            >
              <option value="NO">No mostrar</option>
              <option value="AL_ENVIAR">Al enviar (auto)</option>
              <option value="TRAS_REVISION">Tras revisión manual</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="hex-msg">Mensaje final</label>
            <input
              id="hex-msg"
              className="form-input"
              value={examenMeta.mensaje_agradecimiento}
              onChange={(e) => setExamenMeta({ ...examenMeta, mensaje_agradecimiento: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={examenMeta.habilitar_fecha_hora}
                onChange={(e) => setExamenMeta({ ...examenMeta, habilitar_fecha_hora: e.target.checked })}
              />
              Habilitar vigencia (fechas)
            </label>
          </div>
          {examenMeta.habilitar_fecha_hora && (
            <>
              <div className="form-group">
                <label htmlFor="hex-fi">Desde</label>
                <input
                  id="hex-fi"
                  type="date"
                  className="form-input"
                  value={examenMeta.fecha_inicio}
                  onChange={(e) => setExamenMeta({ ...examenMeta, fecha_inicio: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="hex-ff">Hasta</label>
                <input
                  id="hex-ff"
                  type="date"
                  className="form-input"
                  value={examenMeta.fecha_fin}
                  onChange={(e) => setExamenMeta({ ...examenMeta, fecha_fin: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn-cancelar" onClick={onClose} disabled={guardando}>
              ✖️ Cerrar
            </button>
            <button type="button" className="btn-guardar" onClick={onClose} disabled={guardando}>
              💾 Listo
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Formulario una pregunta — tipos soportados por BD (alternativas con Quill + correcta como el docente) */
function ModalFormPregunta({ open, onClose, examenMeta, pregunta, onGuardar, bloqueado, uploadImagenUrl }) {
  const quillRef = useRef(null);
  const quillRefsAlternativas = useRef({});
  const [form, setForm] = useState(() => clonePreguntaForm(pregunta));

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      const q = quillRef.current?.getEditor?.();
      if (q) attachQuillImageUploadHandler(q, api, uploadImagenUrl);
    }, 200);
    return () => clearTimeout(t);
  }, [open, form.tipo, uploadImagenUrl]);

  useEffect(() => {
    if (!open || form.tipo !== 'ALTERNATIVAS') return undefined;
    const t = setTimeout(() => {
      Object.values(quillRefsAlternativas.current).forEach((ref) => {
        const ed = ref?.getEditor?.();
        if (ed) attachQuillImageUploadHandler(ed, api, uploadImagenUrl);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, form.tipo, form.opciones?.opciones?.length, uploadImagenUrl]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (bloqueado) return;
    if (!textoPlano(form.texto)) {
      Swal.fire({ icon: 'error', title: 'La descripción es obligatoria', toast: true, position: 'top-end', timer: 2500 });
      return;
    }
    if (!form.solo_informativo && form.tipo === 'ALTERNATIVAS') {
      const opts = form.opciones?.opciones || [];
      if (opts.length < 2) {
        Swal.fire('Atención', 'Agrega al menos 2 alternativas', 'warning');
        return;
      }
      const conTexto = opts.map((op) => textoPlano(op)).filter(Boolean);
      if (conTexto.length < 2) {
        Swal.fire('Atención', 'Completa al menos 2 alternativas con texto', 'warning');
        return;
      }
      const cor = form.opciones?.correcta;
      const requiereCorrecta = !form.calificar_manualmente;
      if (requiereCorrecta) {
        if (typeof cor !== 'number' || Number.isNaN(cor) || cor < 0 || cor >= opts.length) {
          Swal.fire('Atención', 'Marca cuál es la alternativa correcta (o activa «Calificar manualmente»)', 'warning');
          return;
        }
        if (!textoPlano(opts[cor])) {
          Swal.fire('Atención', 'La alternativa marcada como correcta debe tener texto', 'warning');
          return;
        }
      } else if (typeof cor === 'number' && !Number.isNaN(cor) && !textoPlano(opts[cor])) {
        Swal.fire('Atención', 'La alternativa marcada como correcta debe tener texto', 'warning');
        return;
      }
    }
    const toSave = {
      ...form,
      puntos: form.solo_informativo || form.tipo === 'COMPROMISO' ? 0 : form.puntos,
      obligatoria:
        form.solo_informativo ? false : form.tipo === 'COMPROMISO' ? true : form.obligatoria !== false,
      calificar_manualmente:
        form.solo_informativo || form.tipo === 'COMPROMISO' ? false : !!form.calificar_manualmente,
      solo_informativo: form.tipo === 'COMPROMISO' ? false : !!form.solo_informativo,
      opciones: form.tipo === 'COMPROMISO' ? {} : form.opciones
    };
    onGuardar(toSave);
    onClose();
  };

  return createPortal(
    <div className="modal-tema-overlay" style={{ zIndex: 10060 }} onClick={onClose}>
      <div className="modal-tema-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: '92%', width: '920px', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' }}>
          <h2>{pregunta?.id ? '✏️ Editar pregunta' : '📝 Nueva pregunta'}</h2>
          <button type="button" className="modal-tema-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-tema-body">
          <form onSubmit={handleSubmit}>
            <fieldset disabled={bloqueado} style={{ border: 'none', margin: 0, padding: 0 }}>
              <div className="form-group">
                <label htmlFor="hex-p-tipo">Tipo *</label>
                <select
                  id="hex-p-tipo"
                  className="form-input"
                  value={form.tipo}
                  onChange={(e) => {
                    const t = e.target.value;
                    let opciones = form.opciones;
                    if (t === 'ALTERNATIVAS') {
                      opciones = {
                        opciones: ['', '', '', ''],
                        correcta: 0
                      };
                    }
                    if (t === 'VERDADERO_FALSO') opciones = { correcta: true };
                    if (t === 'RESPUESTA_CORTA' || t === 'COMPROMISO') opciones = {};
                    setForm({
                      ...form,
                      tipo: t,
                      opciones,
                      ...(t === 'COMPROMISO'
                        ? {
                            puntos: 0,
                            solo_informativo: false,
                            calificar_manualmente: false,
                            obligatoria: true
                          }
                        : {})
                    });
                  }}
                >
                  <option value="ALTERNATIVAS">ALTERNATIVAS</option>
                  <option value="VERDADERO_FALSO">VERDADERO / FALSO</option>
                  <option value="RESPUESTA_CORTA">RESPUESTA CORTA</option>
                  <option value="COMPROMISO">COMPROMISO (check + firma)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Descripción *</label>
                <ReactQuill
                  key={`hex-enunciado-${form._localKey || form.id || 'n'}`}
                  ref={quillRef}
                  theme="snow"
                  value={form.texto ?? ''}
                  onChange={(v) => setForm({ ...form, texto: v })}
                  placeholder="Enunciado de la pregunta"
                  modules={{
                    toolbar: [
                      [{ header: [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      [{ color: [] }, { background: [] }],
                      [{ align: [] }],
                      ['link', 'image'],
                      ['clean']
                    ]
                  }}
                  formats={[
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
                    'image'
                  ]}
                />
              </div>
              {examenMeta.tipo_puntaje === 'INDIVIDUAL' &&
                !form.solo_informativo &&
                form.tipo !== 'COMPROMISO' && (
                <div className="form-group">
                  <label>Puntos *</label>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    step="0.5"
                    value={form.puntos}
                    onChange={(e) => setForm({ ...form, puntos: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              {form.tipo !== 'COMPROMISO' && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!form.solo_informativo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm({
                        ...form,
                        solo_informativo: checked,
                        puntos: checked ? 0 : form.puntos || 1,
                        obligatoria: checked ? false : form.obligatoria !== false,
                        calificar_manualmente: checked ? false : form.calificar_manualmente
                      });
                    }}
                  />
                  Solo informativo (solo texto; no pide respuesta ni suma puntos)
                </label>
              </div>
              )}
              {!form.solo_informativo &&
                form.tipo !== 'RESPUESTA_CORTA' &&
                form.tipo !== 'COMPROMISO' && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!form.calificar_manualmente}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        let opciones = form.opciones;
                        if (form.tipo === 'ALTERNATIVAS') {
                          opciones = {
                            ...form.opciones,
                            correcta: checked
                              ? typeof form.opciones?.correcta === 'number'
                                ? form.opciones.correcta
                                : null
                              : typeof form.opciones?.correcta === 'number'
                                ? form.opciones.correcta
                                : 0
                          };
                        }
                        setForm({ ...form, calificar_manualmente: checked, opciones });
                      }}
                    />
                    Calificar manualmente (no autoevalúa; tú asignas la nota al revisar)
                  </label>
                </div>
              )}
              {!form.solo_informativo && form.tipo !== 'COMPROMISO' && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.obligatoria !== false}
                      onChange={(e) => setForm({ ...form, obligatoria: e.target.checked })}
                    />
                    Obligatoria
                  </label>
                </div>
              )}

              {form.solo_informativo && (
                <p style={{ color: '#0f766e', fontSize: '0.9rem', background: '#f0fdfa', padding: '10px 12px', borderRadius: 8 }}>
                  Bloque informativo: en el examen solo se mostrará este texto, sin campo de respuesta.
                </p>
              )}
              {form.tipo === 'COMPROMISO' && (
                <p style={{ color: '#92400e', fontSize: '0.9rem', background: '#fffbeb', padding: '10px 12px', borderRadius: 8 }}>
                  Compromiso: el participante verá este texto, un check de aceptación y un pad para firmar con el dedo
                  o mouse. Es obligatorio para enviar; no suma puntos.
                </p>
              )}

              {!form.solo_informativo && form.tipo === 'ALTERNATIVAS' && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ margin: 0, fontWeight: 700, color: '#1e3a8a' }}>Alternativas</label>
                    <button
                      type="button"
                      className="btn-nuevo-item"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() => {
                        const arr = [...(form.opciones?.opciones || [])];
                        arr.push('');
                        setForm({ ...form, opciones: { ...form.opciones, opciones: arr } });
                      }}
                    >
                      + Agregar
                    </button>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 10 }}>
                    {form.calificar_manualmente
                      ? 'Puedes dejar sin marcar «Correcta»: verás la opción elegida y asignarás puntos al revisar.'
                      : 'Marca la alternativa correcta (autoevaluación). O activa «Calificar manualmente» si no quieres clave.'}
                  </p>
                  {form.calificar_manualmente && (
                    <button
                      type="button"
                      className="btn-cancelar"
                      style={{ marginBottom: 10, padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() =>
                        setForm({
                          ...form,
                          opciones: { ...form.opciones, correcta: null }
                        })
                      }
                    >
                      Quitar marca de correcta
                    </button>
                  )}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <table className="tabla-aula-virtual" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 280 }}>Descripción</th>
                          <th style={{ width: 130, textAlign: 'center' }}>
                            {form.calificar_manualmente ? 'Correcta (opc.)' : 'Correcta'}
                          </th>
                          <th style={{ width: 72, textAlign: 'center' }}> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.opciones?.opciones || []).map((op, j) => (
                          <tr key={`${form._localKey || 'p'}-alt-row-${j}`}>
                            <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                              <ReactQuill
                                key={`${form._localKey || 'p'}-alt-q-${j}`}
                                ref={(el) => {
                                  if (el) quillRefsAlternativas.current[j] = el;
                                }}
                                theme="snow"
                                value={op || ''}
                                onChange={(v) => {
                                  const next = [...(form.opciones?.opciones || [])];
                                  next[j] = v;
                                  setForm({ ...form, opciones: { ...form.opciones, opciones: next } });
                                }}
                                placeholder="Escribe la alternativa..."
                                modules={{
                                  toolbar: [
                                    [{ header: [1, 2, 3, false] }],
                                    ['bold', 'italic', 'underline'],
                                    [{ list: 'ordered' }, { list: 'bullet' }],
                                    ['link', 'image'],
                                    ['clean']
                                  ]
                                }}
                                formats={['header', 'bold', 'italic', 'underline', 'list', 'bullet', 'link', 'image']}
                              />
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', verticalAlign: 'middle' }}>
                              <label className="checkbox-label" style={{ justifyContent: 'center', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`hex-alt-correcta-${form._localKey || form.id || 'x'}`}
                                  checked={form.opciones?.correcta === j}
                                  onChange={() =>
                                    setForm({
                                      ...form,
                                      opciones: { ...form.opciones, correcta: j }
                                    })
                                  }
                                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                                />
                                <span
                                  style={{
                                    marginLeft: 6,
                                    fontWeight: 600,
                                    color: form.opciones?.correcta === j ? '#10b981' : '#6b7280'
                                  }}
                                >
                                  {form.opciones?.correcta === j ? '✓ Correcta' : 'Marcar'}
                                </span>
                              </label>
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', verticalAlign: 'middle' }}>
                              <button
                                type="button"
                                className="btn-opciones"
                                title="Eliminar opción"
                                disabled={(form.opciones?.opciones || []).length <= 2}
                                onClick={() => {
                                  const arr = [...(form.opciones?.opciones || [])];
                                  if (arr.length <= 2) return;
                                  arr.splice(j, 1);
                                  let cor = form.opciones?.correcta;
                                  if (typeof cor === 'number') {
                                    if (cor === j) cor = form.calificar_manualmente ? null : 0;
                                    else if (cor > j) cor -= 1;
                                  }
                                  quillRefsAlternativas.current = {};
                                  setForm({
                                    ...form,
                                    opciones: { ...form.opciones, opciones: arr, correcta: cor }
                                  });
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 8,
                                  padding: '0.4rem 0.55rem',
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!form.solo_informativo && form.tipo === 'VERDADERO_FALSO' && (
                <div className="form-group">
                  <label>Respuesta correcta {form.calificar_manualmente ? '(opcional)' : ''}</label>
                  <select
                    className="form-input"
                    value={
                      form.opciones?.correcta === false
                        ? 'false'
                        : form.opciones?.correcta === true
                          ? 'true'
                          : form.calificar_manualmente
                            ? ''
                            : 'true'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') {
                        setForm({ ...form, opciones: {} });
                      } else {
                        setForm({
                          ...form,
                          opciones: { ...form.opciones, correcta: v === 'true' }
                        });
                      }
                    }}
                  >
                    {form.calificar_manualmente ? <option value="">Sin clave (revisión manual)</option> : null}
                    <option value="true">Verdadero</option>
                    <option value="false">Falso</option>
                  </select>
                </div>
              )}
              {!form.solo_informativo && form.tipo === 'RESPUESTA_CORTA' && (
                <p style={{ color: '#92400e', fontSize: '0.9rem' }}>Se califica manualmente en estadísticas.</p>
              )}

              <div className="form-actions">
                <button type="button" className="btn-cancelar" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn-guardar" disabled={bloqueado}>
                  Guardar pregunta
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Modal listado + contexto compartido */
function ModalPreguntas({
  open,
  onClose,
  examenTitulo,
  examenMeta,
  setExamenMeta,
  preguntas,
  setPreguntas,
  bloqueado,
  onNueva,
  onEditar,
  uploadImagenUrl,
  uploadPdfUrl
}) {
  const quillBloqueRef = useRef(null);
  const [subiendoBloqueImg, setSubiendoBloqueImg] = useState(false);
  const [subiendoPdf, setSubiendoPdf] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      const q = quillBloqueRef.current?.getEditor?.();
      if (q) attachQuillImageUploadHandler(q, api, uploadImagenUrl);
    }, 250);
    return () => clearTimeout(t);
  }, [open, uploadImagenUrl]);

  const subirImagenContexto = async (file) => {
    if (!file || bloqueado) return;
    if (file.size > 8 * 1024 * 1024) {
      Swal.fire('Error', 'La imagen no puede superar 8MB', 'error');
      return;
    }
    setSubiendoBloqueImg(true);
    try {
      const fd = new FormData();
      fd.append('imagen', file);
      const { data } = await api.post(uploadImagenUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data?.url) setExamenMeta((m) => ({ ...m, bloque_imagen_url: data.url }));
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'No se pudo subir la imagen', 'error');
    } finally {
      setSubiendoBloqueImg(false);
    }
  };

  const subirPdfsContexto = async (fileList) => {
    if (bloqueado || !fileList?.length) return;
    const files = Array.from(fileList);
    setSubiendoPdf(true);
    try {
      for (const file of files) {
        if (!file) continue;
        const isPdf =
          String(file.type || '').toLowerCase() === 'application/pdf' ||
          String(file.name || '').toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          Swal.fire('Atención', `"${file.name}" no es PDF`, 'warning');
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          Swal.fire('Atención', `"${file.name}" supera 15MB`, 'warning');
          continue;
        }
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('nombre', file.name);
        const { data } = await api.post(uploadPdfUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (data?.url) {
          setExamenMeta((m) => ({
            ...m,
            bloque_archivos: [
              ...(Array.isArray(m.bloque_archivos) ? m.bloque_archivos : []),
              { nombre: data.nombre || file.name, url: data.url, size: data.size || file.size || null }
            ]
          }));
        }
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.response?.data?.error || 'No se pudo subir el PDF', 'error');
    } finally {
      setSubiendoPdf(false);
    }
  };

  const quitarPdf = (idx) => {
    if (bloqueado) return;
    setExamenMeta((m) => ({
      ...m,
      bloque_archivos: (m.bloque_archivos || []).filter((_, i) => i !== idx)
    }));
  };

  const handleDragEnd = (event) => {
    if (bloqueado) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = preguntas.map(preguntaKey);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setPreguntas(arrayMove(preguntas, oldIndex, newIndex));
  };

  const eliminar = (p) => {
    if (bloqueado) return;
    setPreguntas((prev) => prev.filter((x) => preguntaKey(x) !== preguntaKey(p)));
  };

  if (!open) return null;

  return createPortal(
    <div className="modal-tema-overlay" onClick={onClose}>
      <div
        className="modal-tema-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: '95%', width: '1200px', maxHeight: '92vh', overflow: 'auto' }}
      >
        <div className="modal-tema-header" style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' }}>
          <h2>📝 Preguntas y alternativas — {examenTitulo || 'Examen'}</h2>
          <button type="button" className="modal-tema-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-tema-body">
          {bloqueado && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.875rem 1rem',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                color: '#78350f',
                fontSize: '0.9rem'
              }}
            >
              <strong>Contenido bloqueado.</strong> Hay intentos enviados; solo puedes revisar. Los metadatos del examen sí se pueden ajustar desde el otro modal.
            </div>
          )}
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 8, color: '#065f46' }}>📎 Contexto del examen (opcional)</h3>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 8 }}>
              Texto enriquecido y/o una imagen que verá el alumno durante toda la prueba (caso, gráfico). Las preguntas pueden basarse en este contexto.
            </p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, color: '#065f46' }}>Enunciado / caso</label>
              <ReactQuill
                ref={quillBloqueRef}
                theme="snow"
                readOnly={bloqueado}
                value={examenMeta.bloque_contenido ?? ''}
                onChange={(v) => setExamenMeta({ ...examenMeta, bloque_contenido: v })}
                placeholder="Escriba aquí el contexto compartido..."
                modules={{
                  toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    ['link', 'image'],
                    ['clean']
                  ]
                }}
                formats={[
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
                  'image'
                ]}
              />
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label style={{ fontWeight: 600, color: '#065f46' }}>Imagen del contexto (opcional)</label>
              {!bloqueado && (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  disabled={subiendoBloqueImg}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) subirImagenContexto(f);
                  }}
                  style={{ display: 'block', marginTop: '0.35rem' }}
                />
              )}
              {subiendoBloqueImg && (
                <p style={{ fontSize: '0.85rem', color: '#6366f1', marginTop: 8 }}>Subiendo imagen…</p>
              )}
              {examenMeta.bloque_imagen_url ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <img
                    src={examenMeta.bloque_imagen_url}
                    alt="Contexto del examen"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 240,
                      borderRadius: 8,
                      border: '1px solid #a7f3d0',
                      objectFit: 'contain'
                    }}
                  />
                  {!bloqueado && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        color: '#065f46'
                      }}
                    >
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) setExamenMeta((m) => ({ ...m, bloque_imagen_url: '' }));
                        }}
                      />
                      Quitar imagen
                    </label>
                  )}
                </div>
              ) : null}
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>O pegar URL de imagen (opcional)</label>
              <input
                className="form-input"
                value={examenMeta.bloque_imagen_url || ''}
                onChange={(e) => setExamenMeta({ ...examenMeta, bloque_imagen_url: e.target.value })}
                placeholder="https://..."
                disabled={bloqueado}
              />
            </div>

            <div className="form-group" style={{ marginTop: 18 }}>
              <label style={{ fontWeight: 700, color: '#9a3412' }}>Material de referencia (PDF)</label>
              <p style={{ fontSize: '0.85rem', color: '#78716c', margin: '4px 0 10px' }}>
                Suba uno o varios PDF (reglamento, manual, etc.). El participante los verá al inicio del examen.
              </p>
              <label
                className="hex-pdf-upload-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 12,
                  background: bloqueado ? '#e7e5e4' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: bloqueado ? 'not-allowed' : 'pointer',
                  opacity: subiendoPdf ? 0.7 : 1
                }}
              >
                {subiendoPdf ? 'Subiendo…' : '＋ Subir PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  hidden
                  disabled={bloqueado || subiendoPdf}
                  onChange={(e) => {
                    const list = e.target.files;
                    if (list?.length) subirPdfsContexto(list);
                    e.target.value = '';
                  }}
                />
              </label>

              {(examenMeta.bloque_archivos || []).length > 0 ? (
                <div className="hex-pdf-cards" style={{ marginTop: 14 }}>
                  {(examenMeta.bloque_archivos || []).map((arch, idx) => (
                    <div key={`${arch.url}-${idx}`} className="hex-pdf-card hex-pdf-card--editor">
                      <div className="hex-pdf-card-icon" aria-hidden>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                            fill="#fee2e2"
                            stroke="#dc2626"
                            strokeWidth="1.4"
                          />
                          <path d="M14 3v5h5" stroke="#dc2626" strokeWidth="1.4" fill="none" />
                          <text x="8" y="17" fontSize="6.5" fontWeight="800" fill="#b91c1c">
                            PDF
                          </text>
                        </svg>
                      </div>
                      <div className="hex-pdf-card-body">
                        <div className="hex-pdf-card-name">{arch.nombre || 'Documento.pdf'}</div>
                        <div className="hex-pdf-card-meta">Documento de referencia</div>
                      </div>
                      <div className="hex-pdf-card-actions">
                        <a
                          className="hex-pdf-btn hex-pdf-btn--open"
                          href={arch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir
                        </a>
                        {!bloqueado ? (
                          <button type="button" className="hex-pdf-btn hex-pdf-btn--remove" onClick={() => quitarPdf(idx)}>
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 10, fontSize: '0.85rem', color: '#a8a29e' }}>Aún no hay PDF adjuntos.</p>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
              Total: <strong style={{ color: '#6366f1' }}>{preguntas.length}</strong>
            </p>
            <button type="button" className="btn-nuevo-item" onClick={onNueva} disabled={bloqueado}>
              <span>➕</span> Registrar nuevo
            </button>
          </div>

          {preguntas.length === 0 ? (
            <div className="empty-state">
              <p>📋 No hay preguntas aún</p>
              <button type="button" className="btn-nuevo-item" style={{ marginTop: '1rem' }} onClick={onNueva} disabled={bloqueado}>
                Registrar primera pregunta
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="tabla-aula-virtual">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th style={{ textAlign: 'left' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'center', width: 150 }}>TIPO</th>
                    <th style={{ textAlign: 'center', width: 100 }}>PUNTOS</th>
                    <th style={{ textAlign: 'center', width: 160 }}>ACCIONES</th>
                  </tr>
                </thead>
                <SortableContext items={preguntas.map(preguntaKey)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {preguntas.map((p) => (
                      <SortablePreguntaHex
                        key={preguntaKey(p)}
                        pregunta={p}
                        examenMeta={examenMeta}
                        bloqueado={bloqueado}
                        onEditar={onEditar}
                        onEliminar={eliminar}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          )}

          <div className="modal-tema-footer" style={{ padding: '1rem 0 0', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn-cancelar-tema" onClick={onClose}>
              ✖️ Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function HerramientasExamenEditor({ variant = 'admin' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const esNueva = !id || id === 'nueva';
  const esAdmin = variant === 'admin';
  const base = '/admin/herramientas/examenes';
  const apiBase = '/herramientas-examenes/admin';

  const [loading, setLoading] = useState(!esNueva);
  const [gruposOpts, setGruposOpts] = useState([]);
  const [examenMeta, setExamenMeta] = useState(() => emptyExamenMeta());
  const [audiencias, setAudiencias] = useState([]);
  const [grupoIds, setGrupoIds] = useState([]);
  const [preguntas, setPreguntas] = useState([]);
  const [tieneIntentos, setTieneIntentos] = useState(false);
  const [modalDatos, setModalDatos] = useState(false);
  const [modalLista, setModalLista] = useState(false);
  const [modalPregunta, setModalPregunta] = useState(false);
  const [editPregunta, setEditPregunta] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data } = await api.get('/herramientas-examenes/meta/grupos');
        if (!c) setGruposOpts(data.grupos || []);
      } catch {
        if (!c) setGruposOpts([]);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (esNueva) return;
    setLoading(true);
    try {
      const { data } = await api.get(`${apiBase}/${id}`);
      setExamenMeta(mapExamenFromApi(data.examen));
      setAudiencias(data.audiencias || []);
      setGrupoIds((data.grupo_ids || []).map(Number));
      setPreguntas(mapPreguntasFromApi(data.preguntas));
      setTieneIntentos(!!data.tiene_intentos_finalizados);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo cargar', 'error');
      navigate(base);
    } finally {
      setLoading(false);
    }
  }, [apiBase, id, esNueva, navigate, base]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAud = (v) => {
    setAudiencias((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (v === HEX_AUD_TODOS) return [HEX_AUD_TODOS];
      const next = prev.filter((x) => x !== HEX_AUD_TODOS);
      if (v === HEX_AUD_PERSONAL) return [...next.filter((x) => x === 'ALUMNO' || x === 'APODERADO'), HEX_AUD_PERSONAL];
      return [...next, v];
    });
  };

  const toggleGrupo = (gid) => {
    setGrupoIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const guardarPreguntaEnLista = (form) => {
    const f = clonePreguntaForm(form);
    setPreguntas((prev) => {
      const key = f.id != null ? `id-${f.id}` : f._localKey;
      if (!key) return prev;
      const idx = prev.findIndex((p) => preguntaKey(p) === key);
      if (idx >= 0) {
        const n = [...prev];
        n[idx] = f;
        return n;
      }
      return [...prev, f];
    });
  };

  const abrirNuevaPregunta = () => {
    setEditPregunta(nuevaPreguntaLocal());
    setModalPregunta(true);
  };

  const abrirEditarPregunta = (p) => {
    setEditPregunta(clonePreguntaForm(p));
    setModalPregunta(true);
  };

  const buildPayload = () => {
    const fi = examenMeta.habilitar_fecha_hora ? examenMeta.fecha_inicio || null : null;
    const ff = examenMeta.habilitar_fecha_hora ? examenMeta.fecha_fin || null : null;
    return {
      titulo: examenMeta.titulo.trim(),
      descripcion: examenMeta.descripcion || null,
      estado: examenMeta.estado,
      modo: examenMeta.modo,
      fecha_inicio: fi,
      fecha_fin: ff,
      mensaje_agradecimiento: examenMeta.mensaje_agradecimiento,
      intentos_max: examenMeta.intentos_max,
      mostrar_nota: examenMeta.mostrar_nota,
      escala_max: examenMeta.escala_max,
      tiempo_minutos: examenMeta.tiempo_minutos,
      tipo_puntaje: examenMeta.tipo_puntaje,
      puntos_correcta: examenMeta.tipo_puntaje === 'INDIVIDUAL' ? null : examenMeta.puntos_correcta,
      penalizar_incorrecta: examenMeta.penalizar_incorrecta,
      penalizacion_incorrecta: examenMeta.penalizacion_incorrecta,
      orden_preguntas: examenMeta.orden_preguntas,
      preguntas_max: examenMeta.preguntas_max,
      bloque_contenido: examenMeta.bloque_contenido || null,
      bloque_imagen_url: examenMeta.bloque_imagen_url || null,
      bloque_archivos: Array.isArray(examenMeta.bloque_archivos) ? examenMeta.bloque_archivos : [],
      audiencias,
      grupo_ids: grupoIds,
      preguntas: preguntas
        .filter((p) => textoPlano(p.texto))
        .map((p) => ({
          texto: p.texto,
          tipo: p.tipo,
          opciones: p.opciones,
          puntos: p.solo_informativo || p.tipo === 'COMPROMISO' ? 0 : Math.max(0, Number(p.puntos) || 0),
          solo_informativo: p.tipo === 'COMPROMISO' ? false : !!p.solo_informativo,
          calificar_manualmente:
            !p.solo_informativo && p.tipo !== 'COMPROMISO' && !!p.calificar_manualmente,
          obligatoria:
            p.solo_informativo ? false : p.tipo === 'COMPROMISO' ? true : p.obligatoria !== false
        }))
    };
  };

  const guardar = async () => {
    if (!examenMeta.titulo.trim()) {
      Swal.fire('Atención', 'El título es obligatorio (modal Datos del examen)', 'warning');
      return;
    }
    if (audiencias.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos una audiencia', 'warning');
      return;
    }
    const validas = preguntas.filter((p) => textoPlano(p.texto));
    if (!validas.length) {
      Swal.fire('Atención', 'Agrega al menos una pregunta con texto (modal Preguntas)', 'warning');
      return;
    }

    setGuardando(true);
    try {
      const payload = buildPayload();
      if (esNueva) {
        const { data } = await api.post(apiBase, payload);
        const newId = data.id;
        Swal.fire({ icon: 'success', title: 'Examen creado', timer: 1400, showConfirmButton: false });
        if (newId) navigate(`${base}/${newId}/editar`, { replace: true });
        else navigate(base);
      } else {
        const { data } = await api.put(`${apiBase}/${id}`, payload);
        if (data.soloMetadatos) {
          Swal.fire('Guardado', 'Solo se actualizaron datos generales (hay intentos enviados).', 'info');
        } else {
          Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
        }
        await load();
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!esAdmin) {
    return <Navigate to="/herramientas-examenes" replace />;
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="hex-exam-wrap" style={{ padding: '2rem', textAlign: 'center' }}>
          Cargando…
        </div>
      </DashboardLayout>
    );
  }

  const bloqueado = tieneIntentos;
  const uploadImagenUrl = '/herramientas-examenes/admin/subir-imagen';
  const uploadPdfUrl = '/herramientas-examenes/admin/subir-pdf';

  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)}>
            ← Volver a la lista
          </button>
        </div>

        <div className="aula-virtual-header" style={{ marginBottom: '1.25rem' }}>
          <h1 className="aula-virtual-title" style={{ fontSize: '1.5rem' }}>
            {esNueva ? 'Nuevo examen de herramientas' : 'Editar examen de herramientas'}
          </h1>
          <p className="aula-virtual-subtitle" style={{ maxWidth: 720 }}>
            Mismo flujo que el aula virtual: primero <strong>datos del examen</strong>, luego <strong>preguntas y alternativas</strong>. Sin vínculo a registro de notas del curso.
          </p>
        </div>

        <div className="docente-examen-bloque-acc" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button type="button" className="btn-nuevo-item" onClick={() => setModalDatos(true)}>
              📝 Datos del examen
            </button>
            <button type="button" className="btn-nuevo-item" onClick={() => setModalLista(true)} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
              📝 Preguntas y alternativas
            </button>
          </div>
          {examenMeta.titulo ? (
            <p style={{ marginTop: 12, color: '#374151', fontWeight: 600 }}>
              {examenMeta.titulo}{' '}
              <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.9rem' }}>
                — {examenMeta.estado} · {examenMeta.modo}
              </span>
            </p>
          ) : (
            <p style={{ marginTop: 12, color: '#9ca3af' }}>Aún no has definido el título (abre «Datos del examen»).</p>
          )}
        </div>

        <div className="hex-exam-card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>Audiencias</h3>
          <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 12px' }}>
            «Todo el personal» cubre a todos los trabajadores (no alumnos ni apoderados). Los perfiles sueltos sirven
            si el examen es solo para un cargo. «Todos los usuarios» incluye comunidad y personal.
          </p>
          <p className="hex-aud-heading">Comunidad</p>
          <div className="hex-aud-chips">
            {HEX_AUDIENCIAS.filter((a) => a.grupo === 'comunidad' || a.grupo === 'comunidad-extra').map((a) => (
              <label key={a.value} className="checkbox-label hex-aud-chip">
                <input type="checkbox" checked={audiencias.includes(a.value)} onChange={() => toggleAud(a.value)} />
                {a.label}
              </label>
            ))}
          </div>
          <p className="hex-aud-heading">Personal</p>
          <div className="hex-aud-chips">
            {HEX_AUDIENCIAS.filter((a) => a.grupo === 'personal-clave' || a.grupo === 'personal').map((a) => (
              <label
                key={a.value}
                className={`checkbox-label hex-aud-chip ${a.value === HEX_AUD_PERSONAL ? 'hex-aud-chip--clave' : ''}`}
              >
                <input type="checkbox" checked={audiencias.includes(a.value)} onChange={() => toggleAud(a.value)} />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="hex-exam-card">
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>Alcance por aulas (opcional)</h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: 12 }}>
            Sin selección = toda la institución (según audiencia). Si eliges aulas, el filtro aplica a alumnos,
            apoderados y docentes; el resto del personal sigue viendo el examen.
          </p>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {gruposOpts.map((g) => {
              const label = `${g.nivel_nombre || ''} ${g.grado}° ${g.seccion || ''}`.trim();
              return (
                <label key={g.id} className="checkbox-label" style={{ display: 'block', marginBottom: 6 }}>
                  <input type="checkbox" checked={grupoIds.includes(g.id)} onChange={() => toggleGrupo(g.id)} />
                  {label || `Grupo ${g.id}`}
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar examen'}
          </button>
        </div>
      </div>

      <ModalDatosExamen open={modalDatos} onClose={() => setModalDatos(false)} examenMeta={examenMeta} setExamenMeta={setExamenMeta} guardando={guardando} />

      <ModalPreguntas
        open={modalLista}
        onClose={() => setModalLista(false)}
        examenTitulo={examenMeta.titulo}
        examenMeta={examenMeta}
        setExamenMeta={setExamenMeta}
        preguntas={preguntas}
        setPreguntas={setPreguntas}
        bloqueado={bloqueado}
        onNueva={abrirNuevaPregunta}
        onEditar={abrirEditarPregunta}
        uploadImagenUrl={uploadImagenUrl}
        uploadPdfUrl={uploadPdfUrl}
      />

      <ModalFormPregunta
        key={
          modalPregunta && editPregunta
            ? editPregunta.id != null
              ? `hex-q-id-${editPregunta.id}`
              : editPregunta._localKey || 'hex-q-nueva'
            : 'hex-q-cerrado'
        }
        open={modalPregunta}
        onClose={() => {
          setModalPregunta(false);
          setEditPregunta(null);
        }}
        examenMeta={examenMeta}
        pregunta={editPregunta}
        bloqueado={bloqueado}
        onGuardar={(form) => guardarPreguntaEnLista(form)}
        uploadImagenUrl={uploadImagenUrl}
      />
    </DashboardLayout>
  );
}
