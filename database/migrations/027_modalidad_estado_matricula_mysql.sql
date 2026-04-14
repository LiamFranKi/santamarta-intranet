-- Opcional: columnas para modalidad de estudio y texto de estado en matrícula.
-- Si alguna columna ya existe, omita esa línea (MySQL devolverá error duplicate column).

-- ALTER TABLE `grupos` ADD COLUMN `modalidad` VARCHAR(80) NULL DEFAULT NULL COMMENT 'Presencial, Virtual, Semipresencial' AFTER `turno_id`;
-- ALTER TABLE `matriculas` ADD COLUMN `modalidad` VARCHAR(80) NULL DEFAULT NULL COMMENT 'Override respecto al grupo' AFTER `estado`;
-- ALTER TABLE `matriculas` ADD COLUMN `estado_matricula` VARCHAR(80) NULL DEFAULT NULL COMMENT 'Regular, Retirado, etc.' AFTER `estado`;
