-- Nombre, muñeco principal y dibujos de las fichas, por colegio.
-- Si el nombre queda vacío, la intranet sigue diciendo Vanguarcito.
-- Si no hay imagen, se usa el dibujo que ya está en el servidor.
-- No toca sesiones, notas ni fichas ya generadas.

CREATE TABLE IF NOT EXISTS mascota_colegio (
  colegio_id INT NOT NULL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL DEFAULT '',
  imagen VARCHAR(255) NOT NULL DEFAULT '',
  actualizado_en DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mascota_ficha_imagen (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  archivo VARCHAR(255) NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  KEY idx_mascota_ficha_colegio (colegio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
