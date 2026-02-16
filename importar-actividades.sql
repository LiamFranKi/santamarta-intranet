-- ============================================================
-- SCRIPT SQL PARA IMPORTAR ACTIVIDADES DESDE calendarizacion.json
-- Año: 2026
-- ============================================================
-- 
-- INSTRUCCIONES:
-- 1. Revisa y ajusta el valor de @colegio_id abajo (por defecto: 1)
-- 2. Ejecuta este script completo en phpMyAdmin
-- 3. Todas las actividades se insertarán con lugar "Colegio Vanguard"
-- 4. El script evita duplicados automáticamente
--
-- ============================================================

-- Configurar variables
SET @colegio_id = 1;  -- ⚠️ CAMBIA ESTE VALOR SEGÚN TU BASE DE DATOS
SET @usuario_id = (SELECT id FROM usuarios WHERE tipo IN ('ADMINISTRADOR', 'DOCENTE', 'DIRECTOR') AND estado = 'ACTIVO' AND colegio_id = @colegio_id LIMIT 1);
SET @año = 2026;
SET @lugar = 'Colegio Vanguard';

-- Verificar que tenemos usuario_id
SELECT IF(@usuario_id IS NULL, 'ERROR: No se encontró usuario válido', CONCAT('OK: Usuario ID = ', @usuario_id)) as verificacion;

