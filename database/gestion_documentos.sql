-- Documento De Gestión — tablas para PDFs por categoría y perfil de usuario
-- Ejecutar en phpMyAdmin (base de datos del colegio / intranet).

CREATE TABLE IF NOT EXISTS gestion_documentos_categorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(500) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gdc_colegio (colegio_id),
  KEY idx_gdc_colegio_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- perfil_destino: valor de usuarios.tipo o TODOS (todos los perfiles)
CREATE TABLE IF NOT EXISTS gestion_documentos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  categoria_id INT UNSIGNED NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  nombre_archivo_original VARCHAR(255) NOT NULL,
  ruta_almacenamiento VARCHAR(512) NOT NULL COMMENT 'Relativo a uploads/, ej: gestion-documentos/archivo.pdf',
  perfil_destino VARCHAR(40) NOT NULL DEFAULT 'DOCENTE',
  fecha_publicacion DATE NULL,
  subido_por_usuario_id INT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gd_colegio (colegio_id),
  KEY idx_gd_categoria (categoria_id),
  KEY idx_gd_perfil (perfil_destino),
  KEY idx_gd_colegio_perfil_activo (colegio_id, perfil_destino, activo),
  CONSTRAINT fk_gd_categoria
    FOREIGN KEY (categoria_id) REFERENCES gestion_documentos_categorias (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
