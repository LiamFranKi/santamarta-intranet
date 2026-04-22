-- Derivación: marca "vista" por psicología/admin (sale del listado pendientes).
-- Seguimiento PIAR: notas cronológicas (docente y psicología/admin).

ALTER TABLE psicologia_derivaciones
  ADD COLUMN psicologia_leida_en DATETIME NULL
    COMMENT 'Cuando el equipo marca la ficha como vista; ya no lista en pendientes'
    AFTER recepcion_psicologia_fecha;

CREATE TABLE IF NOT EXISTS psicologia_piar_seguimiento (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  piar_id BIGINT UNSIGNED NOT NULL,
  autor_tipo ENUM('DOCENTE','PSICOLOGIA') NOT NULL COMMENT 'PSICOLOGIA = admin/promotoría/secretaría/psicóloga en intranet',
  creado_por_usuario_id INT UNSIGNED NULL,
  contenido TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_psi_piag_piar (colegio_id, piar_id),
  KEY idx_psi_piag_fecha (piar_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
