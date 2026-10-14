import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import SwalSobreModal from '../utils/swalSobreModal';
import './ConductaRegistrosAlumno.css';

function fechaCorta(fecha, hora) {
  if (!fecha) return '';
  const [y, m, d] = String(fecha).slice(0, 10).split('-');
  if (!d) return fecha;
  return `${d}/${m}${hora ? ` ${hora}` : ''}`;
}

export default function ConductaRegistrosAlumno({ matriculaId, compacto = false }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!matriculaId) return;
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/docente/conducta/registros', { params: { matricula_id: matriculaId } });
      setRegistros(data.registros || []);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar la conducta');
      setRegistros([]);
    } finally {
      setCargando(false);
    }
  }, [matriculaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const quitar = async (reg) => {
    const ok = await SwalSobreModal.fire({
      icon: 'warning',
      title: `Quitar ${reg.codigo}`,
      text: 'Se elimina este registro y la nota de conducta se calcula de nuevo.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#be123c',
    });
    if (!ok.isConfirmed) return;
    try {
      const { data } = await api.delete(`/docente/conducta/registros/${reg.id}`);
      await cargar();
      SwalSobreModal.fire({
        icon: 'success',
        title: 'Listo',
        text: data.nota != null ? `La nota del bimestre quedó en ${data.nota}.` : 'Se actualizó la nota de conducta.',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      SwalSobreModal.fire({ icon: 'error', title: 'No se pudo quitar', text: e.response?.data?.error || e.message });
    }
  };

  if (cargando) return <p className="cra-vacio">Cargando registros…</p>;
  if (error) return <p className="cra-vacio">{error}</p>;
  if (!registros.length) return <p className="cra-vacio">Todavía no hay faltas, tardanzas ni vestimenta en este año.</p>;

  return (
    <ul className={`cra-lista${compacto ? ' cra-lista--compacta' : ''}`}>
      {registros.map((reg) => (
        <li key={reg.id}>
          <div className="cra-top">
            <strong>{reg.codigo}</strong>
            <span>{reg.etiqueta}</span>
            <small>{fechaCorta(reg.fecha, reg.hora)}</small>
          </div>
          <div className="cra-fila">
            <p>{reg.nombre}</p>
            <em title="Puntaje">−{reg.descuento}</em>
            <button type="button" onClick={() => quitar(reg)} aria-label={`Quitar ${reg.codigo}`} title="Quitar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
                <path d="M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
