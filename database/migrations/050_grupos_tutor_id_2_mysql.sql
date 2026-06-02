-- Segundo tutor por grupo: tutor_id = Maestro Tutor, tutor_id_2 = Tutor
-- Ejecutar en phpMyAdmin sobre vanguard_intranet (o la BD del colegio).

ALTER TABLE `grupos`
  ADD COLUMN `tutor_id_2` INT NOT NULL DEFAULT 0 COMMENT 'Tutor (segundo); 0 = sin asignar' AFTER `tutor_id`;
