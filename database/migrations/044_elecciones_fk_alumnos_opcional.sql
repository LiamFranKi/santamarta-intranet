-- OPCIONAL: claves foráneas hacia alumnos(id). Ejecutar solo si cumple TODO lo siguiente:
--
-- 1) La tabla referenciada debe ser InnoDB:
--    SHOW TABLE STATUS WHERE Name = 'alumnos';
--    Si Engine es MyISAM, las FK no son válidas. Opción (probar antes en copia de BD):
--    ALTER TABLE alumnos ENGINE=InnoDB;
--
-- 2) El tipo de alcalde_alumno_id / alumno_id debe coincidir EXACTAMENTE con alumnos.id
--    (incl. UNSIGNED). Compare:
--    SHOW CREATE TABLE alumnos;
--    Si alumnos.id es INT UNSIGNED y las columnas de elecciones son INT signed, ajuste:
--    ALTER TABLE elecciones_lista MODIFY alcalde_alumno_id INT(11) UNSIGNED NULL;
--    ALTER TABLE elecciones_miembro MODIFY alumno_id INT(11) UNSIGNED NULL;
--
-- 3) No duplicar el nombre del CONSTRAINT si ya falló un intento (DROP primero o otro nombre).

ALTER TABLE elecciones_lista
  ADD CONSTRAINT fk_elecc_list_alc_alu FOREIGN KEY (alcalde_alumno_id) REFERENCES alumnos(id) ON DELETE SET NULL;

ALTER TABLE elecciones_miembro
  ADD CONSTRAINT fk_elecc_miemb_alu FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE SET NULL;
