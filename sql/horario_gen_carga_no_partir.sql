-- Migración: cursos que jamás se parten (siempre 2 horas juntas sin recreo en medio)
-- Ejecutar en phpMyAdmin sobre vanguard_intranet.
-- El flag se marca a mano en Carga semanal → columna «No partir».

ALTER TABLE `horario_gen_carga`
  ADD COLUMN `no_partir` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = nunca partir por recreo ni en dias distintos (marcar a mano en Carga semanal)'
    AFTER `bloques_consecutivos_max`;
