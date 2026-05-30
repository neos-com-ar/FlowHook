/**
 * Script de migración a workspaces
 *
 * - Crea workspace personal por usuario
 * - Agrupa proyectos compartidos por huella de colaboradores
 * - Asigna workspaceId a todos los proyectos
 *
 * Ejecutar: node scripts/migrate-to-workspaces.js
 */

import fs from 'fs';
import path from 'path';

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
  const dataPath = path.join(process.cwd(), 'tmp', 'data.json');
  const authPath = path.join(process.cwd(), 'tmp', 'auth.json');

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
  const reportPath = path.join(process.cwd(), 'tmp', 'migrate-workspaces-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('✅ Migración completada');
  console.log(`   Workspaces personales: ${report.personalWorkspaces.length}`);
  console.log(`   Workspaces de equipo: ${report.teamWorkspaces.length}`);
  console.log(`   Proyectos asignados: ${report.projectsAssigned.length}`);
  console.log(`   Reporte: ${reportPath}`);
}

async function migrateKV() {
  const {
    createPersonalWorkspace,
    getProject,
    getProjectPermissions,
    createWorkspace,
    updateProject,
    addWorkspaceMember,
  } = await import('../lib/db.js');

  console.log('Migración KV: usar ensureUserWorkspaceSetup por usuario al iniciar sesión.');
  console.log('Para migración completa en KV, ejecutar lógica equivalente con acceso a kv.keys().');
  await migrateLocal();
}

const useKV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
if (useKV) {
  migrateKV().catch(console.error);
} else {
  migrateLocal().catch(console.error);
}
