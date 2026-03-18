# Estadísticas de pagos – Contexto y pasos

Documento para retomar el módulo **Estadísticas** (pagos/pensiones) en el perfil **Administrador**. Todo el contenido vive en **Admin → Estadísticas** (menú debajo de Dashboard).

---

## 1. Objetivo

Replicar en la intranet las estadísticas que daba el sistema externo [vanguard-estadisticas-pagos](https://github.com/LiamFranKi/vanguard-estadisticas-pagos), pero **sin subir Excel ni PDF**: la fuente de datos es la **misma base de datos MySQL** que ya usa la intranet (tablas `pagos`, `matriculas`, `grupos`, `alumnos`, `costos`, etc.).

---

## 2. Lo hecho hasta ahora

### Antes del Paso 1
- **Menú "Estadísticas"** en el sidebar del administrador, debajo de Dashboard (icono 📈, ruta `/admin/estadisticas`).
- **Página** `frontend/src/pages/admin/AdminEstadisticas.jsx` con layout y estilos (`AdminEstadisticas.css`).
- **Ruta** en `App.js`: `/admin/estadisticas` → `AdminEstadisticas` (solo ADMINISTRADOR).

### Paso 1 – Revisión de la BD
- **Documento:** `database/ESTADISTICAS_PASO1_BD.md`.
- Contiene: tablas `pagos`, `matriculas`, `grupos`, `alumnos`, `niveles`, `costos`, `verificaciones_deudas`; campos útiles; convención `pagos.tipo` (0 = matrícula, 1..12 = mes); relaciones para ingresos por mes, por grado y para deudores.

### Paso 2 – API de KPIs y pantalla
- **Backend:** `GET /api/admin/estadisticas/kpis` en `backend/routes/admin.routes.js`.
  - Query: `?anio=2026` (opcional; si no se envía, usa año activo del colegio).
  - Respuesta: `anio`, `moneda`, `total_cobrado`, `presupuesto_anual`, `total_deuda`, `alumnos_total`, `alumnos_al_dia`, `cantidad_deudores`.
  - Solo usuarios ADMINISTRADOR (middleware ya aplicado a todas las rutas admin).
- **Frontend:** `AdminEstadisticas.jsx` llama a la API y muestra 6 tarjetas (Total cobrado, Presupuesto anual, Total deuda, Alumnos con matrícula pagada, Alumnos al día, Deudores). Usa estilos de `./Dashboard.css` (mismo directorio `admin/`).
- **Fix:** import de CSS corregido a `./Dashboard.css` (no `../Dashboard.css`) para que el build en el servidor funcione.

---

## 3. Archivos clave

| Qué | Ruta |
|-----|------|
| Documentación BD (Paso 1) | `database/ESTADISTICAS_PASO1_BD.md` |
| Menú admin | `frontend/src/components/DashboardLayout.jsx` (ítem Estadísticas) |
| Ruta admin/estadisticas | `frontend/src/App.js` |
| Página Estadísticas | `frontend/src/pages/admin/AdminEstadisticas.jsx` |
| Estilos página | `frontend/src/pages/admin/AdminEstadisticas.css` |
| API KPIs | `backend/routes/admin.routes.js` (GET `/estadisticas/kpis`) |

---

## 4. Pasos que siguen (plan original)

### Paso 3 – Pantalla básica “Estadísticas de pagos”
- Ya existe la pantalla; los KPIs del Paso 2 se muestran ahí. Opcional: refinar título/descripción o añadir selector de año que pase `?anio=` a la API.

### Paso 4 – Pagos por mes (gráfico y tabla)
- **Backend:** endpoint que devuelva **ingresos por mes** (por año), por ejemplo: `GET /api/admin/estadisticas/ingresos-por-mes?anio=2026` → array `{ mes, total }`.
- **Frontend:** en la misma página (o pestaña), gráfico de barras “Ingresos por mes” y opcional tabla. Consultar `database/ESTADISTICAS_PASO1_BD.md` para agrupar por `pagos.fecha_hora` o `pagos.tipo` (1..12).

### Paso 5 – Pagos por grado / aula
- **Backend:** endpoint ingresos (o cantidad) **por grado/aula**, por ejemplo: `GET /api/admin/estadisticas/ingresos-por-grado?anio=2026` (unir `pagos` → `matriculas` → `grupos`).
- **Frontend:** gráfico (barras) “Por grado/aula” y opcional tabla.

### Paso 6 – Listado de deudores
- **Backend:** endpoint **lista de alumnos deudores**, por ejemplo: `GET /api/admin/estadisticas/deudores?anio=2026&grado_id=opcional` (misma lógica que en KPIs: matrículas con matrícula pagada donde lo pagado < esperado).
- **Frontend:** tabla con columnas (alumno, grado, meses adeudados, monto deuda, etc.) y filtros básicos (grado, año).

### Paso 7 – Filtros por año y opciones de vista
- Selector de **año** (y si aplica rango de meses) para todos los gráficos y KPIs; que los endpoints acepten `anio` (y filtros) y la pantalla se actualice al cambiar.

### Paso 8 – Exportar reportes (opcional)
- **Backend:** endpoint(s) para exportar (Excel o PDF): resumen por mes/grado, lista de deudores.
- **Frontend:** botones “Descargar Excel” / “Descargar PDF” que consuman esa API.

---

## 5. Comando PuTTY (despliegue en el servidor)

```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
```

---

## 6. Repositorio

- **GitHub:** https://github.com/LiamFranKi/intranet-2026  
- Rama: `main`.

---

*Última actualización: contexto guardado después de Paso 2 y fix del import Dashboard.css.*
