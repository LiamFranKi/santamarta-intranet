# Cuentas de correo por módulo y relación con las notificaciones push

## Cuatro cuentas opcionales

Puedes usar **hasta 4 cuentas** para repartir el límite diario de Gmail (~500/día por cuenta):

| Cuenta en `.env` | Se usa para |
|------------------|-------------|
| **EMAIL_USER** / **EMAIL_PASSWORD** (principal) | Publicaciones, avisos, mensajes docente→apoderados, estrellas, incidencias, etc. |
| **EMAIL_ASISTENCIA_USER** / **EMAIL_ASISTENCIA_PASSWORD** | Asistencia por QR (entrada/salida) y asistencia manual del tutor |
| **EMAIL_TAREA_USER** / **EMAIL_TAREA_PASSWORD** | Tareas por vencer, tareas vencidas sin entrega, nota de tarea |
| **EMAIL_EXAMEN_USER** / **EMAIL_EXAMEN_PASSWORD** | Notificaciones relacionadas con exámenes (cuando se implemente envío de correo) |

Si **no** defines una cuenta opcional (ASISTENCIA, TAREA, EXAMEN), ese tipo de correo se envía con la **cuenta principal** (EMAIL_USER).

### Ejemplo de `backend/.env`

```env
# Principal: publicaciones, avisos, mensajes, etc.
EMAIL_USER=principal@gmail.com
EMAIL_PASSWORD=contraseña-app-principal

# Asistencia (QR y manual)
EMAIL_ASISTENCIA_USER=asistencias@gmail.com
EMAIL_ASISTENCIA_PASSWORD=contraseña-app-asistencias

# Tareas
EMAIL_TAREA_USER=tareas@gmail.com
EMAIL_TAREA_PASSWORD=contraseña-app-tareas

# Exámenes
EMAIL_EXAMEN_USER=examenes@gmail.com
EMAIL_EXAMEN_PASSWORD=contraseña-app-examenes

# Opcionales por cuenta (por defecto se usan EMAIL_HOST y EMAIL_PORT)
# EMAIL_ASISTENCIA_HOST=smtp.gmail.com
# EMAIL_ASISTENCIA_PORT=587
# EMAIL_TAREA_HOST=smtp.gmail.com
# EMAIL_EXAMEN_HOST=smtp.gmail.com
```

Para Gmail: verificación en 2 pasos + **contraseña de aplicación** (no la contraseña normal).

---

## ¿Por qué no llegaban las notificaciones PUSH? (no tiene que ver con los correos)

Las **notificaciones push** y los **correos** son independientes:

- **Push**: se envían por el servicio de push (VAPID, FCM, Apple) a las suscripciones guardadas en `push_subscriptions`. No usan email ni SMTP.
- **Correo**: se envían por SMTP (Gmail, etc.) con nodemailer.

Que no llegaran las push **no fue por los correos**. Las causas típicas son:

1. **Suscripciones expiradas (410)**  
   El navegador o el dispositivo dejó de considerar válida la suscripción (cierre de sesión, borrado de datos, mucho tiempo sin usar). Esas suscripciones se marcan como inactivas en BD y ya no se les envía push.  
   **Solución**: el apoderado debe **volver a permitir notificaciones** en la app o el navegador para que se cree una suscripción nueva.

2. **Bloque de correos podía bloquear el flujo**  
   Antes, si el envío de correos fallaba o tardaba mucho, el código podía no llegar a ejecutar el envío de push. Eso ya se corrigió: correos y push van en bloques separados (try/catch independientes), de modo que un fallo en el correo **no** impide que se envíen las push.

3. **Solo un proceso de backend**  
   Debe estar levantado solo **intranet2026-backend**. Si había otro proceso (por ejemplo "intranet"), podía generar confusión. Usa `pm2 list` y deja solo el que corresponda.

En resumen: que no llegaran las push no se debía al límite de correos ni a la cuenta de email; se debía a suscripciones 410 y/o al flujo anterior que podía no ejecutar el envío de push cuando fallaba el correo. Con las cuentas separadas y el flujo actual, los correos se reparten y las push se envían aunque falle el correo.

---

## Reiniciar backend

Después de cambiar `.env`:

```bash
pm2 restart intranet2026-backend
```

(o el id que muestre `pm2 list` para ese proceso).
