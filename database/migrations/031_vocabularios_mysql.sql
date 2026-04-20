-- Vocabularios: PDFs por nivel y grado (año lectivo), visibles para alumnos del mismo nivel+grado.
-- Docentes solo publican para grados donde tienen asignatura o tutoría.
--
-- NOTA: No se declaran FOREIGN KEY hacia colegios / niveles / personal porque en muchas
-- instalaciones legacy esas tablas siguen en MyISAM; InnoDB no puede referenciarlas (errno 150).
-- La integridad la asegura la API (colegio del JWT, validación de nivel y grupo).

CREATE TABLE IF NOT EXISTS `vocabularios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `colegio_id` int(11) NOT NULL,
  `anio` int(11) NOT NULL COMMENT 'Año lectivo (grupos.anio)',
  `nivel_id` int(11) NOT NULL,
  `grado` int(11) NOT NULL COMMENT 'Número de grado (grupos.grado)',
  `titulo` varchar(255) NOT NULL DEFAULT '',
  `descripcion` varchar(1000) DEFAULT NULL,
  `nombre_archivo_original` varchar(500) NOT NULL DEFAULT '',
  `ruta_almacenamiento` varchar(500) NOT NULL DEFAULT '' COMMENT 'Relativo a uploads/, ej. vocabularios/xxx.pdf',
  `personal_id` int(11) DEFAULT NULL COMMENT 'Docente que subió; NULL si no aplica',
  `usuario_creador_id` int(11) NOT NULL COMMENT 'usuarios.id',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vocab_colegio_anio` (`colegio_id`, `anio`),
  KEY `idx_vocab_nivel_grado` (`nivel_id`, `grado`),
  KEY `idx_vocab_personal` (`personal_id`),
  KEY `idx_vocab_usuario_creador` (`usuario_creador_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='PDF de vocabulario por nivel/grado; visible a alumnos matriculados en ese nivel+grado';
