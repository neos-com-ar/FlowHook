export const ROLE_HIERARCHY = { owner: 3, admin: 2, editor: 2, viewer: 1 };

export function roleMeetsRequired(role, requiredRole) {
  const userLevel = ROLE_HIERARCHY[role] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

export function minRole(roleA, roleB) {
  return (ROLE_HIERARCHY[roleA] || 0) <= (ROLE_HIERARCHY[roleB] || 0) ? roleA : roleB;
}

export function maxRole(roleA, roleB) {
  return (ROLE_HIERARCHY[roleA] || 0) >= (ROLE_HIERARCHY[roleB] || 0) ? roleA : roleB;
}

export function mergeMemberRole(existingRole, incomingRole) {
  if (!existingRole) return incomingRole;
  if (!incomingRole) return existingRole;
  return maxRole(existingRole, incomingRole);
}

export function slugifyWorkspaceName(text) {
  const slug = (text || 'workspace')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return slug || 'workspace';
}

export function isValidWorkspaceSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 50;
}

export function isWorkspaceActive(workspace) {
  return Boolean(workspace && !workspace.archived);
}
