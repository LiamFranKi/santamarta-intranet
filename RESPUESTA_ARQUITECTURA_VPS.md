# 🏗️ RECOMENDACIÓN DE ARQUITECTURA PARA VPS

## 📋 RESPUESTA A TUS PREGUNTAS

### 1. ✅ URLs de Archivos (PDFs, imágenes, etc.)

**SÍ, SE PUEDE ARREGLAR EN TIEMPO REAL cuando lo subas al VPS.**

He creado una configuración centralizada en `frontend/src/config/staticFiles.js` que permite cambiar el dominio fácilmente.

**Para cambiar el dominio después de subir al VPS:**

1. **Opción 1 - Archivo de configuración (Recomendado):**
   - Abrir `frontend/src/config/staticFiles.js`
   - Cambiar la línea: `const STATIC_FILES_DOMAIN = 'https://nuevo.vanguardschools.edu.pe';`
   - Recompilar: `npm run build`

2. **Opción 2 - Variable de entorno:**
   - Agregar en `frontend/.env`: `REACT_APP_STATIC_FILES_DOMAIN=https://tu-dominio.com`
   - Recompilar

**NO necesitas cambiar código en múltiples lugares**, todo está centralizado.

---

## 🏛️ ARQUITECTURA RECOMENDADA

### ✅ **RECOMENDACIÓN: Mismo VPS, Carpetas Separadas**

Te recomiendo **poner todo en el mismo VPS** donde está MySQL, pero en **carpetas separadas**. Esto es **MEJOR** por las siguientes razones:

### ✅ **VENTAJAS de Mismo VPS:**

1. **⚡ Menor Latencia:**
   - Node.js y MySQL en el mismo servidor = conexión local (localhost)
   - Latencia prácticamente cero vs conexión remota entre VPS
   - Consultas a base de datos MUCHO más rápidas

2. **🔒 Mayor Seguridad:**
   - No expones MySQL al exterior
   - No necesitas abrir puertos 3306 en el firewall
   - Todo queda dentro del mismo firewall/red privada

3. **💰 Ahorro de Recursos:**
   - No duplicas recursos del sistema operativo
   - Menos memoria RAM total (un solo OS)
   - Menor consumo de CPU

4. **🛠️ Más Fácil de Gestionar:**
   - Un solo servidor que monitorear
   - Un solo backup que hacer
   - Un solo punto de mantenimiento

5. **🔌 Sin Dependencias Externas:**
   - No dependes de la conexión entre VPS
   - Si un VPS se cae, ambos sistemas caen (mejor que tener dependencias rotas)
   - Menos puntos de fallo

### ❌ **DESVENTAJAS de Mismo VPS:**

1. **⚠️ Si el VPS se cae, todo se cae:**
   - Pero esto es MEJOR que tener sistemas dependientes
   - Si MySQL cae, React también debería caer (lógica)

2. **📊 Recursos Compartidos:**
   - PHP y Node.js comparten CPU/RAM
   - Pero para un sistema educativo, esto no debería ser problema

---

### 📁 **ESTRUCTURA RECOMENDADA:**

```
/home/vanguard/
├── public_html/              # Sistema PHP actual
│   ├── Static/
│   │   ├── Archivos/         # PDFs, documentos
│   │   ├── Image/            # Fotos, imágenes
│   │   └── ...
│   └── ...
│
└── intranet/                 # Nuevo sistema React/Node.js
    ├── frontend/             # Aplicación React compilada
    │   └── build/
    ├── backend/              # API Node.js
    │   ├── server.js
    │   └── ...
    └── postgresql/           # Si usas PostgreSQL (opcional)
```

---

### ⚙️ **CONFIGURACIÓN:**

**Backend .env:**
```env
# MySQL - Ahora es LOCAL (mismo VPS)
MYSQL_HOST=localhost          # ✅ Cambio importante
MYSQL_PORT=3306
MYSQL_USER=vanguard
MYSQL_PASSWORD=tu_password
MYSQL_DATABASE=vanguard_intranet

# PostgreSQL (si lo usas)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

**Frontend .env:**
```env
# Archivos estáticos - Mismo VPS
REACT_APP_STATIC_FILES_DOMAIN=https://vanguardschools.edu.pe
# O si están en una subcarpeta:
REACT_APP_STATIC_FILES_DOMAIN=https://vanguardschools.edu.pe/Static
```

---

### 🔄 **SI CAMBIAS DE OPINIÓN:**

Si después quieres moverlo a otro VPS:

1. **Es FÁCIL migrar:**
   - Solo cambias `MYSQL_HOST` de `localhost` a `mysql.vanguardschools.edu.pe`
   - Abres el puerto 3306 en el firewall
   - Ajustas las URLs de archivos estáticos

2. **No rompes nada:**
   - Todo está configurado con variables de entorno
   - No necesitas cambiar código

---

## 🎯 **MI RECOMENDACIÓN FINAL:**

**✅ USAR EL MISMO VPS** donde está MySQL, pero en carpeta separada (`/intranet` o similar).

**Razones:**
- Más rápido (latencia local)
- Más seguro (MySQL no expuesto)
- Más simple (un solo servidor)
- Más económico (no duplicas recursos)
- Más confiable (sin dependencias entre VPS)

**Para un sistema educativo, esto es PERFECTO.** No necesitas la complejidad de múltiples VPS a menos que tengas cientos de miles de usuarios concurrentes.

---

## 📝 **NOTA IMPORTANTE:**

Cuando subas al VPS, solo necesitas:

1. **Ajustar el dominio en `staticFiles.js`** (1 línea)
2. **Cambiar `MYSQL_HOST` a `localhost`** en el `.env` del backend
3. **Verificar rutas de archivos estáticos**

**TODO SE PUEDE CAMBIAR EN TIEMPO REAL** sin tocar código complejo. 🎉









