-- Ejemplos de categorías y áreas de Biblioteca (editables / eliminables desde el módulo).
-- Seguro de ejecutar más de una vez: no duplica el mismo nombre por colegio.

INSERT INTO biblioteca_categorias (colegio_id, nombre, activo, orden)
SELECT c.id, v.nombre, 1, v.orden
FROM colegios c
CROSS JOIN (
  SELECT 'Novela' AS nombre, 1 AS orden
  UNION ALL SELECT 'Cuento', 2
  UNION ALL SELECT 'Enciclopedia', 3
  UNION ALL SELECT 'Diccionario', 4
  UNION ALL SELECT 'Cómic', 5
  UNION ALL SELECT 'Texto escolar', 6
  UNION ALL SELECT 'Revista', 7
  UNION ALL SELECT 'Biografía', 8
  UNION ALL SELECT 'Atlas', 9
  UNION ALL SELECT 'Poesía', 10
) v
WHERE NOT EXISTS (
  SELECT 1 FROM biblioteca_categorias x
  WHERE x.colegio_id = c.id AND x.nombre = v.nombre
);

INSERT INTO biblioteca_areas (colegio_id, nombre, activo, orden)
SELECT c.id, v.nombre, 1, v.orden
FROM colegios c
CROSS JOIN (
  SELECT 'Matemática' AS nombre, 1 AS orden
  UNION ALL SELECT 'Comunicación', 2
  UNION ALL SELECT 'Ciencia', 3
  UNION ALL SELECT 'Historia', 4
  UNION ALL SELECT 'Inglés', 5
  UNION ALL SELECT 'Arte', 6
  UNION ALL SELECT 'Religión', 7
  UNION ALL SELECT 'Educación Física', 8
  UNION ALL SELECT 'Informática', 9
  UNION ALL SELECT 'General', 10
) v
WHERE NOT EXISTS (
  SELECT 1 FROM biblioteca_areas x
  WHERE x.colegio_id = c.id AND x.nombre = v.nombre
);
