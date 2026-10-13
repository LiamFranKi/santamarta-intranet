-- Conducta por ítem, desde el bimestre 4 de 2026.
-- No borra incidencias, presentación, tardanzas ni notas de los bimestres 1, 2 y 3.

CREATE TABLE IF NOT EXISTS conducta_items (
  id INT NOT NULL AUTO_INCREMENT,
  grupo ENUM('leve','grave','muy_grave','presentacion','puntualidad') NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(600) NOT NULL,
  descuento DECIMAL(6,2) NOT NULL DEFAULT 0.25,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  es_olvido_qr TINYINT(1) NOT NULL DEFAULT 0,
  es_ingreso_vestimenta TINYINT(1) NOT NULL DEFAULT 0,
  es_ingreso_tardanza TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conducta_items_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conducta_registros (
  id INT NOT NULL AUTO_INCREMENT,
  colegio_id INT NOT NULL,
  matricula_id INT NOT NULL,
  item_id INT NULL,
  grupo VARCHAR(20) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(600) NOT NULL,
  descuento DECIMAL(6,2) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NULL,
  anio INT NOT NULL,
  ciclo INT NOT NULL,
  origen VARCHAR(30) NOT NULL DEFAULT 'manual',
  registrado_por_usuario_id INT NULL,
  enrollment_incident_id INT NULL,
  presentacion_descuento_id INT NULL,
  asistencia_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cond_reg_mat_fecha (matricula_id, fecha),
  KEY idx_cond_reg_colegio (colegio_id, anio, ciclo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conducta_avisos_limite (
  id INT NOT NULL AUTO_INCREMENT,
  matricula_id INT NOT NULL,
  anio INT NOT NULL,
  ciclo INT NOT NULL,
  nota DECIMAL(6,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cond_aviso (matricula_id, anio, ciclo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
