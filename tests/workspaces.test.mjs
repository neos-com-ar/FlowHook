import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLE_HIERARCHY,
  roleMeetsRequired,
  minRole,
  maxRole,
  mergeMemberRole,
  slugifyWorkspaceName,
  isValidWorkspaceSlug,
  isWorkspaceActive,
} from '../lib/workspace-pure.mjs';

test('roleMeetsRequired respeta jerarquía owner > admin > editor > viewer', () => {
  assert.equal(roleMeetsRequired('owner', 'viewer'), true);
  assert.equal(roleMeetsRequired('viewer', 'editor'), false);
  assert.equal(roleMeetsRequired('admin', 'editor'), true);
});

test('minRole devuelve el rol más restrictivo', () => {
  assert.equal(minRole('editor', 'viewer'), 'viewer');
  assert.equal(minRole('owner', 'admin'), 'admin');
});

test('maxRole devuelve el rol más permisivo', () => {
  assert.equal(maxRole('editor', 'viewer'), 'editor');
  assert.equal(maxRole('admin', 'owner'), 'owner');
});

test('mergeMemberRole combina roles al fusionar workspaces', () => {
  assert.equal(mergeMemberRole('viewer', 'editor'), 'editor');
  assert.equal(mergeMemberRole('admin', 'editor'), 'admin');
  assert.equal(mergeMemberRole(null, 'viewer'), 'viewer');
});

test('slugifyWorkspaceName normaliza acentos y espacios', () => {
  assert.equal(slugifyWorkspaceName('Neos WorkSpace'), 'neos-workspace');
  assert.equal(slugifyWorkspaceName('Equipo de José'), 'equipo-de-jose');
});

test('isValidWorkspaceSlug valida formato', () => {
  assert.equal(isValidWorkspaceSlug('neos-workspace'), true);
  assert.equal(isValidWorkspaceSlug('Neos'), false);
  assert.equal(isValidWorkspaceSlug('bad slug'), false);
});

test('isWorkspaceActive excluye workspaces archivados', () => {
  assert.equal(isWorkspaceActive({ archived: false }), true);
  assert.equal(isWorkspaceActive({ archived: true }), false);
  assert.equal(isWorkspaceActive(null), false);
});

test('ROLE_HIERARCHY tiene niveles consistentes', () => {
  assert.ok(ROLE_HIERARCHY.owner > ROLE_HIERARCHY.viewer);
  assert.equal(ROLE_HIERARCHY.admin, ROLE_HIERARCHY.editor);
});
