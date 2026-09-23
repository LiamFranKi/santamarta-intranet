-- Interruptores de módulos. Si no hay fila, el sistema usa el valor de fábrica
-- (encendido, salvo los que ya estaban ocultos en el menú).
CREATE TABLE IF NOT EXISTS modulos_sistema (
  clave VARCHAR(80) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
