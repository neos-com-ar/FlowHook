import { NextResponse } from 'next/server';
import { getFlow, saveWebhook } from '@/lib/db';
import axios from 'axios';

export async function POST(request, { params }) {
  let body = {};
  let userId = null;
  let flowId = null;
  let flow = null;

  try {
    // En Next.js 14, params puede ser una Promise
    const resolvedParams = await params;
    userId = resolvedParams.userId;
    flowId = resolvedParams.flowId;

    // Validar SECRET_KEY si está configurado
    if (process.env.SECRET_KEY) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized: Missing or invalid Authorization header' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      if (token !== process.env.SECRET_KEY) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 401 }
        );
      }
    }

    // Validar tamaño del body (max 1MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large. Maximum size is 1MB' },
        { status: 413 }
      );
    }

    // Obtener el flujo de configuración
    flow = await getFlow(userId, flowId);
    
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Obtener el body del webhook
    body = await request.json();

    // Aplicar el mapeo de datos
    const mappedData = {};
    if (flow.map && typeof flow.map === 'object') {
      for (const [destKey, sourceKey] of Object.entries(flow.map)) {
        // Si el sourceKey está vacío o es solo un punto, omitir este campo
        if (!sourceKey || sourceKey.trim() === '' || sourceKey.trim() === '.') {
          continue;
        }
        
        // Soporte para valores literales usando el prefijo "literal:"
        if (typeof sourceKey === 'string' && sourceKey.startsWith('literal:')) {
          // Extraer el valor literal (todo después de "literal:")
          let literalValue = sourceKey.substring(8).trim();
          
          // Procesar templates (reemplazar {{ruta}} con valores del webhook)
          literalValue = processTemplate(literalValue, body);
          
          // Intentar parsear como JSON, si falla usar como string
          try {
            // Si el valor parece un JSON (objeto o array), parsearlo
            if ((literalValue.startsWith('{') && literalValue.endsWith('}')) ||
                (literalValue.startsWith('[') && literalValue.endsWith(']'))) {
              mappedData[destKey] = JSON.parse(literalValue);
            } else if (literalValue === 'true' || literalValue === 'false') {
              // Valores booleanos
              mappedData[destKey] = literalValue === 'true';
            } else if (literalValue === 'null') {
              // Valor null
              mappedData[destKey] = null;
            } else if (!isNaN(literalValue) && literalValue.trim() !== '') {
              // Números
              mappedData[destKey] = Number(literalValue);
            } else {
              // Strings - remover comillas si están presentes
              if ((literalValue.startsWith('"') && literalValue.endsWith('"')) ||
                  (literalValue.startsWith("'") && literalValue.endsWith("'"))) {
                mappedData[destKey] = literalValue.slice(1, -1);
              } else {
                mappedData[destKey] = literalValue;
              }
            }
          } catch (parseError) {
            // Si falla el parsing, usar el valor como string
            console.warn(`Error parsing literal value for ${destKey}:`, parseError);
            mappedData[destKey] = literalValue;
          }
        } else {
          // Soporte para mapeos de valores: "valor::map{key1:value1,key2:value2}"
          // Ejemplo: "data.categoria::map{OBR:1,PRO:2}" convertirá "OBR" a 1, "PRO" a 2
          let valueMapping = null;
          let cleanSourceKey = sourceKey;
          if (sourceKey.includes('::map{') && sourceKey.endsWith('}')) {
            const mapMatch = sourceKey.match(/::map\{([^}]+)\}$/);
            if (mapMatch) {
              cleanSourceKey = sourceKey.replace(/::map\{[^}]+\}$/, '');
              try {
                // Parsear el mapeo: "OBR:1,PRO:2" -> {OBR: 1, PRO: 2}
                const mapString = mapMatch[1];
                valueMapping = {};
                mapString.split(',').forEach(pair => {
                  const [key, val] = pair.split(':').map(s => s.trim());
                  if (key && val) {
                    // Intentar convertir el valor a número, si no, mantener como string
                    const numVal = Number(val);
                    valueMapping[key] = isNaN(numVal) ? val : numVal;
                  }
                });
              } catch (e) {
                console.warn(`Error parsing value mapping for ${destKey}:`, e);
              }
            }
          }
          
          // Soporte para rutas anidadas con notación de punto
          let value = getNestedValue(body, cleanSourceKey);
          if (value !== undefined) {
            // Aplicar mapeo de valores si existe
            if (valueMapping && valueMapping[value] !== undefined) {
              mappedData[destKey] = valueMapping[value];
            } else {
              // Soporte para transformaciones: convertir a número si el destino lo requiere
              // Si el cleanSourceKey contiene "::number" o "::int", convertir a número
              if (cleanSourceKey.includes('::number') || cleanSourceKey.includes('::int')) {
                const finalSourceKey = cleanSourceKey.replace(/::(number|int)$/, '');
                value = getNestedValue(body, finalSourceKey);
                if (value !== undefined) {
                  const numValue = Number(value);
                  if (!isNaN(numValue)) {
                    mappedData[destKey] = numValue;
                  } else {
                    mappedData[destKey] = value; // Mantener original si no se puede convertir
                  }
                }
              } else {
                mappedData[destKey] = value;
              }
            }
          }
        }
      }
    } else {
      // Si no hay mapeo, enviar todos los datos
      Object.assign(mappedData, body);
    }

    // Reenviar los datos al destino
    let webhookResult = {
      success: false,
      status: null,
      error: null,
      message: null,
      responseTime: null,
    };
    const startTime = Date.now();

    try {
      // Obtener el método HTTP del flujo (default POST para retrocompatibilidad)
      const httpMethod = (flow.method || 'POST').toUpperCase();
      
      // Validar que el método sea uno de los permitidos
      const allowedMethods = ['POST', 'PUT', 'PATCH'];
      const method = allowedMethods.includes(httpMethod) ? httpMethod.toLowerCase() : 'post';
      
      // Realizar la petición con el método seleccionado
      const response = await axios({
        method: method,
        url: flow.destino,
        data: mappedData,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 segundos
      });

      const responseTime = Date.now() - startTime;
      webhookResult = {
        success: true,
        status: response.status,
        message: 'Webhook processed and forwarded successfully',
        responseTime,
      };

      // Guardar el webhook en el historial
      await saveWebhook(userId, flowId, {
        incomingData: body,
        mappedData,
        result: webhookResult,
        flowName: flow.name,
        destino: flow.destino,
        method: flow.method || 'POST',
      });

      return NextResponse.json({
        success: true,
        message: 'Webhook processed and forwarded successfully',
        status: response.status,
        data: mappedData,
      });
    } catch (error) {
      console.error('Error forwarding webhook:', error);
      const responseTime = Date.now() - startTime;
      
      // Obtener el status del error (si existe) o usar 500 como fallback
      const errorStatus = error.response?.status || 500;
      
      // Obtener información detallada del error
      const errorMessage = error.response?.data 
        ? (typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data))
        : error.message;
      
      webhookResult = {
        success: false,
        status: errorStatus,
        error: 'Failed to forward webhook to destination',
        message: errorMessage || error.message,
        responseTime,
      };

      // Guardar el webhook en el historial incluso si falló
      await saveWebhook(userId, flowId, {
        incomingData: body,
        mappedData,
        result: webhookResult,
        flowName: flow.name,
        destino: flow.destino,
        method: flow.method || 'POST',
      });
      
      // Devolver el status real del error, no siempre 500
      return NextResponse.json(
        {
          success: false,
          status: errorStatus,
          error: 'Failed to forward webhook to destination',
          message: errorMessage || error.message,
          responseTime,
        },
        { status: errorStatus >= 400 && errorStatus < 600 ? errorStatus : 500 }
      );
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Intentar guardar el error en el historial si tenemos userId, flowId y flow
    if (userId && flowId && flow) {
      try {
        await saveWebhook(userId, flowId, {
          incomingData: body || {},
          mappedData: {},
          result: {
            success: false,
            status: 500,
            error: 'Internal server error',
            message: error.message,
          },
          flowName: flow.name,
          destino: flow.destino || '',
          method: flow.method || 'POST',
        });
      } catch (saveError) {
        console.error('Error saving webhook error:', saveError);
      }
    }
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Función auxiliar para obtener valores anidados
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }
  
  return value;
}

