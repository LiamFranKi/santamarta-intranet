# 🚀 INSTRUCCIONES PARA DESPLEGAR MÓDULO DE ASISTENCIA EN VPS

## 📋 PASOS PREVIOS

### 1. Ejecutar Migraciones SQL en phpMyAdmin

Ejecutar en orden:

1. **`database/migrations/003_asistencia_registros.sql`**
   - Crea la tabla para registros de asistencia

2. **`database/migrations/004_push_subscriptions.sql`**
   - Crea la tabla para suscripciones de notificaciones push

### 2. Configurar Variables de Entorno en VPS

Editar `backend/.env` y agregar/actualizar:

```env
# Email (SMTP Gmail) - YA CONFIGURADO
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=walterlozanoalcalde@gmail.com
EMAIL_PASSWORD=ldvkcmqxshxdkupv
EMAIL_FROM=walterlozanoalcalde@gmail.com

# PWA - Notificaciones Push (NUEVO - AGREGAR ESTAS LÍNEAS)
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

Editar `frontend/.env` (o `frontend/.env.production`) y agregar:

```env
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

## 🔧 COMANDOS PARA VPS (Putty)

```bash
# 1. Ir al directorio del proyecto
cd ~/intranet2026

# 2. Actualizar código desde GitHub
git pull origin main

# 3. Instalar dependencias del frontend (por si hay nuevas)
cd frontend
npm install

# 4. Rebuild del frontend
npm run build

# 5. Volver al directorio raíz
cd ..

# 6. Reiniciar el backend
pm2 restart intranet2026-backend

# 7. Verificar estado
pm2 status

# 8. Ver logs (opcional, para verificar que todo funciona)
pm2 logs intranet2026-backend --lines 50
```

## ✅ VERIFICACIONES POST-DESPLIEGUE

### 1. Verificar que las tablas existen

En phpMyAdmin, ejecutar:

```sql
SHOW TABLES LIKE 'asistencia_registros';
SHOW TABLES LIKE 'push_subscriptions';
```

Ambas deben existir.

### 2. Verificar variables de entorno

En el VPS, verificar que las VAPID keys estén configuradas:

```bash
cd ~/intranet2026/backend
grep VAPID .env
```

Debe mostrar las 3 variables VAPID.

### 3. Probar el módulo

1. Iniciar sesión con un usuario tipo **ASISTENCIA**
2. Debe redirigir automáticamente a `/asistencia/escaneo`
3. Probar escanear un QR de alumno
4. Verificar que se registre correctamente

## 🔔 NOTIFICACIONES PUSH

### Funcionamiento Automático

- Las notificaciones se suscriben **automáticamente** cuando:
  - Un usuario **ALUMNO** o **APODERADO** inicia sesión
  - El navegador soporta notificaciones push
  - El usuario otorga permiso (la primera vez puede pedir permiso)

### Notas Importantes

- **Primera vez**: El navegador puede pedir permiso explícito (esto es normal y necesario por seguridad)
- **Después**: La suscripción se mantiene automáticamente
- **Múltiples dispositivos**: Cada dispositivo se suscribe independientemente
- **Correos**: Se envían siempre, independientemente de las push notifications

## 🐛 Troubleshooting

### El escáner no funciona

- Verificar permisos de cámara en el navegador
- Probar en modo HTTPS (requerido para cámara)
- Verificar que `html5-qrcode` esté instalado

### Las notificaciones push no funcionan

- Verificar que las VAPID keys estén en `.env`
- Verificar que el Service Worker esté registrado (consola del navegador)
- Verificar permisos de notificaciones en el navegador
- Revisar logs del backend: `pm2 logs intranet2026-backend`

### Error "Usuario no encontrado" al escanear

- Verificar que el QR contenga el DNI correcto
- Verificar que el usuario esté activo en la base de datos
- Verificar que pertenezca al mismo colegio

## 📝 NOTAS IMPORTANTES

1. **Lógica de Entrada/Salida Corregida**:
   - Solo se registra SALIDA si hay una ENTRADA del **mismo día**
   - Si ayer no se escaneó salida, hoy siempre será ENTRADA
   - La verificación es por fecha, no por último registro

2. **Notificaciones Automáticas**:
   - Se suscriben automáticamente al iniciar sesión
   - No requiere interacción del usuario (excepto el permiso inicial)
   - Funciona en Android e iOS como PWA

3. **Mensajes Configurables**:
   - Los mensajes están en `backend/config/mensajes.json`
   - Se pueden editar sin modificar código
   - Soporta variables: `{nombreAlumno}`, `{hora}`, `{fecha}`

---

**¡Listo para usar!** 🎉

