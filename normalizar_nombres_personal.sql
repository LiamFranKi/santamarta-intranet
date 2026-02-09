-- =====================================================
-- Script SQL para Normalizar Nombres y Apellidos
-- Tabla: personal
-- Campos: nombres, apellidos
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

UPDATE personal 
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
-- ACTUALIZAR APELLIDOS
-- =====================================================

UPDATE personal 
SET apellidos = TRIM(CONCAT(
    CONCAT(
        UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellidos, ' ', 1))), 1, 1)),
        LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(apellidos, ' ', 1))), 2))
    ),
    IF(CHAR_LENGTH(apellidos) - CHAR_LENGTH(REPLACE(apellidos, ' ', '')) >= 1,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 2), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 2), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(apellidos) - CHAR_LENGTH(REPLACE(apellidos, ' ', '')) >= 2,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 3), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 3), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(apellidos) - CHAR_LENGTH(REPLACE(apellidos, ' ', '')) >= 3,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 4), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 4), ' ', -1))), 2))
            )
        ), ''),
    IF(CHAR_LENGTH(apellidos) - CHAR_LENGTH(REPLACE(apellidos, ' ', '')) >= 4,
        CONCAT(' ', 
            CONCAT(
                UPPER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 5), ' ', -1))), 1, 1)),
                LOWER(SUBSTRING(LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(apellidos, ' ', 5), ' ', -1))), 2))
            )
        ), '')
))
WHERE apellidos IS NOT NULL AND apellidos != '';

-- =====================================================
-- VERIFICACIÓN (Opcional - descomenta para ver resultados)
-- =====================================================

-- SELECT 
--     id,
--     nombres,
--     apellidos
-- FROM personal
-- LIMIT 20;

