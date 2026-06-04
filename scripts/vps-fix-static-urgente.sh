#!/bin/bash
# URGENTE: fotos y PDFs en sistema.vanguardschools.edu.pe
# Ejecutar en PuTTY como usuario vanguard (ajustar rutas si difieren)

set -e

LEGACY_STATIC="/home/vanguard/nuevo.vanguardschools.edu.pe/Static"
NEW_STATIC="/home/vanguard/intranet2026/backend/Static"
ENV_FILE="/home/vanguard/intranet2026/backend/.env"
APACHE_CONF="/etc/apache2/sites-available/sistema.vanguardschools.edu.pe-le-ssl.conf"

echo "=== 1) Copiar archivos Static legacy → intranet2026 (si existen) ==="
if [ -d "$LEGACY_STATIC" ]; then
  mkdir -p "$NEW_STATIC"
  rsync -a --info=progress2 "$LEGACY_STATIC/" "$NEW_STATIC/"
  echo "OK: rsync completado"
else
  echo "AVISO: no existe $LEGACY_STATIC — revisar ruta del sistema PHP antiguo"
fi

echo ""
echo "=== 2) Conteo rápido de archivos ==="
for sub in Archivos "Image/Fotos" "Image/Fondos" Documentos; do
  d="$NEW_STATIC/$sub"
  if [ -d "$d" ]; then
    n=$(find "$d" -type f ! -name '.gitkeep' 2>/dev/null | wc -l)
    echo "  $sub: $n archivos"
  else
    echo "  $sub: CARPETA NO EXISTE"
    mkdir -p "$d"
  fi
done

echo ""
echo "=== 3) Variables .env (deben apuntar a sistema, NO a nuevo) ==="
if [ -f "$ENV_FILE" ]; then
  grep -E '^(PHP_SYSTEM_URL|STATIC_PUBLIC_URL|STATIC_FS_ROOT|FRONTEND_URL)=' "$ENV_FILE" || true
  if grep -q 'nuevo.vanguardschools' "$ENV_FILE"; then
    echo "ERROR: .env aún tiene nuevo.vanguardschools — corregir manualmente:"
    echo "  PHP_SYSTEM_URL=https://sistema.vanguardschools.edu.pe"
    echo "  STATIC_PUBLIC_URL=https://sistema.vanguardschools.edu.pe"
    echo "  STATIC_FS_ROOT=/home/vanguard/intranet2026/backend/Static"
  fi
else
  echo "AVISO: no se encontró $ENV_FILE"
fi

echo ""
echo "=== 4) Apache Alias /Static ==="
if [ -f "$APACHE_CONF" ]; then
  if grep -q 'Alias /Static' "$APACHE_CONF"; then
    grep 'Alias /Static' "$APACHE_CONF"
  else
    echo "ERROR: falta 'Alias /Static' en Apache — copiar desde repo:"
    echo "  sistema.vanguardschools.edu.pe-le-ssl.conf"
  fi
else
  echo "AVISO: conf Apache no encontrada en $APACHE_CONF"
fi

echo ""
echo "=== 5) Prueba HTTP (cambiar NOMBRE_FOTO por un archivo real en Fotos) ==="
echo "  curl -I https://sistema.vanguardschools.edu.pe/Static/Image/Fotos/NOMBRE_FOTO.jpg"
echo "  Debe responder HTTP/1.1 200 (no 404 ni text/html)"

echo ""
echo "=== 6) Desplegar código y reiniciar ==="
echo "  cd /home/vanguard/intranet2026 && git pull origin main"
echo "  cd frontend && npm install && npm run build && cd .."
echo "  pm2 restart all"
echo "  sudo systemctl reload apache2"
