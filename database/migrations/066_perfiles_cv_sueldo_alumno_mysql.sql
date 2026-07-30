-- Perfiles: sueldo (admin), CV personal, contactos/docs alumno
-- Ejecutar UNA VEZ en vanguard_intranet.

ALTER TABLE personal
  ADD COLUMN sueldo DECIMAL(12,2) NULL DEFAULT NULL
  COMMENT 'Remuneración base; solo visible/editable por administradores'
  AFTER cargo;

CREATE TABLE IF NOT EXISTS personal_estudios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  personal_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  nivel VARCHAR(80) NULL COMMENT 'Secundaria, Técnico, Universitario, Postgrado, etc.',
  institucion VARCHAR(255) NOT NULL DEFAULT '',
  carrera VARCHAR(255) NULL,
  anio_inicio SMALLINT UNSIGNED NULL,
  anio_fin SMALLINT UNSIGNED NULL,
  en_curso TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pe_personal (personal_id),
  KEY idx_pe_colegio_personal (colegio_id, personal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_idiomas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  personal_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  idioma VARCHAR(120) NOT NULL,
  nivel ENUM('BASICO','INTERMEDIO','AVANZADO','NATIVO') NOT NULL DEFAULT 'BASICO',
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pi_personal (personal_id),
  KEY idx_pi_colegio_personal (colegio_id, personal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_experiencia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  personal_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  empresa VARCHAR(255) NOT NULL DEFAULT '',
  cargo VARCHAR(255) NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  actual TINYINT(1) NOT NULL DEFAULT 0,
  descripcion TEXT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_px_personal (personal_id),
  KEY idx_px_colegio_personal (colegio_id, personal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_documentos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  personal_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  tipo ENUM('TITULO','CERTIFICADO','OTRO') NOT NULL DEFAULT 'OTRO',
  titulo VARCHAR(255) NOT NULL DEFAULT '',
  archivo_servidor VARCHAR(500) NOT NULL COMMENT 'Nombre archivo bajo uploads/personal-cv/{colegio_id}/',
  mime_type VARCHAR(120) NULL,
  tamano_bytes INT UNSIGNED NULL,
  subido_por_usuario_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pd_personal (personal_id),
  KEY idx_pd_colegio_personal (colegio_id, personal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alumno_contactos_emergencia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alumno_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  nombres VARCHAR(255) NOT NULL DEFAULT '',
  parentesco VARCHAR(120) NULL,
  telefono VARCHAR(60) NULL,
  email VARCHAR(180) NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ace_alumno (alumno_id),
  KEY idx_ace_colegio_alumno (colegio_id, alumno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alumno_documentos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alumno_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  tipo ENUM('VACUNA','CERTIFICADO_MEDICO','OTRO') NOT NULL DEFAULT 'VACUNA',
  titulo VARCHAR(255) NOT NULL DEFAULT '',
  archivo_servidor VARCHAR(500) NOT NULL COMMENT 'Nombre archivo bajo uploads/alumno-docs/{colegio_id}/',
  mime_type VARCHAR(120) NULL,
  tamano_bytes INT UNSIGNED NULL,
  subido_por_usuario_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ad_alumno (alumno_id),
  KEY idx_ad_colegio_alumno (colegio_id, alumno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
