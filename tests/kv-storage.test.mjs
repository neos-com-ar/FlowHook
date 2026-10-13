import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bucketKeyForMetaKey,
  parseRecordKey,
  planRetention,
} from '../scripts/kv-storage-shared.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 13);

function idAt(daysAgo, suffix = 'abc') {
  return `${NOW - daysAgo * DAY_MS}-${suffix}`;
}

function buildAnalysis({ listed, orphans }) {
  const records = [...listed, ...orphans].map((id) => ({
    key: `webhook_record:proj_1:flow_1:${id}`,
    bytes: 1000,
    ...parseRecordKey(`webhook_record:proj_1:flow_1:${id}`),
  }));
  const entries = listed.map((id) => ({
    id,
    timestamp: new Date(Number(id.split('-')[0])).toISOString(),
  }));
  return {
    records,
    lists: new Map([
      ['webhooks:proj_1:flow_1', entries],
      ['webhook_index:flow:proj_1:flow_1', entries],
    ]),
    referencedIds: new Set(listed),
  };
}

test('parseRecordKey extrae scope, id y fecha del id', () => {
  const id = idAt(3);
  const parsed = parseRecordKey(`webhook_record:user:u1:flow_1:${id}`);
  assert.equal(parsed.scope, 'user:u1:flow_1');
  assert.equal(parsed.webhookId, id);
  assert.equal(parsed.timestampMs, NOW - 3 * DAY_MS);
});

test('modo orphans borra solo payloads sin entrada en listados y no toca listas', () => {
  const analysis = buildAnalysis({ listed: [idAt(1, 'a'), idAt(40, 'b')], orphans: [idAt(50, 'c')] });
  const plan = planRetention(analysis, { type: 'orphans' }, NOW);
  assert.deepEqual(plan.deleteRecords.map((r) => r.webhookId), [idAt(50, 'c')]);
  assert.equal(plan.recordBytesFreed, 1000);
  assert.equal(plan.listUpdates.size, 0);
});

test('modo days borra viejos y huérfanos, y recorta las listas', () => {
  const recent = idAt(2, 'a');
  const old = idAt(10, 'b');
  const orphanRecent = idAt(1, 'c');
  const analysis = buildAnalysis({ listed: [recent, old], orphans: [orphanRecent] });
  const plan = planRetention(analysis, { type: 'days', days: 7 }, NOW);
  const deleted = plan.deleteRecords.map((r) => r.webhookId).sort();
  assert.deepEqual(deleted, [old, orphanRecent].sort());
  assert.deepEqual(
    plan.listUpdates.get('webhooks:proj_1:flow_1').map((e) => e.id),
    [recent],
  );
});

test('modo last conserva los N más nuevos por flujo', () => {
  const ids = [idAt(1, 'a'), idAt(2, 'b'), idAt(3, 'c')];
  const analysis = buildAnalysis({ listed: ids, orphans: [] });
  const plan = planRetention(analysis, { type: 'last', count: 2 }, NOW);
  assert.deepEqual(plan.deleteRecords.map((r) => r.webhookId), [ids[2]]);
  assert.deepEqual(
    plan.listUpdates.get('webhook_index:flow:proj_1:flow_1').map((e) => e.id),
    ids.slice(0, 2),
  );
});

test('bucketKeyForMetaKey mapea meta de proyecto y de usuario', () => {
  assert.equal(bucketKeyForMetaKey('webhook_meta:flow:proj_1:flow_1'), 'webhooks:proj_1:flow_1');
  assert.equal(bucketKeyForMetaKey('webhook_meta:flow:user:u1:flow_1'), 'webhooks:u1:flow_1');
});
