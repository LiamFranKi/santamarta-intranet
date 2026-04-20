-- Historial Conexiones familiares: enlace directo a un mensaje RECIBIDO del envío
-- para listar adjuntos sin depender de que el asunto coincida con mensajes_grupos.

ALTER TABLE `mensajes_grupos`
  ADD COLUMN `mensaje_referencia_id` INT NULL DEFAULT NULL
    COMMENT 'ID en mensajes (típ. RECIBIDO) para asociar adjuntos del envío'
    AFTER `fecha_hora`,
  ADD KEY `idx_mensaje_referencia` (`mensaje_referencia_id`);
