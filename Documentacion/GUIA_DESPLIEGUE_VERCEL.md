# 🚀 Guía Paso a Paso: Despliegue en Vercel

Esta guía te ayudará a desplegar FlowHook en Vercel de forma completa y profesional.

## ⚡ Resumen Ejecutivo

**Tiempo estimado**: 30-45 minutos

**Pasos principales**:
1. ✅ Preparar proyecto y subirlo a GitHub
2. ✅ Crear base de datos Vercel KV
3. ✅ Configurar NextAuth (generar secret)
4. ✅ Configurar proveedores OAuth (opcional)
5. ✅ Desplegar en Vercel
6. ✅ Configurar variables de entorno
7. ✅ Redesplegar y verificar

**⚠️ Importante**: 
- Vercel KV es **REQUERIDO** para producción (el sistema de archivos no funciona en funciones serverless)
- El plan gratuito de Vercel tiene límites (10 segundos por función, límites de KV)
- Necesitas al menos un proveedor de autenticación configurado (GitHub, Google, o Credentials)

**📝 Checklist rápido**: Usa el archivo `CHECKLIST_DESPLIEGUE.md` para seguir tu progreso.

## 📋 Índice

1. [Prerrequisitos](#prerrequisitos)
2. [Preparación del Proyecto](#preparación-del-proyecto)
3. [Configuración de Vercel KV](#configuración-de-vercel-kv)
4. [Configuración de NextAuth](#configuración-de-nextauth)
5. [Configuración de Proveedores OAuth (Opcional)](#configuración-de-proveedores-oauth-opcional)
6. [Despliegue en Vercel](#despliegue-en-vercel)
7. [Configuración de Variables de Entorno](#configuración-de-variables-de-entorno)
8. [Verificación del Despliegue](#verificación-del-despliegue)
9. [Solución de Problemas](#solución-de-problemas)

---

## 📦 Prerrequisitos

Antes de comenzar, asegúrate de tener:

- ✅ Una cuenta en [Vercel](https://vercel.com) (gratuita)
- ✅ Git instalado en tu máquina
- ✅ El proyecto FlowHook clonado y funcionando localmente
- ✅ Node.js >= 18.17.0 instalado
- ✅ Una cuenta de GitHub (recomendado para integración continua)

---

## 🔧 Paso 1: Preparación del Proyecto

### 1.1. Verificar que el proyecto funciona localmente

```bash
# Asegúrate de estar en la raíz del proyecto
cd FlowHook

# Instalar dependencias
npm install

# Verificar que el build funciona
npm run build
```

Si el build falla, corrige los errores antes de continuar.

### 1.2. Verificar que `.gitignore` está configurado correctamente

Asegúrate de que `.gitignore` incluya:
- `.env*.local`
- `.env`
- `node_modules/`
- `.next/`
- `.vercel/`
- `/tmp/data.json`

### 1.3. Subir el proyecto a GitHub (Recomendado)

Si aún no tienes el proyecto en GitHub:

```bash
# Inicializar repositorio (si no existe)
git init

# Agregar todos los archivos
git add .

# Hacer commit inicial
git commit -m "Preparación para despliegue en Vercel"

# Crear repositorio en GitHub y luego:
git remote add origin https://github.com/TU_USUARIO/FlowHook.git
git branch -M main
git push -u origin main
```

**Nota:** Asegúrate de NO subir archivos `.env.local` o `.env` que contengan credenciales.

---

## 💾 Paso 2: Configuración de Vercel KV

**⚠️ IMPORTANTE**: Vercel KV es **REQUERIDO** para producción. El sistema de archivos local (`/tmp/data.json`) que se usa en desarrollo **NO funciona** en Vercel porque las funciones serverless son efímeras y no tienen acceso persistente al sistema de archivos.

Vercel KV es necesario para almacenar los flujos y datos de usuarios en producción.

### 2.1. Crear una base de datos KV en Vercel

1. Inicia sesión en [Vercel Dashboard](https://vercel.com/dashboard)
2. Ve a la sección **Storage** en el menú lateral
3. Haz clic en **Create Database**
4. Selecciona **KV** (Key-Value)
5. Completa el formulario:
   - **Name**: `flowhook-kv` (o el nombre que prefieras)
   - **Region**: Selecciona la región más cercana a tus usuarios (ej: `us-east-1`)
6. Haz clic en **Create**

### 2.2. Obtener las credenciales de Vercel KV

Una vez creada la base de datos:

1. Haz clic en la base de datos creada
2. Ve a la pestaña **.env.local**
3. Copia las siguientes variables:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

**Guarda estas credenciales**, las necesitarás en el paso de configuración de variables de entorno.

---

## 🔐 Paso 3: Configuración de NextAuth

### 3.1. Generar NEXTAUTH_SECRET

El `NEXTAUTH_SECRET` es una clave secreta utilizada para cifrar tokens JWT. Debes generar uno seguro:

**En Windows (PowerShell):**
```powershell
# Generar secret aleatorio
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Alternativa (usando Node.js):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Alternativa (online):**
- Ve a [generate-secret.vercel.app](https://generate-secret.vercel.app/32) y genera un secret de 32 bytes

**Guarda el secret generado**, lo necesitarás más adelante.

### 3.2. Configurar NEXTAUTH_URL

Para producción, `NEXTAUTH_URL` debe ser la URL de tu aplicación en Vercel. Por ejemplo:
- `https://tu-app.vercel.app`

**Nota:** Si aún no has desplegado la aplicación, puedes usar un dominio temporal. Vercel te asignará uno automáticamente después del primer despliegue.

---

## 🔗 Paso 4: Configuración de Proveedores OAuth (Opcional)

FlowHook soporta múltiples proveedores de autenticación. Puedes configurar uno o varios:

### 4.1. Configurar GitHub OAuth (Recomendado)

1. Ve a [GitHub Developer Settings](https://github.com/settings/developers)
2. Haz clic en **New OAuth App**
3. Completa el formulario:
   - **Application name**: `FlowHook` (o el nombre que prefieras)
   - **Homepage URL**: `https://tu-app.vercel.app` (o tu dominio)
   - **Authorization callback URL**: `https://tu-app.vercel.app/api/auth/callback/github`
4. Haz clic en **Register application**
5. Copia el **Client ID** y genera un **Client Secret**
6. **Guarda estas credenciales** (Client ID y Client Secret)

### 4.2. Configurar Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google+ API**:
   - Ve a **APIs & Services** > **Library**
   - Busca "Google+ API" y habilítala
4. Crea credenciales OAuth 2.0:
   - Ve a **APIs & Services** > **Credentials**
   - Haz clic en **Create Credentials** > **OAuth client ID**
   - Selecciona **Web application**
   - Completa el formulario:
     - **Name**: `FlowHook`
     - **Authorized JavaScript origins**: `https://tu-app.vercel.app`
     - **Authorized redirect URIs**: `https://tu-app.vercel.app/api/auth/callback/google`
   - Haz clic en **Create**
5. Copia el **Client ID** y **Client Secret**
6. **Guarda estas credenciales**

### 4.3. Configurar Email (Magic Link) - Opcional

Si deseas usar autenticación por email:

1. Configura un servidor SMTP (Gmail, SendGrid, etc.)
2. Para Gmail:
   - Habilita "Contraseñas de aplicaciones" en tu cuenta de Google
   - Genera una contraseña de aplicación específica
   - Usa esta contraseña en lugar de tu contraseña normal

**Nota:** Para producción, se recomienda usar un servicio profesional de email como SendGrid, Mailgun, o Resend.

---

## 🚀 Paso 5: Despliegue en Vercel

### Opción A: Despliegue desde GitHub (Recomendado)

Esta es la forma más fácil y permite despliegues automáticos:

1. Inicia sesión en [Vercel Dashboard](https://vercel.com/dashboard)
2. Haz clic en **Add New** > **Project**
3. Si es la primera vez, conecta tu cuenta de GitHub:
   - Haz clic en **Import Git Repository**
   - Autoriza a Vercel para acceder a tus repositorios
4. Selecciona el repositorio **FlowHook**
5. Vercel detectará automáticamente que es un proyecto Next.js
6. **No modifiques la configuración** por ahora (la configuraremos después)
7. Haz clic en **Deploy**

**Importante:** El primer despliegue fallará porque aún no has configurado las variables de entorno. Esto es normal. Continúa con el siguiente paso.

### Opción B: Despliegue desde CLI

Si prefieres usar la CLI de Vercel:

```bash
# Instalar Vercel CLI globalmente
npm install -g vercel

# Iniciar sesión en Vercel
vercel login

# Desplegar (seguir las instrucciones en pantalla)
vercel

# Para producción
vercel --prod
```

---

## ⚙️ Paso 6: Configuración de Variables de Entorno

Una vez desplegado el proyecto (incluso si falló), configura las variables de entorno:

### 6.1. Acceder a la configuración del proyecto

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto **FlowHook**
3. Ve a **Settings** > **Environment Variables**

### 6.2. Agregar variables de entorno

Agrega las siguientes variables de entorno. Para cada una:

1. Haz clic en **Add New**
2. Ingresa el **Key** (nombre de la variable)
3. Ingresa el **Value** (valor de la variable)
4. Selecciona los **Environments** donde aplicará:
   - ✅ **Production**
   - ✅ **Preview**
   - ✅ **Development** (opcional)
5. Haz clic en **Save**

#### Variables Requeridas

```env
# NextAuth - REQUERIDO
NEXTAUTH_SECRET=tu-secret-generado-en-paso-3.1
NEXTAUTH_URL=https://tu-app.vercel.app
```

#### Variables de Vercel KV - REQUERIDAS para producción

```env
KV_REST_API_URL=https://tu-kv-instance.upstash.io
KV_REST_API_TOKEN=tu-kv-token-aqui
```

**Nota:** Estas credenciales las obtuviste en el Paso 2.2.

#### Variables de GitHub OAuth (Opcional)

```env
GITHUB_ID=tu-github-client-id
GITHUB_SECRET=tu-github-client-secret
```

#### Variables de Google OAuth (Opcional)

```env
GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret
```

#### Variables de Email SMTP (Opcional)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-password-de-aplicacion
SMTP_FROM=noreply@tu-app.vercel.app
```

#### Variables Adicionales (Opcional)

```env
# Secret para proteger webhooks (opcional)
SECRET_KEY=tu-secret-key-para-webhooks

# Modo debug (solo para desarrollo)
NODE_ENV=production
```

### 6.3. Conectar Vercel KV al proyecto

Si creaste la base de datos KV antes de desplegar el proyecto:

1. Ve a la base de datos KV en Vercel Dashboard
2. Haz clic en **Settings** > **Connect to Project**
3. Selecciona tu proyecto **FlowHook**
4. Las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` se agregarán automáticamente

### 6.4. Actualizar NEXTAUTH_URL después del despliegue

Una vez que Vercel asigne una URL a tu proyecto:

1. Ve a **Settings** > **Environment Variables**
2. Busca `NEXTAUTH_URL`
3. Actualiza el valor con la URL real de tu aplicación:
   - Ejemplo: `https://flowhook.vercel.app`
   - O tu dominio personalizado si lo configuraste

### 6.5. Actualizar URLs de Callback en Proveedores OAuth

Si configuraste proveedores OAuth, actualiza las URLs de callback:

#### GitHub:
1. Ve a [GitHub Developer Settings](https://github.com/settings/developers)
2. Selecciona tu OAuth App
3. Actualiza **Authorization callback URL** a:
   - `https://tu-app.vercel.app/api/auth/callback/github`

#### Google:
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Ve a **APIs & Services** > **Credentials**
3. Selecciona tu OAuth 2.0 Client ID
4. Actualiza **Authorized redirect URIs** a:
   - `https://tu-app.vercel.app/api/auth/callback/google`

---

## 🔄 Paso 7: Redesplegar la Aplicación

Después de configurar las variables de entorno:

### Opción A: Desde el Dashboard

1. Ve a tu proyecto en Vercel Dashboard
2. Ve a la pestaña **Deployments**
3. Haz clic en los tres puntos (`...`) del último despliegue
4. Selecciona **Redeploy**
5. Confirma el redespliegue

### Opción B: Desde Git (Recomendado)

Si conectaste tu repositorio de GitHub, simplemente haz un nuevo commit:

```bash
# Hacer un pequeño cambio (ej: actualizar README)
git commit --allow-empty -m "Trigger redeploy"

# Push a GitHub
git push
```

Vercel desplegará automáticamente la nueva versión con las variables de entorno configuradas.

### Opción C: Desde CLI

```bash
vercel --prod
```

---

## ✅ Paso 8: Verificación del Despliegue

### 8.1. Verificar que la aplicación está funcionando

1. Ve a la URL de tu aplicación en Vercel (ej: `https://tu-app.vercel.app`)
2. Deberías ver la página de inicio o ser redirigido a `/login`

### 8.2. Verificar autenticación

1. Ve a `/login`
2. Prueba iniciar sesión con uno de los proveedores configurados:
   - **Credentials**: `admin` / `admin` (solo para desarrollo)
   - **GitHub**: Si configuraste GitHub OAuth
   - **Google**: Si configuraste Google OAuth
   - **Email**: Si configuraste SMTP

### 8.3. Verificar que Vercel KV está funcionando

1. Inicia sesión en la aplicación
2. Crea un nuevo flujo desde el dashboard
3. Verifica que el flujo se guarda correctamente
4. Recarga la página y verifica que el flujo persiste

### 8.4. Verificar webhooks

1. Crea un flujo en el dashboard
2. Copia la URL del webhook (ej: `https://tu-app.vercel.app/api/webhooks/{userId}/{flowId}`)
3. Envía un POST request a la URL:

```bash
curl -X POST https://tu-app.vercel.app/api/webhooks/usr_123/flow_123 \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

4. Verifica que el webhook se recibió y procesó correctamente

### 8.5. Verificar logs

1. Ve a Vercel Dashboard > Tu Proyecto > **Deployments**
2. Selecciona el último despliegue
3. Haz clic en **View Function Logs**
4. Verifica que no hay errores críticos

---

## 🐛 Paso 9: Solución de Problemas

### Error: "NEXTAUTH_SECRET is not set"

**Solución:**
1. Ve a **Settings** > **Environment Variables** en Vercel
2. Asegúrate de que `NEXTAUTH_SECRET` esté configurado
3. Redespliega la aplicación

### Error: "Invalid callback URL" en GitHub/Google OAuth

**Solución:**
1. Verifica que la URL de callback en tu proveedor OAuth coincida exactamente con:
   - `https://tu-app.vercel.app/api/auth/callback/github` (para GitHub)
   - `https://tu-app.vercel.app/api/auth/callback/google` (para Google)
2. Asegúrate de que `NEXTAUTH_URL` en Vercel sea `https://tu-app.vercel.app`

### Error: "KV_REST_API_URL is not set" o errores de conexión a KV

**Solución:**
1. Ve a **Settings** > **Environment Variables** en Vercel
2. Verifica que `KV_REST_API_URL` y `KV_REST_API_TOKEN` estén configuradas
3. Si usaste "Connect to Project" en Vercel KV, las variables deberían estar automáticamente
4. Si no, agrégalas manualmente desde la pestaña **.env.local** de tu base de datos KV

### Error: "Build failed" en Vercel

**Solución:**
1. Verifica los logs del build en Vercel Dashboard
2. Asegúrate de que `package.json` tenga todas las dependencias necesarias
3. Verifica que la versión de Node.js sea compatible (>= 18.17.0)
4. Puedes configurar la versión de Node.js en Vercel:
   - Ve a **Settings** > **General** > **Node.js Version**
   - Selecciona `20.x` (recomendado)

### Error: "Unauthorized" al acceder a flujos

**Solución:**
1. Verifica que estés autenticado correctamente
2. Asegúrate de que `NEXTAUTH_SECRET` esté configurado y sea el mismo en todos los entornos
3. Verifica que las cookies de sesión se estén guardando correctamente

### Los datos no se guardan en producción

**Solución:**
1. Verifica que Vercel KV esté configurado correctamente
2. Revisa los logs de la función para ver si hay errores de conexión a KV
3. Asegúrate de que las credenciales de KV sean correctas

### Error: "Function exceeded maximum duration"

**Solución:**
1. El archivo `vercel.json` está configurado con `maxDuration: 10` segundos (compatible con el plan gratuito)
2. Si necesitas más tiempo y tienes un plan de pago, puedes aumentarlo en `vercel.json`:

```json
{
  "functions": {
    "app/api/**/*.js": {
      "maxDuration": 30
    }
  }
}
```

**Nota:** 
- Los planes gratuitos de Vercel tienen un límite de **10 segundos** por función
- Los planes Pro permiten hasta **60 segundos**
- Los planes Enterprise permiten hasta **300 segundos** (5 minutos)
- Si tus funciones exceden el tiempo, considera optimizar el código o usar un plan de pago

---

## 🎉 ¡Listo!

Tu aplicación FlowHook debería estar funcionando correctamente en Vercel. 

### Próximos pasos:

1. **Configurar dominio personalizado** (opcional):
   - Ve a **Settings** > **Domains** en Vercel
   - Agrega tu dominio personalizado
   - Configura los registros DNS según las instrucciones

2. **Configurar monitoreo** (opcional):
   - Considera usar servicios como Sentry para monitoreo de errores
   - Configura alertas en Vercel para despliegues fallidos

3. **Optimizar rendimiento**:
   - Revisa los logs de función para optimizar consultas a KV
   - Considera implementar caché para consultas frecuentes

4. **Seguridad**:
   - Revisa y actualiza regularmente las dependencias
   - Considera implementar rate limiting para los webhooks
   - Configura CORS si es necesario

---

## 📚 Recursos Adicionales

- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Next.js](https://nextjs.org/docs)
- [Documentación de NextAuth](https://next-auth.js.org/)
- [Documentación de Vercel KV](https://vercel.com/docs/storage/vercel-kv)
- [Guía de Vercel KV](https://vercel.com/docs/storage/vercel-kv/quickstart)

---

## 💡 Notas Importantes

1. **Nunca subas archivos `.env.local` o `.env` a Git**. Estos archivos contienen credenciales sensibles.

2. **Las variables de entorno en Vercel son diferentes para cada entorno** (Production, Preview, Development). Asegúrate de configurarlas para todos los entornos necesarios.

3. **Vercel KV tiene límites en el plan gratuito**. Revisa los límites en la [página de precios de Vercel](https://vercel.com/pricing).

4. **Los despliegues en Vercel son automáticos** si conectaste tu repositorio de GitHub. Cada push a la rama `main` (o `master`) desplegará automáticamente a producción.

5. **Las funciones serverless en Vercel tienen un cold start**. La primera solicitud después de un período de inactividad puede tardar más. Esto es normal.

---

¡Feliz despliegue! 🚀

