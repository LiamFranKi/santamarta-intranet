-- Respuestas por pregunta e intento (aula virtual). Retrocompatible con campo JSON respuestas en pruebas.
CREATE TABLE IF NOT EXISTS asignaturas_examenes_respuestas_linea (
  id BIGINT NOT NULL AUTO_INCREMENT,
  prueba_id INT(11) NOT NULL,
  pregunta_id INT(11) NOT NULL,
  respuesta_json JSON NULL,
  es_correcta TINYINT(1) NULL COMMENT '1=correcta, 0=incorrecta o sin responder calificable, NULL=pendiente',
  puntos_parciales DECIMAL(8,2) NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_aep_rl_prueba_pregunta (prueba_id, pregunta_id),
  KEY idx_aep_rl_prueba (prueba_id),
  KEY idx_aep_rl_pregunta (pregunta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
