-- Evita reenviar la misma alerta de vencimiento (misma fase) para un documento institucional.
-- Ejecutar en MySQL junto al módulo Institucional.

CREATE TABLE IF NOT EXISTS institucional_notif_vencimiento_log (
  documento_id INT UNSIGNED NOT NULL,
  fase VARCHAR(24) NOT NULL COMMENT 'ANTES_10, ANTES_5, ANTES_1, HOY, DIA_DESPUES',
  enviado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (documento_id, fase),
  KEY idx_inst_notif_enviado (enviado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
