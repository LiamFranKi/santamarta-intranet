-- Campos alineados con el examen virtual del aula (sin registro académico): tiempo, tipo de puntaje, orden, bloque de contexto.
-- Ejecutar UNA VEZ en vanguard_intranet tras 021.
-- Si MySQL devuelve "Duplicate column name", esas columnas ya existen: no repetir el ALTER completo.

ALTER TABLE herramientas_examenes
  ADD COLUMN tiempo_minutos INT NOT NULL DEFAULT 60 COMMENT 'Duración máxima en minutos (referencia UI)' AFTER intentos_max,
  ADD COLUMN tipo_puntaje ENUM('GENERAL','INDIVIDUAL') NOT NULL DEFAULT 'GENERAL' AFTER tiempo_minutos,
  ADD COLUMN puntos_correcta DECIMAL(8,2) NULL DEFAULT 1.00 COMMENT 'Si GENERAL: puntos por respuesta correcta' AFTER tipo_puntaje,
  ADD COLUMN penalizar_incorrecta ENUM('NO','SI') NOT NULL DEFAULT 'NO' AFTER puntos_correcta,
  ADD COLUMN penalizacion_incorrecta DECIMAL(8,2) NOT NULL DEFAULT 0 AFTER penalizar_incorrecta,
  ADD COLUMN orden_preguntas ENUM('PREDETERMINADO','ALEATORIO') NOT NULL DEFAULT 'PREDETERMINADO' AFTER penalizacion_incorrecta,
  ADD COLUMN preguntas_max INT NOT NULL DEFAULT 1 COMMENT 'Cantidad de preguntas mostradas; 1 = todas si una sola' AFTER orden_preguntas,
  ADD COLUMN bloque_contenido LONGTEXT NULL COMMENT 'HTML: contexto compartido opcional' AFTER preguntas_max,
  ADD COLUMN bloque_imagen_url VARCHAR(500) NULL AFTER bloque_contenido;
