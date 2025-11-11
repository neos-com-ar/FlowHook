# Diagnóstico de Problemas con Envío de Email

## Cambios Realizados

1. ✅ **Formulario de email mejorado**: Ahora el usuario debe ingresar su email antes de enviar
2. ✅ **Página de verificación personalizada**: Creada en `/verify-email`
3. ✅ **Validación de NEXTAUTH_URL**: El sistema ahora valida y advierte si NEXTAUTH_URL no está configurado
4. ✅ **Logging mejorado**: Se registran más detalles sobre la configuración SMTP

## Problemas Comunes y Soluciones

### 1. NEXTAUTH_URL no configurado (CRÍTICO)

**Síntoma**: Los emails no se envían o los enlaces no funcionan.

**Solución**:
```env
# En .env.local (desarrollo)
NEXTAUTH_URL=http://localhost:3000

# En producción (Vercel)
NEXTAUTH_URL=https://tu-dominio.vercel.app
```

**Verificación**: Revisa los logs del servidor al iniciar. Deberías ver:
```
✅ NEXTAUTH_URL configurado: http://localhost:3000
```

Si ves:
```
❌ NEXTAUTH_URL no está configurado...
```
Entonces **NEXTAUTH_URL no está configurado correctamente**.

### 2. Credenciales SMTP incorrectas

**Síntoma**: Error de autenticación al intentar enviar email.

**Para Gmail**:
1. Ve a [Google Account Security](https://myaccount.google.com/security)
2. Habilita "Verificación en 2 pasos"
3. Ve a "Contraseñas de aplicaciones"
4. Genera una nueva contraseña de aplicación
5. Usa esta contraseña (no tu contraseña normal) en `SMTP_PASSWORD`

**Verificación**: Revisa los logs del servidor. Si hay un error de autenticación, verás:
```
❌ Error al enviar email de verificación: Invalid login
```

### 3. Puerto SMTP incorrecto

**Para Gmail**:
- Puerto 587 (STARTTLS): `SMTP_PORT=587`
- Puerto 465 (SSL/TLS): `SMTP_PORT=465`

**Verificación**: El código detecta automáticamente el puerto y configura TLS correctamente.

### 4. Firewall o bloqueo de red

**Síntoma**: Timeout al intentar conectar al servidor SMTP.

**Solución**: Verifica que el servidor pueda conectarse al puerto SMTP (587 o 465).

### 5. Variables de entorno no cargadas

**Síntoma**: El EmailProvider no se configura.

**Solución**:
1. Verifica que el archivo `.env.local` existe en la raíz del proyecto
2. Reinicia el servidor de desarrollo después de cambiar las variables
3. En producción (Vercel), verifica que las variables estén configuradas en el dashboard

## Pasos de Diagnóstico

### Paso 1: Verificar configuración básica

1. Abre `.env.local` y verifica que todas las variables estén configuradas:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=tu-secret-generado
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-contraseña-de-aplicacion
SMTP_FROM=noreply@example.com
```

### Paso 2: Verificar logs del servidor

Al iniciar el servidor (`npm run dev`), deberías ver en la consola:
```
🔧 Inicializando NextAuth...
📧 Configurando EmailProvider con: { host: 'smtp.gmail.com', port: 587, ... }
✅ EmailProvider configurado correctamente
✅ NEXTAUTH_URL configurado: http://localhost:3000
✅ Configurando NextAuth con X proveedor(es)
```

Si ves errores o advertencias, corrígelos.

### Paso 3: Probar envío de email

1. Ve a `http://localhost:3000/login`
2. Haz clic en "Continuar con Email"
3. Ingresa un email válido
4. Haz clic en "Enviar enlace de acceso"

**Si funciona correctamente**:
- Deberías ser redirigido a `/verify-email`
- Deberías recibir un email con un enlace de acceso

**Si hay un error**:
- Revisa los logs del servidor para ver el error específico
- Verifica que el email no esté en la carpeta de spam
- Verifica que NEXTAUTH_URL esté configurado correctamente

### Paso 4: Revisar logs de errores

Si el email no se envía, revisa los logs del servidor. Busca mensajes que comiencen con:
- `❌ Error al enviar email de verificación:`
- `❌ Error al configurar EmailProvider:`
- `⚠️ NEXTAUTH_URL no está configurado`

## Solución Rápida para Gmail

Si estás usando Gmail y no funciona:

1. **Habilita verificación en 2 pasos** en tu cuenta de Google
2. **Genera una contraseña de aplicación**:
   - Ve a https://myaccount.google.com/apppasswords
   - Selecciona "Correo" y "Otro (nombre personalizado)"
   - Ingresa "FlowHook" como nombre
   - Copia la contraseña generada (16 caracteres)
3. **Configura las variables**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=tu-email@gmail.com
   SMTP_PASSWORD=la-contraseña-de-16-caracteres-generada
   SMTP_FROM=tu-email@gmail.com
   ```
4. **Reinicia el servidor**

## Próximos Pasos

Si después de seguir estos pasos el problema persiste:

1. Revisa los logs completos del servidor
2. Verifica que todas las variables de entorno estén correctas
3. Prueba con un servicio de email diferente (SendGrid, Mailgun, etc.)
4. Verifica que el servidor pueda conectarse a internet y al servidor SMTP

