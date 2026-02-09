-- =====================================================
-- Script SQL para Normalizar Nombres y Apellidos
-- Tabla: apoderados
-- Campos: nombres, apellido_paterno, apellido_materno
-- 
-- Formato: Primera letra de cada palabra en mayúscula,
--          resto en minúscula
-- Ejemplo: "JOSE LUIS" → "Jose Luis"
--          "PEREZ" → "Perez"
--          "GARCIA LOPEZ" → "Garcia Lopez"
-- 
-- INSTRUCCIONES PARA phpMyAdmin:
-- 1. Copia TODO este script
-- 2. Pégalo en la pestaña SQL de phpMyAdmin
-- 3. Ejecuta todo de una vez
-- =====================================================

-- SOLUCIÓN SIMPLE: Usar UPDATE directo con funciones SQL nativas
-- Esta versión maneja hasta 5 palabras (suficiente para nombres)

-- =====================================================
-- ACTUALIZAR NOMBRES
-- =====================================================

UPDATE apoderados 
SET nombres = TRIM(CONCAT(
    CONCAT(
        UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(nombres, ' ', 1))), 1, 1)),
        LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(nombres, ' ', 1))), 2))
    ),
    IF(CHAR_LENGTH(nombres) - CHAR_LENGTH(REPLACE(nombres, ' ', '')) >= 1,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 2), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 2), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(nombres) - CHAR_LENGTH(REPLACE(nombres, ' ', '')) >= 2,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 3), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 3), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(nombres) - CHAR_LENGTH(REPLACE(nombres, ' ', '')) >= 3,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 4), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 4), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(nombres) - CHAR_LENGTH(REPLACE(nombres, ' ', '')) >= 4,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 5), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(nombres, ' ', 5), ' ', -1))), 2))
            )
        ), '')
))
WHERE nombres IS NOT NULL AND nombres != '';

-- =====================================================
-- ACTUALIZAR APELLIDO_PATERNO
-- =====================================================

UPDATE apoderados 
SET apellido_paterno = TRIM(CONCAT(
    CONCAT(
        UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellido_paterno, ' ', 1))), 1, 1)),
        LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellido_paterno, ' ', 1))), 2))
    ),
    IF(CHAR_LENGTH(apellido_paterno) - CHAR_LENGTH(REPLACE(apellido_paterno, ' ', '')) >= 1,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_paterno, ' ', 2), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_paterno, ' ', 2), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(apellido_paterno) - CHAR_LENGTH(REPLACE(apellido_paterno, ' ', '')) >= 2,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_paterno, ' ', 3), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_paterno, ' ', 3), ' ', -1))), 2))
            )
        ), '')
))
WHERE apellido_paterno IS NOT NULL AND apellido_paterno != '';

-- =====================================================
-- ACTUALIZAR APELLIDO_MATERNO
-- =====================================================

UPDATE apoderados 
SET apellido_materno = TRIM(CONCAT(
    CONCAT(
        UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellido_materno, ' ', 1))), 1, 1)),
        LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellido_materno, ' ', 1))), 2))
    ),
    IF(CHAR_LENGTH(apellido_materno) - CHAR_LENGTH(REPLACE(apellido_materno, ' ', '')) >= 1,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_materno, ' ', 2), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_materno, ' ', 2), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(apellido_materno) - CHAR_LENGTH(REPLACE(apellido_materno, ' ', '')) >= 2,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_materno, ' ', 3), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellido_materno, ' ', 3), ' ', -1))), 2))
            )
        ), '')
))
WHERE apellido_materno IS NOT NULL AND apellido_materno != '';

-- =====================================================
-- VERIFICACIÓN (Opcional - descomenta para ver resultados)
-- =====================================================

-- SELECT 
--     id,
--     nombres,
--     apellido_paterno,
--     apellido_materno
-- FROM apoderados
-- LIMIT 20;

