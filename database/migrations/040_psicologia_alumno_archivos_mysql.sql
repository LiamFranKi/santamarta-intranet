-- Evidencias / archivos adjuntos en expediente Psicología (intranet).
-- Ejecutar en MySQL después de 035_psicologia_modulo_mysql.sql.

CREATE TABLE IF NOT EXISTS psicologia_alumno_archivos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  alumno_id INT UNSIGNED NOT NULL,
  matricula_id INT UNSIGNED NULL COMMENT 'Opcional (año de referencia vigente)',
  nombre_archivo VARCHAR(500) NOT NULL COMMENT 'Título visible del documento',
  detalle TEXT NULL COMMENT 'Descripción o contexto de la evidencia',
  archivo_servidor VARCHAR(760) NOT NULL COMMENT 'Nombre en disco relativo al directorio del colegio',
  mime_type VARCHAR(255) NULL,
  tamano_bytes INT UNSIGNED NULL,
  fecha_documento DATE NULL COMMENT 'Fecha del hecho o documento referido',
  subido_por_usuario_id INT UNSIGNED NULL COMMENT 'usuario que subió el archivo',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_psi_arch_colegio_alumno (colegio_id, alumno_id),
  KEY idx_psi_arch_alumno_creado (alumno_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

