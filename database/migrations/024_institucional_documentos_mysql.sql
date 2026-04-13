-- Módulo Institucional — PDFs por categoría (solo uso desde perfil ADMINISTRADOR en la app).
-- Ejecutar en el servidor MySQL del colegio / intranet.

CREATE TABLE IF NOT EXISTS institucional_categorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(500) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ic_colegio (colegio_id),
  KEY idx_ic_colegio_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS institucional_documentos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  categoria_id INT UNSIGNED NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  nombre_archivo_original VARCHAR(255) NOT NULL,
  ruta_almacenamiento VARCHAR(512) NOT NULL COMMENT 'Relativo a uploads/, ej: institucional-documentos/archivo.pdf',
  fecha_publicacion DATE NULL,
  fecha_vencimiento DATE NULL,
  subido_por_usuario_id INT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_id_colegio (colegio_id),
  KEY idx_id_categoria (categoria_id),
  KEY idx_id_venc (colegio_id, fecha_vencimiento),
  CONSTRAINT fk_id_categoria
    FOREIGN KEY (categoria_id) REFERENCES institucional_categorias (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
