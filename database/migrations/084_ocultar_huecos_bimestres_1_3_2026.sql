-- Una sola vez (2026): quitar huecos vacíos de Bimestre 1, 2 y 3.
-- No toca filas que ya tienen archivo o enlace.
-- Ejecutar en MySQL (phpMyAdmin o CLI). El código también oculta estos huecos en 2026.

SET NAMES utf8mb4;

DELETE aa
FROM asignaturas_archivos aa
INNER JOIN asignaturas a ON a.id = aa.asignatura_id
INNER JOIN grupos g ON g.id = a.grupo_id
WHERE g.anio = 2026
  AND aa.ciclo IN (1, 2, 3)
  AND (aa.archivo IS NULL OR TRIM(aa.archivo) = '')
  AND (aa.enlace IS NULL OR TRIM(aa.enlace) = '')
  AND (
    aa.item_tipo IN ('TEMA', 'FICHA')
    OR aa.nombre REGEXP '^(Tema|Ficha)[[:space:]]+[0-9]+$'
  );
