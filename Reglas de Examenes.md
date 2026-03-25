# Reglas de Examenes

## Contexto

Este documento guarda el acuerdo para mejorar la estabilidad de examenes en linea sin afectar a los alumnos durante horario activo.

Problemas reportados:

- El alumno entra al examen, pero al guardar respuestas aparece error.
- Al refrescar la pagina, en algunos casos se cierra sesion.
- Si se corta internet, el alumno puede seguir marcando y al final no todo se guarda.

Objetivo:

- Reducir perdidas de respuestas.
- Evitar errores por expiracion de sesion durante examen.
- Dar mensajes claros al alumno cuando hay problemas de sesion o conectividad.

---

## Alcance

Estas mejoras aplican solo al modulo de examenes.

No tocar otros modulos (mensajes, notas, etc.) con esta logica.

---

## Recomendaciones funcionales

### 1) Validacion de sesion al entrar al examen

- Antes de iniciar el intento, verificar si la sesion/token sigue valida.
- Si el token esta por vencer, intentar refrescarlo inmediatamente.
- Si no se puede refrescar:
  - no permitir iniciar examen;
  - mostrar alerta clara;
  - redirigir a login.

Mensaje sugerido:
"Tu sesion expiro o no pudo renovarse. Ingresa nuevamente para rendir el examen."

### 2) Vigilancia de sesion durante examen

- Hacer verificacion periodica (cada 30-60 segundos, no cada segundo).
- Si la sesion esta por vencer, refrescar de forma transparente.
- Si falla la renovacion:
  - avisar al alumno;
  - intentar guardar lo posible;
  - redirigir a login.

### 3) Manejo de conectividad (internet)

- Detectar estado online/offline durante examen.
- Si se corta internet:
  - mostrar banner visible: "Sin internet. Tus cambios no se estan enviando."
  - mantener al alumno informado en todo momento.
- Al volver internet:
  - reintentar sincronizacion automaticamente;
  - confirmar cuando las respuestas se guardaron.

Nota:
- No cerrar sesion solo por perder internet.
- Cerrar sesion solo por problema real de autenticacion (token invalido/expirado sin refresh).

### 4) Guardado seguro de respuestas

- Autosave al servidor en intervalos cortos (ej. 10-20 segundos o por cambio de respuesta).
- Guardar borrador local de respaldo durante el examen.
- Reintentar envio de respuestas pendientes al reconectar.

### 5) Regla de tiempo limite (importante)

- El tiempo oficial debe controlarlo el servidor.
- Definir politica institucional para envios fuera de tiempo:
  - opcion estricta: pasado el limite, no aceptar;
  - opcion flexible: aceptar con marca "fuera de tiempo" para revision;
  - opcion mixta: ventana de gracia o reapertura manual por incidencia.

Esta decision debe quedar formalmente definida antes de implementar sincronizacion offline avanzada.

---

## Orden sugerido de implementacion (tarde)

1. Validacion y refresh de sesion al abrir examen.
2. Autosave frecuente al servidor.
3. Banner de conectividad online/offline.
4. Borrador local y reintento al reconectar.
5. Politica final de tiempo limite + manejo de envios tardios.

---

## Mensajes UX recomendados para alumno

- "Sesion validada. Puedes iniciar tu examen."
- "Tu sesion se esta renovando..."
- "No hay internet. Tus cambios se guardaran localmente hasta reconectar."
- "Conexion restablecida. Sincronizando respuestas..."
- "Tus respuestas fueron guardadas correctamente."
- "El tiempo del examen finalizo."

---

## Nota operativa

Se pospone implementacion para la tarde para no interferir con alumnos que actualmente usan el sistema.

