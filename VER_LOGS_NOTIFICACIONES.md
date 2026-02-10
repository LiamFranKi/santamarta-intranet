# 📋 Código para Ver Logs de Notificaciones de Asistencia

## 🚀 1. Desplegar Cambios en VPS

```bash
cd ~/intranet2026
git pull origin main
pm2 restart intranet2026-backend
```

---

## 📊 2. Ver Logs en Tiempo Real (Recomendado)

### **Ver TODOS los logs:**
```bash
pm2 logs intranet2026-backend --lines 100
```

### **Ver solo logs de ASISTENCIA y NOTIFICACIONES:**
```bash
pm2 logs intranet2026-backend --lines 200 | grep -i "ASISTENCIA\|EMAIL\|PUSH\|notificacion"
```

### **Ver logs en tiempo real (se actualiza automáticamente):**
```bash
pm2 logs intranet2026-backend --lines 50 --raw | grep -i "ASISTENCIA\|EMAIL\|PUSH"
```

---

## 🔍 3. Ver Logs Específicos Después de Registrar Asistencia

### **Ver últimas 100 líneas y filtrar:**
```bash
pm2 logs intranet2026-backend --lines 100 | grep -E "📋|📧|📱|✅|❌|⚠️" | tail -50
```

### **Ver solo errores:**
```bash
pm2 logs intranet2026-backend --err --lines 50
```

### **Ver solo output (sin errores):**
```bash
pm2 logs intranet2026-backend --out --lines 100 | grep -i "ASISTENCIA"
```

---

## 🧪 4. Proceso de Prueba Completo

### **Paso 1: Limpiar logs anteriores (opcional)**
```bash
pm2 flush intranet2026-backend
```

### **Paso 2: Ver logs en tiempo real en una terminal**
```bash
pm2 logs intranet2026-backend --lines 0
```

### **Paso 3: En otra terminal o navegador, registrar asistencia de un ALUMNO**

### **Paso 4: Buscar en los logs estos mensajes clave:**

✅ **Si todo funciona correctamente, deberías ver:**
```
📋 [ASISTENCIA] Registrando ENTRADA para usuario X (tipo: ALUMNO) en fecha YYYY-MM-DD
📋 [ASISTENCIA] No hay registro existente para hoy - creando nuevo
✅ [ASISTENCIA] Creando nuevo registro de ENTRADA
📋 [ASISTENCIA] Obteniendo datos del usuario para notificaciones...
📋 [ASISTENCIA] Buscando datos de ALUMNO con usuario_id: X
✅ [ASISTENCIA] Datos de alumno obtenidos: Nombre Alumno (ID: X)
📧 [ASISTENCIA] Verificando notificaciones para tipo_usuario: ALUMNO, datosUsuario: existe
📧 [ASISTENCIA] Iniciando proceso de notificaciones para alumno: Nombre Alumno
📧 [ASISTENCIA] Encontrados X apoderados con email para el alumno
📱 [ASISTENCIA] Encontrados X usuarios DOCENTE que también son apoderados
📱 [ASISTENCIA] Buscando suscripciones push para X usuarios (apoderados + docentes-apoderados)
📱 [ASISTENCIA] Encontradas X suscripciones push para X apoderados (incluyendo docentes que son apoderados)
📧 [ASISTENCIA] Enviando correos a X apoderados...
📧 [ASISTENCIA] Enviando correo a: email@ejemplo.com
✅ [ASISTENCIA] Correo enviado exitosamente a email@ejemplo.com
📱 [ASISTENCIA] Enviando X notificaciones push...
✅ [ASISTENCIA] Push notifications: X exitosas, 0 fallidas
```

❌ **Si hay problemas, buscar estos mensajes:**
```
⚠️ [ASISTENCIA] No se encontraron apoderados con email para este alumno
⚠️ [ASISTENCIA] No se encontraron usuarios (ni apoderados ni docentes-apoderados) para las suscripciones push
⚠️ [ASISTENCIA] No hay suscripciones push activas para enviar notificaciones
❌ [ASISTENCIA] Error enviando correo a...
❌ [ASISTENCIA] Error en bloque de notificaciones...
```

---

## 🔎 5. Comandos de Diagnóstico Avanzado

### **Ver logs de los últimos 5 minutos:**
```bash
pm2 logs intranet2026-backend --lines 500 | grep "$(date +%Y-%m-%d)" | grep -i "ASISTENCIA"
```

### **Contar cuántas notificaciones se enviaron:**
```bash
pm2 logs intranet2026-backend --lines 200 | grep "✅ \[ASISTENCIA\] Push notifications" | tail -10
```

### **Ver todos los errores de correo:**
```bash
pm2 logs intranet2026-backend --lines 200 | grep "❌ \[ASISTENCIA\] Error enviando correo"
```

### **Ver todos los errores de push:**
```bash
pm2 logs intranet2026-backend --lines 200 | grep "❌ \[ASISTENCIA\] Errores en push notifications"
```

---

## 📝 6. Verificar Configuración de Email y Push

### **Ver si el servidor inició correctamente:**
```bash
pm2 logs intranet2026-backend --lines 50 | grep -E "EMAIL|PUSH|SMTP|VAPID"
```

**Deberías ver:**
```
📧 [EMAIL] Configuración de email: { host: 'smtp.gmail.com', port: 587, user: 'wal***', hasPassword: true }
✅ [EMAIL] Servidor SMTP listo para enviar correos
📱 [PUSH] VAPID keys configuradas correctamente
```

---

## 🎯 7. Script de Prueba Rápida

Copia y pega este comando completo para ver todo el proceso:

```bash
echo "=== LIMPIANDO LOGS ===" && \
pm2 flush intranet2026-backend && \
echo "=== ESPERANDO 2 SEGUNDOS ===" && \
sleep 2 && \
echo "=== INICIANDO MONITOREO DE LOGS ===" && \
echo "👉 AHORA REGISTRA UNA ASISTENCIA DE UN ALUMNO EN EL SISTEMA" && \
echo "👉 Presiona Ctrl+C para detener el monitoreo" && \
pm2 logs intranet2026-backend --lines 0 --raw | grep --line-buffered -i "ASISTENCIA\|EMAIL\|PUSH\|notificacion\|correo"
```

---

## 📌 Notas Importantes

1. **Los logs se muestran en tiempo real** - Si no ves nada, espera unos segundos después de registrar la asistencia.

2. **Si no aparecen logs de notificaciones**, verifica:
   - Que el usuario registrado sea tipo `ALUMNO` (no DOCENTE)
   - Que el alumno tenga apoderados con email configurado
   - Que los apoderados (o docentes-apoderados) tengan notificaciones push activadas

3. **Para ver logs más antiguos**, aumenta el número: `--lines 500` o `--lines 1000`

4. **Para salir del monitoreo en tiempo real**, presiona `Ctrl+C`

---

¡Listo! Con estos comandos podrás ver exactamente qué está pasando con las notificaciones! 🔍

