# Dos tutores por grupo

## Base de datos

Ejecutar en MySQL (phpMyAdmin o consola):

`database/migrations/050_grupos_tutor_id_2_mysql.sql`

- `grupos.tutor_id` → **Maestro Tutor** (como antes).
- `grupos.tutor_id_2` → **Tutor** (segundo; `0` = sin asignar).

## Admin

**Académico → Grados**: formulario con **Maestro Tutor** y **Tutor** (opcionales; no pueden ser la misma persona).

## Acceso docente

Cualquier docente asignado como Maestro Tutor o Tutor del grupo (año activo) ve el menú **Tutoría** y las mismas funciones de tutoría, además de sus cursos por asignatura.

## Reportes / libretas

Texto: `Maestro Tutor: … · Tutor: …` (solo las partes asignadas).
