import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

function gradosParaNivel(nivelNombre) {
  const n = String(nivelNombre || '').toUpperCase();
  if (n.includes('INICIAL')) {
    return [
      { v: 3, label: '3 años' },
      { v: 4, label: '4 años' },
      { v: 5, label: '5 años' },
    ];
  }
  if (n.includes('SECUND')) {
    return [1, 2, 3, 4, 5].map((g) => ({ v: g, label: `${g}°` }));
  }
  return [1, 2, 3, 4, 5, 6].map((g) => ({ v: g, label: `${g}°` }));
}

function nombreCompleto(p) {
  return [p?.apellido_paterno, p?.apellido_materno, p?.nombres].filter(Boolean).join(' ').trim();
}

function Campo({ label, value }) {
  const texto = String(value || '').trim();
  return (
    <div className="admin-mat-firma-campo">
      <span>{label}</span>
      <strong>{texto || '—'}</strong>
    </div>
  );
}

export default function AdminMatriculasConFirma() {
  const [anio, setAnio] = useState(() => String(new Date().getFullYear()));
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [anios, setAnios] = useState([]);
  const [niveles, setNiveles] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const nivelNombre = useMemo(
    () => niveles.find((n) => String(n.id) === String(nivelId))?.nombre || '',
    [niveles, nivelId]
  );
  const grados = useMemo(() => (nivelId ? gradosParaNivel(nivelNombre) : []), [nivelId, nivelNombre]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (anio) params.anio = anio;
        if (nivelId) params.nivel_id = nivelId;
        if (grado !== '') params.grado = grado;
        const { data } = await api.get('/admin/usuarios/inscripcion-matricula/con-firma', { params });
        if (cancel) return;
        const listaAnios = Array.isArray(data?.anios) ? data.anios : [];
        setAnios(listaAnios);
        setNiveles(Array.isArray(data?.niveles) ? data.niveles : []);
        setRows(Array.isArray(data?.data) ? data.data : []);
        if (listaAnios.length && anio && !listaAnios.includes(Number(anio))) {
          setAnio(String(listaAnios[0]));
        }
      } catch (err) {
        if (cancel) return;
        setRows([]);
        setError(err?.response?.data?.error || 'No se pudo cargar el reporte.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [anio, nivelId, grado]);

  return (
    <div className="admin-mat-page admin-mat-firma-page">
      <header className="admin-mat-hero admin-mat-hero--banner">
        <div className="admin-mat-hero-icon" aria-hidden="true">
          ✒️
        </div>
        <div className="admin-mat-hero-intro">
          <p className="admin-mat-kicker">Administración · Matrículas</p>
          <h1 className="admin-mat-title">Matrículas enviadas por el padre</h1>
          <p className="admin-mat-sub">
            Día en que se envió, datos que quedaron en la ficha y la firma digital al lado. El padre no puede
            enviar el formulario si no marca que acepta los documentos institucionales.
          </p>
        </div>
      </header>

      <div className="admin-mat-firma-filtros">
        <label>
          <span>Año</span>
          <select value={anio} onChange={(e) => setAnio(e.target.value)}>
            {(anios.length ? anios : [Number(anio)]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Nivel</span>
          <select
            value={nivelId}
            onChange={(e) => {
              setNivelId(e.target.value);
              setGrado('');
            }}
          >
            <option value="">Todos</option>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Grado</span>
          <select value={grado} onChange={(e) => setGrado(e.target.value)} disabled={!nivelId}>
            <option value="">Todos</option>
            {grados.map((g) => (
              <option key={g.v} value={g.v}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-mat-firma-conteo">
          {loading ? 'Cargando…' : `${rows.length} matrícula${rows.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <p className="admin-mat-firma-nota">
        Los datos son los de la ficha actual: si alguien los corrige después, aquí se ve la corrección. La firma
        es el último archivo guardado de ese apoderado. El día no incluye la hora.
      </p>

      {error ? <div className="admin-mat-alert admin-mat-alert--danger">{error}</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="admin-mat-firma-vacio">No hay matrículas enviadas por el padre con estos filtros.</div>
      ) : null}

      <div className="admin-mat-firma-lista">
        {rows.map((row) => (
          <article key={row.matricula_id} className="admin-mat-firma-card">
            <header className="admin-mat-firma-card__head">
              <div>
                <p className="admin-mat-firma-fecha">Enviada el {row.fecha || '—'}</p>
                <h2>{nombreCompleto(row.alumno) || 'Alumno'}</h2>
                <p>
                  {[row.nivel, row.grado, row.seccion].filter(Boolean).join(' · ')}
                  {row.anio ? ` · ${row.anio}` : ''}
                </p>
              </div>
              <span className="admin-mat-firma-estado">{row.estado}</span>
            </header>

            <div className="admin-mat-firma-card__body">
              <div className="admin-mat-firma-datos">
                <h3>Alumno</h3>
                <div className="admin-mat-firma-grid">
                  <Campo label="Documento" value={`${row.alumno?.tipo_documento || ''} ${row.alumno?.documento || ''}`.trim()} />
                  <Campo label="Nacimiento" value={row.alumno?.nacimiento} />
                  <Campo label="Sexo" value={row.alumno?.sexo} />
                  <Campo label="Seguro" value={row.alumno?.seguro} />
                  <Campo label="Correo" value={row.alumno?.email} />
                  <Campo label="Domicilio" value={row.alumno?.domicilio} />
                </div>

                <h3>Apoderado que firmó</h3>
                <div className="admin-mat-firma-grid">
                  <Campo label="Parentesco" value={row.apoderado?.parentesco} />
                  <Campo label="Documento" value={row.apoderado?.documento} />
                  <Campo label="Nombre" value={nombreCompleto(row.apoderado)} />
                  <Campo label="Nacimiento" value={row.apoderado?.nacimiento} />
                  <Campo label="Correo" value={row.apoderado?.email} />
                  <Campo label="Celular" value={row.apoderado?.celular} />
                  <Campo label="Dirección" value={row.apoderado?.direccion} />
                </div>
              </div>

              <aside className="admin-mat-firma-lado">
                <p>Firma digital</p>
                {row.apoderado?.firma_url ? (
                  <img src={row.apoderado.firma_url} alt="Firma del apoderado" />
                ) : (
                  <span className="admin-mat-firma-sin">Sin archivo de firma</span>
                )}
                {row.alumno?.foto_dni_url ? (
                  <a href={row.alumno.foto_dni_url} target="_blank" rel="noreferrer">
                    Ver foto del DNI
                  </a>
                ) : null}
              </aside>
            </div>

            {row.documentos_aceptados ? (
              <p className="admin-mat-firma-docs">
                Aceptó los documentos institucionales. Marcó todos los checks del formulario. No se guarda el
                nombre de cada documento.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
