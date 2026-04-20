-- Vocabularios: asociar cada PDF a un grupo concreto (nivel + grado + sección = grupos.id).
-- Ejecutar si ya existe la tabla creada con 031 sin grupo_id.

ALTER TABLE `vocabularios`
  ADD COLUMN `grupo_id` int(11) NULL DEFAULT NULL COMMENT 'grupos.id' AFTER `grado`,
  ADD KEY `idx_vocab_grupo` (`grupo_id`);
