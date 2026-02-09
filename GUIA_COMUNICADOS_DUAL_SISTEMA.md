# 📄 GUÍA: Comunicados - Sistema Dual (PHP + React/Node.js)

## 🎯 PROBLEMA RESUELTO

Los comunicados pueden venir de **dos sistemas diferentes**:
1. **Sistema PHP anterior**: Archivos en `/Static/Archivos/`
2. **Sistema nuevo (React/Node.js)**: Archivos en `/uploads/comunicados/`

El backend **detecta automáticamente** el origen y construye la URL correcta.

---

## 🔍 CÓMO FUNCIONA LA DETECCIÓN

### **Detección Automática:**

El backend analiza el campo `archivo` de cada comunicado:

```javascript
// Si empieza con /uploads/comunicados/ → Sistema nuevo
const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                       nombreArchivo.startsWith('uploads/comunicados/');
```

### **Construcción de URLs:**

#### **Sistema Nuevo (React/Node.js):**
- **Ruta en BD:** `/uploads/comunicados/comunicado-123.pdf`
- **URL en desarrollo:** `http://localhost:5000/uploads/comunicados/comunicado-123.pdf`
- **URL en producción:** `https://nuevo.vanguardschools.edu.pe/uploads/comunicados/comunicado-123.pdf`

#### **Sistema Anterior (PHP):**
- **Ruta en BD:** `comunicado-456.pdf` o `/Static/Archivos/comunicado-456.pdf`
- **URL:** `https://nuevo.vanguardschools.edu.pe/Static/Archivos/comunicado-456.pdf`

---

## 📋 ESTRUCTURA DE ARCHIVOS

```
VPS
├── public_html/                    # Sistema PHP
│   └── Static/
│       └── Archivos/               # ← Comunicados del sistema anterior
│           ├── comunicado-1.pdf
│           └── comunicado-2.pdf
│
└── intranet/                       # Sistema Nuevo
    └── backend/
        └── uploads/
            └── comunicados/        # ← Comunicados del sistema nuevo
                ├── comunicado-3.pdf
                └── comunicado-4.pdf
```

---

## ✅ VENTAJAS DE ESTA SOLUCIÓN

### 1. **🔄 Compatibilidad Total**
- ✅ Lee comunicados del sistema anterior
- ✅ Lee comunicados del sistema nuevo
- ✅ No requiere migración de archivos
- ✅ Ambos sistemas pueden coexistir

### 2. **🔍 Detección Automática**
- ✅ No requiere cambios en la base de datos
- ✅ No requiere campo adicional
- ✅ Detecta el origen por el formato de la ruta

### 3. **🚀 Sin Conflictos**
- ✅ Cada sistema guarda en su propia carpeta
- ✅ URLs diferentes para cada sistema
- ✅ No hay colisiones de nombres

---

## 📝 IMPLEMENTACIÓN FUTURA: CREAR COMUNICADOS

Cuando implementes la creación de comunicados en el nuevo sistema:

### **Backend (`backend/routes/admin.routes.js` o similar):**

```javascript
// Configurar multer para comunicados
const comunicadosStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../backend/uploads/comunicados');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `comunicado-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadComunicados = multer({
  storage: comunicadosStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

// Endpoint para crear comunicado
router.post('/admin/comunicados', uploadComunicados.single('archivo'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { descripcion, contenido, tipo, estado, show_in_home } = req.body;
    
    let archivoPath = '';
    if (req.file) {
      // IMPORTANTE: Guardar como ruta relativa /uploads/comunicados/filename
      // Esto permite que el backend detecte que es del sistema nuevo
      archivoPath = `/uploads/comunicados/${req.file.filename}`;
    }
    
    const fechaHora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const result = await execute(
      `INSERT INTO comunicados 
       (colegio_id, descripcion, contenido, archivo, privacidad, fecha_hora, tipo, estado, show_in_home)
       VALUES (?, ?, ?, ?, 'PERSONAL', ?, ?, ?, ?)`,
      [colegio_id, descripcion, contenido, archivoPath, fechaHora, tipo, estado, show_in_home || 0]
    );
    
    res.json({
      success: true,
      message: 'Comunicado creado correctamente',
      comunicado: {
        id: result.insertId,
        descripcion,
        contenido,
        archivo: archivoPath,
        tipo,
        estado
      }
    });
  } catch (error) {
    console.error('Error creando comunicado:', error);
    res.status(500).json({ error: 'Error al crear comunicado' });
  }
});
```

### **Frontend (cuando lo implementes):**

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  const formDataToSend = new FormData();
  formDataToSend.append('descripcion', formData.descripcion);
  formDataToSend.append('contenido', formData.contenido);
  formDataToSend.append('tipo', formData.tipo);
  formDataToSend.append('estado', formData.estado);
  formDataToSend.append('show_in_home', formData.show_in_home ? 1 : 0);
  
  if (archivoFile) {
    formDataToSend.append('archivo', archivoFile);
  }
  
  await api.post('/admin/comunicados', formDataToSend, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
```

---

## 🔧 CONFIGURACIÓN DEL SERVIDOR

### **Node.js (`backend/server.js`):**

Ya está configurado para servir archivos desde `/uploads`:

```javascript
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cache-Control', 'public, max-age=86400');
    // ... tipos MIME
  }
}));
```

### **Nginx (si usas proxy reverso):**

```nginx
# Archivos del sistema nuevo (Node.js)
location /uploads {
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

# Archivos del sistema anterior (PHP)
location /Static {
    # Ya está configurado para el sistema PHP
    # No requiere cambios
}
```

---

## ✅ VERIFICACIÓN

### **Comunicados del Sistema Anterior:**
1. ✅ Se leen desde la BD
2. ✅ Campo `archivo` = `comunicado-123.pdf` (solo nombre)
3. ✅ Backend detecta que NO empieza con `/uploads/comunicados/`
4. ✅ Construye URL: `https://nuevo.vanguardschools.edu.pe/Static/Archivos/comunicado-123.pdf`
5. ✅ Se abre correctamente

### **Comunicados del Sistema Nuevo:**
1. ✅ Se leen desde la BD
2. ✅ Campo `archivo` = `/uploads/comunicados/comunicado-456.pdf` (ruta completa)
3. ✅ Backend detecta que SÍ empieza con `/uploads/comunicados/`
4. ✅ Construye URL: `https://nuevo.vanguardschools.edu.pe/uploads/comunicados/comunicado-456.pdf`
5. ✅ Se abre correctamente

---

## 🎯 CONCLUSIÓN

**✅ NO HAY CONFLICTOS:**

- ✅ Cada sistema guarda en su propia carpeta
- ✅ El backend detecta automáticamente el origen
- ✅ Construye la URL correcta según el origen
- ✅ Ambos tipos de comunicados se pueden leer y abrir
- ✅ No requiere migración de archivos
- ✅ No requiere cambios en la base de datos

**Cuando implementes la creación de comunicados en el nuevo sistema, simplemente guarda la ruta como `/uploads/comunicados/filename.pdf` y el backend automáticamente detectará que es del sistema nuevo y construirá la URL correcta.** ✅









