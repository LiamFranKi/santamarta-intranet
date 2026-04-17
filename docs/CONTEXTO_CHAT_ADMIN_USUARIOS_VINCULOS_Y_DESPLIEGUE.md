# Contexto de sesión: Admin Usuarios (vínculos familias) y despliegue

Documento para que un **nuevo chat** o desarrollador retome el trabajo sin perder contexto. Fecha de referencia de la conversación: abril 2026.

---

## Proyecto y despliegue

| Concepto | Valor |
|----------|--------|
| Workspace local | `c:\react-aula-virtual` |
| Rama Git | `main` |
| Repositorio GitHub | https://github.com/LiamFranKi/intranet-2026 |
| Proyecto en VPS (PuTTY) | `/home/vanguard/intranet2026` |

**Regla de despliegue en el servidor:** después de `git pull` es obligatorio `npm run build` en `frontend` y luego `pm2 restart all` desde la raíz del proyecto.

**Comando de una línea para PuTTY:**

```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
```

**Último push documentado en esa sesión:** commit `aee2eb6` (mensaje orientativo: *Admin usuarios: quitar vínculos (alumnos tabla, apoderados); equipo familias; ajustes docente y notificaciones*). Ese commit agrupó **17 archivos**; no solo cambios de admin usuarios (también rutas backend y páginas docente/admin según el estado del repo en ese momento). Para el detalle exacto: `git show aee2eb6`.

---

## Objetivo de negocio

En **Administrador → Usuarios**, dar **simetría** al gestionar vínculos en la tabla **`familias`**:

1. **Personal (equipo):** poder **vincular** y **quitar** hijos (como apoderado por DNI), alineado con la experiencia de apoderados.
2. **Alumnos:** ya existía vincular apoderado; se añadió **quitar vínculo** entre apoderado y ese alumno.
3. **Apoderados:** ya existía vincular alumno; se añadió **quitar vínculo** del hijo con ese apoderado.

---

## Backend

**Archivo principal:** `backend/routes/admin.usuarios.routes.js`  
**Montaje:** rutas bajo `/api/admin/usuarios` (ver `server.js`).

Cambios relevantes:

- **GET** `/admin/usuarios/equipo/:id`  
  - La respuesta JSON incluye **`apoderado_id_para_familias`**: un id estable de la tabla `apoderados` con el mismo DNI que el personal (p. ej. `Math.min` sobre los ids encontrados), para poder usar los endpoints de vinculación de familias desde la ficha de personal.

- **Corrección de scope:** variable `selfApoderadoIds` declarada como `let selfApoderadoIds = []` **antes** del bloque `try` de familias, y asignación dentro del `try`, para que exista al construir `apoderado_id_para_familias` en `res.json`.

- **DELETE** `/admin/usuarios/alumnos/:alumnoId/apoderados/:apoderadoId`  
  - Elimina la relación en `familias` para ese par `alumno_id` + `apoderado_id`, validando colegio mediante `alumnos` y `apoderados`.

- **DELETE** `/admin/usuarios/apoderados/:apoderadoId/alumnos/:alumnoId`  
  - Misma fila en `familias` (ruta espejo para el frontend).

---

## Frontend

| Archivo | Qué se hizo |
|---------|-------------|
| `frontend/src/pages/admin/AdminUsuariosEquipo.jsx` | Sección “Hijos en el colegio” visible; vincular por DNI (POST usando `apoderado_id_para_familias`); quitar vínculo por hijo (DELETE apoderado/alumno); refresco del modal; aviso si no hay `apoderado_id_para_familias`. |
| `frontend/src/pages/admin/AdminUsuariosEquipoTabla.jsx` | Misma lógica que en tarjetas, para vista tabla. |
| `frontend/src/pages/admin/AdminUsuariosAlumnos.jsx` | Función `desvincularApoderadoDeAlumno` + botón “Quitar vínculo” por apoderado (SweetAlert). |
| `frontend/src/pages/admin/AdminUsuariosAlumnosTabla.jsx` | Igual que Alumnos.jsx: desvincular + botón en el modal de la tabla. |
| `frontend/src/pages/admin/AdminUsuariosApoderados.jsx` | Función `desvincularAlumnoDeApoderado` + “Quitar vínculo” en cada hijo (“Hijos a cargo”); refresco con `refrescarDetalleApoderadoModal`. |

**Patrones UI:** confirmación con SweetAlert; mensaje distinto si es el **último** apoderado o el **último** hijo; botones tipo `admin-usu-btn-danger admin-usu-btn-compact`.

**Nota:** no hay un `AdminUsuariosApoderadosTabla.jsx` con el mismo bloque de hijos según el grep de esa época; solo `AdminUsuariosApoderados.jsx` para la vista de apoderados en ese flujo.

---

## Base de datos

Se asume la tabla **`familias`** ya existente. Esta sesión no documenta una migración nueva dedicada exclusivamente a estos DELETE.

---

## Verificación sugerida

- Probar en UI: vincular/desvincular en **Personal**, **Alumnos** (vista normal y tabla), **Apoderados**.
- `node --check` sobre `backend/routes/admin.usuarios.routes.js` si se sigue editando.
- Linter en los `.jsx` modificados.

---

## Cómo usar este archivo en un nuevo chat

Pegar al inicio del mensaje algo como:

> Lee `docs/CONTEXTO_CHAT_ADMIN_USUARIOS_VINCULOS_Y_DESPLIEGUE.md` y continúa desde ahí: [tu nueva tarea].

O adjuntar/abrir ese archivo en el IDE para que el asistente lo indexe.
