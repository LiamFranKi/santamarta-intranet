-- Tabla asignaturas_sesion_pdf
-- PDFs de sesión vinculados a temas del aula virtual (solo DOCENTE y ADMIN)
-- Cada registro: tema (asignaturas_archivos), archivo PDF, descripción opcional
-- Nombre automático: "SESION - {nombre del tema}"

CREATE TABLE IF NOT EXISTS `asignaturas_sesion_pdf` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asignatura_id` int(11) NOT NULL,
  `tema_id` int(11) NOT NULL COMMENT 'FK a asignaturas_archivos (tema interactivo)',
  `titulo` varchar(500) NOT NULL COMMENT 'SESION - {nombre del tema}',
  `descripcion` text DEFAULT NULL,
  `archivo` varchar(300) NOT NULL COMMENT 'Nombre del archivo PDF',
  `ciclo` int(11) NOT NULL,
  `trabajador_id` int(11) NOT NULL,
  `fecha_hora` datetime NOT NULL,
  `colegio_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asignatura_ciclo` (`asignatura_id`, `ciclo`),
  KEY `idx_tema_id` (`tema_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
