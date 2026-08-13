# 🔍 DEBUG: Notificaciones Push y Correos en Asistencia

## ❌ Problema Reportado

- No se envían notificaciones push
- No se envían correos de aviso
- Error al intentar registrar ENTRADA 2 veces

---

## ✅ Cambios Realizados

### 1. **Verificación de Duplicados Mejorada**

Se mejoró la lógica para prevenir registros duplicados:

- ✅ **ENTRADA cuando ya existe entrada HOY** → Rechazado con mensaje claro
- ✅ **SALIDA cuando ya existe entrada pero NO salida** → Permitido (actualiza)
- ✅ **SALIDA cuando ya tiene entrada Y salida** → Rechazado
- ✅ **ENTRADA primera vez HOY** → Permitido
- ✅ **SALIDA sin entrada previa** → Rechazado

### 2. **Logs Detallados Agregados**

Ahora el sistema registra:
- `📋 [ASISTENCIA]` - Estado de registro
- `📧 [ASISTENCIA]` - Proceso de correos
- `📱 [ASISTENCIA]` - Proceso de push notifications
- `✅` / `❌` - Resultados de cada operación

### 3. **Verificación de Configuración**

El sistema ahora verifica:
- Variables de entorno de email configuradas
- VAPID keys configuradas
- Conexión SMTP disponible

---

## 🔍 Cómo Verificar los Logs

### **En el VPS:**

```bash
# Ver logs en tiempo real
pm2 logs intranet2026-backend --lines 100

# O ver solo errores
pm2 logs intranet2026-backend --err --lines 50
```

### **Logs Esperados al Registrar Asistencia:**

```
📋 [ASISTENCIA] Registrando ENTRADA para usuario 1234 en fecha 2026-02-09
📋 [ASISTENCIA] Registro existente encontrado: { id: 1, tipo_registro: 'ENTRADA', ... }
❌ [ASISTENCIA] Ya existe una entrada registrada hoy para este usuario

📧 [ASISTENCIA] Verificando notificaciones para tipo_usuario: ALUMNO, datosUsuario: existe
📧 [ASISTENCIA] Iniciando proceso de notificaciones para alumno: Juan Pérez
📧 [ASISTENCIA] Encontrados 2 apoderados con email para el alumno
📧 [ASISTENCIA] Enviando correos a 2 apoderados...
📧 [ASISTENCIA] Enviando correo a: padre@email.com
✅ [ASISTENCIA] Correo enviado exitosamente a padre@email.com

📱 [ASISTENCIA] Encontradas 1 suscripciones push para 2 apoderados
📱 [ASISTENCIA] Enviando 1 notificaciones push...
✅ [ASISTENCIA] Push notifications: 1 exitosas, 0 fallidas
```

---

## ⚙️ Verificar Configuración

### **1. Variables de Email en `backend/.env`:**

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=walterlozanoalcalde@gmail.com
EMAIL_PASSWORD=REDACTED_ROTATE_ME
EMAIL_FROM=walterlozanoalcalde@gmail.com
```

### **2. Variables VAPID en `backend/.env`:**

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=REDACTED_ROTATE_ME
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

### **3. Verificar que las Variables Estén Cargadas:**

Al iniciar el servidor, deberías ver:

```
📧 [EMAIL] Configuración de email: { host: 'smtp.gmail.com', port: 587, user: 'wal***', hasPassword: true }
✅ [EMAIL] Servidor SMTP listo para enviar correos
📱 [PUSH] VAPID keys configuradas correctamente
```

Si ves `NO CONFIGURADO` o `VAPID keys no configuradas`, revisa el `.env`.

---

## 🐛 Solución de Problemas

### **Problema 1: No se envían correos**

**Verificar:**
1. ✅ Variables `EMAIL_*` configuradas en `backend/.env`
2. ✅ El email tiene "Contraseñas de aplicaciones" habilitadas en Gmail
3. ✅ Ver logs: `📧 [EMAIL] Enviando correo a: ...`

**Si no aparecen logs:**
- El código de notificaciones no se está ejecutando
- Verificar que `tipo_usuario === 'ALUMNO'` y `datosUsuario` existe

### **Problema 2: No se envían push notifications**

**Verificar:**
1. ✅ Variables `VAPID_*` configuradas en `backend/.env`
2. ✅ El apoderado tiene notificaciones activadas en su perfil
3. ✅ Ver logs: `📱 [ASISTENCIA] Encontradas X suscripciones push...`

**Si no hay suscripciones:**
- El apoderado no ha activado las notificaciones push
- Verificar en la tabla `push_subscriptions` en la base de datos

### **Problema 3: Error "Ya existe un registro"**

**Ahora el sistema:**
- ✅ Verifica correctamente si ya existe entrada HOY
- ✅ Rechaza duplicados con mensaje claro
- ✅ Permite SALIDA si hay entrada pero no salida

**Mensajes de error mejorados:**
- "Ya existe un registro de entrada para hoy. No se puede registrar otra entrada."
- "Ya existe un registro completo (entrada y salida) para hoy."

---

## 📋 Código para VPS

```bash
cd ~/intranet2026
git pull origin main
cd frontend
npm run build
cd ..
pm2 restart intranet2026-backend

# Ver logs después de registrar una asistencia
pm2 logs intranet2026-backend --lines 50
```

---

## 🎯 Próximos Pasos

1. **Desplegar los cambios** en el VPS
2. **Registrar una asistencia** de prueba
3. **Revisar los logs** para ver qué está pasando
4. **Verificar** que aparezcan los logs de `📧 [EMAIL]` y `📱 [PUSH]`

Si los logs no aparecen, significa que:
- El código de notificaciones no se está ejecutando (verificar condiciones)
- Hay un error antes de llegar a esa sección (revisar logs completos)

---

¡Con estos cambios y logs, podremos identificar exactamente dónde está el problema! 🔍

