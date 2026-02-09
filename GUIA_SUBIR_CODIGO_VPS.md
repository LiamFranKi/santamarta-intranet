# 📤 GUÍA COMPLETA: SUBIR CÓDIGO AL VPS Y CREAR ARCHIVOS .env

## 🎯 RESUMEN RÁPIDO

Esta guía te explica paso a paso cómo:
1. Subir el código actualizado al VPS (usando Git)
2. Crear el archivo `.env` en el frontend (esto es lo que te confundía)
3. Compilar el frontend para producción
4. Reiniciar el sistema

---

## 📋 PASO 1: SUBIR CÓDIGO A GITHUB (Desde tu computadora)

### 1.1 Abrir Git Bash o Terminal en tu computadora

```bash
# Ir a la carpeta del proyecto
cd C:\react-aula-virtual

# Verificar que tienes cambios
git status

# Agregar todos los cambios
git add .

# Hacer commit
git commit -m "feat: Agregar soporte para REACT_APP_API_URL como respaldo"

# Subir a GitHub
git push origin main
```

**✅ Listo, el código está en GitHub**

---

## 📋 PASO 2: CONECTARSE AL VPS CON PUTTY

1. Abre **Putty**
2. Conecta a tu VPS: `vanguard@89.117.52.9` (o tu IP)
3. Ingresa tu contraseña

---

## 📋 PASO 3: ACTUALIZAR CÓDIGO EN EL VPS

### 3.1 Ir a la carpeta del proyecto

```bash
# Si tu proyecto está en ~/intranet2026 (ajusta según tu caso)
cd ~/intranet2026

# O si está en otra ubicación, ve ahí
# cd /home/vanguard/react-aula-virtual
```

### 3.2 Actualizar desde GitHub

```bash
# Descargar los últimos cambios
git pull origin main
```

**✅ El código está actualizado**

---

## 📋 PASO 4: CREAR ARCHIVO .env EN EL FRONTEND

### 4.1 Ir a la carpeta frontend

```bash
cd frontend
```

### 4.2 Verificar si ya existe un archivo .env

```bash
# Ver si existe
ls -la .env

# Si NO existe, verás: "No such file or directory"
# Si SÍ existe, verás el archivo listado
```

### 4.3 Crear el archivo .env (OPCIONAL - Solo si quieres usar la variable)

**IMPORTANTE:** Este archivo es OPCIONAL. Si no lo creas, el sistema seguirá funcionando con detección automática.

#### Opción A: Copiar desde el ejemplo (MÁS FÁCIL)

```bash
# Copiar el archivo de ejemplo
cp env.production.example .env

# Verificar que se creó
ls -la .env
```

#### Opción B: Crear manualmente con nano

```bash
# Crear archivo nuevo
nano .env
```

**Dentro de nano, pega esto:**

```
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
```

**Para guardar en nano:**
1. Presiona `Ctrl + O` (guardar)
2. Presiona `Enter` (confirmar nombre)
3. Presiona `Ctrl + X` (salir)

**✅ Archivo .env creado**

### 4.4 Verificar el contenido del archivo

```bash
# Ver el contenido
cat .env
```

**Deberías ver:**
```
REACT_APP_API_URL=https://sistema.vanguardschools.edu.pe/api
```

---

## 📋 PASO 5: COMPILAR EL FRONTEND PARA PRODUCCIÓN

### 5.1 Asegurarte de estar en la carpeta frontend

```bash
cd ~/intranet2026/frontend
# (o la ruta donde esté tu proyecto)
```

### 5.2 Compilar

```bash
npm run build
```

**⏱️ Esto puede tardar 2-5 minutos**

**✅ Verás algo como:**
```
Creating an optimized production build...
Compiled successfully!
```

### 5.3 Verificar que se creó la carpeta build

```bash
ls -la build/
```

**Deberías ver archivos como:**
- `index.html`
- `static/`
- `service-worker.js`

---

