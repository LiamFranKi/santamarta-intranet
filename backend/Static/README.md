# Carpeta Static (intranet React)

Estructura de archivos servidos en `https://sistema.vanguardschools.edu.pe/Static/...`

| Ruta | Uso |
|------|-----|
| `Archivos/` | Adjuntos mensajes, imágenes Quill (matrícula online), PDFs aula virtual, etc. |
| `Image/Fotos/` | Fotos alumnos, docentes, apoderados |
| `Image/Fondos/` | Fondos login / libreta (config) |
| `Image/Avatars/` | Avatares gamificación (assets versionados en Git) |
| `Image/Publicaciones/` | Imágenes de publicaciones |
| `Documentos/` | Documentos de alumnos |

Los archivos que suben usuarios **no** van a GitHub (ver `.gitignore`). Solo la estructura de carpetas (`.gitkeep`).

En el VPS: `STATIC_FS_ROOT=/home/vanguard/intranet2026/backend/Static`
