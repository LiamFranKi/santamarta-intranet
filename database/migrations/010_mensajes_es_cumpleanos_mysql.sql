-- MySQL/MariaDB (OPCIONAL): el intranet marca cumpleaños con <!-- intranet-cumpleanos --> en el HTML del mensaje.
-- Si ya ejecutaste este ALTER, puedes dejar la columna; el backend no la requiere para enviar mensajes.

ALTER TABLE `mensajes`
  ADD COLUMN `es_cumpleanos` ENUM('NO','SI') NOT NULL DEFAULT 'NO'
  AFTER `favorito`;
