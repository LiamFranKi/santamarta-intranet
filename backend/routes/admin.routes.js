const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, execute } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const phpSerialize = require('php-serialize');

// Configurar multer para subir archivos de configuración
const configStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Image/Fondos/ del sistema PHP (compartido con ambos sistemas)
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fondos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `config-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterConfig = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPG, PNG)'));
  }
};

const uploadConfig = multer({
  storage: configStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterConfig
});

// Todas las rutas requieren autenticación y ser ADMINISTRADOR
router.use(authenticateToken);
router.use(requireUserType('ADMINISTRADOR'));

/**
 * GET /api/admin/configuracion
 * Obtener configuración del colegio
 */
router.get('/configuracion', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    // Obtener datos del colegio
    const colegio = await query(
      `SELECT 
        titulo_intranet,
        codigo_modular,
        resolucion_creacion,
        ugel_codigo,
        ugel_nombre,
        anio_activo,
        anio_matriculas,
        ciclo_pensiones,
        inicio_pensiones,
        total_pensiones,
        moneda,
        monto_adicional,
        ciclo_notas,
        inicio_notas,
        total_notas,
        rangos_ciclos_notas,
        rangos_mensajes,
        rangos_letras_primaria,
        pensiones_vencimiento,
        dias_tolerancia,
        ruc,
        razon_social,
        direccion,
        comision_tarjeta_debito,
        comision_tarjeta_credito,
        clave_bloques,
        bloquear_deudores
      FROM colegios 
      WHERE id = ?`,
      [colegio_id]
    );

    if (colegio.length === 0) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    const colegioData = colegio[0];

    // Debug: verificar valores numéricos de la base de datos
    console.log('=== DEBUG inicio_pensiones ===');
    console.log('Tipo de dato:', typeof colegioData.inicio_pensiones);
    console.log('Valor raw:', colegioData.inicio_pensiones);
    console.log('Valor como número:', Number(colegioData.inicio_pensiones));
    console.log('Valor parseado:', parseInt(colegioData.inicio_pensiones, 10));

    // Debug: verificar qué se está recibiendo de la base de datos
    console.log('=== DEBUG rangos_letras_primaria ===');
    console.log('Tipo de dato:', typeof colegioData.rangos_letras_primaria);
    console.log('Valor raw:', colegioData.rangos_letras_primaria);
    console.log('Es null?', colegioData.rangos_letras_primaria === null);
    console.log('Es undefined?', colegioData.rangos_letras_primaria === undefined);
    console.log('Es string vacío?', colegioData.rangos_letras_primaria === '');
    console.log('Longitud:', colegioData.rangos_letras_primaria ? colegioData.rangos_letras_primaria.length : 'N/A');

    // Obtener configuraciones adicionales de la tabla config
    // Nota: La tabla config no tiene colegio_id, es global
    const configs = await query(
      `SELECT clave, valor FROM config`
    );

    const configMap = {};
    configs.forEach(c => {
      configMap[c.clave] = c.valor;
    });

    // Deserializar campos serializados
    let rangosMensajes = [];
    if (colegioData.rangos_mensajes) {
      try {
        const deserialized = phpSerialize.unserialize(Buffer.from(colegioData.rangos_mensajes, 'base64'));
        rangosMensajes = Array.isArray(deserialized) ? deserialized : [];
      } catch (e) {
        console.warn('Error deserializando rangos_mensajes:', e);
      }
    }

    let rangosLetrasPrimaria = [];
    if (colegioData.rangos_letras_primaria && colegioData.rangos_letras_primaria !== '' && colegioData.rangos_letras_primaria !== null) {
      try {
        // El campo es TEXT en MySQL, así que viene como string
        // El sistema PHP guarda como base64_encode(serialize(...))
        // Necesitamos decodificar base64 y luego deserializar
        const base64String = colegioData.rangos_letras_primaria;
        const buffer = Buffer.from(base64String, 'base64');
        const deserialized = phpSerialize.unserialize(buffer);
        
        // PHP puede deserializar arrays asociativos como objetos en JavaScript
        // Necesitamos convertir el objeto a array si es necesario
        if (Array.isArray(deserialized)) {
          rangosLetrasPrimaria = deserialized;
        } else if (typeof deserialized === 'object' && deserialized !== null) {
          // Convertir objeto a array (puede tener claves numéricas)
          rangosLetrasPrimaria = Object.values(deserialized);
          console.log('⚠️ Convertido de objeto a array');
        } else {
          console.warn('⚠️ rangos_letras_primaria deserializado pero no es array ni objeto:', typeof deserialized);
          rangosLetrasPrimaria = [];
        }
        
        console.log('✅ rangos_letras_primaria deserializado exitosamente');
        console.log('Cantidad de rangos:', rangosLetrasPrimaria.length);
        console.log('Datos:', JSON.stringify(rangosLetrasPrimaria, null, 2));
      } catch (e) {
        console.error('❌ Error deserializando rangos_letras_primaria:', e.message);
        console.error('Stack:', e.stack);
        console.log('Valor original (primeros 200 chars):', 
          typeof colegioData.rangos_letras_primaria === 'string' 
            ? colegioData.rangos_letras_primaria.substring(0, 200) 
            : 'No es string');
      }
    } else {
      console.log('⚠️ rangos_letras_primaria está vacío, null o undefined');
    }

    let rangosCiclosNotas = {};
    if (colegioData.rangos_ciclos_notas) {
      try {
        // rangos_ciclos_notas está serializado con PHP serialize(), no JSON
        const deserialized = phpSerialize.unserialize(colegioData.rangos_ciclos_notas);
        rangosCiclosNotas = deserialized || {};
      } catch (e) {
        console.warn('Error deserializando rangos_ciclos_notas:', e);
        // Intentar como JSON por si acaso
        try {
          rangosCiclosNotas = JSON.parse(colegioData.rangos_ciclos_notas);
        } catch (e2) {
          console.warn('Error parseando rangos_ciclos_notas como JSON:', e2);
        }
      }
    }

    let pensionesVencimiento = {};
    if (colegioData.pensiones_vencimiento) {
      try {
        const deserialized = phpSerialize.unserialize(Buffer.from(colegioData.pensiones_vencimiento, 'base64'));
        pensionesVencimiento = deserialized || {};
      } catch (e) {
        console.warn('Error deserializando pensiones_vencimiento:', e);
      }
    }

    // Construir URLs de imágenes
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction ? phpSystemUrl : 'http://localhost:5000';

    // Asegurar que inicio_pensiones e inicio_notas sean números explícitamente
    const inicioPensionesNum = Number(colegioData.inicio_pensiones) || 1;
    const inicioNotasNum = Number(colegioData.inicio_notas) || 1;
    
    console.log('=== VALORES FINALES ENVIADOS AL FRONTEND ===');
    console.log('inicio_pensiones:', inicioPensionesNum, 'tipo:', typeof inicioPensionesNum);
    console.log('inicio_notas:', inicioNotasNum, 'tipo:', typeof inicioNotasNum);
    
    // Separar colegioData para evitar sobrescribir valores
    const { inicio_pensiones: _, inicio_notas: __, ...restColegioData } = colegioData;
    
    res.json({
      ...restColegioData,
      inicio_pensiones: inicioPensionesNum, // Forzar como número
      inicio_notas: inicioNotasNum, // Forzar como número
      rangos_mensajes: rangosMensajes,
      rangos_letras_primaria: rangosLetrasPrimaria,
      rangos_ciclos_notas: rangosCiclosNotas,
      pensiones_vencimiento: pensionesVencimiento,
      texto_intranet: configMap['texto_intranet'] || '',
      titulo_formulario_matricula: configMap['titulo_formulario_matricula'] || '',
      recaudo_nro_sucursal: configMap['recaudo_nro_sucursal'] || '',
      recaudo_nro_cuenta: configMap['recaudo_nro_cuenta'] || '',
      recaudo_razon_social: configMap['recaudo_razon_social'] || '',
      email_notificacion_matricula_online: configMap['email_notificacion_matricula_online'] || '',
      remitente_emails: configMap['remitente_emails'] || '',
      email_matricula_apoderado: configMap['email_matricula_apoderado'] || '',
      link_consulta_facturas: configMap['link_consulta_facturas'] || '',
      show_birthday_window: configMap['show_birthday_window'] || 'NO',
      enable_enrollment_form: configMap['enable_enrollment_form'] || 'NO',
      login_fondo: colegioData.login_background ? `${baseUrl}/Static/Image/Fondos/${colegioData.login_background}` : null,
      libreta_logo: configMap['libreta_logo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_logo']}` : null,
      libreta_fondo: configMap['libreta_fondo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_fondo']}` : null,
      boleta_logo: configMap['boleta_logo'] ? `${baseUrl}/Static/Archivos/${configMap['boleta_logo']}` : null
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

/**
 * PUT /api/admin/configuracion
 * Guardar configuración del colegio
 */
router.put('/configuracion', uploadConfig.fields([
  { name: 'login_fondo', maxCount: 1 },
  { name: 'libreta_logo', maxCount: 1 },
  { name: 'libreta_fondo', maxCount: 1 },
  { name: 'boleta_logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const body = req.body;

    // Preparar datos para actualizar en colegios
    const updateFields = [];
    const updateValues = [];

    // Campos directos de colegios
    const colegioFields = [
      'titulo_intranet', 'codigo_modular', 'resolucion_creacion', 'ugel_codigo', 'ugel_nombre',
      'anio_activo', 'anio_matriculas', 'ciclo_pensiones', 'inicio_pensiones', 'total_pensiones',
      'moneda', 'monto_adicional', 'ciclo_notas', 'inicio_notas', 'total_notas',
      'dias_tolerancia', 'ruc', 'razon_social', 'direccion',
      'comision_tarjeta_debito', 'comision_tarjeta_credito', 'clave_bloques', 'bloquear_deudores'
    ];

    colegioFields.forEach(field => {
      if (body[field] !== undefined) {
        let value = body[field];
        
        // Campos numéricos que deben ser números
        const numericFields = ['inicio_pensiones', 'inicio_notas', 'total_pensiones', 'total_notas', 
                              'ciclo_pensiones', 'ciclo_notas', 'monto_adicional', 'dias_tolerancia',
                              'comision_tarjeta_debito', 'comision_tarjeta_credito', 'anio_activo', 'anio_matriculas'];
        
        if (numericFields.includes(field)) {
          // Convertir a número explícitamente
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            value = numValue;
            console.log(`🔧 Campo numérico ${field}: valor recibido "${body[field]}", convertido a ${value} (tipo: ${typeof value})`);
          } else {
            console.warn(`⚠️ Campo numérico ${field}: valor "${body[field]}" no es un número válido, usando valor original`);
          }
        }
        
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
      }
    });
    
    // Debug: verificar valores de inicio_pensiones e inicio_notas antes de guardar
    if (body.inicio_pensiones !== undefined) {
      console.log('=== DEBUG GUARDAR inicio_pensiones ===');
      console.log('Valor recibido en body:', body.inicio_pensiones, 'tipo:', typeof body.inicio_pensiones);
      const fieldIndex = updateFields.findIndex(f => f.includes('inicio_pensiones'));
      if (fieldIndex >= 0) {
        const finalValue = updateValues[fieldIndex];
        console.log('Valor final que se guardará:', finalValue, 'tipo:', typeof finalValue);
        console.log('Mes correspondiente:', ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][finalValue - 1] || 'INVÁLIDO');
      }
    }
    if (body.inicio_notas !== undefined) {
      console.log('=== DEBUG GUARDAR inicio_notas ===');
      console.log('Valor recibido en body:', body.inicio_notas, 'tipo:', typeof body.inicio_notas);
      const fieldIndex = updateFields.findIndex(f => f.includes('inicio_notas'));
      if (fieldIndex >= 0) {
        const finalValue = updateValues[fieldIndex];
        console.log('Valor final que se guardará:', finalValue, 'tipo:', typeof finalValue);
        console.log('Mes correspondiente:', ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][finalValue - 1] || 'INVÁLIDO');
      }
    }

    // Serializar rangos_ciclos_notas (PHP serialize, no JSON)
    if (body.rangos_ciclos_notas) {
      let rangosData = body.rangos_ciclos_notas;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosData === 'string') {
        try {
          rangosData = JSON.parse(rangosData);
        } catch (e) {
          console.warn('Error parseando rangos_ciclos_notas del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosData);
      updateFields.push('rangos_ciclos_notas = ?');
      updateValues.push(serialized);
    }

    // Serializar rangos_mensajes
    if (body.rangos_mensajes) {
      let rangosMensajesData = body.rangos_mensajes;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosMensajesData === 'string') {
        try {
          rangosMensajesData = JSON.parse(rangosMensajesData);
        } catch (e) {
          console.warn('Error parseando rangos_mensajes del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosMensajesData);
      updateFields.push('rangos_mensajes = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Serializar rangos_letras_primaria
    if (body.rangos_letras_primaria) {
      let rangosLetrasData = body.rangos_letras_primaria;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosLetrasData === 'string') {
        try {
          rangosLetrasData = JSON.parse(rangosLetrasData);
        } catch (e) {
          console.warn('Error parseando rangos_letras_primaria del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosLetrasData);
      updateFields.push('rangos_letras_primaria = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Serializar pensiones_vencimiento
    if (body.pensiones_vencimiento) {
      let pensionesData = body.pensiones_vencimiento;
      // Si viene como string JSON, parsearlo primero
      if (typeof pensionesData === 'string') {
        try {
          pensionesData = JSON.parse(pensionesData);
        } catch (e) {
          console.warn('Error parseando pensiones_vencimiento del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(pensionesData);
      updateFields.push('pensiones_vencimiento = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Manejar archivos subidos
    if (req.files) {
      if (req.files.login_fondo && req.files.login_fondo[0]) {
        updateFields.push('login_background = ?');
        updateValues.push(req.files.login_fondo[0].filename);
      }
    }

    // Actualizar colegio
    if (updateFields.length > 0) {
      updateValues.push(colegio_id);
      await execute(
        `UPDATE colegios SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Actualizar tabla config
    const configFields = [
      'texto_intranet', 'titulo_formulario_matricula', 'recaudo_nro_sucursal',
      'recaudo_nro_cuenta', 'recaudo_razon_social', 'email_notificacion_matricula_online',
      'remitente_emails', 'email_matricula_apoderado', 'link_consulta_facturas',
      'show_birthday_window', 'enable_enrollment_form'
    ];

    for (const field of configFields) {
      if (body[field] !== undefined) {
        // Verificar si existe
        const existing = await query(
          `SELECT id FROM config WHERE clave = ?`,
          [field]
        );

        if (existing.length > 0) {
          await execute(
            `UPDATE config SET valor = ? WHERE clave = ?`,
            [body[field], field]
          );
        } else {
          await execute(
            `INSERT INTO config (clave, valor) VALUES (?, ?)`,
            [field, body[field]]
          );
        }
      }
    }

    // Manejar archivos de config
    if (req.files) {
      if (req.files.libreta_logo && req.files.libreta_logo[0]) {
        const existing = await query(`SELECT id FROM config WHERE clave = 'libreta_logo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'libreta_logo'`, [req.files.libreta_logo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('libreta_logo', ?)`, [req.files.libreta_logo[0].filename]);
        }
      }

      if (req.files.libreta_fondo && req.files.libreta_fondo[0]) {
        const existing = await query(`SELECT id FROM config WHERE clave = 'libreta_fondo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'libreta_fondo'`, [req.files.libreta_fondo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('libreta_fondo', ?)`, [req.files.libreta_fondo[0].filename]);
        }
      }

      if (req.files.boleta_logo && req.files.boleta_logo[0]) {
        const boletaLogoPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
        if (!fs.existsSync(boletaLogoPath)) {
          fs.mkdirSync(boletaLogoPath, { recursive: true });
        }
        const boletaLogoFile = path.join(boletaLogoPath, req.files.boleta_logo[0].filename);
        fs.renameSync(req.files.boleta_logo[0].path, boletaLogoFile);

        const existing = await query(`SELECT id FROM config WHERE clave = 'boleta_logo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'boleta_logo'`, [req.files.boleta_logo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('boleta_logo', ?)`, [req.files.boleta_logo[0].filename]);
        }
      }
    }

    res.json({ success: true, message: 'Configuración guardada correctamente' });
  } catch (error) {
    console.error('Error guardando configuración:', error);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

/**
 * POST /api/admin/configuracion/reiniciar-accesos
 * Reiniciar accesos de alumnos y apoderados
 */
// --- Avatares por bimestre (avatar_bases, avatar_accesorios) ---
const avatarsDir = path.join(__dirname, '..', 'Static', 'Image', 'Avatars');
try {
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
} catch (e) {
  console.warn('No se pudo crear carpeta Avatars:', e.message);
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'img').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `avatar-${Date.now()}-${safe}`);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpg|jpeg)$/i.test(file.originalname || '') && /image\/(png|jpeg|jpg)/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Solo imágenes PNG/JPG'));
  }
});

/** GET /api/admin/avatares/bases - Listar todas las bases */
router.get('/avatares/bases', async (req, res) => {
  try {
    const bases = await query('SELECT * FROM avatar_bases ORDER BY bimestre, sexo, orden, id');
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `${process.env.PHP_SYSTEM_URL || ''}/Static/Image/Avatars`
      : 'http://localhost:5000/Static/Image/Avatars';
    const list = (bases || []).map(b => ({
      ...b,
      imagen_base_url: b.imagen_base ? `${baseUrl}/${b.imagen_base}` : null
    }));
    res.json({ bases: list });
  } catch (err) {
    if (err.message && (err.message.includes("doesn't exist") || err.message.includes('avatar_bases'))) {
      return res.json({ bases: [] });
    }
    console.error('Error listando avatar_bases:', err);
    res.status(500).json({ error: 'Error al listar avatares base' });
  }
});

/** POST /api/admin/avatares/bases - Crear base (opcional: imagen_base en multipart) */
router.post('/avatares/bases', uploadAvatar.single('imagen_base'), async (req, res) => {
  try {
    const { bimestre, sexo, nombre, descripcion, historia, orden } = req.body || {};
    const bim = parseInt(bimestre, 10);
    const sx = parseInt(sexo, 10);
    if (![1, 2, 3, 4].includes(bim)) return res.status(400).json({ error: 'Bimestre debe ser 1, 2, 3 o 4' });
    if (![0, 1].includes(sx)) return res.status(400).json({ error: 'Sexo: 0=Femenino, 1=Masculino' });
    const imagen_base = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_base || '');
    const ord = parseInt(orden, 10) || 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await execute(
      `INSERT INTO avatar_bases (bimestre, sexo, nombre, descripcion, historia, imagen_base, orden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bim, sx, (nombre || '').trim(), (descripcion || '').trim(), (historia || '').trim(), imagen_base, ord, now, now]
    );
    const inserted = await query('SELECT * FROM avatar_bases ORDER BY id DESC LIMIT 1');
    res.status(201).json({ base: inserted[0] });
  } catch (err) {
    console.error('Error creando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al crear avatar base' });
  }
});

