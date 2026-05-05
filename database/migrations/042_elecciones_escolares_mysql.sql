-- Elecciones escolares (alcaldía): proceso, cargos de plancha, listas, propuestas, redes, voto único por usuario.
-- Ejecutar en MySQL del colegio (vanguard_intranet). Idempotente: CREATE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS elecciones_proceso (
  id INT(11) NOT NULL AUTO_INCREMENT,
  colegio_id INT(11) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('BORRADOR','CAMPAÑA','VOTACION','CERRADA') NOT NULL DEFAULT 'BORRADOR',
  modalidad ENUM('VIRTUAL','PRESENCIAL','MIXTO') NOT NULL DEFAULT 'VIRTUAL',
  grado_min TINYINT NULL COMMENT 'NULL = sin mínimo',
  grado_max TINYINT NULL COMMENT 'NULL = sin máximo',
  grupo_ids JSON NULL COMMENT 'array de IDs de grupos; NULL o [] = todos',
  votacion_inicio DATETIME NULL,
  votacion_fin DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_elecc_proc_colegio (colegio_id),
  KEY idx_elecc_proc_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_cargo (
  id INT(11) NOT NULL AUTO_INCREMENT,
  proceso_id INT(11) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  orden_sort INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_elecc_cargo_nom (proceso_id, nombre),
  KEY idx_elecc_cargo_proc (proceso_id),
  CONSTRAINT fk_elecc_cargo_proc FOREIGN KEY (proceso_id) REFERENCES elecciones_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_lista (
  id INT(11) NOT NULL AUTO_INCREMENT,
  proceso_id INT(11) NOT NULL,
  nombre_lista VARCHAR(200) NOT NULL,
  eslogan VARCHAR(500) NULL,
  color_primario VARCHAR(24) NOT NULL DEFAULT '#4f46e5',
  color_secundario VARCHAR(24) NOT NULL DEFAULT '#0ea5e9',
  logo_path VARCHAR(512) NULL,
  alcalde_nombres VARCHAR(120) NOT NULL DEFAULT '',
  alcalde_apellidos VARCHAR(160) NOT NULL DEFAULT '',
  alcalde_foto_path VARCHAR(512) NULL,
  estado ENUM('BORRADOR','PUBLICADA') NOT NULL DEFAULT 'BORRADOR',
  orden_sort INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_elecc_lista_proc (proceso_id),
  CONSTRAINT fk_elecc_lista_proc FOREIGN KEY (proceso_id) REFERENCES elecciones_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_miembro (
  id INT(11) NOT NULL AUTO_INCREMENT,
  lista_id INT(11) NOT NULL,
  cargo_id INT(11) NOT NULL,
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(160) NOT NULL,
  foto_path VARCHAR(512) NULL,
  orden_sort INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_elecc_miemb_lista (lista_id),
  KEY idx_elecc_miemb_cargo (cargo_id),
  CONSTRAINT fk_elecc_miemb_lista FOREIGN KEY (lista_id) REFERENCES elecciones_lista(id) ON DELETE CASCADE,
  CONSTRAINT fk_elecc_miemb_cargo FOREIGN KEY (cargo_id) REFERENCES elecciones_cargo(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_propuesta (
  id INT(11) NOT NULL AUTO_INCREMENT,
  lista_id INT(11) NOT NULL,
  titulo VARCHAR(300) NOT NULL,
  cuerpo TEXT NOT NULL,
  orden_sort INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_elecc_prop_lista (lista_id),
  CONSTRAINT fk_elecc_prop_lista FOREIGN KEY (lista_id) REFERENCES elecciones_lista(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_red_social (
  id INT(11) NOT NULL AUTO_INCREMENT,
  lista_id INT(11) NOT NULL,
  tipo VARCHAR(32) NOT NULL DEFAULT 'LINK',
  titulo VARCHAR(200) NULL,
  url VARCHAR(600) NOT NULL,
  orden_sort INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_elecc_red_lista (lista_id),
  CONSTRAINT fk_elecc_red_lista FOREIGN KEY (lista_id) REFERENCES elecciones_lista(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elecciones_voto (
  id BIGINT(20) NOT NULL AUTO_INCREMENT,
  proceso_id INT(11) NOT NULL,
  colegio_id INT(11) NOT NULL,
  usuario_id INT(11) NOT NULL,
  alumno_id INT(11) NULL,
  lista_id INT(11) NOT NULL,
  grupo_id_snap INT(11) NULL,
  grado_snap TINYINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_elecc_voto_proc_user (proceso_id, usuario_id),
  KEY idx_elecc_voto_proc (proceso_id),
  KEY idx_elecc_voto_lista (lista_id),
  CONSTRAINT fk_elecc_voto_proc FOREIGN KEY (proceso_id) REFERENCES elecciones_proceso(id) ON DELETE CASCADE,
  CONSTRAINT fk_elecc_voto_lista FOREIGN KEY (lista_id) REFERENCES elecciones_lista(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
