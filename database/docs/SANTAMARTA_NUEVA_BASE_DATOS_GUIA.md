# Santa Marta Schools — Guía para nueva base de datos (pendiente)

> **Estado:** documentación de referencia. **Aún no ejecutar** hasta terminar el sistema Vanguard por completo.  
> **Cuándo usar:** al crear la BD `santamarta` (estructura vacía + datos mínimos) en phpMyAdmin.

---

## Objetivo

Crear una **base MySQL nueva** (ej. `santamarta`) para un segundo colegio (**Santa Marta Schools**) con:

- **Toda la estructura** de tablas (igual que Vanguard).
- **Sin datos históricos** (sin alumnos, pagos, notas, mensajes, publicaciones de 10 años).
- Solo **semilla básica**: colegio, configuración mínima, niveles, turno y un administrador inicial.

---

## Enfoque elegido vs alternativa

### Opción A — BD nueva `santamarta` (la que usaremos)

| Ventaja | Detalle |
|---------|---------|
| Aislamiento total | Vanguard y Santa Marta no comparten filas |
| Copia de seguridad / restore independiente | Más simple mentalmente |
| Sin riesgo de mezclar IDs | Cada BD empieza en limpio |

| Requisito | Detalle |
|-----------|---------|
| Conexión | La intranet (o una **segunda instancia**) debe apuntar `MYSQL_DATABASE=santamarta` en `backend/.env` |
| Dos colegios en producción | Implica **dos despliegues** o dos `.env` (dominio/subdominio distinto), no un solo `.env` para ambos |

### Opción B — Misma BD, nuevo `colegio_id` (no es el plan actual)

- Insertar fila en `colegios` con `id = 2` y semilla por `colegio_id`.
- La intranet React **ya filtra por `colegio_id`** en casi todo.
- **No** trae historial si no copias tablas operativas.
- Útil si más adelante quieren multi-colegio en **una sola** base; documentado aquí solo como referencia.

---

## Archivos del proyecto relacionados

| Archivo | Uso |
|---------|-----|
| `database/migrations/049_santamarta_seed_basico_mysql.sql` | SQL de datos mínimos (ejecutar **después** de importar estructura vacía) |
| `backend/.env` | `MYSQL_DATABASE=santamarta` cuando se conecte la intranet de prueba/producción Santa Marta |
| `md/CONFIGURACION_ENV.md` | Variables de entorno generales |

---

## PASO 1 — Exportar estructura (BD actual Vanguard)

1. Entrar a **phpMyAdmin**.
2. Seleccionar la base de datos que usa hoy la intranet Vanguard.
3. Pestaña **Exportar** → método **Personalizado**.
4. **Todas las tablas** seleccionadas.
5. Marcar **Estructura** → **Sí**.
6. Marcar **Datos** → **No** (imprescindible: sin filas).
7. Formato **SQL** → descargar (ej. `vanguard_estructura.sql`).

**Verificación:** el archivo debe contener `CREATE TABLE` pero **no** `INSERT INTO` masivos de alumnos/pagos.

**Nota:** si la BD Vanguard tiene migraciones recientes aplicadas en producción, exportar desde **esa** BD asegura que `santamarta` tenga las mismas tablas (fichas IA, encuestas, etc.). Si faltara alguna tabla, revisar carpeta `database/migrations/` y ejecutar los `.sql` que falten sobre `santamarta`.

---

## PASO 2 — Crear la base `santamarta`

1. phpMyAdmin → **Bases de datos**.
2. Nombre: **`santamarta`**.
3. Cotejamiento: **`utf8mb4_unicode_ci`** (o el mismo que usa Vanguard).
4. **Crear**.

---

## PASO 3 — Importar estructura vacía

1. Seleccionar **`santamarta`**.
2. **Importar** → elegir el `.sql` del paso 1.
3. Esperar fin sin errores.

**Comprobar:** tablas como `alumnos`, `pagos`, `matriculas`, `publicaciones` → **0 filas**.

Errores frecuentes:

- **DEFINER / triggers:** a veces hay que exportar sin rutinas o editar el SQL.
- **Tabla ya existe:** reimportar solo si la BD está vacía; si no, borrar BD y recrear.

---

## PASO 4 — Datos básicos (semilla)

1. BD **`santamarta`** → pestaña **SQL**.
2. Copiar y ejecutar el contenido de:

   `database/migrations/049_santamarta_seed_basico_mysql.sql`

### Qué inserta el script

| Elemento | Contenido |
|----------|-----------|
| **Colegio** | `Santa Marta Schools`, `anio_activo` / `anio_matriculas` 2026, pensiones/notas con defaults razonables |
| **Niveles** | INICIAL, PRIMARIA, SECUNDARIA (ajustar `grado_minimo` / `grado_maximo` si hace falta) |
| **Turno** | Mañana (si `turnos.colegio_id` existe) |
| **Admin inicial** | DNI `00000000`, contraseña temporal **`password`** (SHA1 en BD) — **cambiar al primer login** |

