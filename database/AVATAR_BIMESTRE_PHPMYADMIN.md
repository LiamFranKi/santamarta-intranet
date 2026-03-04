# Avatares por bimestre – Pasos en phpMyAdmin

Sistema nuevo de avatares (no modifica las tablas antiguas `avatar_shop_items` ni `avatar_shop_sales`).

## Qué hace este sistema

- **Avatar base**: un personaje por bimestre (1–4) y género (femenino/masculino), con su imagen base (sin accesorios).
- **Accesorios**: cada avatar base tiene sus propios accesorios; cada accesorio tiene una imagen **ya combinada** (personaje + accesorio) que se sube en el mantenimiento.
- El alumno desbloquea accesorios por puntuación (estrellas) y elige uno para equipar; se muestra la imagen combinada correspondiente.

## Pasos en phpMyAdmin

1. Abre phpMyAdmin y selecciona la base de datos **`vanguard_intranet`** (o la que uses para la intranet).

2. Ve a la pestaña **SQL**.

3. Copia y pega **todo** el contenido del archivo:
   ```
   database/migrations/010_avatar_bimestre_sistema.sql
   ```

4. Pulsa **Continuar** (o **Go**).

5. Deberías ver mensajes de éxito para la creación de las 4 tablas:
   - `avatar_bases`
   - `avatar_accesorios`
   - `alumno_avatar_desbloqueos`
   - `alumno_avatar_equipado`

## Tablas creadas

| Tabla | Uso |
|-------|-----|
| **avatar_bases** | Un registro por bimestre + género (ej.: Bimestre 1 Masculino). Campos: nombre, descripción, historia, imagen_base (ruta del PNG). |
| **avatar_accesorios** | Accesorios de cada avatar base. Cada fila tiene `avatar_base_id`, nombre, puntuacion_requerida, imagen_combinada (ruta del PNG ya dibujado). |
| **alumno_avatar_desbloqueos** | Qué accesorios ha desbloqueado cada alumno (por estrellas). |
| **alumno_avatar_equipado** | Qué accesorio tiene equipado el alumno por cada avatar base (NULL = solo imagen base). |

## Después de ejecutar

- En el formulario de mantenimiento (cuando lo tengas) subirás por cada avatar base su imagen base y, por cada accesorio, la imagen combinada.
- Las rutas de imágenes (`imagen_base`, `imagen_combinada`) son solo el **nombre del archivo** (ej. `b1_m_base.png`, `b1_m_gorro.png`). El backend sirve desde `Static/Image/Avatars/` (o `backend/Static/Image/Avatars` en desarrollo), así que los archivos deben estar en esa carpeta.

## API alumno (nuevo sistema)

- `GET /api/alumno/avatares-bimestre/resumen?bimestre=1` — Avatar actual (URL de imagen), total estrellas, bimestre.
- `GET /api/alumno/avatares-bimestre/bases?bimestre=1` — Lista de avatares base del bimestre.
- `GET /api/alumno/avatares-bimestre/bases/:baseId/accesorios` — Accesorios del avatar (con desbloqueado, puede_desbloquear, equipado).
- `POST /api/alumno/avatares-bimestre/desbloquear/:accesorioId` — Desbloquear si tiene estrellas suficientes.
- `PUT /api/alumno/avatares-bimestre/equipar` — Body: `{ "avatar_base_id": 1, "accesorio_id": 2 }` (o `accesorio_id: null` para solo base).
