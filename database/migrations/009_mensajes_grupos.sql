-- ============================================================
-- TABLA: mensajes_grupos
-- Descripción: Historial de mensajes enviados a grupos (Conexiones Familiares)
-- ============================================================

CREATE TABLE IF NOT EXISTS `mensajes_grupos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `remitente_id` int(11) NOT NULL COMMENT 'Usuario ID del docente',
  `grupo_id` int(11) NOT NULL COMMENT 'Grupo al que se envió',
  `asunto` varchar(300) NOT NULL,
  `mensaje` text NOT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_remitente` (`remitente_id`),
  KEY `idx_grupo` (`grupo_id`),
  KEY `idx_fecha` (`fecha_hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Historial de mensajes enviados a grupos';
