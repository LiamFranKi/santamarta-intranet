import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
function labelGrupo(g) {
  const parts = [g.nivel_nombre, g.curso_nombre, g.grado != null ? `${g.grado}°` : '', g.seccion].filter(Boolean);
  return parts.join(' · ');
}

export default function AdminEventos() {
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [gruposDisponibles, setGruposDisponibles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_evento: '',
    hora_inicio: '',
    hora_fin: '',
    lugar: '',
    responsable: '',
    expositor: '',
    aviso_texto: '',
    programa_texto: '',
    materiales_texto: '',
    estado: 'BORRADOR',
    grupo_ids: []
  });

  const publicUrlBase = useMemo(() => `${window.location.origin}/evento/`, []);

  const load = async () => {
    setLoading(true);
    try {
      const [list, grupos] = await Promise.all([
        api.get('/admin/eventos'),
        api.get('/admin/eventos/grupos-disponibles')
      ]);
      setEventos(list.data.eventos || []);
      setGruposDisponibles(grupos.data.grupos || []);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar los eventos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNuevo = () => {
    setEditId(null);
    setForm({
      titulo: '',
      descripcion: '',
      fecha_evento: '',
      hora_inicio: '',
      hora_fin: '',
      lugar: '',
      responsable: '',
      expositor: '',
      aviso_texto: '',
      programa_texto: '',
      materiales_texto: '',
      estado: 'BORRADOR',
      grupo_ids: []
    });
    setModalOpen(true);
  };

  const openEditar = async (id) => {
    try {
      const { data } = await api.get(`/admin/eventos/${id}`);
      const ev = data.evento;
      setEditId(id);
      setForm({
        titulo: ev.titulo || '',
        descripcion: ev.descripcion || '',
        fecha_evento: ev.fecha_evento ? String(ev.fecha_evento).slice(0, 10) : '',
        hora_inicio: ev.hora_inicio || '',
        hora_fin: ev.hora_fin || '',
        lugar: ev.lugar || '',
        responsable: ev.responsable || '',
        expositor: ev.expositor || '',
        aviso_texto: ev.aviso_texto || '',
        programa_texto: ev.programa_texto || '',
        materiales_texto: ev.materiales_texto || '',
        estado: ev.estado || 'BORRADOR',
        grupo_ids: data.grupo_ids || []
      });
      setModalOpen(true);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo abrir el evento', 'error');
    }
  };

  const toggleGrupo = (gid) => {
    setForm((f) => {
      const set = new Set(f.grupo_ids);
      if (set.has(gid)) set.delete(gid);
      else set.add(gid);
      return { ...f, grupo_ids: [...set] };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    const titulo = String(form.titulo || '').trim();
    if (!titulo) {
      Swal.fire('Atención', 'El título es obligatorio', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        titulo,
        grupo_ids: form.grupo_ids
      };
      if (editId) {
        await api.put(`/admin/eventos/${editId}`, payload);
        Swal.fire('Listo', 'Evento actualizado', 'success');
      } else {
        await api.post('/admin/eventos', payload);
        Swal.fire('Listo', 'Evento creado', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id) => {
    const r = await Swal.fire({
      title: '¿Eliminar evento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;
    try {
      await api.delete(`/admin/eventos/${id}`);
      Swal.fire('Eliminado', '', 'success');
      load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  const copiarEnlace = (token) => {
    const url = `${publicUrlBase}${token}`;
    navigator.clipboard.writeText(url).then(
      () => Swal.fire({ icon: 'success', title: 'Enlace copiado', timer: 1600, showConfirmButton: false }),
      () => Swal.fire('Error', 'No se pudo copiar', 'error')
    );
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '8px 4px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Eventos institucionales</h1>
            <p style={{ margin: '6px 0 0', color: '#5c6378', fontSize: '0.95rem' }}>
              Crea eventos y comparte el enlace o QR para registro de asistencia (apoderados y visitantes).
            </p>
          </div>
          <button
            type="button"
            onClick={openNuevo}
            style={{
              padding: '10px 18px',
              borderRadius: 12,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c8cff 0%, #9b7bff 100%)',
              color: '#fff'
            }}
          >
            Nuevo evento
          </button>
        </div>

        {loading ? (
          <p>Cargando…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {eventos.map((ev) => (
              <div
                key={ev.id}
                style={{
                  borderRadius: 16,
                  padding: 16,
                  background: 'linear-gradient(135deg, #f3f6ff 0%, #fdf5ff 100%)',
                  border: '1px solid rgba(124, 140, 255, 0.25)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ flex: '1 1 220px' }}>
                  <strong style={{ fontSize: '1.05rem' }}>{ev.titulo}</strong>
                  <div style={{ fontSize: '0.88rem', color: '#5c6378', marginTop: 6 }}>
                    {ev.fecha_evento && <span>{String(ev.fecha_evento).slice(0, 10)}</span>}
                    {ev.lugar && <span> · {ev.lugar}</span>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background:
                          ev.estado === 'ACTIVO' ? '#d4edda' : ev.estado === 'CERRADO' ? '#e2e3e5' : '#fff3cd',
                        color: '#333'
                      }}
                    >
                      {ev.estado}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  {ev.token_publico && (
                    <>
                      <QRCodeSVG value={`${publicUrlBase}${ev.token_publico}`} size={112} level="M" />
                      <button
                        type="button"
                        onClick={() => copiarEnlace(ev.token_publico)}
                        style={{
                          fontSize: '0.85rem',
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        Copiar enlace público
                      </button>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" onClick={() => openEditar(ev.id)}>
                    Editar
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => eliminar(ev.id)} style={{ color: '#b00020' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {!eventos.length && <p style={{ color: '#5c6378' }}>No hay eventos aún.</p>}
          </div>
        )}

        {modalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              overflowY: 'auto'
            }}
            onClick={() => !saving && setModalOpen(false)}
          >
            <form
              onSubmit={guardar}
              style={{
                background: '#fff',
                borderRadius: 16,
                maxWidth: 560,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 20,
                boxSizing: 'border-box'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ marginTop: 0 }}>{editId ? 'Editar evento' : 'Nuevo evento'}</h2>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Título *
                <input
                  required
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                Descripción
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={form.fecha_evento}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_evento: e.target.value }))}
                    style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={form.estado}
                    onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                    style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                  >
                    <option value="BORRADOR">BORRADOR</option>
                    <option value="ACTIVO">ACTIVO (visible por QR)</option>
                    <option value="CERRADO">CERRADO</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <label>
                  Hora inicio
                  <input
                    value={form.hora_inicio}
                    onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                    placeholder="ej. 08:00"
                    style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                  />
                </label>
                <label>
                  Hora fin
                  <input
                    value={form.hora_fin}
                    onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
                    placeholder="ej. 10:00"
                    style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                  />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                Lugar
                <input
                  value={form.lugar}
                  onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                  style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', marginTop: 8 }}>
                Grupos incluidos (matrícula del año activo)
              </label>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: 'auto',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 12
                }}
              >
                {gruposDisponibles.map((g) => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.grupo_ids.includes(g.id)}
                      onChange={() => toggleGrupo(g.id)}
                    />
                    <span style={{ fontSize: '0.92rem' }}>{labelGrupo(g)}</span>
                  </label>
                ))}
                {!gruposDisponibles.length && <span style={{ color: '#888' }}>No hay grupos para el año activo.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
