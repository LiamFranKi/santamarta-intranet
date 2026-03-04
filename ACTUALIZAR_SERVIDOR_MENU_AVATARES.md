# Actualizar servidor: menú Gamificación (avatares)

En el servidor (PuTTY) el menú se actualiza **solo después de hacer pull y volver a construir el frontend**. Si solo haces `git pull`, el navegador seguirá usando el JavaScript antiguo (build anterior).

## Comandos en PuTTY (en este orden)

```bash
cd /home/vanguard/intranet2026
git pull origin main
cd frontend
npm run build
```

Después de `npm run build`:
- Si el backend sirve el frontend desde `frontend/build`, con eso basta (no hace falta reiniciar).
- Si usas PM2 o copias el build a otra ruta (ej. Apache/Nginx), reinicia el servicio o copia la carpeta `build` donde corresponda.

Para forzar que el navegador no use caché: **Ctrl+F5** o abrir en ventana de incógnito y entrar a `/admin/dashboard`.
