-- Tipo COMPROMISO: declaración con checkbox + firma dibujada (Herramientas / Exámenes)
-- Ejecutar UNA VEZ en vanguard_intranet.

ALTER TABLE herramientas_examenes_preguntas
  MODIFY COLUMN tipo ENUM(
    'ALTERNATIVAS',
    'VERDADERO_FALSO',
    'RESPUESTA_CORTA',
    'COMPROMISO'
  ) NOT NULL;
