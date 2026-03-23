-- Deep linking para notificaciones (campanita + push PWA)
-- Ejecutar en phpMyAdmin sobre la base de datos del colegio / intranet.
-- Si una columna ya existe, omitir esa línea o comentarla.

ALTER TABLE `notificaciones`
  ADD COLUMN `accion_tipo` VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Tipo lógico: aula_virtual, examen_activado, mensajes, publicacion, asistencia, etc.' AFTER `contenido`,
  ADD COLUMN `accion_payload` TEXT NULL DEFAULT NULL
    COMMENT 'JSON: asignatura_id, grupo_id, recurso_tipo, recurso_id, alumno_id, etc.' AFTER `accion_tipo`,
  ADD COLUMN `url_destino` VARCHAR(512) NULL DEFAULT NULL
    COMMENT 'Ruta relativa SPA, ej /alumno/aula-virtual/12?abrir=tarea&id=5' AFTER `accion_payload`;
