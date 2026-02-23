-- ============================================================
-- Añadir columna sexo a avatar_shop_items (para filtrar por género)
-- sexo: 0 = Femenino, 1 = Masculino (según convención avatares)
-- Si la columna ya existe, ignorar el error.
-- ============================================================

ALTER TABLE `avatar_shop_items` 
ADD COLUMN `sexo` INT NULL 
COMMENT '0=Femenino, 1=Masculino. NULL=unisex';
