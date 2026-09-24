-- Biblioteca del colegio: catálogo, ejemplares, reservas/préstamos y personal bibliotecario.
-- Ejecutar en phpMyAdmin (una sola vez). El interruptor del menú se prende en Módulos.

CREATE TABLE IF NOT EXISTS biblioteca_personal (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  personal_id INT UNSIGNED NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_biblioteca_personal_colegio (colegio_id, personal_id),
  KEY idx_biblioteca_personal_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Personal con función Biblioteca (como Cajero / Tutoría)';

CREATE TABLE IF NOT EXISTS biblioteca_categorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biblioteca_cat_colegio (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_areas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biblioteca_area_colegio (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_libros (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  autor VARCHAR(255) NULL,
  editorial VARCHAR(255) NULL,
  isbn VARCHAR(40) NULL,
  anio SMALLINT NULL,
  categoria_id INT UNSIGNED NULL,
  area_id INT UNSIGNED NULL,
  descripcion TEXT NULL,
  portada VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biblioteca_libro_colegio (colegio_id, activo),
  KEY idx_biblioteca_libro_cat (categoria_id),
  KEY idx_biblioteca_libro_area (area_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_ejemplares (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  libro_id INT UNSIGNED NOT NULL,
  codigo VARCHAR(40) NULL,
  estado ENUM('DISPONIBLE','SEPARADO','PRESTADO','BAJA') NOT NULL DEFAULT 'DISPONIBLE',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biblioteca_ej_libro (libro_id, estado),
  KEY idx_biblioteca_ej_colegio (colegio_id, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_movimientos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  libro_id INT UNSIGNED NOT NULL,
  ejemplar_id INT UNSIGNED NOT NULL,
  canal ENUM('VIRTUAL','PRESENCIAL') NOT NULL DEFAULT 'VIRTUAL',
  estado ENUM('SEPARADO','PRESTADO','DEVUELTO','CANCELADO','NO_RECOGIDO') NOT NULL DEFAULT 'SEPARADO',
  solicitante_tipo ENUM('ALUMNO','PERSONAL','APODERADO') NOT NULL,
  alumno_id INT UNSIGNED NULL,
  personal_id INT UNSIGNED NULL,
  apoderado_id INT UNSIGNED NULL,
  dias_prestamo INT NOT NULL DEFAULT 7,
  fecha_separacion DATE NULL,
  fecha_prestamo DATE NULL,
  fecha_vencimiento DATE NULL,
  fecha_devolucion DATE NULL,
  fecha_cancelacion DATE NULL,
  observacion VARCHAR(500) NULL,
  creado_por_usuario_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biblioteca_mov_colegio (colegio_id, estado),
  KEY idx_biblioteca_mov_ejemplar (ejemplar_id, estado),
  KEY idx_biblioteca_mov_alumno (alumno_id),
  KEY idx_biblioteca_mov_vence (estado, fecha_vencimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_avisos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  movimiento_id INT UNSIGNED NOT NULL,
  tipo ENUM('ANTES','DIA','DESPUES') NOT NULL,
  enviado_en DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_biblioteca_aviso (movimiento_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modulos_sistema (clave, activo)
VALUES ('biblioteca', 1), ('config.biblioteca', 1)
ON DUPLICATE KEY UPDATE clave = VALUES(clave);
