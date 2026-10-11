import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import AperturaFormularioColegio from '../../components/apertura/AperturaFormularioColegio';
import './AperturaColegio.css';

const VISTA = {
  clave: '',
  nombre: 'Colegio nuevo',
  titulo_intranet: 'Intranet',
  ruc: '',
  razon_social: '',
  direccion: '',
  telefono: '',
  correo: '',
  codigo_modular: '',
  ugel_nombre: '',
  resolucion_creacion: '',
  anio_activo: 2027,
  anio_matriculas: 2027,
  inicio_pensiones: 2,
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

function VistaColegioNuevo() {
  const [form, setForm] = useState(VISTA);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  return (
    <AperturaFormularioColegio
      vistaPrevia
      form={form}
      set={set}
      onSubmit={(e) => e.preventDefault()}
    />
  );
}

const HOJAS = [
  { nombre: 'Aulas', texto: 'Sede, nivel, grado, sección, turno y año.' },
  { nombre: 'Personal', texto: 'DNI, nombre, cargo y perfil de cada trabajador.' },
  { nombre: 'Alumnos', texto: 'Documento, apellidos, nombres y fecha de nacimiento.' },
  { nombre: 'Apoderados', texto: 'Padre, madre o apoderado, con celular y correo.' },
  { nombre: 'Vínculos', texto: 'Qué apoderado corresponde a cada alumno.' },
  { nombre: 'Matrículas', texto: 'Aula, matrícula, pensión y agenda del año.' },
];

export default function AdminApertura() {
  const [estado, setEstado] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  const [tab, setTab] = useState('plantilla');

  useEffect(() => {
    api.get('/admin/apertura/estado')
      .then(({ data }) => setEstado(data))
      .catch((e) => setError(e.response?.data?.error || 'No se pudo leer el estado.'));
  }, []);

  const descargar = async () => {
    setError('');
    try {
      const res = await api.get('/admin/apertura/plantilla', { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'apertura_padron.xlsx';
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError('No se pudo descargar la plantilla.');
    }
  };

  const enviar = async (aplicar) => {
    if (!archivo) {
      setError('Elija el Excel.');
      return;
    }
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      if (aplicar) fd.append('confirmar', 'CARGAR');
      const { data } = await api.post('/admin/apertura/padron', fd);
      setRevision(data);
      if (data.aplicado) {
        setAviso('El padrón se cargó. Lo que ya existía con el mismo DNI se dejó como estaba.');
        setConfirmo(false);
        setArchivo(null);
      }
    } catch (e) {
      const data = e.response?.data;
      if (data?.errores) setRevision(data);
      else setError(data?.error || 'No se pudo leer el Excel.');
    } finally {
      setOcupado(false);
    }
  };

  const nombre = estado?.colegio?.nombre || 'este colegio';

  return (
    <div className="apertura-admin">
      <header className="apertura-hero">
        <div className="apertura-hero-icon" aria-hidden>📋</div>
        <div>
          <h1>Apertura y padrón</h1>
          <p>
            {nombre} ya está creado. Desde aquí se agregan aulas, personal, alumnos, apoderados y matrículas.
            Un DNI que ya existe no se vuelve a crear.
          </p>
          <div className="apertura-hero-meta">
            <span>{nombre}</span>
            {estado?.colegio?.anio_activo ? <span>Año {estado.colegio.anio_activo}</span> : null}
            <span>No borra datos</span>
          </div>
        </div>
      </header>

      {error && <p className="apertura-error">{error}</p>}
      {aviso && <p className="apertura-ok">{aviso}</p>}

      <nav className="apertura-tabs" role="tablist" aria-label="Pasos de apertura">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plantilla'}
          className={tab === 'plantilla' ? 'apertura-tab is-on' : 'apertura-tab'}
          onClick={() => setTab('plantilla')}
        >
          <span>1</span> Plantilla
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cargar'}
          className={tab === 'cargar' ? 'apertura-tab is-on' : 'apertura-tab'}
          onClick={() => setTab('cargar')}
        >
          <span>2</span> Cargar padrón
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={tab === 'preview' ? 'apertura-tab is-on' : 'apertura-tab'}
          onClick={() => setTab('preview')}
        >
          <span>3</span> Colegio nuevo
        </button>
      </nav>

      {tab === 'plantilla' ? (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Hojas del Excel</h2>
            <p>La hoja Instrucciones trae un ejemplo de cada fila. Los cursos de cada aula se arman después, en Académico.</p>
          </div>
          <ul className="apertura-hojas">
            {HOJAS.map((hoja) => (
              <li key={hoja.nombre}>
                <strong>{hoja.nombre}</strong>
                <span>{hoja.texto}</span>
              </li>
            ))}
          </ul>
          <div className="apertura-acciones">
            <button type="button" onClick={descargar}>Descargar Excel</button>
            <button type="button" className="sec" onClick={() => setTab('cargar')}>Ya lo tengo, cargar</button>
          </div>
        </section>
      ) : (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Cargar en {nombre}</h2>
            <p>Primero se revisa. Solo se graba cuando marcas la confirmación. Los logos siguen en Configuración.</p>
          </div>
          <label className="apertura-drop">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] || null);
                setRevision(null);
                setConfirmo(false);
              }}
            />
            <strong>{archivo ? archivo.name : 'Elegir el archivo .xlsx'}</strong>
            <span>{archivo ? 'Listo para revisar' : 'Aulas, personal, alumnos, apoderados, vínculos y matrículas'}</span>
          </label>
          <div className="apertura-acciones">
            <button type="button" className="sec" disabled={ocupado || !archivo} onClick={() => enviar(false)}>
              {ocupado ? 'Revisando…' : 'Revisar'}
            </button>
          </div>
          {revision?.resumen && (
            <div className="apertura-resumen">
              {Object.entries(revision.resumen).map(([k, n]) => (
                <span key={k}>{k}: {n}</span>
              ))}
            </div>
          )}
          {revision?.errores?.length > 0 && (
            <ul className="apertura-lista">
              {revision.errores.map((er, i) => (
                <li key={i}>{er.hoja}{er.fila ? `, fila ${er.fila}` : ''}: {er.texto}</li>
              ))}
            </ul>
          )}
          {revision?.ok && !revision.aplicado && (
            <label className="apertura-confirm">
              <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
              <span>Cargar estas filas en {nombre}. Lo que ya existe con el mismo DNI se deja como está.</span>
            </label>
          )}
          {revision?.ok && !revision.aplicado && (
            <div className="apertura-acciones">
              <button type="button" disabled={!confirmo || ocupado} onClick={() => enviar(true)}>
                {ocupado ? 'Cargando…' : 'Cargar padrón'}
              </button>
            </div>
          )}
          {revision?.aplicado && (
            <div className="apertura-creados">
              <span>Aulas {revision.creados?.aulas || 0}</span>
              <span>Personal {revision.creados?.personal || 0}</span>
              <span>Alumnos {revision.creados?.alumnos || 0}</span>
              <span>Apoderados {revision.creados?.apoderados || 0}</span>
              <span>Vínculos {revision.creados?.vinculos || 0}</span>
              <span>Matrículas {revision.creados?.matriculas || 0}</span>
            </div>
          )}
          {revision?.omitidos?.length > 0 && (
            <ul className="apertura-lista apertura-lista-suave">
              {revision.omitidos.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </section>
      )}

      {tab === 'preview' && <VistaColegioNuevo />}
    </div>
  );
}
