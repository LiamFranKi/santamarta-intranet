-- ============================================================
-- SISTEMA DE AVATARES POR BIMESTRE Y ACCESORIOS
-- Tablas nuevas (no modifican avatar_shop_items ni avatar_shop_sales).
-- Cada accesorio pertenece a un avatar base; imágenes son precombinadas.
-- ============================================================

-- 1) Avatar base: un personaje por bimestre y género (imagen base sin accesorios)
CREATE TABLE IF NOT EXISTS `avatar_bases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bimestre` tinyint(4) NOT NULL COMMENT '1, 2, 3 o 4',
  `sexo` tinyint(4) NOT NULL COMMENT '0=Femenino, 1=Masculino',
  `nombre` varchar(255) NOT NULL DEFAULT '',
  `descripcion` varchar(500) DEFAULT NULL,
  `historia` text DEFAULT NULL,
  `imagen_base` varchar(255) NOT NULL DEFAULT '' COMMENT 'Ruta del PNG base (sin accesorios)',
  `orden` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bimestre_sexo` (`bimestre`,`sexo`),
  KEY `idx_bimestre` (`bimestre`),
  KEY `idx_sexo` (`sexo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Avatar base por bimestre y género; cada uno tiene sus propios accesorios';

-- 2) Accesorios de cada avatar base (cada accesorio pertenece a UN avatar)
CREATE TABLE IF NOT EXISTS `avatar_accesorios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `avatar_base_id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL DEFAULT '',
  `descripcion` varchar(500) DEFAULT NULL,
  `puntuacion_requerida` int(11) NOT NULL DEFAULT 0 COMMENT 'Estrellas mínimas para desbloquear',
  `imagen_combinada` varchar(255) NOT NULL DEFAULT '' COMMENT 'PNG ya dibujado: personaje + este accesorio',
  `orden` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `fk_accesorio_base` (`avatar_base_id`),
  KEY `idx_puntuacion` (`puntuacion_requerida`),
  CONSTRAINT `fk_avatar_accesorios_base` FOREIGN KEY (`avatar_base_id`) REFERENCES `avatar_bases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Accesorios por avatar base; imagen_combinada = PNG subido (base + accesorio)';

-- 3) Qué accesorios ha desbloqueado cada alumno (por puntuación)
-- student_id = alumnos.id de tu base de datos
CREATE TABLE IF NOT EXISTS `alumno_avatar_desbloqueos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `student_id` bigint(20) NOT NULL COMMENT 'alumnos.id',
  `accesorio_id` int(11) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alumno_accesorio` (`student_id`,`accesorio_id`),
  KEY `fk_desbloqueo_accesorio` (`accesorio_id`),
  CONSTRAINT `fk_desbloqueo_accesorio` FOREIGN KEY (`accesorio_id`) REFERENCES `avatar_accesorios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Accesorios desbloqueados por alumno (según puntuación)';

-- 4) Qué accesorio tiene equipado el alumno por cada avatar base (NULL = solo imagen base)
-- student_id = alumnos.id
CREATE TABLE IF NOT EXISTS `alumno_avatar_equipado` (
  `student_id` bigint(20) NOT NULL COMMENT 'alumnos.id',
  `avatar_base_id` int(11) NOT NULL,
  `accesorio_id` int(11) DEFAULT NULL COMMENT 'NULL = mostrar imagen_base del avatar',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`student_id`,`avatar_base_id`),
  KEY `fk_equipado_base` (`avatar_base_id`),
  KEY `fk_equipado_accesorio` (`accesorio_id`),
  CONSTRAINT `fk_equipado_base` FOREIGN KEY (`avatar_base_id`) REFERENCES `avatar_bases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_equipado_accesorio` FOREIGN KEY (`accesorio_id`) REFERENCES `avatar_accesorios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Un accesorio equipado por alumno y por avatar base';
