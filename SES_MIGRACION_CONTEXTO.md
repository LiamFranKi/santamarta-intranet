# Contexto: Migración a Amazon SES - vanguardschools.edu.pe

**Última actualización:** 10 de marzo de 2026

---

## 1. Objetivo
Migrar el envío de correos del sistema de múltiples cuentas Gmail a **Amazon SES**.

---

## 2. Estado actual

| Paso | Estado |
|------|--------|
| Cuenta AWS creada (VanguardSchools) | ✅ |
| SES configurado en región us-east-1 | ✅ |
| Correo walter.lozano@vanguardschools.edu.pe verificado | ✅ |
| Dominio vanguardschools.edu.pe en SES | ⏳ Verificación pendiente |
| Registros DNS en punto.pe | ✅ Configurados correctamente |
| Solicitar acceso a producción | ❌ Bloqueado (requiere dominio verificado) |
| Credenciales SMTP | Pendiente |
| Actualizar .env y emailService.js | Pendiente |

---

## 3. Problema identificado: DNS primario no responde

### Evidencia
- **ns.rcp.net.pe** (primario, IP 161.132.17.10): 
  - Ping: timeout
  - TCP puerto 53: falla
  - Consultas DNS (nslookup, Resolve-DnsName): timeout
- **ns2.rcp.net.pe** (secundario): responde correctamente, todos los CNAME DKIM verificados

### Registros DNS (correctos en ns2)
- 3 CNAME DKIM → *.dkim.amazonses.com ✅
- mail MX → feedback-smtp.us-east-1.amazonses.com (10) ✅
- mail TXT → v=spf1 include:amazonses.com ~all ✅
- _dmarc TXT → v=DMARC1; p=none; ✅

### Acción tomada
Se contactó a **soporte de punto.pe** para:
1. Reportar que ns.rcp.net.pe no responde desde internet
2. Solicitar intercambiar orden de nameservers (ns2 como primario)

**Esperando respuesta de punto.pe.**

---

## 4. Decisión del usuario
- **NO** verificar solo correo como workaround (límite 200/día en sandbox)
- Preferir **esperar** a que el dominio se verifique en SES
- Seguir avanzando con el sistema mientras tanto

---

## 5. Sin conflicto con Gmail
- Google Workspace: recepción (@vanguardschools.edu.pe), MX apex
- SES: envío desde la app, CNAME DKIM, mail subdominio
- Los registros son independientes y compatibles

---

## 6. Próximos pasos (cuando el dominio verifique)
1. Esperar que punto.pe responda y/o arregle el primario
2. SES verificará el dominio automáticamente (o al recargar)
3. Solicitar acceso a producción en SES
4. Crear credenciales SMTP en SES
5. Actualizar `backend/.env` con credenciales SES
6. Simplificar `backend/services/emailService.js` para usar una sola cuenta SES

---

## 7. Archivos relevantes del proyecto
- `backend/.env` – variables EMAIL_*
- `backend/services/emailService.js` – transporters de correo
- `sistema.vanguardschools.edu.pe-le-ssl.conf` – VirtualHost Apache (DocumentRoot: intranet2026)

---

## 8. Comandos de diagnóstico usados
```powershell
# Verificar CNAME contra ns2 (responde OK)
nslookup -type=CNAME lublyxegki4igde3fqczb65rckyk5qz3._domainkey.vanguardschools.edu.pe ns2.rcp.net.pe

# Test primario (timeout/falla)
Test-NetConnection -ComputerName "ns.rcp.net.pe" -Port 53
Resolve-DnsName -Name "lublyxegki4igde3fqczb65rckyk5qz3._domainkey.vanguardschools.edu.pe" -Type CNAME -Server "ns.rcp.net.pe"
```
