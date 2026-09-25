-- Pedidos del personal (docentes y administrativos), además de alumnos.
-- Ejecutar si ya corriste 111_kiosco_cafetin_mysql.sql.

ALTER TABLE kiosco_pedidos
  MODIFY alumno_id INT NULL,
  ADD COLUMN cliente_usuario_id INT NULL AFTER alumno_id;

ALTER TABLE kiosco_config
  ADD COLUMN pide_personal TINYINT(1) NOT NULL DEFAULT 1 AFTER quien_pide;
