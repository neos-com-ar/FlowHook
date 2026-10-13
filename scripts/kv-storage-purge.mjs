/**
 * Purga de logs de webhooks en KV según una política de retención.
 * Por defecto solo simula; con --apply borra.
 *
 * Uso:
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=orphans
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=days:30 --apply
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=last:100 --apply
 */
import {
  analyzeStorage,
  bucketKeyForMetaKey,
  createKvFromEnv,
  formatMB,
  planRetention,
} from './kv-storage-shared.mjs';

function parseMode(raw) {
  if (raw === 'orphans') return { type: 'orphans' };
  const [type, value] = String(raw || '').split(':');
  const n = Number.parseInt(value, 10);
  if (type === 'days' && n > 0) return { type: 'days', days: n };
  if (type === 'last' && n > 0) return { type: 'last', count: n };
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length);
  const apply = args.includes('--apply');
  const mode = parseMode(modeArg);
  if (!mode) {
    console.error('Indicá --mode=orphans | --mode=days:N | --mode=last:N');
    process.exit(1);
  }

  const kv = createKvFromEnv();
  const analysis = await analyzeStorage(kv);
  const plan = planRetention(analysis, mode);

  console.log(`\nModo: ${modeArg}${apply ? '' : ' (simulación, usar --apply para borrar)'}`);
  console.log(`Payloads a borrar: ${plan.deleteRecords.length} (${formatMB(plan.recordBytesFreed)})`);
  console.log(`Listas a recortar: ${plan.listUpdates.size} (${formatMB(plan.listBytesFreed)})`);

  if (!apply) return;

  // Primero se recortan los listados para que nunca apunten a un payload ya borrado.
  for (const [key, kept] of plan.listUpdates) {
    await kv.set(key, kept);
  }

  for (const metaKey of analysis.metaKeys) {
    const bucketKey = bucketKeyForMetaKey(metaKey);
    if (!plan.listUpdates.has(bucketKey)) continue;
    const bucket = plan.listUpdates.get(bucketKey);
    await kv.set(metaKey, {
      count: bucket.length,
      latestTimestamp: bucket[0]?.timestamp || null,
      latestId: bucket[0]?.id || null,
    });
  }

  const keys = plan.deleteRecords.map((record) => record.key);
  for (let i = 0; i < keys.length; i += 100) {
    await kv.del(...keys.slice(i, i + 100));
    process.stdout.write(`\rBorrados ${Math.min(i + 100, keys.length)}/${keys.length}`);
  }
  console.log(`\nListo. Liberado aprox. ${formatMB(plan.recordBytesFreed + plan.listBytesFreed)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
