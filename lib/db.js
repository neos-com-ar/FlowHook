import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

// Verificar si Vercel KV está disponible y tiene credenciales válidas
// Soporta tanto KV_REST_API_URL como UPSTASH_REDIS_REST_URL (Upstash)
const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const useKV = kvUrl && 
              kvToken &&
              !kvUrl.includes('tu-kv-instance') &&
              !kvUrl.includes('placeholder') &&
              !kvToken.includes('tu-kv-token') &&
              !kvToken.includes('placeholder');

// Crear cliente KV si está disponible
let kv = null;
if (useKV) {
  try {
    kv = createClient({
      url: kvUrl,
      token: kvToken,
    });
    console.log('✅ Usando Vercel KV/Upstash para almacenar flujos');
  } catch (error) {
    console.error('Error creating KV client:', error);
    kv = null;
  }
} else {
  console.log('📁 Usando sistema de archivos local para almacenar flujos');
}

// Función para obtener datos del fallback local
async function getLocalData() {
  const dataPath = path.join(process.cwd(), 'tmp', 'data.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading local data:', error);
  }
  return {};
}

// Función para guardar datos en el fallback local
async function saveLocalData(data) {
  const dataPath = path.join(process.cwd(), 'tmp', 'data.json');
  const dataDir = path.dirname(dataPath);
  
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving local data:', error);
    throw error;
  }
}

/**
 * Obtiene todos los flujos de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Array de flujos
 */
