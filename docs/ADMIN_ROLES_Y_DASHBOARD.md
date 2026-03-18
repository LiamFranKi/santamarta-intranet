# Contexto: Módulo Administrador, Roles y Dashboards

Este documento deja por escrito el enfoque acordado para el perfil Administrador y los demás roles (Director, Coordinador, Gerente, etc.) de la intranet, y cómo se manejan los dashboards por rol.

---

## 1. Enfoque general: un solo módulo, permisos por rol

### Qué se hace

- Se construye **un solo módulo de administración** con todas las funciones pensadas para el sistema: gestión de usuarios, comunicados, alertas, reportes, configuración, etc. Ese es el perfil **Administrador** completo.

- Los demás perfiles (**Director**, **Coordinador**, **Gerente**, etc.) **no** se programan desde cero. Usan **el mismo código** que el administrador; la diferencia es que a cada rol se le **quitan** (o no se le dan) permisos sobre ciertas partes:
  - **Administrador:** ve y puede usar todo.
  - **Director:** por ejemplo solo Comunicados y Alertas (no Usuarios).
  - **Coordinador:** por ejemplo solo Alertas (no Usuarios ni Comunicados).
  - Y así con cada rol, según lo que se defina.

### Cómo se implementa

- **Backend:** En cada ruta del área admin se verifica el **rol** (o una tabla de permisos). Si el usuario no tiene permiso para esa función, el API responde **403** y no expone datos que no le correspondan.

- **Frontend:** El menú y las rutas son los mismos para todos los que entran al “admin”, pero:
  - Los **ítems de menú** se muestran u ocultan según el rol (permisos).
  - Si alguien intenta entrar por URL a una pantalla sin permiso, el backend lo bloquea y el frontend puede redirigir o mostrar “sin acceso”.

Así se evita programar una aplicación distinta para cada perfil; solo se controla **qué puede ver y hacer** cada rol.

---

## 2. Dashboard distinto por rol

### Qué se acordó

- **Cada rol puede tener una “cara principal” distinta:** es decir, una pantalla de inicio (dashboard) con **estadísticas y contenidos diferentes** según el rol.

- Todos pueden compartir el mismo **menú lateral** (con ítems ocultos por permiso), pero la **pantalla de inicio** y las estadísticas que ve cada uno pueden ser distintas.

### Opciones de implementación

1. **Un solo dashboard que cambia por rol**  
   Una ruta (ej. `/admin` o `/dashboard`). Según el rol del usuario se muestran unos u otros bloques/estadísticas (tarjetas, gráficos, KPIs). Ejemplo: administrador ve usuarios + comunicados + alertas; director solo comunicados + alertas; coordinador solo alertas u otras métricas.

2. **Dashboard por rol (varias “caras”)**  
   Cada rol tiene su propio componente de dashboard (ej. `DashboardAdministrador`, `DashboardDirector`, `DashboardCoordinador`) con layout y estadísticas propios. La ruta principal (o un layout) decide cuál renderizar según el rol.

Ambas opciones son válidas; se puede elegir una u otra (o combinar) según la complejidad de cada dashboard.

---

## 3. Resumen para desarrollo

| Tema | Decisión |
|------|----------|
| Módulo admin | Uno solo, con todas las funciones. |
| Otros roles | Mismo código; restringir por rol (menús + API). |
| No hacer | No programar cada perfil (Director, Coordinador, etc.) por separado. |
| Dashboard | Cada rol puede tener una pantalla principal (estadísticas) distinta. |
| Menú | Puede ser común; ítems visibles/ocultos según permisos del rol. |

---

## 4. Referencia en el proyecto

- Regla de Cursor para contexto al trabajar en admin: `.cursor/rules/admin-roles-dashboard.mdc`
- Este documento: `docs/ADMIN_ROLES_Y_DASHBOARD.md`

Cuando se implemente el administrador o se añadan nuevos roles/dashboards, usar este enfoque para mantener un solo código y solo variar permisos y la “cara” de inicio por rol.
