-- Bloqueo de examen por dispositivo (solo módulo examen alumno)
-- Ejecutar en phpMyAdmin antes del despliegue de backend/frontend.

ALTER TABLE asignaturas_examenes_pruebas
  ADD COLUMN exam_session_token VARCHAR(128) NULL AFTER respuestas,
  ADD COLUMN exam_session_device_id VARCHAR(128) NULL AFTER exam_session_token,
  ADD COLUMN exam_session_last_seen DATETIME NULL AFTER exam_session_device_id;

CREATE INDEX idx_aep_exam_session_token ON asignaturas_examenes_pruebas (exam_session_token);
CREATE INDEX idx_aep_exam_session_last_seen ON asignaturas_examenes_pruebas (exam_session_last_seen);
