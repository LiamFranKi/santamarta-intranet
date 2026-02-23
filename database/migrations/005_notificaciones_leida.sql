-- ============================================================
-- Añadir columna leida a notificaciones (para marcar como leído)
-- Si la columna ya existe, ignorar el error.
-- ============================================================

ALTER TABLE `notificaciones` 
ADD COLUMN `leida` TINYINT(1) DEFAULT 0 
COMMENT '1=leída por el destinatario, 0=no leída';
