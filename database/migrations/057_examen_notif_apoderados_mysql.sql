-- Evita duplicar campanita/correo a apoderados al finalizar (incl. cierre por violaciones o /finalizar idempotente).
ALTER TABLE asignaturas_examenes_pruebas
  ADD COLUMN notif_apoderados_enviada_at DATETIME NULL DEFAULT NULL
  AFTER incorrectas;

CREATE INDEX idx_aep_notif_apoderados ON asignaturas_examenes_pruebas (notif_apoderados_enviada_at);
