-- Índices para consultas frecuentes de pagos, matrículas, familias y dedup de notificaciones.
-- Ejecutar una vez en el servidor. Si un índice ya existe, omitir esa línea.
-- Ventana de mantenimiento recomendada si `pagos` es muy grande (millones de filas).

-- Verificación de deuda, EXISTS matrícula pagada y boletear (matricula_id + filtros frecuentes)
CREATE INDEX idx_pagos_matricula_lookup ON pagos (matricula_id, colegio_id, tipo, estado, estado_pago, nro_pago);

-- Matrícula activa por alumno (login alumno, portal)
CREATE INDEX idx_matriculas_alumno_colegio_estado ON matriculas (alumno_id, colegio_id, estado);

-- Listado por grupo (Pagos escolares, reportes)
CREATE INDEX idx_matriculas_colegio_grupo_estado ON matriculas (colegio_id, grupo_id, estado);

-- Hijos del apoderado (verificar deudas APODERADO/DOCENTE)
CREATE INDEX idx_familias_apoderado_alumno ON familias (apoderado_id, alumno_id);

-- Dedup notificaciones campanita (notificacionInsert.js)
CREATE INDEX idx_notificaciones_dedup ON notificaciones (destinatario_id, usuario_id, accion_tipo, fecha_hora);

-- Collation utf8mb4 en columnas de texto (evita ER_CANT_AGGREGATE_2COLLATIONS con emoji)
ALTER TABLE `notificaciones`
  MODIFY COLUMN `accion_tipo` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  MODIFY COLUMN `contenido` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
