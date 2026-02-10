# 🔧 SOLUCIÓN: Error de Conexión MySQL (ECONNREFUSED ::1:3306)

## ❌ Problema

El error `ECONNREFUSED ::1:3306` indica que Node.js está intentando conectarse a MySQL usando **IPv6** (`::1`) en lugar de **IPv4** (`127.0.0.1`).

**Error en logs:**
```
MySQL Error: Error: connect ECONNREFUSED ::1:3306
```

## 🔍 Causa

Cuando usas `localhost` en `MYSQL_HOST`, Node.js puede intentar conectarse por IPv6 primero, pero MySQL probablemente solo está escuchando en IPv4.

## ✅ Solución

**Cambiar `MYSQL_HOST` de `localhost` a `127.0.0.1` en el `.env` del backend.**

---

## 📋 PASOS PARA CORREGIR

### **PASO 1: Editar `backend/.env` en el VPS**

En Putty:
```bash
cd ~/intranet2026/backend
nano .env
```

**Busca esta línea:**
```env
MYSQL_HOST=localhost
```

**Cámbiala a:**
```env
MYSQL_HOST=127.0.0.1
```

Guarda: `Ctrl+O`, `Enter`, sal: `Ctrl+X`

---

### **PASO 2: Reiniciar el Backend**

```bash
cd ~/intranet2026
pm2 restart intranet2026-backend
```

---

### **PASO 3: Verificar que Funciona**

```bash
pm2 logs intranet2026-backend --lines 20
```

Deberías ver:
```
🔌 MySQL: PRODUCCIÓN - Host: 127.0.0.1
✅ Servidor corriendo en puerto 5000
```

Y **NO** deberías ver más errores de `ECONNREFUSED ::1:3306`.

---

## 🔍 Verificación en el Navegador

Después de reiniciar, accede a `https://sistema.vanguardschools.edu.pe` y verifica que:
- ✅ No aparezca el error 500 en `/api/colegio/1`
- ✅ El login funcione correctamente
- ✅ No haya errores de conexión en la consola

---

## 📋 Resumen

| Antes | Después |
|-------|---------|
| `MYSQL_HOST=localhost` | `MYSQL_HOST=127.0.0.1` |

**¿Por qué funciona?**
- `127.0.0.1` es **siempre IPv4**
- `localhost` puede resolver a **IPv6 (`::1`)** o **IPv4 (`127.0.0.1`)**
- MySQL probablemente solo escucha en **IPv4**

---

¡Con este cambio, la conexión a MySQL debería funcionar correctamente! 🎯

