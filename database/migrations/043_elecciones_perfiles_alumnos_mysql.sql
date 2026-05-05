-- Elecciones: perfiles votantes (alumno/apoderado/docente), grados explícitos opcionales,
-- alcalde y miembros vinculados a tabla alumnos, tipo en voto registrado.
--
-- Idempotente: columnas con IF NOT EXISTS; índices con CREATE INDEX IF NOT EXISTS
-- (MySQL 8.0.13+, MariaDB 10.5.2+). Si su servidor es más antiguo y da #1061 al índice,
-- el índice ya existe: puede omitir esa línea o borrarlo con:
--   DROP INDEX idx_elecc_alc_alu ON elecciones_lista;
-- (solo si va a recrearlo igual).
--
-- No incluye FOREIGN KEY hacia alumnos: ver 044_elecciones_fk_alumnos_opcional.sql y comentarios allí.

ALTER TABLE elecciones_proceso
  ADD COLUMN IF NOT EXISTS perfiles_voto JSON NULL COMMENT 'Ej. ["ALUMNO","APODERADO","DOCENTE"]; NULL tratado como ["ALUMNO"]' AFTER grupo_ids,
  ADD COLUMN IF NOT EXISTS grados_voto JSON NULL COMMENT 'Ej. [3,4,5]; NULL = sólo usar grado_min/grado_max' AFTER perfiles_voto;

UPDATE elecciones_proceso SET perfiles_voto = '["ALUMNO"]' WHERE perfiles_voto IS NULL;

ALTER TABLE elecciones_lista
  ADD COLUMN IF NOT EXISTS alcalde_alumno_id INT(11) NULL COMMENT 'Referencia alumno alcaldesa/o' AFTER logo_path;

CREATE INDEX IF NOT EXISTS idx_elecc_alc_alu ON elecciones_lista (alcalde_alumno_id);

ALTER TABLE elecciones_miembro
  ADD COLUMN IF NOT EXISTS alumno_id INT(11) NULL AFTER cargo_id;

CREATE INDEX IF NOT EXISTS idx_elecc_miemb_alu ON elecciones_miembro (alumno_id);

ALTER TABLE elecciones_voto
  ADD COLUMN IF NOT EXISTS votante_tipo VARCHAR(32) NULL AFTER usuario_id;
