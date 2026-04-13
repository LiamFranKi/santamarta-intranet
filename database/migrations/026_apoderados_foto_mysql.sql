-- Foto de perfil (nombre de archivo en Static/Image/Fotos), mismo criterio que alumnos/personal
ALTER TABLE apoderados ADD COLUMN foto VARCHAR(255) NULL DEFAULT NULL AFTER email;
