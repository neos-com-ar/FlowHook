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
 * Actualiza un webhook existente en el historial
 * sin cambiar el id ni el timestamp originales.
 *
 * @param {string} userId
 * @param {string} flowId
 * @param {string} webhookId
 * @param {(oldWebhook: Object) => Object} updater
 * @returns {Promise<boolean>}
 */
export async function updateWebhook(userId, flowId, webhookId, updater) {
  try {
    if (useKV && kv) {
      try {
        const key = `webhooks:${userId}:${flowId}`;
        const webhooks = (await kv.get(key)) || [];

        const index = webhooks.findIndex((w) => w.id === webhookId);
        if (index === -1) {
          return false;
        }

        const oldWebhook = webhooks[index];
        const updatedWebhook = updater(oldWebhook) || oldWebhook;

        webhooks[index] = {
          ...oldWebhook,
          ...updatedWebhook,
        };

        await kv.set(key, webhooks);
        return true;
      } catch (error) {
        console.error(
          'Error al actualizar webhook en KV, usando fallback local:',
          error,
        );
        const data = await getLocalData();
        if (!data[userId] || !data[userId].webhooks?.[flowId]) {
          return false;
        }

        const webhooks = data[userId].webhooks[flowId];
        const index = webhooks.findIndex((w) => w.id === webhookId);
        if (index === -1) {
          return false;
        }

        const oldWebhook = webhooks[index];
        const updatedWebhook = updater(oldWebhook) || oldWebhook;

        webhooks[index] = {
          ...oldWebhook,
          ...updatedWebhook,
        };

        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data[userId] || !data[userId].webhooks?.[flowId]) {
        return false;
      }

      const webhooks = data[userId].webhooks[flowId];
      const index = webhooks.findIndex((w) => w.id === webhookId);
      if (index === -1) {
        return false;
      }

      const oldWebhook = webhooks[index];
      const updatedWebhook = updater(oldWebhook) || oldWebhook;

      webhooks[index] = {
        ...oldWebhook,
        ...updatedWebhook,
      };

      await saveLocalData(data);
      return true;
    }
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
    const { status, startDate, endDate } = filters || {};

    const applyFilters = (webhooks) => {
      let filtered = webhooks;

      if (status === 'success') {
        filtered = filtered.filter(w => w.result?.success === true);
      } else if (status === 'error') {
        filtered = filtered.filter(w => w.result?.success === false);
      }

      if (startDate) {
        const start = new Date(startDate);
        filtered = filtered.filter(w => new Date(w.timestamp) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        // Incluir todo el día hasta las 23:59:59 si solo viene la fecha
        if (!endDate.includes('T')) {
          end.setHours(23, 59, 59, 999);
        }
        filtered = filtered.filter(w => new Date(w.timestamp) <= end);
      }

      return filtered;
    };

    // Función auxiliar para enriquecer webhooks con información del proyecto y flujo
    const enrichWebhooks = async (webhooks, flowMap = null) => {
      if (!flowMap) {
        // Crear mapa de flowId a información del flujo y proyecto
        const projectFlows = await getAllFlowsForUser(userId);
        const oldFlows = await getUserFlows(userId);
        flowMap = new Map();
        
        // Agregar flujos de proyectos
        projectFlows.forEach(flow => {
          flowMap.set(flow.id, {
            flowId: flow.id,
            flowName: flow.name,
            projectId: flow.projectId,
            projectName: flow.projectName,
            projectIcon: flow.projectIcon,
            projectColor: flow.projectColor,
          });
        });
        
        // Agregar flujos antiguos sin proyecto
        oldFlows.forEach(flow => {
          if (!flowMap.has(flow.id)) {
            flowMap.set(flow.id, {
              flowId: flow.id,
              flowName: flow.name,
              projectId: null,
              projectName: null,
              projectIcon: null,
              projectColor: null,
            });
          }
        });
      }
      
      return webhooks.map(webhook => {
        const flowInfo = flowMap.get(webhook.flowId) || {
          flowId: webhook.flowId,
          flowName: webhook.flowName || webhook.flowId,
          projectId: null,
          projectName: null,
          projectIcon: null,
          projectColor: null,
        };
        
        return {
          ...webhook,
          flowName: flowInfo.flowName,
          projectId: flowInfo.projectId,
          projectName: flowInfo.projectName,
          projectIcon: flowInfo.projectIcon,
          projectColor: flowInfo.projectColor,
        };
      });
    };

    if (useKV && kv) {
      try {
        if (flowId) {
          const key = `webhooks:${userId}:${flowId}`;
          const webhooks = applyFilters(await kv.get(key) || []);
          const total = webhooks.length;
          const enrichedWebhooks = await enrichWebhooks(webhooks.slice(offset, offset + limit));
          return {
            webhooks: enrichedWebhooks,
            total
          };
        } else {
          // Obtener todos los webhooks de todos los flujos del usuario
          // Incluir flujos de proyectos y flujos antiguos sin proyecto
          const projectFlows = await getAllFlowsForUser(userId);
          const oldFlows = await getUserFlows(userId);
          const allFlows = [...projectFlows, ...oldFlows];
          
          // Crear mapa de flowId a información del flujo y proyecto
          const flowMap = new Map();
          projectFlows.forEach(flow => {
            flowMap.set(flow.id, {
              flowId: flow.id,
              flowName: flow.name,
              projectId: flow.projectId,
              projectName: flow.projectName,
              projectIcon: flow.projectIcon,
              projectColor: flow.projectColor,
            });
          });
          oldFlows.forEach(flow => {
            if (!flowMap.has(flow.id)) {
              flowMap.set(flow.id, {
                flowId: flow.id,
                flowName: flow.name,
                projectId: null,
                projectName: null,
                projectIcon: null,
                projectColor: null,
              });
            }
          });
          
          let allWebhooks = [];
          for (const flow of allFlows) {
            const key = `webhooks:${userId}:${flow.id}`;
            const webhooks = await kv.get(key) || [];
            allWebhooks.push(...webhooks);
          }
          // Ordenar por timestamp descendente
          allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          allWebhooks = applyFilters(allWebhooks);
          const total = allWebhooks.length;
          const enrichedWebhooks = await enrichWebhooks(
            allWebhooks.slice(offset, offset + limit),
            flowMap
          );
          return {
            webhooks: enrichedWebhooks,
            total
          };
        }
      } catch (error) {
        console.error('Error al obtener webhooks de KV, usando fallback local:', error);
        // Fallback a local si KV falla
        const data = await getLocalData();
        if (flowId) {
          const webhooks = applyFilters(data[userId]?.webhooks?.[flowId] || []);
          const total = webhooks.length;
          const enrichedWebhooks = await enrichWebhooks(webhooks.slice(offset, offset + limit));
          return {
            webhooks: enrichedWebhooks,
            total
          };
        } else {
          let allWebhooks = [];
          if (data[userId]?.webhooks) {
            for (const [fId, webhooks] of Object.entries(data[userId].webhooks)) {
              allWebhooks.push(...webhooks);
            }
          }
          allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          allWebhooks = applyFilters(allWebhooks);
          const total = allWebhooks.length;
          const enrichedWebhooks = await enrichWebhooks(
            allWebhooks.slice(offset, offset + limit)
          );
          return {
            webhooks: enrichedWebhooks,
            total
          };
        }
      }
    } else {
      const data = await getLocalData();
      if (flowId) {
        const webhooks = applyFilters(data[userId]?.webhooks?.[flowId] || []);
        const total = webhooks.length;
        const enrichedWebhooks = await enrichWebhooks(webhooks.slice(offset, offset + limit));
        return {
          webhooks: enrichedWebhooks,
          total
        };
      } else {
        let allWebhooks = [];
        if (data[userId]?.webhooks) {
          for (const [fId, webhooks] of Object.entries(data[userId].webhooks)) {
            allWebhooks.push(...webhooks);
          }
        }
        allWebhooks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        allWebhooks = applyFilters(allWebhooks);
        const total = allWebhooks.length;
        const enrichedWebhooks = await enrichWebhooks(
          allWebhooks.slice(offset, offset + limit)
        );
        return {
          webhooks: enrichedWebhooks,
          total
        };
      }
    }
  } catch (error) {
    console.error('Error getting webhooks:', error);
    return { webhooks: [], total: 0 };
  }
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
    const projectId = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const project = {
      id: projectId,
      name: projectData.name,
      slug: projectData.slug || projectData.name.toLowerCase().replace(/\s+/g, '-'),
      description: projectData.description || '',
      ownerId: userId,
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
 * @returns {Promise<Array>} Array de proyectos
 */
export async function getUserProjects(userId) {
  try {
    if (useKV && kv) {
      try {
        // Obtener proyectos donde el usuario tiene permisos
        const userProjectsKey = `user_projects:${userId}`;
        const projectIds = await kv.get(userProjectsKey) || [];
        
        // También buscar en permisos por si hay proyectos compartidos
        // (esto es una búsqueda más lenta, pero necesaria para proyectos compartidos)
        const allProjects = [];
        for (const projectId of projectIds) {
          const project = await kv.get(`project:${projectId}`);
          if (project) {
            allProjects.push(project);
          }
        }
        
        // Buscar proyectos compartidos donde el usuario tiene permisos
        // Nota: Esto requiere iterar sobre todos los proyectos, lo cual no es ideal
        // En producción, sería mejor mantener un índice inverso
        const permissionsKeys = await kv.keys('project_permissions:*');
        for (const key of permissionsKeys) {
          const projectId = key.replace('project_permissions:', '');
          if (!projectIds.includes(projectId)) {
            const permissions = await kv.get(key) || [];
            const hasAccess = permissions.some(p => p.userId === userId);
            if (hasAccess) {
              const project = await kv.get(`project:${projectId}`);
              if (project) {
                allProjects.push(project);
              }
            }
          }
        }
        
        return allProjects;
      } catch (error) {
        console.error('Error al obtener proyectos de KV, usando fallback local:', error);
        const data = await getLocalData();
        const projectIds = data.userProjects?.[userId] || [];
        const projects = projectIds.map(id => data.projects?.[id]).filter(Boolean);
        
        // Buscar proyectos compartidos
        if (data.projectPermissions) {
          for (const [projId, permissions] of Object.entries(data.projectPermissions)) {
            if (!projectIds.includes(projId)) {
              const hasAccess = permissions.some(p => p.userId === userId);
              if (hasAccess) {
                const project = data.projects?.[projId];
                if (project) {
                  projects.push(project);
                }
              }
            }
          }
        }
        
        return projects;
      }
    } else {
      const data = await getLocalData();
      const projectIds = data.userProjects?.[userId] || [];
      const projects = projectIds.map(id => data.projects?.[id]).filter(Boolean);
      
      // Buscar proyectos compartidos
      if (data.projectPermissions) {
        for (const [projId, permissions] of Object.entries(data.projectPermissions)) {
          if (!projectIds.includes(projId)) {
            const hasAccess = permissions.some(p => p.userId === userId);
            if (hasAccess) {
              const project = data.projects?.[projId];
              if (project) {
                projects.push(project);
              }
            }
          }
        }
      }
      
      return projects;
    }
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
        
        return true;
      } catch (error) {
        console.error('Error al eliminar proyecto de KV, usando fallback local:', error);
        const data = await getLocalData();
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
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
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
  try {
    const permissions = await getProjectPermissions(projectId);
    const permission = permissions.find(p => p.userId === userId);
    return permission ? permission.role : null;
  } catch (error) {
    console.error('Error getting user project role:', error);
    return null;
  }
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
    const role = await getUserProjectRole(userId, projectId);
    if (!role) return false;
    
    const roleHierarchy = { owner: 3, admin: 2, editor: 2, viewer: 1 };
    const userLevel = roleHierarchy[role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
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
        await saveLocalData(data);
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
      await saveLocalData(data);
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
        await saveLocalData(data);
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
      await saveLocalData(data);
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
    const invitation = {
      projectId,
      role,
      invitedBy,
      invitedAt: new Date().toISOString(),
    };
    
    if (useKV && kv) {
      try {
        const key = `pending_invitations:${email}`;
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
        if (!data.pendingInvitations[email]) data.pendingInvitations[email] = [];
        
        const existingIndex = data.pendingInvitations[email].findIndex(inv => inv.projectId === projectId);
        if (existingIndex >= 0) {
          data.pendingInvitations[email][existingIndex] = invitation;
        } else {
          data.pendingInvitations[email].push(invitation);
        }
        
        await saveLocalData(data);
        return true;
      }
    } else {
      const data = await getLocalData();
      if (!data.pendingInvitations) data.pendingInvitations = {};
      if (!data.pendingInvitations[email]) data.pendingInvitations[email] = [];
      
      const existingIndex = data.pendingInvitations[email].findIndex(inv => inv.projectId === projectId);
      if (existingIndex >= 0) {
        data.pendingInvitations[email][existingIndex] = invitation;
      } else {
        data.pendingInvitations[email].push(invitation);
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
    if (useKV && kv) {
      try {
        const key = `pending_invitations:${email}`;
        const invitations = await kv.get(key);
        return invitations || [];
      } catch (error) {
        console.error('Error al obtener invitaciones de KV, usando fallback local:', error);
        const data = await getLocalData();
        return data.pendingInvitations?.[email] || [];
      }
    } else {
      const data = await getLocalData();
      return data.pendingInvitations?.[email] || [];
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
    const invitations = await getPendingInvitations(email);
    
    for (const invitation of invitations) {
      await addProjectPermission(
        invitation.projectId,
        userId,
        invitation.role,
        invitation.invitedBy
      );
    }
    
    // Eliminar invitaciones pendientes
    if (useKV && kv) {
      try {
        await kv.del(`pending_invitations:${email}`);
      } catch (error) {
        console.error('Error al eliminar invitaciones de KV, usando fallback local:', error);
        const data = await getLocalData();
        if (data.pendingInvitations?.[email]) {
          delete data.pendingInvitations[email];
        }
        await saveLocalData(data);
      }
    } else {
      const data = await getLocalData();
      if (data.pendingInvitations?.[email]) {
        delete data.pendingInvitations[email];
      }
      await saveLocalData(data);
    }
    
    return true;
  } catch (error) {
    console.error('Error accepting invitation:', error);
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

