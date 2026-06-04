# Archivos estáticos — sistema React (sistema.vanguardschools.edu.pe)

## Ubicación en VPS

| Concepto | Valor |
|----------|--------|
| Carpeta en disco | `/home/vanguard/intranet2026/backend/Static` |
| URL pública | `https://sistema.vanguardschools.edu.pe/Static/...` |
| Variables `.env` backend | `STATIC_FS_ROOT`, `STATIC_PUBLIC_URL` (o `PHP_SYSTEM_URL` / `FRONTEND_URL`) |

Subcarpetas habituales:

- `Static/Archivos` — adjuntos mensajes, matrícula online (imágenes Quill), aula virtual PDF, etc.
- `Static/Image/Fotos` — fotos de alumnos, docentes, apoderados
- `Static/Image/Fondos` — fondos login / libreta (config admin)
- `Static/Image/Avatars` — avatares gamificación
- `Static/Image/Publicaciones` — imágenes de publicaciones (si aplica)

## Apache

En `sistema.vanguardschools.edu.pe` debe existir:

```apache
Alias /Static /home/vanguard/intranet2026/backend/Static
```

Node también sirve `/Static` si la petición llega al puerto 5000.

## No usar para archivos nuevos

- `https://nuevo.vanguardschools.edu.pe/Static/...` (sistema PHP legacy)
- `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/...`

Los contenidos antiguos en `nuevo` pueden seguir existiendo hasta migrarlos copiando archivos a `intranet2026/backend/Static`.

## Repositorio Git

La estructura de carpetas vive en `backend/Static/` con archivos `.gitkeep`. Tras `git pull` en el VPS las carpetas existen sin ejecutar `mkdir` manual (opcional si ya existían).

Los archivos subidos por usuarios **no** se versionan; solo en disco del servidor.

## Código

- Backend: `backend/utils/staticStorage.js`
- Frontend: `frontend/src/utils/staticUrl.js`
