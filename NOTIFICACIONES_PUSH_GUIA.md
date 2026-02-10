# 🔔 GUÍA: NOTIFICACIONES PUSH

## ✅ ¿Cómo Funcionan las Notificaciones Push?

### **Suscripción Automática**

Las notificaciones push se activan **automáticamente** para estos tipos de usuarios:
- ✅ **ALUMNO**
- ✅ **APODERADO**
- ✅ **DOCENTE** (NUEVO - agregado)

**¿Cuándo se activan?**
- Automáticamente al iniciar sesión
- Después de 2 segundos (para que el Service Worker esté listo)

---

## 🔔 ¿Por Qué No Me Pide Permiso?

### **Razones Comunes:**

1. **Ya tienes el permiso otorgado**
   - Si anteriormente aceptaste las notificaciones, el navegador no vuelve a preguntar
   - El estado se guarda en el navegador

2. **El navegador bloquea la solicitud automática**
   - Algunos navegadores (especialmente móviles) requieren una **interacción del usuario** (click) antes de solicitar permisos
   - Por eso agregamos el **botón manual** en el perfil

3. **El Service Worker no está listo**
   - Si el Service Worker no se ha registrado correctamente, no se puede solicitar el permiso

---

## 🎯 Cómo Activar las Notificaciones Manualmente

### **Para DOCENTE:**

1. Inicia sesión como docente
2. Ve a **"Mi Perfil"** (menú lateral)
3. Busca la sección **"Notificaciones Push"**
4. Haz clic en el botón **"Activar Notificaciones"**
5. Cuando el navegador te pregunte, haz clic en **"Permitir"**

### **Para ALUMNO:**

1. Inicia sesión como alumno
2. Ve a **"Mi Perfil"** (menú lateral)
3. Busca la sección **"Notificaciones Push"**
4. Haz clic en el botón **"Activar Notificaciones"**
5. Cuando el navegador te pregunte, haz clic en **"Permitir"**

---

## 📱 Estados de las Notificaciones

### **✅ Activadas (granted)**
- Las notificaciones están activas
- Recibirás alertas push en tu dispositivo
- El botón mostrará "Notificaciones Activadas" (deshabilitado)

### **❌ Bloqueadas (denied)**
- Has bloqueado las notificaciones
- Para activarlas, debes ir a la configuración de tu navegador
- El botón mostrará "Activar Notificaciones" (habilitado)

### **⚠️ No Configuradas (default)**
- Aún no se ha solicitado el permiso
- Haz clic en "Activar Notificaciones" para solicitar el permiso
- El botón mostrará "Activar Notificaciones" (habilitado)

---

## 🔧 Verificar Estado de las Notificaciones

### **En el Perfil:**
- Ve a **"Mi Perfil"**
- Busca la sección **"Notificaciones Push"**
- Verás el estado actual y un botón para activarlas

### **En la Consola del Navegador (F12):**
```javascript
// Verificar permiso
Notification.permission
// Debe mostrar: "granted", "denied", o "default"

// Verificar Service Worker
navigator.serviceWorker.ready.then(reg => {
  console.log('Service Worker:', reg);
});
```

---

## 🚨 Problemas Comunes

### **1. No me pide permiso al iniciar sesión**

**Solución:**
- Ve a **"Mi Perfil"**
- Haz clic en **"Activar Notificaciones"**
- Esto solicitará el permiso manualmente

### **2. El botón dice "Notificaciones Activadas" pero no recibo notificaciones**

**Verifica:**
1. Que el Service Worker esté registrado (consola del navegador)
2. Que el backend tenga las claves VAPID configuradas
3. Que el navegador permita notificaciones (configuración del sistema)

### **3. Las notificaciones están bloqueadas**

**Solución:**
1. **Chrome/Edge (Android):**
   - Configuración → Sitios → Notificaciones → Busca el sitio → Permitir

2. **Safari (iOS):**
   - Configuración → Safari → Notificaciones → Busca el sitio → Permitir

3. **Firefox:**
   - Configuración → Privacidad y seguridad → Permisos → Notificaciones → Busca el sitio → Permitir

---

## 📋 Resumen

| Usuario | Suscripción Automática | Botón Manual |
|---------|------------------------|--------------|
| **ALUMNO** | ✅ Sí | ✅ Sí (en "Mi Perfil") |
| **APODERADO** | ✅ Sí | ✅ Sí (en "Mi Perfil") |
| **DOCENTE** | ✅ Sí (NUEVO) | ✅ Sí (en "Mi Perfil") |
| **ADMINISTRADOR** | ❌ No | ⚠️ Puede agregarse si se necesita |

---

## 🎯 Para Probar las Notificaciones

1. **Activa las notificaciones** en tu perfil
2. **Acepta el permiso** cuando el navegador te lo solicite
3. **Verifica el estado** en "Mi Perfil" (debe decir "✅ Activadas")
4. **Prueba con asistencia:** Escanea un QR de un alumno y verifica que el apoderado reciba la notificación

---

¡Con esto, las notificaciones push estarán completamente configuradas! 🎉

