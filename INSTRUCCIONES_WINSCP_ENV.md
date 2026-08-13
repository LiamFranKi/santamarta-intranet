# 📁 CÓMO COPIAR ARCHIVOS .env AL VPS CON WINSCP

## ✅ VENTAJAS DE USAR WINSCP
- ✅ Más rápido y fácil
- ✅ Puedes editar en tu editor local (VS Code, Notepad++, etc.)
- ✅ Visual y cómodo
- ✅ Puedes hacer backup antes de modificar

---

## 📋 PASO A PASO

### 1. Preparar los archivos .env en LOCAL

#### A) Editar `backend/.env`

Abre `backend/.env` en tu editor local y **agrega o verifica** estas líneas:

```env
# Email (SMTP Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=walterlozanoalcalde@gmail.com
EMAIL_PASSWORD=REDACTED_ROTATE_ME
EMAIL_FROM=walterlozanoalcalde@gmail.com

# PWA - Notificaciones Push
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=REDACTED_ROTATE_ME
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

#### B) Editar `frontend/.env`

Abre `frontend/.env` en tu editor local y **agrega o verifica** esta línea:

```env
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

**NOTA:** Si `frontend/.env` no existe, créalo con solo esa línea.

---

### 2. Conectar con WinSCP

1. **Abre WinSCP**
2. **Nueva sesión:**
   - **Protocolo:** SFTP
   - **Nombre de host:** Tu IP del VPS (ej: `89.117.52.9` o tu dominio)
   - **Puerto:** 22
   - **Usuario:** `vanguard` (o tu usuario)
   - **Contraseña:** Tu contraseña SSH
3. **Conectar**

---

### 3. Navegar a las carpetas en el VPS

En el panel **derecho** (servidor remoto), navega a:
```
/home/vanguard/intranet2026/
```

Deberías ver:
- `backend/`
- `frontend/`
- `database/`
- etc.

---

### 4. Copiar `backend/.env`

1. En el panel **izquierdo** (tu PC), navega a:
   ```
   C:\react-aula-virtual\backend\
   ```

2. **Selecciona** el archivo `.env`

3. **Arrastra y suelta** al panel derecho en:
   ```
   /home/vanguard/intranet2026/backend/
   ```

4. WinSCP preguntará: **"¿Sobrescribir?"**
   - Selecciona **"Sí"** o **"Sí a todos"**

---

### 5. Copiar `frontend/.env`

1. En el panel **izquierdo** (tu PC), navega a:
   ```
   C:\react-aula-virtual\frontend\
   ```

2. **Selecciona** el archivo `.env`

3. **Arrastra y suelta** al panel derecho en:
   ```
   /home/vanguard/intranet2026/frontend/
   ```

4. Si pregunta por sobrescribir: **"Sí"**

---

### 6. Verificar permisos (opcional pero recomendado)

En WinSCP, haz clic derecho en cada archivo `.env` copiado → **Propiedades** → Verifica que los permisos sean:
- **644** o **rw-r--r--** (lectura/escritura para propietario, lectura para otros)

Si no, cambia los permisos a **644**.

---

### 7. Reiniciar servicios en el VPS

**IMPORTANTE:** Después de copiar los `.env`, debes reiniciar:

**Opción A: Desde WinSCP (Terminal integrado)**
1. En WinSCP, haz clic en el botón **"Terminal"** (icono de terminal)
2. Ejecuta:

```bash
cd ~/intranet2026
pm2 restart intranet2026-backend
cd frontend
npm run build
cd ..
pm2 status
```

**Opción B: Desde Putty (separado)**
1. Abre Putty y conéctate
2. Ejecuta los mismos comandos de arriba

---

## ✅ VERIFICACIÓN FINAL

En Putty o Terminal de WinSCP:

```bash
# Verificar backend/.env
cd ~/intranet2026/backend
grep VAPID .env

# Debe mostrar 3 líneas:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=REDACTED_ROTATE_ME
# VAPID_EMAIL=...

# Verificar frontend/.env
cd ../frontend
grep VAPID .env

# Debe mostrar:
# REACT_APP_VAPID_PUBLIC_KEY=...
```

---

## 💡 TIPS

1. **Hacer backup antes:**
   - En WinSCP, copia los `.env` actuales del VPS a tu PC como backup
   - Así puedes restaurarlos si algo sale mal

2. **Editar directamente en WinSCP:**
   - WinSCP tiene editor integrado
   - Clic derecho en `.env` → **Editar**
   - Se abre en editor de WinSCP
   - Guarda y se sube automáticamente

3. **Sincronización:**
   - Puedes usar **Sincronización** de WinSCP para mantener archivos actualizados
   - Útil si editas frecuentemente

---

## 🆘 SI ALGO SALE MAL

### El archivo no se copia
- Verifica que tengas permisos de escritura en el VPS
- Verifica que la ruta sea correcta

### Los cambios no se aplican
- **Asegúrate de reiniciar el backend:** `pm2 restart intranet2026-backend`
- **Rebuild del frontend:** `cd frontend && npm run build`
- Verifica los logs: `pm2 logs intranet2026-backend`

### Restaurar desde backup
- Si hiciste backup, simplemente copia el archivo de vuelta desde tu PC

---

## 📝 RESUMEN RÁPIDO

1. ✅ Edita `backend/.env` y `frontend/.env` en tu PC
2. ✅ Conéctate con WinSCP
3. ✅ Arrastra `backend/.env` a `/home/vanguard/intranet2026/backend/`
4. ✅ Arrastra `frontend/.env` a `/home/vanguard/intranet2026/frontend/`
5. ✅ Reinicia: `pm2 restart intranet2026-backend`
6. ✅ Rebuild: `cd frontend && npm run build`

**¡Listo!** 🎉

