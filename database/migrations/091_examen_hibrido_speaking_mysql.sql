-- Examen híbrido + Speaking (aula virtual).
-- VIRTUAL: el sistema califica todo (igual que ahora).
-- HIBRIDO: preguntas automáticas + Speaking que califica el docente (audio o en vivo).
-- PDF: no cambia.
--
-- phpMyAdmin: ejecutar completo. Si alguna columna o el ENUM ya existen,
-- comenta ese ALTER y sigue con el resto.

-- 1) Permitir tipo HIBRIDO en el examen (antes solía ser ENUM VIRTUAL/PDF).
ALTER TABLE asignaturas_examenes
  MODIFY COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'VIRTUAL';

-- 2) Cómo se evalúa el Speaking (solo aplica si tipo = HIBRIDO).
ALTER TABLE asignaturas_examenes
  ADD COLUMN speaking_modo VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Solo HIBRIDO: AUDIO (el alumno graba) o EN_VIVO (el docente anota en clase)'
    AFTER tipo;

-- 3) El ENUM de preguntas NO incluye SPEAKING todavía: sin esto el INSERT falla.
ALTER TABLE asignaturas_examenes_preguntas
  MODIFY COLUMN tipo ENUM(
    'ALTERNATIVAS',
    'COMPLETAR',
    'VERDADERO_FALSO',
    'RESPUESTA_CORTA',
    'ORDENAR',
    'EMPAREJAR',
    'ARRASTRAR_Y_SOLTAR',
    'SPEAKING'
  ) NOT NULL COMMENT 'Tipo de pregunta del examen';

-- 4) Marca si falta la nota del docente en Speaking.
ALTER TABLE asignaturas_examenes_pruebas
  ADD COLUMN pendiente_speaking TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = falta nota del docente en una o más preguntas Speaking';
