-- Descuentos opcionales por presentación escolar (uniforme / cabello) al registrar asistencia (QR).
-- Consultas por fecha: idx_alumno_fecha, idx_colegio_fecha.

CREATE TABLE IF NOT EXISTS `presentacion_escolar_descuentos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `colegio_id` int(11) NOT NULL,
  `anio` int(11) NOT NULL,
  `alumno_usuario_id` int(11) NOT NULL COMMENT 'Usuario (alumno) al que se aplica el descuento',
  `asistencia_registro_id` int(11) DEFAULT NULL COMMENT 'Registro de asistencia asociado (entrada)',
  `motivo` enum('UNIFORME','CABELLO') NOT NULL,
  `puntos` smallint NOT NULL DEFAULT -1,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `registrado_por_usuario_id` int(11) NOT NULL COMMENT 'Quien escaneó (asistencia o tutor)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alumno_fecha` (`alumno_usuario_id`, `fecha`),
  KEY `idx_colegio_fecha` (`colegio_id`, `fecha`),
  KEY `idx_asistencia` (`asistencia_registro_id`),
  KEY `idx_registrado_por` (`registrado_por_usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Incidencias de presentación escolar al marcar asistencia';
