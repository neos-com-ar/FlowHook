import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTemplate,
  resolveKeyTemplate,
  buildNowHelper,
  classifyError,
  isEntityLinkingEnabled,
  extractSourceMeta,
  extractTargetMeta,
  buildEntityLinkContext,
  buildPendingUpdate,
  buildFinalizeUpdate,
} from '../lib/entity-linking-pure.mjs';

// =============================================================================
// resolveTemplate / resolveKeyTemplate
// =============================================================================

test('resolveTemplate resuelve placeholders simples sobre data', () => {
  const ctx = { data: { id: 'abc-123' } };
  assert.equal(resolveTemplate('id={{data.id}}', ctx), 'id=abc-123');
});

test('resolveTemplate resuelve rutas anidadas y arrays', () => {
  const ctx = { data: { items: [{ code: 'X1' }, { code: 'X2' }] } };
  assert.equal(
    resolveTemplate('first={{data.items[0].code}};second={{data.items[1].code}}', ctx),
    'first=X1;second=X2',
  );
});

test('resolveTemplate resuelve `now.*` y `prev.*`', () => {
  const ctx = {
    now: { date: '2026-04-29', hour: '04' },
    prev: { ep: { value: 42 } },
  };
  assert.equal(
    resolveTemplate('{{prev.ep.value}}-{{now.date}}-{{now.hour}}', ctx),
    '42-2026-04-29-04',
  );
});

test('resolveTemplate reemplaza placeholders no resueltos por string vacío', () => {
  const ctx = { data: {} };
  assert.equal(resolveTemplate('id={{data.missing}}', ctx), 'id=');
});

test('resolveTemplate serializa objetos como JSON', () => {
  const ctx = { data: { obj: { a: 1 } } };
  assert.equal(resolveTemplate('{{data.obj}}', ctx), '{"a":1}');
});

test('resolveKeyTemplate devuelve null para template vacío o solo separadores', () => {
  assert.equal(resolveKeyTemplate('{{data.missing}}', { data: {} }), null);
  assert.equal(resolveKeyTemplate(':--', {}), null);
  assert.equal(resolveKeyTemplate('   ', {}), null);
});

test('resolveKeyTemplate devuelve la clave concatenada cuando todos los placeholders resuelven', () => {
  const ctx = {
    data: { id: '42' },
    now: { date: '2026-04-29', hour: '04' },
  };
  assert.equal(
    resolveKeyTemplate('{{data.id}}:{{now.date}}-{{now.hour}}', ctx),
    '42:2026-04-29-04',
  );
});

// =============================================================================
// buildNowHelper
// =============================================================================

test('buildNowHelper devuelve formatos UTC consistentes', () => {
  const fixed = new Date(Date.UTC(2026, 3, 29, 4, 0, 7));
  const now = buildNowHelper(fixed);
  assert.equal(now.date, '2026-04-29');
  assert.equal(now.datetime, '2026-04-29T04:00:07');
  assert.equal(now.hour, '04');
  assert.equal(now.iso, fixed.toISOString());
  assert.equal(now.epoch, String(Math.floor(fixed.getTime() / 1000)));
});

// =============================================================================
// classifyError
// =============================================================================

test('classifyError trata 5xx como transient', () => {
  const err = new Error('boom');
  err.response = { status: 503 };
  const cls = classifyError(err);
  assert.equal(cls.kind, 'transient');
  assert.equal(cls.status, 503);
});

test('classifyError trata 429 como transient', () => {
  const err = { response: { status: 429 }, message: 'too many' };
  const cls = classifyError(err);
  assert.equal(cls.kind, 'transient');
  assert.equal(cls.status, 429);
});

test('classifyError trata 4xx (no 429) como functional', () => {
  const err = { response: { status: 400 }, message: 'bad request' };
  const cls = classifyError(err);
  assert.equal(cls.kind, 'functional');
  assert.equal(cls.status, 400);
});