// Función para procesar templates en strings JSON (reemplaza {{ruta}} con valores del webhook)
function processTemplate(template, webhookData) {
  // Primero, reemplazar placeholders que están entre comillas: "{{ruta}}"
  // Estos se tratan como strings
  let result = template.replace(/"\{\{([^}]+)\}\}"/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    // Si el valor es undefined o null, usar cadena vacía
    if (value === undefined || value === null) {
      return '""';
    }
    // Para strings, escapar correctamente y mantener las comillas del template
    if (typeof value === 'string') {
      // Escapar el string para JSON (maneja comillas, saltos de línea, etc.)
      const escaped = JSON.stringify(value);
      return escaped; // JSON.stringify ya incluye las comillas
    }
    // Para otros tipos, convertirlos a string JSON (incluye comillas)
    return JSON.stringify(value);
  });
  
  // Luego, reemplazar placeholders que NO están entre comillas: {{ruta}}
  // Estos pueden ser cualquier tipo de valor JSON
  result = result.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    // Si el valor es undefined o null, usar null
    if (value === undefined || value === null) {
      return 'null';
    }
    // Si es un objeto o array, convertir a JSON (sin comillas externas adicionales)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    // Para strings sin comillas en el template, usar JSON.stringify (que agregará comillas)
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    // Para números, booleanos, etc., usar directamente (sin comillas)
    return String(value);
  });
  
  return result;
}

// Solo permitir método POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}

