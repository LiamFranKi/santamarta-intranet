import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './admin/AperturaColegio.css';

const VACIO = {
  clave: '',
  nombre: '',
  titulo_intranet: '',
  ruc: '',
  razon_social: '',
  direccion: '',
  telefono: '',
  correo: '',
  codigo_modular: '',
  ugel_nombre: '',
  resolucion_creacion: '',
  anio_activo: 2026,
  anio_matriculas: 2026,
  inicio_pensiones: 3,
  total_pensiones: 10,
  dias_tolerancia: 5,
  recaudo_nro_sucursal: '',
  recaudo_nro_cuenta: '',
  recaudo_razon_social: '',
  super_dni: '',
  super_nombres: '',
  super_apellidos: '',
  super_email: '',
  super_password: '',
  admin_dni: '',
  admin_nombres: '',
  admin_apellidos: '',
  admin_email: '',
  admin_password: '',
  inicial: true,
  primaria: true,
  secundaria: true,
  tipo_primaria: '1',
  tipo_secundaria: '1',
};

export default function AperturaInstalar() {
  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/apertura/estado')
      .then(({ data }) => setEstado(data))
      .catch(() => {
        setError('No se pudo consultar la base. Recargue la página.');
        setEstado(null);
      });
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    const niveles = [];
    if (form.inicial) niveles.push({ nombre: 'INICIAL', tipo_calificacion: 0 });
    if (form.primaria) niveles.push({ nombre: 'PRIMARIA', tipo_calificacion: Number(form.tipo_primaria) });
    if (form.secundaria) niveles.push({ nombre: 'SECUNDARIA', tipo_calificacion: Number(form.tipo_secundaria) });
    setGuardando(true);
    try {
      const { data } = await api.post('/apertura/instalar', {
        clave: form.clave,
        colegio: {
          nombre: form.nombre,
          titulo_intranet: form.titulo_intranet || form.nombre,
          ruc: form.ruc,
          razon_social: form.razon_social,
          direccion: form.direccion,
          telefono: form.telefono,
          correo: form.correo,
          codigo_modular: form.codigo_modular,
          ugel_nombre: form.ugel_nombre,
          resolucion_creacion: form.resolucion_creacion,
          anio_activo: Number(form.anio_activo),
          anio_matriculas: Number(form.anio_matriculas),
          inicio_pensiones: Number(form.inicio_pensiones),
          total_pensiones: Number(form.total_pensiones),
          dias_tolerancia: Number(form.dias_tolerancia),
          recaudo_nro_sucursal: form.recaudo_nro_sucursal,
          recaudo_nro_cuenta: form.recaudo_nro_cuenta,
          recaudo_razon_social: form.recaudo_razon_social,
        },
        niveles,
        superadmin: {
          dni: form.super_dni,
          nombres: form.super_nombres,
          apellidos: form.super_apellidos,
          email: form.super_email,
          password: form.super_password,
        },
        administrador: {
          dni: form.admin_dni,
          nombres: form.admin_nombres,
          apellidos: form.admin_apellidos,
          email: form.admin_email,
          password: form.admin_password,
        },
      });
      setListo(data.usuario_superadmin || form.super_dni);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo aperturar.');
    } finally {
      setGuardando(false);
    }
  };

  if (estado && !estado.necesita_instalacion) {
    return (
      <div className="apertura-page" style={{ padding: '1.5rem' }}>
        <h1>Este servidor ya tiene un colegio</h1>
        <p className="apertura-lead">La apertura de un colegio nuevo solo corre cuando la base está vacía.</p>
        <Link to="/login">Ir al inicio de sesión</Link>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="apertura-page" style={{ padding: '1.5rem' }}>
        <div className="apertura-ok">El colegio quedó creado. Entre con el DNI {listo} del super administrador.</div>
        <button type="button" className="apertura-linkbtn" onClick={() => navigate('/login')}>Ir al inicio de sesión</button>
      </div>
    );
  }

  return (
    <form className="apertura-page" style={{ padding: '1.2rem' }} onSubmit={enviar}>
      <h1>Apertura del colegio</h1>
      <p className="apertura-lead">
        Esto crea el colegio, sus niveles, una sede y el turno de la mañana, más dos usuarios:
        quien instala (super administrador) y el administrador del colegio. El padrón de alumnos se carga después, ya dentro del sistema.
      </p>
      {estado && !estado.clave_configurada && (
        <p className="apertura-error">En el servidor falta APERTURA_CLAVE (8 caracteres o más) en el entorno del backend. Sin esa clave no se puede aperturar.</p>
      )}
      {error && <p className="apertura-error">{error}</p>}

      <section className="apertura-card">
        <h2>Clave de instalación</h2>
        <div className="apertura-grid">
          <label className="apertura-ancho">Clave
            <input type="password" value={form.clave} onChange={set('clave')} autoComplete="off" required />
          </label>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Colegio</h2>
        <div className="apertura-grid">
          <label>Nombre<input value={form.nombre} onChange={set('nombre')} required /></label>
          <label>Título en la intranet<input value={form.titulo_intranet} onChange={set('titulo_intranet')} /></label>
          <label>RUC<input value={form.ruc} onChange={set('ruc')} /></label>
          <label>Razón social<input value={form.razon_social} onChange={set('razon_social')} /></label>
          <label className="apertura-ancho">Dirección<input value={form.direccion} onChange={set('direccion')} /></label>
          <label>Teléfono<input value={form.telefono} onChange={set('telefono')} /></label>
          <label>Correo<input type="email" value={form.correo} onChange={set('correo')} /></label>
          <label>Código modular<input value={form.codigo_modular} onChange={set('codigo_modular')} /></label>
          <label>UGEL<input value={form.ugel_nombre} onChange={set('ugel_nombre')} /></label>
          <label>Resolución de creación<input value={form.resolucion_creacion} onChange={set('resolucion_creacion')} /></label>
          <label>Año activo<input type="number" value={form.anio_activo} onChange={set('anio_activo')} /></label>
          <label>Año de matrículas<input type="number" value={form.anio_matriculas} onChange={set('anio_matriculas')} /></label>
          <label>Mes en que empiezan las pensiones<input type="number" min="1" max="12" value={form.inicio_pensiones} onChange={set('inicio_pensiones')} /></label>
          <label>Cantidad de pensiones<input type="number" min="1" max="12" value={form.total_pensiones} onChange={set('total_pensiones')} /></label>
          <label>Días de tolerancia<input type="number" min="0" value={form.dias_tolerancia} onChange={set('dias_tolerancia')} /></label>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Niveles</h2>
        <div className="apertura-checks">
          <label className="apertura-check"><span>Inicial, en letras</span><input type="checkbox" checked={form.inicial} onChange={set('inicial')} /></label>
          <label className="apertura-check"><span>Primaria</span><input type="checkbox" checked={form.primaria} onChange={set('primaria')} /></label>
          <label>Calificación de primaria
            <select value={form.tipo_primaria} onChange={set('tipo_primaria')}>
              <option value="1">Número</option>
              <option value="0">Letras</option>
            </select>
          </label>
          <label className="apertura-check"><span>Secundaria</span><input type="checkbox" checked={form.secundaria} onChange={set('secundaria')} /></label>
          <label>Calificación de secundaria
            <select value={form.tipo_secundaria} onChange={set('tipo_secundaria')}>
              <option value="1">Número</option>
              <option value="0">Letras</option>
            </select>
          </label>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Recaudo BCP</h2>
        <p className="apertura-lead">Puede quedar vacío y completarse cuando vayan a generar el archivo del banco.</p>
        <div className="apertura-grid">
          <label>N.° de sucursal<input value={form.recaudo_nro_sucursal} onChange={set('recaudo_nro_sucursal')} /></label>
          <label>N.° de cuenta<input value={form.recaudo_nro_cuenta} onChange={set('recaudo_nro_cuenta')} /></label>
          <label className="apertura-ancho">Razón social del recaudo<input value={form.recaudo_razon_social} onChange={set('recaudo_razon_social')} /></label>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Quien instala</h2>
        <p className="apertura-lead">Este usuario es el super administrador. No aparece en las listas del personal y es el único que carga el padrón.</p>
        <div className="apertura-grid">
          <label>DNI<input value={form.super_dni} onChange={set('super_dni')} required /></label>
          <label>Nombres<input value={form.super_nombres} onChange={set('super_nombres')} required /></label>
          <label>Apellidos<input value={form.super_apellidos} onChange={set('super_apellidos')} required /></label>
          <label>Correo<input type="email" value={form.super_email} onChange={set('super_email')} /></label>
          <label className="apertura-ancho">Clave<input type="password" value={form.super_password} onChange={set('super_password')} required minLength={8} /></label>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Administrador del colegio</h2>
        <div className="apertura-grid">
          <label>DNI<input value={form.admin_dni} onChange={set('admin_dni')} required /></label>
          <label>Nombres<input value={form.admin_nombres} onChange={set('admin_nombres')} required /></label>
          <label>Apellidos<input value={form.admin_apellidos} onChange={set('admin_apellidos')} required /></label>
          <label>Correo<input type="email" value={form.admin_email} onChange={set('admin_email')} /></label>
          <label className="apertura-ancho">Clave<input type="password" value={form.admin_password} onChange={set('admin_password')} required minLength={8} /></label>
        </div>
      </section>

      <div className="apertura-acciones">
        <button type="submit" disabled={guardando}>{guardando ? 'Creando…' : 'Aperturar'}</button>
        <Link to="/login">Volver al inicio de sesión</Link>
      </div>
    </form>
  );
}
