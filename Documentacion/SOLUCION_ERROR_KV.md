# 🔧 Solución: Error al conectar Vercel KV

## ❌ Error que estás viendo

```
This project already has an existing environment variable with name 
KV_REST_API_TOKEN in one of the chosen environments
```

## 🔍 ¿Qué significa este error?

Este error aparece cuando intentas conectar una base de datos KV a tu proyecto, pero **ya agregaste manualmente** las variables de entorno `KV_REST_API_TOKEN` (y probablemente `KV_REST_API_URL`) en el proyecto.

Vercel no puede crear variables duplicadas, por lo que necesita que elijas una de estas opciones:

## ✅ Solución: Opción A (Recomendada)

### Eliminar las variables existentes y dejar que Vercel las cree automáticamente

**Ventajas:**
- ✅ Vercel gestiona las variables automáticamente
- ✅ Si cambias la base de datos, las variables se actualizan automáticamente
- ✅ Más fácil de mantener

**Pasos:**

1. **Haz clic en "Cancel"** en el modal que estás viendo

2. **Ve a tu proyecto en Vercel Dashboard**
   - Ve a **Settings** > **Environment Variables**

3. **Elimina las variables existentes de KV:**
   - Busca `KV_REST_API_URL` y elimínala
   - Busca `KV_REST_API_TOKEN` y elimínala
   - Si agregaste `UPSTASH_REDIS_REST_URL` o `UPSTASH_REDIS_REST_TOKEN`, también elimínalas

4. **Vuelve a la base de datos KV:**
   - Ve a **Storage** > Selecciona tu base de datos `flowhook-kv`
   - Haz clic en **Settings** > **Connect to Project**
   - Selecciona tu proyecto `flowhook`
   - Selecciona los entornos (Production, Preview, Development)
   - **Deja el campo "Custom Prefix" vacío** (o déjalo en blanco)
   - Haz clic en **Connect**

5. **Verifica que funcionó:**
   - Ve a tu proyecto > **Settings** > **Environment Variables**
   - Deberías ver `KV_REST_API_URL` y `KV_REST_API_TOKEN` agregadas automáticamente
   - Estas variables tendrán un ícono especial que indica que están conectadas a la base de datos

## 🔄 Solución: Opción B (Alternativa)

### No conectar automáticamente y usar las variables manuales

**Cuándo usar esta opción:**
- Si ya configuraste las variables manualmente y funcionan
- Si necesitas un prefijo personalizado para las variables
- Si prefieres gestionar las variables manualmente

**Pasos:**

1. **Haz clic en "Cancel"** en el modal

2. **Verifica que las variables estén correctamente configuradas:**
   - Ve a tu proyecto > **Settings** > **Environment Variables**
   - Asegúrate de que existan:
     - `KV_REST_API_URL` (con el valor correcto de tu base de datos)
     - `KV_REST_API_TOKEN` (con el token correcto)
   - Verifica que estén configuradas para el entorno correcto (Production, Preview, etc.)

3. **Listo:** Tu aplicación usará estas variables manuales

## 📝 Notas importantes

- **El código de FlowHook soporta ambos nombres de variables:**
  - `KV_REST_API_URL` / `KV_REST_API_TOKEN` (estándar de Vercel)
  - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (nombres de Upstash)

- **Si usas un Custom Prefix:**
  - Por ejemplo, si pones `STORAGE` como prefijo, las variables serían:
    - `STORAGE_KV_REST_API_URL`
    - `STORAGE_KV_REST_API_TOKEN`
  - **NO se recomienda** usar un prefijo personalizado a menos que tengas una razón específica, ya que el código espera los nombres estándar

## 🎯 Recomendación

**Usa la Opción A** (dejar que Vercel cree las variables automáticamente). Es más fácil, más mantenible y sigue las mejores prácticas de Vercel.

## 🔍 Verificación

Después de conectar la base de datos:

1. Ve a tu proyecto > **Settings** > **Environment Variables**
2. Deberías ver las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`
3. Estas variables deberían tener un ícono especial o indicador de que están conectadas a la base de datos
4. Si haces clic en ellas, verás información sobre la base de datos conectada

## 🚀 Siguiente paso

Una vez resuelto este error, continúa con el resto de la configuración:
- Configurar `NEXTAUTH_SECRET`
- Configurar `NEXTAUTH_URL`
- Configurar proveedores OAuth (opcional)
- Redesplegar la aplicación

