-- Proyecto/tarea sin fecha de entrega = solo material (docente califica a mano; sin 0 automático).
-- Con fecha se mantiene el flujo de plazo, avisos y nota 0.

ALTER TABLE asignaturas_tareas
  MODIFY COLUMN fecha_entrega DATETIME NULL DEFAULT NULL;
