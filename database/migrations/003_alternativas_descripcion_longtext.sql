-- Ampliar descripcion de alternativas de examen para soportar HTML con imágenes
-- (antes VARCHAR(1000) truncaba contenido con img en base64 o HTML largo).
-- Ejecutar en phpMyAdmin sobre la base del colegio / intranet.

ALTER TABLE `asignaturas_examenes_preguntas_alternativas`
  MODIFY COLUMN `descripcion` LONGTEXT NOT NULL;
