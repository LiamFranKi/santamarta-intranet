-- Indicadores de libreta inicial: alcance por bimestre o todo el año.
-- 0 = visible en los 4 bimestres (misma lista al imprimir cualquier bimestre).
-- 1–4 = solo ese bimestre (al imprimir/registrar ese ciclo se listan esos + los de alcance 0).
--
-- Ejecutar UNA VEZ en phpMyAdmin sobre la base del colegio.
-- Si la columna ya existe, omita el ALTER o coméntelo.

SET NAMES utf8mb4;

ALTER TABLE libreta_inicial_indicadores
  ADD COLUMN alcance_ciclo TINYINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT '0=todo el año (I–IV); 1–4=solo ese bimestre'
  AFTER orden;

-- Lo ya creado antes de esta migración: asignar a primer bimestre (solo bimestre I).
-- Si prefiere que sigan siendo "todo el año", ejecute en su lugar:
-- UPDATE libreta_inicial_indicadores SET alcance_ciclo = 0;
UPDATE libreta_inicial_indicadores SET alcance_ciclo = 1;
