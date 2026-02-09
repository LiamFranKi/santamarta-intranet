-- =====================================================
-- Script SQL para Normalizar Nombres y Apellidos
-- Tabla: alumnos
-- Campos: nombres, apellido_paterno, apellido_materno
-- 
-- Formato: Primera letra de cada palabra en mayúscula,
--          resto en minúscula
-- Ejemplo: "JOSE LUIS" → "Jose Luis"
--          "PEREZ" → "Perez"
--          "GARCIA LOPEZ" → "Garcia Lopez"
-- =====================================================

-- Crear función auxiliar para capitalizar cada palabra
-- Esta función maneja múltiples palabras correctamente

DELIMITER $$

DROP FUNCTION IF EXISTS CapitalizeWords$$

CREATE FUNCTION CapitalizeWords(str TEXT)
RETURNS TEXT
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE result TEXT DEFAULT '';
    DECLARE word TEXT DEFAULT '';
    DECLARE remaining TEXT DEFAULT '';
    DECLARE space_pos INT DEFAULT 0;
    DECLARE max_iterations INT DEFAULT 100;
    DECLARE iteration INT DEFAULT 0;
    
    -- Si el string está vacío o NULL, retornar tal cual
    IF str IS NULL OR TRIM(str) = '' THEN
        RETURN str;
    END IF;
    
    -- Normalizar espacios múltiples a uno solo y convertir a minúsculas
    SET str = LOWER(TRIM(str));
    -- Reemplazar múltiples espacios por uno solo
    WHILE str LIKE '%  %' DO
        SET str = REPLACE(str, '  ', ' ');
    END WHILE;
    
    SET remaining = str;
    
    -- Procesar palabra por palabra
    WHILE remaining != '' AND iteration < max_iterations DO
        SET iteration = iteration + 1;
        
        -- Eliminar espacios al inicio
        SET remaining = TRIM(LEADING ' ' FROM remaining);
        
        IF remaining = '' THEN
            LEAVE;
        END IF;
        
        -- Buscar posición del primer espacio
        SET space_pos = LOCATE(' ', remaining);
        
        IF space_pos > 0 THEN
            -- Hay más palabras
            SET word = SUBSTRING(remaining, 1, space_pos - 1);
            SET remaining = SUBSTRING(remaining, space_pos + 1);
        ELSE
            -- Última palabra
            SET word = remaining;
            SET remaining = '';
        END IF;
        
        -- Capitalizar primera letra de la palabra (solo si tiene contenido)
        SET word = TRIM(word);
        IF LENGTH(word) > 0 THEN
            SET word = CONCAT(
                UPPER(SUBSTRING(word, 1, 1)),
                LOWER(SUBSTRING(word, 2))
            );
            
            -- Agregar a resultado
            IF result = '' THEN
                SET result = word;
            ELSE
                SET result = CONCAT(result, ' ', word);
            END IF;
        END IF;
    END WHILE;
    
    RETURN TRIM(result);
END$$

DELIMITER ;

-- =====================================================
-- ACTUALIZAR DATOS
-- =====================================================

-- Actualizar nombres
UPDATE alumnos 
SET nombres = CapitalizeWords(nombres)
WHERE nombres IS NOT NULL AND nombres != '';

-- Actualizar apellido_paterno
UPDATE alumnos 
SET apellido_paterno = CapitalizeWords(apellido_paterno)
WHERE apellido_paterno IS NOT NULL AND apellido_paterno != '';

-- Actualizar apellido_materno
UPDATE alumnos 
SET apellido_materno = CapitalizeWords(apellido_materno)
WHERE apellido_materno IS NOT NULL AND apellido_materno != '';

-- =====================================================
-- LIMPIAR: Eliminar función auxiliar
-- =====================================================

DROP FUNCTION IF EXISTS CapitalizeWords;

-- =====================================================
-- VERIFICACIÓN (Opcional - puedes ejecutarlo para ver resultados)
-- =====================================================

-- SELECT 
--     id,
--     nombres AS nombres_original,
--     apellido_paterno AS apellido_paterno_original,
--     apellido_materno AS apellido_materno_original
-- FROM alumnos
-- LIMIT 10;

