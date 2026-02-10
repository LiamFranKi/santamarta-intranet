# 📋 ARCHIVOS .env COMPLETOS PARA PRODUCCIÓN

## ✅ BACKEND: `backend/.env`

Este es el archivo que debes copiar al VPS. **Ya tiene todo configurado**, incluyendo:

```env
# MySQL Remoto (VPS MySQL)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=vanguard
MYSQL_PASSWORD=QI_jkA]RsHF_gUDN
MYSQL_DATABASE=vanguard_intranet

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=waltito10
POSTGRES_DATABASE=aula_virtual

# PHP API (NO SE USA ACTUALMENTE - Solo placeholder)
# Estas variables están aquí por si se necesita en el futuro
PHP_API_URL=https://vanguardschools.edu.pe/api
PHP_API_TOKEN=token_secreto

# JWT
JWT_SECRET=Vanguard2025_AulaVirtual_SuperSecreto_JWT_Key_2025
JWT_EXPIRES_IN=24h

# Server
PORT=5000
NODE_ENV=production

# CORS
FRONTEND_URL=https://intranet.vanguardschools.com

# Email (SMTP Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=walterlozanoalcalde@gmail.com
EMAIL_PASSWORD=ldvkcmqxshxdkupv
EMAIL_FROM=walterlozanoalcalde@gmail.com

# PWA - Notificaciones Push (✅ IMPORTANTE - Ya configurado)
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA
VAPID_EMAIL=walterlozanoalcalde@gmail.com

# FTP/SFTP para subida automática
FTP_HOST=89.117.52.9
FTP_USER=vanguard
FTP_PASSWORD=CtxADB8q0SaVYox
FTP_PORT=22
FTP_PROTOCOL=sftp
FTP_BASE_PATH=/home/vanguard/nuevo.vanguardschools.edu.pe
```

### 📝 Nota sobre `PHP_API_TOKEN`:
- ✅ **Está configurado** en el `.env`
- ❌ **NO se usa** en el código actual
- 💡 **Puedes dejarlo** como está (no afecta nada)
- 🔧 Si quieres, puedes comentarlo o eliminarlo (opcional)

---

## ✅ FRONTEND: `frontend/.env`

Este archivo debe contener:

```env
# URL de la API (OPCIONAL - el código detecta automáticamente)
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api

# PWA - Notificaciones Push (✅ IMPORTANTE)
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

---

## 🚀 PASOS PARA SUBIR AL VPS

### 1. Verificar archivos locales

Asegúrate de que en tu PC tengas:
- ✅ `C:\react-aula-virtual\backend\.env` (con todas las variables)
- ✅ `C:\react-aula-virtual\frontend\.env` (con VAPID_PUBLIC_KEY)

### 2. Copiar con WinSCP

**Backend:**
- Desde: `C:\react-aula-virtual\backend\.env`
- Hacia: `/home/vanguard/intranet2026/backend/.env`
- Sobrescribir: ✅ Sí

**Frontend:**
- Desde: `C:\react-aula-virtual\frontend\.env`
- Hacia: `/home/vanguard/intranet2026/frontend/.env`
- Sobrescribir: ✅ Sí

### 3. Reiniciar en VPS (Putty)

```bash
cd ~/intranet2026
pm2 restart intranet2026-backend
cd frontend
npm run build
```

---

## ✅ VERIFICACIÓN

Después de copiar, verifica en Putty:

```bash
# Verificar backend
cd ~/intranet2026/backend
grep VAPID .env
# Debe mostrar las 3 líneas VAPID

# Verificar frontend
cd ../frontend
grep VAPID .env
# Debe mostrar REACT_APP_VAPID_PUBLIC_KEY
```

---

## 📋 RESUMEN

| Variable | Backend | Frontend | ¿Se usa? | ¿Importante? |
|----------|---------|----------|----------|--------------|
| `VAPID_PUBLIC_KEY` | ✅ | ✅ | ✅ Sí | 🔴 **MUY IMPORTANTE** |
| `VAPID_PRIVATE_KEY` | ✅ | ❌ | ✅ Sí | 🔴 **MUY IMPORTANTE** |
| `VAPID_EMAIL` | ✅ | ❌ | ✅ Sí | 🔴 **MUY IMPORTANTE** |
| `PHP_API_TOKEN` | ✅ | ❌ | ❌ No | ⚪ Opcional |
| `PHP_API_URL` | ✅ | ❌ | ❌ No | ⚪ Opcional |

---

## ⚠️ IMPORTANTE

1. **`PHP_API_TOKEN`** está configurado pero **NO se usa** actualmente
2. **Puedes dejarlo** como está (no afecta nada)
3. **Las variables VAPID** son las **más importantes** para las notificaciones push
4. **Después de copiar**, siempre **reinicia el backend** y **rebuild el frontend**

---

¡Listo! Con esto tienes todo configurado para producción. 🎯

