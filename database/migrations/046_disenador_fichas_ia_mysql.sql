-- Migración 046: Módulo Diseñador de fichas pedagógicas (IA)
-- Archivos en disco: intranet2026/backend/uploads/fichas-ia/ y public/assets/fichas-ia/
-- Documentación: docs/DISENADOR_FICHAS_IA.md

-- Plantillas de maquetación (Handlebars + metadatos por grado/área)
CREATE TABLE IF NOT EXISTS fichas_ia_plantillas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  codigo VARCHAR(64) NOT NULL COMMENT 'ej. ciencia_primaria_4',
  nombre VARCHAR(120) NOT NULL,
  grado VARCHAR(32) NULL COMMENT 'ej. 4',
  area VARCHAR(64) NULL COMMENT 'ej. CIENCIA Y TECNOLOGIA',
  archivo_plantilla VARCHAR(255) NOT NULL COMMENT 'relativo a backend/templates/fichas-ia/',
  version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fichas_ia_plantilla_colegio_codigo (colegio_id, codigo),
  KEY idx_fichas_ia_plantilla_colegio_activo (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de imágenes propias (NO sistema PHP)
CREATE TABLE IF NOT EXISTS fichas_ia_assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  etiqueta VARCHAR(64) NOT NULL COMMENT 'logo, avatar_nino, diagrama_planta, marco_recuerda',
  nombre_archivo VARCHAR(255) NOT NULL COMMENT 'bajo public/assets/fichas-ia/',
  mime VARCHAR(64) NULL,
  ancho_px SMALLINT UNSIGNED NULL,
  alto_px SMALLINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fichas_ia_asset_colegio_etiqueta (colegio_id, etiqueta),
  KEY idx_fichas_ia_asset_colegio (colegio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trabajo / solicitud de generación (un PDF origen → un PDF generado)
CREATE TABLE IF NOT EXISTS fichas_ia_trabajos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL COMMENT 'quien solicitó',
  plantilla_id INT UNSIGNED NULL,
  asignatura_id INT UNSIGNED NULL COMMENT 'opcional: vincular a aula virtual',
  titulo VARCHAR(255) NOT NULL,
  grado VARCHAR(32) NULL,
  area VARCHAR(64) NULL,
  unidad VARCHAR(32) NULL,
  estado ENUM(
    'BORRADOR',
    'EXTRAYENDO',
    'IA_PROCESANDO',
    'MAQUETANDO',
    'LISTO',
    'ERROR',
    'PUBLICADO',
    'CANCELADO'
  ) NOT NULL DEFAULT 'BORRADOR',
  origen_tipo ENUM('PDF', 'FORMULARIO', 'PDF_Y_FORMULARIO') NOT NULL DEFAULT 'PDF',
  archivo_origen_nombre VARCHAR(255) NULL COMMENT 'nombre en uploads/fichas-ia/origen/',
  archivo_generado_nombre VARCHAR(255) NULL COMMENT 'nombre en uploads/fichas-ia/generados/',
  texto_extraido MEDIUMTEXT NULL,
  prompt_version VARCHAR(32) NULL DEFAULT 'v1',
  ia_proveedor VARCHAR(32) NULL COMMENT 'google, openai',
  ia_modelo VARCHAR(64) NULL COMMENT 'gemini-2.0-flash, gpt-4o-mini',
  tokens_entrada INT UNSIGNED NULL,
  tokens_salida INT UNSIGNED NULL,
  costo_estimado_usd DECIMAL(10,6) NULL,
  error_mensaje TEXT NULL,
  publicado_archivo_id INT UNSIGNED NULL COMMENT 'FK asignaturas_archivos si se publicó como tema',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  completado_en DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_fichas_ia_trabajos_colegio_estado (colegio_id, estado),
  KEY idx_fichas_ia_trabajos_usuario (usuario_id),
  KEY idx_fichas_ia_trabajos_asignatura (asignatura_id),
  CONSTRAINT fk_fichas_ia_trabajos_plantilla
    FOREIGN KEY (plantilla_id) REFERENCES fichas_ia_plantillas (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bloques editables (JSON) antes de renderizar PDF final
CREATE TABLE IF NOT EXISTS fichas_ia_trabajo_secciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trabajo_id INT UNSIGNED NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tipo ENUM(
    'INTRO',
    'RECUERDA',
    'ACTIVIDAD_TABLA',
    'ACTIVIDAD_UNIR',
    'ACTIVIDAD_PREGUNTAS',
    'PIE_MOTIVACIONAL',
    'CUSTOM'
  ) NOT NULL DEFAULT 'CUSTOM',
  titulo VARCHAR(255) NULL,
  contenido_json JSON NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fichas_ia_secciones_trabajo (trabajo_id, orden),
  CONSTRAINT fk_fichas_ia_secciones_trabajo
    FOREIGN KEY (trabajo_id) REFERENCES fichas_ia_trabajos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
