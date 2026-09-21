-- Destinos múltiples de FAQs: Web (menú Preguntas frecuentes) + Inicial / Primaria / Secundaria.
-- phpMyAdmin → SQL → pegar y Continuar. No repetir si ya se ejecutó.

SET NAMES utf8mb4;

ALTER TABLE `web_faqs`
  ADD COLUMN `pagina_destinos` JSON NULL
  COMMENT '["web","inicial","primaria","secundaria"]'
  AFTER `pagina_nivel`;

UPDATE `web_faqs`
SET `pagina_destinos` = CASE
  WHEN `pagina_nivel` = 'inicial' THEN JSON_ARRAY('web', 'inicial')
  WHEN `pagina_nivel` = 'primaria' THEN JSON_ARRAY('web', 'primaria')
  WHEN `pagina_nivel` = 'secundaria' THEN JSON_ARRAY('web', 'secundaria')
  WHEN `pagina_nivel` = 'web' THEN JSON_ARRAY('web')
  ELSE JSON_ARRAY('web', 'inicial', 'primaria', 'secundaria')
END
WHERE `pagina_destinos` IS NULL;

ALTER TABLE `web_faqs`
  MODIFY COLUMN `pagina_nivel` VARCHAR(80) NOT NULL DEFAULT 'todos'
  COMMENT 'Compat: todos | web | inicial | primaria | secundaria | lista csv';
