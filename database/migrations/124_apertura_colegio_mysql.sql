-- Marca de apertura. Si ya hay un colegio, queda cerrado: no se puede crear otro encima.
INSERT INTO config (clave, valor)
SELECT 'apertura_completada', 'SI'
WHERE EXISTS (SELECT 1 FROM colegios LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM config WHERE clave = 'apertura_completada');
