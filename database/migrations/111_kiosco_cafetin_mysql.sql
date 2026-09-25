-- Perfil Kiosco y tienda del cafetín. Ejecutar en phpMyAdmin.
-- Si el ENUM de usuarios.tipo en tu base tiene valores distintos, ajusta la lista antes de correr el ALTER.

ALTER TABLE usuarios
  MODIFY tipo ENUM(
    'ADMINISTRADOR','DIRECTOR','ALUMNO','APODERADO','DOCENTE','AUXILIAR','SECRETARIA',
    'CAJERO','ENFERMERA','PROMOTORIA','COORDINADOR','PSICOLOGA','ASISTENCIA','CONTADOR',
    'TUTOR','MANTENIMIENTO','SUPERADMINISTRADOR','KIOSCO'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS kiosco_config (
  colegio_id INT NOT NULL PRIMARY KEY,
  quien_pide ENUM('APODERADO','ALUMNO','AMBOS') NOT NULL DEFAULT 'AMBOS',
  limite_activo TINYINT(1) NOT NULL DEFAULT 0,
  limite_monto DECIMAL(10,2) NOT NULL DEFAULT 0,
  corte_activo TINYINT(1) NOT NULL DEFAULT 0,
  corte_hora TIME NULL,
  comida_activa TINYINT(1) NOT NULL DEFAULT 1,
  fiado_activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kiosco_categorias (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  emoji VARCHAR(16) NOT NULL DEFAULT '🍽️',
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_kiosco_cat (colegio_id, activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kiosco_productos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  categoria_id INT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NOT NULL DEFAULT '',
  precio DECIMAL(10,2) NOT NULL DEFAULT 0,
  emoji VARCHAR(16) NOT NULL DEFAULT '🥤',
  imagen_url VARCHAR(500) NOT NULL DEFAULT '',
  siempre TINYINT(1) NOT NULL DEFAULT 1,
  es_comida TINYINT(1) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_kiosco_prod (colegio_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kiosco_carta (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  fecha DATE NOT NULL,
  UNIQUE KEY uq_kiosco_carta (producto_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kiosco_pedidos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  alumno_id INT NOT NULL,
  usuario_id INT NULL,
  codigo VARCHAR(12) NOT NULL,
  fecha_consumo DATE NOT NULL,
  estado ENUM('pedido','aceptado','rechazado','entregado') NOT NULL DEFAULT 'pedido',
  pago ENUM('pagado','pendiente','fiado') NOT NULL DEFAULT 'pendiente',
  origen ENUM('linea','mostrador') NOT NULL DEFAULT 'linea',
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  nota VARCHAR(255) NOT NULL DEFAULT '',
  creado_en DATETIME NOT NULL,
  KEY idx_kiosco_ped (colegio_id, estado, fecha_consumo),
  KEY idx_kiosco_ped_alumno (alumno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kiosco_pedido_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  producto_id INT NULL,
  nombre VARCHAR(120) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  KEY idx_kiosco_item (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
