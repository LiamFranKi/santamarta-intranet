-- Cuarto casillero de conducta: Olvido QR.
-- Se guarda en presentacion_escolar_descuentos con motivo OLVIDO_QR
-- (independiente de PRESENTACION). Amplía el ENUM sin borrar valores históricos.

ALTER TABLE presentacion_escolar_descuentos
  MODIFY COLUMN motivo ENUM('UNIFORME','CABELLO','PRESENTACION','OLVIDO_QR') NOT NULL;
