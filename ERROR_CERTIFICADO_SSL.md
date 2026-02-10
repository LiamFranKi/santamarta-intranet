# 🔒 ERROR DE CERTIFICADO SSL: ERR_CERT_COMMON_NAME_INVALID

## ❌ Problema

El error `ERR_CERT_COMMON_NAME_INVALID` indica que el certificado SSL del servidor no coincide con el dominio que estás usando.

**Error en consola:**
```
ERR_CERT_COMMON_NAME_INVALID
intranet.vanguardschools.com/api/colegio/1:1 Failed to load resource
```

## 🔍 Causa

Estás accediendo a `intranet.vanguardschools.com`, pero el certificado SSL del servidor probablemente está configurado para:
- `sistema.vanguardschools.edu.pe`
- `vanguardschools.edu.pe`
- Otro dominio diferente

## ✅ Soluciones

### **Opción 1: Usar el dominio correcto (Recomendado)**

Si el certificado está configurado para `sistema.vanguardschools.edu.pe`, accede usando ese dominio:

```
https://sistema.vanguardschools.edu.pe
```

### **Opción 2: Configurar certificado SSL para el dominio correcto**

Si necesitas usar `intranet.vanguardschools.com`, debes:

1. **Configurar el certificado SSL en el servidor** para incluir `intranet.vanguardschools.com`
2. **Usar Let's Encrypt** (gratis) o un certificado comercial
3. **Configurar Nginx** para usar el certificado correcto

**Comandos para Let's Encrypt (en el VPS):**
```bash
# Instalar certbot si no está instalado
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtener certificado para intranet.vanguardschools.com
sudo certbot --nginx -d intranet.vanguardschools.com

# Renovar automáticamente (ya está configurado por defecto)
sudo certbot renew --dry-run
```

### **Opción 3: Configurar el frontend para usar el dominio correcto**

Si el certificado está en `sistema.vanguardschools.edu.pe`, configura el `.env` del frontend:

**`frontend/.env`:**
```env
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
```

Luego reconstruye el frontend:
```bash
cd ~/intranet2026/frontend
npm run build
```

## 🔧 Verificación

Para verificar qué dominios están en el certificado SSL:

1. **En el navegador:**
   - Haz clic en el candado 🔒 en la barra de direcciones
   - Ve a "Certificado" o "Certificate"
   - Revisa "Subject Alternative Name (SAN)" o "Common Name (CN)"

2. **Desde la línea de comandos (en el VPS):**
   ```bash
   echo | openssl s_client -servername intranet.vanguardschools.com -connect intranet.vanguardschools.com:443 2>/dev/null | openssl x509 -noout -text | grep -A 1 "Subject Alternative Name"
   ```

## 📋 Resumen

| Problema | Solución |
|----------|----------|
| Certificado SSL no coincide con el dominio | 1. Usar el dominio correcto<br>2. Configurar certificado para el dominio<br>3. Actualizar `.env` del frontend |

## ⚠️ Importante

- **NO es un problema del código**, es un problema de configuración del servidor/VPS
- El certificado SSL debe coincidir con el dominio que estás usando
- Si usas HTTP en lugar de HTTPS, no habrá este error, pero es **menos seguro**

---

**Recomendación:** Usa el dominio que tiene el certificado SSL válido (`sistema.vanguardschools.edu.pe`) o configura un certificado válido para `intranet.vanguardschools.com`.

