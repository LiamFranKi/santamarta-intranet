-- =============================================================================
-- Encuestas intranet v2: audiencias múltiples, tipos de pregunta (vanguard-like),
-- respuestas ligadas al usuario (sin pedir nombre ni grado en el formulario).
-- Ejecutar UNA VEZ en vanguard_intranet. Si alguna columna ya existe, omitir esa línea.
-- =============================================================================

CREATE TABLE IF NOT EXISTS encuestas_audiencias (
  id INT(11) NOT NULL AUTO_INCREMENT,
  encuesta_id INT(11) NOT NULL,
  tipo VARCHAR(32) NOT NULL COMMENT 'APODERADO,ALUMNO,DOCENTE,PERSONAL,PROMOTORIA,ADMINISTRADOR,TODOS',
  PRIMARY KEY (id),
  UNIQUE KEY uk_encuesta_tipo (encuesta_id, tipo),
  KEY idx_encuesta (encuesta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS encuestas_respuestas (
  id INT(11) NOT NULL AUTO_INCREMENT,
  encuesta_id INT(11) NOT NULL,
  colegio_id INT(11) NOT NULL,
  usuario_id INT(11) NOT NULL,
  rol_respondiente VARCHAR(32) NOT NULL,
  alumno_id INT(11) NULL,
  grado_snapshot VARCHAR(160) NULL,
  nivel_snapshot VARCHAR(120) NULL,
  fecha_respuesta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_encuesta_usuario (encuesta_id, usuario_id),
  KEY idx_colegio (colegio_id),
  KEY idx_encuesta (encuesta_id),
  KEY idx_rol (rol_respondiente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS encuestas_respuestas_detalle (
  id BIGINT(20) NOT NULL AUTO_INCREMENT,
  respuesta_id INT(11) NOT NULL,
  pregunta_id INT(11) NOT NULL,
  texto_respuesta TEXT NULL,
  valor_numerico INT(11) NULL,
  opciones_json JSON NULL,
  PRIMARY KEY (id),
  KEY idx_respuesta (respuesta_id),
  KEY idx_pregunta (pregunta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --- ALTER (omitir línea si la columna ya existe) ---
ALTER TABLE encuestas ADD COLUMN descripcion TEXT NULL;
ALTER TABLE encuestas ADD COLUMN fecha_inicio DATE NULL;
ALTER TABLE encuestas ADD COLUMN fecha_fin DATE NULL;
ALTER TABLE encuestas ADD COLUMN mensaje_agradecimiento TEXT NULL;
ALTER TABLE encuestas ADD COLUMN categoria_metrica VARCHAR(64) NULL DEFAULT NULL;
ALTER TABLE encuestas ADD COLUMN modelo_encuesta TINYINT NOT NULL DEFAULT 1;
ALTER TABLE encuestas MODIFY COLUMN personal_id INT(11) NULL;

ALTER TABLE encuestas_preguntas ADD COLUMN subtitulo VARCHAR(500) NULL;
ALTER TABLE encuestas_preguntas MODIFY COLUMN tipo_respuesta VARCHAR(40) NOT NULL DEFAULT 'TEXTO';
ALTER TABLE encuestas_preguntas ADD COLUMN tipo_interfaz VARCHAR(32) NULL DEFAULT NULL;
ALTER TABLE encuestas_preguntas ADD COLUMN opciones_json JSON NULL;
ALTER TABLE encuestas_preguntas ADD COLUMN obligatoria TINYINT(1) NOT NULL DEFAULT 1;
