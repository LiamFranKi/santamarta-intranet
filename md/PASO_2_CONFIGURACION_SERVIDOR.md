# 🚀 PASO 2: CONFIGURACIÓN DEL SERVIDOR

## 📋 INFORMACIÓN DEL SERVIDOR

### VPS Hostinger (Donde se subirá React + PostgreSQL)
- **Host:** 72.60.172.101
- **Puerto SSH:** 22
- **Usuario:** root
- **Contraseña:** Vanguard2025@&
- **Subdominio:** intranet.vanguardschools.com
- **Carpeta:** /intranet

### VPS MySQL (Base de datos MySQL)
- **Host:** mysql.vanguardschools.edu.pe
- **Puerto:** 3306
- **Usuario:** vanguard
- **Contraseña:** QI_jkA]RsHF_gUDN
- **Base de datos:** vanguard_intranet

### SMTP (Gmail)
- **Host:** smtp.gmail.com
- **Puerto:** 587
- **Usuario:** walterlozanoalcalde@gmail.com
- **Contraseña:** ldvkcmqxshxdkupv

---

## 📁 ESTRUCTURA EN EL SERVIDOR

```
/var/www/html/intranet/          (o donde esté configurado)
├── backend/
│   ├── .env                     (Producción)
│   ├── server.js
│   └── ...
├── frontend/
│   ├── build/                   (Después de npm run build)
│   ├── .env                     (Producción)
│   └── ...
└── database/
    └── migrations/
```

---

## 🔧 CONFIGURACIÓN PASO A PASO

### 1. Conectar al Servidor Hostinger

```bash
ssh root@72.60.172.101
# Contraseña: Vanguard2025@&
```

### 2. Instalar Node.js y PostgreSQL

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js (v18 o superior)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Instalar PostgreSQL
apt install -y postgresql postgresql-contrib

# Verificar instalaciones
node --version
npm --version
psql --version
```

### 3. Configurar PostgreSQL

```bash
# Cambiar a usuario postgres
su - postgres

# Crear base de datos
psql
CREATE DATABASE aula_virtual;
CREATE USER aula_virtual_user WITH PASSWORD 'Vanguard2025@&';
GRANT ALL PRIVILEGES ON DATABASE aula_virtual TO aula_virtual_user;
\q

# Salir de postgres
exit
```

### 4. Crear Carpeta del Proyecto

```bash
# Ir a directorio web (ajustar según tu configuración)
cd /var/www/html

# Crear carpeta intranet
mkdir -p intranet
cd intranet
```

### 5. Subir Código al Servidor

**Opción A: Git (Recomendado)**
```bash
# En el servidor
cd /var/www/html/intranet
git clone https://github.com/tu-usuario/react-aula-virtual.git .

# O si ya tienes el repo
git pull origin master
```

**Opción B: SCP/SFTP**
```bash
# Desde tu máquina local
scp -r backend frontend root@72.60.172.101:/var/www/html/intranet/
```

### 6. Instalar Dependencias

```bash
# Backend
cd /var/www/html/intranet/backend
npm install --production

# Frontend
cd /var/www/html/intranet/frontend
npm install
npm run build
```

### 7. Configurar Variables de Entorno

Los archivos `.env` ya están creados con tus configuraciones. Solo verifica:

```bash
# Backend
cd /var/www/html/intranet/backend
cat .env

