-- Libreta Nivel Inicial personalizada (áreas e indicadores por aula, notas por matrícula y bimestre)
-- Ejecutar en phpMyAdmin sobre la base del colegio (UTF8MB4 / InnoDB).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS libreta_inicial_areas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  grupo_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  anio SMALLINT NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_libreta_inicial_areas_grupo (grupo_id, colegio_id, anio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS libreta_inicial_indicadores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  alcance_ciclo TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=todo el año (I–IV); 1–4=solo ese bimestre',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_libreta_inicial_ind_area (area_id),
  CONSTRAINT fk_libreta_inicial_ind_area
    FOREIGN KEY (area_id) REFERENCES libreta_inicial_areas (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS libreta_inicial_valores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicador_id INT UNSIGNED NOT NULL,
  matricula_id INT UNSIGNED NOT NULL,
  colegio_id INT UNSIGNED NOT NULL,
  ciclo TINYINT UNSIGNED NOT NULL COMMENT 'Bimestre 1-4',
  detalle TEXT NULL,
  nota VARCHAR(12) NULL COMMENT 'AD, A, B, C, etc.',
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_libreta_inicial_valor (indicador_id, matricula_id, ciclo),
  KEY idx_libreta_inicial_val_mat (matricula_id, ciclo, colegio_id),
  CONSTRAINT fk_libreta_inicial_val_ind
    FOREIGN KEY (indicador_id) REFERENCES libreta_inicial_indicadores (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