/** PUT /api/admin/avatares/bases/:id - Actualizar base */
router.put('/avatares/bases/:id', uploadAvatar.single('imagen_base'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { bimestre, sexo, nombre, descripcion, historia, orden } = req.body || {};
    const existing = await query('SELECT * FROM avatar_bases WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Avatar base no encontrado' });
    const row = existing[0];
    const imagen_base = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_base !== undefined ? req.body.imagen_base : row.imagen_base);
    const bim = bimestre !== undefined ? parseInt(bimestre, 10) : row.bimestre;
    const sx = sexo !== undefined ? parseInt(sexo, 10) : row.sexo;
    const nombre_ = nombre !== undefined ? String(nombre).trim() : row.nombre;
    const descripcion_ = descripcion !== undefined ? String(descripcion).trim() : row.descripcion;
    const historia_ = historia !== undefined ? String(historia).trim() : row.historia;
    const ord = orden !== undefined ? parseInt(orden, 10) : row.orden;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await execute(
      `UPDATE avatar_bases SET bimestre=?, sexo=?, nombre=?, descripcion=?, historia=?, imagen_base=?, orden=?, updated_at=? WHERE id=?`,
      [bim, sx, nombre_, descripcion_, historia_, imagen_base, ord, now, id]
    );
    const updated = await query('SELECT * FROM avatar_bases WHERE id = ?', [id]);
    res.json({ base: updated[0] });
  } catch (err) {
    console.error('Error actualizando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

/** DELETE /api/admin/avatares/bases/:id */
router.delete('/avatares/bases/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute('DELETE FROM avatar_bases WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

/** GET /api/admin/avatares/bases/:baseId/accesorios */
router.get('/avatares/bases/:baseId/accesorios', async (req, res) => {
  try {
    const baseId = parseInt(req.params.baseId, 10);
    const accesorios = await query('SELECT * FROM avatar_accesorios WHERE avatar_base_id = ? ORDER BY orden, id', [baseId]);
    const baseUrl = process.env.NODE_ENV === 'production'
      ? `${process.env.PHP_SYSTEM_URL || ''}/Static/Image/Avatars`
      : 'http://localhost:5000/Static/Image/Avatars';
    const list = (accesorios || []).map(a => ({
      ...a,
      imagen_combinada_url: a.imagen_combinada ? `${baseUrl}/${a.imagen_combinada}` : null
    }));
    res.json({ accesorios: list });
  } catch (err) {
    if (err.message && (err.message.includes("doesn't exist") || err.message.includes('avatar_accesorios'))) {
      return res.json({ accesorios: [] });
    }
    console.error('Error listando accesorios:', err);
    res.status(500).json({ error: 'Error al listar accesorios' });
  }
});

/** POST /api/admin/avatares/bases/:baseId/accesorios - Crear accesorio */
router.post('/avatares/bases/:baseId/accesorios', uploadAvatar.single('imagen_combinada'), async (req, res) => {
  try {
    const baseId = parseInt(req.params.baseId, 10);
    const { nombre, descripcion, puntuacion_requerida, orden } = req.body || {};
    const imagen_combinada = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_combinada || '');
    const puntos = parseInt(puntuacion_requerida, 10) || 0;
    const ord = parseInt(orden, 10) || 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await execute(
      `INSERT INTO avatar_accesorios (avatar_base_id, nombre, descripcion, puntuacion_requerida, imagen_combinada, orden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [baseId, (nombre || '').trim(), (descripcion || '').trim(), puntos, imagen_combinada, ord, now, now]
    );
    const inserted = await query('SELECT * FROM avatar_accesorios ORDER BY id DESC LIMIT 1');
    res.status(201).json({ accesorio: inserted[0] });
  } catch (err) {
    console.error('Error creando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al crear accesorio' });
  }
});

/** PUT /api/admin/avatares/accesorios/:id */
router.put('/avatares/accesorios/:id', uploadAvatar.single('imagen_combinada'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, puntuacion_requerida, orden } = req.body || {};
    const existing = await query('SELECT * FROM avatar_accesorios WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Accesorio no encontrado' });
    const row = existing[0];
    const imagen_combinada = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_combinada !== undefined ? req.body.imagen_combinada : row.imagen_combinada);
    const nombre_ = nombre !== undefined ? String(nombre).trim() : row.nombre;
    const descripcion_ = descripcion !== undefined ? String(descripcion).trim() : row.descripcion;
    const puntos = puntuacion_requerida !== undefined ? parseInt(puntuacion_requerida, 10) : row.puntuacion_requerida;
    const ord = orden !== undefined ? parseInt(orden, 10) : row.orden;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await execute(
      `UPDATE avatar_accesorios SET nombre=?, descripcion=?, puntuacion_requerida=?, imagen_combinada=?, orden=?, updated_at=? WHERE id=?`,
      [nombre_, descripcion_, puntos, imagen_combinada, ord, now, id]
    );
    const updated = await query('SELECT * FROM avatar_accesorios WHERE id = ?', [id]);
    res.json({ accesorio: updated[0] });
  } catch (err) {
    console.error('Error actualizando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

/** DELETE /api/admin/avatares/accesorios/:id */
router.delete('/avatares/accesorios/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute('DELETE FROM avatar_accesorios WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

/**
 * POST /api/admin/configuracion/reiniciar-accesos
 * Reiniciar accesos de alumnos y apoderados
 */
router.post('/configuracion/reiniciar-accesos', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    // Obtener todos los alumnos del colegio
    const alumnos = await query(
      `SELECT a.id FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.colegio_id = ?`,
      [colegio_id]
    );

    // Resetear contraseñas de alumnos (a su DNI)
    for (const alumno of alumnos) {
      const usuario = await query(
        `SELECT usuario FROM usuarios WHERE alumno_id = ? AND colegio_id = ? LIMIT 1`,
        [alumno.id, colegio_id]
      );
      if (usuario.length > 0) {
        const dni = usuario[0].usuario;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(dni, 10);
        await execute(
          `UPDATE usuarios SET password = ? WHERE alumno_id = ? AND colegio_id = ?`,
          [hashedPassword, alumno.id, colegio_id]
        );
      }
    }

    // Obtener todos los apoderados del colegio
    const apoderados = await query(
      `SELECT ap.id FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.colegio_id = ?`,
      [colegio_id]
    );

    // Resetear contraseñas de apoderados (a su DNI)
    for (const apoderado of apoderados) {
      const usuario = await query(
        `SELECT usuario FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? LIMIT 1`,
        [apoderado.id, colegio_id]
      );
      if (usuario.length > 0) {
        const dni = usuario[0].usuario;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(dni, 10);
        await execute(
          `UPDATE usuarios SET password = ? WHERE apoderado_id = ? AND colegio_id = ?`,
          [hashedPassword, apoderado.id, colegio_id]
        );
      }
    }

    res.json({ success: true, message: 'Accesos reiniciados correctamente' });
  } catch (error) {
    console.error('Error reiniciando accesos:', error);
    res.status(500).json({ error: 'Error al reiniciar accesos' });
  }
});

module.exports = router;