export async function getUserFlows(userId) {
  try {
    if (useKV && kv) {
      try {
        const key = `user_flows:${userId}`;
        const flows = await kv.get(key);
        return flows || [];
      } catch (error) {
        console.error('Error al obtener flujos de KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        return data[userId]?.flows || [];
      }
    } else {
      const data = await getLocalData();
      return data[userId]?.flows || [];
    }
  } catch (error) {
    console.error('Error getting user flows:', error);
    return [];
  }
}

/**
 * Obtiene un flujo específico de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @returns {Promise<Object|null>} Flujo o null si no existe
 */
export async function getFlow(userId, flowId) {
  try {
    const flows = await getUserFlows(userId);
    return flows.find(flow => flow.id === flowId) || null;
  } catch (error) {
    console.error('Error getting flow:', error);
    return null;
  }
}

/**
 * Guarda o actualiza un flujo
 * @param {string} userId - ID del usuario
 * @param {Object} flow - Objeto del flujo
 * @returns {Promise<boolean>} true si se guardó correctamente
 */
export async function saveFlow(userId, flow) {
  try {
    if (useKV && kv) {
      try {
        const key = `user_flows:${userId}`;
        const flows = await kv.get(key) || [];
        const existingIndex = flows.findIndex(f => f.id === flow.id);
        
        if (existingIndex >= 0) {
          flows[existingIndex] = flow;
        } else {
          flows.push(flow);
        }
        
        await kv.set(key, flows);
        return true;
      } catch (error) {
        console.error('Error al guardar flujo en KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        if (!data[userId]) {
          data[userId] = { flows: [] };
        }
        
        const existingIndex = data[userId].flows.findIndex(f => f.id === flow.id);
        if (existingIndex >= 0) {
          data[userId].flows[existingIndex] = flow;
        } else {
          data[userId].flows.push(flow);
        }
        
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data[userId]) {
        data[userId] = { flows: [] };
      }
      
      const existingIndex = data[userId].flows.findIndex(f => f.id === flow.id);
      if (existingIndex >= 0) {
        data[userId].flows[existingIndex] = flow;
      } else {
        data[userId].flows.push(flow);
      }
      
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error saving flow:', error);
    return false;
  }
}

/**
 * Elimina un flujo
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteFlow(userId, flowId) {
  try {
    if (useKV && kv) {
      try {
        const key = `user_flows:${userId}`;
        const flows = await kv.get(key) || [];
        const filteredFlows = flows.filter(f => f.id !== flowId);
        await kv.set(key, filteredFlows);
        return true;
      } catch (error) {
        console.error('Error al eliminar flujo de KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        if (data[userId]?.flows) {
          data[userId].flows = data[userId].flows.filter(f => f.id !== flowId);
          await saveLocalData(data);
        }
        return true;
      }
    } else {
      const data = await getLocalData();
      if (data[userId]?.flows) {
        data[userId].flows = data[userId].flows.filter(f => f.id !== flowId);
        await saveLocalData(data);
      }
      return true;
    }
  } catch (error) {
    console.error('Error deleting flow:', error);
    return false;
  }
}

/**
 * Guarda un webhook recibido en el historial
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @param {Object} webhookData - Datos del webhook recibido
 * @returns {Promise<boolean>} true si se guardó correctamente
 */
export async function saveWebhook(userId, flowId, webhookData) {
  try {
    const webhook = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      flowId,
      timestamp: new Date().toISOString(),
      ...webhookData,
    };

    if (useKV && kv) {
      try {
        const key = `webhooks:${userId}:${flowId}`;
        const webhooks = await kv.get(key) || [];
        webhooks.unshift(webhook); // Agregar al inicio
        // Mantener solo los últimos 1000 webhooks
        const limitedWebhooks = webhooks.slice(0, 1000);
        await kv.set(key, limitedWebhooks);
        return true;
      } catch (error) {
        console.error('Error al guardar webhook en KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        if (!data[userId]) {
          data[userId] = { flows: [], webhooks: {} };
        }
        if (!data[userId].webhooks) {
          data[userId].webhooks = {};
        }
        if (!data[userId].webhooks[flowId]) {
          data[userId].webhooks[flowId] = [];
        }
        data[userId].webhooks[flowId].unshift(webhook);
        // Mantener solo los últimos 1000 webhooks
        data[userId].webhooks[flowId] = data[userId].webhooks[flowId].slice(0, 1000);
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data[userId]) {
        data[userId] = { flows: [], webhooks: {} };
      }
      if (!data[userId].webhooks) {
        data[userId].webhooks = {};
      }
      if (!data[userId].webhooks[flowId]) {
        data[userId].webhooks[flowId] = [];
      }
      data[userId].webhooks[flowId].unshift(webhook);
      // Mantener solo los últimos 1000 webhooks
      data[userId].webhooks[flowId] = data[userId].webhooks[flowId].slice(0, 1000);
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error saving webhook:', error);
    return false;
  }
}

/**
 * Obtiene el historial de webhooks de un flujo específico
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo (opcional, si no se proporciona retorna todos)
 * @param {number} limit - Límite de resultados (default: 100)
 * @returns {Promise<Array>} Array de webhooks
 */
export async function getWebhooks(userId, flowId = null, limit = 100) {
  try {
    if (useKV && kv) {
      try {
        if (flowId) {
          const key = `webhooks:${userId}:${flowId}`;
          const webhooks = await kv.get(key) || [];
          return webhooks.slice(0, limit);
        } else {
          // Obtener todos los webhooks de todos los flujos del usuario
          const flows = await getUserFlows(userId);
          const allWebhooks = [];
          for (const flow of flows) {
            const key = `webhooks:${userId}:${flow.id}`;
            const webhooks = await kv.get(key) || [];
            allWebhooks.push(...webhooks);
          }
          // Ordenar por timestamp descendente
          allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return allWebhooks.slice(0, limit);
        }
      } catch (error) {
        console.error('Error al obtener webhooks de KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        if (flowId) {
          return (data[userId]?.webhooks?.[flowId] || []).slice(0, limit);
        } else {
          const allWebhooks = [];
          if (data[userId]?.webhooks) {
            for (const [fId, webhooks] of Object.entries(data[userId].webhooks)) {
              allWebhooks.push(...webhooks);
            }
          }
          allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          return allWebhooks.slice(0, limit);
        }
      }
    } else {
      const data = await getLocalData();
      if (flowId) {
        return (data[userId]?.webhooks?.[flowId] || []).slice(0, limit);
      } else {
        const allWebhooks = [];
        if (data[userId]?.webhooks) {
          for (const [fId, webhooks] of Object.entries(data[userId].webhooks)) {
            allWebhooks.push(...webhooks);
          }
        }
        allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return allWebhooks.slice(0, limit);
      }
    }
  } catch (error) {
    console.error('Error getting webhooks:', error);
    return [];
  }
}

