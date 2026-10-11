import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import AperturaFormularioColegio from '../components/apertura/AperturaFormularioColegio';
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
    if (!String(form.nombre || '').trim()) {
      setError('Escriba el nombre del colegio.');
      return;
    }
    if (!form.inicial && !form.primaria && !form.secundaria) {
      setError('Elija al menos un nivel.');
      return;
    }
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
      <div className="apertura-instalar">
        <div className="apertura-admin">
          <header className="apertura-hero">
            <div className="apertura-hero-icon" aria-hidden>🏫</div>
            <div>
              <h1>Este servidor ya tiene un colegio</h1>
              <p>La apertura de un colegio nuevo solo corre cuando la base está vacía.</p>
            </div>
          </header>
          <div className="apertura-acciones">
            <Link to="/login">Ir al inicio de sesión</Link>
          </div>
        </div>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="apertura-instalar">
        <div className="apertura-admin">
          <header className="apertura-hero">
            <div className="apertura-hero-icon" aria-hidden>🏫</div>
            <div>
              <h1>El colegio quedó creado</h1>
              <p>Entre con el DNI {listo} del super administrador.</p>
            </div>
          </header>
          <div className="apertura-acciones">
            <button type="button" onClick={() => navigate('/login')}>Ir al inicio de sesión</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="apertura-instalar">
      <div className="apertura-admin">
        <AperturaFormularioColegio
          form={form}
          set={set}
          error={error}
          claveFalta={estado && !estado.clave_configurada}
          guardando={guardando}
          onSubmit={enviar}
          pie={<Link to="/login">Volver al inicio de sesión</Link>}
        />
      </div>
    </div>
  );
}
