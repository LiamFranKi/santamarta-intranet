# Paso 1: Revisión de la base de datos para Estadísticas de Pagos

Documento de referencia: tablas y campos usados para estadísticas de pagos y pensiones en la intranet (MySQL).

---

## Tablas principales

### 1. `pagos`

Registro de cada pago (matrícula o pensión).

| Campo          | Tipo        | Descripción |
|----------------|-------------|-------------|
| `id`           | int(11)     | PK |
| `colegio_id`   | int(11)     | Colegio |
| `matricula_id` | int(11)     | Matrícula del alumno |
| `nro_pago`     | int(11)     | Número de pago (orden: 0 matrícula, 1..N pensiones) |
| `monto`        | float(8,2)  | Monto pagado |
| `mora`         | float(8,2)  | Mora si aplica |
| `fecha_hora`   | datetime    | Fecha y hora del pago |
| `tipo`         | int(11)     | **0 = Matrícula**, 1..12 = pensión del mes (ej. 3=Marzo) |
| `descripcion`  | text        | Descripción |
| `estado`       | enum        | **'ACTIVO'** \| 'ANULADO' (solo ACTIVO cuenta) |
| `estado_pago`  | enum        | **'CANCELADO'** \| 'PENDIENTE' (solo CANCELADO = cobrado) |
| `forma_pago`   | enum        | EFECTIVO, TARJETA, YAPE, TRANSFERENCIA |
| `lugar_pago`   | enum        | CAJA, BANCO |

**Para estadísticas:** filtrar `estado = 'ACTIVO'` y `estado_pago = 'CANCELADO'`.  
Ingresos por mes: agrupar por año + `tipo` (o por `fecha_hora` mes) y sumar `monto`.

---

### 2. `matriculas`

Relación alumno–grupo (año escolar).

| Campo         | Tipo    | Descripción |
|---------------|---------|-------------|
| `id`          | int(11) | PK |
| `colegio_id`  | int(11) | Colegio |
| `grupo_id`    | int(11) | Grupo (grado/sección/año) |
| `alumno_id`   | int(11) | Alumno |
| `costo_id`    | int(11) | Tarifa (matrícula/pensión) |
| `estado`      | int(11) | Estado de la matrícula |
| `fecha_registro` | date | Fecha de registro |

Permite enlazar pagos con grupo y alumno.

---

### 3. `grupos`

Grado, sección y año (aula).

| Campo       | Tipo      | Descripción |
|------------|-----------|-------------|
| `id`       | int(11)   | PK |
| `colegio_id` | int(11) | Colegio |
| `nivel_id` | int(11)   | Nivel (Inicial, Primaria, Secundaria) |
| `grado`    | int(11)   | Grado numérico |
| `seccion`  | varchar(50) | Sección (A, B, …) |
| `anio`     | int(11)   | Año escolar (ej. 2026) |

Para “pagos por aula/grado”: unir `pagos` → `matriculas` → `grupos` y agrupar por `grupos.id` o por `grado`/`seccion`/`anio`.

---

### 4. `alumnos`

Datos del alumno (para listados y deudores).

| Campo               | Tipo        | Descripción |
|---------------------|-------------|-------------|
| `id`                | int(11)     | PK |
| `nombres`           | varchar(500)| Nombres |
| `apellido_paterno`  | varchar(500)| Apellido paterno |
| `apellido_materno`  | varchar(500)| Apellido materno |
| `nro_documento`     | varchar(20) | DNI |

Se usa en listados de deudores y en reportes por alumno.

---

### 5. `niveles`

Nivel educativo (Inicial, Primaria, Secundaria).

| Campo   | Tipo        | Descripción |
|---------|-------------|-------------|
| `id`    | int(11)     | PK |
| `nombre`| varchar(500)| Nombre del nivel |

Se obtiene vía `grupos.nivel_id` para filtrar o agrupar por nivel.

---

### 6. `costos`

Tarifas de matrícula y pensión por colegio.

| Campo        | Tipo        | Descripción |
|-------------|-------------|-------------|
| `id`        | int(11)     | PK |
| `colegio_id`| int(11)     | Colegio |
| `matricula` | float(8,2)  | Monto matrícula |
| `pension`   | float(8,2)  | Monto pensión (por mes) |
| `descripcion` | varchar(500) | Descripción |
| `tipo`      | enum        | GENERAL \| PERSONAL |

`matriculas.costo_id` apunta aquí. Sirve para calcular lo que “debería” pagar cada uno (deuda esperada).

---

### 7. `verificaciones_deudas`

Registro de verificaciones de deuda (ej. por apoderado).

| Campo          | Tipo     | Descripción |
|----------------|----------|-------------|
| `id`           | int(11)  | PK |
| `matricula_id` | int(11)  | Matrícula |
| `fecha_hora`   | datetime | Fecha de verificación |
| `deudas`       | longtext | Detalle de deudas (serializado/JSON) |
| `conforme`     | enum     | SI \| NO |
| `fecha_limite` | date     | Fecha límite |
| `apoderado_id` | int(11)  | Apoderado |

Puede usarse para cruzar con deudores o para reportes de conformidad.

---

## Relaciones para consultas típicas

- **Ingresos por mes (año X):**  
  `pagos` (estado = ACTIVO, estado_pago = CANCELADO, fecha_hora en año X) → agrupar por mes y sumar `monto`.

- **Ingresos por grado/aula (año X):**  
  `pagos` → `matriculas` (matricula_id) → `grupos` (grupo_id, anio = X). Agrupar por grupo (o grado + seccion) y sumar `pagos.monto`.

- **Deudores:**  
  Matrículas del año con grupo que “deberían” tener N pagos (matrícula + pensiones según meses del año). Comparar con cantidad de registros en `pagos` (ACTIVO + CANCELADO) por matricula_id y tipo; los que tengan menos son deudores. El detalle de qué meses deben puede venir de `costos` (cuántos meses son) y de los `tipo` ya pagados.

- **Nombres en reportes:**  
  `matriculas` → `alumnos` (alumno_id), `grupos` (grupo_id) → `niveles` (nivel_id).  
  Nombre completo: `alumnos.nombres`, `apellido_paterno`, `apellido_materno`.  
  Grado/sección: `grupos.grado`, `grupos.seccion`, `niveles.nombre`.

---

## Convención de `pagos.tipo`

Según consultas existentes en el proyecto:

- **`tipo = 0`** → Pago de **matrícula**.
- **`tipo = 1..12`** → Pensión del mes (1 = enero, 2 = febrero, …, 12 = diciembre).  
  Confirmar en producción con:  
  `SELECT DISTINCT tipo, COUNT(*) FROM pagos GROUP BY tipo;`

---

## Resumen Paso 1

- **Pagos cobrados:** `pagos` con `estado = 'ACTIVO'` y `estado_pago = 'CANCELADO'`.
- **Por alumno y aula:** `pagos` → `matriculas` → `grupos`, `alumnos`, `niveles`.
- **Tarifas:** `costos` vía `matriculas.costo_id`.
- **Deudas:** comparar pagos realizados por matrícula/año con los meses esperados (matrícula + pensiones del año).

Con esto se pueden implementar los endpoints y pantallas de los siguientes pasos (KPIs, ingresos por mes, por grado, listado de deudores).
