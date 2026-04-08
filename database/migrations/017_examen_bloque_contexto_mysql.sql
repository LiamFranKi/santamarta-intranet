-- Bloque de contexto compartido (un examen = un bloque opcional): texto enriquecido + imagen opcional.
--
-- NOTA phpMyAdmin / error #150: La FK falla si `examen_id` no coincide EXACTAMENTE con `asignaturas_examenes.id`
-- (p. ej. INT vs INT UNSIGNED, o BIGINT). Por eso esta migración NO usa FOREIGN KEY: la integridad la hace la API
-- (al borrar el examen se borra el bloque en docente.routes.js).
--
-- Si una ejecución anterior falló a medias, borre la tabla vacía y vuelva a ejecutar:
--   DROP TABLE IF EXISTS asignaturas_examenes_bloques;
--
-- Opcional: tras verificar tipos con  SHOW CREATE TABLE asignaturas_examenes;
-- puede añadir FK manualmente con el mismo tipo que `id`.

CREATE TABLE IF NOT EXISTS asignaturas_examenes_bloques (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  examen_id INT UNSIGNED NOT NULL,
  contenido MEDIUMTEXT NULL COMMENT 'HTML del caso/contexto',
  imagen VARCHAR(512) NULL COMMENT 'Nombre archivo en Static/Archivos (solo imagen)',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_asignaturas_examenes_bloques_examen (examen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
