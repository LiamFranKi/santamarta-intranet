-- Invalidación de sesiones JWT: al subir token_version, los tokens viejos dejan de valer.
-- Ejecutar una vez en MySQL del VPS:
--   mysql -u ... -p vanguard_intranet < database/migrations/068_usuarios_token_version_mysql.sql
-- Si la columna ya existe, ignorar el error "Duplicate column".

ALTER TABLE usuarios
  ADD COLUMN token_version INT NOT NULL DEFAULT 1
  COMMENT 'Sube al cambiar password o al forzar cierre de sesión';
