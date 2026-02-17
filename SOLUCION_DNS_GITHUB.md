# Solución para Problema de DNS/GitHub en VPS

## Problema
El VPS no puede resolver el DNS de GitHub (`Could not resolve host: github.com`), impidiendo hacer `git pull`.

## Soluciones

### Solución 1: Cambiar DNS Temporalmente (Recomendado)

```bash
# 1. Hacer backup del archivo de DNS actual
sudo cp /etc/resolv.conf /etc/resolv.conf.backup

# 2. Cambiar a DNS de Google (más confiable)
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf

# 3. Verificar que funciona
ping -c 2 github.com

# 4. Si funciona, hacer pull
cd /home/vanguard/intranet2026
git pull origin main

# 5. Reiniciar backend
pm2 restart intranet2026-backend
```

### Solución 2: Cambiar DNS Permanentemente

```bash
# 1. Editar el archivo de configuración de red
sudo nano /etc/systemd/resolved.conf

# 2. Descomentar y agregar:
DNS=8.8.8.8 8.8.4.4
FallbackDNS=1.1.1.1 1.0.0.1

# 3. Reiniciar el servicio de DNS
sudo systemctl restart systemd-resolved

# 4. Verificar
ping -c 2 github.com
```

### Solución 3: Usar WinSCP para Copiar Archivos (Cuando Git No Funciona)

Cuando `git pull` no funciona, puedes copiar archivos manualmente:

1. **Abrir WinSCP** y conectar al VPS
2. **Navegar a los archivos locales**: `C:\react-aula-virtual\backend\routes\`
3. **Copiar archivos actualizados** a: `/home/vanguard/intranet2026/backend/routes/`
4. **En Putty**, reiniciar el backend:
   ```bash
   cd /home/vanguard/intranet2026
   pm2 restart intranet2026-backend
   ```

### Solución 4: Agregar GitHub al /etc/hosts (Temporal)

```bash
# Obtener IP de GitHub
nslookup github.com 8.8.8.8

# Agregar al /etc/hosts (reemplazar IP con la obtenida)
echo "140.82.121.3 github.com" | sudo tee -a /etc/hosts
echo "140.82.121.4 api.github.com" | sudo tee -a /etc/hosts
```

## Prevención de Conflictos con Archivos PNG

Los archivos PNG subidos por WinSCP pueden causar conflictos. Ya están agregados al `.gitignore`:

- `frontend/public/icons/*.backup`
- `backend/public/assets/icons.backup/`

**IMPORTANTE**: Si subes archivos PNG por WinSCP, agrégalos al `.gitignore` ANTES de hacer `git pull`.

## Verificación

Después de aplicar cualquier solución, verifica:

```bash
# 1. Verificar conectividad
ping -c 2 github.com

# 2. Verificar git
git remote -v

# 3. Intentar pull
cd /home/vanguard/intranet2026
git pull origin main

# 4. Verificar que el código se actualizó
grep -n "DIAGNOSTICO.*Mes actual" backend/routes/auth.routes.js
```

## Nota sobre el Error `m.anio`

Si ves el error `Unknown column 'm.anio'`, significa que `docente.routes.js` también necesita actualizarse. El código correcto usa `g.anio as matricula_anio` (desde la tabla `grupos`).

