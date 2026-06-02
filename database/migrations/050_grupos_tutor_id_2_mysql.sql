-- Segundo tutor por grupo: tutor_id = Tutor, tutor_id_2 = Co-Tutor
-- Ejecutar en phpMyAdmin sobre vanguard_intranet (o la BD del colegio).

ALTER TABLE `grupos`
  ADD COLUMN `tutor_id_2` INT NOT NULL DEFAULT 0 COMMENT 'Tutor (segundo); 0 = sin asignar' AFTER `tutor_id`;
