# 📊 SISTEMA DE NOTAS - CONTEXTO COMPLETO

**Fecha de Documentación:** Enero 2026  
**Versión:** 1.0.0

---

## 📋 ÍNDICE

1. [Estructura de Base de Datos](#estructura-de-base-de-datos)
2. [Tipos de Calificación](#tipos-de-calificación)
3. [Cálculo de Notas](#cálculo-de-notas)
4. [Flujo de Registro](#flujo-de-registro)
5. [Visualización](#visualización)

---

## 🗄️ ESTRUCTURA DE BASE DE DATOS

### Tabla `niveles`
Configuración del tipo de calificación por nivel educativo:

```sql
CREATE TABLE `niveles` (
  `id` int(11) NOT NULL,
  `colegio_id` int(11) NOT NULL,
  `nombre` varchar(500) NOT NULL,
  `tipo_calificacion` int(11) NOT NULL,        -- 0 = Cualitativa, 1 = Cuantitativa
  `tipo_calificacion_final` int(11) NOT NULL,  -- 0 = Promedio, 1 = Porcentaje
  `nota_aprobatoria` float(8,2) NOT NULL,      -- Nota mínima para aprobar
  `nota_maxima` float(8,2) NOT NULL,           -- Nota máxima permitida (ej: 20)
  `nota_minima` float(8,2) NOT NULL           -- Nota mínima permitida (ej: 0)
)
```

**Ejemplos:**
- **INICIAL**: `tipo_calificacion = 0` (Cualitativa) → Letras A, B, C, etc.
- **PRIMARIA**: `tipo_calificacion = 1` (Cuantitativa) → Números 0-20
- **SECUNDARIA**: `tipo_calificacion = 1` (Cuantitativa) → Números 0-20

### Tabla `asignaturas_criterios`
Criterios de evaluación por asignatura (con pesos en porcentaje):

```sql
CREATE TABLE `asignaturas_criterios` (
  `id` int(11) NOT NULL,
  `colegio_id` int(11) NOT NULL,
  `descripcion` text NOT NULL,                 -- Ej: "PARTICIPACIÓN", "DESEMPEÑO"
  `abreviatura` varchar(30) NOT NULL,
  `asignatura_id` int(11) NOT NULL,
  `ciclo` int(11) NOT NULL,                    -- 0 = Todos los ciclos, 1-4 = Bimestre específico
  `orden` int(11) NOT NULL,                    -- Orden de visualización
  `peso` float(8,2) NOT NULL                   -- Porcentaje del criterio (ej: 25.00)
)
```

**Ejemplo:**
- PARTICIPACIÓN: 25%
- DESEMPEÑO: 25%
- TAREAS: 25%
- TRABAJO EN EQUIPO: 25%

### Tabla `asignaturas_indicadores`
Indicadores (subnotas) por criterio:

```sql
CREATE TABLE `asignaturas_indicadores` (
  `id` int(11) NOT NULL,
  `criterio_id` int(11) NOT NULL,              -- FK a asignaturas_criterios
  `descripcion` varchar(500) NOT NULL,         -- Ej: "GENERAL"
  `cuadros` int(11) NOT NULL                   -- Número de subnotas (ej: 7 cuadros)
)
```

**Ejemplo:**
- Criterio "PARTICIPACIÓN" puede tener:
  - Indicador "GENERAL" con 7 cuadros → 7 subnotas

### Tabla `notas`
Notas finales por criterio (promedio calculado):

```sql
CREATE TABLE `notas` (
  `id` int(11) NOT NULL,
  `matricula_id` int(11) NOT NULL,
  `criterio_id` int(11) NOT NULL,
  `ciclo` int(11) NOT NULL,                    -- 1-4 = Bimestre
  `asignatura_id` int(11) NOT NULL,
  `nota` varchar(11) NOT NULL                  -- Puede ser número o letra según tipo
)
```

**Nota:** Esta tabla almacena el promedio final de cada criterio (calculado desde las subnotas).

### Tabla `notas_detalles`
Subnotas detalladas (serializadas):

```sql
CREATE TABLE `notas_detalles` (
  `id` int(11) NOT NULL,
  `asignatura_id` int(11) NOT NULL,
  `matricula_id` int(11) NOT NULL,
  `ciclo` int(11) NOT NULL,
  `data` text NOT NULL                         -- Serializado: $data[criterio_id][indicador_id][indice] = nota
)
```

**Estructura del campo `data` (serializado PHP):**
```php
$data = [
  criterio_id => [
    indicador_id => [
      0 => nota1,  // Primer cuadro
      1 => nota2,  // Segundo cuadro
      2 => nota3,  // Tercer cuadro
      ...
    ]
  ]
]
```

### Tabla `promedios`
Promedios finales por asignatura y ciclo:

```sql
CREATE TABLE `promedios` (
  `id` int(11) NOT NULL,
  `matricula_id` int(11) NOT NULL,
  `asignatura_id` int(11) NOT NULL,
  `ciclo` int(11) NOT NULL,                    -- 1-4 = Bimestre
  `promedio` varchar(100) NOT NULL             -- Promedio final calculado
)
```

### Tabla `notas_examen_mensual`
Exámenes mensuales (opcional, según configuración del curso):

```sql
CREATE TABLE `notas_examen_mensual` (
  `id` int(11) NOT NULL,
  `matricula_id` int(11) NOT NULL,
  `asignatura_id` int(11) NOT NULL,
  `ciclo` int(11) NOT NULL,
  `nro` int(11) NOT NULL,                      -- 1 o 2 (dos exámenes mensuales)
  `nota` float(8,2) NOT NULL
)
```

---

## 🎯 TIPOS DE CALIFICACIÓN

### 1. Calificación Cualitativa (`tipo_calificacion = 0`)
- **Usado en:** Nivel INICIAL
- **Valores:** Letras (A, B, C, D, etc.)
- **Visualización:** Texto en mayúsculas
- **Ejemplo:** "A", "B", "C"

### 2. Calificación Cuantitativa (`tipo_calificacion = 1`)
- **Usado en:** Niveles PRIMARIA y SECUNDARIA
- **Valores:** Números del 0 al 20
- **Rango:** `nota_minima` (0) a `nota_maxima` (20)
- **Aprobatoria:** `nota_aprobatoria` (ej: 11)
- **Ejemplo:** 15, 18, 20

### 3. Cálculo Final por Porcentaje (`tipo_calificacion_final = 1`)
- **Método:** Cada criterio se multiplica por su peso y se suman
- **Fórmula:** `promedio = Σ(nota_criterio × peso_criterio / 100)`
- **Ejemplo:**
  - PARTICIPACIÓN: 19 × 25% = 4.75
  - DESEMPEÑO: 18 × 25% = 4.50
  - TAREAS: 20 × 25% = 5.00
  - TRABAJO EN EQUIPO: 17 × 25% = 4.25
  - **PROMEDIO FINAL:** 18.50

### 4. Cálculo Final por Promedio (`tipo_calificacion_final = 0`)
- **Método:** Promedio aritmético simple
- **Fórmula:** `promedio = Σ(notas_criterios) / count(criterios)`
- **Ejemplo:**
  - PARTICIPACIÓN: 19
  - DESEMPEÑO: 18
  - TAREAS: 20
  - TRABAJO EN EQUIPO: 17
  - **PROMEDIO FINAL:** (19 + 18 + 20 + 17) / 4 = 18.5

---

## 🧮 CÁLCULO DE NOTAS

### Paso 1: Subnotas → Promedio del Indicador
Si un criterio tiene indicadores con múltiples cuadros:

```php
// Para cada indicador dentro de un criterio
$notas_indicador = [19, 18, 20, 17, 19, 18, 20]; // 7 cuadros
$promedio_indicador = round(array_sum($notas_indicador) / count($notas_indicador));
// Resultado: 18
```

### Paso 2: Indicadores → Nota del Criterio
Si un criterio tiene múltiples indicadores:

```php
// Promedio de todos los indicadores del criterio
$promedios_indicadores = [18, 19, 17];
$nota_criterio = round(array_sum($promedios_indicadores) / count($promedios_indicadores));
// Resultado: 18
```

Si un criterio NO tiene indicadores:
- La nota se ingresa directamente en la tabla `notas`

### Paso 3: Criterios → Promedio Final

**Si es Porcentual (`tipo_calificacion_final = 1`):**
```php
$promedio = 0;
foreach($criterios as $criterio) {
    $nota = $matricula->getNota($asignatura_id, $criterio->id, $ciclo);
    $promedio += ($nota * $criterio->peso / 100);
}
// Si hay examen mensual:
if($curso->examenMensual()) {
    $promedio += $matricula->getPromedioExamenMensual($asignatura, $ciclo, true);
}
```

**Si es Promedio (`tipo_calificacion_final = 0`):**
```php
$notas = [];
foreach($criterios as $criterio) {
    $nota = $matricula->getNota($asignatura_id, $criterio->id, $ciclo);
    if($nota) $notas[] = $nota;
}
$promedio = count($notas) > 0 ? round(array_sum($notas) / count($notas)) : null;
```

### Paso 4: Examen Mensual (Opcional)
Algunos cursos tienen exámenes mensuales con peso específico:

```php
// Promedio de los dos exámenes mensuales
$examen1 = $matricula->getNotaExamenMensual($asignatura_id, 1, $ciclo);
$examen2 = $matricula->getNotaExamenMensual($asignatura_id, 2, $ciclo);
$promedio_examen = round(($examen1 + $examen2) / 2);

// Si es porcentual, se multiplica por el peso
$peso_examen = $curso->peso_examen_mensual; // ej: 20%
$promedio_examen_ponderado = $promedio_examen * $peso_examen / 100;
```

---

## 📝 FLUJO DE REGISTRO

### 1. Registro de Subnotas (si hay indicadores)
1. Docente ingresa las subnotas en cada cuadro del indicador
2. Se calcula automáticamente el promedio del indicador
3. Se guarda en `notas_detalles.data` (serializado)

### 2. Cálculo de Nota del Criterio
1. Si hay indicadores: se promedian los promedios de los indicadores
2. Si no hay indicadores: se usa la nota ingresada directamente
3. Se guarda en `notas` (nota final del criterio)

### 3. Cálculo del Promedio Final
1. Se obtienen todas las notas de criterios
2. Se calcula según el tipo (porcentual o promedio)
3. Se suma el examen mensual si aplica
4. Se guarda en `promedios`

---

## 👁️ VISUALIZACIÓN

### Estructura de "Notas Detalladas"

Para cada asignatura del alumno:

```
┌─────────────────────────────────────────┐
│ CURSO: Ciencia y Tecnología              │
├─────────────────────────────────────────┤
│ PARTICIPACIÓN (25%)                      │
│ ┌─────────────────────────────────────┐ │
│ │ 19  19  18  20  17  19  18 │ 18    │ │ ← Subnotas y promedio
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ DESEMPEÑO (25%)                          │
│ ┌─────────────────────────────────────┐ │
│ │ 18  19  20  17  19 │ 18             │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ TAREAS (25%)                             │
│ ┌─────────────────────────────────────┐ │
│ │ 20  19  20 │ 19                     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ TRABAJO EN EQUIPO (25%)                  │
│ ┌─────────────────────────────────────┐ │
│ │ 17  18  19 │ 18                     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ PROMEDIO: 18                             │
└─────────────────────────────────────────┘
```

### Campos a Mostrar

1. **Información del Alumno:**
   - Nombre completo
   - Grupo
   - Ciclo/Bimestre

2. **Por cada Criterio:**
   - Nombre del criterio
   - Peso (si es porcentual)
   - Si tiene indicadores:
     - Todas las subnotas (cuadros)
     - Promedio del criterio (fondo destacado)
   - Si no tiene indicadores:
     - Solo la nota del criterio

3. **Examen Mensual (si aplica):**
   - Nota del examen 1
   - Nota del examen 2
   - Promedio de exámenes (con peso)

4. **Promedio Final:**
   - Promedio calculado del curso
   - Solo se muestra si todas las notas están completas

---

## 🔍 QUERIES IMPORTANTES

### Obtener Criterios de una Asignatura
```sql
SELECT * FROM asignaturas_criterios
WHERE asignatura_id = ? 
  AND (ciclo = ? OR ciclo = 0)
ORDER BY orden ASC
```

### Obtener Indicadores de un Criterio
```sql
SELECT * FROM asignaturas_indicadores
WHERE criterio_id = ?
```

### Obtener Nota de un Criterio
```sql
SELECT nota FROM notas
WHERE matricula_id = ?
  AND criterio_id = ?
  AND asignatura_id = ?
  AND ciclo = ?
```

### Obtener Subnotas Detalladas
```sql
SELECT data FROM notas_detalles
WHERE matricula_id = ?
  AND asignatura_id = ?
  AND ciclo = ?
```
Luego deserializar `data` para obtener: `$data[criterio_id][indicador_id][indice]`

### Obtener Promedio Final
```sql
SELECT promedio FROM promedios
WHERE matricula_id = ?
  AND asignatura_id = ?
  AND ciclo = ?
```

### Obtener Exámenes Mensuales
```sql
SELECT nro, nota FROM notas_examen_mensual
WHERE matricula_id = ?
  AND asignatura_id = ?
  AND ciclo = ?
ORDER BY nro ASC
```

---

## ⚠️ CONSIDERACIONES IMPORTANTES

1. **Ciclos/Bimestres:**
   - Los criterios pueden ser específicos de un ciclo (1-4) o para todos (0)
   - Las notas se registran por ciclo
   - El promedio se calcula por ciclo

2. **Validación de Notas:**
   - **Cuantitativa:** Debe estar entre `nota_minima` (0) y `nota_maxima` (20)
   - **Cualitativa:** Letras válidas (A, B, C, D, etc.)

3. **Cálculo de Promedios:**
   - Solo se calcula si todas las notas de criterios están completas
   - Si falta alguna nota, el promedio se muestra como "-"

4. **Examen Mensual:**
   - No todos los cursos tienen examen mensual
   - Se verifica con `curso.examenMensual()`
   - Tiene su propio peso configurado en el curso

5. **Filtrado por Año Activo:**
   - Todas las consultas deben filtrar por `anio_activo`
   - Se obtiene de `grupos.anio` a través de `matriculas` y `asignaturas`

---

## 📌 NOTAS ADICIONALES

- El campo `nota` en la tabla `notas` puede ser número o letra según el tipo
- El campo `data` en `notas_detalles` está serializado en formato PHP
- Los promedios se redondean a enteros (0 decimales)
- Los colores en la visualización:
  - Azul: Nota >= nota_aprobatoria
  - Rojo: Nota < nota_aprobatoria
- El fondo destacado (#FDE9D9) se usa para promedios calculados

---

**Última Actualización:** Enero 2026  
**Mantenido por:** Equipo de Desarrollo









