import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { exportConductaGrupoPdf } from '../../utils/exportConductaGrupoPdf';
import '../../pages/DocenteTutoria.css';

const API_BASE = '/admin/academico/grupos';

/**
 * Registro de conducta por grupo (misma UX que DocenteTutoria → Registrar Conducta).
 * Usa rutas /api/admin/academico/grupos/:id/conducta (solo ADMINISTRADOR).
 */
function AdminGrupoConductaModal({ open, grupo, onClose }) {
  const [conductaCiclo, setConductaCiclo] = useState(1);
  const [conductaAlumnos, setConductaAlumnos] = useState([]);
  const [loadingConducta, setLoadingConducta] = useState(false);
  const [guardandoConducta, setGuardandoConducta] = useState(false);

  const cargarConducta = async (grupoId, ciclo) => {
    if (!grupoId) return;
    try {
      setLoadingConducta(true);
      const res = await api.get(`${API_BASE}/${grupoId}/conducta`, { params: { ciclo } });
      setConductaAlumnos(res.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando conducta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las notas de conducta',
      });
      setConductaAlumnos([]);
    } finally {
      setLoadingConducta(false);
    }
  };

  useEffect(() => {
    if (!open || !grupo?.id) return;
    setConductaCiclo(1);
    cargarConducta(grupo.id, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar grupo
  }, [open, grupo?.id]);

  const handleCambiarCiclo = (ciclo) => {
    setConductaCiclo(ciclo);
    if (grupo?.id) cargarConducta(grupo.id, ciclo);
  };

  const handleConductaChange = (matriculaId, valor) => {
    const v = String(valor || '')
      .replace(/[^0-9]/g, '')
      .slice(0, 2);
    const num = parseInt(v, 10);
    const finalVal = v === '' ? '' : num >= 0 && num <= 20 ? v : num > 20 ? '20' : v;
    setConductaAlumnos((prev) =>
      prev.map((a) => (a.matricula_id === matriculaId ? { ...a, nota_conducta: finalVal } : a))
    );
  };

  const handleGuardar = async () => {
    if (!grupo?.id) return;
    try {
      setGuardandoConducta(true);
      const notas = {};
      conductaAlumnos.forEach((a) => {
        notas[a.matricula_id] = a.nota_conducta || '20';
      });
      await api.post(`${API_BASE}/${grupo.id}/conducta`, {
        ciclo: conductaCiclo,
        notas,
      });
      Swal.fire({
        icon: 'success',
        title: 'Guardado',
        text: 'Notas de conducta guardadas correctamente',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error guardando conducta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar',
      });
    } finally {
      setGuardandoConducta(false);
    }
  };

  const handleExportarPdf = () => {
    exportConductaGrupoPdf({
      alumnos: conductaAlumnos,
      grupo: {
        grado: grupo?.grado,
        seccion: grupo?.seccion,
        nivel_nombre: grupo?.nivel_nombre,
        anio: grupo?.anio,
      },
      ciclo: conductaCiclo,
    });
  };

  if (!open || !grupo) return null;

  return createPortal(
    <div className="modal-registro-asistencia-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-registro-asistencia-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-registro-asistencia-header">
          <h2>📝 Registrar Conducta</h2>
          <button className="modal-registro-asistencia-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="modal-registro-asistencia-filters modal-registro-asistencia-filters--wrap">
          <label htmlFor="admin-conducta-ciclo">Bimestre:</label>
          <select
            id="admin-conducta-ciclo"
            value={conductaCiclo}
            onChange={(e) => handleCambiarCiclo(parseInt(e.target.value, 10))}
            disabled={loadingConducta}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              fontSize: '1rem',
              background: 'white',
              minWidth: 100,
            }}
          >
            {[1, 2, 3, 4].map((b) => (
              <option key={b} value={b}>
                Bimestre {b}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-imprimir-asistencia"
            onClick={handleExportarPdf}
            disabled={loadingConducta || !conductaAlumnos.length}
          >
            🖨️ Exportar PDF
          </button>
        </div>
        <div className="modal-registro-asistencia-table-wrap">
          {loadingConducta ? (
            <div className="modal-registro-asistencia-loading">
              <div className="loading-spinner" />
              <p>Cargando...</p>
            </div>
          ) : (
            <table className="tabla-registro-asistencia">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>N°</th>
                  <th>APELLIDOS Y NOMBRES</th>
                  <th style={{ width: 90, textAlign: 'center' }}>NOTA (0-20)</th>
                </tr>
              </thead>
              <tbody>
                {conductaAlumnos.map((a) => (
                  <tr key={a.matricula_id}>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                    <td>{a.nombre_completo}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="text"
                        className="input-conducta"
                        value={a.nota_conducta || ''}
                        onChange={(e) => handleConductaChange(a.matricula_id, e.target.value)}
                        maxLength={2}
                        placeholder="20"
                        style={{ width: 50, textAlign: 'center', padding: '0.5rem' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-registro-asistencia-footer">
          <button
            type="button"
            className="btn-guardar-asistencias"
            onClick={handleGuardar}
            disabled={loadingConducta || guardandoConducta}
          >
            {guardandoConducta ? 'Guardando...' : 'Guardar Datos'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AdminGrupoConductaModal;
