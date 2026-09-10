-- Foto de las 3 tarjetas del INICIO (portada → Niveles Educativos).
-- Solo si ya corriste 088 y la tabla existe SIN home_ruta.
-- Si al ejecutar sale "Duplicate column name 'home_ruta'", ignóralo: ya está.

SET NAMES utf8mb4;

ALTER TABLE `web_paginas_nivel_media`
  ADD COLUMN `home_ruta` VARCHAR(255) NOT NULL DEFAULT ''
    COMMENT 'Foto de la tarjeta en el INICIO (portada)' AFTER `nivel`;

UPDATE `web_paginas_nivel_media` SET `home_ruta` = '/inicial.jpeg' WHERE `nivel` = 'inicial' AND (`home_ruta` = '' OR `home_ruta` IS NULL);
UPDATE `web_paginas_nivel_media` SET `home_ruta` = '/primaria.jpeg' WHERE `nivel` = 'primaria' AND (`home_ruta` = '' OR `home_ruta` IS NULL);
UPDATE `web_paginas_nivel_media` SET `home_ruta` = '/secundaria.jpeg' WHERE `nivel` = 'secundaria' AND (`home_ruta` = '' OR `home_ruta` IS NULL);
