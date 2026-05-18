-- Plantillas de criterios/indicadores (niveles cuantitativos)
-- Editar plantilla NO afecta asignaturas ya asignadas; la asignación copia filas a asignaturas_criterios + asignaturas_indicadores.

CREATE TABLE IF NOT EXISTS `indicadores_plantillas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `colegio_id` int(11) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ind_plant_colegio` (`colegio_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `indicadores_plantilla_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `plantilla_id` int(11) NOT NULL,
  `descripcion` text NOT NULL,
  `abreviatura` varchar(30) NOT NULL DEFAULT '',
  `peso` float(8,2) NOT NULL DEFAULT 0,
  `ciclo` int(11) NOT NULL DEFAULT 0 COMMENT '0=TODOS, 1-4=bimestre',
  `cuadros` int(11) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ind_plant_item_plantilla` (`plantilla_id`),
  CONSTRAINT `fk_ind_plant_item_plantilla`
    FOREIGN KEY (`plantilla_id`) REFERENCES `indicadores_plantillas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
