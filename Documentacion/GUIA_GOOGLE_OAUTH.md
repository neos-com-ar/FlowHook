# 🔐 Guía Paso a Paso: Habilitar Google OAuth

Esta guía te ayudará a configurar Google OAuth para FlowHook, tanto para desarrollo local como para producción.

## 📋 Requisitos Previos

- Una cuenta de Google
- Acceso a [Google Cloud Console](https://console.cloud.google.com/)
- El proyecto FlowHook configurado localmente

---

## 🏠 Paso 1: Configurar Google OAuth en Google Cloud Console

### 1.1. Crear o Seleccionar un Proyecto

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Si no tienes un proyecto:
   - Haz clic en el selector de proyectos (arriba a la izquierda)
   - Haz clic en **"New Project"**
   - Ingresa un nombre (ej: `FlowHook`)
   - Haz clic en **"Create"**
3. Si ya tienes un proyecto, selecciónalo desde el selector de proyectos

### 1.2. Habilitar la API de Google

**Nota importante:** Google ha deprecado la Google+ API. Ahora necesitas habilitar la **Google Identity API** o simplemente usar las credenciales OAuth 2.0 directamente.

1. En el menú lateral, ve a **"APIs & Services"** > **"Library"**
2. Busca **"Google+ API"** o **"Google Identity API"**
3. Si encuentras "Google+ API", haz clic en **"Enable"** (aunque esté deprecada, aún funciona)
4. Si no la encuentras, no te preocupes, puedes continuar sin habilitarla

**Alternativa moderna (recomendada):**
- Busca **"Google Identity API"** o simplemente continúa con la creación de credenciales OAuth 2.0
- Las credenciales OAuth 2.0 funcionan sin necesidad de habilitar APIs adicionales

### 1.3. Configurar la Pantalla de Consentimiento OAuth

1. Ve a **"APIs & Services"** > **"OAuth consent screen"**
2. Selecciona el tipo de usuario:
   - **External** (para usuarios fuera de tu organización) - Recomendado para la mayoría de casos
   - **Internal** (solo para usuarios de tu organización Google Workspace)
3. Haz clic en **"Create"**
4. Completa el formulario:
   - **App name**: `FlowHook` (o el nombre que prefieras)
   - **User support email**: Tu email
   - **Developer contact information**: Tu email
5. Haz clic en **"Save and Continue"**
6. En **"Scopes"** (permisos):
   - Haz clic en **"Add or Remove Scopes"**
   - Selecciona los scopes básicos:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
   - Haz clic en **"Update"** y luego en **"Save and Continue"**
7. En **"Test users"** (si estás en modo de prueba):
   - Puedes agregar emails de prueba si tu app está en modo de prueba
   - Haz clic en **"Save and Continue"**
8. Revisa el resumen y haz clic en **"Back to Dashboard"**

### 1.4. Crear Credenciales OAuth 2.0

1. Ve a **"APIs & Services"** > **"Credentials"**
2. Haz clic en **"+ CREATE CREDENTIALS"** (arriba)
3. Selecciona **"OAuth client ID"**
4. Si es la primera vez, te pedirá configurar la pantalla de consentimiento (ya lo hiciste en el paso anterior)
5. En el formulario:
   - **Application type**: Selecciona **"Web application"**
   - **Name**: `FlowHook` (o el nombre que prefieras)
   
   **Para Desarrollo Local:**
   - **Authorized JavaScript origins**: 
     ```
     http://localhost:3000
     ```
   - **Authorized redirect URIs**: 
     ```
     http://localhost:3000/api/auth/callback/google
     ```
   
   **Para Producción (Vercel):**
   - **Authorized JavaScript origins**: 
     ```
     https://tu-app.vercel.app
     ```
     (Reemplaza `tu-app.vercel.app` con tu URL real de Vercel)
   - **Authorized redirect URIs**: 
     ```
     https://tu-app.vercel.app/api/auth/callback/google
     ```
   
   **💡 Tip:** Puedes agregar múltiples URLs. Agrega tanto la de desarrollo como la de producción:
   ```
   http://localhost:3000
   https://tu-app.vercel.app
   ```
   Y para redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   https://tu-app.vercel.app/api/auth/callback/google
   ```

6. Haz clic en **"Create"**

### 1.5. Obtener las Credenciales

Después de crear las credenciales, verás un modal con:
- **Your Client ID**: Una cadena larga que termina en `.apps.googleusercontent.com`
- **Your Client Secret**: Una cadena secreta

**⚠️ IMPORTANTE:** 
- Copia ambas credenciales inmediatamente
- El Client Secret solo se muestra una vez
- Si lo pierdes, tendrás que crear nuevas credenciales

**Guarda estas credenciales de forma segura:**
- Client ID: `xxxxxxxxxxxxx.apps.googleusercontent.com`
- Client Secret: `GOCSPX-xxxxxxxxxxxxx`

---

## 💻 Paso 2: Configurar Variables de Entorno Localmente

### 2.1. Editar el archivo `.env.local`

1. Abre el archivo `.env.local` en la raíz del proyecto
2. Si no existe, créalo copiando `.env.example` (si existe) o créalo desde cero

### 2.2. Agregar las Variables de Google OAuth

Agrega las siguientes líneas al archivo `.env.local`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=tu-client-id-aqui.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret-aqui
```

**Ejemplo:**
```env
# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
```

### 2.3. Verificar Otras Variables Requeridas

Asegúrate de que también tengas configuradas estas variables:

```env
# NextAuth (REQUERIDO)
NEXTAUTH_SECRET=tu-secret-generado-con-openssl
NEXTAUTH_URL=http://localhost:3000
```

Si no tienes `NEXTAUTH_SECRET`, genera uno:

```bash
openssl rand -base64 32
```

---

## 🧪 Paso 3: Probar en Desarrollo Local

### 3.1. Reiniciar el Servidor de Desarrollo

1. Si el servidor está corriendo, deténlo (Ctrl+C)
2. Inicia el servidor nuevamente:

```bash
npm run dev
```

### 3.2. Verificar que Google OAuth Esté Habilitado

1. Abre tu navegador en `http://localhost:3000/login`
2. Deberías ver un botón **"Continuar con Google"**
3. Si no aparece, verifica:
   - Que las variables `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` estén en `.env.local`
   - Que no haya errores en la consola del servidor
   - Que hayas reiniciado el servidor después de agregar las variables

### 3.3. Probar el Login

1. Haz clic en **"Continuar con Google"**
2. Se abrirá una ventana de Google para autenticarte
3. Selecciona tu cuenta de Google
4. Acepta los permisos solicitados
5. Serás redirigido de vuelta a tu aplicación
6. Deberías estar autenticado y ver el dashboard

**⚠️ Si ves un error:**
- **"redirect_uri_mismatch"**: Verifica que la URL en Google Cloud Console sea exactamente `http://localhost:3000/api/auth/callback/google`
- **"invalid_client"**: Verifica que el Client ID y Client Secret sean correctos
- Revisa la consola del servidor para más detalles

---

## 🚀 Paso 4: Configurar para Producción (Vercel)

### 4.1. Actualizar URLs en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Ve a **"APIs & Services"** > **"Credentials"**
3. Haz clic en el OAuth 2.0 Client ID que creaste
4. En **"Authorized JavaScript origins"**, agrega:
   ```
   https://tu-app.vercel.app
   ```
   (Reemplaza con tu URL real de Vercel)

5. En **"Authorized redirect URIs"**, agrega:
   ```
   https://tu-app.vercel.app/api/auth/callback/google
   ```
   (Reemplaza con tu URL real de Vercel)

6. Haz clic en **"Save"**

### 4.2. Agregar Variables de Entorno en Vercel

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Ve a **"Settings"** > **"Environment Variables"**
3. Agrega las siguientes variables:

   **GOOGLE_CLIENT_ID:**
   - Key: `GOOGLE_CLIENT_ID`
   - Value: Tu Client ID de Google
   - Environments: Selecciona **Production**, **Preview**, y **Development**

   **GOOGLE_CLIENT_SECRET:**
   - Key: `GOOGLE_CLIENT_SECRET`
   - Value: Tu Client Secret de Google
   - Environments: Selecciona **Production**, **Preview**, y **Development**

4. Haz clic en **"Save"** para cada variable

### 4.3. Verificar NEXTAUTH_URL

Asegúrate de que `NEXTAUTH_URL` esté configurado correctamente en Vercel:

1. En **"Environment Variables"**, busca `NEXTAUTH_URL`
2. Debe ser tu URL de producción:
   ```
   https://tu-app.vercel.app
   ```
3. Si no está configurado o es incorrecto, agrégalo o actualízalo

### 4.4. Redesplegar la Aplicación

Después de agregar las variables de entorno:

1. Ve a la pestaña **"Deployments"**
2. Haz clic en el menú de tres puntos (⋯) del último deployment
3. Selecciona **"Redeploy"**
4. O simplemente haz un nuevo commit y push a tu repositorio (si tienes auto-deploy habilitado)

### 4.5. Probar en Producción

1. Ve a `https://tu-app.vercel.app/login`
2. Haz clic en **"Continuar con Google"**
3. Deberías poder autenticarte correctamente

---

## ✅ Verificación Final

### Checklist de Verificación

**Para Desarrollo Local:**
- [ ] Proyecto creado en Google Cloud Console
- [ ] Pantalla de consentimiento OAuth configurada
- [ ] Credenciales OAuth 2.0 creadas
- [ ] URLs de desarrollo agregadas en Google Cloud Console:
  - [ ] `http://localhost:3000` en JavaScript origins
  - [ ] `http://localhost:3000/api/auth/callback/google` en redirect URIs
- [ ] Variables agregadas en `.env.local`:
  - [ ] `GOOGLE_CLIENT_ID`
  - [ ] `GOOGLE_CLIENT_SECRET`
  - [ ] `NEXTAUTH_SECRET`
  - [ ] `NEXTAUTH_URL=http://localhost:3000`
- [ ] Servidor reiniciado después de agregar variables
- [ ] Botón "Continuar con Google" visible en `/login`
- [ ] Login con Google funciona correctamente

**Para Producción (Vercel):**
- [ ] URLs de producción agregadas en Google Cloud Console:
  - [ ] `https://tu-app.vercel.app` en JavaScript origins
  - [ ] `https://tu-app.vercel.app/api/auth/callback/google` en redirect URIs
- [ ] Variables configuradas en Vercel:
  - [ ] `GOOGLE_CLIENT_ID`
  - [ ] `GOOGLE_CLIENT_SECRET`
  - [ ] `NEXTAUTH_URL=https://tu-app.vercel.app`
- [ ] Aplicación redesplegada después de agregar variables
- [ ] Login con Google funciona en producción

---

## 🐛 Solución de Problemas

### Error: "redirect_uri_mismatch"

**Causa:** La URL de redirección en Google Cloud Console no coincide con la URL que NextAuth está usando.

**Solución:**
1. Verifica que la URL en Google Cloud Console sea exactamente:
   - Desarrollo: `http://localhost:3000/api/auth/callback/google`
   - Producción: `https://tu-app.vercel.app/api/auth/callback/google`
2. Asegúrate de que no haya espacios extra o caracteres especiales
3. Verifica que `NEXTAUTH_URL` esté configurado correctamente

### Error: "invalid_client"

**Causa:** El Client ID o Client Secret son incorrectos.

**Solución:**
1. Verifica que copiaste correctamente el Client ID y Client Secret
2. Asegúrate de que no haya espacios al inicio o final
3. Verifica que las variables estén en `.env.local` (desarrollo) o en Vercel (producción)
4. Reinicia el servidor después de agregar las variables

### El botón "Continuar con Google" no aparece

**Causa:** Las variables de entorno no están configuradas o el servidor no se reinició.

**Solución:**
1. Verifica que `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` estén en `.env.local`
2. Asegúrate de que el archivo se llame exactamente `.env.local` (no `.env` ni `.env.local.example`)
3. Reinicia el servidor de desarrollo (`npm run dev`)
4. Revisa la consola del servidor para ver si hay errores

### Error: "Access blocked: This app's request is invalid"

**Causa:** La pantalla de consentimiento OAuth no está configurada correctamente o la app está en modo de prueba.

**Solución:**
1. Ve a **"OAuth consent screen"** en Google Cloud Console
2. Verifica que todos los campos requeridos estén completos
3. Si la app está en modo de prueba, agrega tu email como usuario de prueba
4. O publica la app (si estás listo para producción)

### Error: "Error 400: invalid_request"

**Causa:** Falta alguna configuración en Google Cloud Console.

**Solución:**
1. Verifica que hayas completado la pantalla de consentimiento OAuth
2. Asegúrate de que las credenciales OAuth 2.0 estén creadas
3. Verifica que las URLs estén correctamente configuradas

---

## 📚 Recursos Adicionales

- [Documentación de NextAuth - Google Provider](https://next-auth.js.org/providers/google)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Documentación de OAuth 2.0 de Google](https://developers.google.com/identity/protocols/oauth2)

---

## 💡 Tips y Mejores Prácticas

1. **Usa diferentes credenciales para desarrollo y producción:**
   - Crea un OAuth Client ID para desarrollo
   - Crea otro OAuth Client ID para producción
   - Esto te permite tener diferentes configuraciones y mejor seguridad

2. **Mantén tus credenciales seguras:**
   - Nunca subas `.env.local` a Git
   - Usa variables de entorno en Vercel
   - Rota tus credenciales periódicamente

3. **Verifica las URLs regularmente:**
   - Si cambias tu dominio, actualiza las URLs en Google Cloud Console
   - Verifica que `NEXTAUTH_URL` coincida con tu dominio actual

4. **Monitorea el uso:**
   - Revisa el uso de OAuth en Google Cloud Console
   - Configura alertas si es necesario

---

¡Listo! Ahora deberías tener Google OAuth completamente configurado y funcionando. 🎉



---------------------------------
Se creó el cliente de OAuth
Se puede acceder al ID de cliente desde la pestaña Clientes en Google Auth Platform.

El acceso OAuth está restringido a los usuarios de prueba  que aparecen en la pantalla de consentimiento de OAuth
ID de cliente
TU_CLIENT_ID_AQUI.apps.googleusercontent.com
A partir de junio de 2025, ya no podrás ver ni descargar el secreto del cliente una vez que cierres este diálogo. Asegúrate de haber copiado o descargado la información que aparece a continuación y de haberla almacenado de forma segura.
Secreto del cliente
TU_CLIENT_SECRET_AQUI
Fecha de creación
10 de noviembre de 2025, 10:37:44 p.m. GMT-3
Estado
Habilitada
