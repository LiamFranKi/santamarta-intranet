-- Migración 055: personal autorizado para Tutoría General (supervisión lectura, todos los niveles)
-- Administración: Admin → Configuración → pestaña Tutoría

CREATE TABLE IF NOT EXISTS tutoria_general_personal (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  personal_id INT UNSIGNED NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tutoria_general_colegio_personal (colegio_id, personal_id),
  KEY idx_tutoria_general_colegio_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Coordinadoras / tutoras generales (acceso supervisión transversal)';
