-- Foto de la ficha "Carta del día" que ven al pedir.
-- Ejecutar si ya corriste las migraciones anteriores del kiosco.

ALTER TABLE kiosco_config
  ADD COLUMN carta_imagen_url VARCHAR(500) NOT NULL DEFAULT '' AFTER fiado_activo;
