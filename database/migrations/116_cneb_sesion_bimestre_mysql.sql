-- La sesión pertenece a un bimestre. No se copia en los otros tres.
-- Las que ya existían se ven en los cuatro porque no tenían bimestre: quedan en el 4.º,
-- que es donde se estaban creando.

SET @db := DATABASE();
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'bimestre'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `bimestre` TINYINT UNSIGNED NULL AFTER `corte`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `cneb_sesiones` SET `bimestre` = 4 WHERE `bimestre` IS NULL;
