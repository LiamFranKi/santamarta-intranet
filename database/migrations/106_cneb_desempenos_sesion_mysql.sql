-- Desempeños que propone la IA para una sesión (cuando el grado no tiene lista).
-- No se mezclan con el catálogo del grado: origen = 'sesion'.
-- Si la columna ya existe, no volver a ejecutar.

ALTER TABLE `cneb_desempenos`
  ADD COLUMN `origen` VARCHAR(12) NOT NULL DEFAULT 'catalogo',
  ADD COLUMN `sesion_id` INT UNSIGNED NULL,
  ADD KEY `idx_cneb_des_sesion` (`sesion_id`, `origen`);