-- ============================================================
-- INICIO DE INSERTS
-- ============================================================

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "REUNIÓN PPFF\n(INICIAL Y PRIMARIA)", @lugar, "reunion", "2026-03-04 00:00:00", "2026-03-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "REUNIÓN PPFF\n(INICIAL Y PRIMARIA)" 
    AND DATE(fecha_inicio) = DATE("2026-03-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "REUNIÓN PPFF\n(SECUNDARIA)", @lugar, "reunion", "2026-03-05 00:00:00", "2026-03-05 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "REUNIÓN PPFF\n(SECUNDARIA)" 
    AND DATE(fecha_inicio) = DATE("2026-03-05 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-05 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "PRIMER DIA EN\nVANGUARD SCHOOLS", @lugar, "inicio", "2026-03-06 00:00:00", "2026-03-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "PRIMER DIA EN\nVANGUARD SCHOOLS" 
    AND DATE(fecha_inicio) = DATE("2026-03-06 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DE LA MUJER", @lugar, "feriado", "2026-03-08 00:00:00", "2026-03-08 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DE LA MUJER" 
    AND DATE(fecha_inicio) = DATE("2026-03-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-08 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-03-09 00:00:00", "2026-03-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-03-09 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INICIO DE CLASES", @lugar, "inicio", "2026-03-09 00:00:00", "2026-03-09 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INICIO DE CLASES" 
    AND DATE(fecha_inicio) = DATE("2026-03-09 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-09 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-03-16 00:00:00", "2026-03-20 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-03-16 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-20 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA INTERNACIONAL\nDEL SÍNDROME DE DOWN", @lugar, "feriado", "2026-03-21 00:00:00", "2026-03-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA INTERNACIONAL\nDEL SÍNDROME DE DOWN" 
    AND DATE(fecha_inicio) = DATE("2026-03-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-03-23 00:00:00", "2026-03-27 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-03-23 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-27 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-03-26 00:00:00", "2026-03-27 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-03-26 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-27 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-03-30 00:00:00", "2026-03-31 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-03-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-31 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-03-30 00:00:00", "2026-03-31 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-03-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-03-31 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-04-01 00:00:00", "2026-04-01 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-04-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-01 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-04-01 00:00:00", "2026-04-01 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-04-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-01 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "JUEVES SANTO", @lugar, "feriado", "2026-04-02 00:00:00", "2026-04-02 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "JUEVES SANTO" 
    AND DATE(fecha_inicio) = DATE("2026-04-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-02 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA MUNDIAL\nDEl AUTISMO", @lugar, "evento", "2026-04-02 00:00:00", "2026-04-02 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA MUNDIAL\nDEl AUTISMO" 
    AND DATE(fecha_inicio) = DATE("2026-04-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-02 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VIERNES SANTO", @lugar, "feriado", "2026-04-03 00:00:00", "2026-04-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VIERNES SANTO" 
    AND DATE(fecha_inicio) = DATE("2026-04-03 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SÁBADO SANTO", @lugar, "feriado", "2026-04-04 00:00:00", "2026-04-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SÁBADO SANTO" 
    AND DATE(fecha_inicio) = DATE("2026-04-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DOMINGO DE RAMOS", @lugar, "feriado", "2026-04-05 00:00:00", "2026-04-05 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DOMINGO DE RAMOS" 
    AND DATE(fecha_inicio) = DATE("2026-04-05 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-05 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-04-06 00:00:00", "2026-04-08 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-04-06 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-08 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-04-09 00:00:00", "2026-04-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-04-09 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA MUNDIAL DE LA\nACTIVIDAD FÍSICA", @lugar, "evento", "2026-04-06 00:00:00", "2026-04-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA MUNDIAL DE LA\nACTIVIDAD FÍSICA" 
    AND DATE(fecha_inicio) = DATE("2026-04-06 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-04-13 00:00:00", "2026-04-15 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-04-13 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-15 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-04-16 00:00:00", "2026-04-17 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-04-16 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-17 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-04-20 00:00:00", "2026-04-24 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-04-20 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-24 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-04-20 00:00:00", "2026-04-22 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-04-20 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-22 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-04-23 00:00:00", "2026-04-24 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-04-23 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-24 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-04-27 00:00:00", "2026-04-29 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-04-27 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-29 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMENES\nBIMESTRALES", @lugar, "examen", "2026-04-30 00:00:00", "2026-04-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-04-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-04-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL TRABAJADOR", @lugar, "feriado", "2026-05-01 00:00:00", "2026-05-01 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL TRABAJADOR" 
    AND DATE(fecha_inicio) = DATE("2026-05-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-01 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA INTERNACIONAL\nCONTRA EL ACOSO\nESCOLAR", @lugar, "evento", "2026-05-02 00:00:00", "2026-05-02 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA INTERNACIONAL\nCONTRA EL ACOSO\nESCOLAR" 
    AND DATE(fecha_inicio) = DATE("2026-05-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-02 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-05-04 00:00:00", "2026-05-07 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-05-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-07 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EVENTO DÍA\nDE LA MADRE\nNO HAY CLASES", @lugar, "evento", "2026-05-08 00:00:00", "2026-05-08 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EVENTO DÍA\nDE LA MADRE\nNO HAY CLASES" 
    AND DATE(fecha_inicio) = DATE("2026-05-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-08 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DE LA MADRE", @lugar, "feriado", "2026-05-10 00:00:00", "2026-05-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DE LA MADRE" 
    AND DATE(fecha_inicio) = DATE("2026-05-10 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA DE RECESO ESTUDIANTES", @lugar, "receso", "2026-05-11 00:00:00", "2026-05-15 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA DE RECESO ESTUDIANTES" 
    AND DATE(fecha_inicio) = DATE("2026-05-11 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-15 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INICIO DE II BIMESTRE", @lugar, "inicio", "2026-05-18 00:00:00", "2026-05-18 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INICIO DE II BIMESTRE" 
    AND DATE(fecha_inicio) = DATE("2026-05-18 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-18 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-05-18 00:00:00", "2026-05-22 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-05-18 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-22 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-05-25 00:00:00", "2026-05-29 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-05-25 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-29 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA DE LA\nEDUCACIÓN INICIAL", @lugar, "evento", "2026-05-25 00:00:00", "2026-05-29 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA DE LA\nEDUCACIÓN INICIAL" 
    AND DATE(fecha_inicio) = DATE("2026-05-25 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-29 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DIA MUNDIAL DEL\nNO FUMADOR", @lugar, "feriado", "2026-05-31 00:00:00", "2026-05-31 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DIA MUNDIAL DEL\nNO FUMADOR" 
    AND DATE(fecha_inicio) = DATE("2026-05-31 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-05-31 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-06-01 00:00:00", "2026-06-05 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-06-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-05 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 1", @lugar, "tema", "2026-06-01 00:00:00", "2026-06-05 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 1" 
    AND DATE(fecha_inicio) = DATE("2026-06-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-05 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "CELEBRAMOS\nA NUESTRA BANDERA", @lugar, "evento", "2026-06-01 00:00:00", "2026-06-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "CELEBRAMOS\nA NUESTRA BANDERA" 
    AND DATE(fecha_inicio) = DATE("2026-06-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA INTERNACIONAL\nDE LOS NIÑOS\nVÍCTIMAS INOCENTES\nDE AGRESIÓN", @lugar, "evento", "2026-06-04 00:00:00", "2026-06-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA INTERNACIONAL\nDE LOS NIÑOS\nVÍCTIMAS INOCENTES\nDE AGRESIÓN" 
    AND DATE(fecha_inicio) = DATE("2026-06-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DE LA BANDERA", @lugar, "feriado", "2026-06-07 00:00:00", "2026-06-07 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DE LA BANDERA" 
    AND DATE(fecha_inicio) = DATE("2026-06-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-07 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-06-08 00:00:00", "2026-06-12 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-06-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-12 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-06-08 00:00:00", "2026-06-12 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-06-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-12 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA MUNDIAL CONTRA\nEL TRABAJO INFANTIL", @lugar, "evento", "2026-06-12 00:00:00", "2026-06-12 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA MUNDIAL CONTRA\nEL TRABAJO INFANTIL" 
    AND DATE(fecha_inicio) = DATE("2026-06-12 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-12 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-06-15 00:00:00", "2026-06-19 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-06-15 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-19 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EVENTO DÍA\nDEL PADRE\nNO HAY CLASES", @lugar, "evento", "2026-06-19 00:00:00", "2026-06-19 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EVENTO DÍA\nDEL PADRE\nNO HAY CLASES" 
    AND DATE(fecha_inicio) = DATE("2026-06-19 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-19 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL PADRE", @lugar, "feriado", "2026-06-21 00:00:00", "2026-06-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL PADRE" 
    AND DATE(fecha_inicio) = DATE("2026-06-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-06-22 00:00:00", "2026-06-22 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-06-22 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-22 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-06-22 00:00:00", "2026-06-26 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-06-22 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-26 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 2", @lugar, "tema", "2026-06-22 00:00:00", "2026-06-26 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 2" 
    AND DATE(fecha_inicio) = DATE("2026-06-22 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-26 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INTI RAYMI\nDÍA DEL CAMPESINO", @lugar, "feriado", "2026-06-24 00:00:00", "2026-06-24 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INTI RAYMI\nDÍA DEL CAMPESINO" 
    AND DATE(fecha_inicio) = DATE("2026-06-24 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-24 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA INTERNACIONAL DE\nLA LUCHA CONTRA EL\nUSO INDEBIDO Y EL\nTRÁFICO ILÍCITO DE DROGAS", @lugar, "evento", "2026-06-26 00:00:00", "2026-06-26 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA INTERNACIONAL DE\nLA LUCHA CONTRA EL\nUSO INDEBIDO Y EL\nTRÁFICO ILÍCITO DE DROGAS" 
    AND DATE(fecha_inicio) = DATE("2026-06-26 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-26 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO\nSAN PEDRO Y SAN PABLO", @lugar, "feriado", "2026-06-29 00:00:00", "2026-06-29 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO\nSAN PEDRO Y SAN PABLO" 
    AND DATE(fecha_inicio) = DATE("2026-06-29 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-29 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-06-30 00:00:00", "2026-06-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-06-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-06-30 00:00:00", "2026-06-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-06-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-06-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-07-01 00:00:00", "2026-07-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-07-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-07-01 00:00:00", "2026-07-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-07-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INAGURACIÓN\nOLIMPIADAS\nVANGUARDINAS", @lugar, "evento", "2026-07-04 00:00:00", "2026-07-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INAGURACIÓN\nOLIMPIADAS\nVANGUARDINAS" 
    AND DATE(fecha_inicio) = DATE("2026-07-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO\nDIA DEL MAESTRO", @lugar, "feriado", "2026-07-06 00:00:00", "2026-07-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO\nDIA DEL MAESTRO" 
    AND DATE(fecha_inicio) = DATE("2026-07-06 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL\nLOGRO 01", @lugar, "evento", "2026-07-07 00:00:00", "2026-07-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL\nLOGRO 01" 
    AND DATE(fecha_inicio) = DATE("2026-07-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-07-07 00:00:00", "2026-07-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-07-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL\nLOGRO 01", @lugar, "evento", "2026-07-13 00:00:00", "2026-07-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL\nLOGRO 01" 
    AND DATE(fecha_inicio) = DATE("2026-07-13 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-07-13 00:00:00", "2026-07-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-07-13 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-07-14 00:00:00", "2026-07-17 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-07-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-17 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-07-20 00:00:00", "2026-07-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-07-20 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA DE RECESO", @lugar, "receso", "2026-07-22 00:00:00", "2026-07-24 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA DE RECESO" 
    AND DATE(fecha_inicio) = DATE("2026-07-22 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-24 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA DE RECESO", @lugar, "receso", "2026-07-27 00:00:00", "2026-07-31 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA DE RECESO" 
    AND DATE(fecha_inicio) = DATE("2026-07-27 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-31 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DIA DE LA \nFUERZA AEREA \nDEL PERÚ", @lugar, "feriado", "2026-07-23 00:00:00", "2026-07-23 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DIA DE LA \nFUERZA AEREA \nDEL PERÚ" 
    AND DATE(fecha_inicio) = DATE("2026-07-23 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-23 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FIESTAS PATRIAS", @lugar, "feriado", "2026-07-28 00:00:00", "2026-07-29 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FIESTAS PATRIAS" 
    AND DATE(fecha_inicio) = DATE("2026-07-28 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-07-29 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INICIO DE III BIMESTRE", @lugar, "inicio", "2026-08-03 00:00:00", "2026-08-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INICIO DE III BIMESTRE" 
    AND DATE(fecha_inicio) = DATE("2026-08-03 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-08-03 00:00:00", "2026-08-05 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-08-03 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-05 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-08-07 00:00:00", "2026-08-07 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-08-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-07 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO\nBATALLA DE JUNIN", @lugar, "feriado", "2026-08-06 00:00:00", "2026-08-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO\nBATALLA DE JUNIN" 
    AND DATE(fecha_inicio) = DATE("2026-08-06 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-08-10 00:00:00", "2026-08-12 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-08-10 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-12 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-08-13 00:00:00", "2026-08-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-08-13 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-08-14 00:00:00", "2026-08-14 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-08-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-14 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-08-17 00:00:00", "2026-08-19 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-08-17 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-19 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-08-20 00:00:00", "2026-08-20 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-08-20 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-20 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-08-21 00:00:00", "2026-08-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-08-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 1", @lugar, "tema", "2026-08-17 00:00:00", "2026-08-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 1" 
    AND DATE(fecha_inicio) = DATE("2026-08-17 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL NIÑO", @lugar, "evento", "2026-08-17 00:00:00", "2026-08-19 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL NIÑO" 
    AND DATE(fecha_inicio) = DATE("2026-08-17 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-19 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-08-24 00:00:00", "2026-08-28 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-08-24 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-28 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-08-24 00:00:00", "2026-08-26 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-08-24 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-26 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-08-27 00:00:00", "2026-08-27 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-08-27 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-27 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-08-28 00:00:00", "2026-08-28 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-08-28 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-28 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-08-31 00:00:00", "2026-08-31 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-08-31 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-08-31 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-09-01 00:00:00", "2026-09-02 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-09-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-02 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-09-03 00:00:00", "2026-09-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-09-03 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-09-04 00:00:00", "2026-09-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-09-04 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-09-07 00:00:00", "2026-09-09 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-09-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-09 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-09-10 00:00:00", "2026-09-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-09-10 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-09-11 00:00:00", "2026-09-11 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-09-11 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-11 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 2", @lugar, "tema", "2026-09-07 00:00:00", "2026-09-11 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 2" 
    AND DATE(fecha_inicio) = DATE("2026-09-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-11 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DE LA FAMILIA", @lugar, "evento", "2026-09-13 00:00:00", "2026-09-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DE LA FAMILIA" 
    AND DATE(fecha_inicio) = DATE("2026-09-13 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-09-14 00:00:00", "2026-09-16 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-09-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-16 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-09-17 00:00:00", "2026-09-17 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-09-17 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-17 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-09-18 00:00:00", "2026-09-18 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-09-18 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-18 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-09-14 00:00:00", "2026-09-18 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-09-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-18 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-09-21 00:00:00", "2026-09-25 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-09-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-25 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL ALZHEIMER", @lugar, "evento", "2026-09-21 00:00:00", "2026-09-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL ALZHEIMER" 
    AND DATE(fecha_inicio) = DATE("2026-09-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA DE LA\nPRIMAVERA", @lugar, "evento", "2026-09-22 00:00:00", "2026-09-25 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA DE LA\nPRIMAVERA" 
    AND DATE(fecha_inicio) = DATE("2026-09-22 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-25 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "OLIMPIADAS VANGUARD", @lugar, "evento", "2026-09-26 00:00:00", "2026-09-26 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "OLIMPIADAS VANGUARD" 
    AND DATE(fecha_inicio) = DATE("2026-09-26 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-26 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-09-28 00:00:00", "2026-09-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-09-28 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-09-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN BIMESTRAL", @lugar, "examen", "2026-10-01 00:00:00", "2026-10-02 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN BIMESTRAL" 
    AND DATE(fecha_inicio) = DATE("2026-10-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-02 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA RECESO", @lugar, "receso", "2026-10-05 00:00:00", "2026-10-09 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA RECESO" 
    AND DATE(fecha_inicio) = DATE("2026-10-05 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-09 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO\nCOMBATE DE ANGAMOS", @lugar, "feriado", "2026-10-08 00:00:00", "2026-10-08 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO\nCOMBATE DE ANGAMOS" 
    AND DATE(fecha_inicio) = DATE("2026-10-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-08 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DIA MUNDIAL DE LA\nSALUD MENTAL", @lugar, "evento", "2026-10-10 00:00:00", "2026-10-10 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DIA MUNDIAL DE LA\nSALUD MENTAL" 
    AND DATE(fecha_inicio) = DATE("2026-10-10 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-10 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "INICIO DE IV BIMESTRE", @lugar, "inicio", "2026-10-11 00:00:00", "2026-10-11 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "INICIO DE IV BIMESTRE" 
    AND DATE(fecha_inicio) = DATE("2026-10-11 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-11 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 1", @lugar, "tema", "2026-10-12 00:00:00", "2026-10-16 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 1" 
    AND DATE(fecha_inicio) = DATE("2026-10-12 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-16 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA MUNDIAL DE LA\nEDUCACIÓN INCLUSIVA", @lugar, "evento", "2026-10-16 00:00:00", "2026-10-16 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA MUNDIAL DE LA\nEDUCACIÓN INCLUSIVA" 
    AND DATE(fecha_inicio) = DATE("2026-10-16 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-16 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 2", @lugar, "tema", "2026-10-19 00:00:00", "2026-10-23 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 2" 
    AND DATE(fecha_inicio) = DATE("2026-10-19 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-23 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 3", @lugar, "tema", "2026-10-26 00:00:00", "2026-10-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 3" 
    AND DATE(fecha_inicio) = DATE("2026-10-26 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 1", @lugar, "tema", "2026-10-26 00:00:00", "2026-10-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 1" 
    AND DATE(fecha_inicio) = DATE("2026-10-26 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-10-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO DÍA DE\n TODOS LOS SANTOS", @lugar, "feriado", "2026-11-01 00:00:00", "2026-11-01 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO DÍA DE\n TODOS LOS SANTOS" 
    AND DATE(fecha_inicio) = DATE("2026-11-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-01 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 1", @lugar, "examen", "2026-11-02 00:00:00", "2026-11-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 1" 
    AND DATE(fecha_inicio) = DATE("2026-11-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 4", @lugar, "tema", "2026-11-02 00:00:00", "2026-11-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 4" 
    AND DATE(fecha_inicio) = DATE("2026-11-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "SEMANA NACIONAL\n FORESTAL", @lugar, "evento", "2026-11-02 00:00:00", "2026-11-06 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "SEMANA NACIONAL\n FORESTAL" 
    AND DATE(fecha_inicio) = DATE("2026-11-02 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-06 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 5", @lugar, "tema", "2026-11-09 00:00:00", "2026-11-13 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 5" 
    AND DATE(fecha_inicio) = DATE("2026-11-09 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-13 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ANIVERSARIO\nVANGUARD INICIAL-\nPRIMARIA Y SECUNDARIA", @lugar, "evento", "2026-11-14 00:00:00", "2026-11-14 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ANIVERSARIO\nVANGUARD INICIAL-\nPRIMARIA Y SECUNDARIA" 
    AND DATE(fecha_inicio) = DATE("2026-11-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-14 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 6", @lugar, "tema", "2026-11-16 00:00:00", "2026-11-20 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 6" 
    AND DATE(fecha_inicio) = DATE("2026-11-16 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-20 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "VOCABULARIO 2", @lugar, "tema", "2026-11-16 00:00:00", "2026-11-20 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "VOCABULARIO 2" 
    AND DATE(fecha_inicio) = DATE("2026-11-16 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-20 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXAMEN 2", @lugar, "examen", "2026-11-23 00:00:00", "2026-11-27 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXAMEN 2" 
    AND DATE(fecha_inicio) = DATE("2026-11-23 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-27 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "TEMA 7", @lugar, "tema", "2026-11-23 00:00:00", "2026-11-27 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "TEMA 7" 
    AND DATE(fecha_inicio) = DATE("2026-11-23 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-27 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DIA INTERNACIONAL\nPARA LA ELIMINACIÓN\n DE LA VIOLENCIA\nCONTRA LA MUJER", @lugar, "evento", "2026-11-25 00:00:00", "2026-11-25 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DIA INTERNACIONAL\nPARA LA ELIMINACIÓN\n DE LA VIOLENCIA\nCONTRA LA MUJER" 
    AND DATE(fecha_inicio) = DATE("2026-11-25 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-25 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DIA DEL LOGRO 2", @lugar, "evento", "2026-11-30 00:00:00", "2026-11-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DIA DEL LOGRO 2" 
    AND DATE(fecha_inicio) = DATE("2026-11-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-11-30 00:00:00", "2026-11-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-11-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA MUNDIAL DE LA\nLUCHA CONTRA EL SIDA", @lugar, "feriado", "2026-11-30 00:00:00", "2026-11-30 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA MUNDIAL DE LA\nLUCHA CONTRA EL SIDA" 
    AND DATE(fecha_inicio) = DATE("2026-11-30 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-11-30 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA DEL LOGRO", @lugar, "evento", "2026-12-01 00:00:00", "2026-12-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA DEL LOGRO" 
    AND DATE(fecha_inicio) = DATE("2026-12-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "ASESORÍA", @lugar, "asesoria", "2026-12-01 00:00:00", "2026-12-04 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "ASESORÍA" 
    AND DATE(fecha_inicio) = DATE("2026-12-01 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-04 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "DÍA INTERNACIONAL DE LAS\nPERSONAS CON DISCAPACIDAD", @lugar, "evento", "2026-12-03 00:00:00", "2026-12-03 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "DÍA INTERNACIONAL DE LAS\nPERSONAS CON DISCAPACIDAD" 
    AND DATE(fecha_inicio) = DATE("2026-12-03 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-03 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "CLAUSURA NATACION", @lugar, "evento", "2026-12-07 00:00:00", "2026-12-07 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "CLAUSURA NATACION" 
    AND DATE(fecha_inicio) = DATE("2026-12-07 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-07 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO\nINMACULADA CONCEPCIÓN", @lugar, "feriado", "2026-12-08 00:00:00", "2026-12-08 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO\nINMACULADA CONCEPCIÓN" 
    AND DATE(fecha_inicio) = DATE("2026-12-08 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-08 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "BATALLA DE AYACUCHO", @lugar, "feriado", "2026-12-09 00:00:00", "2026-12-09 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "BATALLA DE AYACUCHO" 
    AND DATE(fecha_inicio) = DATE("2026-12-09 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-09 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-12-10 00:00:00", "2026-12-11 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-12-10 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-11 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "EXÁMENES\nBIMESTRALES", @lugar, "examen", "2026-12-14 00:00:00", "2026-12-17 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "EXÁMENES\nBIMESTRALES" 
    AND DATE(fecha_inicio) = DATE("2026-12-14 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-17 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "COMPARTIR NAVIDEÑO", @lugar, "evento", "2026-12-18 00:00:00", "2026-12-18 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "COMPARTIR NAVIDEÑO" 
    AND DATE(fecha_inicio) = DATE("2026-12-18 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-18 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "CLAUSURA SECUNDARIA\n09:00 a 09:00am\nINICIAL\n09:00 a 10:00am\nPRIMARIA\n10:00 a 11:00am", @lugar, "actuacion", "2026-12-21 00:00:00", "2026-12-21 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "CLAUSURA SECUNDARIA\n09:00 a 09:00am\nINICIAL\n09:00 a 10:00am\nPRIMARIA\n10:00 a 11:00am" 
    AND DATE(fecha_inicio) = DATE("2026-12-21 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-21 23:59:59")
);

INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
SELECT @colegio_id, "FERIADO NAVIDAD", @lugar, "feriado", "2026-12-25 00:00:00", "2026-12-25 23:59:59", @usuario_id
WHERE NOT EXISTS (
    SELECT 1 FROM actividades 
    WHERE colegio_id = @colegio_id 
    AND descripcion = "FERIADO NAVIDAD" 
    AND DATE(fecha_inicio) = DATE("2026-12-25 00:00:00") 
    AND DATE(fecha_fin) = DATE("2026-12-25 23:59:59")
);

-- ============================================================
-- FIN DE INSERTS
-- ============================================================

-- Mostrar resumen
SELECT 
    COUNT(*) as total_actividades_insertadas,
    @colegio_id as colegio_id,
    @usuario_id as usuario_id,
    @año as año
FROM actividades 
WHERE colegio_id = @colegio_id 
AND YEAR(fecha_inicio) = @año;









