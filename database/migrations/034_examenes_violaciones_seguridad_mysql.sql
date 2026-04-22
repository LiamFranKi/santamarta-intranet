ALTER TABLE asignaturas_examenes_pruebas
  ADD COLUMN violaciones_count INT(11) NOT NULL DEFAULT 0 AFTER preguntas,
  ADD COLUMN ultima_violacion_tipo VARCHAR(60) NULL AFTER violaciones_count,
  ADD COLUMN ultima_violacion_fecha DATETIME NULL AFTER ultima_violacion_tipo,
  ADD COLUMN finalizado_por_salida ENUM('NO','SI') NOT NULL DEFAULT 'NO' AFTER estado,
  ADD COLUMN motivo_cierre VARCHAR(80) NULL AFTER finalizado_por_salida,
  ADD COLUMN fecha_cierre_forzado DATETIME NULL AFTER motivo_cierre;
