-- ================================================================
-- CONSULTA: ALUMNOS MATRICULADOS EN 2026 CON PAGO DE MATRÍCULA (VERSIÓN MEJORADA)
-- ================================================================
-- 
-- Esta versión incluye validaciones más completas y maneja mejor
-- los casos de alumnos nuevos vs antiguos según las reglas exactas:
--
-- REGLAS:
-- 1. Si el alumno NO tiene matrículas antes de 2026 → NUEVO
-- 2. Si tiene matrículas antes de 2026 pero NINGUNA es del 2025 → NUEVO  
-- 3. Si tiene matrícula del 2025 → ANTIGUO
--
-- Solo incluye alumnos que han pagado su matrícula 2026 (CANCELADO)
-- ================================================================

SELECT 
    a.nro_documento AS DNI,
    a.nombres AS Nombre,
    CONCAT(a.apellido_paterno, ' ', a.apellido_materno) AS Apellidos,
    CONCAT(g.grado, '° ', g.seccion) AS 'Grado y Sección',
    CASE 
        -- Regla 3: Si tiene matrícula en 2025, es ANTIGUO
        WHEN EXISTS (
            SELECT 1 
            FROM matriculas m_antigua
            INNER JOIN grupos g_antigua ON m_antigua.grupo_id = g_antigua.id
            WHERE m_antigua.alumno_id = a.id 
            AND g_antigua.anio = 2025
            AND m_antigua.estado = 1  -- Solo matrículas activas
        ) THEN 'ANTIGUO'
        -- Reglas 1 y 2: No tiene matrícula en 2025 → NUEVO
        ELSE 'NUEVO'
    END AS 'Nuevo o Antiguo'
FROM 
    alumnos a
    INNER JOIN matriculas m ON a.id = m.alumno_id
    INNER JOIN grupos g ON m.grupo_id = g.id
WHERE 
    -- Solo matrículas del año 2026
    g.anio = 2026
    -- Solo alumnos activos (ajusta según tu esquema)
    -- Si no tienes campo estado, comenta esta línea:
    -- AND a.estado = 1
    -- Solo matrículas activas (ajusta según tu esquema)
    -- Si no tienes campo estado, comenta esta línea:
    -- AND m.estado = 1
    -- Solo alumnos que han pagado la matrícula 2026
    AND EXISTS (
        SELECT 1 
        FROM pagos p
        WHERE p.matricula_id = m.id
        -- Tipo 0 = Matrícula (VERIFICA este valor en tu BD)
        AND p.tipo = 0
        -- Pago cancelado
        AND p.estado_pago = 'CANCELADO'
        -- Pago activo (no anulado)
        AND p.estado = 'ACTIVO'
    )
ORDER BY 
    a.apellido_paterno, 
    a.apellido_materno, 
    a.nombres;

-- ================================================================
-- CONSULTA AUXILIAR: Para verificar tipos de pago
-- ================================================================
-- Ejecuta esto primero para ver qué valores tiene el campo 'tipo'
-- en la tabla pagos y determinar cuál corresponde a matrícula:
--
-- SELECT DISTINCT tipo, COUNT(*) as cantidad 
-- FROM pagos 
-- WHERE matricula_id IN (SELECT id FROM matriculas WHERE grupo_id IN (SELECT id FROM grupos WHERE anio = 2026))
-- GROUP BY tipo;
--
-- ================================================================
-- CONSULTA AUXILIAR: Para verificar estructura de estados
-- ================================================================
-- Verifica si las tablas tienen campos de estado:
--
-- DESCRIBE alumnos;
-- DESCRIBE matriculas;
--
-- ================================================================









