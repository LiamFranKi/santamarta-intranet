-- Elecciones: estado de resultados publicos y publicacion post-cierre.
-- Hora oficial: los DATETIME siguen siendo pared de America/Lima.

ALTER TABLE elecciones_proceso
  MODIFY COLUMN estado ENUM('BORRADOR','CAMPAÑA','VOTACION','RESULTADOS','CERRADA','ARCHIVO') NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS publicar_resultados TINYINT(1) NOT NULL DEFAULT 1 AFTER votacion_fin,
  ADD COLUMN IF NOT EXISTS resultados_publicados_at DATETIME NULL AFTER publicar_resultados;

