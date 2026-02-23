# ⚡ Comandos para Actualizar el VPS (Putty)

**IMPORTANTE:** Para que los cambios del frontend (como el botón Biblioteca) se vean, **DEBES** ejecutar `npm run build` después del `git pull`. Sin esto, seguirás viendo la versión antigua.

---

## Comandos completos para actualizar

```bash
# 1. Ir al proyecto
cd ~/intranet2026

# 2. Descargar código de GitHub
git pull origin main

# 3. Recompilar el frontend (OBLIGATORIO para ver cambios en la interfaz)
cd frontend
npm run build

# 4. Volver a la raíz y reiniciar el backend
cd ..
pm2 restart all
```

---

## Comandos en una sola línea

```bash
cd ~/intranet2026 && git pull origin main && cd frontend && npm run build && cd .. && pm2 restart all
```

*(Tardará 2-5 minutos por el build del frontend)*

---

## Si la ruta del proyecto es diferente

- Si usas `intranet206`: cambia `intranet2026` por `intranet206`
- Si usas otra ruta: ajusta el primer `cd`

---

## Verificar que el build se completó

```bash
ls -la ~/intranet2026/frontend/build/static/js/
```

Deberías ver archivos `.js` con hash. Si existen, el build está bien.

---

## Ver logs del backend (si algo falla)

```bash
pm2 logs intranet2026-backend
```

---

## Limpiar caché del navegador

Después de actualizar, si no ves los cambios:
- **Ctrl + Shift + R** (recarga forzada)
- O en Chrome: F12 → clic derecho en el botón Recargar → "Vaciar caché y volver a cargar de manera forzada"
