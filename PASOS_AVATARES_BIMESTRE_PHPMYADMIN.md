# Avatares por bimestre – Pasos en phpMyAdmin

Este documento explica **qué tablas se crean** y **qué debes ejecutar en phpMyAdmin** para el sistema de avatares por bimestre (cada avatar con sus propios accesorios e imágenes precombinadas). Las tablas son **nuevas** y no modifican `avatar_shop_items` ni `avatar_shop_sales`.

---

## 1. Qué hace el sistema

- **Avatar base**: Un personaje por **bimestre** (1 a 4) y **género** (0 = Femenino, 1 = Masculino). Tiene una imagen base (sin accesorios).
- **Accesorios**: Cada accesorio **pertenece a un avatar base**. Tiene puntuación mínima (estrellas) para desbloquear y una **imagen combinada** (PNG ya dibujado: personaje + accesorio) que subes en el mantenimiento.
- **Alumno**: Desbloquea accesorios según sus estrellas, elige cuál equipar; se muestra la imagen combinada correspondiente (una sola imagen, sin capas en el navegador).

---

## 2. Ejecutar la migración en phpMyAdmin

1. Entra a **phpMyAdmin** y selecciona la base de datos de tu intranet.
2. Abre la pestaña **SQL**.
3. Copia y pega **todo** el contenido del archivo:
   - `database/migrations/010_avatar_bimestre_sistema.sql`
4. Pulsa **Continuar** (o **Go**).

Si todo va bien, se habrán creado estas tablas:

| Tabla | Descripción |
|-------|-------------|
| `avatar_bases` | Avatar base por bimestre y género (nombre, descripción, historia, imagen_base). |
| `avatar_accesorios` | Accesorios de cada avatar (avatar_base_id, nombre, puntuacion_requerida, imagen_combinada). |
| `alumno_avatar_desbloqueos` | Qué accesorios ha desbloqueado cada alumno (student_id = id de `alumnos.id`). |
| `alumno_avatar_equipado` | Qué accesorio tiene equipado cada alumno por avatar base (NULL = solo imagen base). |

---

## 3. Cómo cargar datos (cuando tengas el formulario de mantenimiento)

Mientras no exista el formulario, puedes insertar datos de prueba desde SQL:

**Ejemplo: un avatar base para Bimestre 1 Masculino**

```sql
INSERT INTO avatar_bases (bimestre, sexo, nombre, descripcion, imagen_base, orden)
VALUES (1, 1, 'Avatar Bimestre 1 - Masculino', 'Personaje del primer bimestre', 'bim1_m_base.png', 0);
```

**Ejemplo: accesorios de ese avatar** (reemplaza `1` por el `id` del avatar base que devolvió el INSERT anterior):

```sql
INSERT INTO avatar_accesorios (avatar_base_id, nombre, descripcion, puntuacion_requerida, imagen_combinada, orden)
VALUES
  (1, 'Gorro', 'Gorro de invierno', 5, 'bim1_m_gorro.png', 0),
  (1, 'Capa', 'Capa de héroe', 10, 'bim1_m_capa.png', 1);
```

Las imágenes (`imagen_base`, `imagen_combinada`) son **nombres de archivo** que debes subir a la carpeta que sirve el backend (por ejemplo `backend/Static/Image/Avatars/`). La URL se arma en el backend.

---

## 4. Resumen

- **Un solo script**: `database/migrations/010_avatar_bimestre_sistema.sql`.
- **No toca** las tablas antiguas de avatares.
- **student_id** en las tablas nuevas = `alumnos.id` de tu base de datos.
- Cuando tengas el formulario de mantenimiento, desde ahí subirás cada avatar con sus accesorios y sus imágenes.
