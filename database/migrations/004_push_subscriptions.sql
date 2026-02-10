-- ============================================================
-- TABLA: push_subscriptions
-- Descripción: Almacena las suscripciones de notificaciones push
-- ============================================================

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL COMMENT 'ID del usuario (apoderado, alumno, etc.)',
  `colegio_id` int(11) NOT NULL,
  `endpoint` text NOT NULL COMMENT 'URL del endpoint de push service',
  `p256dh` text NOT NULL COMMENT 'Clave pública P256DH',
  `auth` text NOT NULL COMMENT 'Clave de autenticación',
  `user_agent` text DEFAULT NULL COMMENT 'User agent del navegador',
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `activo` tinyint(1) DEFAULT 1 COMMENT '1=activo, 0=inactivo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_endpoint` (`endpoint`(255)),
  KEY `idx_usuario` (`usuario_id`),
  KEY `idx_colegio` (`colegio_id`),
  KEY `idx_activo` (`activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Suscripciones de notificaciones push';

