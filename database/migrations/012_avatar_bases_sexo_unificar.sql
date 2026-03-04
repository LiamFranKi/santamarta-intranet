-- Unificar convención sexo: 0=Masculino, 1=Femenino (igual que alumnos)
-- Antes: avatar_bases 0=Femenino, 1=Masculino
-- Después: avatar_bases 0=Masculino, 1=Femenino
-- Usar valores temporales para evitar conflicto con uk_bimestre_sexo:
UPDATE avatar_bases SET sexo = 99 WHERE sexo = 0;
UPDATE avatar_bases SET sexo = 0 WHERE sexo = 1;
UPDATE avatar_bases SET sexo = 1 WHERE sexo = 99;