test('classifyError trata códigos de red como transient', () => {
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EAI_AGAIN']) {
    const err = { code, message: code };
    const cls = classifyError(err);
    assert.equal(cls.kind, 'transient', `código ${code} debería ser transient`);
  }
});

test('classifyError sin status ni código transitorio cae a functional', () => {
  const cls = classifyError(new Error('weird'));
  assert.equal(cls.kind, 'functional');
  assert.equal(cls.status, null);
});

// =============================================================================
// isEntityLinkingEnabled
// =============================================================================

test('isEntityLinkingEnabled requiere enabled=true Y keyTemplate', () => {
  assert.equal(isEntityLinkingEnabled(undefined), false);
  assert.equal(isEntityLinkingEnabled({}), false);
  assert.equal(isEntityLinkingEnabled({ entityLinking: {} }), false);
  assert.equal(
    isEntityLinkingEnabled({ entityLinking: { enabled: true } }),
    false,
  );
  assert.equal(
    isEntityLinkingEnabled({ entityLinking: { enabled: false, keyTemplate: 'x' } }),
    false,
  );
  assert.equal(
    isEntityLinkingEnabled({ entityLinking: { enabled: true, keyTemplate: '{{data.id}}' } }),
    true,
  );
});

// =============================================================================
// extractSourceMeta / extractTargetMeta / buildEntityLinkContext
// =============================================================================

test('extractSourceMeta resuelve cada campo con sus templates', () => {
  const flow = {
    entityLinking: {
      source: {
        system: 'erp',
        entityType: '{{data.entityType}}',
        entityId: '{{data.id}}',
        eventId: '{{data.eventId}}',
      },
    },
  };
  const ctx = { data: { entityType: 'Customer', id: '42', eventId: 'evt-1' } };
  assert.deepEqual(extractSourceMeta(flow, ctx), {
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: 'evt-1',
  });
});

test('extractTargetMeta resuelve target_entity_id desde response.*', () => {
  const flow = {
    entityLinking: {
      target: {
        system: 'crm',
        entityType: 'Contact',
        entityId: '{{response.id}}',
      },
    },
  };
  const ctx = { response: { id: 'crm-99' } };
  assert.deepEqual(extractTargetMeta(flow, ctx), {
    target_system: 'crm',
    target_entity_type: 'Contact',
    target_entity_id: 'crm-99',
  });
});

test('buildEntityLinkContext aplana el mapping a un objeto plano', () => {
  const mapping = {
    mapping_key: 'k1',
    status: 'linked',
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: null,
    target_system: 'crm',
    target_entity_type: 'Contact',
    target_entity_id: 'crm-99',
    extra: 'ignored',
  };
  const ctx = buildEntityLinkContext(mapping);
  assert.deepEqual(ctx, {
    mapping_key: 'k1',
    status: 'linked',
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: null,
    target_system: 'crm',
    target_entity_type: 'Contact',
    target_entity_id: 'crm-99',
  });
  assert.equal(buildEntityLinkContext(null), null);
});

// =============================================================================
// buildPendingUpdate (transición de estados al inicio)
// =============================================================================

