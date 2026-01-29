import axios from 'axios';

// =============================================================================
// Helper compartido para ejecutar webhooks (flujos)
// =============================================================================

/**
 * Ejecuta un webhook de flujo y devuelve:
 * - webhookRecord: datos listos para guardar en historial
 * - webhookResult: resumen del resultado (éxito / error)
 *
 * Esta función NO persiste nada ni conoce de HTTP; sólo ejecuta la lógica
 * de integración con el destino y acciones previas / posteriores.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {Object} params.flow        Configuración completa del flujo
 * @param {string} params.flowId
 * @param {Object} params.incomingData Payload recibido (webhook original o modificado)
 * @param {'new'|'retry'} params.mode
 * @param {Object|null} params.originalWebhook Webhook anterior (para retry)
 * @param {boolean} params.manual     true si el disparo es manual (reintento)
 */
export async function executeWebhook({
  userId,
  flow,
  flowId,
  incomingData,
  mode = 'new',
  originalWebhook = null,
  manual = false,
}) {
  // ---------------------------------------------------------------------------
  // PASO 1: Endpoints previos (ERP / integraciones anteriores)
  // ---------------------------------------------------------------------------
  dynamicPrevActionCache.clear();

  let prevData = {};

  const prevEndpoints = Array.isArray(flow.erpEndpoints)
    ? flow.erpEndpoints
    : flow.erpEndpoint
    ? [flow.erpEndpoint]
    : [];

  if (prevEndpoints.length > 0) {
    const prevPromises = prevEndpoints.map(async (prevEndpoint, index) => {
      if (!prevEndpoint.url) return null;

      let prevUrl = prevEndpoint.url;
      const prevMethod = (prevEndpoint.method || 'GET').toUpperCase();

      try {
        // Construir URL con templates
        prevUrl = processUrlTemplate(prevUrl, incomingData);

        let prevRequestBody = {};
        let prevQueryParams = {};

        if (prevEndpoint.bodyMap && typeof prevEndpoint.bodyMap === 'object') {
          for (const [prevKey, sourceKey] of Object.entries(
            prevEndpoint.bodyMap,
          )) {
            if (sourceKey && sourceKey.trim() !== '') {
              if (sourceKey.startsWith('literal:')) {
                const literalValue = processTemplate(
                  sourceKey.substring(8).trim(),
                  incomingData,
                );
                if (['GET', 'DELETE'].includes(prevMethod)) {
                  prevQueryParams[prevKey] = literalValue;
                } else {
                  prevRequestBody[prevKey] = literalValue;
                }
              } else {
                const value = getNestedValue(incomingData, sourceKey);
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
        } else if (!['GET', 'DELETE'].includes(prevMethod)) {
          // Si no hay bodyMap y no es GET/DELETE, mandar todo el body del webhook
          prevRequestBody = incomingData;
        }

        const prevResponse = await axios({
          method: prevMethod.toLowerCase(),
          url: prevUrl,
          data: ['POST', 'PUT', 'PATCH'].includes(prevMethod)
            ? prevRequestBody
            : undefined,
          params:
            ['GET', 'DELETE'].includes(prevMethod) &&
            Object.keys(prevQueryParams).length > 0
              ? prevQueryParams
              : undefined,
          headers: prevEndpoint.headers || {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        });

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

        if (prevEndpoint.required) {
          const error = new Error(
            `Failed to fetch data from previous endpoint: ${endpointName}`,
          );
          error.__flowType = 'prevEndpointRequired';
          error.endpoint = endpointName;
          error.url = errorUrl;
          error.status = errorStatus || 500;
          error.responseData = errorData;
          throw error;
        }

        return null;
      }
    });

    const prevResults = await Promise.all(prevPromises);
    prevResults.forEach((result) => {
      if (result && result.name) {
        prevData[result.name] = result.data;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // PASO 2: Condiciones
  // ---------------------------------------------------------------------------
  const combinedData = {
    data: incomingData,
    prev: prevData,
  };

  if (
    flow.conditions &&
    Array.isArray(flow.conditions) &&
    flow.conditions.length > 0
  ) {
    const conditionsPass = evaluateConditions(flow.conditions, combinedData);

    if (!conditionsPass) {
      const failureAction = flow.conditionFailureAction || 'error';

      if (failureAction === 'skip') {
        const webhookResult = {
          success: false,
          status: 200,
          error: 'Conditions not met - flow skipped',
          message: 'El flujo fue cancelado porque las condiciones no se cumplieron',
          responseTime: null,
        };

        const webhookRecord = buildBaseWebhookRecord({
          flow,
          flowId,
          incomingData,
          prevData,
          mappedData: null,
          headers: null,
          result: webhookResult,
          manual,
          mode,
          originalWebhook,
        });

        return {
          webhookRecord,
          webhookResult,
        };
      } else {
        const error = new Error('Conditions not met');
        error.__flowType = 'conditionsFailed';
        error.status = 400;
        throw error;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PASO 3: Mapeo de datos
  // ---------------------------------------------------------------------------
  const mappedData = {};

  if (flow.map && typeof flow.map === 'object') {
    // Reutilizamos la lógica avanzada de mapeo del archivo original
    // Ahora soporta también expresiones dinámicas prev.* dentro de literales
    await applyMapping(flow.map, combinedData, mappedData, flow, prevEndpoints);
  } else {
    Object.assign(mappedData, combinedData);
  }

  // ---------------------------------------------------------------------------
  // PASO 4: Reenvío al destino + acciones post-respuesta
  // ---------------------------------------------------------------------------
  let webhookResult = {
    success: false,
    status: null,
    error: null,
    message: null,
    responseTime: null,
  };

  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
  };

  if (flow.headers && typeof flow.headers === 'object') {
    Object.assign(headers, flow.headers);
  }

  try {
    const httpMethod = (flow.method || 'POST').toUpperCase();
    const allowedMethods = ['POST', 'PUT', 'PATCH'];
    const method = allowedMethods.includes(httpMethod)
      ? httpMethod.toLowerCase()
      : 'post';

    const response = await axios({
      method,
      url: flow.destino,
      data: mappedData,
      headers,
      timeout: 30000,
    });

    const responseTime = Date.now() - startTime;
    webhookResult = {
      success: true,
      status: response.status,
      message: 'Webhook processed and forwarded successfully',
      responseTime,
      responseData: response.data || null,
    };

    const postResponseActionsResults = [];
    if (
      flow.postResponseActions &&
      Array.isArray(flow.postResponseActions) &&
      flow.postResponseActions.length > 0
    ) {
      const actionContext = {
        response: response.data || {},
        data: incomingData,
        prev: prevData,
      };

      for (const action of flow.postResponseActions) {
        if (action.onlyOnSuccess !== false) {
          try {
            const actionResult = await executePostResponseAction(
              action,
              actionContext,
            );
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
              console.error(
                `Error en acción post-respuesta requerida [${action.name || 'unnamed'}]:`,
                actionError,
              );
            }
          }
        }
      }
    }

    const webhookRecord = buildBaseWebhookRecord({
      flow,
      flowId,
      incomingData,
      prevData,
      mappedData,
      headers,
      result: webhookResult,
      postResponseActions: undefined, // Por ahora no devolvemos acciones post-respuesta detalladas
      manual,
      mode,
      originalWebhook,
    });

    return {
      webhookRecord,
      webhookResult,
    };
  } catch (error) {
    console.error('Error forwarding webhook:', error);
    const responseTime = Date.now() - startTime;

    const errorStatus = error.response?.status || 500;
    const errorMessage = error.response?.data
      ? typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data)
      : error.message;

    webhookResult = {
      success: false,
      status: errorStatus,
      error: 'Failed to forward webhook to destination',
      message: errorMessage || error.message,
      responseTime,
    };

    const webhookRecord = buildBaseWebhookRecord({
      flow,
      flowId,
      incomingData,
      prevData,
      mappedData,
      headers,
      result: webhookResult,
      manual,
      mode,
      originalWebhook,
    });

    return {
      webhookRecord,
      webhookResult,
    };
  }
}

// Construye el objeto base de webhook listo para guardar en historial
function buildBaseWebhookRecord({
  flow,
  flowId,
  incomingData,
  prevData,
  mappedData,
  headers,
  result,
  postResponseActions,
  manual,
  mode,
  originalWebhook,
}) {
  const base = {
    incomingData,
    prevData:
      prevData && Object.keys(prevData).length > 0 ? prevData : undefined,
    mappedData,
    headers,
    result,
    postResponseActions,
    flowName: flow.name,
    destino: flow.destino,
    method: flow.method || 'POST',
  };

  // Metadatos de reintento manual
  if (mode === 'retry') {
    const previousRetryCount = originalWebhook?.retryCount || 0;
    return {
      ...originalWebhook,
      ...base,
      manualRetry: manual === true,
      retryCount: previousRetryCount + 1,
      lastRetryAt: new Date().toISOString(),
    };
  }

  // Ejecución normal: no tocar campos extra
  return base;
}

// =============================================================================
// Helpers compartidos (copiados del endpoint original)
// =============================================================================

// Función auxiliar para obtener valores anidados
// Soporta índices de array usando la notación [0], [1], etc.
// Ejemplo: "data.items[0].campo"
function getNestedValue(obj, path) {
  if (!path || path.trim() === '') {
    return obj;
  }

  const parts = [];
  let current = '';
  let i = 0;

  while (i < path.length) {
    if (path[i] === '[') {
      if (current.trim() !== '') {
        parts.push(current.trim());
        current = '';
      }
      i++;
      let indexStr = '';
      while (i < path.length && path[i] !== ']') {
        indexStr += path[i];
        i++;
      }
      if (i < path.length && path[i] === ']') {
        i++;
        const index = parseInt(indexStr.trim(), 10);
        if (!isNaN(index)) {
          parts.push(index);
        } else {
          parts.push(`[${indexStr}]`);
        }
      }
    } else if (path[i] === '.') {
      if (current.trim() !== '') {
        parts.push(current.trim());
        current = '';
      }
      i++;
    } else {
      current += path[i];
      i++;
    }
  }

  if (current.trim() !== '') {
    parts.push(current.trim());
  }

  if (parts.length === 0) {
    parts.push(...path.split('.'));
  }

  let value = obj;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof part === 'number') {
      if (Array.isArray(value)) {
        value = value[part];
      } else {
        return undefined;
      }
    } else {
      value = value[part];
    }
  }

  return value;
}

// Analiza una clave de mapeo con sufijos encadenados y devuelve
// la ruta base y las transformaciones a aplicar.
function parseSourceKey(sourceKey) {
  let cleanKey = sourceKey || '';

  const result = {
    baseKey: cleanKey,
    isArrayMapping: false,
    mapSpec: null,
    toNumber: false,
    toInt: false,
    transforms: [],
  };

  if (typeof cleanKey !== 'string') {
    return result;
  }

  if (cleanKey.includes('::map{') && cleanKey.endsWith('}')) {
    const mapMatch = cleanKey.match(/::map\{([^}]+)\}$/);
    if (mapMatch) {
      const mapString = mapMatch[1];
      cleanKey = cleanKey.replace(/::map\{[^}]+\}$/, '');
      try {
        const valueMapping = {};
        mapString.split(',').forEach((pair) => {
          const [key, val] = pair.split(':').map((s) => s.trim());
          if (key && val) {
            const numVal = Number(val);
            valueMapping[key] = Number.isNaN(numVal) ? val : numVal;
          }
        });
        result.mapSpec = valueMapping;
      } catch (e) {
        console.warn(`Error parsing value mapping for ${sourceKey}:`, e);
      }
    }
  }

  if (cleanKey.endsWith('::number') || cleanKey.endsWith('::int')) {
    if (cleanKey.endsWith('::number')) {
      result.toNumber = true;
      cleanKey = cleanKey.replace(/::number$/, '');
    } else if (cleanKey.endsWith('::int')) {
      result.toInt = true;
      cleanKey = cleanKey.replace(/::int$/, '');
    }
  }

  if (cleanKey.endsWith('[]')) {
    result.isArrayMapping = true;
    cleanKey = cleanKey.slice(0, -2);
  }

  const parts = cleanKey.split('::');
  const basePath = parts[0] ? parts[0].trim() : '';
  const suffixes = parts.slice(1);

  result.baseKey = basePath || cleanKey;

  suffixes.forEach((suffix) => {
    const trimmed = suffix.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === 'trim') {
      result.transforms.push({ type: 'trim' });
      return;
    }

    if (trimmed === 'ltrim') {
      result.transforms.push({ type: 'ltrim' });
      return;
    }

    if (trimmed === 'rtrim') {
      result.transforms.push({ type: 'rtrim' });
      return;
    }

    const leftMatch = trimmed.match(/^left\((\d+)\)$/);
    if (leftMatch) {
      const length = parseInt(leftMatch[1], 10);
      if (!Number.isNaN(length)) {
        result.transforms.push({ type: 'left', length });
      } else {
        console.warn(
          `Invalid length for left() in \"${sourceKey}\":`,
          trimmed,
        );
      }
      return;
    }

    const rightMatch = trimmed.match(/^right\((\d+)\)$/);
    if (rightMatch) {
      const length = parseInt(rightMatch[1], 10);
      if (!Number.isNaN(length)) {
        result.transforms.push({ type: 'right', length });
      } else {
        console.warn(
          `Invalid length for right() in \"${sourceKey}\":`,
          trimmed,
        );
      }
      return;
    }

    const substrMatch = trimmed.match(/^substr\((\d+),\s*(\d+)\)$/);
    if (substrMatch) {
      const start = parseInt(substrMatch[1], 10);
      const length = parseInt(substrMatch[2], 10);
      if (!Number.isNaN(start) && !Number.isNaN(length)) {
        result.transforms.push({ type: 'substr', start, length });
      } else {
        console.warn(
          `Invalid parameters for substr() in \"${sourceKey}\":`,
          trimmed,
        );
      }
      return;
    }

    console.warn(`Unknown suffix \"${trimmed}\" in mapping key \"${sourceKey}\"`);
  });

  return result;
}

function applyStringTransforms(value, transforms) {
  let current = value;

  if (current === undefined || current === null) {
    return current;
  }

  for (const transform of transforms) {
    if (current === undefined || current === null) {
      break;
    }

    const str = String(current);

    switch (transform.type) {
      case 'trim':
        current = str.trim();
        break;
      case 'ltrim':
        current = str.replace(/^\s+/, '');
        break;
      case 'rtrim':
        current = str.replace(/\s+$/, '');
        break;
      case 'left':
        current = str.substring(0, transform.length);
        break;
      case 'right':
        current = str.substring(
          Math.max(0, str.length - transform.length),
          str.length,
        );
        break;
      case 'substr':
        current = str.substring(
          transform.start,
          transform.start + transform.length,
        );
        break;
      default:
        console.warn('Unknown string transform type:', transform.type);
        break;
    }
  }

  return current;
}

// Cache para acciones previas dinámicas
const dynamicPrevActionCache = new Map();

async function executeDynamicPrevAction(
  endpointName,
  paramValue,
  prevEndpoints,
  webhookData,
) {
  const cacheKey = `${endpointName}:${paramValue}`;

  if (dynamicPrevActionCache.has(cacheKey)) {
    console.log(
      `[Cache hit] Acción previa dinámica ${endpointName} con parámetro ${paramValue}`,
    );
    return dynamicPrevActionCache.get(cacheKey);
  }

  const prevEndpoint = prevEndpoints.find((ep) => {
    const epName = ep.name || `endpoint${prevEndpoints.indexOf(ep) + 1}`;
    return epName === endpointName;
  });

  if (!prevEndpoint) {
    console.warn(`Endpoint previo \"${endpointName}\" no encontrado`);
    return null;
  }

  try {
    let prevUrl = prevEndpoint.url;

    prevUrl = prevUrl.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
      const webhookValue = getNestedValue(webhookData, placeholder.trim());
      if (webhookValue !== undefined && webhookValue !== null) {
        return encodeURIComponent(String(webhookValue));
      }
      return encodeURIComponent(String(paramValue));
    });

    const prevMethod = (prevEndpoint.method || 'GET').toUpperCase();

    let prevRequestBody = {};
    let prevQueryParams = {};

    if (prevEndpoint.bodyMap && typeof prevEndpoint.bodyMap === 'object') {
      for (const [prevKey, sourceKey] of Object.entries(
        prevEndpoint.bodyMap,
      )) {
        if (sourceKey && sourceKey.trim() !== '') {
          if (sourceKey.startsWith('literal:')) {
            const literalValue = processTemplate(
              sourceKey.substring(8).trim(),
              webhookData,
            );
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

    const prevResponse = await axios({
      method: prevMethod.toLowerCase(),
      url: prevUrl,
      data: ['POST', 'PUT', 'PATCH'].includes(prevMethod)
        ? prevRequestBody
        : undefined,
      params:
        ['GET', 'DELETE'].includes(prevMethod) &&
        Object.keys(prevQueryParams).length > 0
          ? prevQueryParams
          : undefined,
      headers: prevEndpoint.headers || {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const responseData = prevResponse.data || {};
    let result = responseData;
    if (typeof responseData === 'number' || typeof responseData === 'string') {
      result = responseData;
    }

    dynamicPrevActionCache.set(cacheKey, result);
    console.log(
      `[Cache miss] Acción previa dinámica ${endpointName} con parámetro ${paramValue} → ${result}`,
    );

    return result;
  } catch (error) {
    console.error(
      `Error ejecutando acción previa dinámica ${endpointName} con parámetro ${paramValue}:`,
      error.message,
    );
    if (!prevEndpoint.required) {
      return null;
    }
    throw error;
  }
}

function processUrlTemplate(template, webhookData) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    if (value === undefined || value === null) {
      return '';
    }
    const stringValue = String(value);
    return encodeURIComponent(stringValue);
  });
}

function processTemplate(template, webhookData) {
  let result = template.replace(/"\{\{([^}]+)\}\}"/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    if (value === undefined || value === null) {
      return '""';
    }
    if (typeof value === 'string') {
      const escaped = JSON.stringify(value);
      return escaped;
    }
    return JSON.stringify(value);
  });

  result = result.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(webhookData, path.trim());
    if (value === undefined || value === null) {
      return 'null';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    return String(value);
  });

  return result;
}

function findMatchingParenthesis(str, startIndex) {
  let depth = 0;
  let braceDepth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{' && i + 1 < str.length && str[i + 1] === '{') {
      braceDepth++;
      i++;
    } else if (str[i] === '}' && i + 1 < str.length && str[i + 1] === '}') {
      braceDepth--;
      i++;
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

async function processTemplateAsync(template, webhookData, prevEndpoints) {
  const prevActionPattern = /prev\.([a-zA-Z0-9_]+)\(/g;
  const matches = [];
  let match;

  prevActionPattern.lastIndex = 0;

  while ((match = prevActionPattern.exec(template)) !== null) {
    let startIndex = match.index;
    const endpointName = match[1];
    const openParenIndex = startIndex + match[0].length - 1;

    let needsUnwrap = false;
    if (
      startIndex >= 2 &&
      template.substring(startIndex - 2, startIndex) === '{{'
    ) {
      startIndex = startIndex - 2;
      needsUnwrap = true;
    }

    const closeParenIndex = findMatchingParenthesis(template, openParenIndex);

    if (closeParenIndex !== -1) {
      const innerContent = template.substring(openParenIndex + 1, closeParenIndex);

      let fieldPath = null;
      let endIndex = closeParenIndex + 1;

      const fieldPattern = /^\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/;
      const afterParen = template.substring(closeParenIndex + 1);
      const fieldMatch = afterParen.match(fieldPattern);

      if (fieldMatch) {
        fieldPath = fieldMatch[1];
        endIndex = closeParenIndex + 1 + fieldMatch[0].length;
      }

      if (
        needsUnwrap &&
        endIndex + 2 <= template.length &&
        template.substring(endIndex, endIndex + 2) === '}}'
      ) {
        endIndex = endIndex + 2;
      }

      const fullMatch = template.substring(startIndex, endIndex);

      matches.push({
        fullMatch,
        endpointName,
        innerContent,
        fieldPath,
        startIndex,
        endIndex,
        needsUnwrap,
      });
    }
  }

  if (matches.length === 0) {
    return processTemplate(template, webhookData);
  }

  let processedTemplate = template;
  const promises = [];

  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const { fullMatch, endpointName, innerContent, fieldPath } = m;

    let contentToProcess = innerContent;
    if (!innerContent.startsWith('{{')) {
      contentToProcess = `{{${innerContent}}}`;
    }

    const paramValue = processTemplate(contentToProcess, webhookData);
    let cleanParamValue = paramValue.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

    const promise = executeDynamicPrevAction(
      endpointName,
      cleanParamValue,
      prevEndpoints,
      webhookData,
    )
      .then((result) => {
        let finalResult = result;
        if (fieldPath && result !== null && result !== undefined) {
          let objectToSearch = result;
          if (Array.isArray(result) && result.length > 0) {
            objectToSearch = result[0];
          }

          if (typeof objectToSearch === 'object' && objectToSearch !== null) {
            finalResult = getNestedValue(objectToSearch, fieldPath);
          } else {
            finalResult = null;
          }
        } else if (Array.isArray(result) && result.length > 0) {
          finalResult = result[0];
        }

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
      .catch((error) => {
        console.error(
          `Error procesando acción previa dinámica ${endpointName}:`,
          error,
        );
        return { fullMatch, replacement: 'null' };
      });

    promises.push(promise);
  }

  const replacements = await Promise.all(promises);

  for (const { fullMatch, replacement } of replacements) {
    const escapedMatch = fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedMatch, 'g');
    processedTemplate = processedTemplate.replace(regex, replacement);
  }

  const finalResult = processTemplate(processedTemplate, webhookData);
  return finalResult;
}

function evaluateConditions(conditions, data) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return true;
  }

  const validConditions = conditions.filter(
    (condition) => condition.field && condition.operator,
  );

  if (validConditions.length === 0) {
    return true;
  }

  const conditionResults = validConditions.map((condition) => {
    const fieldValue = getNestedValue(data, condition.field);

    switch (condition.operator) {
      case 'equals': {
        const equalsValue = condition.value;
        if (typeof fieldValue === 'number' || !isNaN(equalsValue)) {
          return Number(fieldValue) === Number(equalsValue);
        }
        return String(fieldValue) === String(equalsValue);
      }
      case 'notEquals': {
        const notEqualsValue = condition.value;
        if (typeof fieldValue === 'number' || !isNaN(notEqualsValue)) {
          return Number(fieldValue) !== Number(notEqualsValue);
        }
        return String(fieldValue) !== String(notEqualsValue);
      }
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
        return (
          fieldValue === undefined ||
          fieldValue === null ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0) ||
          (typeof fieldValue === 'object' &&
            Object.keys(fieldValue).length === 0)
        );
      case 'isNotEmpty':
        return !(
          fieldValue === undefined ||
          fieldValue === null ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0) ||
          (typeof fieldValue === 'object' &&
            Object.keys(fieldValue).length === 0)
        );
      default:
        console.warn(`Operador desconocido: ${condition.operator}`);
        return false;
    }
  });

  let result = conditionResults[0];

  for (let i = 1; i < conditionResults.length; i++) {
    const logicalOperator = validConditions[i].logicalOperator || 'AND';

    if (logicalOperator === 'OR') {
      result = result || conditionResults[i];
    } else {
      result = result && conditionResults[i];
    }
  }

  return result;
}

async function executePostResponseAction(action, context) {
  let actionUrl = action.url;
  actionUrl = processUrlTemplate(actionUrl, context);

  const method = (action.method || 'POST').toUpperCase();
  let requestBody = {};
  let queryParams = {};

  if (action.bodyMap && typeof action.bodyMap === 'object') {
    for (const [actionKey, sourceKey] of Object.entries(action.bodyMap)) {
      if (sourceKey && sourceKey.trim() !== '') {
        if (sourceKey.startsWith('literal:')) {
          let literalValue = sourceKey.substring(8).trim();
          literalValue = processTemplate(literalValue, context);

          let parsedValue;
          try {
            if (
              (literalValue.startsWith('{') && literalValue.endsWith('}')) ||
              (literalValue.startsWith('[') && literalValue.endsWith(']'))
            ) {
              parsedValue = JSON.parse(literalValue);
            } else if (literalValue === 'true' || literalValue === 'false') {
              parsedValue = literalValue === 'true';
            } else if (literalValue === 'null') {
              parsedValue = null;
            } else if (!isNaN(literalValue) && literalValue.trim() !== '') {
              parsedValue = Number(literalValue);
            } else {
              if (
                (literalValue.startsWith('"') && literalValue.endsWith('"')) ||
                (literalValue.startsWith("'") && literalValue.endsWith("'"))
              ) {
                parsedValue = literalValue.slice(1, -1);
              } else {
                parsedValue = literalValue;
              }
            }
          } catch (parseError) {
            console.warn(
              `Error parsing literal value for ${actionKey}:`,
              parseError,
            );
            parsedValue = literalValue;
          }

          if (['GET', 'DELETE'].includes(method)) {
            queryParams[actionKey] = parsedValue;
          } else {
            requestBody[actionKey] = parsedValue;
          }
        } else {
          const value = getNestedValue(context, sourceKey);
          if (value !== undefined) {
            if (['GET', 'DELETE'].includes(method)) {
              queryParams[actionKey] = value;
            } else {
              requestBody[actionKey] = value;
            }
          }
        }
      }
    }
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (action.headers && typeof action.headers === 'object') {
    Object.assign(headers, action.headers);
  }

  const response = await axios({
    method: method.toLowerCase(),
    url: actionUrl,
    data:
      ['POST', 'PUT', 'PATCH'].includes(method) &&
      Object.keys(requestBody).length > 0
        ? requestBody
        : undefined,
    params:
      ['GET', 'DELETE'].includes(method) &&
      Object.keys(queryParams).length > 0
        ? queryParams
        : undefined,
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

// Detecta si un literal contiene referencias a arrays con índices específicos
// y extrae el path del array fuente para iteración
function detectArrayIterationPattern(literalValue) {
  // Buscar patrones como: data.data.lineasPedido[0], data.lineasPedido[0], etc.
  // El patrón debe capturar paths con múltiples niveles: data.data.lineasPedido[0]
  // Usamos un patrón más robusto que captura cualquier secuencia de palabras y puntos antes de [0]
  const arrayIndexPattern = /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\[(\d+)\]/g;
  const matches = [];
  let match;
  
  while ((match = arrayIndexPattern.exec(literalValue)) !== null) {
    const arrayPath = match[1];
    const index = parseInt(match[2], 10);
    
    // Si el índice es 0, probablemente queremos iterar sobre todo el array
    if (index === 0) {
      matches.push({
        arrayPath,
        fullMatch: match[0],
        index,
      });
    }
  }
  
  // Si encontramos al menos un patrón con índice 0, intentamos extraer el array base
  if (matches.length > 0) {
    // Tomamos el primer match como referencia
    const firstMatch = matches[0];
    return {
      shouldIterate: true,
      arrayPath: firstMatch.arrayPath,
      matches,
    };
  }
  
  return { shouldIterate: false };
}

// Procesa un literal que contiene un array template y lo expande iterando sobre el array fuente
async function processArrayLiteral(
  literalTemplate,
  combinedData,
  prevEndpoints,
) {
  const detection = detectArrayIterationPattern(literalTemplate);
  
  if (!detection.shouldIterate) {
    // No hay patrón de iteración, procesar normalmente
    if (literalTemplate.includes('prev.')) {
      return await processTemplateAsync(
        literalTemplate,
        combinedData,
        Array.isArray(prevEndpoints) ? prevEndpoints : [],
      );
    }
    return processTemplate(literalTemplate, combinedData);
  }
  
  // Obtener el array fuente
  const sourceArray = getNestedValue(combinedData, detection.arrayPath);
  
  if (!Array.isArray(sourceArray) || sourceArray.length === 0) {
    // Si no es un array o está vacío, procesar normalmente (devolverá array vacío o null)
    if (literalTemplate.includes('prev.')) {
      return await processTemplateAsync(
        literalTemplate,
        combinedData,
        Array.isArray(prevEndpoints) ? prevEndpoints : [],
      );
    }
    return processTemplate(literalTemplate, combinedData);
  }
  
  // Iterar sobre todos los elementos del array
  const results = [];
  
  for (let i = 0; i < sourceArray.length; i++) {
    // Reemplazar todas las referencias [0] con [i] en el template
    // Necesitamos reemplazar [0] en todos los lugares donde aparezca el path del array
    let modifiedTemplate = literalTemplate;
    
    // Reemplazar [0] con [i] en todas las ocurrencias del path del array
    // Esto incluye referencias dentro de plantillas {{ }} y dentro de funciones prev.*()
    // Usamos un reemplazo global que busca el path seguido de [0]
    const escapedArrayPath = detection.arrayPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    modifiedTemplate = modifiedTemplate.replace(
      new RegExp(`(${escapedArrayPath})\\[0\\]`, 'g'),
      `$1[${i}]`,
    );
    
    // Procesar el template para este elemento
    let processedItem;
    if (modifiedTemplate.includes('prev.')) {
      processedItem = await processTemplateAsync(
        modifiedTemplate,
        combinedData,
        Array.isArray(prevEndpoints) ? prevEndpoints : [],
      );
    } else {
      processedItem = processTemplate(modifiedTemplate, combinedData);
    }
    
    // El resultado procesado debería ser un string JSON que representa un objeto
    // Necesitamos extraer el objeto del array resultante
    try {
      // Si el resultado es un array JSON, tomar el primer elemento
      if (processedItem.startsWith('[') && processedItem.endsWith(']')) {
        const parsedArray = JSON.parse(processedItem);
        if (Array.isArray(parsedArray) && parsedArray.length > 0) {
          results.push(parsedArray[0]);
        }
      } else if (processedItem.startsWith('{') && processedItem.endsWith('}')) {
        // Si es un objeto directamente, parsearlo
        results.push(JSON.parse(processedItem));
      } else {
        // Intentar extraer el objeto del string
        const objectMatch = processedItem.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          results.push(JSON.parse(objectMatch[0]));
        } else {
          console.warn(
            `Could not extract object from processed item at index ${i}`,
          );
        }
      }
    } catch (e) {
      console.warn(
        `Error parsing array item at index ${i}:`,
        e.message,
      );
    }
  }
  
  // Devolver el array completo como JSON string para que se parsee después
  return JSON.stringify(results);
}

// Aplica el objeto de mapeo de flow.map sobre combinedData, rellenando mappedData
// Soporta:
// - Literales simples (literal:123, literal:"texto", literal:{...}, literal:[...])
// - Plantillas {{ }} sobre data/prev
// - Expresiones dinámicas prev.nombreEndpoint(campo).subcampo dentro de literales
// - Iteración automática sobre arrays cuando se detecta patrón [0] en literales de array
async function applyMapping(flowMap, combinedData, mappedData, flow, prevEndpoints) {
  for (const [destKey, sourceKey] of Object.entries(flowMap)) {
    if (!sourceKey || sourceKey.trim() === '' || sourceKey.trim() === '.') {
      continue;
    }

    if (typeof sourceKey === 'string' && sourceKey.startsWith('literal:')) {
      let literalValue = sourceKey.substring(8).trim();

      // Detectar si es un array literal que necesita iteración
      const isArrayLiteral =
        (literalValue.startsWith('[') && literalValue.endsWith(']')) ||
        literalValue.includes('[') && literalValue.includes(']');

      if (isArrayLiteral) {
        // Intentar procesar como array iterativo
        try {
          literalValue = await processArrayLiteral(
            literalValue,
            combinedData,
            prevEndpoints,
          );
        } catch (e) {
          console.warn(
            `Error procesando literal de array iterativo para ${destKey}, fallback a procesamiento normal:`,
            e,
          );
          // Fallback al procesamiento normal
          if (literalValue.includes('prev.')) {
            try {
              literalValue = await processTemplateAsync(
                literalValue,
                combinedData,
                Array.isArray(prevEndpoints) ? prevEndpoints : [],
              );
            } catch (e2) {
              literalValue = processTemplate(literalValue, combinedData);
            }
          } else {
            literalValue = processTemplate(literalValue, combinedData);
          }
        }
      } else if (literalValue.includes('prev.')) {
        // Si el literal contiene expresiones prev.*(...) usamos el motor asíncrono
        // que evalúa acciones previas dinámicas (por ejemplo prev.getProducto(...).idItem)
        try {
          literalValue = await processTemplateAsync(
            literalValue,
            combinedData,
            Array.isArray(prevEndpoints) ? prevEndpoints : [],
          );
        } catch (e) {
          console.warn(
            `Error procesando literal con acciones previas para ${destKey}:`,
            e,
          );
          // Fallback: al menos aplicar el template básico
          literalValue = processTemplate(literalValue, combinedData);
        }
      } else {
        // Literales normales sin acciones previas dinámicas
        literalValue = processTemplate(literalValue, combinedData);
      }

      try {
        if (
          (literalValue.startsWith('{') && literalValue.endsWith('}')) ||
          (literalValue.startsWith('[') && literalValue.endsWith(']'))
        ) {
          mappedData[destKey] = JSON.parse(literalValue);
        } else if (literalValue === 'true' || literalValue === 'false') {
          mappedData[destKey] = literalValue === 'true';
        } else if (literalValue === 'null') {
          mappedData[destKey] = null;
        } else if (!isNaN(literalValue) && literalValue.trim() !== '') {
          mappedData[destKey] = Number(literalValue);
        } else {
          if (
            (literalValue.startsWith('"') && literalValue.endsWith('"')) ||
            (literalValue.startsWith("'") && literalValue.endsWith("'"))
          ) {
            mappedData[destKey] = literalValue.slice(1, -1);
          } else {
            mappedData[destKey] = literalValue;
          }
        }
      } catch (parseError) {
        console.warn(
          `Error parsing literal value for ${destKey}:`,
          parseError,
        );
        mappedData[destKey] = literalValue;
      }
    } else {
      const parsed = parseSourceKey(String(sourceKey));
      const {
        baseKey,
        isArrayMapping,
        mapSpec,
        toNumber,
        toInt,
        transforms,
      } = parsed;

      let value = getNestedValue(combinedData, baseKey);

      let finalIsArrayMapping = isArrayMapping;
      if (!finalIsArrayMapping && Array.isArray(value)) {
        finalIsArrayMapping = true;
      }

      if (value !== undefined) {
        if (finalIsArrayMapping && Array.isArray(value)) {
          mappedData[destKey] = value;
        } else {
          if (transforms && transforms.length > 0) {
            value = applyStringTransforms(value, transforms);
          }

          if (mapSpec && mapSpec[value] !== undefined) {
            value = mapSpec[value];
          }

          if (toNumber || toInt) {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              value = toInt ? Math.trunc(numValue) : numValue;
            }
          }

          mappedData[destKey] = value;
        }
      }
    }
  }
}


