-- PDFs de referencia en contexto del examen (Herramientas / Exámenes)
-- Ejecutar UNA VEZ en vanguard_intranet.

ALTER TABLE herramientas_examenes
  ADD COLUMN bloque_archivos_json JSON NULL
  COMMENT 'Array de {nombre, url, size?} PDFs de referencia'
  AFTER bloque_imagen_url;
