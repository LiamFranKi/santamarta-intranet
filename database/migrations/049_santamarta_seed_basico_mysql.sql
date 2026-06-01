-- =============================================================================
-- Santa Marta Schools — datos mínimos (DESPUÉS de importar estructura vacía)
-- Ejecutar en phpMyAdmin → base de datos `santamarta` → pestaña SQL
-- Si algún INSERT falla por columnas NOT NULL, usa phpMyAdmin → Insertar fila
-- y completa los campos que marque como obligatorios.
-- =============================================================================

-- 1) Colegio
INSERT INTO colegios (
  nombre,
  titulo_intranet,
  anio_activo,
  anio_matriculas,
  bloquear_deudores,
  dias_tolerancia,
  ciclo_pensiones,
  inicio_pensiones,
  total_pensiones,
  ciclo_notas,
  inicio_notas,
  total_notas,
  moneda
) VALUES (
  'Santa Marta Schools',
  'Santa Marta Schools',
  2026,
  2026,
  'NO',
  5,
  4,
  2,
  10,
  4,
  1,
  4,
  'S/'
);

SET @colegio_id = LAST_INSERT_ID();

-- 2) Niveles (ajusta rangos si tu colegio es distinto)
INSERT INTO niveles (colegio_id, nombre, grado_minimo, grado_maximo, tipo_calificacion, tolerancia_minutos)
VALUES
  (@colegio_id, 'INICIAL', 3, 5, 0, 15),
  (@colegio_id, 'PRIMARIA', 1, 6, 1, 10),
  (@colegio_id, 'SECUNDARIA', 1, 5, 1, 10);

-- 3) Turno mañana (solo si existe columna colegio_id en turnos)
INSERT INTO turnos (colegio_id, nombre)
SELECT @colegio_id, 'Mañana'
FROM DUAL
WHERE EXISTS (
  SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'turnos' AND COLUMN_NAME = 'colegio_id'
)
AND NOT EXISTS (SELECT 1 FROM turnos WHERE colegio_id = @colegio_id AND nombre = 'Mañana');

-- Si turnos NO tiene colegio_id:
-- INSERT INTO turnos (nombre) SELECT 'Mañana' FROM DUAL
-- WHERE NOT EXISTS (SELECT 1 FROM turnos WHERE nombre = 'Mañana');

-- 4) Administrador inicial (opcional)
-- Login: DNI 00000000 | Clave temporal: password  (cámbiala al entrar)
INSERT INTO personal (
  colegio_id, nombres, apellidos, nro_documento, email, sexo, tipo_documento, cargo
) VALUES (
  @colegio_id,
  'Administrador',
  'Santa Marta',
  '00000000',
  'admin@santamarta.edu.pe',
  'M',
  'DNI',
  'Administrador'
);

SET @personal_id = LAST_INSERT_ID();

INSERT INTO usuarios (
  colegio_id, alumno_id, personal_id, apoderado_id,
  usuario, password, tipo, estado,
  ms_email, ms_access_token, ms_refresh_token, ms_id_token,
  auth_token, permisos, cambiar_password, app_terminos_aceptados, cambiar_datos
) VALUES (
  @colegio_id, 0, @personal_id, 0,
  '00000000',
  '5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8',
  'ADMINISTRADOR',
  'ACTIVO',
  '', '', '', '', '', '', 'SI', 'NO', 'NO'
);

-- =============================================================================
-- Después: Admin → Configuración (RUC, dirección, pensiones, rangos de notas)
--          Admin → Académico → crear grados/secciones del 2026
-- =============================================================================
