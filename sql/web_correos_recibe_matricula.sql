-- Canal "Matrícula online" en Correos de envío (menú Web).
-- Distinto de Admisión (formulario de la web institucional).
-- Ejecutar una sola vez en la BD.

ALTER TABLE web_correos_envio
  ADD COLUMN recibe_matricula TINYINT(1) NOT NULL DEFAULT 0 AFTER recibe_admision;
