-- Migración 047: vínculo ficha ↔ grupo / curso (biblioteca por aula)
-- Nota: asignatura_id ya existe en 046 (después de plantilla_id). Solo se agregan el resto.

ALTER TABLE fichas_ia_trabajos
  ADD COLUMN grupo_id INT UNSIGNED NULL AFTER plantilla_id,
  ADD COLUMN nivel_id INT UNSIGNED NULL AFTER grupo_id,
  ADD COLUMN curso_id INT UNSIGNED NULL COMMENT 'id tabla cursos' AFTER nivel_id,
  ADD COLUMN grupo_etiqueta VARCHAR(160) NULL AFTER unidad;

-- Índice grupo (asignatura_id ya tiene idx_fichas_ia_trabajos_asignatura en 046)
ALTER TABLE fichas_ia_trabajos
  ADD KEY idx_fichas_ia_trabajos_grupo (grupo_id);
