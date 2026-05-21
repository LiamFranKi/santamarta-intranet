# PDF de Fichas IA en el VPS (Puppeteer / Chromium)

Si al generar aparece **libatk-1.0.so.0: cannot open shared object file**, faltan librerías de Linux para Chrome.

## Solución (PuTTY, una vez)

```bash
sudo apt-get update && sudo apt-get install -y \
  chromium-browser \
  fonts-liberation \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxss1 \
  libasound2
```

En Ubuntu 24+ el paquete puede llamarse `chromium` en lugar de `chromium-browser`:

```bash
sudo apt-get install -y chromium
```

Opcional en `backend/.env`:

```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

(o `/usr/bin/chromium` según `which chromium chromium-browser`)

Reiniciar:

```bash
cd /home/vanguard/intranet2026 && pm2 restart all
```

## Comprobar

```bash
which chromium-browser || which chromium
/usr/bin/chromium-browser --version 2>/dev/null || chromium --version
```

Luego regenerar la ficha en Fichas IA.
