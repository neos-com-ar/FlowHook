import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';
import {
  roleMeetsRequired,
  minRole,
  maxRole,
  mergeMemberRole,
  slugifyWorkspaceName,
  isValidWorkspaceSlug,
  isWorkspaceActive,
} from './workspace-pure.mjs';

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
 * Busca primero en proyectos, luego en flujos sin proyecto (sistema antiguo)
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @returns {Promise<Object|null>} Flujo o null si no existe
 */
export async function getFlow(userId, flowId) {
  try {
    // Primero buscar en proyectos
    const projects = await getUserProjects(userId);
    for (const project of projects) {
      const flows = await getProjectFlows(project.id);
      const flow = flows.find(f => f.id === flowId);
      if (flow) {
        return flow;
      }
    }
    
    // Si no se encuentra en proyectos, buscar en flujos sin proyecto (sistema antiguo)
    const oldFlows = await getUserFlows(userId);
    return oldFlows.find(flow => flow.id === flowId) || null;
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

const LEGACY_PROJECT_ID = 'legacy';

function normalizeProjectIdForStorage(projectId) {
  return projectId || LEGACY_PROJECT_ID;
}

function getProjectWebhookKvKey(projectId, flowId) {
  return `webhooks:${projectId}:${flowId}`;
}

function getScopedWebhookKvKey(userId, flowId, projectId) {
  return `webhooks:${userId}:${normalizeProjectIdForStorage(projectId)}:${flowId}`;
}

function getLegacyWebhookKvKey(userId, flowId) {
  return `webhooks:${userId}:${flowId}`;
}

function getProjectWebhookLocalKey(projectId, flowId) {
  return `project:${projectId}:${flowId}`;
}

function getScopedWebhookLocalKey(flowId, projectId) {
  return `${normalizeProjectIdForStorage(projectId)}:${flowId}`;
}

function buildFlowInfoMap(projectFlows, oldFlows) {
  const flowMap = new Map();

  const addFlow = (flow, projectId, projectName, projectIcon, projectColor) => {
    const info = {
      flowId: flow.id,
      flowName: flow.name,
      projectId,
      projectName,
      projectIcon,
      projectColor,
    };
    flowMap.set(`${projectId || LEGACY_PROJECT_ID}:${flow.id}`, info);
    if (!flowMap.has(flow.id)) {
      flowMap.set(flow.id, info);
    }
  };

  projectFlows.forEach((flow) => {
    addFlow(
      flow,
      flow.projectId,
      flow.projectName,
      flow.projectIcon,
      flow.projectColor,
    );
  });

  oldFlows.forEach((flow) => {
    const compositeKey = `${LEGACY_PROJECT_ID}:${flow.id}`;
    if (!flowMap.has(compositeKey)) {
      addFlow(flow, null, null, null, null);
    }
  });

  return flowMap;
}

function lookupFlowInfo(flowMap, webhook) {
  if (!flowMap) {
    return null;
  }
  const storageProjectId = webhook.projectId || LEGACY_PROJECT_ID;
  return (
    flowMap.get(`${storageProjectId}:${webhook.flowId}`) ||
    flowMap.get(webhook.flowId) ||
    null
  );
}

function enrichSingleWebhook(webhook, flowMap) {
  const mapInfo = lookupFlowInfo(flowMap, webhook);
  const resolvedProjectId = webhook.projectId ?? mapInfo?.projectId ?? null;
  const projectInfo = resolvedProjectId
    ? flowMap.get(`${resolvedProjectId}:${webhook.flowId}`) || mapInfo
    : mapInfo;

  return {
    ...webhook,
    flowName:
      webhook.flowName ||
      projectInfo?.flowName ||
      mapInfo?.flowName ||
      webhook.flowId,
    projectId: resolvedProjectId,
    projectName: projectInfo?.projectName ?? mapInfo?.projectName ?? null,
    projectIcon: projectInfo?.projectIcon ?? mapInfo?.projectIcon ?? null,
    projectColor: projectInfo?.projectColor ?? mapInfo?.projectColor ?? null,
  };
}

function enrichWebhooksList(webhooks, flowMap) {
  return webhooks.map((webhook) => enrichSingleWebhook(webhook, flowMap));
}

function matchesProjectFilter(webhook, projectId, flowName) {
  if (!projectId) {
    return true;
  }
  if (webhook.projectId === projectId) {
    return true;
  }
  if (!webhook.projectId && flowName && webhook.flowName === flowName) {
    return true;
  }
  return false;
}

function mergeAndSortWebhooks(...arrays) {
  const byId = new Map();
  for (const webhooks of arrays) {
    for (const webhook of webhooks) {
      if (!byId.has(webhook.id)) {
        byId.set(webhook.id, webhook);
      }
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );
}

async function resolveFlowNameForFilter(userId, flowId, projectId) {
  if (!projectId || !flowId) {
    return null;
  }
  const projectFlows = await getAllFlowsForUser(userId);
  const flow = projectFlows.find(
    (item) => item.id === flowId && item.projectId === projectId,
  );
  return flow?.name || null;
}

function ensureProjectWebhooksBucket(data) {
  if (!data.projectWebhooks) {
    data.projectWebhooks = {};
  }
}

async function loadWebhookBucketFromKv(userId, flowId, projectId) {
  const buckets = [];

  if (projectId) {
    buckets.push((await kv.get(getProjectWebhookKvKey(projectId, flowId))) || []);
    buckets.push((await kv.get(getScopedWebhookKvKey(userId, flowId, projectId))) || []);
  }

  buckets.push((await kv.get(getLegacyWebhookKvKey(userId, flowId))) || []);
  return mergeAndSortWebhooks(...buckets);
}

function loadWebhookBucketFromLocal(data, userId, flowId, projectId) {
  const buckets = [];

  if (projectId) {
    ensureProjectWebhooksBucket(data);
    const projectKey = getProjectWebhookLocalKey(projectId, flowId);
    buckets.push(data.projectWebhooks[projectKey] || []);

    ensureUserWebhooksBucket(data, userId);
    const scopedKey = getScopedWebhookLocalKey(flowId, projectId);
    buckets.push(data[userId].webhooks[scopedKey] || []);
  }

  ensureUserWebhooksBucket(data, userId);
  buckets.push(data[userId].webhooks[flowId] || []);
  return mergeAndSortWebhooks(...buckets);
}

async function loadWebhooksForFlowFromKv(userId, flowId, projectId, flowName) {
  if (projectId) {
    const webhooks = await loadWebhookBucketFromKv(userId, flowId, projectId);
    return webhooks.filter((webhook) => matchesProjectFilter(webhook, projectId, flowName));
  }

  const projectFlows = await getAllFlowsForUser(userId);
  const matchingFlows = projectFlows.filter((flow) => flow.id === flowId);
  const arrays = await Promise.all(
    matchingFlows.map((flow) => loadWebhookBucketFromKv(userId, flowId, flow.projectId)),
  );
  return mergeAndSortWebhooks(...arrays);
}

function loadWebhooksForFlowFromLocal(data, userId, flowId, projectId, flowName) {
  if (projectId) {
    const webhooks = loadWebhookBucketFromLocal(data, userId, flowId, projectId);
    return webhooks.filter((webhook) => matchesProjectFilter(webhook, projectId, flowName));
  }

  const projectFlows = [];
  const arrays = [];
  ensureProjectWebhooksBucket(data);
  for (const [key, webhooks] of Object.entries(data.projectWebhooks)) {
    if (key.endsWith(`:${flowId}`)) {
      arrays.push(webhooks);
    }
  }
  ensureUserWebhooksBucket(data, userId);
  for (const [key, webhooks] of Object.entries(data[userId].webhooks)) {
    if (key === flowId || key.endsWith(`:${flowId}`)) {
      arrays.push(webhooks);
    }
  }
  return mergeAndSortWebhooks(...arrays);
}

async function loadAllWebhooksFromKv(userId) {
  const projects = await getUserProjects(userId);
  const seenIds = new Set();
  let allWebhooks = [];

  for (const project of projects) {
    const flows = await getProjectFlows(project.id);
    for (const flow of flows) {
      const webhooks = await loadWebhookBucketFromKv(userId, flow.id, project.id);
      for (const webhook of webhooks) {
        if (!seenIds.has(webhook.id)) {
          seenIds.add(webhook.id);
          allWebhooks.push({ ...webhook, projectId: webhook.projectId || project.id });
        }
      }
    }
  }

  const oldFlows = await getUserFlows(userId);
  for (const flow of oldFlows) {
    const webhooks = await loadWebhookBucketFromKv(userId, flow.id, null);
    for (const webhook of webhooks) {
      if (!seenIds.has(webhook.id)) {
        seenIds.add(webhook.id);
        allWebhooks.push(webhook);
      }
    }
  }

  allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return allWebhooks;
}

function loadAllWebhooksFromLocal(data, userId) {
  const seenIds = new Set();
  let allWebhooks = [];

  ensureProjectWebhooksBucket(data);
  for (const webhooks of Object.values(data.projectWebhooks)) {
    for (const webhook of webhooks) {
      if (!seenIds.has(webhook.id)) {
        seenIds.add(webhook.id);
        allWebhooks.push(webhook);
      }
    }
  }

  ensureUserWebhooksBucket(data, userId);
  for (const webhooks of Object.values(data[userId].webhooks)) {
    for (const webhook of webhooks) {
      if (!seenIds.has(webhook.id)) {
        seenIds.add(webhook.id);
        allWebhooks.push(webhook);
      }
    }
  }

  allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return allWebhooks;
}

function ensureUserWebhooksBucket(data, userId) {
  if (!data[userId]) {
    data[userId] = { flows: [], webhooks: {} };
  }
  if (!data[userId].webhooks) {
    data[userId].webhooks = {};
  }
}

function appendWebhookToBucket(bucket, webhook, max = 1000) {
  bucket.unshift(webhook);
  return bucket.slice(0, max);
}

async function updateWebhookInBucket(webhooks, webhookId, updater) {
  const index = webhooks.findIndex((webhook) => webhook.id === webhookId);
  if (index === -1) {
    return { updated: false, webhooks };
  }

  const oldWebhook = webhooks[index];
  const updatedWebhook = updater(oldWebhook) || oldWebhook;
  webhooks[index] = {
    ...oldWebhook,
    ...updatedWebhook,
  };

  return { updated: true, webhooks };
}

/**
 * Guarda un webhook recibido en el historial
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @param {Object} webhookData - Datos del webhook recibido
 * @param {string|null} projectId - ID del proyecto (opcional)
 * @returns {Promise<boolean>} true si se guardó correctamente
 */
export async function saveWebhook(userId, flowId, webhookData, projectId = null) {
  try {
    const webhook = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      flowId,
      projectId: projectId || undefined,
      timestamp: new Date().toISOString(),
      ...webhookData,
    };

    if (useKV && kv) {
      try {
        const key = projectId
          ? getProjectWebhookKvKey(projectId, flowId)
          : getLegacyWebhookKvKey(userId, flowId);
        const webhooks = (await kv.get(key)) || [];
        await kv.set(key, appendWebhookToBucket(webhooks, webhook));
        return true;
      } catch (error) {
        console.error('Error al guardar webhook en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (projectId) {
          ensureProjectWebhooksBucket(data);
          const localKey = getProjectWebhookLocalKey(projectId, flowId);
          const bucket = data.projectWebhooks[localKey] || [];
          data.projectWebhooks[localKey] = appendWebhookToBucket(bucket, webhook);
        } else {
          ensureUserWebhooksBucket(data, userId);
          const bucket = data[userId].webhooks[flowId] || [];
          data[userId].webhooks[flowId] = appendWebhookToBucket(bucket, webhook);
        }
        await saveLocalData(data);
        return true;
      }
    }

    const data = await getLocalData();
    if (projectId) {
      ensureProjectWebhooksBucket(data);
      const localKey = getProjectWebhookLocalKey(projectId, flowId);
      const bucket = data.projectWebhooks[localKey] || [];
      data.projectWebhooks[localKey] = appendWebhookToBucket(bucket, webhook);
    } else {
      ensureUserWebhooksBucket(data, userId);
      const bucket = data[userId].webhooks[flowId] || [];
      data[userId].webhooks[flowId] = appendWebhookToBucket(bucket, webhook);
    }
    await saveLocalData(data);
    return true;
  } catch (error) {
    console.error('Error saving webhook:', error);
    return false;
  }
}

/**
 * Actualiza un webhook existente en el historial
 * sin cambiar el id ni el timestamp originales.
 *
 * @param {string} userId
 * @param {string} flowId
 * @param {string} webhookId
 * @param {(oldWebhook: Object) => Object} updater
 * @param {string|null} projectId
 * @returns {Promise<boolean>}
 */
export async function updateWebhook(userId, flowId, webhookId, updater, projectId = null) {
  try {
    const tryUpdateBucket = async (webhooks) =>
      updateWebhookInBucket(webhooks, webhookId, updater);

    if (useKV && kv) {
      try {
        const keysToTry = [];
        if (projectId) {
          keysToTry.push(getProjectWebhookKvKey(projectId, flowId));
          keysToTry.push(getScopedWebhookKvKey(userId, flowId, projectId));
        }
        keysToTry.push(getLegacyWebhookKvKey(userId, flowId));

        for (const key of keysToTry) {
          let webhooks = (await kv.get(key)) || [];
          const result = await tryUpdateBucket(webhooks);
          if (result.updated) {
            await kv.set(key, result.webhooks);
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error(
          'Error al actualizar webhook en KV, usando fallback local:',
          error,
        );
        const data = await getLocalData();
        const localKeys = [];
        if (projectId) {
          ensureProjectWebhooksBucket(data);
          localKeys.push({ store: 'project', key: getProjectWebhookLocalKey(projectId, flowId) });
          ensureUserWebhooksBucket(data, userId);
          localKeys.push({ store: 'user', key: getScopedWebhookLocalKey(flowId, projectId) });
        }
        ensureUserWebhooksBucket(data, userId);
        localKeys.push({ store: 'user', key: flowId });

        for (const { store, key } of localKeys) {
          let webhooks = store === 'project'
            ? (data.projectWebhooks[key] || [])
            : (data[userId].webhooks[key] || []);
          const result = await tryUpdateBucket(webhooks);
          if (result.updated) {
            if (store === 'project') {
              data.projectWebhooks[key] = result.webhooks;
            } else {
              data[userId].webhooks[key] = result.webhooks;
            }
            await saveLocalData(data);
            return true;
          }
        }
        return false;
      }
    }

    const data = await getLocalData();
    const localKeys = [];
    if (projectId) {
      ensureProjectWebhooksBucket(data);
      localKeys.push({ store: 'project', key: getProjectWebhookLocalKey(projectId, flowId) });
      ensureUserWebhooksBucket(data, userId);
      localKeys.push({ store: 'user', key: getScopedWebhookLocalKey(flowId, projectId) });
    }
    ensureUserWebhooksBucket(data, userId);
    localKeys.push({ store: 'user', key: flowId });

    for (const { store, key } of localKeys) {
      let webhooks = store === 'project'
        ? (data.projectWebhooks[key] || [])
        : (data[userId].webhooks[key] || []);
      const result = await tryUpdateBucket(webhooks);
      if (result.updated) {
        if (store === 'project') {
          data.projectWebhooks[key] = result.webhooks;
        } else {
          data[userId].webhooks[key] = result.webhooks;
        }
        await saveLocalData(data);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error updating webhook:', error);
    return false;
  }
}

/**
 * Obtiene la información del proyecto para un flujo específico
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo
 * @returns {Promise<Object|null>} Información del proyecto o null si no pertenece a ningún proyecto
 */
async function getFlowProjectInfo(userId, flowId) {
  try {
    const projects = await getUserProjects(userId);
    for (const project of projects) {
      const flows = await getProjectFlows(project.id);
      const flow = flows.find(f => f.id === flowId);
      if (flow) {
        return {
          projectId: project.id,
          projectName: project.name,
          projectIcon: project.icon,
          projectColor: project.color,
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting flow project info:', error);
    return null;
  }
}

/**
 * Obtiene el historial de webhooks de un flujo específico
 * @param {string} userId - ID del usuario
 * @param {string} flowId - ID del flujo (opcional, si no se proporciona retorna todos)
 * @param {number} limit - Límite de resultados (default: 100)
 * @param {number} offset - Offset para paginación (default: 0)
 * @returns {Promise<Object>} Objeto con webhooks y total
 */
export async function getWebhooks(userId, flowId = null, limit = 100, offset = 0, filters = {}) {
  try {
    const { status, startDate, endDate, projectId } = filters || {};
    const flowName =
      projectId && flowId
        ? await resolveFlowNameForFilter(userId, flowId, projectId)
        : null;

    const applyFilters = (webhooks) => {
      let filtered = webhooks;

      if (status === 'success') {
        filtered = filtered.filter((webhook) => webhook.result?.success === true);
      } else if (status === 'error') {
        filtered = filtered.filter((webhook) => webhook.result?.success === false);
      }

      if (startDate) {
        const start = new Date(startDate);
        filtered = filtered.filter((webhook) => new Date(webhook.timestamp) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        if (!endDate.includes('T')) {
          end.setHours(23, 59, 59, 999);
        }
        filtered = filtered.filter((webhook) => new Date(webhook.timestamp) <= end);
      }

      return filtered;
    };

    const buildFlowMap = async () => {
      const projectFlows = await getAllFlowsForUser(userId);
      const oldFlows = await getUserFlows(userId);
      return buildFlowInfoMap(projectFlows, oldFlows);
    };

    const paginateAndEnrich = async (webhooks, flowMap = null) => {
      const resolvedFlowMap = flowMap || (await buildFlowMap());
      const filtered = applyFilters(webhooks);
      return {
        webhooks: enrichWebhooksList(
          filtered.slice(offset, offset + limit),
          resolvedFlowMap,
        ),
        total: filtered.length,
      };
    };

    if (useKV && kv) {
      try {
        if (flowId) {
          const webhooks = await loadWebhooksForFlowFromKv(
            userId,
            flowId,
            projectId,
            flowName,
          );
          return paginateAndEnrich(webhooks);
        }

        const allWebhooks = await loadAllWebhooksFromKv(userId);
        const flowMap = await buildFlowMap();
        return paginateAndEnrich(allWebhooks, flowMap);
      } catch (error) {
        console.error('Error al obtener webhooks de KV, usando fallback local:', error);
        const data = await getLocalData();
        if (flowId) {
          const webhooks = loadWebhooksForFlowFromLocal(
            data,
            userId,
            flowId,
            projectId,
            flowName,
          );
          return paginateAndEnrich(webhooks);
        }

        const allWebhooks = loadAllWebhooksFromLocal(data, userId);
        const flowMap = await buildFlowMap();
        return paginateAndEnrich(allWebhooks, flowMap);
      }
    }

    const data = await getLocalData();
    if (flowId) {
      const webhooks = loadWebhooksForFlowFromLocal(
        data,
        userId,
        flowId,
        projectId,
        flowName,
      );
      return paginateAndEnrich(webhooks);
    }

    const allWebhooks = loadAllWebhooksFromLocal(data, userId);
    const flowMap = await buildFlowMap();
    return paginateAndEnrich(allWebhooks, flowMap);
  } catch (error) {
    console.error('Error getting webhooks:', error);
    return { webhooks: [], total: 0 };
  }
}

// ============================================================================
// HELPERS DE ROLES Y WORKSPACES
// ============================================================================

async function getWorkspaceSlugIndex() {
  if (useKV && kv) {
    try {
      return await kv.get('workspace_slug_index') || {};
    } catch {
      const data = await getLocalData();
      return data.workspaceSlugs || {};
    }
  }
  const data = await getLocalData();
  return data.workspaceSlugs || {};
}

async function setWorkspaceSlugIndex(index) {
  if (useKV && kv) {
    try {
      await kv.set('workspace_slug_index', index);
      return;
    } catch {
      const data = await getLocalData();
      data.workspaceSlugs = index;
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  data.workspaceSlugs = index;
  await saveLocalData(data);
}

export async function isWorkspaceSlugAvailable(slug, excludeWorkspaceId = null) {
  if (!isValidWorkspaceSlug(slug)) return false;
  const index = await getWorkspaceSlugIndex();
  const ownerId = index[slug];
  if (!ownerId) return true;
  return excludeWorkspaceId != null && ownerId === excludeWorkspaceId;
}

async function claimWorkspaceSlug(slug, workspaceId) {
  const index = await getWorkspaceSlugIndex();
  index[slug] = workspaceId;
  await setWorkspaceSlugIndex(index);
}

async function releaseWorkspaceSlug(slug) {
  if (!slug) return;
  const index = await getWorkspaceSlugIndex();
  if (index[slug]) {
    delete index[slug];
    await setWorkspaceSlugIndex(index);
  }
}

async function resolveUniqueWorkspaceSlug(baseSlug, excludeWorkspaceId = null) {
  let slug = slugifyWorkspaceName(baseSlug);
  let suffix = 2;
  while (!(await isWorkspaceSlugAvailable(slug, excludeWorkspaceId))) {
    slug = `${slugifyWorkspaceName(baseSlug).slice(0, 44)}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

async function getWorkspaceProjectIds(workspaceId) {
  if (useKV && kv) {
    try {
      return await kv.get(`workspace_projects:${workspaceId}`) || [];
    } catch (error) {
      const data = await getLocalData();
      return data.workspaceProjects?.[workspaceId] || [];
    }
  }
  const data = await getLocalData();
  return data.workspaceProjects?.[workspaceId] || [];
}

async function setWorkspaceProjectIds(workspaceId, projectIds) {
  if (useKV && kv) {
    try {
      await kv.set(`workspace_projects:${workspaceId}`, projectIds);
      return;
    } catch (error) {
      const data = await getLocalData();
      if (!data.workspaceProjects) data.workspaceProjects = {};
      data.workspaceProjects[workspaceId] = projectIds;
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (!data.workspaceProjects) data.workspaceProjects = {};
  data.workspaceProjects[workspaceId] = projectIds;
  await saveLocalData(data);
}

async function addProjectToWorkspaceIndex(workspaceId, projectId) {
  const ids = await getWorkspaceProjectIds(workspaceId);
  if (!ids.includes(projectId)) {
    ids.push(projectId);
    await setWorkspaceProjectIds(workspaceId, ids);
  }
}

async function removeProjectFromWorkspaceIndex(workspaceId, projectId) {
  const ids = await getWorkspaceProjectIds(workspaceId);
  await setWorkspaceProjectIds(workspaceId, ids.filter(id => id !== projectId));
}

// ============================================================================
// FUNCIONES DE WORKSPACES
// ============================================================================

export async function getWorkspace(workspaceId) {
  try {
    if (useKV && kv) {
      try {
        return await kv.get(`workspace:${workspaceId}`) || null;
      } catch (error) {
        const data = await getLocalData();
        return data.workspaces?.[workspaceId] || null;
      }
    }
    const data = await getLocalData();
    return data.workspaces?.[workspaceId] || null;
  } catch (error) {
    console.error('Error getting workspace:', error);
    return null;
  }
}

export async function getUserWorkspaces(userId) {
  try {
    let workspaceIds = [];
    if (useKV && kv) {
      try {
        workspaceIds = await kv.get(`user_workspaces:${userId}`) || [];
      } catch (error) {
        const data = await getLocalData();
        workspaceIds = data.userWorkspaces?.[userId] || [];
      }
    } else {
      const data = await getLocalData();
      workspaceIds = data.userWorkspaces?.[userId] || [];
    }

    const workspaces = [];
    for (const id of workspaceIds) {
      const ws = await getWorkspace(id);
      if (ws && isWorkspaceActive(ws)) workspaces.push(ws);
    }
    return workspaces;
  } catch (error) {
    console.error('Error getting user workspaces:', error);
    return [];
  }
}

export async function getUserArchivedWorkspaces(userId) {
  try {
    let workspaceIds = [];
    if (useKV && kv) {
      try {
        workspaceIds = await kv.get(`user_workspaces:${userId}`) || [];
      } catch (error) {
        const data = await getLocalData();
        workspaceIds = data.userWorkspaces?.[userId] || [];
      }
    } else {
      const data = await getLocalData();
      workspaceIds = data.userWorkspaces?.[userId] || [];
    }

    const archived = [];
    for (const id of workspaceIds) {
      const ws = await getWorkspace(id);
      if (!ws?.archived || ws.isPersonal) continue;
      const role = await getUserWorkspaceRole(userId, id);
      if (role === 'owner') archived.push(ws);
    }
    return archived.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
  } catch (error) {
    console.error('Error getting archived workspaces:', error);
    return [];
  }
}

export async function getPersonalWorkspace(userId) {
  const workspaces = await getUserWorkspaces(userId);
  return workspaces.find(w => w.isPersonal && w.ownerId === userId) || null;
}

export async function getWorkspaceMembers(workspaceId) {
  try {
    if (useKV && kv) {
      try {
        return await kv.get(`workspace_members:${workspaceId}`) || [];
      } catch (error) {
        const data = await getLocalData();
        return data.workspaceMembers?.[workspaceId] || [];
      }
    }
    const data = await getLocalData();
    return data.workspaceMembers?.[workspaceId] || [];
  } catch (error) {
    console.error('Error getting workspace members:', error);
    return [];
  }
}

async function saveWorkspaceMembers(workspaceId, members) {
  if (useKV && kv) {
    try {
      await kv.set(`workspace_members:${workspaceId}`, members);
      return;
    } catch (error) {
      const data = await getLocalData();
      if (!data.workspaceMembers) data.workspaceMembers = {};
      data.workspaceMembers[workspaceId] = members;
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (!data.workspaceMembers) data.workspaceMembers = {};
  data.workspaceMembers[workspaceId] = members;
  await saveLocalData(data);
}

async function addUserWorkspaceIndex(userId, workspaceId) {
  if (useKV && kv) {
    try {
      const key = `user_workspaces:${userId}`;
      const ids = await kv.get(key) || [];
      if (!ids.includes(workspaceId)) {
        ids.push(workspaceId);
        await kv.set(key, ids);
      }
      return;
    } catch (error) {
      const data = await getLocalData();
      if (!data.userWorkspaces) data.userWorkspaces = {};
      if (!data.userWorkspaces[userId]) data.userWorkspaces[userId] = [];
      if (!data.userWorkspaces[userId].includes(workspaceId)) {
        data.userWorkspaces[userId].push(workspaceId);
      }
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (!data.userWorkspaces) data.userWorkspaces = {};
  if (!data.userWorkspaces[userId]) data.userWorkspaces[userId] = [];
  if (!data.userWorkspaces[userId].includes(workspaceId)) {
    data.userWorkspaces[userId].push(workspaceId);
  }
  await saveLocalData(data);
}

async function removeUserWorkspaceIndex(userId, workspaceId) {
  if (useKV && kv) {
    try {
      const key = `user_workspaces:${userId}`;
      const ids = await kv.get(key) || [];
      await kv.set(key, ids.filter(id => id !== workspaceId));
      return;
    } catch (error) {
      const data = await getLocalData();
      if (data.userWorkspaces?.[userId]) {
        data.userWorkspaces[userId] = data.userWorkspaces[userId].filter(id => id !== workspaceId);
      }
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (data.userWorkspaces?.[userId]) {
    data.userWorkspaces[userId] = data.userWorkspaces[userId].filter(id => id !== workspaceId);
  }
  await saveLocalData(data);
}

export async function getUserWorkspaceRole(userId, workspaceId) {
  const members = await getWorkspaceMembers(workspaceId);
  const member = members.find(m => m.userId === userId);
  return member ? member.role : null;
}

export async function checkWorkspaceAccess(userId, workspaceId, requiredRole = 'viewer') {
  const workspace = await getWorkspace(workspaceId);
  if (!isWorkspaceActive(workspace)) return false;
  const role = await getUserWorkspaceRole(userId, workspaceId);
  if (!role) return false;
  return roleMeetsRequired(role, requiredRole);
}

export async function createWorkspace(userId, workspaceData) {
  const workspaceId = workspaceData.id || `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const name = workspaceData.name || 'Workspace';
  const requestedSlug = workspaceData.slug || slugifyWorkspaceName(name);
  const slug = await resolveUniqueWorkspaceSlug(requestedSlug);

  const workspace = {
    id: workspaceId,
    name,
    slug,
    description: workspaceData.description || '',
    ownerId: userId,
    isPersonal: workspaceData.isPersonal === true,
    archived: false,
    archivedAt: null,
    archivedBy: null,
    color: workspaceData.color || '#3B82F6',
    icon: workspaceData.icon || 'Folder',
    createdAt: now,
    updatedAt: now,
  };

  const members = [{
    userId,
    role: 'owner',
    invitedBy: userId,
    invitedAt: now,
  }];

  if (useKV && kv) {
    try {
      await kv.set(`workspace:${workspaceId}`, workspace);
      await kv.set(`workspace_members:${workspaceId}`, members);
      await kv.set(`workspace_projects:${workspaceId}`, []);
      await claimWorkspaceSlug(slug, workspaceId);
      await addUserWorkspaceIndex(userId, workspaceId);
      return workspace;
    } catch (error) {
      console.error('Error creating workspace in KV, using local fallback:', error);
    }
  }

  const data = await getLocalData();
  if (!data.workspaces) data.workspaces = {};
  if (!data.workspaceMembers) data.workspaceMembers = {};
  if (!data.workspaceProjects) data.workspaceProjects = {};
  if (!data.userWorkspaces) data.userWorkspaces = {};

  data.workspaces[workspaceId] = workspace;
  data.workspaceMembers[workspaceId] = members;
  data.workspaceProjects[workspaceId] = [];
  if (!data.workspaceSlugs) data.workspaceSlugs = {};
  data.workspaceSlugs[slug] = workspaceId;
  if (!data.userWorkspaces[userId]) data.userWorkspaces[userId] = [];
  if (!data.userWorkspaces[userId].includes(workspaceId)) {
    data.userWorkspaces[userId].push(workspaceId);
  }
  await saveLocalData(data);
  return workspace;
}

export async function createPersonalWorkspace(userId) {
  const existing = await getPersonalWorkspace(userId);
  if (existing) return existing;
  return createWorkspace(userId, {
    name: 'Personal',
    slug: `personal-${userId.slice(0, 8)}`,
    isPersonal: true,
    description: 'Workspace personal',
    color: '#6366F1',
    icon: 'Folder',
  });
}

export async function updateWorkspace(workspaceId, updates) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return null;

  const sanitized = { ...updates };
  delete sanitized.id;
  delete sanitized.ownerId;
  delete sanitized.isPersonal;

  let nextSlug = workspace.slug;
  if (sanitized.slug !== undefined) {
    const candidate = slugifyWorkspaceName(sanitized.slug);
    if (!isValidWorkspaceSlug(candidate)) {
      throw new Error('Slug inválido. Usa letras minúsculas, números y guiones.');
    }
    if (!(await isWorkspaceSlugAvailable(candidate, workspaceId))) {
      throw new Error('El slug ya está en uso por otro workspace');
    }
    nextSlug = candidate;
  } else if (sanitized.name !== undefined && sanitized.name !== workspace.name && !sanitized.slug) {
    // no auto-change slug on rename
  }

  const updated = {
    ...workspace,
    ...sanitized,
    id: workspace.id,
    ownerId: workspace.ownerId,
    isPersonal: workspace.isPersonal,
    slug: nextSlug,
    updatedAt: new Date().toISOString(),
  };

  if (nextSlug !== workspace.slug) {
    await releaseWorkspaceSlug(workspace.slug);
    await claimWorkspaceSlug(nextSlug, workspaceId);
  }

  if (useKV && kv) {
    try {
      await kv.set(`workspace:${workspaceId}`, updated);
      return updated;
    } catch (error) {
      const data = await getLocalData();
      if (data.workspaces?.[workspaceId]) {
        data.workspaces[workspaceId] = updated;
        await saveLocalData(data);
      }
      return updated;
    }
  }

  const data = await getLocalData();
  if (data.workspaces?.[workspaceId]) {
    data.workspaces[workspaceId] = updated;
    await saveLocalData(data);
  }
  return updated;
}

export async function deleteWorkspace(workspaceId, userId) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return false;
  if (workspace.isPersonal) {
    throw new Error('No se puede eliminar el workspace personal');
  }
  if (workspace.archived) {
    throw new Error('No se puede eliminar permanentemente un workspace archivado. Restáuralo primero o déjalo archivado.');
  }

  const role = await getUserWorkspaceRole(userId, workspaceId);
  if (role !== 'owner') {
    throw new Error('Solo el owner puede eliminar el workspace');
  }

  const projectIds = await getWorkspaceProjectIds(workspaceId);
  if (projectIds.length > 0) {
    throw new Error('No se puede eliminar un workspace con proyectos. Mueve o elimina los proyectos primero, o archiva el workspace.');
  }

  const members = await getWorkspaceMembers(workspaceId);

  if (useKV && kv) {
    try {
      await kv.del(`workspace:${workspaceId}`);
      await kv.del(`workspace_members:${workspaceId}`);
      await kv.del(`workspace_projects:${workspaceId}`);
      await releaseWorkspaceSlug(workspace.slug);
      for (const member of members) {
        await removeUserWorkspaceIndex(member.userId, workspaceId);
      }
      return true;
    } catch (error) {
      console.error('Error deleting workspace from KV:', error);
    }
  }

  const data = await getLocalData();
  if (data.workspaces?.[workspaceId]) delete data.workspaces[workspaceId];
  if (data.workspaceMembers?.[workspaceId]) delete data.workspaceMembers[workspaceId];
  if (data.workspaceProjects?.[workspaceId]) delete data.workspaceProjects[workspaceId];
  if (data.workspaceSlugs?.[workspace.slug]) delete data.workspaceSlugs[workspace.slug];
  for (const member of members) {
    if (data.userWorkspaces?.[member.userId]) {
      data.userWorkspaces[member.userId] = data.userWorkspaces[member.userId].filter(id => id !== workspaceId);
    }
  }
  await saveLocalData(data);
  return true;
}

export async function archiveWorkspace(workspaceId, userId) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error('Workspace no encontrado');
  if (workspace.isPersonal) {
    throw new Error('No se puede archivar el workspace personal');
  }
  if (workspace.archived) {
    throw new Error('El workspace ya está archivado');
  }

  const role = await getUserWorkspaceRole(userId, workspaceId);
  if (role !== 'owner') {
    throw new Error('Solo el owner puede archivar el workspace');
  }

  const updated = await updateWorkspace(workspaceId, {
    archived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: userId,
  });
  return updated;
}

export async function restoreWorkspace(workspaceId, userId) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error('Workspace no encontrado');
  if (!workspace.archived) {
    throw new Error('El workspace no está archivado');
  }

  const role = await getUserWorkspaceRole(userId, workspaceId);
  if (role !== 'owner') {
    throw new Error('Solo el owner puede restaurar el workspace');
  }

  const updated = await updateWorkspace(workspaceId, {
    archived: false,
    archivedAt: null,
    archivedBy: null,
  });
  return updated;
}

export async function mergeWorkspaces(sourceWorkspaceId, targetWorkspaceId, userId) {
  if (sourceWorkspaceId === targetWorkspaceId) {
    throw new Error('El workspace origen y destino deben ser distintos');
  }

  const source = await getWorkspace(sourceWorkspaceId);
  const target = await getWorkspace(targetWorkspaceId);
  if (!source || !target) throw new Error('Workspace no encontrado');
  if (source.isPersonal || target.isPersonal) {
    throw new Error('No se puede fusionar workspaces personales');
  }
  if (source.archived) throw new Error('El workspace origen está archivado');
  if (target.archived) throw new Error('El workspace destino está archivado');

  const sourceRole = await getUserWorkspaceRole(userId, sourceWorkspaceId);
  if (sourceRole !== 'owner') {
    throw new Error('Solo el owner del workspace origen puede fusionarlo');
  }

  const hasTargetAccess = await checkWorkspaceAccess(userId, targetWorkspaceId, 'admin');
  if (!hasTargetAccess) {
    throw new Error('Necesitas rol admin o superior en el workspace destino');
  }

  const projectIds = await getWorkspaceProjectIds(sourceWorkspaceId);
  const movedProjects = [];
  for (const projectId of projectIds) {
    const result = await moveProject(projectId, targetWorkspaceId, userId, { inviteCollaborators: true });
    movedProjects.push(result);
  }

  const sourceMembers = await getWorkspaceMembers(sourceWorkspaceId);
  const targetMembers = await getWorkspaceMembers(targetWorkspaceId);
  const targetByUser = new Map(targetMembers.map(m => [m.userId, m.role]));

  for (const member of sourceMembers) {
    const existingRole = targetByUser.get(member.userId);
    if (!existingRole) {
      await addWorkspaceMember(targetWorkspaceId, member.userId, member.role, userId);
      targetByUser.set(member.userId, member.role);
    } else {
      const merged = mergeMemberRole(existingRole, member.role);
      if (merged !== existingRole) {
        await updateWorkspaceMemberRole(targetWorkspaceId, member.userId, merged);
        targetByUser.set(member.userId, merged);
      }
    }
  }

  await archiveWorkspace(sourceWorkspaceId, userId);

  return {
    sourceWorkspaceId,
    targetWorkspaceId,
    movedProjectCount: movedProjects.length,
    movedProjects,
  };
}

export async function getWorkspaceProjects(workspaceId) {
  const projectIds = await getWorkspaceProjectIds(workspaceId);
  const projects = [];
  for (const id of projectIds) {
    const project = await getProject(id);
    if (project) projects.push(project);
  }
  return projects;
}

export async function addWorkspaceMember(workspaceId, memberUserId, role, invitedBy) {
  const members = await getWorkspaceMembers(workspaceId);
  const existingIndex = members.findIndex(m => m.userId === memberUserId);
  const entry = {
    userId: memberUserId,
    role,
    invitedBy,
    invitedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    members[existingIndex] = { ...members[existingIndex], ...entry };
  } else {
    members.push(entry);
  }

  await saveWorkspaceMembers(workspaceId, members);
  await addUserWorkspaceIndex(memberUserId, workspaceId);
  return true;
}

export async function removeWorkspaceMember(workspaceId, memberUserId) {
  const members = await getWorkspaceMembers(workspaceId);
  const member = members.find(m => m.userId === memberUserId);
  if (!member) return false;
  if (member.role === 'owner') {
    const owners = members.filter(m => m.role === 'owner');
    if (owners.length <= 1) {
      throw new Error('No se puede remover al único owner del workspace');
    }
  }

  await saveWorkspaceMembers(workspaceId, members.filter(m => m.userId !== memberUserId));
  await removeUserWorkspaceIndex(memberUserId, workspaceId);
  return true;
}

export async function updateWorkspaceMemberRole(workspaceId, memberUserId, newRole) {
  const members = await getWorkspaceMembers(workspaceId);
  const index = members.findIndex(m => m.userId === memberUserId);
  if (index < 0) return false;
  members[index].role = newRole;
  await saveWorkspaceMembers(workspaceId, members);
  return true;
}

export async function createPendingWorkspaceInvitation(email, workspaceId, role, invitedBy) {
  const invitation = {
    workspaceId,
    role,
    invitedBy,
    invitedAt: new Date().toISOString(),
  };
  const normalizedEmail = email.toLowerCase().trim();
  const key = `pending_workspace_invitations:${normalizedEmail}`;

  if (useKV && kv) {
    try {
      const existing = await kv.get(key) || [];
      const filtered = existing.filter(i => i.workspaceId !== workspaceId);
      filtered.push(invitation);
      await kv.set(key, filtered);
      return true;
    } catch (error) {
      const data = await getLocalData();
      if (!data.pendingWorkspaceInvitations) data.pendingWorkspaceInvitations = {};
      const list = data.pendingWorkspaceInvitations[normalizedEmail] || [];
      data.pendingWorkspaceInvitations[normalizedEmail] = [
        ...list.filter(i => i.workspaceId !== workspaceId),
        invitation,
      ];
      await saveLocalData(data);
      return true;
    }
  }

  const data = await getLocalData();
  if (!data.pendingWorkspaceInvitations) data.pendingWorkspaceInvitations = {};
  const list = data.pendingWorkspaceInvitations[normalizedEmail] || [];
  data.pendingWorkspaceInvitations[normalizedEmail] = [
    ...list.filter(i => i.workspaceId !== workspaceId),
    invitation,
  ];
  await saveLocalData(data);
  return true;
}

export async function ensureUserWorkspaceSetup(userId) {
  const personal = await createPersonalWorkspace(userId);

  let ownedProjectIds = [];
  if (useKV && kv) {
    try {
      ownedProjectIds = await kv.get(`user_projects:${userId}`) || [];
    } catch (error) {
      const data = await getLocalData();
      ownedProjectIds = data.userProjects?.[userId] || [];
    }
  } else {
    const data = await getLocalData();
    ownedProjectIds = data.userProjects?.[userId] || [];
  }

  for (const projectId of ownedProjectIds) {
    const project = await getProject(projectId);
    if (!project || project.workspaceId) continue;
    if (project.ownerId !== userId) continue;

    const permissions = await getProjectPermissions(projectId);
    if (permissions.length > 1) continue;

    await updateProject(projectId, { workspaceId: personal.id });
    await addProjectToWorkspaceIndex(personal.id, projectId);
  }

  await rebuildUserProjectAccessIndex(userId);

  return personal;
}

// ============================================================================
// ÍNDICE user_project_access (evita kv.keys en proyectos compartidos)
// ============================================================================

async function getUserProjectAccessIds(userId) {
  if (useKV && kv) {
    try {
      return await kv.get(`user_project_access:${userId}`) || [];
    } catch {
      const data = await getLocalData();
      return data.userProjectAccess?.[userId] || [];
    }
  }
  const data = await getLocalData();
  return data.userProjectAccess?.[userId] || [];
}

async function addUserProjectAccessIndex(userId, projectId) {
  if (!userId || !projectId) return;
  const ids = await getUserProjectAccessIds(userId);
  if (ids.includes(projectId)) return;

  if (useKV && kv) {
    try {
      await kv.set(`user_project_access:${userId}`, [...ids, projectId]);
      return;
    } catch {
      const data = await getLocalData();
      if (!data.userProjectAccess) data.userProjectAccess = {};
      if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
      data.userProjectAccess[userId].push(projectId);
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (!data.userProjectAccess) data.userProjectAccess = {};
  if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
  if (!data.userProjectAccess[userId].includes(projectId)) {
    data.userProjectAccess[userId].push(projectId);
  }
  await saveLocalData(data);
}

async function removeUserProjectAccessIndex(userId, projectId) {
  const ids = (await getUserProjectAccessIds(userId)).filter(id => id !== projectId);
  if (useKV && kv) {
    try {
      await kv.set(`user_project_access:${userId}`, ids);
      return;
    } catch {
      const data = await getLocalData();
      if (!data.userProjectAccess) data.userProjectAccess = {};
      data.userProjectAccess[userId] = ids;
      await saveLocalData(data);
      return;
    }
  }
  const data = await getLocalData();
  if (!data.userProjectAccess) data.userProjectAccess = {};
  data.userProjectAccess[userId] = ids;
  await saveLocalData(data);
}

export async function rebuildUserProjectAccessIndex(userId) {
  const projectIds = new Set();
  const owned = useKV && kv
    ? (await kv.get(`user_projects:${userId}`)) || []
    : (await getLocalData()).userProjects?.[userId] || [];
  owned.forEach(id => projectIds.add(id));

  if (useKV && kv) {
    try {
      const permKeys = await kv.keys('project_permissions:*');
      for (const key of permKeys) {
        const projectId = key.replace('project_permissions:', '');
        const perms = await kv.get(key) || [];
        if (perms.some(p => p.userId === userId)) projectIds.add(projectId);
      }
    } catch { /* ignore */ }
  } else {
    const data = await getLocalData();
    if (data.projectPermissions) {
      for (const [projectId, perms] of Object.entries(data.projectPermissions)) {
        if (perms.some(p => p.userId === userId)) projectIds.add(projectId);
      }
    }
  }

  const list = Array.from(projectIds);
  if (useKV && kv) {
    try {
      await kv.set(`user_project_access:${userId}`, list);
    } catch {
      const data = await getLocalData();
      if (!data.userProjectAccess) data.userProjectAccess = {};
      data.userProjectAccess[userId] = list;
      await saveLocalData(data);
    }
  } else {
    const data = await getLocalData();
    if (!data.userProjectAccess) data.userProjectAccess = {};
    data.userProjectAccess[userId] = list;
    await saveLocalData(data);
  }
  return list;
}

export async function moveProject(projectId, targetWorkspaceId, userId, options = {}) {
  const { inviteCollaborators = true } = options;
  const project = await getProject(projectId);
  if (!project) throw new Error('Proyecto no encontrado');

  const sourceWorkspaceId = project.workspaceId;
  if (!sourceWorkspaceId) throw new Error('El proyecto no tiene workspace asignado');

  const hasSourceAccess = await checkWorkspaceAccess(userId, sourceWorkspaceId, 'admin');
  if (!hasSourceAccess) throw new Error('No tienes permiso para mover este proyecto');

  const hasTargetAccess = await checkWorkspaceAccess(userId, targetWorkspaceId, 'editor');
  if (!hasTargetAccess) throw new Error('No tienes permiso en el workspace destino');

  const targetWorkspace = await getWorkspace(targetWorkspaceId);
  if (!targetWorkspace) throw new Error('Workspace destino no encontrado');

  const permissions = await getProjectPermissions(projectId);
  const externalCollaborators = permissions.filter(p => p.userId !== project.ownerId);

  if (targetWorkspace.isPersonal && externalCollaborators.length > 0) {
    throw new Error('No se puede mover a workspace personal un proyecto con colaboradores externos');
  }

  for (const perm of permissions) {
    if (perm.userId === userId) continue;
    const wsRole = await getUserWorkspaceRole(perm.userId, targetWorkspaceId);
    if (!wsRole) {
      if (inviteCollaborators) {
        await addWorkspaceMember(targetWorkspaceId, perm.userId, 'viewer', userId);
      } else {
        throw new Error(`El colaborador ${perm.userId} no es miembro del workspace destino`);
      }
    }
  }

  await updateProject(projectId, { workspaceId: targetWorkspaceId });
  await removeProjectFromWorkspaceIndex(sourceWorkspaceId, projectId);
  await addProjectToWorkspaceIndex(targetWorkspaceId, projectId);

  return {
    projectId,
    sourceWorkspaceId,
    targetWorkspaceId,
    workspaceId: targetWorkspaceId,
  };
}

async function getProjectRoleFromPermissions(userId, projectId) {
  const permissions = await getProjectPermissions(projectId);
  const permission = permissions.find(p => p.userId === userId);
  return permission ? permission.role : null;
}

export async function getEffectiveProjectRole(userId, projectId) {
  const project = await getProject(projectId);
  if (!project) return null;

  if (!project.workspaceId) {
    return getProjectRoleFromPermissions(userId, projectId);
  }

  const workspaceRole = await getUserWorkspaceRole(userId, project.workspaceId);
  if (!workspaceRole) return null;

  const workspace = await getWorkspace(project.workspaceId);
  if (!isWorkspaceActive(workspace)) return null;

  const projectRole = await getProjectRoleFromPermissions(userId, projectId);
  if (projectRole) {
    return minRole(workspaceRole, projectRole);
  }
  return workspaceRole;
}

// ============================================================================
// FUNCIONES DE PROYECTOS
// ============================================================================

/**
 * Crea un nuevo proyecto
 * @param {string} userId - ID del usuario creador
 * @param {Object} projectData - Datos del proyecto
 * @returns {Promise<Object>} Proyecto creado
 */
export async function createProject(userId, projectData) {
  try {
    const workspaceId = projectData.workspaceId;
    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }

    const hasAccess = await checkWorkspaceAccess(userId, workspaceId, 'editor');
    if (!hasAccess) {
      throw new Error('No tienes permiso para crear proyectos en este workspace');
    }

    const projectId = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const project = {
      id: projectId,
      name: projectData.name,
      slug: projectData.slug || projectData.name.toLowerCase().replace(/\s+/g, '-'),
      description: projectData.description || '',
      ownerId: userId,
      workspaceId,
      isPersonal: projectData.isPersonal !== undefined ? projectData.isPersonal : true,
      color: projectData.color || '#3B82F6',
      icon: projectData.icon || '📁',
      createdAt: now,
      updatedAt: now,
    };

    if (useKV && kv) {
      try {
        // Guardar proyecto
        await kv.set(`project:${projectId}`, project);
        
        // Agregar a la lista de proyectos del usuario
        const userProjectsKey = `user_projects:${userId}`;
        const userProjects = await kv.get(userProjectsKey) || [];
        if (!userProjects.includes(projectId)) {
          userProjects.push(projectId);
          await kv.set(userProjectsKey, userProjects);
        }
        
        // Crear permisos iniciales (owner)
        const permissions = [{
          userId,
          role: 'owner',
          invitedBy: userId,
          invitedAt: now,
        }];
        await kv.set(`project_permissions:${projectId}`, permissions);
        
        await addProjectToWorkspaceIndex(workspaceId, projectId);
        await addUserProjectAccessIndex(userId, projectId);
        
        return project;
      } catch (error) {
        console.error('Error al crear proyecto en KV, usando fallback local:', error);
        // Fallback a local
        const data = await getLocalData();
        if (!data.projects) data.projects = {};
        if (!data.userProjects) data.userProjects = {};
        if (!data.projectPermissions) data.projectPermissions = {};
        
        data.projects[projectId] = project;
        if (!data.userProjects[userId]) data.userProjects[userId] = [];
        if (!data.userProjects[userId].includes(projectId)) {
          data.userProjects[userId].push(projectId);
        }
        data.projectPermissions[projectId] = [{
          userId,
          role: 'owner',
          invitedBy: userId,
          invitedAt: now,
        }];
        
        if (!data.workspaceProjects) data.workspaceProjects = {};
        if (!data.workspaceProjects[workspaceId]) data.workspaceProjects[workspaceId] = [];
        if (!data.workspaceProjects[workspaceId].includes(projectId)) {
          data.workspaceProjects[workspaceId].push(projectId);
        }
        if (!data.userProjectAccess) data.userProjectAccess = {};
        if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
        if (!data.userProjectAccess[userId].includes(projectId)) {
          data.userProjectAccess[userId].push(projectId);
        }
        
        await saveLocalData(data);
        return project;
      }
    } else {
      const data = await getLocalData();
      if (!data.projects) data.projects = {};
      if (!data.userProjects) data.userProjects = {};
      if (!data.projectPermissions) data.projectPermissions = {};
      
      data.projects[projectId] = project;
      if (!data.userProjects[userId]) data.userProjects[userId] = [];
      if (!data.userProjects[userId].includes(projectId)) {
        data.userProjects[userId].push(projectId);
      }
      data.projectPermissions[projectId] = [{
        userId,
        role: 'owner',
        invitedBy: userId,
        invitedAt: now,
      }];
      
      if (!data.workspaceProjects) data.workspaceProjects = {};
      if (!data.workspaceProjects[workspaceId]) data.workspaceProjects[workspaceId] = [];
      if (!data.workspaceProjects[workspaceId].includes(projectId)) {
        data.workspaceProjects[workspaceId].push(projectId);
      }
      if (!data.userProjectAccess) data.userProjectAccess = {};
      if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
      if (!data.userProjectAccess[userId].includes(projectId)) {
        data.userProjectAccess[userId].push(projectId);
      }
      
      await saveLocalData(data);
      return project;
    }
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Obtiene un proyecto por ID
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<Object|null>} Proyecto o null si no existe
 */
export async function getProject(projectId) {
  try {
    if (useKV && kv) {
      try {
        const project = await kv.get(`project:${projectId}`);
        return project || null;
      } catch (error) {
        console.error('Error al obtener proyecto de KV, usando fallback local:', error);
        const data = await getLocalData();
        return data.projects?.[projectId] || null;
      }
    } else {
      const data = await getLocalData();
      return data.projects?.[projectId] || null;
    }
  } catch (error) {
    console.error('Error getting project:', error);
    return null;
  }
}

/**
 * Obtiene todos los proyectos accesibles por un usuario
 * @param {string} userId - ID del usuario
 * @param {Object} [options] - Opciones de filtrado
 * @param {string} [options.workspaceId] - Filtrar por workspace
 * @returns {Promise<Array>} Array de proyectos
 */
export async function getUserProjects(userId, options = {}) {
  try {
    const { workspaceId: filterWorkspaceId } = options;
    const projectMap = new Map();

    const addIfAccessible = async (projectId) => {
      if (projectMap.has(projectId)) return;
      const hasAccess = await checkProjectAccess(userId, projectId, 'viewer');
      if (!hasAccess) return;
      const project = await getProject(projectId);
      if (project) projectMap.set(projectId, project);
    };

    if (filterWorkspaceId) {
      const projectIds = await getWorkspaceProjectIds(filterWorkspaceId);
      for (const projectId of projectIds) {
        await addIfAccessible(projectId);
      }
      return Array.from(projectMap.values());
    }

    const workspaces = await getUserWorkspaces(userId);
    for (const ws of workspaces) {
      const projectIds = await getWorkspaceProjectIds(ws.id);
      for (const projectId of projectIds) {
        await addIfAccessible(projectId);
      }
    }

    // Legacy: proyectos sin workspaceId
    if (useKV && kv) {
      try {
        const userProjectsKey = `user_projects:${userId}`;
        const projectIds = await kv.get(userProjectsKey) || [];

        for (const projectId of projectIds) {
          const project = await getProject(projectId);
          if (project && !project.workspaceId) {
            await addIfAccessible(projectId);
          }
        }

        const accessIds = await getUserProjectAccessIds(userId);
        for (const projectId of accessIds) {
          if (projectMap.has(projectId)) continue;
          const project = await getProject(projectId);
          if (project && !project.workspaceId) {
            await addIfAccessible(projectId);
          }
        }
      } catch (error) {
        console.error('Error al obtener proyectos de KV, usando fallback local:', error);
        const data = await getLocalData();
        const projectIds = data.userProjects?.[userId] || [];
        for (const projectId of projectIds) {
          const project = data.projects?.[projectId];
          if (project && !project.workspaceId) {
            await addIfAccessible(projectId);
          }
        }
        if (data.projectPermissions) {
          for (const [projId, permissions] of Object.entries(data.projectPermissions)) {
            if (projectMap.has(projId)) continue;
            const project = data.projects?.[projId];
            if (project?.workspaceId) continue;
            if (permissions.some(p => p.userId === userId)) {
              await addIfAccessible(projId);
            }
          }
        }
      }
    } else {
      const data = await getLocalData();
      const projectIds = data.userProjects?.[userId] || [];
      for (const projectId of projectIds) {
        const project = data.projects?.[projectId];
        if (project && !project.workspaceId) {
          await addIfAccessible(projectId);
        }
      }
      if (data.projectPermissions) {
        for (const [projId, permissions] of Object.entries(data.projectPermissions)) {
          if (projectMap.has(projId)) continue;
          const project = data.projects?.[projId];
          if (project?.workspaceId) continue;
          if (permissions.some(p => p.userId === userId)) {
            await addIfAccessible(projId);
          }
        }
      }
    }

    return Array.from(projectMap.values());
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Actualiza un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object|null>} Proyecto actualizado o null si no existe
 */
export async function updateProject(projectId, updates) {
  try {
    const project = await getProject(projectId);
    if (!project) return null;
    
    const updated = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    if (useKV && kv) {
      try {
        await kv.set(`project:${projectId}`, updated);
        return updated;
      } catch (error) {
        console.error('Error al actualizar proyecto en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.projects?.[projectId]) {
          data.projects[projectId] = updated;
          await saveLocalData(data);
        }
        return updated;
      }
    } else {
      const data = await getLocalData();
      if (data.projects?.[projectId]) {
        data.projects[projectId] = updated;
        await saveLocalData(data);
      }
      return updated;
    }
  } catch (error) {
    console.error('Error updating project:', error);
    return null;
  }
}

/**
 * Elimina un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario que intenta eliminar
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteProject(projectId, userId) {
  try {
    // Verificar que el usuario es owner
    const role = await getUserProjectRole(userId, projectId);
    if (role !== 'owner') {
      throw new Error('Solo el owner puede eliminar el proyecto');
    }
    
    const project = await getProject(projectId);
    
    if (useKV && kv) {
      try {
        // Eliminar proyecto
        await kv.del(`project:${projectId}`);
        
        // Eliminar permisos
        await kv.del(`project_permissions:${projectId}`);
        
        // Eliminar de la lista de proyectos del usuario
        const userProjectsKey = `user_projects:${userId}`;
        const userProjects = await kv.get(userProjectsKey) || [];
        const filtered = userProjects.filter(id => id !== projectId);
        await kv.set(userProjectsKey, filtered);
        
        // Eliminar flujos del proyecto
        await kv.del(`project_flows:${projectId}`);

        if (project?.workspaceId) {
          await removeProjectFromWorkspaceIndex(project.workspaceId, projectId);
        }
        
        return true;
      } catch (error) {
        console.error('Error al eliminar proyecto de KV, usando fallback local:', error);
        const data = await getLocalData();
        const localProject = data.projects?.[projectId];
        if (data.projects?.[projectId]) {
          delete data.projects[projectId];
        }
        if (data.projectPermissions?.[projectId]) {
          delete data.projectPermissions[projectId];
        }
        if (data.userProjects?.[userId]) {
          data.userProjects[userId] = data.userProjects[userId].filter(id => id !== projectId);
        }
        if (data.projectFlows?.[projectId]) {
          delete data.projectFlows[projectId];
        }
        if (localProject?.workspaceId && data.workspaceProjects?.[localProject.workspaceId]) {
          data.workspaceProjects[localProject.workspaceId] = data.workspaceProjects[localProject.workspaceId].filter(id => id !== projectId);
        }
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      const localProject = data.projects?.[projectId];
      if (data.projects?.[projectId]) {
        delete data.projects[projectId];
      }
      if (data.projectPermissions?.[projectId]) {
        delete data.projectPermissions[projectId];
      }
      if (data.userProjects?.[userId]) {
        data.userProjects[userId] = data.userProjects[userId].filter(id => id !== projectId);
      }
      if (data.projectFlows?.[projectId]) {
        delete data.projectFlows[projectId];
      }
      if (localProject?.workspaceId && data.workspaceProjects?.[localProject.workspaceId]) {
        data.workspaceProjects[localProject.workspaceId] = data.workspaceProjects[localProject.workspaceId].filter(id => id !== projectId);
      }
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

// ============================================================================
// FUNCIONES DE PERMISOS
// ============================================================================

/**
 * Obtiene los permisos de un proyecto
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<Array>} Array de permisos
 */
export async function getProjectPermissions(projectId) {
  try {
    if (useKV && kv) {
      try {
        const permissions = await kv.get(`project_permissions:${projectId}`);
        return permissions || [];
      } catch (error) {
        console.error('Error al obtener permisos de KV, usando fallback local:', error);
        const data = await getLocalData();
        return data.projectPermissions?.[projectId] || [];
      }
    } else {
      const data = await getLocalData();
      return data.projectPermissions?.[projectId] || [];
    }
  } catch (error) {
    console.error('Error getting project permissions:', error);
    return [];
  }
}

/**
 * Obtiene el rol de un usuario en un proyecto
 * @param {string} userId - ID del usuario
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<string|null>} Rol del usuario o null si no tiene acceso
 */
export async function getUserProjectRole(userId, projectId) {
  return getEffectiveProjectRole(userId, projectId);
}

/**
 * Verifica si un usuario tiene acceso a un proyecto con un rol específico
 * @param {string} userId - ID del usuario
 * @param {string} projectId - ID del proyecto
 * @param {string} requiredRole - Rol requerido ('owner', 'editor', 'viewer')
 * @returns {Promise<boolean>} true si tiene acceso
 */
export async function checkProjectAccess(userId, projectId, requiredRole = 'viewer') {
  try {
    const role = await getEffectiveProjectRole(userId, projectId);
    if (!role) return false;
    return roleMeetsRequired(role, requiredRole);
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
}

async function syncProjectPersonalFlag(projectId) {
  const permissions = await getProjectPermissions(projectId);
  await updateProject(projectId, { isPersonal: permissions.length <= 1 });
}

/**
 * Agrega un permiso a un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {string} role - Rol ('owner', 'editor', 'viewer')
 * @param {string} invitedBy - ID del usuario que invita
 * @returns {Promise<boolean>} true si se agregó correctamente
 */
export async function addProjectPermission(projectId, userId, role, invitedBy) {
  try {
    const permissions = await getProjectPermissions(projectId);
    
    // Verificar si ya existe
    const existingIndex = permissions.findIndex(p => p.userId === userId);
    if (existingIndex >= 0) {
      // Actualizar rol existente
      permissions[existingIndex].role = role;
      permissions[existingIndex].invitedBy = invitedBy;
      permissions[existingIndex].invitedAt = new Date().toISOString();
    } else {
      // Agregar nuevo permiso
      permissions.push({
        userId,
        role,
        invitedBy,
        invitedAt: new Date().toISOString(),
      });
    }
    
    if (useKV && kv) {
      try {
        await kv.set(`project_permissions:${projectId}`, permissions);
        
        // Agregar a la lista de proyectos del usuario
        const userProjectsKey = `user_projects:${userId}`;
        const userProjects = await kv.get(userProjectsKey) || [];
        if (!userProjects.includes(projectId)) {
          userProjects.push(projectId);
          await kv.set(userProjectsKey, userProjects);
        }
        
        await addUserProjectAccessIndex(userId, projectId);
        
        await syncProjectPersonalFlag(projectId);
        return true;
      } catch (error) {
        console.error('Error al guardar permiso en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (!data.projectPermissions) data.projectPermissions = {};
        if (!data.userProjects) data.userProjects = {};
        
        data.projectPermissions[projectId] = permissions;
        if (!data.userProjects[userId]) data.userProjects[userId] = [];
        if (!data.userProjects[userId].includes(projectId)) {
          data.userProjects[userId].push(projectId);
        }
        if (!data.userProjectAccess) data.userProjectAccess = {};
        if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
        if (!data.userProjectAccess[userId].includes(projectId)) {
          data.userProjectAccess[userId].push(projectId);
        }
        await saveLocalData(data);
        await syncProjectPersonalFlag(projectId);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data.projectPermissions) data.projectPermissions = {};
      if (!data.userProjects) data.userProjects = {};
      
      data.projectPermissions[projectId] = permissions;
      if (!data.userProjects[userId]) data.userProjects[userId] = [];
      if (!data.userProjects[userId].includes(projectId)) {
        data.userProjects[userId].push(projectId);
      }
      if (!data.userProjectAccess) data.userProjectAccess = {};
      if (!data.userProjectAccess[userId]) data.userProjectAccess[userId] = [];
      if (!data.userProjectAccess[userId].includes(projectId)) {
        data.userProjectAccess[userId].push(projectId);
      }
      await saveLocalData(data);
      await syncProjectPersonalFlag(projectId);
      return true;
    }
  } catch (error) {
    console.error('Error adding project permission:', error);
    return false;
  }
}

/**
 * Remueve un permiso de un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si se removió correctamente
 */
export async function removeProjectPermission(projectId, userId) {
  try {
    const permissions = await getProjectPermissions(projectId);
    const filtered = permissions.filter(p => p.userId !== userId);
    
    if (useKV && kv) {
      try {
        await kv.set(`project_permissions:${projectId}`, filtered);
        
        // Remover de la lista de proyectos del usuario
        const userProjectsKey = `user_projects:${userId}`;
        const userProjects = await kv.get(userProjectsKey) || [];
        const filteredProjects = userProjects.filter(id => id !== projectId);
        await kv.set(userProjectsKey, filteredProjects);
        
        await removeUserProjectAccessIndex(userId, projectId);
        
        await syncProjectPersonalFlag(projectId);
        return true;
      } catch (error) {
        console.error('Error al remover permiso de KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.projectPermissions?.[projectId]) {
          data.projectPermissions[projectId] = filtered;
        }
        if (data.userProjects?.[userId]) {
          data.userProjects[userId] = data.userProjects[userId].filter(id => id !== projectId);
        }
        if (data.userProjectAccess?.[userId]) {
          data.userProjectAccess[userId] = data.userProjectAccess[userId].filter(id => id !== projectId);
        }
        await saveLocalData(data);
        await syncProjectPersonalFlag(projectId);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (data.projectPermissions?.[projectId]) {
        data.projectPermissions[projectId] = filtered;
      }
      if (data.userProjects?.[userId]) {
        data.userProjects[userId] = data.userProjects[userId].filter(id => id !== projectId);
      }
      if (data.userProjectAccess?.[userId]) {
        data.userProjectAccess[userId] = data.userProjectAccess[userId].filter(id => id !== projectId);
      }
      await saveLocalData(data);
      await syncProjectPersonalFlag(projectId);
      return true;
    }
  } catch (error) {
    console.error('Error removing project permission:', error);
    return false;
  }
}

/**
 * Actualiza el rol de un usuario en un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {string} newRole - Nuevo rol
 * @returns {Promise<boolean>} true si se actualizó correctamente
 */
export async function updateProjectPermission(projectId, userId, newRole) {
  try {
    const permissions = await getProjectPermissions(projectId);
    const index = permissions.findIndex(p => p.userId === userId);
    
    if (index < 0) {
      return false;
    }
    
    permissions[index].role = newRole;
    
    if (useKV && kv) {
      try {
        await kv.set(`project_permissions:${projectId}`, permissions);
        return true;
      } catch (error) {
        console.error('Error al actualizar permiso en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.projectPermissions?.[projectId]) {
          data.projectPermissions[projectId] = permissions;
        }
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (data.projectPermissions?.[projectId]) {
        data.projectPermissions[projectId] = permissions;
      }
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error updating project permission:', error);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE INVITACIONES PENDIENTES
// ============================================================================

/**
 * Crea una invitación pendiente para un email
 * @param {string} email - Email del usuario invitado
 * @param {string} projectId - ID del proyecto
 * @param {string} role - Rol asignado
 * @param {string} invitedBy - ID del usuario que invita
 * @returns {Promise<boolean>} true si se creó correctamente
 */
export async function createPendingInvitation(email, projectId, role, invitedBy) {
  try {
    const normalized = normalizeEmail(email);
    const invitation = {
      projectId,
      role,
      invitedBy,
      invitedAt: new Date().toISOString(),
    };
    
    if (useKV && kv) {
      try {
        const key = `pending_invitations:${normalized}`;
        const invitations = await kv.get(key) || [];
        
        // Verificar si ya existe una invitación para este proyecto
        const existingIndex = invitations.findIndex(inv => inv.projectId === projectId);
        if (existingIndex >= 0) {
          invitations[existingIndex] = invitation;
        } else {
          invitations.push(invitation);
        }
        
        await kv.set(key, invitations);
        return true;
      } catch (error) {
        console.error('Error al crear invitación en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (!data.pendingInvitations) data.pendingInvitations = {};
        if (!data.pendingInvitations[normalized]) data.pendingInvitations[normalized] = [];
        
        const existingIndex = data.pendingInvitations[normalized].findIndex(inv => inv.projectId === projectId);
        if (existingIndex >= 0) {
          data.pendingInvitations[normalized][existingIndex] = invitation;
        } else {
          data.pendingInvitations[normalized].push(invitation);
        }
        
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data.pendingInvitations) data.pendingInvitations = {};
      if (!data.pendingInvitations[normalized]) data.pendingInvitations[normalized] = [];
      
      const existingIndex = data.pendingInvitations[normalized].findIndex(inv => inv.projectId === projectId);
      if (existingIndex >= 0) {
        data.pendingInvitations[normalized][existingIndex] = invitation;
      } else {
        data.pendingInvitations[normalized].push(invitation);
      }
      
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error creating pending invitation:', error);
    return false;
  }
}

/**
 * Obtiene las invitaciones pendientes de un email
 * @param {string} email - Email del usuario
 * @returns {Promise<Array>} Array de invitaciones
 */
export async function getPendingInvitations(email) {
  try {
    const normalized = normalizeEmail(email);
    if (useKV && kv) {
      try {
        const key = `pending_invitations:${normalized}`;
        const invitations = await kv.get(key);
        return invitations || [];
      } catch (error) {
        console.error('Error al obtener invitaciones de KV, usando fallback local:', error);
        const data = await getLocalData();
        return data.pendingInvitations?.[normalized] || [];
      }
    } else {
      const data = await getLocalData();
      return data.pendingInvitations?.[normalized] || [];
    }
  } catch (error) {
    console.error('Error getting pending invitations:', error);
    return [];
  }
}

/**
 * Acepta una invitación pendiente cuando el usuario se registra
 * @param {string} email - Email del usuario
 * @param {string} userId - ID del usuario recién registrado
 * @returns {Promise<boolean>} true si se aceptaron las invitaciones
 */
export async function acceptInvitation(email, userId) {
  try {
    const normalized = normalizeEmail(email);
    const invitations = await getPendingInvitations(normalized);
    
    for (const invitation of invitations) {
      await addProjectPermission(
        invitation.projectId,
        userId,
        invitation.role,
        invitation.invitedBy
      );
    }
    
    if (useKV && kv) {
      try {
        await kv.del(`pending_invitations:${normalized}`);
      } catch (error) {
        console.error('Error al eliminar invitaciones de KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.pendingInvitations?.[normalized]) {
          delete data.pendingInvitations[normalized];
        }
        await saveLocalData(data);
      }
    } else {
      const data = await getLocalData();
      if (data.pendingInvitations?.[normalized]) {
        delete data.pendingInvitations[normalized];
      }
      await saveLocalData(data);
    }
    
    return true;
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return false;
  }
}

export async function getPendingWorkspaceInvitations(email) {
  try {
    const normalized = normalizeEmail(email);
    const key = `pending_workspace_invitations:${normalized}`;
    if (useKV && kv) {
      try {
        return await kv.get(key) || [];
      } catch (error) {
        const data = await getLocalData();
        return data.pendingWorkspaceInvitations?.[normalized] || [];
      }
    }
    const data = await getLocalData();
    return data.pendingWorkspaceInvitations?.[normalized] || [];
  } catch (error) {
    console.error('Error getting pending workspace invitations:', error);
    return [];
  }
}

export async function acceptWorkspaceInvitation(email, userId) {
  try {
    const normalized = normalizeEmail(email);
    const invitations = await getPendingWorkspaceInvitations(normalized);

    for (const invitation of invitations) {
      const workspace = await getWorkspace(invitation.workspaceId);
      if (!isWorkspaceActive(workspace)) continue;
      await addWorkspaceMember(
        invitation.workspaceId,
        userId,
        invitation.role,
        invitation.invitedBy
      );
    }

    const key = `pending_workspace_invitations:${normalized}`;
    if (useKV && kv) {
      try {
        await kv.del(key);
      } catch (error) {
        const data = await getLocalData();
        if (data.pendingWorkspaceInvitations?.[normalized]) {
          delete data.pendingWorkspaceInvitations[normalized];
        }
        await saveLocalData(data);
      }
    } else {
      const data = await getLocalData();
      if (data.pendingWorkspaceInvitations?.[normalized]) {
        delete data.pendingWorkspaceInvitations[normalized];
      }
      await saveLocalData(data);
    }

    return true;
  } catch (error) {
    console.error('Error accepting workspace invitation:', error);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE FLUJOS MODIFICADAS PARA PROYECTOS
// ============================================================================

/**
 * Obtiene todos los flujos de un proyecto
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<Array>} Array de flujos
 */
export async function getProjectFlows(projectId) {
  try {
    if (useKV && kv) {
      try {
        const key = `project_flows:${projectId}`;
        const flows = await kv.get(key);
        return flows || [];
      } catch (error) {
        console.error('Error al obtener flujos del proyecto de KV, usando fallback local:', error);
        const data = await getLocalData();
        return data.projectFlows?.[projectId] || [];
      }
    } else {
      const data = await getLocalData();
      return data.projectFlows?.[projectId] || [];
    }
  } catch (error) {
    console.error('Error getting project flows:', error);
    return [];
  }
}

/**
 * Obtiene todos los flujos accesibles por un usuario (de todos sus proyectos)
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Array de flujos con información del proyecto
 */
export async function getAllFlowsForUser(userId) {
  try {
    const projects = await getUserProjects(userId);
    const allFlows = [];
    
    for (const project of projects) {
      const flows = await getProjectFlows(project.id);
      const flowsWithProject = flows.map(flow => ({
        ...flow,
        projectId: project.id,
        projectName: project.name,
        projectIcon: project.icon,
        projectColor: project.color,
      }));
      allFlows.push(...flowsWithProject);
    }
    
    return allFlows;
  } catch (error) {
    console.error('Error getting all flows for user:', error);
    return [];
  }
}

/**
 * Busca un flujo con el mismo ID en otro proyecto del usuario.
 * @param {string} userId
 * @param {string} flowId
 * @param {string} projectId
 * @returns {Promise<Object|null>}
 */
export async function findFlowIdConflictInOtherProject(userId, flowId, projectId) {
  const allFlows = await getAllFlowsForUser(userId);
  return (
    allFlows.find(
      (flow) => flow.id === flowId && flow.projectId !== projectId,
    ) || null
  );
}

/**
 * Guarda o actualiza un flujo en un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {Object} flow - Objeto del flujo
 * @returns {Promise<boolean>} true si se guardó correctamente
 */
export async function saveFlowInProject(projectId, flow) {
  try {
    if (useKV && kv) {
      try {
        const key = `project_flows:${projectId}`;
        const flows = await kv.get(key) || [];
        const existingIndex = flows.findIndex(f => f.id === flow.id);
        
        if (existingIndex >= 0) {
          flows[existingIndex] = {
            ...flow,
            updatedAt: new Date().toISOString(),
          };
        } else {
          flows.push({
            ...flow,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        
        await kv.set(key, flows);
        return true;
      } catch (error) {
        console.error('Error al guardar flujo en proyecto en KV, usando fallback local:', error);
        const data = await getLocalData();
        if (!data.projectFlows) data.projectFlows = {};
        if (!data.projectFlows[projectId]) data.projectFlows[projectId] = [];
        
        const existingIndex = data.projectFlows[projectId].findIndex(f => f.id === flow.id);
        if (existingIndex >= 0) {
          data.projectFlows[projectId][existingIndex] = {
            ...flow,
            updatedAt: new Date().toISOString(),
          };
        } else {
          data.projectFlows[projectId].push({
            ...flow,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data.projectFlows) data.projectFlows = {};
      if (!data.projectFlows[projectId]) data.projectFlows[projectId] = [];
      
      const existingIndex = data.projectFlows[projectId].findIndex(f => f.id === flow.id);
      if (existingIndex >= 0) {
        data.projectFlows[projectId][existingIndex] = {
          ...flow,
          updatedAt: new Date().toISOString(),
        };
      } else {
        data.projectFlows[projectId].push({
          ...flow,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error saving flow in project:', error);
    return false;
  }
}

/**
 * Elimina un flujo de un proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} flowId - ID del flujo
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteFlowFromProject(projectId, flowId) {
  try {
    if (useKV && kv) {
      try {
        const key = `project_flows:${projectId}`;
        const flows = await kv.get(key) || [];
        const filteredFlows = flows.filter(f => f.id !== flowId);
        await kv.set(key, filteredFlows);
        return true;
      } catch (error) {
        console.error('Error al eliminar flujo del proyecto de KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.projectFlows?.[projectId]) {
          data.projectFlows[projectId] = data.projectFlows[projectId].filter(f => f.id !== flowId);
        }
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (data.projectFlows?.[projectId]) {
        data.projectFlows[projectId] = data.projectFlows[projectId].filter(f => f.id !== flowId);
      }
      await saveLocalData(data);
      return true;
    }
  } catch (error) {
    console.error('Error deleting flow from project:', error);
    return false;
  }
}

/**
 * Mueve un flujo de un proyecto a otro (o desde flujos sin proyecto)
 * @param {string|null} fromProjectId - ID del proyecto origen (null si viene de flujos sin proyecto)
 * @param {string} toProjectId - ID del proyecto destino
 * @param {string} flowId - ID del flujo a mover
 * @param {string} userId - ID del usuario (requerido si fromProjectId es null)
 * @returns {Promise<boolean>} true si se movió correctamente
 */
export async function moveFlowBetweenProjects(fromProjectId, toProjectId, flowId, userId = null) {
  try {
    let flow;

    if (fromProjectId) {
      // Obtener el flujo del proyecto origen
      const sourceFlows = await getProjectFlows(fromProjectId);
      flow = sourceFlows.find(f => f.id === flowId);
      
      if (!flow) {
        throw new Error('Flow not found in source project');
      }

      // Eliminar del proyecto origen
      await deleteFlowFromProject(fromProjectId, flowId);
    } else {
      // Obtener el flujo de flujos sin proyecto (sistema antiguo)
      if (!userId) {
        throw new Error('UserId is required when moving from orphan flows');
      }
      
      flow = await getFlow(userId, flowId);
      if (!flow) {
        throw new Error('Flow not found');
      }

      // Eliminar del sistema antiguo
      await deleteFlow(userId, flowId);
    }

    // Verificar que no exista un flujo con el mismo ID en el proyecto destino
    const targetFlows = await getProjectFlows(toProjectId);
    const existingFlow = targetFlows.find(f => f.id === flowId);
    if (existingFlow) {
      throw new Error('A flow with this ID already exists in the target project');
    }

    // Agregar al proyecto destino
    await saveFlowInProject(toProjectId, flow);

    return true;
  } catch (error) {
    console.error('Error moving flow between projects:', error);
    throw error;
  }
}

// =============================================================================
// Entity mapping (entity linking genérico)
// =============================================================================

/**
 * Construye la clave de almacenamiento del entity_mapping.
 * Se separa para mantener consistencia entre KV y fallback local.
 */
function buildEntityMappingKey(userId, flowId, mappingKey, projectId = null) {
  if (projectId) {
    return `entity_mapping:${projectId}:${flowId}:${mappingKey}`;
  }
  return `entity_mapping:${userId}:${flowId}:${mappingKey}`;
}

function buildLegacyEntityMappingKey(userId, flowId, mappingKey) {
  return `entity_mapping:${userId}:${flowId}:${mappingKey}`;
}

/**
 * Obtiene un entity_mapping por (userId, flowId, mappingKey).
 * @returns {Promise<Object|null>} El mapping o null si no existe.
 */
export async function getEntityMapping(userId, flowId, mappingKey, projectId = null) {
  if (!userId || !flowId || !mappingKey) {
    return null;
  }

  const keys = [];
  if (projectId) {
    keys.push(buildEntityMappingKey(userId, flowId, mappingKey, projectId));
  }
  keys.push(buildLegacyEntityMappingKey(userId, flowId, mappingKey));

  try {
    if (useKV && kv) {
      try {
        for (const storageKey of keys) {
          const mapping = await kv.get(storageKey);
          if (mapping) return mapping;
        }
        return null;
      } catch (error) {
        console.error(
          'Error al obtener entity_mapping en KV, usando fallback local:',
          error,
        );
        const data = await getLocalData();
        for (const storageKey of keys) {
          if (data.entityMappings?.[storageKey]) return data.entityMappings[storageKey];
        }
        return null;
      }
    } else {
      const data = await getLocalData();
      for (const storageKey of keys) {
        if (data.entityMappings?.[storageKey]) return data.entityMappings[storageKey];
      }
      return null;
    }
  } catch (error) {
    console.error('Error getting entity mapping:', error);
    return null;
  }
}

/**
 * Crea o actualiza (upsert con merge) un entity_mapping.
 *
 * El `updater` recibe el mapping existente (o null si es la primera vez)
 * y debe devolver el mapping actualizado, sin pisar `created_at` cuando exista.
 *
 * @param {string} userId
 * @param {string} flowId
 * @param {string} mappingKey
 * @param {(oldMapping: Object|null) => Object} updater
 * @returns {Promise<Object|null>} El mapping persistido (post-upsert) o null si falla.
 */
export async function upsertEntityMapping(userId, flowId, mappingKey, updater, projectId = null) {
  if (!userId || !flowId || !mappingKey || typeof updater !== 'function') {
    return null;
  }

  const storageKey = buildEntityMappingKey(userId, flowId, mappingKey, projectId);

  try {
    if (useKV && kv) {
      try {
        let existing = (await kv.get(storageKey)) || null;
        if (!existing && projectId) {
          existing = (await kv.get(buildLegacyEntityMappingKey(userId, flowId, mappingKey))) || null;
        }
        const next = updater(existing);
        if (!next) {
          return existing;
        }
        await kv.set(storageKey, next);
        return next;
      } catch (error) {
        console.error(
          'Error al hacer upsert de entity_mapping en KV, usando fallback local:',
          error,
        );
        const data = await getLocalData();
        if (!data.entityMappings) data.entityMappings = {};
        let existing = data.entityMappings[storageKey] || null;
        if (!existing && projectId) {
          existing = data.entityMappings[buildLegacyEntityMappingKey(userId, flowId, mappingKey)] || null;
        }
        const next = updater(existing);
        if (!next) {
          return existing;
        }
        data.entityMappings[storageKey] = next;
        await saveLocalData(data);
        return next;
      }
    } else {
      const data = await getLocalData();
      if (!data.entityMappings) data.entityMappings = {};
      let existing = data.entityMappings[storageKey] || null;
      if (!existing && projectId) {
        existing = data.entityMappings[buildLegacyEntityMappingKey(userId, flowId, mappingKey)] || null;
      }
      const next = updater(existing);
      if (!next) {
        return existing;
      }
      data.entityMappings[storageKey] = next;
      await saveLocalData(data);
      return next;
    }
  } catch (error) {
    console.error('Error upserting entity mapping:', error);
    return null;
  }
}

/**
 * Lista entity mappings por (userId, flowId), con filtro opcional por mappingKey.
 * En local usa tmp/data.json; en KV intenta resolver por pattern.
 *
 * @param {string} userId
 * @param {string} flowId
 * @param {{ mappingKey?: string, limit?: number }} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function listEntityMappings(userId, flowId, options = {}) {
  if (!userId || !flowId) return [];

  const { mappingKey, limit = 50, projectId = null } = options;

  if (mappingKey) {
    const single = await getEntityMapping(userId, flowId, mappingKey, projectId);
    return single ? [single] : [];
  }

  const prefixes = [];
  if (projectId) {
    prefixes.push(`entity_mapping:${projectId}:${flowId}:`);
  }
  prefixes.push(`entity_mapping:${userId}:${flowId}:`);
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  try {
    if (useKV && kv) {
      try {
        const seen = new Set();
        const results = [];
        for (const prefix of prefixes) {
          const keys = (await kv.keys(`${prefix}*`)) || [];
          if (!Array.isArray(keys)) continue;
          for (const k of keys) {
            if (results.length >= normalizedLimit) break;
            if (seen.has(k)) continue;
            seen.add(k);
            const value = await kv.get(k);
            if (value) results.push(value);
          }
        }
        return results.sort(
          (a, b) =>
            new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
        );
      } catch (error) {
        console.error(
          'Error al listar entity_mapping en KV, usando fallback local:',
          error,
        );
        const data = await getLocalData();
        const all = data.entityMappings || {};
        const seen = new Set();
        const results = [];
        for (const prefix of prefixes) {
          for (const [k, v] of Object.entries(all)) {
            if (k.startsWith(prefix) && v && !seen.has(k)) {
              seen.add(k);
              results.push(v);
            }
          }
        }
        return results
          .sort(
            (a, b) =>
              new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
          )
          .slice(0, normalizedLimit);
      }
    } else {
      const data = await getLocalData();
      const all = data.entityMappings || {};
      const seen = new Set();
      const results = [];
      for (const prefix of prefixes) {
        for (const [k, v] of Object.entries(all)) {
          if (k.startsWith(prefix) && v && !seen.has(k)) {
            seen.add(k);
            results.push(v);
          }
        }
      }
      return results
        .sort(
          (a, b) =>
            new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
        )
        .slice(0, normalizedLimit);
    }
  } catch (error) {
    console.error('Error listing entity mappings:', error);
    return [];
  }
}
