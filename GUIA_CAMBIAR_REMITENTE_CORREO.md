# 📧 CÓMO CAMBIAR EL REMITENTE DE LOS CORREOS

Esta guía explica cómo usar tu nuevo correo Gmail (con el nombre del colegio) como remitente de los correos del sistema.

---

## 📌 PASO 1: Crear la Clave de Aplicación en Gmail

La "Clave de aplicación" (App Password) es una contraseña especial de 16 caracteres que Gmail genera para que aplicaciones externas puedan enviar correos sin usar tu contraseña normal.

### Requisito previo: Verificación en 2 pasos

1. Entra a tu cuenta de Google: https://myaccount.google.com  
2. Ve a **Seguridad** (menú izquierdo)  
3. Activa **Verificación en 2 pasos** si aún no está activada (Gmail la exige para crear claves de aplicación)

### Crear la clave de aplicación

1. Entra a: https://myaccount.google.com/apppasswords  
   - O manualmente: **Cuenta de Google → Seguridad → Verificación en 2 pasos** (al final) → **Contraseñas de aplicaciones**

2. Si te pide volver a ingresar tu contraseña, hazlo.

3. En **"Seleccionar app"** → elige **"Correo"** o **"Otra (nombre personalizado)"** y escribe algo como "Intranet Colegio".

4. Haz clic en **"Generar"**.

5. **Copia la clave de 16 caracteres** que aparece (ej: `abcd efgh ijkl mnop`).  
   - Puedes escribirla sin espacios: `abcdefghijklmnop`  
   - Guárdala en un lugar seguro; solo se muestra una vez.

---

## 📌 PASO 2: Dónde cambiar la configuración de correo

**Todo se configura en el archivo `backend/.env`**. No hace falta tocar el código.

Las variables que debes actualizar son:

| Variable        | Descripción                        | Ejemplo                         |
|-----------------|------------------------------------|---------------------------------|
| `EMAIL_HOST`    | Servidor SMTP (Gmail)              | `smtp.gmail.com`                |
| `EMAIL_PORT`    | Puerto (Gmail usa 587)             | `587`                           |
| `EMAIL_USER`    | Tu nuevo correo Gmail              | `colegio@tudominio.com`         |
| `EMAIL_PASSWORD`| Clave de aplicación (16 caracteres)| `xxxxxxxxxxxxxxxx`              |
| `EMAIL_FROM`    | Remitente (suele ser igual a USER) | `colegio@tudominio.com`         |
| `VAPID_EMAIL`   | Mismo correo (para push)           | `colegio@tudominio.com`         |

---

## 📌 PASO 3: Editar el .env en el VPS

**Importante:** El archivo `.env` **no se sube a GitHub** (contiene contrenciales). Debes editarlo **directamente en el VPS** con Putty o WinSCP.

### Opción A: Con Putty (nano)

```bash
# Conectarte al VPS con Putty, luego:
cd ~/intranet2026

# Editar el archivo
nano backend/.env
```

Busca o agrega estas líneas y pon los valores de tu nuevo correo:

```env
# Email (SMTP Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=TU_CORREO_COLEGIO@gmail.com
EMAIL_PASSWORD=TU_CLAVE_APP_16_CARACTERES
EMAIL_FROM=TU_CORREO_COLEGIO@gmail.com

# PWA - Notificaciones Push (usa el mismo correo)
VAPID_EMAIL=TU_CORREO_COLEGIO@gmail.com
```

*(Reemplaza `TU_CORREO_COLEGIO` y `TU_CLAVE_APP_16_CARACTERES` con tus datos reales. **Nunca** subas credenciales reales a GitHub.)*

**Guardar en nano:** `Ctrl + O` → `Enter` → `Ctrl + X`

### Opción B: Con WinSCP

1. Conecta al VPS con WinSCP.  
2. Navega a `intranet2026/backend/`.  
3. Edita el archivo `.env` (clic derecho → Editar).  
4. Cambia `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` y `VAPID_EMAIL`.  
5. Guarda y cierra.

---

## 📌 PASO 4: Reiniciar el backend

Después de guardar el `.env`, reinicia el servidor para que tome los cambios:

```bash
cd ~/intranet2026
pm2 restart all
```

---

## ✅ Verificar

- Los correos de asistencia, notificaciones, etc. deberían enviarse desde tu nuevo correo.  
- Si algo falla, revisa los logs: `pm2 logs`

---

## 📁 Resumen de archivos

- **Configuración de correo:** `backend/.env` (solo en el VPS, no en GitHub)  
- **Código que usa la config:** `backend/services/emailService.js` (lee de `process.env`, no tocar)

---

## 🔒 Seguridad

- **Nunca** subas el archivo `.env` a GitHub.  
- No compartas tu clave de aplicación.  
- Si la expones, genera una nueva en https://myaccount.google.com/apppasswords y actualiza el `.env`.
