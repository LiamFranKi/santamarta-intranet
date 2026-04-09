-- =============================================================================
-- Exámenes de Herramientas (intranet): modo PRACTICA | CALIFICADO | MIXTO,
-- audiencias, alcance por grupos (vacío = toda la institución), preguntas con puntaje,
-- intentos y respuestas (auto + revisión manual para texto).
-- Ejecutar UNA VEZ en vanguard_intranet.
-- =============================================================================

CREATE TABLE IF NOT EXISTS herramientas_examenes (
  id INT(11) NOT NULL AUTO_INCREMENT,
  colegio_id INT(11) NOT NULL,
  creador_usuario_id INT(11) NULL COMMENT 'Usuario que creó el examen',
  titulo VARCHAR(500) NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('BORRADOR','ACTIVO','CERRADO') NOT NULL DEFAULT 'BORRADOR',
  modo ENUM('PRACTICA','CALIFICADO','MIXTO') NOT NULL DEFAULT 'MIXTO',
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  mensaje_agradecimiento TEXT NULL,
  intentos_max INT(11) NOT NULL DEFAULT 1,
  mostrar_nota ENUM('NO','AL_ENVIAR','TRAS_REVISION') NOT NULL DEFAULT 'AL_ENVIAR',
  escala_max DECIMAL(8,2) NOT NULL DEFAULT 100.00 COMMENT 'Suma máxima de puntos o escala de referencia',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_colegio_estado (colegio_id, estado),
  KEY idx_creador (creador_usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas_examenes_audiencias (
  id INT(11) NOT NULL AUTO_INCREMENT,
  examen_id INT(11) NOT NULL,
  tipo VARCHAR(32) NOT NULL COMMENT 'APODERADO,ALUMNO,DOCENTE,PROMOTORIA,ADMINISTRADOR,TODOS',
  PRIMARY KEY (id),
  UNIQUE KEY uk_examen_tipo (examen_id, tipo),
  KEY idx_examen (examen_id),
  CONSTRAINT fk_hex_aud_examen FOREIGN KEY (examen_id) REFERENCES herramientas_examenes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas_examenes_grupos (
  examen_id INT(11) NOT NULL,
  grupo_id INT(11) NOT NULL,
  PRIMARY KEY (examen_id, grupo_id),
  KEY idx_grupo (grupo_id),
  CONSTRAINT fk_hex_grupos_examen FOREIGN KEY (examen_id) REFERENCES herramientas_examenes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas_examenes_preguntas (
  id INT(11) NOT NULL AUTO_INCREMENT,
  examen_id INT(11) NOT NULL,
  orden INT(11) NOT NULL DEFAULT 1,
  texto TEXT NOT NULL,
  tipo ENUM('ALTERNATIVAS','VERDADERO_FALSO','RESPUESTA_CORTA') NOT NULL,
  opciones_json JSON NULL COMMENT 'Alternativas: opciones[], correcta index; VF: correcta bool',
  puntos DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  solo_informativo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'En modo MIXTO: no suma a nota',
  obligatoria TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_examen_orden (examen_id, orden),
  CONSTRAINT fk_hex_preg_examen FOREIGN KEY (examen_id) REFERENCES herramientas_examenes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas_examenes_intentos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  examen_id INT(11) NOT NULL,
  colegio_id INT(11) NOT NULL,
  usuario_id INT(11) NOT NULL,
  rol_respondiente VARCHAR(32) NOT NULL,
  alumno_id INT(11) NULL,
  numero_intento INT(11) NOT NULL DEFAULT 1,
  estado ENUM('EN_CURSO','ENVIADO','CALIFICADO') NOT NULL DEFAULT 'EN_CURSO',
  puntaje_obtenido DECIMAL(10,2) NULL,
  puntaje_max_snapshot DECIMAL(10,2) NULL,
  borrador_json JSON NULL,
  fecha_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_envio DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_examen_usuario (examen_id, usuario_id),
  KEY idx_colegio (colegio_id),
  CONSTRAINT fk_hex_int_examen FOREIGN KEY (examen_id) REFERENCES herramientas_examenes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas_examenes_respuestas_linea (
  id BIGINT(20) NOT NULL AUTO_INCREMENT,
  intento_id INT(11) NOT NULL,
  pregunta_id INT(11) NOT NULL,
  respuesta_json JSON NULL,
  puntos_otorgados DECIMAL(8,2) NULL,
  requiere_revision TINYINT(1) NOT NULL DEFAULT 0,
  comentario_docente TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_intento_pregunta (intento_id, pregunta_id),
  KEY idx_pregunta (pregunta_id),
  CONSTRAINT fk_hex_rl_intento FOREIGN KEY (intento_id) REFERENCES herramientas_examenes_intentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_hex_rl_preg FOREIGN KEY (pregunta_id) REFERENCES herramientas_examenes_preguntas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
