# 🧪 Cómo Probar el Webhook Corregido

Esta guía te ayudará a probar que el error "headers is not defined" ha sido corregido.

## 📋 Pasos para Probar

### 1. Obtener la Información del Webhook

1. **Inicia sesión** en tu aplicación FlowHook
2. Ve al **Dashboard** y luego a la lista de **Flujos**
3. Encuentra el flujo que quieres probar
4. **Copia la URL del webhook** que aparece en la lista de flujos
   - Formato: `http://localhost:3000/api/webhooks/{userId}/{projectId}/{flowId}`
   - O en producción: `https://tu-dominio.com/api/webhooks/{userId}/{projectId}/{flowId}`

### 2. Probar con cURL (Terminal/CMD)

#### En Windows (CMD o PowerShell):

```bash
curl -X POST "http://localhost:3000/api/webhooks/TU_USER_ID/TU_PROJECT_ID/TU_FLOW_ID" ^
  -H "Content-Type: application/json" ^
  -d "{\"data\":{\"test\":true,\"evento\":\"cliente.created\",\"message\":\"Este es un webhook de prueba\"},\"event\":\"cliente.created\",\"tenantId\":\"6f7022b0-f6c4-4d42-9d85-9355c69769b5\",\"timestamp\":\"2025-12-09T19:02:17.369Z\"}"
```

#### En Linux/Mac:

```bash
curl -X POST "http://localhost:3000/api/webhooks/TU_USER_ID/TU_PROJECT_ID/TU_FLOW_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "test": true,
      "evento": "cliente.created",
      "message": "Este es un webhook de prueba"
    },
    "event": "cliente.created",
    "tenantId": "6f7022b0-f6c4-4d42-9d85-9355c69769b5",
    "timestamp": "2025-12-09T19:02:17.369Z"
  }'
```

**Nota:** Si tienes `SECRET_KEY` configurado, agrega este header:
```bash
-H "Authorization: Bearer TU_SECRET_KEY"
```

### 3. Probar con Postman

1. Abre **Postman**
2. Crea una nueva petición **POST**
3. URL: `http://localhost:3000/api/webhooks/{userId}/{projectId}/{flowId}`
4. En la pestaña **Headers**, agrega:
   - `Content-Type: application/json`
   - (Opcional) `Authorization: Bearer TU_SECRET_KEY` si tienes SECRET_KEY configurado
5. En la pestaña **Body**, selecciona **raw** y **JSON**, luego pega:
```json
{
  "data": {
    "test": true,
    "evento": "cliente.created",
    "message": "Este es un webhook de prueba"
  },
  "event": "cliente.created",
  "tenantId": "6f7022b0-f6c4-4d42-9d85-9355c69769b5",
  "timestamp": "2025-12-09T19:02:17.369Z"
}
```
6. Haz clic en **Send**

### 4. Usar los Scripts de Prueba

He creado dos scripts para facilitar las pruebas:

#### Windows:
1. Edita `test-webhook.bat`
2. Reemplaza `TU_PROJECT_ID` y `TU_FLOW_ID` con tus valores reales
3. Ejecuta: `test-webhook.bat`

#### Linux/Mac:
1. Edita `test-webhook.sh`
2. Reemplaza `TU_PROJECT_ID` y `TU_FLOW_ID` con tus valores reales
3. Ejecuta: `chmod +x test-webhook.sh && ./test-webhook.sh`

## ✅ Verificar que Funcionó

### 1. Revisar la Respuesta HTTP

**Antes de la corrección:**
- Código: `500`
- Mensaje: `{"error":"Internal server error","message":"headers is not defined"}`

**Después de la corrección:**
- Código: `200` (o el código que corresponda según el resultado)
- Mensaje: `{"success":true,"message":"Webhook processed and forwarded successfully",...}`

### 2. Verificar en el Historial

1. Ve a **Dashboard** → **Webhooks** (o `/dashboard/webhooks`)
2. Busca el webhook más reciente (debería aparecer en la parte superior)
3. Verifica que:
   - ✅ **Estado**: "Exitoso" (verde) o muestra el error real del destino (no "headers is not defined")
   - ✅ **Headers enviados**: Debería mostrar los headers correctamente
   - ✅ **Datos recibidos**: Debería mostrar el payload que enviaste
   - ✅ **Datos mapeados**: Debería mostrar los datos transformados

### 3. Verificar los Headers en el Historial

1. Haz clic en **"Ver detalles"** del webhook
2. Busca la sección **"Headers enviados"**
3. Debería mostrar algo como:
```json
{
  "Content-Type": "application/json"
}
```
O si el flujo tiene headers personalizados:
```json
{
  "Content-Type": "application/json",
  "X-Custom-Header": "valor"
}
```

## 🔍 Qué Buscar para Confirmar la Corrección

✅ **Éxito:**
- El webhook se guarda en el historial
- No aparece el error "headers is not defined"
- Los headers se muestran correctamente en el historial
- El webhook se procesa y reenvía al destino (si está configurado)

❌ **Si aún hay problemas:**
- Revisa los logs del servidor para ver el error específico
- Verifica que el flujo existe y está configurado correctamente
- Asegúrate de que el `userId`, `projectId` y `flowId` sean correctos

## 🐛 Debugging

Si necesitas ver más detalles:

1. **Revisa la consola del servidor** (donde ejecutas `npm run dev` o `next dev`)
2. Busca mensajes que empiecen con:
   - `Error processing webhook:`
   - `Error forwarding webhook:`
3. **Revisa los logs en producción** (si estás en Vercel, ve a Function Logs)

## 📝 Notas

- Si el webhook falla por otra razón (destino no disponible, error de mapeo, etc.), eso es normal y diferente al error que corregimos
- El error "headers is not defined" ya no debería aparecer
- El webhook siempre se guardará en el historial, incluso si falla el reenvío al destino

