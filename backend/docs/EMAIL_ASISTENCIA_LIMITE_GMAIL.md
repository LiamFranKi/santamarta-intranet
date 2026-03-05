# Límite de envío Gmail y correos de asistencia

## Por qué sale "Daily user sending limit exceeded"

- **Una sola cuenta** (`EMAIL_USER` / `EMAIL_PASSWORD`) se usa para **todo**: asistencia (QR), notificaciones a apoderados (tareas, exámenes, asistencia manual), etc.
- **Gmail** tiene un límite por cuenta:
  - Cuenta **gratuita**: unos **500 correos/día**.
  - **Google Workspace**: unos **2000/día** (según plan).
- Cada escaneo de QR puede enviar **varios correos** (uno por apoderado). Si muchos alumnos marcan entrada y salida, se llega al límite y **todos** los envíos de esa cuenta empiezan a fallar con ese error.
- Los **otros módulos** usan la misma cuenta; si “funcionan” es porque envían menos correos o en momentos en que aún no se ha alcanzado el límite.

## Solución: cuenta solo para asistencia

El backend permite usar **otra cuenta SMTP solo para correos de asistencia** (entrada/salida por QR y correo al docente). Así la cuenta principal no se gasta en asistencia.

### 1. Variables en `backend/.env`

Añade (opcional):

```env
# Cuenta SOLO para correos de asistencia (entrada/salida QR). Si no se definen, se usa EMAIL_USER.
EMAIL_ASISTENCIA_USER=tu-otro-correo@gmail.com
EMAIL_ASISTENCIA_PASSWORD=contraseña-de-aplicacion

# Opcionales (por defecto usa los mismos que EMAIL_HOST / EMAIL_PORT)
# EMAIL_ASISTENCIA_HOST=smtp.gmail.com
# EMAIL_ASISTENCIA_PORT=587
```

- Si **defines** `EMAIL_ASISTENCIA_USER` y `EMAIL_ASISTENCIA_PASSWORD`: los correos de **asistencia** se envían con esta cuenta; el resto sigue usando `EMAIL_USER`.
- Si **no** las defines: todo sigue igual (asistencia también usa `EMAIL_USER`).

### 2. Segunda cuenta Gmail

- Crea otra cuenta Gmail (o usa una que ya tengas).
- Activa **verificación en 2 pasos** y genera una **contraseña de aplicación**.
- Pon ese correo en `EMAIL_ASISTENCIA_USER` y la contraseña de aplicación en `EMAIL_ASISTENCIA_PASSWORD`.

Así tienes **otro límite de ~500/día** solo para asistencia y la cuenta principal queda para el resto.

### 3. Alternativa: SendGrid / Mailgun

Puedes usar un servicio como SendGrid o Mailgun para asistencia:

- `EMAIL_ASISTENCIA_HOST=smtp.sendgrid.net` (o el host que te den).
- `EMAIL_ASISTENCIA_PORT=587`
- `EMAIL_ASISTENCIA_USER=apikey` (en SendGrid suele ser literal `apikey`).
- `EMAIL_ASISTENCIA_PASSWORD=tu-api-key`

Límites más altos y pensados para envío transaccional.

## Resumen de qué usa cada función

| Función                         | Cuenta usada                                      |
|---------------------------------|---------------------------------------------------|
| Correos de **asistencia** (QR)  | `EMAIL_ASISTENCIA_*` si existen, si no `EMAIL_*`  |
| Resto (notificaciones, etc.)   | Siempre `EMAIL_USER` / `EMAIL_PASSWORD`           |

## Reiniciar backend

Después de cambiar `.env`:

```bash
pm2 restart 0
```

(o el id de `intranet2026-backend` en `pm2 list`).
