import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { urlLogoConRespaldo } from '../../utils/pdfReporteColegioLogo';
import {
  exportSeguimientoTemasExcel,
  exportSeguimientoTemasPdf,
  resumirPorDocente,
  resumirPorNivel,
} from '../../utils/exportSeguimientoTemas';
import './SeguimientoTemasPanel.css';

function fmtFecha(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function fmtRevision(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

function ListaSubidos({ items }) {
  if (!items?.length) return <span className="st-vacio">Ninguno</span>;
  return (
    <ul className="st-chips">
      {items.map((it) => (
        <li key={it.id || `${it.nombre}-${it.fecha}`}>
          <strong>{it.nombre}</strong>
          {it.fecha ? <time>{fmtFecha(it.fecha)}</time> : null}
        </li>
      ))}
    </ul>
  );
}

function Cantidad({ subidos, esperado, conEsperado }) {
  const n = Number(subidos) || 0;
  return (
    <span className={`st-cant ${n === 0 ? 'is-cero' : ''}`}>
      <b>{n}</b>
      {conEsperado && esperado > 0 ? <small>de {esperado}</small> : null}
    </span>
  );
}

export default function SeguimientoTemasPanel({ ciclo, anio }) {
  const [data, setData] = useState(null);
  const [logo, setLogo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState('');

  useEffect(() => {
    let vivo = true;
    urlLogoConRespaldo().then((url) => {
      if (vivo && url) setLogo(url);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!anio) return undefined;
    let vivo = true;
    (async () => {
      try {
        setCargando(true);
        setError('');
        const { data: resp } = await api.get('/admin/reportes/aula-temas/seguimiento', {
          params: { ciclo, anio },
        });
        if (vivo) setData(resp);
      } catch (e) {
        if (vivo) {
          setData(null);
          setError(e.response?.data?.error || e.message || 'No se pudo armar el seguimiento.');
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ciclo, anio]);

  const filas = data?.filas || [];
  const niveles = useMemo(() => resumirPorNivel(filas), [filas]);
  const docentes = useMemo(() => resumirPorDocente(filas), [filas]);
  const maxBarra = Math.max(1, ...niveles.flatMap((n) => [n.temas, n.fichas, n.sesiones]));
  const totales = useMemo(
    () => filas.reduce(
      (a, f) => {
        a.temas += f.temas?.subidos || 0;
        a.fichas += f.fichas?.subidos || 0;
        a.sesiones += f.sesiones?.subidos || 0;
        return a;
      },
      { temas: 0, fichas: 0, sesiones: 0 }
    ),
    [filas]
  );

  const exportar = async (tipo) => {
    if (!data) return;
    setExportando(tipo);
    try {
      if (tipo === 'excel') await exportSeguimientoTemasExcel(data);
      else await exportSeguimientoTemasPdf(data);
    } finally {
      setExportando('');
    }
  };

  let nivelAnterior = '';

  return (
    <section className="st-wrap">
      <div className="st-acciones">
        <p>
          Lista de todo el colegio en este bimestre, de Inicial a Secundaria. Cada bloque es un docente,
          en un aula y en un curso. Temas, fichas y sesiones se cuentan por separado, con el nombre que
          dejó el docente y el día en que lo subió.
        </p>
        <div>
          <button type="button" className="st-btn st-btn-excel" disabled={!data || !!exportando} onClick={() => exportar('excel')}>
            {exportando === 'excel' ? 'Armando Excel…' : 'Excel'}
          </button>
          <button type="button" className="st-btn st-btn-pdf" disabled={!data || !!exportando} onClick={() => exportar('pdf')}>
            {exportando === 'pdf' ? 'Armando PDF…' : 'PDF'}
          </button>
        </div>
      </div>

      {cargando && <div className="st-estado">Armando el seguimiento…</div>}
      {error && <div className="st-estado st-estado-error">{error}</div>}

      {!cargando && data && (
        <>
          <header className="st-portada">
            {logo ? <img src={logo} alt="" className="st-logo" /> : <div className="st-logo st-logo-vacio" />}
            <div>
              <h2>{data.colegio || 'Seguimiento de temas, fichas y sesiones'}</h2>
              <p>
                {data.ciclo}° bimestre
                <span>·</span>
                Año {data.anio}
                <span>·</span>
                Fecha de revisión: {fmtRevision(data.fecha_revision)}
              </p>
            </div>
          </header>

          <div className="st-kpis">
            <article><span>Cursos</span><strong>{filas.length}</strong></article>
            <article><span>Temas</span><strong>{totales.temas}</strong></article>
            <article><span>Fichas</span><strong>{totales.fichas}</strong></article>
            <article><span>Sesiones</span><strong>{totales.sesiones}</strong></article>
          </div>

          {niveles.length > 0 && (
            <div className="st-chart">
              <div className="st-chart-head">
                <h3>De Inicial a Secundaria</h3>
                <ul>
                  <li><i className="st-c-tema" /> Temas</li>
                  <li><i className="st-c-ficha" /> Fichas</li>
                  <li><i className="st-c-sesion" /> Sesiones</li>
                </ul>
              </div>
              {niveles.map((n) => (
                <div key={n.nivel} className="st-chart-nivel">
                  <span>{n.nivel}</span>
                  <div>
                    <b className="st-c-tema" style={{ width: `${(n.temas / maxBarra) * 100}%` }} title={`${n.temas} temas`} />
                    <b className="st-c-ficha" style={{ width: `${(n.fichas / maxBarra) * 100}%` }} title={`${n.fichas} fichas`} />
                    <b className="st-c-sesion" style={{ width: `${(n.sesiones / maxBarra) * 100}%` }} title={`${n.sesiones} sesiones`} />
                  </div>
                  <em>{n.temas} · {n.fichas} · {n.sesiones}</em>
                </div>
              ))}
            </div>
          )}

          <div className="st-tabla-scroll">
            <table className="st-tabla">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Nivel</th>
                  <th>Aula</th>
                  <th>Área</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Subidos y fecha de subida</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const cortaNivel = f.nivel !== nivelAnterior;
                  nivelAnterior = f.nivel;
                  return (
                    <React.Fragment key={f.asignatura_id}>
                      {cortaNivel && (
                        <tr className="st-corte">
                          <td colSpan={7}>{f.nivel || 'Otros'}</td>
                        </tr>
                      )}
                      <tr>
                        <td rowSpan={3} className="st-ident">{f.docente}</td>
                        <td rowSpan={3}>{f.nivel}</td>
                        <td rowSpan={3}>{f.aula}</td>
                        <td rowSpan={3} className="st-curso">{f.curso}</td>
                        <td className="st-tipo st-tipo-tema">Temas</td>
                        <td><Cantidad subidos={f.temas.subidos} esperado={data.esperado} conEsperado /></td>
                        <td><ListaSubidos items={f.temas.items} /></td>
                      </tr>
                      <tr>
                        <td className="st-tipo st-tipo-ficha">Fichas</td>
                        <td><Cantidad subidos={f.fichas.subidos} esperado={data.esperado} conEsperado /></td>
                        <td><ListaSubidos items={f.fichas.items} /></td>
                      </tr>
                      <tr className="st-cierra">
                        <td className="st-tipo st-tipo-sesion">Sesiones</td>
                        <td><Cantidad subidos={f.sesiones.subidos} /></td>
                        <td><ListaSubidos items={f.sesiones.items} /></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filas.length === 0 && <div className="st-estado">No hay cursos asignados en este año.</div>}

          {docentes.length > 0 && (
            <div className="st-resumen">
              <h3>Resumen por docente</h3>
              <table>
                <thead>
                  <tr>
                    <th>Docente</th>
                    <th>Cursos</th>
                    <th>Temas</th>
                    <th>Fichas</th>
                    <th>Sesiones</th>
                  </tr>
                </thead>
                <tbody>
                  {docentes.map((d) => (
                    <tr key={d.docente}>
                      <td>{d.docente}</td>
                      <td>{d.cursos}</td>
                      <td className={d.temas === 0 ? 'is-cero' : ''}>{d.temas}</td>
                      <td className={d.fichas === 0 ? 'is-cero' : ''}>{d.fichas}</td>
                      <td className={d.sesiones === 0 ? 'is-cero' : ''}>{d.sesiones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
