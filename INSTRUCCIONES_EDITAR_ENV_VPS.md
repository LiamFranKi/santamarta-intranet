# 📝 CÓMO EDITAR ARCHIVOS .env EN EL VPS

## ⚠️ IMPORTANTE
Los archivos `.env` **NO se suben a GitHub** (están en `.gitignore` por seguridad).
Debes editarlos **directamente en el VPS** usando Putty/SSH.

---

## 🔧 MÉTODO 1: Usando nano (Recomendado - Más fácil)

### Paso 1: Conectarse al VPS con Putty
- Abre Putty
- Conéctate a tu servidor VPS

### Paso 2: Editar backend/.env

```bash
# Ir al directorio del proyecto
cd ~/intranet2026

# Editar el archivo .env del backend
nano backend/.env
```

**En nano:**
- Usa las **flechas** para moverte
- **Agrega o modifica** estas líneas al final del archivo:

```env
# Email (SMTP Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=walterlozanoalcalde@gmail.com
EMAIL_PASSWORD=ldvkcmqxshxdkupv
EMAIL_FROM=walterlozanoalcalde@gmail.com

# PWA - Notificaciones Push
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

**Para guardar y salir en nano:**
1. Presiona `Ctrl + O` (guardar)
2. Presiona `Enter` (confirmar nombre del archivo)
3. Presiona `Ctrl + X` (salir)

### Paso 3: Editar frontend/.env

```bash
# Editar el archivo .env del frontend
nano frontend/.env
```

**Agrega o modifica esta línea:**

```env
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

**Guardar y salir:**
- `Ctrl + O` → `Enter` → `Ctrl + X`

---

## 🔧 MÉTODO 2: Usando echo (Agregar al final)

Si prefieres no usar editor, puedes agregar las líneas directamente:

### Backend .env

```bash
cd ~/intranet2026/backend

# Agregar líneas VAPID (si no existen)
echo "" >> .env
echo "# PWA - Notificaciones Push" >> .env
echo "VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA" >> .env
echo "VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA" >> .env
echo "VAPID_EMAIL=walterlozanoalcalde@gmail.com" >> .env
```

### Frontend .env

```bash
cd ~/intranet2026/frontend

# Agregar línea VAPID (si no existe)
echo "REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA" >> .env
```

---

## 🔧 MÉTODO 3: Usando cat (Ver y editar)

### Ver el contenido actual

```bash
# Ver backend/.env
cat ~/intranet2026/backend/.env

# Ver frontend/.env
cat ~/intranet2026/frontend/.env
```

Luego usa `nano` para editarlo.

---

## ✅ VERIFICAR QUE SE GUARDARON CORRECTAMENTE

```bash
# Verificar backend/.env
cd ~/intranet2026/backend
grep VAPID .env

# Debe mostrar 3 líneas:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_EMAIL=...

# Verificar frontend/.env
cd ~/intranet2026/frontend
grep VAPID .env

# Debe mostrar:
# REACT_APP_VAPID_PUBLIC_KEY=...
```

---

## 🔄 DESPUÉS DE EDITAR

**IMPORTANTE:** Después de editar los `.env`, debes:

1. **Reiniciar el backend** (para que cargue las nuevas variables):
```bash
cd ~/intranet2026
pm2 restart intranet2026-backend
```

2. **Rebuild del frontend** (para que incluya la VAPID public key):
```bash
cd ~/intranet2026/frontend
npm run build
```

3. **Verificar logs** (opcional):
```bash
pm2 logs intranet2026-backend --lines 20
```

---

## 📋 RESUMEN DE VARIABLES A AGREGAR

### backend/.env
```env
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

### frontend/.env
```env
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

---

## 💡 TIPS

- **nano** es más fácil para principiantes (menús en la parte inferior)
- **vi/vim** es más potente pero más complejo
- Siempre **verifica** con `grep` que las variables se guardaron
- **No olvides reiniciar** el backend después de cambiar `.env`

---

## 🆘 SI ALGO SALE MAL

Si accidentalmente rompiste el `.env`:

```bash
# Ver el contenido actual
cat backend/.env

# Si está muy dañado, puedes restaurar desde backup o recrearlo
# Pero mejor usa nano para editarlo cuidadosamente
```

