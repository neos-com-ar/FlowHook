export const KV_FREE_PLAN_BYTES = 256 * 1024 * 1024;

export function getKvStorageLimitBytes() {
  const mb = Number.parseFloat(process.env.KV_STORAGE_LIMIT_MB || '');
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : KV_FREE_PLAN_BYTES;
}

export async function scanKeys(kv, match) {
  const keys = [];
  for await (const key of kv.scanIterator({ match, count: 1000 })) {
    keys.push(key);
  }
  return keys;
}

export async function strlenMany(kv, keys, batchSize = 200) {
  const sizes = new Map();
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    try {
      const pipe = kv.pipeline();
      batch.forEach((key) => pipe.strlen(key));
      const results = await pipe.exec();
      batch.forEach((key, idx) => sizes.set(key, Number(results[idx]) || 0));
    } catch {
      // Alguna clave no es string (WRONGTYPE): se mide una por una.
      for (const key of batch) {
        try {
          sizes.set(key, Number(await kv.strlen(key)) || 0);
        } catch {
          sizes.set(key, 0);
        }
      }
    }
  }
  return sizes;
}

export function prefixGroup(key) {
  if (key.startsWith('webhook_record:')) return 'webhook_record';
  if (key.startsWith('webhooks:')) return 'webhooks (buckets)';
  if (key.startsWith('webhook_index:')) return 'webhook_index';
  if (key.startsWith('webhook_meta:')) return 'webhook_meta';
  if (key.startsWith('entity_mapping:')) return 'entity_mapping';
  return 'otros';
}

/** Suma el tamaño de los valores de todas las claves (no incluye el overhead interno de Redis). */
export async function measureKvUsage(kv) {
  const keys = await scanKeys(kv, '*');
  const sizes = await strlenMany(kv, keys);

  const groups = new Map();
  let totalBytes = 0;
  for (const key of keys) {
    const bytes = sizes.get(key) || 0;
    totalBytes += bytes;
    const group = prefixGroup(key);
    const current = groups.get(group) || { count: 0, bytes: 0 };
    current.count += 1;
    current.bytes += bytes;
    groups.set(group, current);
  }

  return { keys, sizes, totalKeys: keys.length, totalBytes, groups };
}
