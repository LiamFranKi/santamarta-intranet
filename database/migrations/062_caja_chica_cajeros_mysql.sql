-- Cajeros autorizados para Caja Chica (cuentas con Visibilidad «Pública (cajero)»).
-- Administración: Configuración → pestaña Cajero (espejo Tutoría General).

CREATE TABLE IF NOT EXISTS caja_chica_cajeros (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  personal_id INT UNSIGNED NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_caja_chica_cajeros_colegio_personal (colegio_id, personal_id),
  KEY idx_caja_chica_cajeros_colegio_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Personal autorizado como cajero de Caja Chica (cuentas públicas)';
