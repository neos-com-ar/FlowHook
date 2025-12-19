import { NextResponse } from 'next/server';
import { getProjectFlows, getFlow, saveWebhook } from '@/lib/db';
import axios from 'axios';

export async function POST(request, { params }) {
  try {
    // En Next.js 14, params puede ser una Promise
    const resolvedParams = await params;
    const { userId, projectId, flowId } = resolvedParams;

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
    // Primero buscar en el proyecto específico
    let flow = null;
    if (projectId) {
      const projectFlows = await getProjectFlows(projectId);
      flow = projectFlows.find(f => f.id === flowId);
    }
    
    // Si no se encuentra en el proyecto, buscar en flujos antiguos sin proyecto (retrocompatibilidad)
    if (!flow) {
      flow = await getFlow(userId, flowId);
    }
    
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Obtener el body del webhook
    const body = await request.json();

    // Limpiar cache de acciones previas dinámicas para este request
    dynamicPrevActionCache.clear();

    // PASO 1: Si el flujo tiene endpoints previos, hacer las llamadas primero
    let prevData = {};
    
    // Soporte para múltiples endpoints previos (array) o uno solo (objeto) para retrocompatibilidad
    const prevEndpoints = Array.isArray(flow.erpEndpoints) 
      ? flow.erpEndpoints 
      : (flow.erpEndpoint ? [flow.erpEndpoint] : []);
    
    if (prevEndpoints.length > 0) {
      // Ejecutar todas las llamadas a endpoints previos (pueden ser en paralelo o secuencial)
      const prevPromises = prevEndpoints.map(async (prevEndpoint, index) => {
        if (!prevEndpoint.url) return null;
        
        // Declarar variables fuera del try para que estén disponibles en el catch
        let prevUrl = prevEndpoint.url;
        const prevMethod = (prevEndpoint.method || 'GET').toUpperCase();
        
        try {
          // Construir la URL del endpoint previo con posibles parámetros del webhook
          // Reemplazar placeholders en la URL con datos del webhook
          // Ejemplo: https://api.com/clientes/{{email}} -> https://api.com/clientes/juan@example.com
          // Para URLs, usar processUrlTemplate que no agrega comillas a los valores
          prevUrl = processUrlTemplate(prevUrl, body);
          
          // Construir el body para la llamada al endpoint previo si está configurado
          let prevRequestBody = {};
          let prevQueryParams = {};
          
          if (prevEndpoint.bodyMap && typeof prevEndpoint.bodyMap === 'object') {
            // Si hay bodyMap, usar esos mapeos
            for (const [prevKey, sourceKey] of Object.entries(prevEndpoint.bodyMap)) {
              if (sourceKey && sourceKey.trim() !== '') {
                if (sourceKey.startsWith('literal:')) {
                  const literalValue = processTemplate(sourceKey.substring(8).trim(), body);
                  // Para GET/DELETE, los literales van como query params si no están en la URL
                  if (['GET', 'DELETE'].includes(prevMethod)) {
                    prevQueryParams[prevKey] = literalValue;
                  } else {
                    prevRequestBody[prevKey] = literalValue;
                  }
                } else {
                  const value = getNestedValue(body, sourceKey);
                  if (value !== undefined) {
                    // Para GET/DELETE, los valores van como query params si no están en la URL
                    if (['GET', 'DELETE'].includes(prevMethod)) {
                      prevQueryParams[prevKey] = value;
                    } else {
                      prevRequestBody[prevKey] = value;
                    }
                  }
                }
              }
            }
          } else if (!['GET', 'DELETE'].includes(prevMethod)) {
            // Si no hay mapeo específico y no es GET/DELETE, enviar todo el body
            prevRequestBody = body;
          }
          // Para GET/DELETE sin bodyMap, no enviar nada (los parámetros deben estar en la URL)
          
          // Log para debugging
          console.log(`Llamando endpoint previo [${prevEndpoint.name || index}]:`, {
            method: prevMethod,
            url: prevUrl,
            hasBody: Object.keys(prevRequestBody).length > 0,
            hasQueryParams: Object.keys(prevQueryParams).length > 0,
          });
          
          // Realizar la llamada al endpoint previo
          const prevResponse = await axios({
            method: prevMethod.toLowerCase(),
            url: prevUrl,
            data: ['POST', 'PUT', 'PATCH'].includes(prevMethod) ? prevRequestBody : undefined,
            params: ['GET', 'DELETE'].includes(prevMethod) && Object.keys(prevQueryParams).length > 0 ? prevQueryParams : undefined,
            headers: prevEndpoint.headers || {
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          });
          
          // Retornar los datos con el nombre del endpoint (o índice si no tiene nombre)
          const endpointName = prevEndpoint.name || `endpoint${index + 1}`;
          return {
            name: endpointName,
            data: prevResponse.data || {},
          };
        } catch (prevError) {
          const endpointName = prevEndpoint.name || `endpoint${index + 1}`;
          const errorUrl = prevUrl || prevEndpoint.url || 'URL no disponible';
          const errorStatus = prevError.response?.status;
          const errorData = prevError.response?.data;
          
          console.error(`Error llamando al endpoint previo [${endpointName}]:`, {
            url: errorUrl,
            method: prevMethod,
            status: errorStatus,
            error: prevError.message,
            responseData: errorData,
          });
          
          // Si es requerido, lanzar el error para que se propague
          if (prevEndpoint.required) {
            throw {
              endpoint: endpointName,
              error: prevError,
              url: errorUrl,
            };
          }
          
          // Si no es requerido, retornar null para continuar sin estos datos
          return null;
        }
      });
      
      try {
        // Ejecutar todas las llamadas en paralelo
        const prevResults = await Promise.all(prevPromises);
        
        // Organizar los datos por nombre del endpoint
        prevResults.forEach((result) => {
          if (result && result.name) {
            prevData[result.name] = result.data;
          }
        });
        
        console.log('Datos obtenidos de endpoints previos:', prevData);
      } catch (prevError) {
        // Si algún endpoint requerido falló, devolver error
        if (prevError.endpoint) {
          const errorStatus = prevError.error.response?.status || 500;
          const errorData = prevError.error.response?.data;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData ? JSON.stringify(errorData) : prevError.error.message);
          
          console.error(`Error en endpoint previo requerido [${prevError.endpoint}]:`, {
            url: prevError.url,
            status: errorStatus,
            message: errorMessage,
          });
          
          return NextResponse.json(
            {
              error: `Failed to fetch data from previous endpoint: ${prevError.endpoint}`,
              message: errorMessage,
              url: prevError.url,
              status: errorStatus,
            },
            { status: errorStatus }
          );
        }
        throw prevError;
      }
    }
    
    // Combinar body del webhook con datos de endpoints previos para el mapeo
    // Estructurar datos para acceso con prefijo "data." (ej: data.estado)
    const combinedData = {
      data: body, // Los datos del webhook estarán disponibles como "data.campo"
      prev: prevData, // Los datos de endpoints previos estarán disponibles como "prev.nombreEndpoint.campo"
    };

    // PASO 2: Evaluar condiciones (después de las llamadas previas, antes del mapeo)
    if (flow.conditions && Array.isArray(flow.conditions) && flow.conditions.length > 0) {
      const conditionsPass = evaluateConditions(flow.conditions, combinedData);
      
      if (!conditionsPass) {
        const failureAction = flow.conditionFailureAction || 'error';
        
        if (failureAction === 'skip') {
          // Cancelar silenciosamente - guardar en historial y retornar éxito
          await saveWebhook(userId, flowId, {
            incomingData: body,
            prevData: Object.keys(prevData).length > 0 ? prevData : undefined,
            mappedData: null,
            result: {
              success: false,
              status: 200,
              error: 'Conditions not met - flow skipped',
              message: 'El flujo fue cancelado porque las condiciones no se cumplieron',
              responseTime: null,
            },
            flowName: flow.name,
            destino: flow.destino,
            method: flow.method || 'POST',
          });
          
          return NextResponse.json({
            success: false,
            message: 'Conditions not met - flow skipped',
            skipped: true,
          }, { status: 200 });
        } else {
          // Devolver error HTTP 400
          return NextResponse.json(
            {
              success: false,
              error: 'Conditions not met',
              message: 'Las condiciones configuradas no se cumplieron',
            },
            { status: 400 }
          );
        }
      }
    }

    // PASO 3: Aplicar el mapeo de datos (ahora puede incluir datos de endpoints previos)
    const mappedData = {};
    
    // Log para debugging: verificar que combinedData tiene los datos correctos
    console.log('🔍 [DEBUG] combinedData keys:', Object.keys(combinedData));
    console.log('🔍 [DEBUG] combinedData.data keys:', combinedData.data ? Object.keys(combinedData.data) : 'data is null/undefined');
    
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
          
          // Detectar si el literal contiene templates con índices de array [0] que deberían iterarse
          // Ejemplo: si contiene {{data.items[0].campo...}} y data.items es un array,
          // iterar sobre todos los elementos reemplazando [0] con [index]
          const arrayIndexPattern = /\{\{([^}]+)\[0\]([^}]*)\}\}/g;
          const matches = [...literalValue.matchAll(arrayIndexPattern)];
          
          if (matches.length > 0 && literalValue.trim().startsWith('[')) {
            // Extraer la ruta base del array del primer match
            // El patrón regex captura: {{rutaBase[0].resto}}
            // firstMatch[1] = rutaBase (ej: "data.data.items")
            // firstMatch[2] = resto después de [0] (ej: ".campo")
            const firstMatch = matches[0];
            const arrayBasePath = firstMatch[1].trim(); // Ya es la ruta base del array
            
            if (arrayBasePath) {
              const arrayValue = getNestedValue(combinedData, arrayBasePath);
              
              // Si encontramos un array, iterar sobre cada elemento
              if (Array.isArray(arrayValue) && arrayValue.length > 0) {
                try {
                  // Obtener prevEndpoints para acciones previas dinámicas
                  const prevEndpoints = Array.isArray(flow.erpEndpoints) 
                    ? flow.erpEndpoints 
                    : (flow.erpEndpoint ? [flow.erpEndpoint] : []);
                  
                  // Iterar sobre cada elemento del array fuente (ahora asíncrono)
                  const mappedArrayPromises = arrayValue.map(async (item, index) => {
                    // Reemplazar todos los [0] con el índice actual en el template
                    let itemTemplate = literalValue.replace(/\[0\]/g, `[${index}]`);
                    
                    console.log(`[Array iteration] Procesando elemento ${index} del array ${arrayBasePath}`);
                    console.log(`[Array iteration] Template después de reemplazar [0]:`, itemTemplate.substring(0, 200));
                    
                    // Procesar el template con el contexto actualizado (puede incluir acciones previas dinámicas)
                    const processedTemplate = await processTemplateAsync(itemTemplate, combinedData, prevEndpoints);
                    
                    console.log(`[Array iteration] Template procesado para elemento ${index}:`, processedTemplate.substring(0, 200));
                    
                    try {
                      const parsed = JSON.parse(processedTemplate);
                      // Si el template es un array con un objeto, tomar el primer elemento
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed[0];
                      }
                      return parsed;
                    } catch (e) {
                      console.warn(`Error parsing iterated template for ${destKey}[${index}]:`, e);
                      return null;
                    }
                  });
                  
                  // Esperar todas las promesas
                  const mappedArray = (await Promise.all(mappedArrayPromises)).filter(item => item !== null);
                  
                  if (mappedArray.length > 0) {
                    mappedData[destKey] = mappedArray;
                    continue; // Saltar al siguiente campo
                  }
                } catch (e) {
                  // Si falla la iteración, continuar con el procesamiento normal
                  console.warn(`Error iterating array for ${destKey}, using normal processing:`, e);
                }
              }
            }
          }
          
          // Procesar templates (reemplazar {{ruta}} con valores del webhook o endpoints previos)
          literalValue = processTemplate(literalValue, combinedData);
          
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
          
          // Soporte para mapeo de arrays completos: detectar si la ruta termina con [] o apunta a un array
          // Ejemplo: "data.items[]" o "data.items" cuando el valor es un array
          let isArrayMapping = false;
          let arraySourceKey = cleanSourceKey;
          
          // Detectar sintaxis especial para arrays: ruta[]
          if (cleanSourceKey.endsWith('[]')) {
            isArrayMapping = true;
            arraySourceKey = cleanSourceKey.slice(0, -2); // Remover el []
          }
          
          // Obtener el valor de la fuente
          let value = getNestedValue(combinedData, arraySourceKey);
          
          // Si el valor es un array y no se detectó explícitamente el mapeo de array,
          // pero el cleanSourceKey original no tenía [], verificar si debería ser array
          if (!isArrayMapping && Array.isArray(value)) {
            // Si el valor es un array, asignarlo directamente (mapeo automático de arrays)
            isArrayMapping = true;
          }
          
          // Log para debugging: verificar valores encontrados
          if (value === undefined) {
            console.log(`⚠️ [DEBUG] Valor no encontrado para ${destKey} desde ${cleanSourceKey}`);
            console.log(`   - combinedData tiene keys:`, Object.keys(combinedData));
            if (combinedData.data) {
              console.log(`   - combinedData.data tiene keys:`, Object.keys(combinedData.data));
            }
          } else {
            console.log(`✅ [DEBUG] Valor encontrado para ${destKey}:`, typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : value);
            if (isArrayMapping) {
              console.log(`📦 [DEBUG] Mapeo de array detectado para ${destKey}, elementos: ${Array.isArray(value) ? value.length : 0}`);
            }
          }
          
          if (value !== undefined) {
            // Si es mapeo de array, asignar el array completo
            if (isArrayMapping && Array.isArray(value)) {
              mappedData[destKey] = value;
            } else if (valueMapping && valueMapping[value] !== undefined) {
              // Aplicar mapeo de valores si existe
              mappedData[destKey] = valueMapping[value];
            } else {
              // Soporte para transformaciones: convertir a número si el destino lo requiere
              // Si el cleanSourceKey contiene "::number" o "::int", convertir a número
              if (cleanSourceKey.includes('::number') || cleanSourceKey.includes('::int')) {
                const finalSourceKey = cleanSourceKey.replace(/::(number|int)$/, '');
                value = getNestedValue(combinedData, finalSourceKey);
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
      // Si no hay mapeo, enviar todos los datos (incluyendo datos de endpoints previos si existen)
      Object.assign(mappedData, combinedData);
    }

    // Log para debugging: verificar mappedData resultante
    console.log('🔍 [DEBUG] mappedData keys:', Object.keys(mappedData));
    console.log('🔍 [DEBUG] mappedData sample:', JSON.stringify(mappedData).substring(0, 200));

    // Reenviar los datos al destino
    let webhookResult = {
      success: false,
      status: null,
      error: null,
      message: null,
      responseTime: null,
    };
    const startTime = Date.now();

    // Construir headers: combinar headers personalizados con Content-Type por defecto
    // Definir antes del try para que esté disponible en el catch
    const headers = {
      'Content-Type': 'application/json', // Por defecto
    };
    
    // Agregar headers personalizados del flujo (pueden sobrescribir Content-Type si se especifica)
    if (flow.headers && typeof flow.headers === 'object') {
      Object.assign(headers, flow.headers);
    }

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
        headers,
        timeout: 30000, // 30 segundos
      });

      const responseTime = Date.now() - startTime;
      webhookResult = {
        success: true,
        status: response.status,
        message: 'Webhook processed and forwarded successfully',
        responseTime,
        responseData: response.data || null, // Incluir la respuesta real del endpoint destino
      };

      // Ejecutar acciones post-respuesta si están configuradas
      const postResponseActionsResults = [];
      if (flow.postResponseActions && Array.isArray(flow.postResponseActions) && flow.postResponseActions.length > 0) {
        // Crear contexto de datos combinado para las acciones
        const actionContext = {
          response: response.data || {}, // Datos de la respuesta del endpoint destino
          data: body, // Datos originales del webhook
          prev: prevData, // Datos de endpoints previos
        };

        // Ejecutar acciones secuencialmente
        for (const action of flow.postResponseActions) {
          // Verificar si debe ejecutarse (solo en éxito o siempre)
          if (action.onlyOnSuccess !== false) {
            // Solo ejecutar si el destino fue exitoso (ya estamos en el bloque try, así que fue exitoso)
            try {
              const actionResult = await executePostResponseAction(action, actionContext);
              postResponseActionsResults.push(actionResult);
            } catch (actionError) {
              const errorResult = {
                name: action.name || 'unnamed',
                success: false,
                error: actionError.message,
                status: actionError.response?.status || 500,
                data: actionError.response?.data || null,
              };
              postResponseActionsResults.push(errorResult);
              
              // Si es requerida, registrar el error pero continuar
              if (action.required) {
                console.error(`Error en acción post-respuesta requerida [${action.name || 'unnamed'}]:`, actionError);
              }
            }
          }
        }
      }

      // Guardar el webhook en el historial
      await saveWebhook(userId, flowId, {
        incomingData: body,
        prevData: Object.keys(prevData).length > 0 ? prevData : undefined, // Incluir todos los datos de endpoints previos
        mappedData,
        headers, // Incluir los headers enviados
        result: webhookResult,
        postResponseActions: postResponseActionsResults.length > 0 ? postResponseActionsResults : undefined,
        flowName: flow.name,
        destino: flow.destino,
        method: flow.method || 'POST',
      });

      return NextResponse.json({
        success: true,
        message: 'Webhook processed and forwarded successfully',
        status: response.status,
        responseTime,
        data: mappedData,
        responseData: response.data || null, // Incluir la respuesta real del endpoint destino
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

      // Ejecutar acciones post-respuesta incluso si el destino falló (si están configuradas para ejecutarse siempre)
      const postResponseActionsResults = [];
      if (flow.postResponseActions && Array.isArray(flow.postResponseActions) && flow.postResponseActions.length > 0) {
        // Crear contexto de datos combinado para las acciones (sin response porque falló)
        const actionContext = {
          response: {}, // No hay respuesta porque falló
          data: body, // Datos originales del webhook
          prev: prevData, // Datos de endpoints previos
        };

        // Ejecutar acciones que no requieren éxito
        for (const action of flow.postResponseActions) {
          // Solo ejecutar si está configurada para ejecutarse siempre (onlyOnSuccess === false)
          if (action.onlyOnSuccess === false) {
            try {
              const actionResult = await executePostResponseAction(action, actionContext);
              postResponseActionsResults.push(actionResult);
            } catch (actionError) {
              const errorResult = {
                name: action.name || 'unnamed',
                success: false,
                error: actionError.message,
                status: actionError.response?.status || 500,
                data: actionError.response?.data || null,
              };
              postResponseActionsResults.push(errorResult);
              
              if (action.required) {
                console.error(`Error en acción post-respuesta requerida [${action.name || 'unnamed'}]:`, actionError);
              }
            }
          }
        }
      }

      // Guardar el webhook en el historial incluso si falló
      await saveWebhook(userId, flowId, {
        incomingData: body,
        prevData: Object.keys(prevData).length > 0 ? prevData : undefined,
        mappedData,
        headers, // Incluir los headers enviados
        result: webhookResult,
        postResponseActions: postResponseActionsResults.length > 0 ? postResponseActionsResults : undefined,
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
// Soporta índices de array usando la notación [0], [1], etc.
// Ejemplo: "data.items[0].campo"
function getNestedValue(obj, path) {
  if (!path || path.trim() === '') {
    return obj;
  }
  
  // Dividir la ruta considerando tanto puntos como índices de array
  // Patrón: captura nombres de propiedades y índices [número]
  const parts = [];
  let current = '';
  let i = 0;
  
  while (i < path.length) {
    if (path[i] === '[') {
      // Si hay contenido antes del '[', agregarlo como parte
      if (current.trim() !== '') {
        parts.push(current.trim());
        current = '';
      }
      // Buscar el índice dentro de los corchetes
      i++; // Saltar el '['
      let indexStr = '';
      while (i < path.length && path[i] !== ']') {
        indexStr += path[i];
        i++;
      }
      if (i < path.length && path[i] === ']') {
        i++; // Saltar el ']'
        const index = parseInt(indexStr.trim(), 10);
        if (!isNaN(index)) {
          parts.push(index);
        } else {
          // Si no es un número válido, tratar como propiedad
          parts.push(`[${indexStr}]`);
        }
      }
    } else if (path[i] === '.') {
      // Si hay contenido antes del punto, agregarlo
      if (current.trim() !== '') {
        parts.push(current.trim());
        current = '';
      }
      i++; // Saltar el punto
    } else {
      current += path[i];
      i++;
    }
  }
  
  // Agregar el último fragmento si existe
  if (current.trim() !== '') {
    parts.push(current.trim());
  }
  
  // Si no se encontraron partes, usar el path original dividido por puntos (retrocompatibilidad)
  if (parts.length === 0) {
    parts.push(...path.split('.'));
  }
  
  // Navegar por el objeto usando las partes
  let value = obj;
  
  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    
    // Si part es un número, es un índice de array
    if (typeof part === 'number') {
      if (Array.isArray(value)) {
        value = value[part];
      } else {
        return undefined;
      }
    } else {
      // Es una propiedad de objeto
      value = value[part];
    }
  }
  
  return value;
}

/**
 * Cache para almacenar resultados de acciones previas dinámicas
 * Evita llamadas duplicadas cuando el mismo parámetro se usa múltiples veces
 * Clave: `${endpointName}:${paramValue}`, Valor: resultado de la acción previa
 * 
 * Ejemplo: Si dos elementos del array tienen el mismo código de producto "EVEL.01",
 * solo se hará una llamada GET y ambos elementos usarán el resultado cacheado.
 */
const dynamicPrevActionCache = new Map();

/**
 * Ejecuta una acción previa dinámicamente con un valor específico como parámetro
 * 
 * Esta función permite ejecutar acciones previas durante la iteración de arrays,
 * donde cada elemento necesita obtener datos basados en valores específicos de ese elemento.
 * 
 * @param {string} endpointName - Nombre de la acción previa configurada (ej: "obtenerId")
 * @param {string} paramValue - Valor del parámetro a usar en la URL (ej: "ABC123")
 * @param {Array} prevEndpoints - Array de endpoints previos configurados
 * @param {Object} webhookData - Datos del webhook para resolver templates adicionales
 * @returns {Promise<any>} - Resultado de la acción previa (objeto completo de la respuesta)
 * 
 * @example
 * // Configuración de acción previa:
 * // - Nombre: "obtenerId"
 * // - URL: "https://api.ejemplo.com/items/{{codigo}}"
 * 
 * // Uso en mapeo:
 * // prev.obtenerId({{data.data.items[0].codigo}}).id
 * 
 * // Ejecución:
 * // executeDynamicPrevAction("obtenerId", "ABC123", prevEndpoints, webhookData)
 * // → GET https://api.ejemplo.com/items/ABC123
 * // → Retorna: {id: 198, nombre: "..."} (objeto completo de la respuesta)
 */
async function executeDynamicPrevAction(endpointName, paramValue, prevEndpoints, webhookData) {
  // Crear clave de cache
  const cacheKey = `${endpointName}:${paramValue}`;
  
  // Verificar cache
  if (dynamicPrevActionCache.has(cacheKey)) {
    console.log(`[Cache hit] Acción previa dinámica ${endpointName} con parámetro ${paramValue}`);
    return dynamicPrevActionCache.get(cacheKey);
  }
  
  // Buscar el endpoint previo por nombre
  const prevEndpoint = prevEndpoints.find(ep => {
    const epName = ep.name || `endpoint${prevEndpoints.indexOf(ep) + 1}`;
    return epName === endpointName;
  });
  
  if (!prevEndpoint) {
    console.warn(`Endpoint previo "${endpointName}" no encontrado`);
    return null;
  }
  
  try {
    // Construir la URL reemplazando el parámetro
    // El endpoint debe tener {{paramName}} en la URL, lo reemplazamos con el valor
    let prevUrl = prevEndpoint.url;
    
    // Reemplazar cualquier placeholder en la URL con el valor del parámetro
    // Si la URL tiene {{parametro}}, lo reemplazamos con paramValue
    prevUrl = prevUrl.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
      // Si el placeholder coincide con algún campo del webhook, usar ese valor
      // Si no, usar el paramValue directamente
      const webhookValue = getNestedValue(webhookData, placeholder.trim());
      if (webhookValue !== undefined && webhookValue !== null) {
        return encodeURIComponent(String(webhookValue));
      }
      // Usar el paramValue como fallback
      return encodeURIComponent(String(paramValue));
    });
    
    const prevMethod = (prevEndpoint.method || 'GET').toUpperCase();
    
    // Construir query params o body según el método
    let prevRequestBody = {};
    let prevQueryParams = {};
    
    if (prevEndpoint.bodyMap && typeof prevEndpoint.bodyMap === 'object') {
      for (const [prevKey, sourceKey] of Object.entries(prevEndpoint.bodyMap)) {
        if (sourceKey && sourceKey.trim() !== '') {
          if (sourceKey.startsWith('literal:')) {
            const literalValue = processTemplate(sourceKey.substring(8).trim(), webhookData);
            if (['GET', 'DELETE'].includes(prevMethod)) {
              prevQueryParams[prevKey] = literalValue;
            } else {
              prevRequestBody[prevKey] = literalValue;
            }
          } else {
            const value = getNestedValue(webhookData, sourceKey);
            if (value !== undefined) {
              if (['GET', 'DELETE'].includes(prevMethod)) {
                prevQueryParams[prevKey] = value;
              } else {
                prevRequestBody[prevKey] = value;
              }
            }
          }
        }
      }
    }
    
    // Realizar la llamada
    const prevResponse = await axios({
      method: prevMethod.toLowerCase(),
      url: prevUrl,
      data: ['POST', 'PUT', 'PATCH'].includes(prevMethod) ? prevRequestBody : undefined,
      params: ['GET', 'DELETE'].includes(prevMethod) && Object.keys(prevQueryParams).length > 0 ? prevQueryParams : undefined,
      headers: prevEndpoint.headers || {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    
    const responseData = prevResponse.data || {};
    
    // Retornar el objeto completo de la respuesta
    // El campo específico se extraerá cuando se use en el mapeo (ej: prev.obtenerId.id)
    // Si la respuesta es un valor primitivo (número o string), retornarlo directamente
    let result = responseData;
    if (typeof responseData === 'number' || typeof responseData === 'string') {
      result = responseData;
    }
    
    // Guardar en cache
    dynamicPrevActionCache.set(cacheKey, result);
    
    console.log(`[Cache miss] Acción previa dinámica ${endpointName} con parámetro ${paramValue} → ${result}`);
    
    return result;
  } catch (error) {
    console.error(`Error ejecutando acción previa dinámica ${endpointName} con parámetro ${paramValue}:`, error.message);
    // Si no es requerido, retornar null
    if (!prevEndpoint.required) {
      return null;
    }
    throw error;
  }
}

// Función para procesar templates en URLs (reemplaza {{ruta}} con valores del webhook)
// Esta versión NO agrega comillas a los valores, ya que son para URLs
function processUrlTemplate(template, webhookData) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    // Si el valor es undefined o null, usar cadena vacía
    if (value === undefined || value === null) {
      return '';
    }
    // Para URLs, siempre convertir a string
    const stringValue = String(value);
    // Codificar el valor para que sea seguro en una URL (solo codifica caracteres especiales)
    // Para valores simples como números, encodeURIComponent no los modifica
    return encodeURIComponent(stringValue);
  });
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

/**
 * Función auxiliar para encontrar el paréntesis de cierre correspondiente
 * Maneja correctamente paréntesis anidados y templates {{ }} dentro de los paréntesis
 * 
 * @param {string} str - String donde buscar
 * @param {startIndex} number - Índice donde comienza la búsqueda (después del paréntesis de apertura)
 * @returns {number} - Índice del paréntesis de cierre correspondiente, o -1 si no se encuentra
 * 
 * @example
 * findMatchingParenthesis("prev.codigo({{data.lineas[0].codigo}})", 15)
 * // Retorna: 40 (índice del paréntesis de cierre)
 */
function findMatchingParenthesis(str, startIndex) {
  let depth = 0;
  let braceDepth = 0; // Para contar niveles de {{ }}
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{' && i + 1 < str.length && str[i + 1] === '{') {
      braceDepth++;
      i++; // Saltar el segundo {
    } else if (str[i] === '}' && i + 1 < str.length && str[i + 1] === '}') {
      braceDepth--;
      i++; // Saltar el segundo }
    } else if (str[i] === '(' && braceDepth === 0) {
      depth++;
    } else if (str[i] === ')' && braceDepth === 0) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Función asíncrona para procesar templates que pueden incluir acciones previas dinámicas
 * 
 * Detecta y ejecuta sintaxis: prev.nombreEndpoint({{valor}})
 * 
 * Esta función permite usar acciones previas dentro de arrays literales, donde cada
 * elemento del array puede ejecutar una acción previa con valores específicos de ese elemento.
 * 
 * @param {string} template - Template a procesar (puede contener prev.nombreEndpoint({{valor}}))
 * @param {Object} webhookData - Datos del webhook y endpoints previos (combinedData)
 * @param {Array} prevEndpoints - Array de endpoints previos configurados
 * @returns {Promise<string>} - Template procesado con valores reemplazados
 * 
 * @example
 * // Template de entrada:
 * // "prev.obtenerId({{data.data.items[0].codigo}}).id"
 * 
 * // Procesamiento:
 * // 1. Detecta prev.obtenerId(...).id
 * // 2. Extrae el valor interno: "{{data.data.items[0].codigo}}"
 * // 3. Resuelve el valor: "ABC123"
 * // 4. Ejecuta executeDynamicPrevAction("obtenerId", "ABC123", ...)
 * // 5. Extrae el campo .id del resultado
 * // 6. Reemplaza con el valor extraído: "198"
 * 
 * // Template de salida:
 * // "198"
 * 
 * @example
 * // Uso en array literal:
 * // literal:[
 * //   {
 * //     "idItem": prev.obtenerId({{data.data.items[0].codigo}}).id,
 * //     "descripcion": "{{data.data.items[0].nombre}}"
 * //   }
 * // ]
 * 
 * // Para cada elemento del array (índice 0, 1, 2...):
 * // - Se reemplaza [0] con el índice actual
 * // - Se ejecuta la acción previa con el valor de ese elemento
 * // - Se extrae el campo especificado (ej: .id) del resultado
 */
async function processTemplateAsync(template, webhookData, prevEndpoints) {
  // Detectar y procesar prev.nombreEndpoint({{valor}})
  // Buscar todas las ocurrencias de prev.nombreEndpoint(
  const prevActionPattern = /prev\.([a-zA-Z0-9_]+)\(/g;
  const matches = [];
  let match;
  
  while ((match = prevActionPattern.exec(template)) !== null) {
    const startIndex = match.index;
    const endpointName = match[1];
    const openParenIndex = startIndex + match[0].length - 1; // Índice del (
    
    // Encontrar el paréntesis de cierre correspondiente
    const closeParenIndex = findMatchingParenthesis(template, openParenIndex);
    
    if (closeParenIndex !== -1) {
      // Extraer el contenido entre paréntesis
      const innerContent = template.substring(openParenIndex + 1, closeParenIndex);
      
      // Verificar si hay un campo después del paréntesis (ej: .id, .campo, .data.id)
      let fieldPath = null;
      let endIndex = closeParenIndex + 1;
      
      // Buscar patrón: .campo o .campo.campo después del paréntesis
      const fieldPattern = /^\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/;
      const afterParen = template.substring(closeParenIndex + 1);
      const fieldMatch = afterParen.match(fieldPattern);
      
      if (fieldMatch) {
        fieldPath = fieldMatch[1]; // ej: "id" o "data.id"
        endIndex = closeParenIndex + 1 + fieldMatch[0].length; // Incluir el .campo en el match completo
      }
      
      const fullMatch = template.substring(startIndex, endIndex);
      
      matches.push({
        fullMatch,
        endpointName,
        innerContent,
        fieldPath, // Campo a extraer del resultado (ej: "id", "data.id")
        startIndex,
        endIndex
      });
    }
  }
  
  if (matches.length === 0) {
    // No hay acciones previas dinámicas, usar processTemplate normal
    return processTemplate(template, webhookData);
  }
  
  // Procesar cada acción previa dinámica
  let processedTemplate = template;
  const promises = [];
  
  // Procesar en orden inverso para mantener los índices correctos al reemplazar
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const { fullMatch, endpointName, innerContent, fieldPath } = match;
    
    // Resolver el valor interno del template
    const paramValue = processTemplate(innerContent, webhookData);
    // Remover comillas si las tiene (JSON.stringify las agrega)
    const cleanParamValue = paramValue.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    
    console.log(`[Dynamic prev action] ${endpointName} - Valor del parámetro:`, cleanParamValue);
    console.log(`[Dynamic prev action] ${endpointName} - Campo a extraer:`, fieldPath || 'ninguno (objeto completo)');
    
    // Ejecutar la acción previa dinámicamente
    const promise = executeDynamicPrevAction(endpointName, cleanParamValue, prevEndpoints, webhookData)
      .then(result => {
        // Si hay un campo especificado (ej: .id), extraerlo del resultado
        let finalResult = result;
        if (fieldPath && result !== null && result !== undefined) {
          if (typeof result === 'object') {
            finalResult = getNestedValue(result, fieldPath);
            if (finalResult === undefined) {
              console.warn(`[Dynamic prev action] ${endpointName} - Campo "${fieldPath}" no encontrado en la respuesta:`, result);
              finalResult = null;
            } else {
              console.log(`[Dynamic prev action] ${endpointName} - Campo "${fieldPath}" extraído:`, finalResult);
            }
          } else {
            // Si el resultado no es un objeto, no se puede extraer un campo
            console.warn(`[Dynamic prev action] ${endpointName} - No se puede extraer campo "${fieldPath}" de un valor primitivo:`, result);
            finalResult = null;
          }
        } else {
          console.log(`[Dynamic prev action] ${endpointName} - Retornando resultado completo:`, result);
        }
        
        // Reemplazar en el template
        let replacement;
        if (finalResult === null || finalResult === undefined) {
          replacement = 'null';
        } else if (typeof finalResult === 'object') {
          replacement = JSON.stringify(finalResult);
        } else if (typeof finalResult === 'string') {
          replacement = JSON.stringify(finalResult);
        } else {
          replacement = String(finalResult);
        }
        return { fullMatch, replacement };
      })
      .catch(error => {
        console.error(`Error procesando acción previa dinámica ${endpointName}:`, error);
        return { fullMatch, replacement: 'null' };
      });
    
    promises.push(promise);
  }
  
  // Esperar todas las acciones previas
  const replacements = await Promise.all(promises);
  
  // Aplicar los reemplazos (en orden inverso para mantener índices)
  for (const { fullMatch, replacement } of replacements) {
    processedTemplate = processedTemplate.replace(fullMatch, replacement);
  }
  
  // Procesar el resto del template normalmente
  return processTemplate(processedTemplate, webhookData);
}

// Función para evaluar condiciones
function evaluateConditions(conditions, data) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return true; // Si no hay condiciones, se considera que pasan
  }

  // Filtrar solo condiciones válidas
  const validConditions = conditions.filter(
    (condition) => condition.field && condition.operator
  );

  if (validConditions.length === 0) {
    return true;
  }

  // Evaluar cada condición
  const conditionResults = validConditions.map((condition) => {
    const fieldValue = getNestedValue(data, condition.field);

    switch (condition.operator) {
      case 'equals':
        // Comparar como string o número según el tipo del valor
        const equalsValue = condition.value;
        if (typeof fieldValue === 'number' || !isNaN(equalsValue)) {
          return Number(fieldValue) === Number(equalsValue);
        }
        return String(fieldValue) === String(equalsValue);

      case 'notEquals':
        const notEqualsValue = condition.value;
        if (typeof fieldValue === 'number' || !isNaN(notEqualsValue)) {
          return Number(fieldValue) !== Number(notEqualsValue);
        }
        return String(fieldValue) !== String(notEqualsValue);

      case 'greaterThan':
        return Number(fieldValue) > Number(condition.value);

      case 'lessThan':
        return Number(fieldValue) < Number(condition.value);

      case 'contains':
        return String(fieldValue).includes(String(condition.value));

      case 'startsWith':
        return String(fieldValue).startsWith(String(condition.value));

      case 'endsWith':
        return String(fieldValue).endsWith(String(condition.value));

      case 'isEmpty':
        return fieldValue === undefined || fieldValue === null || fieldValue === '' ||
               (Array.isArray(fieldValue) && fieldValue.length === 0) ||
               (typeof fieldValue === 'object' && Object.keys(fieldValue).length === 0);

      case 'isNotEmpty':
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' &&
               !(Array.isArray(fieldValue) && fieldValue.length === 0) &&
               !(typeof fieldValue === 'object' && Object.keys(fieldValue).length === 0);

      default:
        console.warn(`Operador desconocido: ${condition.operator}`);
        return false;
    }
  });

  // Aplicar operadores lógicos
  let result = conditionResults[0];
  
  for (let i = 1; i < conditionResults.length; i++) {
    const logicalOperator = validConditions[i].logicalOperator || 'AND';
    
    if (logicalOperator === 'OR') {
      result = result || conditionResults[i];
    } else {
      // AND por defecto
      result = result && conditionResults[i];
    }
  }

  return result;
}

// Función para ejecutar una acción post-respuesta
async function executePostResponseAction(action, context) {
  // Construir la URL con templates
  let actionUrl = action.url;
  actionUrl = processUrlTemplate(actionUrl, context);
  
  // Construir el body o query params según el método
  const method = (action.method || 'POST').toUpperCase();
  let requestBody = {};
  let queryParams = {};
  
  if (action.bodyMap && typeof action.bodyMap === 'object') {
    // Si hay bodyMap, usar esos mapeos
    for (const [actionKey, sourceKey] of Object.entries(action.bodyMap)) {
      if (sourceKey && sourceKey.trim() !== '') {
        if (sourceKey.startsWith('literal:')) {
          // Extraer el valor literal (todo después de "literal:")
          let literalValue = sourceKey.substring(8).trim();
          
          // Procesar templates (reemplazar {{ruta}} con valores del contexto)
          literalValue = processTemplate(literalValue, context);
          
          // Intentar parsear como JSON, si falla usar como string
          let parsedValue;
          try {
            // Si el valor parece un JSON (objeto o array), parsearlo
            if ((literalValue.startsWith('{') && literalValue.endsWith('}')) ||
                (literalValue.startsWith('[') && literalValue.endsWith(']'))) {
              parsedValue = JSON.parse(literalValue);
            } else if (literalValue === 'true' || literalValue === 'false') {
              // Valores booleanos
              parsedValue = literalValue === 'true';
            } else if (literalValue === 'null') {
              // Valor null
              parsedValue = null;
            } else if (!isNaN(literalValue) && literalValue.trim() !== '') {
              // Números
              parsedValue = Number(literalValue);
            } else {
              // Strings - remover comillas si están presentes
              if ((literalValue.startsWith('"') && literalValue.endsWith('"')) ||
                  (literalValue.startsWith("'") && literalValue.endsWith("'"))) {
                parsedValue = literalValue.slice(1, -1);
              } else {
                parsedValue = literalValue;
              }
            }
          } catch (parseError) {
            // Si falla el parsing, usar el valor como string
            console.warn(`Error parsing literal value for ${actionKey}:`, parseError);
            parsedValue = literalValue;
          }
          
          // Para GET/DELETE, los literales van como query params si no están en la URL
          if (['GET', 'DELETE'].includes(method)) {
            queryParams[actionKey] = parsedValue;
          } else {
            requestBody[actionKey] = parsedValue;
          }
        } else {
          const value = getNestedValue(context, sourceKey);
          if (value !== undefined) {
            // Para GET/DELETE, los valores van como query params si no están en la URL
            if (['GET', 'DELETE'].includes(method)) {
              queryParams[actionKey] = value;
            } else {
              requestBody[actionKey] = value;
            }
          }
        }
      }
    }
  } else if (!['GET', 'DELETE'].includes(method)) {
    // Si no hay mapeo específico y no es GET/DELETE, no enviar body por defecto
    // (las acciones deben tener bodyMap explícito)
  }
  
  // Construir headers
  const headers = {
    'Content-Type': 'application/json',
  };
  if (action.headers && typeof action.headers === 'object') {
    Object.assign(headers, action.headers);
  }
  
  // Realizar la petición
  const response = await axios({
    method: method.toLowerCase(),
    url: actionUrl,
    data: ['POST', 'PUT', 'PATCH'].includes(method) && Object.keys(requestBody).length > 0 ? requestBody : undefined,
    params: ['GET', 'DELETE'].includes(method) && Object.keys(queryParams).length > 0 ? queryParams : undefined,
    headers,
    timeout: 30000,
  });
  
  return {
    name: action.name || 'unnamed',
    success: true,
    status: response.status,
    data: response.data || null,
  };
}

// Solo permitir método POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}


