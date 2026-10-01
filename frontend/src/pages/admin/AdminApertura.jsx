import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import './AperturaColegio.css';

export default function AdminApertura() {
  const [estado, setEstado] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmo, setConfirmo] = useState(false);

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
    <div className="apertura-page">
      <h1>Apertura y padrón</h1>
      <p className="apertura-lead">
        {nombre} ya está creado. Desde aquí se descarga la plantilla y se agregan aulas, personal, alumnos,
        apoderados y matrículas. Un DNI que ya existe no se vuelve a crear y no se borra nada.
        Los logos y el resto de la configuración siguen en Configuración. Los cursos de cada aula se arman en Académico.
      </p>
      {error && <p className="apertura-error">{error}</p>}
      {aviso && <p className="apertura-ok">{aviso}</p>}

      <section className="apertura-card">
        <h2>Plantilla</h2>
        <p className="apertura-lead">Hojas: Aulas, Personal, Alumnos, Apoderados, Vínculos y Matrículas. La hoja Instrucciones trae un ejemplo.</p>
        <div className="apertura-acciones">
          <button type="button" onClick={descargar}>Descargar Excel</button>
        </div>
      </section>

      <section className="apertura-card">
        <h2>Cargar padrón</h2>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] || null);
            setRevision(null);
            setConfirmo(false);
          }}
        />
        <div className="apertura-acciones">
          <button type="button" className="sec" disabled={ocupado || !archivo} onClick={() => enviar(false)}>Revisar</button>
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
          <label className="apertura-check" style={{ marginTop: '0.8rem' }}>
            <span>Cargar estas filas en {nombre}</span>
            <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
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
          <p className="apertura-lead">
            Creados: aulas {revision.creados?.aulas || 0}, personal {revision.creados?.personal || 0},
            alumnos {revision.creados?.alumnos || 0}, apoderados {revision.creados?.apoderados || 0},
            vínculos {revision.creados?.vinculos || 0}, matrículas {revision.creados?.matriculas || 0}.
          </p>
        )}
        {revision?.omitidos?.length > 0 && (
          <ul className="apertura-lista">
            {revision.omitidos.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
