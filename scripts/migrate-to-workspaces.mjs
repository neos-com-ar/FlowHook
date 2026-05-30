/**
 * Script de migración a workspaces
 *
 * - Crea workspace personal por usuario
 * - Agrupa proyectos compartidos por huella de colaboradores
 * - Asigna workspaceId a todos los proyectos
 *
 * Ejecutar: node scripts/migrate-to-workspaces.mjs
 *           npm run migrate:workspaces
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

function getCollaboratorFingerprint(permissions) {
  return permissions
    .map(p => `${p.userId}:${p.role}`)
    .sort()
    .join('|');
}

function slugify(text) {
  return (text || 'workspace')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50) || 'workspace';
}

function uniqueSlug(base, usedSlugs) {
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  usedSlugs.add(slug);
  return slug;
}

async function migrateLocal() {
  const dataPath = path.join(rootDir, 'tmp', 'data.json');
  const authPath = path.join(rootDir, 'tmp', 'auth.json');

  if (!fs.existsSync(dataPath)) {
    console.log('No hay tmp/data.json — nada que migrar.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let auth = {};
  if (fs.existsSync(authPath)) {
    auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  }

  if (!data.workspaces) data.workspaces = {};
  if (!data.workspaceMembers) data.workspaceMembers = {};
  if (!data.workspaceProjects) data.workspaceProjects = {};
  if (!data.userWorkspaces) data.userWorkspaces = {};
  if (!data.projects) data.projects = {};
  if (!data.projectPermissions) data.projectPermissions = {};
  if (!data.userProjects) data.userProjects = {};

  const usedSlugs = new Set(Object.values(data.workspaces).map(w => w.slug));
  const report = { personalWorkspaces: [], teamWorkspaces: [], projectsAssigned: [] };

  const userIds = new Set();
  Object.keys(data.userProjects || {}).forEach(id => userIds.add(id));
  Object.values(auth.users || {}).forEach(u => userIds.add(u.id));

  const personalByUser = {};

  for (const userId of userIds) {
    const existing = Object.values(data.workspaces).find(
      w => w.isPersonal && w.ownerId === userId
    );
    if (existing) {
      personalByUser[userId] = existing.id;
      continue;
    }

    const wsId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const slug = uniqueSlug(`personal-${userId.slice(0, 8)}`, usedSlugs);
    const now = new Date().toISOString();

    data.workspaces[wsId] = {
      id: wsId,
      name: 'Personal',
      slug,
      description: 'Workspace personal',
      ownerId: userId,
      isPersonal: true,
      color: '#6366F1',
      icon: 'Folder',
      createdAt: now,
      updatedAt: now,
    };
    data.workspaceMembers[wsId] = [{ userId, role: 'owner', invitedBy: userId, invitedAt: now }];
    data.workspaceProjects[wsId] = [];
    if (!data.userWorkspaces[userId]) data.userWorkspaces[userId] = [];
    if (!data.userWorkspaces[userId].includes(wsId)) data.userWorkspaces[userId].push(wsId);
    personalByUser[userId] = wsId;
    report.personalWorkspaces.push({ userId, workspaceId: wsId });
  }

  const sharedProjects = [];
  const soloProjects = [];

  for (const [projectId, project] of Object.entries(data.projects)) {
    if (project.workspaceId) continue;
    const perms = data.projectPermissions[projectId] || [];
    if (perms.length > 1) {
      sharedProjects.push({ projectId, project, perms, fingerprint: getCollaboratorFingerprint(perms) });
    } else {
      soloProjects.push({ projectId, project });
    }
  }

  const groups = new Map();
  for (const item of sharedProjects) {
    if (!groups.has(item.fingerprint)) groups.set(item.fingerprint, []);
    groups.get(item.fingerprint).push(item);
  }

  for (const [fingerprint, items] of groups) {
    const perms = items[0].perms;
    const ownerPerm = perms.find(p => p.role === 'owner') || perms[0];
    const ownerId = ownerPerm.userId;
    const ownerUser = Object.values(auth.users || {}).find(u => u.id === ownerId);
    const ownerName = ownerUser?.name || ownerUser?.email?.split('@')[0] || 'Usuario';

    const wsId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const name = items.length === 1 ? items[0].project.name : `Equipo de ${ownerName}`;
    const slug = uniqueSlug(slugify(name), usedSlugs);
    const now = new Date().toISOString();

    data.workspaces[wsId] = {
      id: wsId,
      name,
      slug,
      description: 'Workspace de equipo (migración automática)',
      ownerId,
      isPersonal: false,
      color: '#3B82F6',
      icon: 'Folder',
      createdAt: now,
      updatedAt: now,
    };

    data.workspaceMembers[wsId] = perms.map(p => ({
      userId: p.userId,
      role: p.role === 'owner' ? 'owner' : p.role === 'editor' ? 'editor' : p.role === 'admin' ? 'admin' : 'viewer',
      invitedBy: ownerId,
      invitedAt: now,
    }));

    data.workspaceProjects[wsId] = [];

    for (const p of perms) {
      if (!data.userWorkspaces[p.userId]) data.userWorkspaces[p.userId] = [];
      if (!data.userWorkspaces[p.userId].includes(wsId)) {
        data.userWorkspaces[p.userId].push(wsId);
      }
    }

    for (const item of items) {
      data.projects[item.projectId].workspaceId = wsId;
      data.workspaceProjects[wsId].push(item.projectId);
      report.projectsAssigned.push({ projectId: item.projectId, workspaceId: wsId, type: 'team' });
    }

    report.teamWorkspaces.push({ workspaceId: wsId, name, fingerprint, projectCount: items.length });
  }

  for (const { projectId, project } of soloProjects) {
    const ownerId = project.ownerId;
    const wsId = personalByUser[ownerId];
    if (!wsId) continue;
    data.projects[projectId].workspaceId = wsId;
    if (!data.workspaceProjects[wsId].includes(projectId)) {
      data.workspaceProjects[wsId].push(projectId);
    }
    report.projectsAssigned.push({ projectId, workspaceId: wsId, type: 'personal' });
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  const reportPath = path.join(rootDir, 'tmp', 'migrate-workspaces-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('✅ Migración completada');
  console.log(`   Workspaces personales: ${report.personalWorkspaces.length}`);
  console.log(`   Workspaces de equipo: ${report.teamWorkspaces.length}`);
  console.log(`   Proyectos asignados: ${report.projectsAssigned.length}`);
  console.log(`   Reporte: ${reportPath}`);
}

function mapWorkspaceRole(role) {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'editor') return 'editor';
  return 'viewer';
}

async function migrateKV() {
  const { createClient } = await import('@vercel/kv');
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) {
    console.log('Sin KV configurado, migrando solo archivo local');
    return migrateLocal();
  }

  console.log('Conectando a KV para migración de workspaces...');
  const kv = createClient({ url: kvUrl, token: kvToken });
  const {
    createPersonalWorkspace,
    getProject,
    getProjectPermissions,
    createWorkspace,
    updateProject,
    addWorkspaceMember,
    getWorkspace,
  } = await import('../lib/db.js');

  const report = { personalWorkspaces: [], teamWorkspaces: [], projectsAssigned: [], movedFromPersonal: [] };

  async function removeFromWorkspaceIndex(wsId, projectId) {
    const ids = await kv.get(`workspace_projects:${wsId}`) || [];
    if (ids.includes(projectId)) {
      await kv.set(`workspace_projects:${wsId}`, ids.filter(id => id !== projectId));
    }
  }

  async function addToWorkspaceIndex(wsId, projectId) {
    const ids = await kv.get(`workspace_projects:${wsId}`) || [];
    if (!ids.includes(projectId)) {
      await kv.set(`workspace_projects:${wsId}`, [...ids, projectId]);
    }
  }

  const userIds = new Set();
  for (const key of await kv.keys('user_projects:*') || []) {
    userIds.add(key.replace('user_projects:', ''));
  }
  for (const key of await kv.keys('project_permissions:*') || []) {
    const perms = await kv.get(key);
    for (const p of perms || []) userIds.add(p.userId);
  }

  const personalByUser = {};
  for (const userId of userIds) {
    const ws = await createPersonalWorkspace(userId);
    personalByUser[userId] = ws.id;
    report.personalWorkspaces.push({ userId, workspaceId: ws.id });
  }

  const sharedProjects = [];
  const soloProjects = [];

  for (const key of await kv.keys('project:*') || []) {
    const project = await kv.get(key);
    if (!project?.id) continue;
    const perms = await getProjectPermissions(project.id);
    if (perms.length > 1) {
      sharedProjects.push({
        projectId: project.id,
        project,
        perms,
        fingerprint: getCollaboratorFingerprint(perms),
      });
    } else {
      soloProjects.push({ projectId: project.id, project });
    }
  }

  const groups = new Map();
  for (const item of sharedProjects) {
    if (!groups.has(item.fingerprint)) groups.set(item.fingerprint, []);
    groups.get(item.fingerprint).push(item);
  }

  for (const [fingerprint, items] of groups) {
    const perms = items[0].perms;
    const ownerPerm = perms.find(p => p.role === 'owner') || perms[0];
    const ownerId = ownerPerm.userId;

    let targetWsId = null;
    for (const item of items) {
      const current = await getProject(item.projectId);
      if (!current?.workspaceId) continue;
      const ws = await getWorkspace(current.workspaceId);
      if (ws && !ws.isPersonal) {
        targetWsId = current.workspaceId;
        break;
      }
    }

    if (!targetWsId) {
      const name = items.length === 1
        ? items[0].project.name
        : `Equipo compartido`;
      const ws = await createWorkspace(ownerId, {
        name,
        description: 'Workspace de equipo (migración automática)',
        isPersonal: false,
        color: '#3B82F6',
        icon: 'Folder',
      });
      targetWsId = ws.id;

      for (const p of perms) {
        if (p.userId === ownerId) continue;
        await addWorkspaceMember(targetWsId, p.userId, mapWorkspaceRole(p.role), ownerId);
      }

      report.teamWorkspaces.push({
        workspaceId: targetWsId,
        name,
        fingerprint,
        projectCount: items.length,
      });
    }

    for (const item of items) {
      const current = await getProject(item.projectId);
      if (!current) continue;
      if (current.workspaceId === targetWsId) continue;

      const fromPersonal = current.workspaceId
        ? (await getWorkspace(current.workspaceId))?.isPersonal
        : false;

      if (current.workspaceId) {
        await removeFromWorkspaceIndex(current.workspaceId, item.projectId);
      }
      await updateProject(item.projectId, { workspaceId: targetWsId });
      await addToWorkspaceIndex(targetWsId, item.projectId);
      report.projectsAssigned.push({ projectId: item.projectId, workspaceId: targetWsId, type: 'team' });
      if (fromPersonal) {
        report.movedFromPersonal.push(item.projectId);
      }
    }
  }

  for (const { projectId, project } of soloProjects) {
    const current = await getProject(projectId);
    if (!current) continue;
    const ownerId = current.ownerId;
    const personalWsId = personalByUser[ownerId];
    if (!personalWsId) continue;

    if (current.workspaceId === personalWsId) continue;

    if (current.workspaceId) {
      const ws = await getWorkspace(current.workspaceId);
      if (ws && !ws.isPersonal) continue;
      await removeFromWorkspaceIndex(current.workspaceId, projectId);
    }

    await updateProject(projectId, { workspaceId: personalWsId });
    await addToWorkspaceIndex(personalWsId, projectId);
    report.projectsAssigned.push({ projectId, workspaceId: personalWsId, type: 'personal' });
  }

  const reportPath = path.join(rootDir, 'tmp', 'migrate-workspaces-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('✅ Migración KV completada');
  console.log(`   Workspaces personales: ${report.personalWorkspaces.length}`);
  console.log(`   Workspaces de equipo: ${report.teamWorkspaces.length}`);
  console.log(`   Proyectos asignados: ${report.projectsAssigned.length}`);
  console.log(`   Movidos desde Personal a equipo: ${report.movedFromPersonal.length}`);
  console.log(`   Reporte: ${reportPath}`);
}

const useKV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
if (useKV) {
  migrateKV().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  migrateLocal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
