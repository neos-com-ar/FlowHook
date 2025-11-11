# 🚀 Despliegue Alternativo: Usando Vercel CLI

Si el botón "Deploy" en el dashboard de Vercel no funciona, puedes desplegar usando la CLI.

## Pasos para desplegar con CLI

### 1. Instalar Vercel CLI

```bash
npm install -g vercel
```

### 2. Iniciar sesión

```bash
vercel login
```

Esto abrirá tu navegador para autenticarte.

### 3. Navegar al proyecto

```bash
cd FlowHook
```

### 4. Desplegar

```bash
vercel
```

### 5. Seguir las instrucciones

La CLI te hará varias preguntas:

1. **Set up and deploy?** → Presiona `Y` (Yes)
2. **Which scope?** → Selecciona tu cuenta o equipo
3. **Link to existing project?** → Presiona `N` (No) para crear uno nuevo, o `Y` si ya existe
4. **What's your project's name?** → Escribe `flowhook` o el nombre que prefieras
5. **In which directory is your code located?** → Presiona Enter (usa `./`)
6. **Want to override the settings?** → Presiona `N` (No)

### 6. Desplegar a producción

Después del despliegue de prueba, para desplegar a producción:

```bash
vercel --prod
```

## Configurar variables de entorno con CLI

También puedes configurar variables de entorno desde la CLI:

```bash
# Agregar una variable de entorno
vercel env add NEXTAUTH_SECRET production

# Agregar más variables
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
```

O puedes configurarlas desde el Dashboard de Vercel después del despliegue.

## Ventajas de usar CLI

- ✅ Más control sobre el proceso de despliegue
- ✅ Puedes ver los logs en tiempo real
- ✅ No depende de la interfaz web
- ✅ Útil para automatización y CI/CD

## Después del despliegue

Una vez desplegado, continúa con el **Paso 6: Configuración de Variables de Entorno** de la guía principal.

