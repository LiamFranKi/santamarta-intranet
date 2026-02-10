# 📋 ¿CUÁL ARCHIVO .env USAR EN PRODUCCIÓN?

## ✅ RESPUESTA RÁPIDA

### **BACKEND:**
- **Archivo a editar:** `backend/.env` (el que está en la raíz de `backend/`)
- **NO usar:** `.env.save` (es un backup, no se usa)

### **FRONTEND:**
- **Archivo a editar:** `frontend/.env` (el que está en la raíz de `frontend/`)
- **NO usar:** `env.production.example` (solo es un ejemplo, no se usa)

---

## 🔍 EXPLICACIÓN DETALLADA

### BACKEND (`backend/.env`)

**¿Por qué este archivo?**
- El archivo `backend/server.js` carga explícitamente `.env`:
  ```javascript
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  ```
- Esto significa que **SIEMPRE** busca `backend/.env`
- El archivo `.env.save` es solo un backup que alguien creó, **NO se usa**

**Archivo correcto:**
```
backend/.env  ← ESTE ES EL QUE DEBES EDITAR
```

**Archivos que NO se usan:**
```
backend/.env.save  ← Backup, ignorar
backend/env.production.example  ← Solo ejemplo
```

---

### FRONTEND (`frontend/.env`)

**¿Por qué este archivo?**
- React Scripts (create-react-app) usa `.env` para **todos los entornos**
- En producción, cuando haces `npm run build`, React Scripts:
  1. Busca `.env.production` (si existe)
  2. Si no existe, usa `.env`
  3. Las variables deben empezar con `REACT_APP_`

**Archivo correcto:**
```
frontend/.env  ← ESTE ES EL QUE DEBES EDITAR
```

**Archivos que NO se usan:**
```
frontend/env.production.example  ← Solo ejemplo, no se usa
```

**NOTA:** Si quieres tener un archivo específico para producción, puedes crear `frontend/.env.production`, pero normalmente solo se usa `.env`.

---

## 📝 QUÉ AGREGAR EN CADA ARCHIVO

### `backend/.env` (en VPS: `/home/vanguard/intranet2026/backend/.env`)

Agregar estas líneas al final:

```env
# PWA - Notificaciones Push
VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
VAPID_PRIVATE_KEY=gytyf_oJzJqUfIBPeajxyaYwboUslwNqf2jY4ZtHbbA
VAPID_EMAIL=walterlozanoalcalde@gmail.com
```

### `frontend/.env` (en VPS: `/home/vanguard/intranet2026/frontend/.env`)

Agregar esta línea:

```env
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

---

## 🚀 PASOS CON WINSCP

### 1. En tu PC (local)

Edita estos archivos:
- `C:\react-aula-virtual\backend\.env` ← Agregar líneas VAPID
- `C:\react-aula-virtual\frontend\.env` ← Agregar línea VAPID

### 2. Con WinSCP

**Copiar `backend/.env`:**
- **Desde:** `C:\react-aula-virtual\backend\.env`
- **Hacia:** `/home/vanguard/intranet2026/backend/.env`
- **Sobrescribir:** Sí

**Copiar `frontend/.env`:**
- **Desde:** `C:\react-aula-virtual\frontend\.env`
- **Hacia:** `/home/vanguard/intranet2026/frontend/.env`
- **Sobrescribir:** Sí

### 3. Reiniciar en VPS

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
# Debe mostrar la línea REACT_APP_VAPID_PUBLIC_KEY
```

---

## ⚠️ IMPORTANTE

- **NO edites** `.env.save` (es backup)
- **NO edites** `env.production.example` (solo ejemplo)
- **SÍ edita** `.env` en ambos directorios
- Después de editar, **siempre reinicia** el backend y **rebuild** el frontend

---

## 📋 RESUMEN

| Ubicación | Archivo a Editar | ¿Se usa? |
|-----------|------------------|----------|
| `backend/.env` | ✅ **SÍ** | Este es el que se carga |
| `backend/.env.save` | ❌ NO | Solo backup |
| `frontend/.env` | ✅ **SÍ** | Este es el que se usa |
| `frontend/env.production.example` | ❌ NO | Solo ejemplo |

**¡Solo edita los `.env` principales!** 🎯

