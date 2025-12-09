@echo off
REM Script para probar el webhook en Windows
REM Reemplaza las variables con tus valores reales

REM Configuración
set BASE_URL=http://localhost:3000
set USER_ID=6f7022b0-f6c4-4d42-9d85-9355c69769b5
set PROJECT_ID=tu-project-id
set FLOW_ID=tu-flow-id
set SECRET_KEY=

REM Construir la URL del webhook
set WEBHOOK_URL=%BASE_URL%/api/webhooks/%USER_ID%/%PROJECT_ID%/%FLOW_ID%

echo 🚀 Enviando webhook a: %WEBHOOK_URL%
echo.

REM Crear archivo temporal con el payload
echo {> payload.json
echo   "data": {>> payload.json
echo     "test": true,>> payload.json
echo     "evento": "cliente.created",>> payload.json
echo     "message": "Este es un webhook de prueba">> payload.json
echo   },>> payload.json
echo   "event": "cliente.created",>> payload.json
echo   "tenantId": "6f7022b0-f6c4-4d42-9d85-9355c69769b5",>> payload.json
echo   "timestamp": "2025-12-09T19:02:17.369Z">> payload.json
echo }>> payload.json

REM Enviar la petición
if "%SECRET_KEY%"=="" (
  curl -X POST "%WEBHOOK_URL%" ^
    -H "Content-Type: application/json" ^
    -d @payload.json ^
    -w "\nHTTP_CODE:%%{http_code}"
) else (
  curl -X POST "%WEBHOOK_URL%" ^
    -H "Content-Type: application/json" ^
    -H "Authorization: Bearer %SECRET_KEY%" ^
    -d @payload.json ^
    -w "\nHTTP_CODE:%%{http_code}"
)

REM Limpiar
del payload.json

echo.
echo ✅ Prueba completada. Revisa el dashboard en /dashboard/webhooks para ver el historial.

