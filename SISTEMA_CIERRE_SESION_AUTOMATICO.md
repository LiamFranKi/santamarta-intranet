# 🔒 Sistema de Cierre de Sesión Automático

## 📋 Descripción

Sistema inteligente que detecta errores críticos del sistema y cierra la sesión automáticamente, redirigiendo al usuario al login con mensajes amigables en lugar de mostrar errores técnicos confusos.

---

## ✅ Errores que Cierran Sesión Automáticamente

### 1. **401 - Sesión Expirada**
- **Razón:** Token inválido o expirado
- **Mensaje:** "Tu sesión ha expirado. Por favor, inicia sesión nuevamente."
- **Acción:** Cierra sesión y redirige al login

### 2. **403 - Sin Permisos**
- **Razón:** Usuario no tiene permisos para el recurso
- **Mensaje:** "No tienes permisos para acceder a este recurso. Tu sesión será cerrada."
- **Acción:** Cierra sesión y redirige al login

### 3. **500 - Error del Servidor**
- **Razón:** Error interno del servidor
- **Mensaje:** "Ha ocurrido un error en el servidor. Por seguridad, tu sesión será cerrada."
- **Acción:** Cierra sesión y redirige al login

### 4. **502 - Servidor No Disponible**
- **Razón:** El servidor no responde (Bad Gateway)
- **Mensaje:** "El servidor no está disponible temporalmente. Por favor, intenta más tarde."
- **Acción:** Cierra sesión y redirige al login

### 5. **503 - Servicio No Disponible**
- **Razón:** El servicio está temporalmente fuera de línea
- **Mensaje:** "El servicio no está disponible temporalmente. Por favor, intenta más tarde."
- **Acción:** Cierra sesión y redirige al login

---

## ❌ Errores que NO Cierran Sesión

Estos errores se manejan normalmente sin cerrar sesión:

- **404** - Recurso no encontrado
- **422** - Error de validación
- **400** - Solicitud incorrecta
- **Timeout** - Se registra pero no cierra sesión (a menos que sean múltiples consecutivos)
- **Errores de red** - Se registran pero no cierran sesión automáticamente

---

## 🔧 Funcionamiento Técnico

### Archivo: `frontend/src/services/api.js`

1. **Interceptor de Respuestas:**
   - Intercepta todas las respuestas del servidor
   - Detecta errores críticos automáticamente
   - Ejecuta `forceLogout()` cuando detecta un error crítico

2. **Función `forceLogout()`:**
   - Evita múltiples cierres de sesión simultáneos
   - Limpia `localStorage` (token y usuario)
   - Muestra mensaje amigable con SweetAlert2
   - Redirige al login usando `window.location.href`

3. **Protección contra Múltiples Cierres:**
   - Variable `isLoggingOut` previene cierres simultáneos
   - Se resetea cuando la página se recarga

---

## 💡 Experiencia del Usuario

### Antes (Sin este sistema):
```
❌ Error 401: Unauthorized
❌ Error: No se pudo cargar la información
❌ Error de conexión
```

### Ahora (Con este sistema):
```
✅ Mensaje claro: "Tu sesión ha expirado. Por favor, inicia sesión nuevamente."
✅ Botón: "Ir al inicio de sesión"
✅ Redirección automática al login
✅ Sin mensajes técnicos confusos
```

---

## 🎯 Casos de Uso

### Caso 1: Sesión Expirada
1. Usuario está trabajando normalmente
2. El token expira (después de 24 horas)
3. Usuario intenta hacer una acción
4. **Sistema detecta error 401**
5. **Cierra sesión automáticamente**
6. Muestra mensaje: "Tu sesión ha expirado..."
7. Redirige al login

### Caso 2: Error del Servidor
1. Usuario está trabajando normalmente
2. El servidor tiene un error (500)
3. Usuario intenta hacer una acción
4. **Sistema detecta error 500**
5. **Cierra sesión automáticamente**
6. Muestra mensaje: "Ha ocurrido un error en el servidor..."
7. Redirige al login

### Caso 3: Servidor No Disponible
1. Usuario está trabajando normalmente
2. El servidor se cae o está en mantenimiento (502/503)
3. Usuario intenta hacer una acción
4. **Sistema detecta error 502/503**
5. **Cierra sesión automáticamente**
6. Muestra mensaje: "El servidor no está disponible..."
7. Redirige al login

---

## 🔍 Logs y Debugging

El sistema registra en consola cuando detecta errores críticos:

```javascript
console.warn('⚠️ Error crítico detectado (401): SESION_EXPIRADA');
console.error('⏱️ Timeout en la petición:', error.message);
console.error('🌐 Error de conexión:', networkError);
```

---

## ⚙️ Configuración

### Activar Cierre de Sesión por Errores de Red

Si quieres que los errores de red críticos también cierren sesión, descomenta estas líneas en `api.js`:

```javascript
// Línea 155 - Errores de red críticos
if (criticalNetworkErrors.some(err => networkError.includes(err))) {
  forceLogout('ERROR_RED', 'No se puede conectar con el servidor. Por favor, verifica tu conexión.');
}
```

### Activar Cierre de Sesión por Errores SSL

Si quieres que los errores de certificado SSL también cierren sesión, descomenta estas líneas:

```javascript
// Línea 168 - Errores SSL
if (!isDevelopment && apiUrl.startsWith('https://')) {
  forceLogout('ERROR_SSL', 'Error de seguridad detectado. Por favor, contacta al administrador.');
}
```

---

## ✅ Ventajas

1. **Mejor UX:** Usuarios ven mensajes claros en lugar de errores técnicos
2. **Seguridad:** Cierra sesión automáticamente cuando hay problemas
3. **Consistencia:** Todos los usuarios tienen la misma experiencia
4. **Automático:** No requiere intervención manual
5. **Inteligente:** Solo cierra sesión en errores críticos, no en errores menores

---

## 📝 Notas Importantes

- El sistema **NO cierra sesión** en errores menores (404, 422, etc.)
- El sistema **SÍ cierra sesión** en errores críticos (401, 403, 500, 502, 503)
- Los mensajes son **amigables y claros** para el usuario
- La redirección es **automática** después de mostrar el mensaje
- Se previene **múltiples cierres simultáneos**

---

## 🚀 Implementación

**Archivo modificado:** `frontend/src/services/api.js`

**Cambios principales:**
1. Importación de SweetAlert2
2. Función `forceLogout()` para cerrar sesión automáticamente
3. Interceptor mejorado que detecta errores críticos
4. Mensajes personalizados según el tipo de error

---

**Fecha de implementación:** Enero 2026  
**Versión:** 1.0.0

