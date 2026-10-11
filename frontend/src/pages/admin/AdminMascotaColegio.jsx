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
  const [fichas, setFichas] = useState([]);
  const [cupoAlumno, setCupoAlumno] = useState(3);
  const [cupoDocente, setCupoDocente] = useState(5);
  const [cupoPersonal, setCupoPersonal] = useState(6);

  const aplicar = useCallback((data) => {
    setNombre(data?.nombre || '');
    setNombreVisible(data?.nombre_visible || visible(data?.nombre));
    setImagenUrl(data?.imagen_url || '');
    setFichas(Array.isArray(data?.fichas) ? data.fichas : []);
    setCupoAlumno(Number.isFinite(Number(data?.preguntas_alumno)) ? Number(data.preguntas_alumno) : 3);
    setCupoDocente(Number.isFinite(Number(data?.preguntas_docente)) ? Number(data.preguntas_docente) : 5);
    setCupoPersonal(Number.isFinite(Number(data?.preguntas_personal)) ? Number(data.preguntas_personal) : 6);
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

  const guardarCupos = async () => {
    setGuardando(true);
    try {
      const { data } = await api.put('/vanguarcito/cupos', {
        preguntas_alumno: cupoAlumno,
        preguntas_docente: cupoDocente,
        preguntas_personal: cupoPersonal,
      });
      await despues(data);
      Swal.fire({ icon: 'success', title: 'Cupo guardado', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se guardó', text: e.response?.data?.error || '' });
    } finally {
      setGuardando(false);
    }
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
        <p>Así se verá en los menús, en Módulos del superadministrador, en el chat y en las fichas. Ejemplo: Ramoncito.</p>
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
        <h2>Preguntas por día</h2>
        <p>
          El administrador no tiene límite. El apoderado no entra. Al día siguiente el contador vuelve a cero.
        </p>
        <div className="mascota-cupos">
          <label>
            Alumno
            <input type="number" min="0" max="100" value={cupoAlumno} disabled={!puedeEditar || guardando} onChange={(e) => setCupoAlumno(e.target.value)} />
          </label>
          <label>
            Docente
            <input type="number" min="0" max="100" value={cupoDocente} disabled={!puedeEditar || guardando} onChange={(e) => setCupoDocente(e.target.value)} />
          </label>
          <label>
            Personal
            <input type="number" min="0" max="100" value={cupoPersonal} disabled={!puedeEditar || guardando} onChange={(e) => setCupoPersonal(e.target.value)} />
          </label>
        </div>
        <button type="button" className="mascota-cupo-btn" disabled={!puedeEditar || guardando} onClick={guardarCupos}>
          Guardar cupo
        </button>
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
