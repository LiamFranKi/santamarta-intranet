import React from 'react';

const TIPO_SANGRE_OPTS = [
  { value: '0', label: 'No especificado' },
  { value: '1', label: 'A+' },
  { value: '2', label: 'A-' },
  { value: '3', label: 'B+' },
  { value: '4', label: 'B-' },
  { value: '5', label: 'AB+' },
  { value: '6', label: 'AB-' },
  { value: '7', label: 'O+' },
  { value: '8', label: 'O-' }
];

/**
 * Campos de salud del alumno (editables).
 * @param {{ values: object, onChange: (e) => void, classPrefix?: string }} props
 */
export default function AlumnoSaludFields({ values, onChange, classPrefix = 'form' }) {
  const v = values || {};
  const fieldClass = classPrefix === 'admin' ? 'admin-usu-field' : 'form-group';
  const gridClass = classPrefix === 'admin' ? 'admin-usu-form-grid' : 'form-grid';

  return (
    <div className={gridClass}>
      <div className={fieldClass}>
        <label htmlFor="tipo_sangre">Tipo de sangre</label>
        <select
          id="tipo_sangre"
          name="tipo_sangre"
          value={v.tipo_sangre != null ? String(v.tipo_sangre) : '0'}
          onChange={onChange}
        >
          {TIPO_SANGRE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={fieldClass} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="alergias">Alergias</label>
        <textarea
          id="alergias"
          name="alergias"
          rows={2}
          value={v.alergias || ''}
          onChange={onChange}
          placeholder="Medicamentos, alimentos, etc."
        />
      </div>
      <div className={fieldClass} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="vacunas">Vacunas</label>
        <textarea
          id="vacunas"
          name="vacunas"
          rows={2}
          value={v.vacunas || ''}
          onChange={onChange}
        />
      </div>
      <div className={fieldClass} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="enfermedades_sufridas">Enfermedades sufridas</label>
        <textarea
          id="enfermedades_sufridas"
          name="enfermedades_sufridas"
          rows={2}
          value={v.enfermedades_sufridas || ''}
          onChange={onChange}
        />
      </div>
      <div className={fieldClass} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="otros_controles">Otros controles</label>
        <textarea
          id="otros_controles"
          name="otros_controles"
          rows={2}
          value={v.otros_controles || ''}
          onChange={onChange}
        />
      </div>
      <div className={fieldClass} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="experiencias_traumaticas">Experiencias traumáticas / observaciones</label>
        <textarea
          id="experiencias_traumaticas"
          name="experiencias_traumaticas"
          rows={2}
          value={v.experiencias_traumaticas || ''}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

export { TIPO_SANGRE_OPTS };
