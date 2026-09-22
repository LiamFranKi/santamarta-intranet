-- Grado de interés en visitas guiadas (web + reporte intranet).
ALTER TABLE `web_visitas_guiadas`
  ADD COLUMN `grado_interes` VARCHAR(80) DEFAULT NULL
  COMMENT 'Grado elegido según el nivel (Inicial 03 años, 1er grado, 1er año, …)'
  AFTER `nivel_interes`;
