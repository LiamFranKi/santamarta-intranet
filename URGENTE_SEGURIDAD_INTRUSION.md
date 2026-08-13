# Urgente — Contención por acceso indebido a cuentas

## Qué pasó (causa probable)

1. **El JWT no se invalidaba al cambiar la contraseña.** Quien ya tenía un token robado/guardado podía seguir enviando mensajes hasta 24h aunque cambiaran la clave.
2. El repositorio **https://github.com/LiamFranKi/intranet-2026 está PÚBLICO** y en varios `.md` del historial hay contraseñas reales (MySQL, JWT, Gmail app passwords, VAPID). Eso facilita el ataque.

## Hacer YA en el VPS (antes o junto al deploy)

### A) Migración MySQL
```bash
cd /home/vanguard/intranet2026 && mysql -u vanguard -p vanguard_intranet < database/migrations/068_usuarios_token_version_mysql.sql
```
(Si dice “Duplicate column”, la columna ya existe: continuar.)

### B) Rotar JWT (cierra TODAS las sesiones al instante)
En `/home/vanguard/intranet2026/backend/.env` cambiar `JWT_SECRET` a un valor largo nuevo y aleatorio, luego:
```bash
cd /home/vanguard/intranet2026 && pm2 restart all
```

### C) Deploy código nuevo
```bash
cd /home/vanguard/intranet2026 && git pull origin main && cd frontend && npm install && npm run build && cd .. && pm2 restart all
```

### D) Cerrar sesiones del colegio (desde admin logueado)
Con el admin ya relogueado tras el deploy:
- `POST /api/admin/seguridad/cerrar-sesiones` body `{}` → cierra a todos.
- O body `{ "usuario_id": 123 }` → solo esa cuenta.

### E) GitHub (muy importante)
1. Hacer el repo **Private** (Settings → Danger Zone / Change visibility).
2. Rotar: MySQL password, JWT_SECRET, SMTP app passwords, VAPID, tokens de webhooks.
3. No volver a subir `.env` ni contraseñas en `.md`.

## Funciones nuevas

- Al cambiar password → sube `token_version` → tokens viejos mueren.
- Admin en Mensajes: botón **“Borrar para todos”** (elimina el envío en todas las bandejas).
- Admin API: `DELETE /api/admin/seguridad/mensajes/:id` y `POST .../mensajes/borrar-lote`.
