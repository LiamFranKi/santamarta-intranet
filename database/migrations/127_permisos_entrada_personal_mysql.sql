-- Permisos de hora de entrada del personal (generales o de una persona).
-- Si la tabla ya existe, no cambia nada.

CREATE TABLE IF NOT EXISTS personal_permisos_entrada (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  alcance ENUM('TODOS','DOCENTES','PERSONAL','INDIVIDUAL') NOT NULL,
  personal_id INT NULL,
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  hora_entrada TIME NOT NULL,
  hora_salida TIME NULL,
  nombre VARCHAR(120) NOT NULL DEFAULT '',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_permiso_entrada_colegio (colegio_id, fecha_desde, fecha_hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
