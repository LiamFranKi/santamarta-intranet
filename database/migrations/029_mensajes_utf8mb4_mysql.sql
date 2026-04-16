-- Alinear `mensajes` con `mensajes_grupos` (utf8mb4) para asuntos/mensajes con emoji.
-- Sin esto, MySQL puede guardar mal 4-byte chars en columnas utf8mb3 y mezclar collations al comparar.
-- Ejecutar en el servidor MySQL cuando puedas (ventana de mantenimiento si la tabla es grande).

ALTER TABLE `mensajes` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
