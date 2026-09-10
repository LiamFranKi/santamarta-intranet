-- Perfil SUPERADMINISTRADOR (break-glass): mismo poder que ADMINISTRADOR en la app.
-- No se elige en Equipo ni aparece en listados. La cuenta se crea a mano (ver bloque comentado).

ALTER TABLE `usuarios`
MODIFY COLUMN `tipo` enum(
    'ADMINISTRADOR',
    'DIRECTOR',
    'ALUMNO',
    'APODERADO',
    'DOCENTE',
    'AUXILIAR',
    'SECRETARIA',
    'CAJERO',
    'ENFERMERA',
    'PROMOTORIA',
    'COORDINADOR',
    'PSICOLOGA',
    'PERSONALIZADO',
    'ASISTENCIA',
    'CONTADOR',
    'TUTOR',
    'MANTENIMIENTO',
    'SUPERADMINISTRADOR'
) NOT NULL;

-- Crear la cuenta en el servidor (no va en el repo: DNI y clave propios).
-- 1) INSERT personal (colegio_id, nombres, apellidos, nro_documento, …)
-- 2) INSERT usuarios:
--    personal_id = <id>, alumno_id = 0, apoderado_id = 0,
--    usuario = <DNI>, password = SHA1('<clave>'),
--    tipo = 'SUPERADMINISTRADOR', estado = 'ACTIVO'