test('buildPendingUpdate crea un nuevo mapping si no existe', () => {
  const sourceMeta = {
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: 'evt-1',
  };
  const out = buildPendingUpdate({
    existing: null,
    mappingKey: 'erp:Customer:42',
    keyTemplate: '{{data.id}}',
    sourceMeta,
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.mapping_key, 'erp:Customer:42');
  assert.equal(out.key_template, '{{data.id}}');
  assert.equal(out.status, 'pending');
  assert.equal(out.retry_count, 0);
  assert.equal(out.created_at, '2026-04-29T04:00:00.000Z');
  assert.equal(out.updated_at, '2026-04-29T04:00:00.000Z');
  assert.equal(out.linked_at, null);
  assert.equal(out.target_entity_id, null);
  assert.equal(out.last_error, null);
  assert.equal(out.source_entity_id, '42');
});

test('buildPendingUpdate sobre mapping existente preserva created_at/linked_at e incrementa retry_count', () => {
  const existing = {
    mapping_key: 'k',
    key_template: '{{data.id}}',
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: 'evt-1',
    target_system: 'crm',
    target_entity_type: 'Contact',
    target_entity_id: 'crm-99',
    status: 'linked',
    retry_count: 3,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
    linked_at: '2026-04-15T00:00:00.000Z',
    last_error: null,
  };
  const sourceMeta = {
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: 'evt-2',
  };
  const out = buildPendingUpdate({
    existing,
    mappingKey: 'k',
    keyTemplate: '{{data.id}}',
    sourceMeta,
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.status, 'pending');
  assert.equal(out.retry_count, 4);
  assert.equal(out.created_at, '2026-04-01T00:00:00.000Z');
  assert.equal(out.linked_at, '2026-04-15T00:00:00.000Z');
  assert.equal(out.updated_at, '2026-04-29T04:00:00.000Z');
  assert.equal(out.source_event_id, 'evt-2');
  assert.equal(out.target_entity_id, 'crm-99');
});

test('buildPendingUpdate hace fallback a sourceMeta del mapping existente cuando vienen null', () => {
  const existing = {
    source_system: 'erp',
    source_entity_type: 'Customer',
    source_entity_id: '42',
    source_event_id: 'evt-old',
    retry_count: 1,
    created_at: '2026-04-01T00:00:00.000Z',
    linked_at: null,
    status: 'failed',
  };
  const out = buildPendingUpdate({
    existing,
    mappingKey: 'k',
    keyTemplate: 't',
    sourceMeta: {
      source_system: null,
      source_entity_type: null,
      source_entity_id: null,
      source_event_id: null,
    },
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.source_system, 'erp');
  assert.equal(out.source_entity_id, '42');
  assert.equal(out.source_event_id, 'evt-old');
});

// =============================================================================
// buildFinalizeUpdate (transición de estados al final)
// =============================================================================

test('buildFinalizeUpdate devuelve null si no hay mapping previo', () => {
  const out = buildFinalizeUpdate({
    existing: null,
    status: 'linked',
    nowIso: 'x',
  });
  assert.equal(out, null);
});

test('buildFinalizeUpdate marca linked y limpia last_error', () => {
  const existing = {
    status: 'pending',
    last_error: { kind: 'transient', message: 'boom' },
    linked_at: null,
  };
  const out = buildFinalizeUpdate({
    existing,
    status: 'linked',
    targetMeta: {
      target_system: 'crm',
      target_entity_type: 'Contact',
      target_entity_id: 'crm-99',
    },
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.status, 'linked');
  assert.equal(out.last_error, null);
  assert.equal(out.linked_at, '2026-04-29T04:00:00.000Z');
  assert.equal(out.target_entity_id, 'crm-99');
});

test('buildFinalizeUpdate marca failed y conserva last_error', () => {
  const existing = { status: 'pending', last_error: null };
  const out = buildFinalizeUpdate({
    existing,
    status: 'failed',
    lastError: { kind: 'functional', status: 400, message: 'bad request' },
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.status, 'failed');
  assert.deepEqual(out.last_error, {
    kind: 'functional',
    status: 400,
    message: 'bad request',
  });
});

test('buildFinalizeUpdate marca retrying y guarda lastError sin modificar linked_at', () => {
  const existing = {
    status: 'pending',
    last_error: null,
    linked_at: '2026-04-15T00:00:00.000Z',
  };
  const out = buildFinalizeUpdate({
    existing,
    status: 'retrying',
    lastError: { kind: 'transient', status: 503, message: 'timeout' },
    nowIso: '2026-04-29T04:00:00.000Z',
  });
  assert.equal(out.status, 'retrying');
  assert.equal(out.linked_at, '2026-04-15T00:00:00.000Z');
  assert.deepEqual(out.last_error, {
    kind: 'transient',
    status: 503,
    message: 'timeout',
  });
});
