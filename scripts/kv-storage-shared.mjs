import { createClient } from '@vercel/kv';
import { measureKvUsage, scanKeys } from '../lib/kv-storage-usage.mjs';

export { scanKeys };

export const RECORD_PREFIX = 'webhook_record:';
const LIST_PATTERNS = ['webhooks:*', 'webhook_index:*'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function createKvFromEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error(
      'Faltan KV_REST_API_URL / KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).\n' +
        'Ejemplo: node --env-file=.env.local scripts/kv-storage-report.mjs',
    );
    process.exit(1);
  }
  return createClient({ url, token });
}

/**
 * webhook_record:{projectId}:{flowId}:{webhookId}
 * webhook_record:user:{userId}:{flowId}:{webhookId}
 * El id del webhook es `${Date.now()}-${random}`.
 */
export function parseRecordKey(key) {
  const rest = key.slice(RECORD_PREFIX.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon === -1) return null;
  const scope = rest.slice(0, lastColon);
  const webhookId = rest.slice(lastColon + 1);
  return { scope, webhookId, timestampMs: timestampFromWebhookId(webhookId) };
}

export function timestampFromWebhookId(webhookId) {
  const ts = Number.parseInt(String(webhookId).split('-')[0], 10);
  return Number.isFinite(ts) && ts > 1_000_000_000_000 ? ts : null;
}

function entryTimestampMs(entry) {
  if (entry?.timestamp) {
    const ts = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return entry?.id ? timestampFromWebhookId(entry.id) : null;
}

/** Listas por flujo, ordenadas de más nuevo a más viejo, donde aplica "últimos N". */
function isFlowLevelList(key) {
  return key.startsWith('webhooks:') || key.startsWith('webhook_index:flow:');
}

export async function analyzeStorage(kv, { log = console.log } = {}) {
  log('Escaneando claves y midiendo tamaños...');
  const usage = await measureKvUsage(kv);
  const { keys: allKeys, sizes, groups } = usage;
  log(`  ${allKeys.length} claves.`);

  const records = allKeys
    .filter((key) => key.startsWith(RECORD_PREFIX))
    .map((key) => ({ key, bytes: sizes.get(key) || 0, ...parseRecordKey(key) }))
    .filter((record) => record.webhookId);

  log('Leyendo buckets e índices de webhooks...');
  const listKeys = allKeys.filter((key) =>
    LIST_PATTERNS.some((pattern) => key.startsWith(pattern.replace('*', ''))),
  );
  const lists = new Map();
  for (let i = 0; i < listKeys.length; i += 5) {
    const batch = listKeys.slice(i, i + 5);
    const values = await Promise.all(batch.map((key) => kv.get(key).catch(() => null)));
    batch.forEach((key, idx) => {
      if (Array.isArray(values[idx])) lists.set(key, values[idx]);
    });
  }

  const referencedIds = new Set();
  for (const entries of lists.values()) {
    for (const entry of entries) {
      if (entry?.id) referencedIds.add(entry.id);
    }
  }

  const metaKeys = allKeys.filter((key) => key.startsWith('webhook_meta:flow:'));

  return {
    totalKeys: usage.totalKeys,
    totalBytes: usage.totalBytes,
    groups,
    records,
    lists,
    referencedIds,
    metaKeys,
  };
}

/**
 * mode: { type: 'orphans' } | { type: 'days', days } | { type: 'last', count }
 * Los huérfanos (payloads sin entrada en ningún bucket/índice) siempre se borran.
 */
export function planRetention(analysis, mode, now = Date.now()) {
  const cutoff = mode.type === 'days' ? now - mode.days * DAY_MS : null;
  const deleteIds = new Set();

  if (mode.type !== 'orphans') {
    for (const [key, entries] of analysis.lists) {
      entries.forEach((entry, idx) => {
        if (!entry?.id) return;
        const ts = entryTimestampMs(entry);
        if (cutoff !== null && ts !== null && ts < cutoff) deleteIds.add(entry.id);
        if (mode.type === 'last' && isFlowLevelList(key) && idx >= mode.count) {
          deleteIds.add(entry.id);
        }
      });
    }

    if (mode.type === 'last') {
      const byScope = new Map();
      for (const record of analysis.records) {
        const list = byScope.get(record.scope) || [];
        list.push(record);
        byScope.set(record.scope, list);
      }
      for (const list of byScope.values()) {
        list
          .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
          .slice(mode.count)
          .forEach((record) => deleteIds.add(record.webhookId));
      }
    }
  }

  const deleteRecords = analysis.records.filter((record) => {
    if (!analysis.referencedIds.has(record.webhookId)) return true;
    if (deleteIds.has(record.webhookId)) return true;
    return cutoff !== null && record.timestampMs !== null && record.timestampMs < cutoff;
  });
  deleteRecords.forEach((record) => deleteIds.add(record.webhookId));

  const listUpdates = new Map();
  let listBytesFreed = 0;
  if (mode.type !== 'orphans') {
    for (const [key, entries] of analysis.lists) {
      const kept = entries.filter((entry) => !deleteIds.has(entry?.id));
      if (kept.length !== entries.length) {
        listUpdates.set(key, kept);
        listBytesFreed += JSON.stringify(entries).length - JSON.stringify(kept).length;
      }
    }
  }

  return {
    deleteRecords,
    recordBytesFreed: deleteRecords.reduce((sum, record) => sum + record.bytes, 0),
    listUpdates,
    listBytesFreed,
  };
}

/** webhook_meta:flow:{projectId}:{flowId} -> webhooks:{projectId}:{flowId}; user:{userId} -> webhooks:{userId}:{flowId} */
export function bucketKeyForMetaKey(metaKey) {
  const rest = metaKey.slice('webhook_meta:flow:'.length);
  return rest.startsWith('user:') ? `webhooks:${rest.slice('user:'.length)}` : `webhooks:${rest}`;
}

export function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