## 📋 PASO 6: VERIFICAR ARCHIVO .env DEL BACKEND (Si es necesario)

### 6.1 Ir a la carpeta backend

```bash
cd ~/intranet2026/backend
```

### 6.2 Verificar si existe .env

```bash
ls -la .env
```

### 6.3 Si NO existe, crearlo

```bash
# Copiar desde ejemplo (si tienes uno)
cp env.production.example .env

# O crear manualmente
nano .env
```

**Contenido mínimo del .env del backend:**

```env
NODE_ENV=production
PORT=5000

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=vanguard
MYSQL_PASSWORD=tu_password_mysql
MYSQL_DATABASE=vanguard_intranet

JWT_SECRET=tu_secret_key_muy_segura

ALLOWED_ORIGINS=https://sistema.vanguardschools.edu.pe
FRONTEND_URL=https://sistema.vanguardschools.edu.pe
```

**Guardar:** `Ctrl + O`, `Enter`, `Ctrl + X`

---

## 📋 PASO 7: REINICIAR EL BACKEND (Si usas PM2)

### 7.1 Verificar procesos PM2

```bash
pm2 list
```

### 7.2 Reiniciar el backend

```bash
pm2 restart all
# O si tienes un nombre específico:
# pm2 restart react-aula-virtual-backend
```

### 7.3 Ver logs (opcional)

```bash
pm2 logs
```

---

## 📋 PASO 8: REINICIAR NGINX/APACHE (Si es necesario)

### Si usas Nginx:

```bash
sudo systemctl reload nginx
```

### Si usas Apache:

```bash
sudo systemctl reload apache2
```

---

## ✅ VERIFICACIÓN FINAL

### 1. Verificar que el frontend compiló correctamente

```bash
cd ~/intranet2026/frontend
ls -la build/index.html
```

### 2. Verificar que el backend está corriendo

```bash
pm2 status
```

### 3. Probar en el navegador

Abre: `https://sistema.vanguardschools.edu.pe`

**Debería funcionar correctamente.**

---

## 🔍 TROUBLESHOOTING (Si algo falla)

### Error: "npm: command not found"

```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Error: "git: command not found"

```bash
# Instalar Git
sudo apt-get update
sudo apt-get install git
```

### Error al compilar: "Cannot find module"

```bash
# Reinstalar dependencias
cd ~/intranet2026/frontend
rm -rf node_modules
npm install
npm run build
```

### El archivo .env no se lee

**IMPORTANTE:** En React, las variables de entorno se leen SOLO durante la compilación (`npm run build`).

Si cambias el `.env` después de compilar, debes:
1. Cambiar el `.env`
2. Volver a compilar: `npm run build`

---

## 📝 RESUMEN DE COMANDOS (Copia y pega)

```bash
# 1. Ir al proyecto
cd ~/intranet2026

# 2. Actualizar código
git pull origin main

# 3. Ir a frontend
cd frontend

# 4. Crear .env (OPCIONAL - solo si quieres usar la variable)
cp env.production.example .env

# 5. Compilar
npm run build

# 6. Reiniciar backend (si usas PM2)
cd ../backend
pm2 restart all

# 7. Reiniciar servidor web
sudo systemctl reload nginx
# O
sudo systemctl reload apache2
```

---

## 🎯 NOTA IMPORTANTE SOBRE EL ARCHIVO .env

**El archivo `.env` en el frontend es OPCIONAL porque:**

1. ✅ Si NO lo creas → El sistema detecta automáticamente el dominio y funciona perfecto
2. ✅ Si SÍ lo creas → El sistema usará la URL que pongas ahí

**Recomendación:** 
- Si tu frontend y backend están en el mismo dominio → **NO necesitas crear el .env**
- Si están en dominios diferentes → **SÍ crea el .env** con la URL correcta

---

## ✅ LISTO

Con estos pasos, tu código estará actualizado en el VPS y funcionando correctamente.

**¿Dudas?** Revisa los logs con `pm2 logs` o verifica los archivos con `ls -la`.

