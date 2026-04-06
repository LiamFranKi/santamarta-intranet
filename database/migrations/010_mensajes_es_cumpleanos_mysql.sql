-- MySQL/MariaDB: ejecutar UNA VEZ en la base del intranet (phpMyAdmin o cliente mysql en el VPS).
-- Añade marca para mensajes enviados desde el widget de cumpleaños (tema visual en destinatario).

ALTER TABLE `mensajes`
  ADD COLUMN `es_cumpleanos` ENUM('NO','SI') NOT NULL DEFAULT 'NO'
  AFTER `favorito`;
