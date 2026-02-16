-- ============================================================
-- SCRIPT SQL PARA ELIMINAR ACTIVIDADES CON usuario_id = 2
-- ============================================================
-- 
-- ⚠️ ADVERTENCIA: Este script eliminará PERMANENTEMENTE todas las actividades
-- donde usuario_id = 2. Esta acción NO se puede deshacer.
--
-- INSTRUCCIONES:
-- 1. Revisa el script antes de ejecutarlo
-- 2. Si quieres cambiar el usuario_id, modifica el valor en la línea del DELETE
-- 3. Ejecuta este script en phpMyAdmin
--
-- ============================================================

-- Mostrar cuántas actividades se van a eliminar (solo para verificación)
SELECT 
    COUNT(*) as total_actividades_a_eliminar,
    usuario_id,
    MIN(fecha_inicio) as fecha_mas_antigua,
    MAX(fecha_fin) as fecha_mas_reciente
FROM actividades 
WHERE usuario_id = 2;

-- ============================================================
-- ELIMINAR ACTIVIDADES
-- ============================================================

DELETE FROM actividades 
WHERE usuario_id = 2;

-- ============================================================
-- VERIFICACIÓN POST-ELIMINACIÓN
-- ============================================================

-- Verificar que se eliminaron (debe mostrar 0)
SELECT 
    COUNT(*) as actividades_restantes_con_usuario_2
FROM actividades 
WHERE usuario_id = 2;

-- Mostrar resumen de actividades restantes por usuario
SELECT 
    usuario_id,
    COUNT(*) as total_actividades
FROM actividades 
GROUP BY usuario_id
ORDER BY usuario_id;










