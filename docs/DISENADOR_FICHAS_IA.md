# Diseñador de fichas pedagógicas (IA) — Especificación

Módulo para convertir contenido simple (PDF de texto / formulario) en fichas maquetadas estilo Vanguard (como Archivo 02), **sin depender del sistema PHP anterior**.

---

## 1. Principio de almacenamiento (obligatorio)

Todo vive bajo **`/home/vanguard/intranet2026`** (o ruta local del repo):

| Recurso | Ruta en disco | URL pública |
|---------|---------------|-------------|
| PDF origen subido | `backend/uploads/fichas-ia/origen/` | `https://sistema.vanguardschools.edu.pe/uploads/fichas-ia/origen/...` |
| PDF generado | `backend/uploads/fichas-ia/generados/` | `https://sistema.vanguardschools.edu.pe/uploads/fichas-ia/generados/...` |
| Assets plantilla (logos, personajes, iconos) | `backend/public/assets/fichas-ia/` | `https://sistema.vanguardschools.edu.pe/assets/fichas-ia/...` |
| Plantillas HTML Handlebars | `backend/templates/fichas-ia/` | (solo servidor, no URL directa) |
| Previews / JSON intermedio (opcional) | `backend/uploads/fichas-ia/trabajo/` | solo API |

Variables de entorno (backend `.env`):

```env
FICHAS_IA_UPLOAD_ROOT=          # vacío = backend/uploads/fichas-ia
FICHAS_IA_ASSETS_URL=https://sistema.vanguardschools.edu.pe/assets/fichas-ia
PUBLIC_FILES_URL=https://sistema.vanguardschools.edu.pe

# Proveedor IA (ver sección 4)
FICHAS_IA_PROVIDER=google
GOOGLE_AI_API_KEY=
# o
OPENAI_API_KEY=
```

**No usar** `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/...` ni `PHP_SYSTEM_URL` para este módulo.

Apache (`sistema.vanguardschools.edu.pe`): ya existe `Alias /uploads` y `/assets` hacia `intranet2026` — suficiente.

---

## 2. Flujo funcional

1. Docente/admin abre **Herramientas → Diseñador de fichas** (o desde aula virtual al crear tema).
2. Entrada: sube PDF simple **y/o** completa formulario (título, grado, área, unidad, puntos clave).
3. Backend extrae texto del PDF (local + IA si hace falta).
4. IA devuelve JSON estructurado (secciones, actividades, tablas, “Recuerda”, preguntas).
5. Motor renderiza **HTML + plantilla Vanguard** → PDF (Puppeteer recomendado; ver abajo).
6. Usuario **previsualiza**, edita campos si hace falta, **aprueba**.
7. Opcional: publicar directo como tema en aula virtual (`asignaturas_archivos`).

---

## 3. Base de datos

Migración: `database/migrations/046_disenador_fichas_ia_mysql.sql`

Tablas:

- `fichas_ia_plantillas` — plantillas por grado/área (Handlebars + versión).
- `fichas_ia_trabajos` — cada solicitud (estado, costos tokens, rutas archivos).
- `fichas_ia_trabajo_secciones` — JSON por bloque (editable antes de generar PDF).
- `fichas_ia_assets` — catálogo de imágenes propias del colegio (ruta relativa en `public/assets/fichas-ia`).

---

## 4. ¿Qué IA usar? (recomendación)

### Recomendación principal: **Google Gemini 2.0 Flash**

| Criterio | Gemini 2.0 Flash | OpenAI GPT-4o mini |
|----------|------------------|---------------------|
| Precio | ~$0.10 / 1M entrada, ~$0.40 / 1M salida | ~$0.15 / 1M entrada, ~$0.60 / 1M salida |
| PDF directo en API | Sí (multimodal) | Sí (vía Files API / visión) |
| Español / educación | Muy bueno | Muy bueno |
| JSON estructurado | Sí | Sí (response_format) |
| Cuota gratis desarrollo | Tier gratis con límites | Créditos iniciales limitados |

**Por qué Gemini primero:** más barato para el mismo trabajo, lee PDF en una sola llamada, contexto largo (útil si el tema es extenso).

### Reserva / comparación: **OpenAI GPT-4o mini**

Útil si ya tienen cuenta OpenAI, facturación unificada, o si en pruebas Gemini falla en extracción de algún PDF escaneado (entonces combinar **OCR local** + GPT-4o mini solo para redactar).

### No recomendado como núcleo

| Opción | Motivo |
|--------|--------|
| Solo ChatGPT manual | No integrable, sin trazabilidad ni costo por colegio |
| DALL-E / Imagen IA para toda la hoja | Caro, inconsistente, poco control pedagógico |
| Modelos “Pro” (GPT-4o, Claude Opus, Gemini Pro) | Overkill para fichas; 5–20× más caro por hoja |

### Ilustraciones (Archivo 02)

**No generar con IA en v1.** Usar banco fijo en `backend/public/assets/fichas-ia/`:

