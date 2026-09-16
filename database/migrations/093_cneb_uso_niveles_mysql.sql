-- Migración 093: un solo CNEB para Inicial, Primaria y Secundaria.
-- Uso por colegio/año/nivel (bimestre de prueba). No altera tipo_calificacion ni notas.

ALTER TABLE `cneb_desempenos`
  MODIFY `edad` TINYINT UNSIGNED NULL COMMENT 'Inicial ciclo II: 3, 4 o 5 años',
  ADD COLUMN `grado` TINYINT UNSIGNED NULL COMMENT 'Primaria 1-6 / Secundaria 1-5' AFTER `edad`;

ALTER TABLE `cneb_desempenos`
  ADD KEY `idx_cneb_des_comp_grado` (`competencia_id`, `grado`);

CREATE TABLE IF NOT EXISTS `cneb_uso_colegio` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `bimestre` TINYINT NOT NULL DEFAULT 4,
  `nivel_cneb` VARCHAR(20) NOT NULL COMMENT 'INICIAL, PRIMARIA, SECUNDARIA',
  `activo` TINYINT(1) NOT NULL DEFAULT 0,
  `actualizado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_uso_colegio_anio_nivel` (`colegio_id`, `anio`, `nivel_cneb`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
