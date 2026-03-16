# Comandos para actualizar en el VPS

## 1. Descargar cambios de GitHub
```bash
cd /home/vanguard/intranet2026 && git pull origin main
```

## 2. Reconstruir el frontend (OBLIGATORIO para ver cambios en React)
```bash
cd /home/vanguard/intranet2026/frontend && npm run build
```

## 3. Reiniciar el backend
```bash
cd /home/vanguard/intranet2026 && pm2 restart all
```
(Desde la raíz del proyecto; si acabas de hacer el build, ya estás en `frontend`, así que `cd ..` y luego `pm2 restart all`.)

## Todo en una sola línea (comando estándar para PuTTY)
```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
```

**Importante:** Sin `npm run build` en el frontend, los cambios en componentes React (como la descripción del avatar) no aparecerán porque el servidor sigue sirviendo los archivos compilados anteriores.
