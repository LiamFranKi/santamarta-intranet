-- Migración 052: historial de notificaciones push/campanita enviadas manualmente (admin)
-- Documentación: panel Comunicaciones → Notificaciones

CREATE TABLE IF NOT EXISTS notificaciones_envios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  remitente_id INT UNSIGNED NOT NULL,
  fecha_hora DATETIME NOT NULL,
  icono_emoji VARCHAR(16) NULL DEFAULT NULL COMMENT 'Emoji prepended al título (UTF-8)',
  titulo VARCHAR(200) NOT NULL,
  mensaje TEXT NOT NULL,
  alcance VARCHAR(20) NOT NULL COMMENT 'TODOS | GRUPOS',
  perfil_destino VARCHAR(30) NOT NULL COMMENT 'TODOS, ALUMNOS, DOCENTES, APODERADOS, TODO_PERSONAL',
  grupos_json LONGTEXT NULL,
  total_destinatarios INT UNSIGNED NOT NULL DEFAULT 0,
  total_campanita INT UNSIGNED NOT NULL DEFAULT 0,
  total_push_enviados INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_envios_colegio_fecha (colegio_id, fecha_hora),
  KEY idx_notif_envios_remitente (remitente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Envíos masivos manuales de notificaciones (campanita + push)';
