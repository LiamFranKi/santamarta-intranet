# Contexto: Administrador con hijos a cargo (vista como apoderado)

Documento para **retomar e implementar** sin perder el análisis. No sustituye leer el código; resume decisión y pasos sugeridos.

**Fecha de referencia:** abril 2026.

---

## Objetivo

Que un usuario **ADMINISTRADOR** (o **PROMOTORÍA**) que también es **personal con DNI vinculado como apoderado** en `familias` pueda ver en el menú lateral la opción **«Hijos a cargo»** (igual que el docente en modo «Como apoderado»), **sin** cambiar su `tipo` en base de datos ni duplicar usuario.

Ubicación sugerida del ítem en el menú: **al final**, antes de cerrar sesión.

---

## Conclusión del análisis: es viable y acotado

- **No** hace falta dar «permiso de apoderado» como rol nuevo en `usuarios`.
- Se **reutiliza** la misma API y pantalla que ya usa el docente-apoderado: `GET /api/docente/roles-adicionales` y ruta **`/docente/hijos`** (`DocenteHijos.jsx`).
- El router **docente** ya permite `ADMINISTRADOR` y `PROMOTORÍA` en el middleware global (`esAdminOPromotoria`).
- La lógica de «es apoderado con hijos» usa **`personal_id`** + DNI en `personal` → coincidencia en `apoderados` → `familias` + matrículas vigentes; **no depende** de que `tipo` sea `DOCENTE`.

---

## Estado actual del código (referencia)

### Backend

- Archivo: `backend/routes/docente.routes.js`
- `GET /roles-adicionales`: usa `req.user.personal_id`; si no hay `personal_id`, responde 404.
- Comprueba hijos vía DNI del `personal` y tablas `apoderados`, `familias`, `matriculas`, etc.

### Frontend

- **`frontend/src/components/DashboardLayout.jsx`**
  - Solo llama a `GET /docente/roles-adicionales` cuando `user.tipo === 'DOCENTE'`.
  - Por eso **`rolesAdicionales.es_apoderado`** no se rellena para administrador y **no aparece** el bloque «Como apoderado / Hijos a cargo» en el sidebar de admin.
- **`frontend/src/App.js`**
  - Ruta `/docente/hijos` usa `<PrivateRoute>` **sin** `requiredType="DOCENTE"` → cualquier usuario autenticado puede entrar a la ruta; la pantalla decide según la API.
- **`frontend/src/pages/DocenteHijos.jsx`**
  - Carga datos con `api.get('/docente/roles-adicionales')`.

---

## Qué implementar (checklist sugerido)

1. **`DashboardLayout.jsx`**
   - Extender el `useEffect` que carga roles adicionales para que también ejecute cuando `user.tipo` sea `ADMINISTRADOR` o `PROMOTORÍA`, **idealmente solo si existe `user.personal_id`** (evitar llamadas inútiles o 404 ruidosos).
   - Reutilizar el mismo estado `rolesAdicionales.es_apoderado` (y opcionalmente `hijos` si hiciera falta en el layout; hoy el menú solo necesita el flag).

2. **Menú administrador** (misma rama del sidebar donde están Dashboard, Usuarios, etc.)
   - Si `rolesAdicionales.es_apoderado`, mostrar sección tipo **«Como apoderado»** y enlace a **`/docente/hijos`** (misma URL que docente), colocada **al final**, antes de cerrar sesión.

3. **Verificación backend (grep al implementar)**
   - Revisar si algún endpoint bajo `/docente/hijos/...` asume `req.user.tipo === 'DOCENTE'` de forma estricta; el middleware global ya admite admin/promotoría, pero conviene validar handlers sueltos.

4. **Casos límite**
   - Admin **sin** `personal_id` o sin DNI alineado con `apoderados`: no mostrar el menú; si accede manualmente a `/docente/hijos`, coherente con mensaje «no eres apoderado» o error controlado.

---

## Riesgos y mitigaciones (resumen)

| Riesgo | Mitigación |
|--------|------------|
| Admin sin vínculo `personal` | No mostrar ítem; no forzar llamada si no hay `personal_id`. |
| Confusión visual admin vs apoderado puro | Etiqueta clara: «Como apoderado»; mismo patrón que docente. |
| Alcance de permisos | No se otorgan permisos nuevos de administración; solo atajo UI a flujo ya permitido en router docente. |

---

## Archivos clave para tocar (implementación)

| Archivo | Cambio esperado |
|---------|------------------|
| `frontend/src/components/DashboardLayout.jsx` | Cargar `roles-adicionales` para admin/promotoría con `personal_id`; bloque menú «Hijos a cargo». |
| Opcional: revisión | `App.js` (solo si se quiere restringir tipos en ruta; hoy no es obligatorio). |
| Revisión | `backend/routes/docente.routes.js` (handlers `/hijos/*` si hubiera checks de tipo). |

---

## Cómo usar este documento en un nuevo chat

> Lee `docs/CONTEXTO_ADMIN_HIJOS_A_CARGO_COMO_APODERADO.md` e implementa el menú Hijos a cargo para administrador/promotoría con `personal_id`.

---

## Nombre del archivo

**`docs/CONTEXTO_ADMIN_HIJOS_A_CARGO_COMO_APODERADO.md`**

Ruta completa en el repo: `docs/CONTEXTO_ADMIN_HIJOS_A_CARGO_COMO_APODERADO.md`
