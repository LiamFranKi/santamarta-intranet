# Contexto: exámenes de herramientas (intranet) — trabajo hecho y pendiente

**Repo:** https://github.com/LiamFranKi/intranet-2026  
**Ruta en VPS:** `/home/vanguard/intranet2026`  
**Deploy (PuTTY, una línea):**
```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
```

---

## Qué es esto

Módulo **Exámenes de herramientas** (intranet): audiencias, alcance por grupos, modos PRACTICA/CALIFICADO/MIXTO, preguntas con alternativas (Quill), V/F, respuesta corta, intentos, estadísticas y revisión por docente/admin.

**Backend:** `backend/routes/herramientasExamenes.routes.js` (+ servicio de notificaciones).  
**Frontend principal:** `frontend/src/pages/herramientas/` (editor, realizar, estadísticas, listas, etc.).  
**Migraciones SQL:** `database/migrations/021_*`, `022_*`, `023_*` (tablas/columnas herramientas exámenes, modal visto, etc.) — **ejecutar en MySQL/MariaDB del servidor si aún no se aplicaron.**

---

## Hecho (resumen técnico)

### Editor de preguntas (`HerramientasExamenEditor.jsx` + `hexExamenEditorHelpers.js`)

- `clonePreguntaForm()` para copia profunda de opciones; evita mezclar preguntas al crear varias.
- `nuevaPreguntaLocal()`: alternativas vacías (`''`), sin HTML de relleno.
- Modal de pregunta con **`key`** para remontar al cambiar de pregunta; Quill con **keys** para no reusar contenido viejo.
- `onGuardar` sin merge incorrecto con `editPregunta`; `guardarPreguntaEnLista` con clon.
- `mapPreguntasFromApi` pasa por `clonePreguntaForm`.

### MariaDB / SQL

- **No usar** `CAST(? AS JSON)` en prepared statements: en MariaDB da **ER_PARSE_ERROR 1064**.  
- Usar `?` con `JSON.stringify(...)` (mismo criterio que docente/aula). Comentario de convención en cabecera del route.

### Pantalla realizar / vista previa (`HerramientasExamenRealizar.jsx`)

- Puntos mostrados: modo **GENERAL** → `examen.puntos_correcta`; **INDIVIDUAL** → puntos por pregunta.
- API **`/preview/:id`** y vista previa admin incluyen `tipo_puntaje` y `puntos_correcta`.
- Layout: número de pregunta y enunciado en la misma línea (CSS `.hex-q-enunciado*`).

### Iniciar examen (backend)

- Bug: se llamaba `uid(user)` pero `uid` esperaba **`req`**. Corregido a **`uid(req)`** en rutas afectadas.

### Estadísticas y revisión (`HerramientasExamenEstadisticas.jsx` + backend gestión)

- Cálculo de máximo por pregunta y del examen: **GENERAL** usa `puntos_correcta` del examen (no solo `puntos` de fila en BD).
- Funciones: `puntosBasePorPregunta`, `puntajeMaximoPregunta(ex, row)`, `puntajeMaximoExamen`.
- Grilla: columna puntaje usa **`puntaje_max_examen`** (configuración actual).
- Modal revisión: HTML en enunciado y en texto de alternativa elegida; chip **X / máximo**; datos de examen en detalle de intento.
- **POST** `/gestion/:id/recalcular-puntos`: recalcula intentos enviados (respuestas cortas ya calificadas se respetan).
- Tras deploy, conviene pulsar **“Recalcular puntajes”** una vez si había intentos viejos guardados con 1 pt.

### Cursor / reglas

- Regla workspace **deploy VPS** en `.cursor/rules/deploy-vps.mdc` (comando PuTTY, repo).

---

## Posible pendiente / comprobar en servidor

1. **Migraciones 021–023** aplicadas en la BD de producción (si algo falla al guardar o faltan columnas).
2. **Recalcular puntajes** en estadísticas del examen si aún ves totales antiguos (3/4 en lugar de escala con 5 pt por ítem en GENERAL).
3. **Pruebas manuales:** crear examen GENERAL 5 pt, varias preguntas, enviar, revisar, estadísticas, notificaciones si aplica.
4. Otros módulos del proyecto **no** están listados aquí; este archivo es solo el hilo **herramientas-exámenes**.

---

## Commits recientes relevantes (referencia)

Incluyen, entre otros: fix editor/clonación; fix `CAST` JSON MariaDB; docs JSON; fix puntos/vista previa realizar; fix `uid(req)`; fix estadísticas GENERAL + HTML + recalcular.

*(Tras `git pull`, `git log --oneline -15` en el repo para la lista exacta.)*

---

## Cómo seguir en un chat nuevo

Pegar o @mencionar este archivo y decir: *“Seguimos con exámenes de herramientas según CONTEXTO_HERRAMIENTAS_EXAMENES.md”*.
