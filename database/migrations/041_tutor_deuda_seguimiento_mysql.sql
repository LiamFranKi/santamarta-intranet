-- Seguimiento de deuda por tutor (observaciones por matrícula y concepto; historial persistente).
-- Ejecutar en MySQL/MariaDB del colegio.

CREATE TABLE IF NOT EXISTS tutor_deuda_seguimiento (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  grupo_id INT UNSIGNED NOT NULL,
  matricula_id INT UNSIGNED NOT NULL,
  tipo_concepto TINYINT UNSIGNED NOT NULL COMMENT '0=matrícula, 1=pensión',
  nro_concepto SMALLINT UNSIGNED NOT NULL COMMENT '0 si matrícula; 1..N nro pensión',
  observaciones TEXT NULL,
  usuario_id INT UNSIGNED NOT NULL COMMENT 'Usuario que guardó (docente)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tutor_deuda_mat_concepto (matricula_id, tipo_concepto, nro_concepto),
  KEY idx_colegio_grupo (colegio_id, grupo_id),
  KEY idx_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
