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

function ImagenArchivo({ nombre, apoderadoId, alt, vacio, cargando }) {
  const [src, setSrc] = useState('');
  const [estado, setEstado] = useState(nombre || apoderadoId ? 'cargando' : 'vacio');

  useEffect(() => {
    if (!nombre && !apoderadoId) {
      setSrc('');
      setEstado('vacio');
      return undefined;
    }
    let cancel = false;
    let blobUrl = '';
    setEstado('cargando');
    setSrc('');
    const params = nombre ? { nombre } : { apoderado_id: apoderadoId };
    api
      .get('/admin/usuarios/inscripcion-matricula/archivo', {
        params,
        responseType: 'blob',
      })
      .then((res) => {
        if (cancel) return;
        const type = String(res.data?.type || '');
        if (!res.data?.size || type.includes('json') || type.includes('html')) {
          setEstado('vacio');
          return;
        }
        blobUrl = URL.createObjectURL(res.data);
        setSrc(blobUrl);
        setEstado('ok');
      })
      .catch(() => {
        if (!cancel) setEstado('vacio');
      });
    return () => {
      cancel = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [nombre, apoderadoId]);

  if (estado === 'cargando') return <span className="admin-mat-firma-sin">{cargando}</span>;
  if (estado !== 'ok' || !src) return <span className="admin-mat-firma-sin">{vacio}</span>;
  return <img src={src} alt={alt} />;
}

export default function AdminMatriculasConFirma() {
  const [anio, setAnio] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [dni, setDni] = useState('');
  const [anios, setAnios] = useState([]);
  const [niveles, setNiveles] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState('');

  const nivelNombre = useMemo(
    () => niveles.find((n) => String(n.id) === String(nivelId))?.nombre || '',
    [niveles, nivelId]
  );
  const grados = useMemo(() => (nivelId ? gradosParaNivel(nivelNombre) : []), [nivelId, nivelNombre]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/usuarios/inscripcion-matricula/con-firma');
        if (cancel) return;
        setAnios(Array.isArray(data?.anios) ? data.anios : []);
        setNiveles(Array.isArray(data?.niveles) ? data.niveles : []);
      } catch (_) {
        /* los filtros siguen vacíos */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const buscar = async () => {
    const documento = dni.replace(/\s/g, '');
    if (!anio && !documento) {
      setBuscado(true);
      setRows([]);
      setError('Indique el año o el DNI del alumno.');
      return;
    }
    setLoading(true);
    setError('');
    setBuscado(true);
    setRows([]);
    try {
      const params = { buscar: 1 };
      if (anio) params.anio = anio;
      if (nivelId) params.nivel_id = nivelId;
      if (grado !== '') params.grado = grado;
      if (documento) params.dni = documento;
      const { data } = await api.get('/admin/usuarios/inscripcion-matricula/con-firma', { params });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.error || 'No se pudo cargar el reporte.');
    } finally {
      setLoading(false);
    }
  };

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
            Elija el año, el nivel, el grado o el DNI y pulse Buscar. Recién ahí se muestra el día, los datos y
            la firma.
          </p>
        </div>
      </header>

      <form
        className="admin-mat-firma-filtros"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <label>
          <span>Año</span>
          <select value={anio} onChange={(e) => setAnio(e.target.value)}>
            <option value="">Seleccione</option>
            {anios.map((y) => (
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
            <option value="">Seleccione</option>
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
            <option value="">Seleccione</option>
            {grados.map((g) => (
              <option key={g.v} value={g.v}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>DNI del alumno</span>
          <input
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Documento"
          />
        </label>
        <button type="submit" className="admin-mat-firma-buscar" disabled={loading}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <p className="admin-mat-firma-nota">
        Los datos son los de la ficha actual: si alguien los corrige después, aquí se ve la corrección. La firma
        es el último archivo guardado de ese apoderado. El día no incluye la hora.
      </p>

      {error ? <div className="admin-mat-alert admin-mat-alert--danger">{error}</div> : null}

      {!buscado && !loading ? (
        <div className="admin-mat-firma-vacio">
          Todavía no hay resultados. Indique el año o el DNI y pulse Buscar.
        </div>
      ) : null}

      {buscado && !loading && !error && rows.length === 0 ? (
        <div className="admin-mat-firma-vacio">No hay matrículas enviadas por el padre con esos datos.</div>
      ) : null}

      {buscado && !loading && rows.length > 0 ? (
        <p className="admin-mat-firma-conteo">
          {rows.length} matrícula{rows.length === 1 ? '' : 's'}
        </p>
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
                <ImagenArchivo
                  nombre={row.apoderado?.firma_archivo}
                  apoderadoId={row.apoderado?.firma_apoderado_id}
                  alt="Firma del apoderado"
                  vacio="Sin archivo de firma"
                  cargando="Cargando firma…"
                />
                {row.alumno?.foto_dni_archivo ? (
                  <>
                    <p>Foto del DNI</p>
                    <ImagenArchivo
                      nombre={row.alumno.foto_dni_archivo}
                      alt="Foto del DNI del alumno"
                      vacio="Sin foto del DNI"
                      cargando="Cargando DNI…"
                    />
                  </>
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
