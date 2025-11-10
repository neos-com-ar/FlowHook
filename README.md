# FlowHook

Plataforma SaaS completa para administrar múltiples flujos de webhooks configurables por usuario, construida con Next.js 14 (App Router), NextAuth, Tailwind CSS y Vercel KV.

## 🎯 Características

- ✅ Autenticación con NextAuth (GitHub, Google, Email Magic Link)
- ✅ Gestión de flujos de webhooks por usuario
- ✅ Mapeo configurable de datos entrantes
- ✅ Reenvío automático a APIs externas
- ✅ Panel web moderno con Tailwind CSS
- ✅ Persistencia con Vercel KV (con fallback local)
- ✅ Endpoints dinámicos por usuario y flujo
- ✅ Validación de seguridad y autorización

## 🚀 Instalación

### Requisitos

- Node.js >= v18.17.0 (recomendado: v20.x LTS)
- npm >= 9.0.0
- nvm-windows (recomendado si trabajas con múltiples proyectos con diferentes versiones de Node.js)

### 0. Configurar Node.js con nvm (Recomendado)

Este proyecto requiere Node.js >= 18.17.0. Si trabajas con otros proyectos que requieren versiones diferentes de Node.js, usa **nvm-windows** para cambiar entre versiones automáticamente.

#### Instalar Node.js 20.11.0 con nvm

```bash
# Instalar Node.js 20.11.0 (LTS)
nvm install 20.11.0

# Usar esta versión para este proyecto
nvm use 20.11.0
```

El proyecto incluye un archivo `.nvmrc` que especifica la versión de Node.js requerida. Cada vez que entres al directorio del proyecto, puedes ejecutar:

```bash
# Cambiar automáticamente a la versión correcta
nvm use

# O usar el script npm
npm run use-node
```

**Nota:** Si necesitas volver a Node.js 18.16.0 para otros proyectos, simplemente ejecuta `nvm use 18.16.0` en esos proyectos.

### 1. Clonar e instalar dependencias

```bash
cd FlowHook
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# NextAuth
NEXTAUTH_SECRET=tu-secret-key-aqui-genera-uno-con-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# Proveedores de autenticación (opcional, al menos uno)
GITHUB_ID=tu-github-client-id
GITHUB_SECRET=tu-github-client-secret

GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret

# Email (opcional, para magic link)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-password
SMTP_FROM=noreply@example.com

# Vercel KV (opcional, si no se usa, se guarda en /tmp/data.json)
KV_REST_API_URL=https://tu-kv-instance.vercel.app
KV_REST_API_TOKEN=tu-kv-token

# Secret Key para webhooks (opcional)
SECRET_KEY=tu-secret-key-para-webhooks
```

### 3. Generar NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

### 4. Configurar proveedores de autenticación

#### GitHub OAuth

