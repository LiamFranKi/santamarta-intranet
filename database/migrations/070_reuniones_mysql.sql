-- Reuniones institucionales (acta + convocatoria). NO insertar en `actividades`
-- (esa tabla es el calendario del colegio entero). Las invitaciones se fusionan
-- en GET /actividades solo para convocante e invitados.

CREATE TABLE IF NOT EXISTS reuniones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT NOT NULL,
  creador_usuario_id INT NOT NULL,
  abrir_usuario_id INT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion MEDIUMTEXT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NULL,
  modalidad ENUM('PRESENCIAL','VIRTUAL','HIBRIDA') NOT NULL DEFAULT 'PRESENCIAL',
  lugar VARCHAR(255) NULL,
  enlace_videollamada VARCHAR(500) NULL,
  estado ENUM('BORRADOR','CONVOCADA','EN_CURSO','CERRADA','CANCELADA') NOT NULL DEFAULT 'BORRADOR',
  acta MEDIUMTEXT NULL,
  acuerdos MEDIUMTEXT NULL,
  iniciada_en DATETIME NULL,
  cerrada_en DATETIME NULL,
  recordatorio_enviado TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_reuniones_colegio_fecha (colegio_id, fecha),
  KEY idx_reuniones_colegio_estado (colegio_id, estado),
  KEY idx_reuniones_creador (creador_usuario_id),
  KEY idx_reuniones_abrir (abrir_usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reuniones_participantes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reunion_id INT UNSIGNED NOT NULL,
  usuario_id INT NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  rol ENUM('CONVOCANTE','INVITADO') NOT NULL DEFAULT 'INVITADO',
  asistencia ENUM('PENDIENTE','ASISTIO','AUSENTE','JUSTIFICADO') NOT NULL DEFAULT 'PENDIENTE',
  asistencia_en DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reunion_usuario (reunion_id, usuario_id),
  KEY idx_rp_usuario (usuario_id),
  CONSTRAINT fk_rp_reunion FOREIGN KEY (reunion_id) REFERENCES reuniones (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reuniones_archivos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reunion_id INT UNSIGNED NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  tamano INT NULL,
  subido_por INT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ra_reunion (reunion_id),
  CONSTRAINT fk_ra_reunion FOREIGN KEY (reunion_id) REFERENCES reuniones (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
