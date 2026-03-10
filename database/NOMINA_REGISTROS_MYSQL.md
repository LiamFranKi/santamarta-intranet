# Migración: nomina_registros (MySQL)

Tabla para el registro académico editable del docente (notas en cuadraditos por bimestre).

## Pasos en phpMyAdmin

1. Abre phpMyAdmin y selecciona la base **`vanguard_intranet`**.
2. Ve a la pestaña **SQL**.
3. Copia y pega todo el contenido de:
   ```
   database/migrations/013_nomina_registros.sql
   ```
4. Pulsa **Continuar**.

## Tabla creada

| Campo | Descripción |
|-------|-------------|
| asignatura_id | Curso/asignatura |
| personal_id | Docente |
| bimestre | 1, 2, 3 o 4 |
| notas_json | JSON: `{"matricula_id": ["05","12","",...], ...}` (25 valores por alumno) |
