#!/bin/bash

# Script para probar el webhook después de la corrección
# Reemplaza las variables con tus valores reales

# Configuración
BASE_URL="http://localhost:3000"  # Cambia si estás en producción
USER_ID="6f7022b0-f6c4-4d42-9d85-9355c69769b5"  # Tu userId del payload
PROJECT_ID="tu-project-id"  # Reemplaza con tu projectId real
FLOW_ID="tu-flow-id"  # Reemplaza con tu flowId real
SECRET_KEY=""  # Solo si tienes SECRET_KEY configurado

# Construir la URL del webhook
WEBHOOK_URL="${BASE_URL}/api/webhooks/${USER_ID}/${PROJECT_ID}/${FLOW_ID}"

# Payload de prueba (el mismo que mencionaste)
PAYLOAD='{
  "data": {
    "test": true,
    "evento": "cliente.created",
    "message": "Este es un webhook de prueba"
  },
  "event": "cliente.created",
  "tenantId": "6f7022b0-f6c4-4d42-9d85-9355c69769b5",
  "timestamp": "2025-12-09T19:02:17.369Z"
}'

echo "🚀 Enviando webhook a: ${WEBHOOK_URL}"
echo "📦 Payload:"
echo "${PAYLOAD}" | jq .
echo ""

# Si tienes SECRET_KEY, descomenta estas líneas y agrega el header
# HEADERS="-H 'Authorization: Bearer ${SECRET_KEY}'"

# Enviar la petición
if [ -z "$SECRET_KEY" ]; then
  RESPONSE=$(curl -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" \
    -w "\nHTTP_CODE:%{http_code}" \
    -s)
else
  RESPONSE=$(curl -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SECRET_KEY}" \
    -d "${PAYLOAD}" \
    -w "\nHTTP_CODE:%{http_code}" \
    -s)
fi

# Separar respuesta y código HTTP
HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*$//')

echo "📥 Respuesta:"
echo "${BODY}" | jq . 2>/dev/null || echo "${BODY}"
echo ""
echo "📊 Código HTTP: ${HTTP_CODE}"

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "✅ Webhook procesado exitosamente"
else
  echo "❌ Error en el webhook"
fi

