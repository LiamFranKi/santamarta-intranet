-- Calificación manual por pregunta (Herramientas / Exámenes)
-- Permite alternativas/V-F sin autoevaluación; el admin asigna puntos en revisión.

ALTER TABLE herramientas_examenes_preguntas
  ADD COLUMN calificar_manualmente TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = no autoevaluar; requiere revisión manual (también si no hay correcta)'
  AFTER solo_informativo;
