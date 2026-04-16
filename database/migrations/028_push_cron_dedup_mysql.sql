-- Idempotencia para jobs de push/campanita (mismo día en Lima, mismo job + clave).
-- Evita duplicados al reiniciar PM2 varias veces al día.

CREATE TABLE IF NOT EXISTS push_cron_dedup (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type VARCHAR(64) NOT NULL,
  dedup_key VARCHAR(255) NOT NULL,
  fecha_lima DATE NOT NULL COMMENT 'Día calendario America/Lima',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_push_cron_job_dedup_fecha (job_type, dedup_key(191), fecha_lima),
  KEY idx_push_cron_fecha (fecha_lima)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
