# 📅 Instrucciones para Importar Actividades

Este documento explica cómo importar las actividades desde `calendarizacion.json` a la base de datos.

## 📋 Requisitos Previos

1. ✅ El servidor backend debe estar corriendo (`npm run dev` en la carpeta `backend`)
2. ✅ El archivo `calendarizacion.json` debe estar en la raíz del proyecto
3. ✅ Debes tener credenciales de un usuario DOCENTE o ADMINISTRADOR

## 🚀 Pasos para Ejecutar

### Opción 1: Ejecución Interactiva (Recomendada)

1. Abre una terminal en la raíz del proyecto
2. Ejecuta el script:
   ```bash
   node importar-actividades.js
   ```
3. Ingresa tus credenciales cuando se te solicite:
   - **Usuario (DNI)**: Tu DNI
   - **Contraseña**: Tu contraseña

### Opción 2: Ejecución con Credenciales en Línea de Comandos

```bash
node importar-actividades.js TU_DNI TU_CONTRASEÑA
```

**Ejemplo:**
```bash
node importar-actividades.js 12345678 miPassword123
```

## 📊 ¿Qué hace el script?

1. **Inicia sesión** con tus credenciales para obtener un token de autenticación
2. **Lee** el archivo `calendarizacion.json` desde la raíz del proyecto
3. **Procesa** todos los eventos de todos los meses (Marzo a Diciembre 2026)
4. **Inserta** las actividades en la base de datos con:
   - `descripcion`: El texto del evento
   - `lugar`: "Colegio Vanguard"
   - `detalles`: El tipo de evento (reunion, feriado, tema, etc.)
   - `fecha_inicio` y `fecha_fin`: Fechas construidas correctamente
5. **Evita duplicados**: Si una actividad ya existe, la omite
6. **Muestra resultados**: Cantidad de actividades insertadas y errores (si los hay)

## ✅ Resultado Esperado

Después de ejecutar el script, verás algo como:

```
============================================================
📊 RESULTADOS DE LA IMPORTACIÓN
============================================================
✅ Actividades insertadas: 150
📅 Año: 2026
✅ Todas las actividades se importaron correctamente

============================================================
✨ Importación completada exitosamente!
============================================================
```

## 🎯 ¿Dónde aparecerán las actividades?

Una vez importadas, las actividades aparecerán automáticamente en:

- ✅ **Calendario**: Todas las actividades de todos los años
- ✅ **Próximos Eventos (Dashboard)**: Solo eventos futuros del año actual
- ✅ **Menú Actividades**: Todas las actividades del año actual

## ⚠️ Solución de Problemas

### Error: "No se pudo conectar al servidor"
- Verifica que el servidor backend esté corriendo
- Verifica que esté en el puerto correcto (por defecto: 5000)

### Error: "Usuario o contraseña incorrectos"
- Verifica que tus credenciales sean correctas
- Asegúrate de usar un usuario DOCENTE o ADMINISTRADOR

### Error: "Archivo calendarizacion.json no encontrado"
- Verifica que el archivo esté en la raíz del proyecto
- Verifica que el nombre del archivo sea exactamente `calendarizacion.json`

### Error: "Actividades con error"
- Revisa los errores mostrados en la consola
- Algunos eventos pueden tener fechas inválidas o datos faltantes

## 🔄 Re-ejecutar la Importación

Si necesitas re-ejecutar la importación:
- El script **evita duplicados** automáticamente
- Solo insertará actividades que no existan ya en la base de datos
- Puedes ejecutarlo múltiples veces sin problemas

## 📝 Notas

- El script usa el `colegio_id` y `usuario_id` del usuario autenticado
- Todas las actividades se crean con el lugar "Colegio Vanguard"
- Las fechas se construyen para el año 2026 (del JSON)
- Los eventos de un solo día tienen fecha_inicio y fecha_fin el mismo día
- Los eventos con rango usan el rango completo de días








