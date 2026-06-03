-- Mes límite para bloqueo de deudores (pensiones tipo=1, nro_pago 1..N).
-- NULL o vacío = sin límite (comportamiento anterior: todas las pensiones vencidas).
-- Valor 0-11 (0=Enero … 11=Diciembre), mismo criterio que inicio_pensiones.
-- Matrícula (pagos tipo=0) no interviene en el bloqueo.

ALTER TABLE `colegios`
  ADD COLUMN `bloquear_deudores_hasta_mes` TINYINT NULL DEFAULT NULL
  COMMENT 'Mes límite bloqueo deudores (0=Ene..11=Dic); NULL=sin límite'
  AFTER `bloquear_deudores`;
