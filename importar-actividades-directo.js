/**
 * Script para importar actividades directamente desde calendarizacion.json
 * Accede directamente a la base de datos, sin necesidad de autenticación API
 * 
 * Uso:
 *   node importar-actividades-directo.js [colegio_id] [usuario_id]
 * 
 * Si no se proporcionan, se usará el primer colegio y usuario administrador encontrado
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno desde backend/.env
const envPath = path.join(__dirname, 'backend', '.env');
require('dotenv').config({ path: envPath });

const { query, execute } = require('./backend/utils/mysql');

async function importarActividadesDirecto() {
  try {
    console.log('🚀 Iniciando importación directa de actividades...\n');

    // Obtener colegio_id y usuario_id
    let colegio_id, usuario_id;

    if (process.argv[2] && process.argv[3]) {
      colegio_id = parseInt(process.argv[2]);
      usuario_id = parseInt(process.argv[3]);
      console.log(`📝 Usando colegio_id: ${colegio_id}, usuario_id: ${usuario_id}\n`);
    } else {
      // Buscar el primer colegio
      const colegios = await query('SELECT id FROM colegios LIMIT 1');
      if (colegios.length === 0) {
        console.error('❌ No se encontraron colegios en la base de datos');
        process.exit(1);
      }
      colegio_id = colegios[0].id;

      // Buscar el primer usuario administrador o docente
      const usuarios = await query(
        `SELECT id FROM usuarios 
         WHERE tipo IN ('ADMINISTRADOR', 'DOCENTE', 'DIRECTOR') 
         AND estado = 'ACTIVO' 
         AND colegio_id = ?
         LIMIT 1`,
        [colegio_id]
      );

      if (usuarios.length === 0) {
        console.error('❌ No se encontraron usuarios ADMINISTRADOR o DOCENTE activos');
        process.exit(1);
      }
      usuario_id = usuarios[0].id;

      console.log(`📝 Usando colegio_id: ${colegio_id}, usuario_id: ${usuario_id} (automático)\n`);
    }

    // Ruta al archivo JSON
    const jsonPath = path.join(__dirname, 'calendarizacion.json');

    // Verificar que el archivo existe
    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ Archivo calendarizacion.json no encontrado en: ${jsonPath}`);
      process.exit(1);
    }

    // Leer el archivo JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const año = jsonData.año || 2026;
    const meses = jsonData.meses || {};

    console.log(`📅 Iniciando importación de actividades para el año ${año}`);
    console.log(`📅 Colegio ID: ${colegio_id}, Usuario ID: ${usuario_id}\n`);

    let actividadesInsertadas = 0;
    let actividadesConError = 0;
    let actividadesDuplicadas = 0;
    const errores = [];

    // Procesar cada mes
    for (const [mesNum, mesData] of Object.entries(meses)) {
      const mes = parseInt(mesNum);
      const eventos = mesData.eventos || [];

      console.log(`📅 Procesando mes ${mes} (${mesData.nombre}): ${eventos.length} eventos`);

      // Procesar cada evento del mes
      for (const evento of eventos) {
        try {
          let fechaInicio, fechaFin;
          const descripcion = evento.texto || '';
          const lugar = 'Colegio Vanguard';
          const detalles = evento.tipo || '';

          // Determinar fechas según si tiene día único o rango
          if (evento.dia) {
            // Evento de un solo día
            fechaInicio = new Date(año, mes - 1, evento.dia, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.dia, 23, 59, 59);
          } else if (evento.rango && evento.rango.inicio && evento.rango.fin) {
            // Evento con rango de días
            fechaInicio = new Date(año, mes - 1, evento.rango.inicio, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.rango.fin, 23, 59, 59);
          } else {
            // Si no tiene ni día ni rango válido, saltar
            console.warn(`⚠️ Evento sin fecha válida: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'No tiene día ni rango válido'
            });
            continue;
          }

          // Validar que las fechas sean válidas
          if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
            console.warn(`⚠️ Fecha inválida para evento: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'Fecha inválida'
            });
            continue;
          }

          // Formatear fechas para MySQL (YYYY-MM-DD HH:mm:ss)
          const fechaInicioStr = fechaInicio.toISOString().slice(0, 19).replace('T', ' ');
          const fechaFinStr = fechaFin.toISOString().slice(0, 19).replace('T', ' ');

          // Verificar si ya existe una actividad similar (evitar duplicados)
          const actividadesExistentes = await query(
            `SELECT id FROM actividades 
             WHERE colegio_id = ? 
             AND descripcion = ? 
             AND DATE(fecha_inicio) = DATE(?) 
             AND DATE(fecha_fin) = DATE(?)`,
            [colegio_id, descripcion, fechaInicioStr, fechaFinStr]
          );

          if (actividadesExistentes.length > 0) {
            actividadesDuplicadas++;
            continue;
          }

          // Insertar actividad en la base de datos
          await execute(
            `INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [colegio_id, descripcion, lugar, detalles, fechaInicioStr, fechaFinStr, usuario_id]
          );

          actividadesInsertadas++;

        } catch (error) {
          console.error(`❌ Error procesando evento:`, error.message);
          actividadesConError++;
          errores.push({
            evento: evento.texto || 'Desconocido',
            error: error.message
          });
        }
      }
    }

    // Mostrar resultados
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADOS DE LA IMPORTACIÓN');
    console.log('='.repeat(60));
    console.log(`✅ Actividades insertadas: ${actividadesInsertadas}`);
    console.log(`⏭️  Actividades duplicadas (omitidas): ${actividadesDuplicadas}`);
    console.log(`📅 Año: ${año}`);
    
    if (actividadesConError > 0) {
      console.log(`⚠️  Actividades con error: ${actividadesConError}`);
      if (errores.length > 0) {
        console.log('\n❌ Errores:');
        errores.slice(0, 10).forEach((error, index) => {
          console.log(`   ${index + 1}. ${error.evento}: ${error.error}`);
        });
        if (errores.length > 10) {
          console.log(`   ... y ${errores.length - 10} errores más`);
        }
      }
    } else {
      console.log('✅ Todas las actividades se importaron correctamente');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✨ Importación completada exitosamente!');
    console.log('='.repeat(60) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error durante la importación:');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('💡 Verifica que:');
    console.error('   1. El archivo calendarizacion.json esté en la raíz del proyecto');
    console.error('   2. La conexión a MySQL esté funcionando');
    console.error('   3. Las credenciales de la base de datos sean correctas');
    process.exit(1);
  }
}

// Ejecutar
importarActividadesDirecto();











