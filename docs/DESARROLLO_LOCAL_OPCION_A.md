# Desarrollo local (Opción A) – Solo ver estadísticas

Para trabajar en el **Dashboard del administrador** (estadísticas, reportes, solo lectura) sin reiniciar el servidor ni afectar al resto.

---

## 1. Configuración en tu PC (una sola vez)

### 1.1. Archivo `frontend/.env.local`

Ya está creado con:

```env
REACT_APP_API_URL=https://nuevo.vanguardschools.edu.pe/api
```

- **No se sube a GitHub** (está en `.gitignore`).
- El servidor **nunca** usa este archivo.
- Si tu backend está en otra URL, cambia solo esa línea.

### 1.2. Dependencias

En tu PC, en la carpeta del proyecto:

```bash
cd frontend
npm install
```

---

## 2. Cómo trabajar en local

1. Abre una terminal en `c:\react-aula-virtual\frontend`.
2. Ejecuta:

   ```bash
   npm start
   ```

3. Se abrirá el navegador en `http://localhost:3000`.
4. Inicia sesión con un usuario **administrador** del sistema real (los datos vienen del servidor).
5. Entra al **Dashboard** y trabaja en estadísticas / cuadros / reportes (solo lectura).
6. No reinicias PM2 ni tocas nada en el servidor.

---

## 3. Al subir a GitHub y bajar al servidor

Cuando ya tengas listos los cambios:

1. En tu PC: **commit y push** solo de lo que cambiaste (frontend: Dashboard, estadísticas, etc.).
2. En el servidor ejecutas:

   ```bash
   cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
   ```

**Qué pasa ahí:**

- `git pull` actualiza solo **código** (frontend y, si tocaste algo, backend).
- **No se modifica** el `.env` del servidor ni la configuración de PWA, push, Gmail, etc.
- Solo se vuelve a **construir** el frontend (`npm run build`) y se **reinicia** PM2 para servir el nuevo build.
- El backend en el servidor sigue igual; si en tu repo **no cambiaste archivos del backend**, en el servidor no cambia nada del backend.

Para no tocar nada del backend en el servidor: **no subas cambios en carpetas `backend/`**; solo sube cambios de `frontend/` (y si acaso docs). Así te aseguras de que “al descargar y subir no se mueva nada del backend” como pediste.

---

## 4. Resumen

| Dónde        | Qué haces                         | Riesgo para producción      |
|-------------|------------------------------------|-----------------------------|
| Tu PC       | Editas frontend, `npm start`       | Ninguno                     |
| Tu PC       | `.env.local` apunta al servidor    | Ninguno (solo lectura)      |
| Servidor    | `git pull` + `build` + `pm2 restart` | Solo frontend nuevo; backend intacto si no cambias backend/ |

Si solo trabajas en estadísticas/reportes del dashboard (solo lectura), la Opción A es segura y no mueve nada delicado del servidor.
