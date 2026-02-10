# 🚀 CONFIGURAR SISTEMA PARA sistema.vanguardschools.edu.pe

## ✅ Configuración Completada

He actualizado el código para usar `sistema.vanguardschools.edu.pe`. Ahora necesitas configurar los archivos `.env` en el VPS.

---

## 📋 PASOS A SEGUIR

### **PASO 1: Actualizar `backend/.env` en el VPS**

Edita el archivo `/home/vanguard/intranet2026/backend/.env` y asegúrate de que tenga:

```env
# ... (otras variables) ...

# CORS - Subdominio de producción
FRONTEND_URL=https://sistema.vanguardschools.edu.pe

# ... (otras variables) ...
```

**Comando en Putty:**
```bash
cd ~/intranet2026/backend
nano .env
```

Busca la línea `FRONTEND_URL` y asegúrate de que diga:
```
FRONTEND_URL=https://sistema.vanguardschools.edu.pe
```

Guarda con `Ctrl+O`, `Enter`, y sal con `Ctrl+X`.

---

### **PASO 2: Actualizar `frontend/.env` en el VPS**

Edita el archivo `/home/vanguard/intranet2026/frontend/.env` y asegúrate de que tenga:

```env
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

**Comando en Putty:**
```bash
cd ~/intranet2026/frontend
nano .env
```

Si el archivo no existe o está vacío, crea estas líneas:
```
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
```

Guarda con `Ctrl+O`, `Enter`, y sal con `Ctrl+X`.

---

### **PASO 3: Reiniciar Backend y Reconstruir Frontend**

**En Putty, ejecuta:**

```bash
cd ~/intranet2026

# Reiniciar backend
pm2 restart intranet2026-backend

# Reconstruir frontend (importante para que tome el nuevo .env)
cd frontend
npm run build

# Verificar que el backend está corriendo
cd ..
pm2 logs intranet2026-backend --lines 10
```

---

### **PASO 4: Verificar Configuración**

**Verificar backend/.env:**
```bash
cd ~/intranet2026/backend
grep FRONTEND_URL .env
```

Debería mostrar:
```
FRONTEND_URL=https://sistema.vanguardschools.edu.pe
```

**Verificar frontend/.env:**
```bash
cd ~/intranet2026/frontend
grep REACT_APP_API_URL .env
```

Debería mostrar:
```
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
```

---

## 🔧 ALTERNATIVA: Usar WinSCP (Más Fácil)

Si prefieres usar WinSCP en lugar de `nano`:

### **Backend:**
1. Conecta con WinSCP al VPS
2. Navega a `/home/vanguard/intranet2026/backend/`
3. Edita el archivo `.env`
4. Busca `FRONTEND_URL` y cámbialo a:
   ```
   FRONTEND_URL=https://sistema.vanguardschools.edu.pe
   ```
5. Guarda y cierra

### **Frontend:**
1. Navega a `/home/vanguard/intranet2026/frontend/`
2. Edita o crea el archivo `.env`
3. Agrega estas líneas:
   ```
   REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
   REACT_APP_VAPID_PUBLIC_KEY=BHamMvc50IaZsThiAsM2tKzYQT0RfdYO0oeL9y3GCKhoWFPi1wAoAVdnObnNAmvNe2lYLrLtDCFksVixtetfBNA
   ```
4. Guarda y cierra

### **Luego en Putty:**
```bash
cd ~/intranet2026
pm2 restart intranet2026-backend
cd frontend
npm run build
```

---

## ✅ Verificación Final

Después de hacer los cambios:

1. **Accede a:** `https://sistema.vanguardschools.edu.pe`
2. **Abre la consola del navegador** (F12)
3. **Verifica que no haya errores de CORS o certificado SSL**
4. **Deberías ver en la consola:**
   ```
   ⚙️ Usando URL de API desde variable de entorno: https://sistema.vanguardschools.edu.pe/api
   ```

---

## 📋 Resumen de Cambios

| Archivo | Variable | Valor |
|---------|----------|-------|
| `backend/.env` | `FRONTEND_URL` | `https://sistema.vanguardschools.edu.pe` |
| `frontend/.env` | `REACT_APP_API_URL` | `https://sistema.vanguardschools.edu.pe/api` |
| `backend/server.js` | `allowedOrigins` | ✅ Ya actualizado (incluye `sistema.vanguardschools.edu.pe`) |

---

## ⚠️ Importante

- **Después de cambiar `.env` del frontend, SIEMPRE debes hacer `npm run build`**
- **Después de cambiar `.env` del backend, SIEMPRE debes reiniciar con `pm2 restart intranet2026-backend`**
- **El certificado SSL debe estar configurado correctamente para `sistema.vanguardschools.edu.pe`**

---

¡Listo! Con estos pasos, el sistema estará configurado para usar `sistema.vanguardschools.edu.pe`. 🎯

