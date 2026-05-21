# Cómo obtener la API key de Gemini (Google)

No se “compra” en una tienda aparte: es una **API de Google** con tier gratuito y facturación por uso si superas límites.

## Pasos (recomendado: Google AI Studio)

1. Entra con tu cuenta Google: **https://aistudio.google.com**
2. Menú **Get API key** / **Obtener clave de API**.
3. Crea un proyecto (o elige uno existente) y genera la clave.
4. Copia la clave (solo se muestra completa una vez; guárdala en lugar seguro).

## Configurar en el VPS (intranet2026)

Edita `backend/.env`:

```env
GOOGLE_AI_API_KEY=AIzaSy................................
FICHAS_IA_PROVIDER=google
FICHAS_IA_GEMINI_MODEL=gemini-2.5-flash
PUBLIC_FILES_URL=https://sistema.vanguardschools.edu.pe
```

Reinicia Node:

```bash
cd /home/vanguard/intranet2026 && pm2 restart all
```

## Facturación (cuando dejas de usar solo el gratis)

1. En **Google Cloud Console**: https://console.cloud.google.com  
2. Activa facturación en el proyecto vinculado a la API (tarjeta).
3. Opcional: en **APIs & Services** habilita **Generative Language API**.

El costo por ficha en Vanguard es del orden de **centavos de dólar** (ver `docs/DISENADOR_FICHAS_IA.md`).

## Seguridad

- No subas la key a GitHub.
- Restringe la key por IP o referrer en Google Cloud si el colegio lo exige.
- Rota la clave si se filtró.

## Probar sin key

El módulo **Diseñador de fichas** funciona en modo **sin IA** (formulario + plantilla). Marque o desmarque “Usar IA” según tenga la variable configurada.

## Enlace oficial de precios

https://ai.google.dev/pricing
