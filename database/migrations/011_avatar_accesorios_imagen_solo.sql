-- Añadir imagen del accesorio solo (ej. casco) para tienda/listado.
-- imagen_combinada = personaje + accesorio (cuando el alumno lo equipa).
ALTER TABLE `avatar_accesorios`
  ADD COLUMN `imagen_accesorio` varchar(255) NOT NULL DEFAULT '' COMMENT 'PNG solo del accesorio (tienda/listado)' AFTER `puntuacion_requerida`;
