-- Subtítulo de pregunta: permitir HTML con imágenes (antes VARCHAR(500) truncaba).
ALTER TABLE encuestas_preguntas
  MODIFY COLUMN subtitulo TEXT NULL;
