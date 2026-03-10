-- Tabla nomina_registros
-- Registro interno de notas por cuadradito en la nómina del docente
-- Cada registro: asignatura + docente + bimestre, con JSON de notas por matrícula
-- notas_json: { "matricula_id": ["05","12","","20",...], ... } (25 valores por alumno)

CREATE TABLE IF NOT EXISTS `nomina_registros` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asignatura_id` int(11) NOT NULL,
  `personal_id` int(11) NOT NULL,
  `bimestre` tinyint(1) NOT NULL COMMENT '1, 2, 3 o 4',
  `notas_json` JSON DEFAULT NULL COMMENT '{"matricula_id":[val1,...,val25],...}',
  `colegio_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asignatura_personal_bimestre` (`asignatura_id`, `personal_id`, `bimestre`),
  KEY `idx_nomina_asignatura` (`asignatura_id`),
  KEY `idx_nomina_personal` (`personal_id`),
  KEY `idx_nomina_bimestre` (`bimestre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
