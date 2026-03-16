# Contexto: Migración a Amazon SES - vanguardschools.edu.pe

**Última actualización:** 14 de marzo de 2026

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
| MAIL FROM mail.vanguardschools.edu.pe | ✅ Configurado correctamente (email AWS 11 mar) |
| DKIM / verificación dominio vanguardschools.edu.pe | ❌ Fallido (AWS no detecta registros CNAME) |
| Registros DNS en punto.pe (ns2) | ✅ Configurados correctamente |
| Solicitar acceso a producción | ❌ Bloqueado (requiere dominio/DKIM verificado) |
| Credenciales SMTP | Pendiente |
| Actualizar .env y emailService.js | Pendiente |

---

## 2b. Correos AWS recibidos (11–12 mar 2026)

| Fecha | Asunto / evento | Conclusión |
|-------|----------------------------------|------------|
| 11 mar | Configuración exitosa del dominio **MAIL FROM** personalizado (mail.vanguardschools.edu.pe) | ✅ SES detectó el registro MX correctamente. MAIL FROM listo. |
| 11 mar | Evento `AWS_SES_CMF_PENDIENTE_DE_EXITO` | MAIL FROM en proceso → luego éxito. |
| 12 mar | **Error al configurar DKIM** por correo electrónico para vanguardschools.edu.pe | SES intentó verificar DKIM durante 3 días y **no pudo detectar los registros DNS necesarios**. |
| 12 mar | Evento `AWS_SES_DKIM_PENDING_TO_FAILED` | DKIM pasó de Pendiente a **Fallido**. |

**Resumen:** MAIL FROM está bien. El problema que sigue es **solo DKIM**: AWS no ve los 3 CNAME en la resolución DNS pública, coherente con que el nameserver primario (ns.rcp.net.pe) no responda.

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

## 6. Próximos pasos (para que DKIM/dominio verifique)
1. **Punto.pe:** Que respondan y/o arreglen ns.rcp.net.pe, o pongan ns2 como primario, para que las consultas DNS públicas devuelvan los CNAME DKIM.
2. **Comprobar propagación:** Cuando el primario responda o cambie el orden de NS, verificar desde internet: `nslookup -type=CNAME <token>._domainkey.vanguardschools.edu.pe` (sin indicar servidor, para usar DNS público).
3. **En SES:** En la consola SES → Identidades → vanguardschools.edu.pe → volver a intentar verificación DKIM o “Verificar” de nuevo una vez que DNS sea correcto.
4. Cuando el dominio/DKIM esté verificado: solicitar acceso a producción, crear credenciales SMTP, actualizar `backend/.env` y `emailService.js`.

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