1. Ve a [GitHub Developer Settings](https://github.com/settings/developers)
2. Crea una nueva OAuth App
3. Establece Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copia el Client ID y Client Secret a `.env.local`

#### Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita Google+ API
4. Crea credenciales OAuth 2.0
5. Agrega `http://localhost:3000/api/auth/callback/google` a las URLs autorizadas
6. Copia el Client ID y Client Secret a `.env.local`

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📦 Despliegue en Vercel

Para una guía completa y detallada paso a paso, consulta:

- **[GUIA_DESPLIEGUE_VERCEL.md](./GUIA_DESPLIEGUE_VERCEL.md)** - Guía completa paso a paso
- **[CHECKLIST_DESPLIEGUE.md](./CHECKLIST_DESPLIEGUE.md)** - Checklist para seguir tu progreso

### Resumen rápido

1. **Preparar el proyecto**: Asegúrate de que funciona localmente (`npm run build`)
2. **Crear Vercel KV**: Crea una base de datos KV en Vercel (REQUERIDO para producción)
3. **Configurar NextAuth**: Genera `NEXTAUTH_SECRET` y configura `NEXTAUTH_URL`
4. **Configurar OAuth**: Configura al menos un proveedor (GitHub, Google, o Credentials)
5. **Desplegar**: Conecta tu repositorio GitHub a Vercel o usa `vercel --prod`
6. **Variables de entorno**: Configura todas las variables en Vercel Dashboard
7. **Redesplegar**: Redespliega la aplicación después de configurar las variables

**⚠️ Importante**: 
- Vercel KV es **REQUERIDO** para producción (el sistema de archivos no funciona en funciones serverless)
- Necesitas configurar al menos un proveedor de autenticación
- Consulta la guía completa para detalles detallados

## 🏗️ Estructura del Proyecto

```
FlowHook/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.js          # Configuración NextAuth
│   │   ├── flows/
│   │   │   └── route.js              # CRUD de flujos
│   │   └── webhooks/
│   │       └── [userId]/
│   │           └── [flowId]/
│   │               └── route.js      # Endpoint de recepción de webhooks
│   ├── dashboard/
│   │   └── page.jsx                  # Panel principal
│   ├── login/
│   │   └── page.jsx                  # Página de login
│   ├── layout.jsx                    # Layout principal
│   ├── page.jsx                      # Redirección a dashboard
│   ├── providers.jsx                 # SessionProvider
│   └── globals.css                   # Estilos globales Tailwind
├── components/
│   ├── FlowList.jsx                  # Lista de flujos
│   ├── FlowEditor.jsx                # Editor de flujos
│   └── NavBar.jsx                    # Barra de navegación
├── lib/
│   ├── db.js                         # Funciones de base de datos
│   └── auth.js                       # Utilidades de autenticación
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
└── README.md
```

## 🔧 Uso

### Primer Login / Registro

**No hay un proceso de registro separado.** El registro y login son el mismo proceso:

1. Ve a la página de login: `http://localhost:3000/login`
2. Selecciona uno de los métodos de autenticación disponibles:
   - **GitHub**: Si tienes GitHub configurado
   - **Google**: Si tienes Google OAuth configurado
   - **Email (Magic Link)**: Si tienes SMTP configurado
3. **La primera vez que te autenticas, tu cuenta se crea automáticamente**
4. Serás redirigido al dashboard donde podrás comenzar a crear flujos

**Nota:** Asegúrate de tener al menos un proveedor de autenticación configurado en tu archivo `.env.local` (GitHub, Google, o Email).

### Crear un flujo

1. Inicia sesión en la plataforma (o regístrate automáticamente en el primer login)
2. Ve al dashboard
3. Haz clic en "Nuevo Flujo"
4. Completa el formulario:
   - **ID del Flujo**: Identificador único (ej: `erp-client`)
   - **Nombre Descriptivo**: Nombre amigable (ej: "Alta cliente ERP")
   - **URL Destino**: URL donde se reenviarán los datos (ej: `https://api.crm.com/clientes`)
   - **Mapeo de Datos**: Define cómo se mapean los campos del webhook entrante a los campos del destino

### Usar el webhook

Una vez creado el flujo, obtendrás una URL única:

```
https://tu-app.vercel.app/api/webhooks/{userId}/{flowId}
```

Envía un POST request a esta URL con los datos que quieras procesar:

```bash
curl -X POST https://tu-app.vercel.app/api/webhooks/usr_123/erp-client \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu-secret-key" \
  -d '{
    "customer_name": "Juan Pérez",
    "customer_email": "juan@example.com"
  }'
```

El sistema:
1. Recibirá el webhook
2. Aplicará el mapeo configurado
3. Reenviará los datos mapeados a la URL destino

### Ejemplo de mapeo

Si configuraste el mapeo:
- `nombre` → `customer_name`
- `email` → `customer_email`

Y recibes:
```json
{
  "customer_name": "Juan Pérez",
  "customer_email": "juan@example.com"
}
```

Se reenviará a tu destino como:
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com"
}
```

## 🔒 Seguridad

- ✅ Validación de sesión en todas las rutas protegidas
- ✅ Los usuarios solo pueden acceder a sus propios flujos
- ✅ Validación de `SECRET_KEY` en webhooks (si está configurado)
- ✅ Límite de tamaño de body (1MB)
- ✅ Validación de formato de IDs y URLs
- ✅ HTTPS automático en Vercel

## 📝 Notas

- Si no configuras Vercel KV, los datos se guardarán en `/tmp/data.json` (solo funciona en desarrollo local)
- El ID del flujo no se puede cambiar después de crear el flujo
- Los webhooks requieren el header `Authorization: Bearer {SECRET_KEY}` si `SECRET_KEY` está configurado
- El sistema soporta mapeo de campos anidados usando notación de punto (ej: `user.profile.name`)

## 🐛 Solución de Problemas

### Error: "You are using Node.js X.X.X. For Next.js, Node.js version >= v18.17.0 is required"

Este proyecto requiere Node.js >= 18.17.0. Si trabajas con otros proyectos que requieren versiones diferentes (como Node.js 18.16.0), usa **nvm-windows** para cambiar entre versiones.

#### Solución: Usar nvm-windows (Recomendado)

Si tienes nvm-windows instalado (que ya tienes):

```bash
# Instalar Node.js 20.11.0 (LTS) si no lo tienes
nvm install 20.11.0

# Cambiar a la versión correcta para este proyecto
nvm use 20.11.0

# O simplemente usar el archivo .nvmrc del proyecto
nvm use
```

**Para volver a Node.js 18.16.0 en otros proyectos:**
```bash
nvm use 18.16.0
```

El proyecto incluye un archivo `.nvmrc` que especifica la versión requerida. Los scripts `npm run dev` y `npm run build` verificarán automáticamente que estés usando la versión correcta.

#### Opción 2: Descargar desde nodejs.org

1. Ve a [nodejs.org](https://nodejs.org/)
2. Descarga la versión LTS (Long Term Support) más reciente
3. Ejecuta el instalador y sigue las instrucciones
4. Reinicia tu terminal/PowerShell
5. Verifica la instalación: `node --version`

#### Opción 3: Usando Chocolatey (si lo tienes instalado)

```bash
choco upgrade nodejs-lts
```

### Error: "Unauthorized" al acceder a flujos

- Verifica que estés autenticado
- Asegúrate de que `NEXTAUTH_SECRET` esté configurado correctamente

### Error: "Flow not found" en webhooks

- Verifica que el `userId` y `flowId` sean correctos
- Asegúrate de que el flujo pertenezca al usuario correcto

### Los datos no se guardan

- Si usas Vercel KV, verifica las credenciales
- Si usas fallback local, verifica que el directorio `/tmp` tenga permisos de escritura

## 📄 Licencia

Este proyecto está bajo la licencia MIT.