- `logo-vanguard.png`
- `avatar-nino.png`, `avatar-nina.png`
- `icono-recuerda.png`
- `diagrama-planta-generico.png`
- fondos / marcos por grado

La IA solo elige **qué asset usar** por etiqueta (`tipo_ilustracion: planta_diagrama`), no dibuja la hoja entera.

---

## 5. Stack técnico sugerido (Node, alineado al proyecto)

| Pieza | Herramienta | Costo licencia |
|-------|-------------|----------------|
| Extraer texto PDF | `pdf-parse` o `pdfjs-dist` | Gratis |
| PDF escaneado (OCR) | Tesseract.js o API Google Document AI | OCR local gratis; Document AI de pago |
| Estructurar contenido | Gemini 2.0 Flash API | Ver §6 |
| Plantilla | **Handlebars** (ya en `package.json`) | Gratis |
| HTML → PDF | **Puppeteer** (añadir dependencia) | Gratis |
| Alternativa PDF simple | `pdfkit` (ya instalado) | Gratis, pero peor para diseños complejos |

**Mejor combo calidad/precio:** Gemini Flash + Handlebars + Puppeteer + assets propios.

---

## 6. Costo estimado (referencia 2025–2026)

### Por una ficha típica (Archivo 01 → borrador Archivo 02)

Supuestos:

- PDF origen ~2–4 páginas → ~3 000–8 000 tokens de entrada (texto extraído o visión).
- Salida JSON + textos actividades ~2 000–4 000 tokens.
- **Sin** generación de imágenes IA.

| Proveedor | Tokens aprox. | Costo USD / ficha | Costo PEN (~3.75) |
|-----------|---------------|-------------------|-------------------|
| Gemini 2.0 Flash | ~10k in + 3k out | **$0.002 – $0.01** | S/ 0.01 – 0.04 |
| GPT-4o mini | mismo volumen | **$0.003 – $0.015** | S/ 0.01 – 0.06 |

### Escala mensual (solo API IA, sin servidor)

| Uso | Fichas/mes | Gemini Flash (aprox.) |
|------|------------|------------------------|
| Piloto | 50 | < $1 USD |
| Un colegio activo | 300 | $1 – 3 USD |
| Uso intenso docentes | 1 000 | $3 – 10 USD |

El costo **dominante no es la IA**, sino tiempo de desarrollo y almacenamiento en VPS (despreciable frente a APIs).

### Costos adicionales opcionales

| Servicio | Cuándo | Orden de magnitud |
|----------|--------|-------------------|
| Google Document AI (OCR PDF escaneado) | Solo si muchos PDF son fotos/escaneos | ~$1.50 / 1000 páginas |
| OpenAI embeddings | No necesario en v1 | — |
| Puppeteer en VPS | RAM ~200–400 MB al generar PDF | Ya incluido en VPS |

---

## 7. Cuentas y requisitos que necesitas

1. **Cuenta Google AI Studio** → API key para Gemini ([aistudio.google.com](https://aistudio.google.com))  
   - Facturación en Google Cloud si superas tier gratis.
2. **Opcional:** cuenta OpenAI Platform para fallback.
3. **Variables en** `backend/.env` (nunca subir keys a GitHub).
4. **Assets gráficos** del colegio en PNG/SVG (diseño una vez).
5. **1–2 plantillas Handlebars** (ej. Ciencia 4.º primaria) como Archivo 02.
6. **Política de uso:** revisión docente antes de publicar; aviso de que el borrador puede contener errores.

### Límites operativos recomendados

- Máx. 15 MB por PDF origen.
- Rate limit: ej. 10 generaciones / hora / usuario.
- Guardar en BD: `tokens_entrada`, `tokens_salida`, `costo_estimado_usd` por trabajo (auditoría).

---

## 8. Fases de implementación

| Fase | Entregable | IA |
|------|------------|-----|
| **0** | Migración SQL + carpetas + assets estáticos | — |
| **1** | Formulario + plantilla fija → PDF bonito (sin IA) | — |
| **2** | Subir PDF → extraer texto → Gemini → JSON → PDF | Gemini Flash |
| **3** | Editor de secciones + publicar en aula virtual | — |
| **4** | OCR para escaneados + segunda plantilla | opcional Document AI |

---

## 9. Decisión resumida

| Pregunta | Respuesta |
|----------|-----------|
| ¿Se puede? | Sí |
| ¿Mejor IA? | **Gemini 2.0 Flash** (principal), **GPT-4o mini** (reserva) |
| ¿Costo por ficha? | Centavos de dólar; despreciable vs. diseño manual |
| ¿Dónde guardar archivos? | Solo `intranet2026/backend/uploads/fichas-ia` y `public/assets/fichas-ia` |
| ¿Tablas BD? | Sí — ver migración `046_disenador_fichas_ia_mysql.sql` |

---

## 10. Enlaces oficiales de precios

- OpenAI: https://platform.openai.com/docs/pricing  
- Google Gemini API: https://ai.google.dev/pricing  

Revisar precios antes de producción; cambian con el tiempo.
