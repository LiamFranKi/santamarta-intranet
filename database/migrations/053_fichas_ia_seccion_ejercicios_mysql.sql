-- Migración 053: tipo ACTIVIDAD_EJERCICIOS en secciones de fichas IA (matemática)
-- Si el valor ya existe, omitir o ignorar error de ALTER.

ALTER TABLE fichas_ia_trabajo_secciones
  MODIFY COLUMN tipo ENUM(
    'INTRO',
    'RECUERDA',
    'ACTIVIDAD_TABLA',
    'ACTIVIDAD_UNIR',
    'ACTIVIDAD_PREGUNTAS',
    'ACTIVIDAD_EJERCICIOS',
    'PIE_MOTIVACIONAL',
    'CUSTOM'
  ) NOT NULL DEFAULT 'CUSTOM';
