import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useColegio } from '../../context/ColegioContext';
import Swal from 'sweetalert2';
import './AdminMascotaColegio.css';

const NOMBRE_DEFECTO = 'Vanguarcito';

function visible(nombre) {
  return String(nombre || '').trim() || NOMBRE_DEFECTO;
}

export default function AdminMascotaColegio() {
  const { recargarColegio } = useColegio();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [nombre, setNombre] = useState('');
  const [nombreVisible, setNombreVisible] = useState(NOMBRE_DEFECTO);
  const [imagenUrl, setImagenUrl] = useState('');
  const [imagenPropia, setImagenPropia] = useState(false);
  const [fichas, setFichas] = useState([]);

  const aplicar = useCallback((data) => {
    setNombre(data?.nombre || '');
    setNombreVisible(data?.nombre_visible || visible(data?.nombre));
    setImagenUrl(data?.imagen_url || '');
    setImagenPropia(Boolean(data?.imagen_propia));
    setFichas(Array.isArray(data?.fichas) ? data.fichas : []);
    if (typeof data?.puede_editar === 'boolean') setPuedeEditar(data.puede_editar);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get('/mascota-colegio');
      aplicar(data);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir la mascota',
        text: e.response?.data?.error || e.message || '',
      });
    } finally {
      setCargando(false);
    }
  }, [aplicar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const despues = async (data) => {
    aplicar(data);
    recargarColegio?.();
  };

  const guardarNombre = async () => {
    setGuardando(true);
    try {
      const { data } = await api.put('/mascota-colegio/nombre', { nombre });
      await despues(data);
      Swal.fire({ icon: 'success', title: 'Nombre guardado', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se guardó', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  const subirPrincipal = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('imagen', file);
    setGuardando(true);
    try {
      const { data } = await api.post('/mascota-colegio/imagen', fd);
      await despues(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se subió el dibujo', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  const quitarPrincipal = async () => {
    setGuardando(true);
    try {
      const { data } = await api.delete('/mascota-colegio/imagen');
      await despues(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo quitar', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  const subirFichas = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    const fd = new FormData();
    lista.forEach((f) => fd.append('imagenes', f));
    setGuardando(true);
    try {
      const { data } = await api.post('/mascota-colegio/fichas', fd);
      await despues(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se subieron los dibujos', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  const quitarFicha = async (id) => {
    setGuardando(true);
    try {
      const { data } = await api.delete(`/mascota-colegio/fichas/${id}`);
      await despues(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo quitar', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="config-panel-card config-panel-card--spaced">
      <div className="config-panel-card-header">
        <span className="config-panel-card-ico" aria-hidden>✨</span>
        IA principal
      </div>
      <div className="config-section mascota-bloque">
      <p className="config-section-hint">
        Nombre y dibujos de este colegio. Si deja el nombre vacío, sigue {NOMBRE_DEFECTO}. Si no sube
        imagen, sigue el dibujo de ahora. Hoy se ve como {nombreVisible}. Las sesiones, las notas y las
        fichas ya impresas no cambian.
      </p>

      {cargando ? <p className="mascota-nota">Cargando…</p> : null}

      {!puedeEditar && !cargando ? (
        <p className="mascota-nota">Solo administración puede cambiar el nombre y los dibujos.</p>
      ) : null}

      <section className="mascota-parte">
        <h2>Nombre</h2>
        <p>Así se verá en el menú, en la espera de la IA y en las fichas. Ejemplo: Ramoncito.</p>
        <div className="mascota-row">
          <input
            type="text"
            maxLength={80}
            value={nombre}
            disabled={!puedeEditar || guardando}
            placeholder={NOMBRE_DEFECTO}
            onChange={(e) => setNombre(e.target.value)}
          />
          <button type="button" disabled={!puedeEditar || guardando} onClick={guardarNombre}>
            Guardar nombre
          </button>
        </div>
      </section>

      <section className="mascota-parte">
        <h2>Muñeco principal</h2>
        <p>Menú, aviso de «está creando la ficha» o «está armando la sesión», y cabecera de la teoría y de la ficha.</p>
        <div className="mascota-principal">
          {imagenUrl ? <img src={imagenUrl} alt="" /> : null}
          <div>
            {puedeEditar ? (
              <label className="mascota-file">
                Subir dibujo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={guardando}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    subirPrincipal(file);
                  }}
                />
              </label>
            ) : null}
            {puedeEditar && imagenPropia ? (
              <button type="button" className="mascota-sec" disabled={guardando} onClick={quitarPrincipal}>
                Volver al dibujo de {NOMBRE_DEFECTO}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mascota-parte">
        <h2>Dibujos de las fichas</h2>
        <p>
          Si no sube ninguno, las fichas nuevas siguen con los dibujos de ahora. Si sube los de su colegio,
          las fichas nuevas usan solo esos y el muñeco principal. No se mezclan con los del buzo.
        </p>
        {puedeEditar ? (
          <label className="mascota-file">
            Subir dibujos
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={guardando}
              onChange={(e) => {
                const files = e.target.files;
                e.target.value = '';
                subirFichas(files);
              }}
            />
          </label>
        ) : null}
        {fichas.length ? (
          <ul className="mascota-grid">
            {fichas.map((f) => (
              <li key={f.id}>
                <img src={f.url} alt="" />
                {puedeEditar ? (
                  <button type="button" disabled={guardando} onClick={() => quitarFicha(f.id)}>
                    Quitar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mascota-nota">Todavía no hay dibujos propios. Las fichas usan los de ahora.</p>
        )}
      </section>
      </div>
    </div>
  );
}
