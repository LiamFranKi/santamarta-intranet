-- Foto de la categoría del kiosco. El producto ya tiene imagen_url.
ALTER TABLE kiosco_categorias
  ADD COLUMN imagen_url VARCHAR(500) NOT NULL DEFAULT '' AFTER emoji;
