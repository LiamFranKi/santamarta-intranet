# Pendiente: Examen mensual solo como indicador (sin flujo aparte)

**Estado:** aplazado a **fin de año 2026 / inicio año escolar siguiente** (2027).  
**Motivo del aplazamiento:** puede haber notas ya cargadas en el modelo viejo; aceptan riesgo de migración o recarga manual; mejor cerrar el año con el esquema actual.

---

## Objetivo de negocio

- El **Examen mensual** debe dejar de ser un caso especial en código y en BD.
- Debe comportarse **siempre como un criterio/indicador más** (`asignaturas_criterios` + `asignaturas_indicadores`), con sus cuadros y peso como Prácticas, Proyectos, etc.
- **No** depender de:
  - `cursos.examen_mensual` (`SI`/`NO`) y `cursos.peso_examen_mensual` como interruptor/peso del bloque especial.
  - Tabla **`notas_examen_mensual`** para guardar esas notas.

---

## Situación actual (referencia técnica)

| Aspecto | Modelo “indicadores” | Examen mensual legacy |
|--------|----------------------|------------------------|
| Definición | `asignaturas_criterios`, `asignaturas_indicadores` | `cursos.examen_mensual`, `peso_examen_mensual` |
| Notas | `notas_detalles` + `notas` | `notas_examen_mensual` (`nro` 1, 2, …) |
| UI registrar notas | Columnas por criterio | Columna extra fija (2 exámenes + promedio) si `examen_mensual === 'SI'` |

Crear indicadores vía API **no** activa el examen mensual legacy: son flujos independientes.

---

## Qué habría que hacer después (checklist alto nivel)

1. **Política de datos**
   - Decidir si se **migra** `notas_examen_mensual` → estructura `notas_detalles`/`notas` para un criterio “Examen mensual” por curso/ciclo, o si se **archiva** y se empieza limpio el año siguiente.
   - Desactivar o ignorar `cursos.examen_mensual` en cursos que ya usen solo indicadores.

2. **Backend**
   - Quitar o condicionar lectura/escritura de `notas_examen_mensual` en rutas de notas (GET/POST `/docente/cursos/:id/notas`, agregados tipo `notas-todos`, alumno/apoderado, etc.).
   - Asegurar que el **promedio final ponderado** use **solo** criterios (incluido el futuro “Examen mensual” como criterio), sin sumar peso duplicado.
   - Revisar admin creación/edición de **cursos**: hoy el intranet puede no exponer `examen_mensual`/`peso_examen_mensual`; al unificar, sobran o se eliminan de UI y de lógica.

3. **Frontend**
   - `DocenteCursos.jsx`, `ModalRegistrarNotasAsignatura.jsx`, `pdfNotasTutoria.js`, `AlumnoCursos`, `DocenteHijos`/`ApoderadoHijos`, etc.: eliminar la columna y estado `examen_mensual` en `notasEditadas` / payloads si ya no existen.
   - Una sola representación en pantalla: la que venga de criterios/indicadores.

4. **Pruebas**
   - Curso con calificación porcentual y pesos que sumen 100 % incluyendo el nuevo criterio tipo examen mensual.
   - Tutoría / PDF masivo / vistas solo lectura alineadas con el mismo cálculo.

---

## Nota

Este documento es **memoria de contexto** acordada con el equipo; no sustituye tareas en issue tracker si usan uno.

**Última actualización:** conversación intranet 2026 (solicitud explícita de aplazar implementación).
