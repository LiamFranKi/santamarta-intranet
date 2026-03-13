-- Tabla notas_detalle_explicaciones
-- Almacena la explicación del docente para el apoderado sobre el promedio del alumno por bimestre
-- nota: snapshot del promedio al momento de guardar (para histórico)
-- explicacion: texto que explica al apoderado por qué el alumno obtuvo esa nota
-- Al mostrar, siempre se usa el promedio calculado en tiempo real; la nota guardada es solo referencia

CREATE TABLE IF NOT EXISTS `notas_detalle_explicaciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asignatura_id` int(11) NOT NULL,
  `matricula_id` int(11) NOT NULL,
  `ciclo` tinyint(1) NOT NULL COMMENT '1, 2, 3 o 4 = bimestre',
  `nota` decimal(5,2) DEFAULT NULL COMMENT 'Promedio guardado al momento del save (snapshot)',
  `explicacion` text DEFAULT NULL COMMENT 'Explicación para el apoderado',
  `colegio_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asignatura_matricula_ciclo` (`asignatura_id`, `matricula_id`, `ciclo`),
  KEY `idx_nde_asignatura` (`asignatura_id`),
  KEY `idx_nde_matricula` (`matricula_id`),
  KEY `idx_nde_ciclo` (`ciclo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
