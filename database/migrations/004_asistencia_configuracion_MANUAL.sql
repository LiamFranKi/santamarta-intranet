-- ============================================================
-- SQL PARA EJECUTAR MANUALMENTE EN phpMyAdmin
-- Configuración de Asistencia: Agregar hora_entrada y tolerancia a niveles
-- Agregar campos faltantes a matriculas_asistencias
-- ============================================================

-- PASO 1: Agregar campo hora_entrada a niveles (si no existe)
ALTER TABLE `niveles` 
ADD COLUMN `hora_entrada` time DEFAULT '08:00:00' COMMENT 'Hora de entrada para este nivel';

-- PASO 2: Agregar campo tolerancia a niveles (si no existe)
-- Tolerancia en minutos: cuántos minutos después de la hora de entrada se considera PRESENTE
ALTER TABLE `niveles` 
ADD COLUMN `tolerancia_minutos` int(11) DEFAULT 5 COMMENT 'Tolerancia en minutos para considerar PRESENTE (por defecto 5 minutos)';

-- PASO 3: Agregar campos faltantes a matriculas_asistencias (si no existen)
-- Verificar si los campos ya existen antes de agregarlos
ALTER TABLE `matriculas_asistencias` 
ADD COLUMN `hora_entrada` time DEFAULT NULL COMMENT 'Hora de entrada registrada';

ALTER TABLE `matriculas_asistencias` 
ADD COLUMN `hora_salida` time DEFAULT NULL COMMENT 'Hora de salida registrada';

ALTER TABLE `matriculas_asistencias` 
ADD COLUMN `observaciones` text DEFAULT NULL COMMENT 'Observaciones adicionales';

-- PASO 4: Configurar horas de entrada y tolerancia por nivel (AJUSTAR SEGÚN TU COLEGIO)
-- Ejemplo: PRIMARIA entra a las 07:20 con 5 minutos de tolerancia
-- UPDATE `niveles` SET `hora_entrada` = '07:20:00', `tolerancia_minutos` = 5 WHERE `nombre` LIKE '%PRIMARIA%' OR `abreviatura` = 'PRIM';
-- 
-- Ejemplo: INICIAL entra a las 08:00 con 5 minutos de tolerancia
-- UPDATE `niveles` SET `hora_entrada` = '08:00:00', `tolerancia_minutos` = 5 WHERE `nombre` LIKE '%INICIAL%' OR `abreviatura` = 'INIC';
-- 
-- Ejemplo: SECUNDARIA entra a las 07:30 con 10 minutos de tolerancia
-- UPDATE `niveles` SET `hora_entrada` = '07:30:00', `tolerancia_minutos` = 10 WHERE `nombre` LIKE '%SECUNDARIA%' OR `abreviatura` = 'SEC';

