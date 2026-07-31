-- Biométrico Hikvision: código de empleado en personal + log de eventos HTTP.
-- Ejecutar UNA VEZ en vanguard_intranet.

ALTER TABLE personal
  ADD COLUMN codigo_biometrico VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'ID empleado en huellero Hikvision (employeeNo); si vacío se intenta DNI'
  AFTER nro_documento;

CREATE TABLE IF NOT EXISTS biometrico_eventos_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT UNSIGNED NOT NULL,
  dispositivo_ip VARCHAR(64) NULL,
  employee_no VARCHAR(64) NULL,
  personal_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  fecha DATE NULL,
  hora_marcacion TIME NULL,
  metodo_verificacion VARCHAR(80) NULL,
  nombre_evento VARCHAR(120) NULL,
  estado ENUM('OK','OMITIDO','ERROR','DUPLICADO') NOT NULL DEFAULT 'OK',
  detalle VARCHAR(500) NULL,
  payload_resumen TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bio_colegio_creado (colegio_id, created_at),
  KEY idx_bio_employee (colegio_id, employee_no),
  KEY idx_bio_personal_fecha (personal_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
