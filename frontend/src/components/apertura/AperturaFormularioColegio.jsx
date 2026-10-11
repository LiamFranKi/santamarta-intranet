import React, { useState } from 'react';

const PASOS = [
  { id: 'colegio', n: '1', label: 'Colegio' },
  { id: 'niveles', n: '2', label: 'Niveles' },
  { id: 'recaudo', n: '3', label: 'Recaudo' },
  { id: 'usuarios', n: '4', label: 'Usuarios' },
];

const MESES_INICIO_PENSION = [
  { value: 0, label: 'Enero' },
  { value: 1, label: 'Febrero' },
  { value: 2, label: 'Marzo' },
  { value: 3, label: 'Abril' },
  { value: 4, label: 'Mayo' },
  { value: 5, label: 'Junio' },
  { value: 6, label: 'Julio' },
  { value: 7, label: 'Agosto' },
  { value: 8, label: 'Septiembre' },
  { value: 9, label: 'Octubre' },
  { value: 10, label: 'Noviembre' },
  { value: 11, label: 'Diciembre' },
];

function Campo({ label, children, ancho }) {
  return (
    <label className={ancho ? 'apertura-ancho' : undefined}>
      {label}
      {children}
    </label>
  );
}

export default function AperturaFormularioColegio({
  form,
  set,
  error,
  claveFalta,
  guardando,
  onSubmit,
  vistaPrevia,
  pie,
}) {
  const [paso, setPaso] = useState('colegio');

  return (
    <form className="apertura-instalar-form" onSubmit={onSubmit}>
      <header className="apertura-hero">
        <div className="apertura-hero-icon" aria-hidden>🏫</div>
        <div>
          <h1>Apertura del colegio</h1>
          <p>
            Crea el colegio, los niveles, una sede y el turno de la mañana, más quien instala y el administrador.
            El padrón de alumnos se carga después, ya dentro del sistema.
          </p>
          <div className="apertura-hero-meta">
            <span>Base vacía</span>
            <span>No borra un colegio existente</span>
            {vistaPrevia ? <span>Vista previa</span> : null}
          </div>
        </div>
      </header>

      {vistaPrevia && (
        <p className="apertura-preview-nota">
          Así se ve el formulario cuando se crea un colegio nuevo. Desde aquí no se guarda nada.
        </p>
      )}
      {claveFalta && (
        <p className="apertura-error">En el servidor falta la clave de instalación, de 8 caracteres o más. Sin esa clave no se puede aperturar.</p>
      )}
      {error && <p className="apertura-error">{error}</p>}

      <nav className="apertura-tabs" role="tablist" aria-label="Pasos para crear el colegio">
        {PASOS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={paso === p.id}
            className={paso === p.id ? 'apertura-tab is-on' : 'apertura-tab'}
            onClick={() => setPaso(p.id)}
          >
            <span>{p.n}</span> {p.label}
          </button>
        ))}
      </nav>

      {paso === 'colegio' && (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Datos del colegio</h2>
            <p>La clave de instalación la pide el servidor. El título es el nombre que verán al entrar.</p>
          </div>
          <div className="apertura-grid">
            <Campo label="Clave de instalación" ancho>
              <input type="password" value={form.clave} onChange={set('clave')} autoComplete="off" />
            </Campo>
            <Campo label="Nombre">
              <input value={form.nombre} onChange={set('nombre')} />
            </Campo>
            <Campo label="Título en la intranet">
              <input value={form.titulo_intranet} onChange={set('titulo_intranet')} />
            </Campo>
            <Campo label="RUC">
              <input value={form.ruc} onChange={set('ruc')} />
            </Campo>
            <Campo label="Razón social">
              <input value={form.razon_social} onChange={set('razon_social')} />
            </Campo>
            <Campo label="Dirección" ancho>
              <input value={form.direccion} onChange={set('direccion')} />
            </Campo>
            <Campo label="Teléfono">
              <input value={form.telefono} onChange={set('telefono')} />
            </Campo>
            <Campo label="Correo">
              <input type="email" value={form.correo} onChange={set('correo')} />
            </Campo>
            <Campo label="Código modular">
              <input value={form.codigo_modular} onChange={set('codigo_modular')} />
            </Campo>
            <Campo label="UGEL">
              <input value={form.ugel_nombre} onChange={set('ugel_nombre')} />
            </Campo>
            <Campo label="Resolución de creación">
              <input value={form.resolucion_creacion} onChange={set('resolucion_creacion')} />
            </Campo>
            <Campo label="Año activo">
              <input type="number" value={form.anio_activo} onChange={set('anio_activo')} />
            </Campo>
            <Campo label="Año de matrículas">
              <input type="number" value={form.anio_matriculas} onChange={set('anio_matriculas')} />
            </Campo>
            <Campo label="Mes en que empiezan las pensiones" ancho>
              <select value={String(form.inicio_pensiones)} onChange={set('inicio_pensiones')}>
                {MESES_INICIO_PENSION.map((mes) => (
                  <option key={mes.value} value={mes.value}>{mes.label}</option>
                ))}
              </select>
              <span className="apertura-ayuda">
                La matrícula es el pago 0 y no se elige aquí. El mes que marque es la pensión 1.
                Si marca marzo y hay 10 pensiones, marzo es 1 y diciembre es 10.
              </span>
            </Campo>
            <Campo label="Cantidad de pensiones">
              <input type="number" min="1" max="12" value={form.total_pensiones} onChange={set('total_pensiones')} />
            </Campo>
            <Campo label="Días de tolerancia">
              <input type="number" min="0" value={form.dias_tolerancia} onChange={set('dias_tolerancia')} />
            </Campo>
          </div>
        </section>
      )}

      {paso === 'niveles' && (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Niveles que tendrá el colegio</h2>
            <p>Inicial nace en letras. En Primaria y Secundaria se elige número o letras. Letras abre el CNEB.</p>
          </div>
          <div className="apertura-niveles">
            <label className={form.inicial ? 'apertura-nivel is-on' : 'apertura-nivel'}>
              <input type="checkbox" checked={form.inicial} onChange={set('inicial')} />
              <strong>Inicial</strong>
              <span>Calificación en letras</span>
            </label>
            <label className={form.primaria ? 'apertura-nivel is-on' : 'apertura-nivel'}>
              <input type="checkbox" checked={form.primaria} onChange={set('primaria')} />
              <strong>Primaria</strong>
              <select value={form.tipo_primaria} onChange={set('tipo_primaria')} disabled={!form.primaria}>
                <option value="1">Número</option>
                <option value="0">Letras</option>
              </select>
            </label>
            <label className={form.secundaria ? 'apertura-nivel is-on' : 'apertura-nivel'}>
              <input type="checkbox" checked={form.secundaria} onChange={set('secundaria')} />
              <strong>Secundaria</strong>
              <select value={form.tipo_secundaria} onChange={set('tipo_secundaria')} disabled={!form.secundaria}>
                <option value="1">Número</option>
                <option value="0">Letras</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {paso === 'recaudo' && (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Recaudo BCP</h2>
            <p>Puede quedar vacío y completarse cuando vayan a generar el archivo del banco.</p>
          </div>
          <div className="apertura-grid">
            <Campo label="N.° de sucursal">
              <input value={form.recaudo_nro_sucursal} onChange={set('recaudo_nro_sucursal')} />
            </Campo>
            <Campo label="N.° de cuenta">
              <input value={form.recaudo_nro_cuenta} onChange={set('recaudo_nro_cuenta')} />
            </Campo>
            <Campo label="Razón social del recaudo" ancho>
              <input value={form.recaudo_razon_social} onChange={set('recaudo_razon_social')} />
            </Campo>
          </div>
        </section>
      )}

      {paso === 'usuarios' && (
        <section className="apertura-panel" role="tabpanel">
          <div className="apertura-panel-head">
            <h2>Quienes entran el primer día</h2>
            <p>Quien instala es el super administrador y es el único que carga el padrón. El administrador es el del colegio. Deben tener DNI distintos.</p>
          </div>
          <div className="apertura-usuarios">
            <div className="apertura-usuario">
              <h3>Quien instala</h3>
              <div className="apertura-grid apertura-grid-una">
                <Campo label="DNI"><input value={form.super_dni} onChange={set('super_dni')} /></Campo>
                <Campo label="Nombres"><input value={form.super_nombres} onChange={set('super_nombres')} /></Campo>
                <Campo label="Apellidos"><input value={form.super_apellidos} onChange={set('super_apellidos')} /></Campo>
                <Campo label="Correo"><input type="email" value={form.super_email} onChange={set('super_email')} /></Campo>
                <Campo label="Clave" ancho><input type="password" value={form.super_password} onChange={set('super_password')} autoComplete="new-password" /></Campo>
              </div>
            </div>
            <div className="apertura-usuario">
              <h3>Administrador del colegio</h3>
              <div className="apertura-grid apertura-grid-una">
                <Campo label="DNI"><input value={form.admin_dni} onChange={set('admin_dni')} /></Campo>
                <Campo label="Nombres"><input value={form.admin_nombres} onChange={set('admin_nombres')} /></Campo>
                <Campo label="Apellidos"><input value={form.admin_apellidos} onChange={set('admin_apellidos')} /></Campo>
                <Campo label="Correo"><input type="email" value={form.admin_email} onChange={set('admin_email')} /></Campo>
                <Campo label="Clave" ancho><input type="password" value={form.admin_password} onChange={set('admin_password')} autoComplete="new-password" /></Campo>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="apertura-acciones">
        {paso !== 'colegio' && (
          <button type="button" className="sec" onClick={() => setPaso(PASOS[PASOS.findIndex((p) => p.id === paso) - 1].id)}>
            Anterior
          </button>
        )}
        {paso !== 'usuarios' && (
          <button type="button" onClick={() => setPaso(PASOS[PASOS.findIndex((p) => p.id === paso) + 1].id)}>
            Siguiente
          </button>
        )}
        {paso === 'usuarios' && !vistaPrevia && (
          <button type="submit" disabled={guardando}>{guardando ? 'Creando…' : 'Aperturar'}</button>
        )}
        {pie}
      </div>
    </form>
  );
}
