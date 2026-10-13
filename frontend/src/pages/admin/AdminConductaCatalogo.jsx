import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminConductaCatalogo.css';

const GRUPOS = [
  { id: 'leve', label: 'Faltas leves', tono: 'sky' },
  { id: 'grave', label: 'Faltas graves', tono: 'amber' },
  { id: 'muy_grave', label: 'Faltas muy graves', tono: 'rose' },
  { id: 'presentacion', label: 'Presentación', tono: 'teal' },
  { id: 'puntualidad', label: 'Puntualidad', tono: 'violet' },
];

const VACIO = {
  grupo: 'leve',
  codigo: '',
  nombre: '',
  descuento: '0.25',
  es_olvido_qr: false,
  es_ingreso_vestimenta: false,
  es_ingreso_tardanza: false,
};

export default function AdminConductaCatalogo() {
  const [grupos, setGrupos] = useState([]);
  const [ajustes, setAjustes] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await api.get('/admin/conducta/catalogo');
    setGrupos(data.grupos || []);
    setAjustes(data.ajustes || null);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargar();
      } catch (e) {
        if (vivo) {
          Swal.fire({ icon: 'error', title: 'No se pudo abrir conducta', text: e.response?.data?.error || e.message });
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [cargar]);

  const guardarAjustes = async () => {
    try {
      setGuardandoAjuste(true);
      const { data } = await api.put('/admin/conducta/ajustes', ajustes);
      setAjustes(data.ajustes || ajustes);
      Swal.fire({
        icon: 'success',
        title: 'Ajustes guardados',
        text: 'La nota de los bimestres 1, 2 y 3 no se tocó. Desde el bimestre 4 se usa esta regla.',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se guardó', text: e.response?.data?.error || e.message });
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const abrirNuevo = (grupo) => {
    setEditId(null);
    setForm({ ...VACIO, grupo });
    setAbierto(true);
  };

  const abrirEditar = (item) => {
    setEditId(item.id);
    setForm({
      grupo: item.grupo,
      codigo: item.codigo,
      nombre: item.nombre,
      descuento: String(item.descuento),
      es_olvido_qr: item.es_olvido_qr,
      es_ingreso_vestimenta: item.es_ingreso_vestimenta,
      es_ingreso_tardanza: item.es_ingreso_tardanza,
      activo: item.activo,
    });
    setAbierto(true);
  };

  const guardarItem = async () => {
    try {
      const body = {
        ...form,
        descuento: parseFloat(form.descuento),
        activo: form.activo !== false,
      };
      if (editId) await api.put(`/admin/conducta/items/${editId}`, body);
      else await api.post('/admin/conducta/items', body);
      setAbierto(false);
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se guardó el ítem', text: e.response?.data?.error || e.message });
    }
  };

  const quitar = async (item) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: `Quitar ${item.codigo}`,
      text: 'Si ya se usó, se archiva y deja de aparecer en la lista. Los registros ya hechos se quedan.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/conducta/items/${item.id}`);
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo quitar', text: e.response?.data?.error || e.message });
    }
  };

  if (cargando || !ajustes) {
    return <div className="cond-cat-loading">Cargando conducta…</div>;
  }

  return (
    <div className="cond-cat">
      <section className="cond-cat-hero">
        <div>
          <p className="cond-cat-kicker">Desde el bimestre 4 de 2026</p>
          <h3>Cada falta resta directo a la nota</h3>
          <p>
            La conducta parte de {ajustes.nota_inicial} y cada ítem resta su puntaje.
            El bimestre se parte en dos bloques de cuatro semanas y la nota final es el promedio de esos dos.
            Los bimestres 1, 2 y 3 quedan como están.
          </p>
        </div>
      </section>

      <section className="cond-cat-ajustes">
        <label>
          Nota de partida
          <input
            type="number"
            min="0"
            max="20"
            step="0.01"
            value={ajustes.nota_inicial}
            onChange={(e) => setAjustes({ ...ajustes, nota_inicial: e.target.value })}
          />
        </label>
        <label>
          Nota mínima
          <input
            type="number"
            min="0"
            max="20"
            step="0.01"
            value={ajustes.nota_minima}
            onChange={(e) => setAjustes({ ...ajustes, nota_minima: e.target.value })}
          />
        </label>
        <label>
          Avisar al llegar a
          <input
            type="number"
            min="0"
            max="20"
            step="0.01"
            value={ajustes.aviso_umbral}
            onChange={(e) => setAjustes({ ...ajustes, aviso_umbral: e.target.value })}
          />
        </label>
        <label className="cond-cat-check cond-cat-ajustes-texto">
          <input
            type="checkbox"
            checked={!!ajustes.redondear_promedio}
            onChange={(e) => setAjustes({ ...ajustes, redondear_promedio: e.target.checked })}
          />
          Redondear el promedio del bimestre (.5 hacia arriba, queda en número entero). Los dos bloques siguen con decimales.
        </label>
        <label className="cond-cat-ajustes-texto">
          Texto del aviso al padre
          <textarea
            rows={3}
            value={ajustes.aviso_texto}
            onChange={(e) => setAjustes({ ...ajustes, aviso_texto: e.target.value })}
          />
          <small>Puedes usar {'{nota}'} para la nota del momento.</small>
        </label>
        <button type="button" className="cond-cat-btn" onClick={guardarAjustes} disabled={guardandoAjuste}>
          {guardandoAjuste ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </section>

      {grupos.map((g) => {
        const meta = GRUPOS.find((x) => x.id === g.id) || { tono: 'sky', label: g.label };
        return (
          <section key={g.id} className={`cond-cat-grupo cond-cat-grupo--${meta.tono}`}>
            <header>
              <h4>{meta.label}</h4>
              <button type="button" onClick={() => abrirNuevo(g.id)}>Agregar ítem</button>
            </header>
            <div className="cond-cat-tabla">
              {(g.items || []).map((item) => (
                <article key={item.id} className={item.activo ? '' : 'is-off'}>
                  <div className="cond-cat-codigo">{item.codigo}</div>
                  <div className="cond-cat-nombre">
                    {item.nombre}
                    <div className="cond-cat-chips">
                      {item.es_olvido_qr ? <span>Botón Olvidar QR</span> : null}
                      {item.es_ingreso_vestimenta ? <span>Botón Vestimenta</span> : null}
                      {item.es_ingreso_tardanza ? <span>Tardanza de ingreso</span> : null}
                      {!item.activo ? <span>Archivado</span> : null}
                    </div>
                  </div>
                  <div className="cond-cat-pts">−{Number(item.descuento).toFixed(2)}</div>
                  <div className="cond-cat-acc">
                    <button type="button" onClick={() => abrirEditar(item)}>Editar</button>
                    <button type="button" onClick={() => quitar(item)}>Quitar</button>
                  </div>
                </article>
              ))}
              {(g.items || []).length === 0 ? <p className="cond-cat-vacio">Sin ítems en este grupo.</p> : null}
            </div>
          </section>
        );
      })}

      {abierto ? (
        <div className="cond-cat-modal" onClick={() => setAbierto(false)}>
          <form
            className="cond-cat-dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); guardarItem(); }}
          >
            <h4>{editId ? 'Editar ítem' : 'Nuevo ítem'}</h4>
            <label>
              Grupo
              <select value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })}>
                {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </label>
            <label>
              Código
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
            </label>
            <label>
              Nombre
              <textarea rows={3} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </label>
            <label>
              Descuento
              <input type="number" min="0" step="0.01" value={form.descuento} onChange={(e) => setForm({ ...form, descuento: e.target.value })} required />
            </label>
            <label className="cond-cat-check">
              <input type="checkbox" checked={!!form.es_olvido_qr} onChange={(e) => setForm({ ...form, es_olvido_qr: e.target.checked })} />
              Usar este ítem cuando marcan Olvidar QR
            </label>
            <label className="cond-cat-check">
              <input type="checkbox" checked={!!form.es_ingreso_vestimenta} onChange={(e) => setForm({ ...form, es_ingreso_vestimenta: e.target.checked })} />
              Usar este ítem cuando marcan Vestimenta al ingresar
            </label>
            <label className="cond-cat-check">
              <input type="checkbox" checked={!!form.es_ingreso_tardanza} onChange={(e) => setForm({ ...form, es_ingreso_tardanza: e.target.checked })} />
              Usar este ítem cuando el ingreso es tardanza
            </label>
            {editId ? (
              <label className="cond-cat-check">
                <input type="checkbox" checked={form.activo !== false} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                Activo en la lista del maestro
              </label>
            ) : null}
            <div className="cond-cat-dialog-acc">
              <button type="button" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="submit" className="cond-cat-btn">Guardar ítem</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
