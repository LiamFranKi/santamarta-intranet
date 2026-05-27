-- Corrige pagos CANCELADOS con fecha_hora en 1970 (placeholder de cuotas pendientes).
-- El dashboard y deudores usan YEAR(fecha_hora) = año escolar; sin esto no suman como "Pagado".
-- Ejecutar en phpMyAdmin o cliente MySQL del VPS (hacer respaldo antes).

-- Vista previa (opcional):
-- SELECT COUNT(*) AS filas
-- FROM pagos
-- WHERE estado = 'ACTIVO' AND UPPER(TRIM(estado_pago)) = 'CANCELADO'
--   AND (fecha_hora IS NULL OR YEAR(fecha_hora) = 1970);

-- 1) CANCELADOS con fecha_cancelado válida → copiar esa fecha a fecha_hora
UPDATE pagos
SET fecha_hora = CONCAT(DATE(fecha_cancelado), ' 12:00:00')
WHERE estado = 'ACTIVO'
  AND UPPER(TRIM(estado_pago)) = 'CANCELADO'
  AND (fecha_hora IS NULL OR YEAR(fecha_hora) = 1970)
  AND fecha_cancelado IS NOT NULL
  AND YEAR(fecha_cancelado) >= 2000
  AND YEAR(fecha_cancelado) <> 1970;

-- 2) CANCELADOS que aún tengan 1970 → usar año del grupo (matrícula)
UPDATE pagos p
INNER JOIN matriculas m ON m.id = p.matricula_id
INNER JOIN grupos g ON g.id = m.grupo_id
SET p.fecha_hora = CONCAT(g.anio, '-06-01 12:00:00')
WHERE p.estado = 'ACTIVO'
  AND UPPER(TRIM(p.estado_pago)) = 'CANCELADO'
  AND (p.fecha_hora IS NULL OR YEAR(p.fecha_hora) = 1970);
