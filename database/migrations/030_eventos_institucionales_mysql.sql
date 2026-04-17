-- Eventos institucionales (asistencia de apoderados vía QR público)
-- Ejecutar en MySQL del colegio.

CREATE TABLE IF NOT EXISTS eventos_institucionales (
  id INT NOT NULL AUTO_INCREMENT,
  colegio_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT NULL,
  fecha_evento DATE NULL,
  hora_inicio TIME NULL,
  hora_fin TIME NULL,
  lugar VARCHAR(255) NULL,
  responsable VARCHAR(255) NULL,
  expositor VARCHAR(255) NULL,
  aviso_texto TEXT NULL,
  programa_texto TEXT NULL,
  materiales_texto TEXT NULL,
  estado ENUM('BORRADOR','ACTIVO','CERRADO') NOT NULL DEFAULT 'BORRADOR',
  token_publico CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_publico (token_publico),
  KEY idx_eventos_colegio (colegio_id),
  KEY idx_eventos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eventos_institucionales_grupos (
  evento_id INT NOT NULL,
  grupo_id INT NOT NULL,
  PRIMARY KEY (evento_id, grupo_id),
  KEY idx_eig_grupo (grupo_id),
  CONSTRAINT fk_eig_evento FOREIGN KEY (evento_id) REFERENCES eventos_institucionales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eventos_institucionales_asistencias (
  id INT NOT NULL AUTO_INCREMENT,
  evento_id INT NOT NULL,
  alumno_id INT NOT NULL,
  apoderado_id INT NOT NULL,
  marcado_en DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_evento_alumno_apoderado (evento_id, alumno_id, apoderado_id),
  KEY idx_eia_evento (evento_id),
  KEY idx_eia_alumno (alumno_id),
  CONSTRAINT fk_eia_evento FOREIGN KEY (evento_id) REFERENCES eventos_institucionales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eventos_institucionales_visitantes (
  id INT NOT NULL AUTO_INCREMENT,
  evento_id INT NOT NULL,
  alumno_id INT NULL,
  nombre_completo VARCHAR(255) NOT NULL,
  telefono VARCHAR(80) NULL,
  correo VARCHAR(255) NULL,
  parentesco VARCHAR(120) NULL,
  marcado_en DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_eiv_evento (evento_id),
  CONSTRAINT fk_eiv_evento FOREIGN KEY (evento_id) REFERENCES eventos_institucionales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
