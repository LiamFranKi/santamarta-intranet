-- Si el 047 completo falló: ejecute línea a línea. Ignore "duplicate column" o "duplicate key".

ALTER TABLE fichas_ia_trabajos ADD COLUMN grupo_id INT UNSIGNED NULL AFTER plantilla_id;
ALTER TABLE fichas_ia_trabajos ADD COLUMN nivel_id INT UNSIGNED NULL AFTER grupo_id;
ALTER TABLE fichas_ia_trabajos ADD COLUMN curso_id INT UNSIGNED NULL COMMENT 'id tabla cursos' AFTER nivel_id;
ALTER TABLE fichas_ia_trabajos ADD COLUMN grupo_etiqueta VARCHAR(160) NULL AFTER unidad;
ALTER TABLE fichas_ia_trabajos ADD KEY idx_fichas_ia_trabajos_grupo (grupo_id);
