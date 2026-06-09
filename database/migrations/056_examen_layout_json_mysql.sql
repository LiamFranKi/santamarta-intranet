-- Layout fijo por intento: orden de preguntas y alternativas (barajado una sola vez).
ALTER TABLE asignaturas_examenes_pruebas
  ADD COLUMN exam_layout_json JSON NULL
  COMMENT 'Orden fijo preguntas/alternativas del intento (v1)'
  AFTER preguntas;
