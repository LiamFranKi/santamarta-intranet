-- Unifica descuentos de presentación escolar en un único motivo: PRESENTACION (-1).
-- Reemplaza motivos históricos UNIFORME/CABELLO por PRESENTACION.

ALTER TABLE presentacion_escolar_descuentos
  MODIFY COLUMN motivo ENUM('UNIFORME','CABELLO','PRESENTACION') NOT NULL;

UPDATE presentacion_escolar_descuentos
SET motivo = 'PRESENTACION'
WHERE motivo IN ('UNIFORME', 'CABELLO');

ALTER TABLE presentacion_escolar_descuentos
  MODIFY COLUMN motivo ENUM('PRESENTACION') NOT NULL;
