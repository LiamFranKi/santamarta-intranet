-- Migración: Texto libre en celdas del generador de horarios
-- Ejecutar en phpMyAdmin sobre vanguard_intranet (si la tabla ya existía).

ALTER TABLE `horario_gen_entradas`
  ADD COLUMN IF NOT EXISTS `texto_libre` VARCHAR(120) NULL
    COMMENT 'Etiqueta manual (Tutoría, etc). NO es curso/libreta.'
    AFTER `carga_id`;

-- Si tu MySQL no soporta IF NOT EXISTS en ADD COLUMN, usa:
-- ALTER TABLE `horario_gen_entradas`
--   ADD COLUMN `texto_libre` VARCHAR(120) NULL
--     COMMENT 'Etiqueta manual (Tutoría, etc). NO es curso/libreta.'
--     AFTER `carga_id`;
