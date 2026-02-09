-- ================================================================
-- CONSULTA: ALUMNOS MATRICULADOS EN 2026 CON PAGO DE MATRÍCULA
-- ================================================================
-- 
-- Lista de alumnos matriculados en 2026 que han pagado su matrícula
-- con clasificación de NUEVO o ANTIGUO según las reglas:
-- - NUEVO: No tiene matrículas antes de 2026, O no tiene matrícula en 2025
-- - ANTIGUO: Tiene matrícula en 2025
--
-- Campos retornados:
-- - DNI (nro_documento)
-- - Nombre Completo
-- - Apellidos
-- - Grado y Sección
-- - Nuevo/Antiguo
-- ================================================================

SELECT 
    a.nro_documento AS DNI,
    a.nombres AS Nombre,
    CONCAT(a.apellido_paterno, ' ', a.apellido_materno) AS Apellidos,
    CONCAT(g.grado, '° ', g.seccion) AS 'Grado y Sección',
    CASE 
        -- Si tiene matrícula en 2025, es ANTIGUO
        WHEN EXISTS (
            SELECT 1 
            FROM matriculas m2
            INNER JOIN grupos g2 ON m2.grupo_id = g2.id
            WHERE m2.alumno_id = a.id 
            AND g2.anio = 2025
        ) THEN 'ANTIGUO'
        -- Si no tiene matrícula en 2025 pero tiene matrículas antes de 2026, también es ANTIGUO (pero según reglas sería NUEVO)
        -- Espera, según las reglas:
        -- - Si tiene matrículas antes de 2026 pero ninguna es 2025 = NUEVO
        -- - Si tiene matrícula en 2025 = ANTIGUO
        ELSE 'NUEVO'
    END AS 'Nuevo o Antiguo'
FROM 
    alumnos a
    INNER JOIN matriculas m ON a.id = m.alumno_id
    INNER JOIN grupos g ON m.grupo_id = g.id
WHERE 
    -- Solo matrículas del año 2026
    g.anio = 2026
    -- Solo alumnos activos (opcional, ajusta según necesites)
    AND a.estado = 1  -- Ajusta según tu campo de estado de alumnos
    -- Solo matrículas activas (opcional, ajusta según necesites)
    AND m.estado = 1  -- Ajusta según tu campo de estado de matrículas
    -- Solo alumnos que han pagado la matrícula 2026
    AND EXISTS (
        SELECT 1 
        FROM pagos p
        WHERE p.matricula_id = m.id
        -- Tipo 0 generalmente es matrícula, ajusta según tu sistema
        AND p.tipo = 0  -- Verifica qué valor usa tu sistema para matrícula
        AND p.estado_pago = 'CANCELADO'
        AND p.estado = 'ACTIVO'  -- Solo pagos activos, no anulados
    )
ORDER BY 
    a.apellido_paterno, 
    a.apellido_materno, 
    a.nombres;

-- ================================================================
-- NOTAS IMPORTANTES:
-- ================================================================
-- 1. Verifica el campo de estado en la tabla 'alumnos':
--    - Puede ser 'estado' con valores 1/0 o 'ACTIVO'/'INACTIVO'
--    - Ajusta la condición AND a.estado = 1 según corresponda
--
-- 2. Verifica el campo de estado en la tabla 'matriculas':
--    - Puede ser 'estado' con valores 1/0 o 'ACTIVO'/'INACTIVO'
--    - Ajusta la condición AND m.estado = 1 según corresponda
--
-- 3. Verifica el valor de 'tipo' para pagos de matrícula:
--    - Generalmente es 0 para matrícula, 1 para pensión, etc.
--    - Ejecuta esto para ver los tipos de pago:
--      SELECT DISTINCT tipo, COUNT(*) FROM pagos GROUP BY tipo;
--
-- 4. Si necesitas filtrar por colegio_id específico, agrega:
--    AND a.colegio_id = 1  -- Reemplaza 1 con el ID del colegio
-- ================================================================








