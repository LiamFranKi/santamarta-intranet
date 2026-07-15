# Pendiente: App propia de entrada/salida del personal (asistencia)

**Estado:** aplazado / a **evaluar después** (solo contexto de análisis; no implementar aún).  
**Motivo:** hoy funciona el huellero externo → Excel + escáner QR compartido; conviene decidir producto (self-check-in vs solo operador) antes de codificar.

**Fecha del análisis:** 2026-07-15 (conversación con el cliente/admin).

---

## Objetivo de negocio (a evaluar)

- Dejar de depender (o reducir) la importación Excel del **huellero de otra aplicación**.
- Tener **aplicación/flujo propio** de entrada y salida del personal, en la línea del QR/escaneo que ya usan alumnos (con operador de portería).
- Clarificar: ¿self-marcación del trabajador, o siempre un operador escanea (como ahora)?

---

## Situación actual (resumen)

| Canal | Quién | Qué hace |
|-------|--------|----------|
| **Excel huellero** | Admin → Herramientas → Tardanzas | Importa marcaciones externas → `asistencia_registros` (ENTRADA) |
| **Escáner QR** `/asistencia/escaneo` | Usuario `ASISTENCIA`, admin o tutor | Misma pantalla para **alumnos y personal**; el backend diferencia |
| **Mi QR** | Sobre todo perfil DOCENTE | Genera QR para que lo escaneen |
| **Mis Asistencias** | Personal con ficha | Solo **consulta** tardanzas/marcaciones; no marca |

### Hallazgos clave del análisis

1. El personal **no** tiene hoy pantalla “yo marco mi entrada” en la intranet.
2. Sí existe perfil **`ASISTENCIA`** (portería) que opera el escáner.
3. El **mismo escáner diferencia** alumno vs personal (busca alumno primero, si no personal; luego bifurca tablas/notificaciones).
4. Alumnos: `asistencia_registros` + `matriculas_asistencias` + avisos a apoderados.
5. Personal: solo `asistencia_registros` + push; tardanzas laborales usan `personal.hora_entrada`.
6. No hay integración en vivo con el huellero (solo Excel). No hay tablas `personal_asistencia` aparte: todo en `asistencia_registros`.

### Archivos / rutas de referencia

- Escáner: `frontend/src/pages/AsistenciaEscaneo.jsx`, `backend/routes/asistencia.routes.js`
- Import Excel: `frontend/src/pages/admin/AdminTardanzas.jsx`, `backend/utils/adminTardanzasHuellero.js`, `backend/routes/admin.tardanzas.routes.js`
- Consulta personal: `ModalAsistencias.jsx`, `backend/routes/personal.tardanzas.routes.js`
- Tabla: `asistencia_registros` (`database/migrations/003_asistencia_registros.sql`)
- Reporte: Reportes generales → Asistencia del personal

---

## Decisiones pendientes antes de programar

1. **Modelo de uso**
   - A) Tablet operador `ASISTENCIA` (evolución del escáner actual).
   - B) App self-service del personal (nuevo; anti-fraude: geo, PIN, etc.).
   - C) Ambos.

2. **Prioridad de fuentes el mismo día**  
   Si import Excel y QR/app escriben el mismo día: ¿qué hora gana? (primera, última, o un solo origen oficial).

3. **Mi QR para todos los cargos**  
   Hoy el menú fuerte es docente; otros tipos con `personal_id` pueden resolverse por DNI en escáner, pero la UX “Mi QR” no está igual para todos.

4. **Excel**  
   ¿Queda como contingencia / migración, o se apaga cuando la app esté estable?

---

## Encaje técnico sugerido (cuando se retome)

- Seguir usando **`asistencia_registros`** como fuente de verdad (reportes, Mis Asistencias y tardanzas admin ya dependen de ella).
- Reutilizar bifurcación alumno vs personal del `POST /api/asistencia/registrar`.
- App propia = **nuevo cliente** de esa API, no módulo paralelo de tablas, salvo que se separe explícitamente laboral vs escolar.

---

## Checklist alto nivel (futuro)

1. Definir política de producto (operador vs self / prioridad de marcas).
2. Diseñar UX/tablet o PWA (entrada–salida, reintentos, offline parcial).
3. Extender permisos/endpoints si hace falta self-check-in autenticado.
4. “Mi QR” / carnet para todo personal que deba marcar.
5. Plan de transición del import Excel (contingencia).
6. Pruebas: no romper asistencia de alumnos ni reportes de tardanzas.

---

## Qué NO hacer todavía

- No programar la app ni endpoints nuevos hasta cerrar las decisiones de arriba.
- No eliminar el import Excel sin plan de contingencia.