Si algún `INSERT` falla por columnas **NOT NULL** que no están en el script:

- phpMyAdmin → tabla **`colegios`** → **Insertar** manualmente.
- Usar la BD Vanguard solo como **referencia de nombres de columnas**, sin copiar datos reales.

### Consultas de verificación

```sql
SELECT id, nombre, anio_activo FROM colegios;
SELECT id, nombre, colegio_id FROM niveles;
SELECT id, usuario, tipo, colegio_id FROM usuarios WHERE tipo = 'ADMINISTRADOR';
```

---

## PASO 5 — Conectar la intranet (cuando llegue el momento)

**Solo entorno de prueba o instancia dedicada Santa Marta** — no cambiar producción Vanguard sin respaldo.

En `backend/.env`:

```env
MYSQL_DATABASE=santamarta
```

Reiniciar backend:

```bash
pm2 restart intranet2026-backend
```

Login inicial: DNI **`00000000`**, clave **`password`** → cambiar de inmediato.

---

## PASO 6 — Completar configuración desde Admin (sin SQL)

1. **Admin → Configuración:** RUC, razón social, dirección, UGEL, logo, inicio de pensiones (ej. Marzo), rangos de notas, bloqueo de deudores, etc.
2. **Admin → Académico → Niveles:** revisar INICIAL / PRIMARIA / SECUNDARIA.
3. **Admin → Académico → Grados:** crear grados y secciones del año activo.
4. **Admin → Académico → Cursos / áreas:** catálogo de asignaturas.
5. **Admin → Equipo:** usuarios reales (admin, docentes); eliminar o desactivar el `00000000` de prueba.

**No copiar** desde Vanguard: alumnos, matrículas, pagos, notas, asistencias, mensajes, publicaciones, auditoría masiva.

---

## Tablas que NO se copian (operativas / históricas)

Ejemplos (lista orientativa):

- `alumnos`, `apoderados`, `familias`, `matriculas`
- `pagos`, `notas`, `asistencias`, `incidencias`
- `mensajes`, `notificaciones`, `publicaciones`, `comunicados`
- `fichas_ia_trabajos`, logs de auditoría masivos
- Cualquier tabla con millones de filas históricas

## Tablas / datos que sí interesan en la semilla (catálogo / config)

- `colegios` (configuración global del colegio)
- `niveles`, `turnos`
- Luego desde UI: `grupos`, `cursos`, `areas`, `asignaturas`, `personal`, `usuarios`
- Plantillas del sistema (indicadores, fichas IA, etc.) se pueden crear desde Admin o copiar **solo filas de plantilla** con `colegio_id` correcto en una fase posterior si se desea

---

## Contexto relacionado (otros temas analizados en la misma línea)

### Web pública administrable desde intranet React

- La web del colegio (carpeta aparte) y la intranet pueden compartir **MySQL**: tablas tipo `web_noticias`, `web_banners` con `colegio_id`.
- Intranet = panel de edición; web = lectura y render.
- **No** se editan archivos HTML en disco en cada cambio; se consulta la BD.

### Agente WhatsApp

- FAQ / admisión / contenido público → puede leer web o BD pública.
- Avisos de hijo, notas, asistencia → deben ir por **API intranet** + identificación del apoderado, no por la carpeta de la web marketing.

### Correos desactivados en React

- Variable `EMAIL_ENVIO_HABILITADO=true` en `backend/.env` para reactivar SMTP.
- Ver `backend/docs/EMAIL_CUENTAS_Y_PUSH.md`.

### Despliegue VPS (Vanguard)

```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm install && npm run build && cd .. && pm2 restart all
```

Repo: https://github.com/LiamFranKi/intranet-2026

---

## Checklist antes de ejecutar (cuando termine el sistema Vanguard)

- [ ] Sistema Vanguard estable en producción.
- [ ] Export estructura desde BD Vanguard **actualizada** (con todas las migraciones aplicadas).
- [ ] BD `santamarta` creada e importada.
- [ ] Ejecutado `049_santamarta_seed_basico_mysql.sql`.
- [ ] Verificación SQL (colegio, niveles, admin).
- [ ] `.env` / instancia apuntando a `santamarta` (entorno de prueba).
- [ ] Login admin y cambio de contraseña.
- [ ] Configuración completa en Admin + grados/cursos del año activo.
- [ ] Decisión de dominio/subdominio para Santa Marta (ej. `santamarta.tudominio.com`).

---

## Notas finales

- **No hacer copia directa completa** de la BD Vanguard → eso trae 10 años de historial.
- El script `049` es **punto de partida**; la estructura real de `colegios` / `personal` puede requerir ajustes según columnas NOT NULL en el servidor.
- Si al ejecutar el paso 4 aparece un error concreto de MySQL, guardar el mensaje y ajustar el INSERT con las columnas obligatorias de esa versión de esquema.

*Documento creado para retomar la migración Santa Marta cuando el desarrollo del sistema principal esté completo.*