# Frontend
cd /var/www/html/intranet/frontend
cat .env
```

### 8. Configurar Nginx (Reverse Proxy)

```bash
# Crear configuración de Nginx
nano /etc/nginx/sites-available/intranet.vanguardschools.com
```

**Contenido:**
```nginx
server {
    listen 80;
    server_name intranet.vanguardschools.com;

    # Redirigir a HTTPS (si tienes SSL)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name intranet.vanguardschools.com;

    # SSL (ajustar rutas según tu certificado)
    ssl_certificate /etc/letsencrypt/live/intranet.vanguardschools.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/intranet.vanguardschools.com/privkey.pem;

    # Frontend (React build)
    location / {
        root /var/www/html/intranet/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Assets estáticos (logos, etc.)
    location /assets {
        alias /var/www/html/intranet/backend/public/assets;
    }
}
```

```bash
# Habilitar sitio
ln -s /etc/nginx/sites-available/intranet.vanguardschools.com /etc/nginx/sites-enabled/

# Verificar configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx
```

### 9. Configurar PM2 (Process Manager)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar backend con PM2
cd /var/www/html/intranet/backend
pm2 start server.js --name aula-virtual-backend

# Configurar PM2 para iniciar al arrancar
pm2 startup
pm2 save
```

### 10. Configurar SSL (Let's Encrypt)

```bash
# Instalar Certbot
apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL
certbot --nginx -d intranet.vanguardschools.com

# Renovar automáticamente
certbot renew --dry-run
```

---

## 🔍 VERIFICACIÓN

### 1. Verificar Backend
```bash
# Ver logs de PM2
pm2 logs aula-virtual-backend

# Verificar que está corriendo
pm2 status

# Probar endpoint
curl http://localhost:5000/api/health
```

### 2. Verificar Frontend
```bash
# Verificar que build existe
ls -la /var/www/html/intranet/frontend/build

# Probar en navegador
# https://intranet.vanguardschools.com
```

### 3. Verificar Conexión MySQL
```bash
# Desde el servidor, probar conexión
cd /var/www/html/intranet/backend
node -e "const mysql = require('mysql2/promise'); mysql.createConnection({host: 'mysql.vanguardschools.edu.pe', user: 'vanguard', password: 'REDACTED_ROTATE_ME', database: 'vanguard_intranet'}).then(() => console.log('✅ MySQL OK')).catch(e => console.error('❌ Error:', e.message))"
```

---

## 📝 COMANDOS ÚTILES

### PM2
```bash
# Ver procesos
pm2 status

# Ver logs
pm2 logs aula-virtual-backend

# Reiniciar
pm2 restart aula-virtual-backend

# Detener
pm2 stop aula-virtual-backend

# Eliminar
pm2 delete aula-virtual-backend
```

### Nginx
```bash
# Verificar configuración
nginx -t

# Reiniciar
systemctl restart nginx

# Ver logs
tail -f /var/log/nginx/error.log
```

### PostgreSQL
```bash
# Conectar
psql -U aula_virtual_user -d aula_virtual

# Ver bases de datos
psql -U postgres -c "\l"
```

---

## ✅ CHECKLIST DE DEPLOYMENT

- [ ] Node.js instalado en servidor
- [ ] PostgreSQL instalado y configurado
- [ ] Base de datos `aula_virtual` creada
- [ ] Código subido al servidor
- [ ] Dependencias instaladas (backend y frontend)
- [ ] Frontend compilado (`npm run build`)
- [ ] Archivos `.env` configurados
- [ ] Nginx configurado
- [ ] PM2 configurado y backend corriendo
- [ ] SSL configurado (Let's Encrypt)
- [ ] Dominio apuntando correctamente
- [ ] Conexión MySQL funcionando
- [ ] Frontend accesible en https://intranet.vanguardschools.com
- [ ] API accesible en https://intranet.vanguardschools.com/api/health

---

## 🔒 SEGURIDAD

1. **Firewall:**
   ```bash
   # Permitir solo puertos necesarios
   ufw allow 22    # SSH
   ufw allow 80    # HTTP
   ufw allow 443   # HTTPS
   ufw enable
   ```

2. **Permisos:**
   ```bash
   # Ajustar permisos
   chown -R www-data:www-data /var/www/html/intranet
   chmod -R 755 /var/www/html/intranet
   ```

3. **Variables de entorno:**
   - Nunca subir `.env` a Git
   - Usar diferentes valores en desarrollo y producción

---

**Una vez completado este paso, tu aplicación estará funcionando en producción.** 🚀

