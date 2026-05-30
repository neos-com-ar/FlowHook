/**
 * Migra datos de Fase 2:
 * - Copia webhooks de claves user-scoped a project-scoped
 * - Copia entity mappings a claves por projectId
 * - Reconstruye índice user_project_access
 *
 * Ejecutar: node scripts/migrate-phase2-data.js
 */

import fs from 'fs';
import path from 'path';

async function migrateLocalFile() {
  const dataPath = path.join(process.cwd(), 'tmp', 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.log('No hay tmp/data.json');
    return;
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!data.projects) data.projects = {};
  if (!data.projectWebhooks) data.projectWebhooks = {};
  if (!data.entityMappings) data.entityMappings = {};
  if (!data.userProjectAccess) data.userProjectAccess = {};

  let webhooksMigrated = 0;
  let mappingsMigrated = 0;

  for (const [userId, userData] of Object.entries(data)) {
    if (!userData?.webhooks) continue;
    for (const [key, webhooks] of Object.entries(userData.webhooks)) {
      if (!Array.isArray(webhooks)) continue;
      for (const webhook of webhooks) {
        const projectId = webhook.projectId;
        if (!projectId) continue;
        const newKey = `project:${projectId}:${webhook.flowId}`;
        if (!data.projectWebhooks[newKey]) data.projectWebhooks[newKey] = [];
        const ids = new Set(data.projectWebhooks[newKey].map(w => w.id));
        for (const w of webhooks) {
          if (!ids.has(w.id)) {
            data.projectWebhooks[newKey].push(w);
            webhooksMigrated++;
          }
        }
      }
      if (key.includes(':')) {
        const [, projectId, flowId] = key.match(/([^:]+):(.+)/) || [];
        if (projectId?.startsWith('proj_') && flowId) {
          const newKey = `project:${projectId}:${flowId}`;
          if (!data.projectWebhooks[newKey]) {
            data.projectWebhooks[newKey] = [...webhooks];
            webhooksMigrated += webhooks.length;
          }
        }
      }
    }
  }

  for (const [storageKey, mapping] of Object.entries(data.entityMappings)) {
    const match = storageKey.match(/^entity_mapping:([^:]+):([^:]+):(.+)$/);
    if (!match) continue;
    const [, first, flowId, mappingKey] = match;
    if (!first.startsWith('proj_')) continue;
    const newKey = `entity_mapping:${first}:${flowId}:${mappingKey}`;
    if (newKey === storageKey) continue;
    if (!data.entityMappings[newKey]) {
      data.entityMappings[newKey] = mapping;
      mappingsMigrated++;
    }
  }

  const userIds = new Set([
    ...Object.keys(data.userProjects || {}),
    ...Object.keys(data.userWorkspaces || {}),
  ]);

  for (const userId of userIds) {
    const projectIds = new Set(data.userProjects?.[userId] || []);
    if (data.projectPermissions) {
      for (const [projectId, perms] of Object.entries(data.projectPermissions)) {
        if (perms.some(p => p.userId === userId)) projectIds.add(projectId);
      }
    }
    data.userProjectAccess[userId] = Array.from(projectIds);
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`✅ Fase 2 local: ${webhooksMigrated} webhooks, ${mappingsMigrated} mappings, índice user_project_access actualizado`);
}

async function migrateKv() {
  const { createClient } = await import('@vercel/kv');
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) {
    console.log('Sin KV configurado, migrando solo archivo local');
    return migrateLocalFile();
  }

  const kv = createClient({ url: kvUrl, token: kvToken });
  const { getProject, rebuildUserProjectAccessIndex } = await import('../lib/db.js');

  let webhooksMigrated = 0;
  const webhookKeys = await kv.keys('webhooks:*');
  for (const key of webhookKeys || []) {
    const parts = key.split(':');
    if (parts.length !== 4) continue;
    const [, userId, projectId, flowId] = parts;
    if (!projectId.startsWith('proj_')) continue;
    const webhooks = await kv.get(key);
    if (!webhooks?.length) continue;
    const newKey = `webhooks:${projectId}:${flowId}`;
    const existing = (await kv.get(newKey)) || [];
    const ids = new Set(existing.map(w => w.id));
    const merged = [...existing];
    for (const w of webhooks) {
      if (!ids.has(w.id)) {
        merged.push(w);
        webhooksMigrated++;
      }
    }
    await kv.set(newKey, merged);
  }

  const mappingKeys = await kv.keys('entity_mapping:*');
  let mappingsMigrated = 0;
  for (const key of mappingKeys || []) {
    const parts = key.split(':');
    if (parts.length !== 5) continue;
    const [, userId, flowId, ...rest] = parts;
    const mappingKey = rest.join(':');
    const projects = await kv.get(`user_projects:${userId}`) || [];
    for (const projectId of projects) {
      const project = await getProject(projectId);
      if (!project) continue;
      const flows = await kv.get(`project_flows:${projectId}`) || [];
      if (!flows.some(f => f.id === flowId)) continue;
      const newKey = `entity_mapping:${projectId}:${flowId}:${mappingKey}`;
      const mapping = await kv.get(key);
      if (mapping && !(await kv.get(newKey))) {
        await kv.set(newKey, mapping);
        mappingsMigrated++;
      }
    }
  }

  const userProjectKeys = await kv.keys('user_projects:*');
  for (const key of userProjectKeys || []) {
    const userId = key.replace('user_projects:', '');
    await rebuildUserProjectAccessIndex(userId);
  }

  console.log(`✅ Fase 2 KV: ${webhooksMigrated} webhooks copiados, ${mappingsMigrated} mappings, índices reconstruidos`);
}

migrateKv().catch((err) => {
  console.error(err);
  process.exit(1);
});
