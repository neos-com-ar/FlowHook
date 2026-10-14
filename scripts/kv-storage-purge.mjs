/**
 * Purga de logs de webhooks en KV según una política de retención.
 * Por defecto solo simula; con --apply borra.
 *
 * Uso:
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=orphans
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=days:30 --apply
 *   node --env-file=.env.local scripts/kv-storage-purge.mjs --mode=last:200 --slim --apply
 *
 * --slim recalcula el texto de búsqueda de los listados con el formato actual (300 caracteres)
 * y recorta los mensajes largos, para achicar lo que se transfiere en cada log nuevo.
 */
import {
  analyzeStorage,
  bucketKeyForMetaKey,
  createKvFromEnv,
  formatMB,
  planRetention,
} from './kv-storage-shared.mjs';
import {
  WEBHOOK_SUMMARY_SEARCH_TEXT_MAX,
  buildWebhookSearchText,
} from '../lib/webhook-search-text.mjs';

const SUMMARY_MESSAGE_MAX = 500;

function parseMode(raw) {
  if (raw === 'orphans') return { type: 'orphans' };
  const [type, value] = String(raw || '').split(':');
  const n = Number.parseInt(value, 10);
  if (type === 'days' && n > 0) return { type: 'days', days: n };
  if (type === 'last' && n > 0) return { type: 'last', count: n };
  return null;
}

function truncateMessage(value) {
  return typeof value === 'string' && value.length > SUMMARY_MESSAGE_MAX
    ? `${value.slice(0, SUMMARY_MESSAGE_MAX)}…`
    : value;
}

function slimEntry(entry, searchText) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    searchText:
      searchText ?? String(entry.searchText || '').slice(0, WEBHOOK_SUMMARY_SEARCH_TEXT_MAX),
    ...(entry.result
      ? {
          result: {
            ...entry.result,
            message: truncateMessage(entry.result.message),
            error: truncateMessage(entry.result.error),
          },
        }
      : {}),
  };
}

/** Recalcula searchText leyendo el payload completo de cada log que se conserva. */
async function loadSearchTexts(kv, analysis, ids) {
  const recordKeyById = new Map(analysis.records.map((record) => [record.webhookId, record.key]));
  const texts = new Map();
  const pending = Array.from(ids).filter((id) => recordKeyById.has(id));
  for (let i = 0; i < pending.length; i += 10) {
    const batch = pending.slice(i, i + 10);
    const records = await Promise.all(
      batch.map((id) => kv.get(recordKeyById.get(id)).catch(() => null)),
    );
    batch.forEach((id, idx) => {
      if (records[idx]) texts.set(id, buildWebhookSearchText(records[idx]));
    });
    process.stdout.write(`\rRecalculando búsqueda ${Math.min(i + 10, pending.length)}/${pending.length}`);
  }
  if (pending.length > 0) process.stdout.write('\n');
  return texts;
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length);
  const apply = args.includes('--apply');
  const slim = args.includes('--slim');
  const mode = parseMode(modeArg);
  if (!mode) {
    console.error('Indicá --mode=orphans | --mode=days:N | --mode=last:N');
    process.exit(1);
  }

  const kv = createKvFromEnv();
  const analysis = await analyzeStorage(kv);
  const plan = planRetention(analysis, mode);

  let slimBytesFreed = 0;
  if (slim) {
    const keptIds = new Set();
    for (const [key, entries] of analysis.lists) {
      for (const entry of plan.listUpdates.get(key) ?? entries) {
        if (entry?.id) keptIds.add(entry.id);
      }
    }
    // En simulación no se leen payloads: se estima recortando el texto existente.
    const searchTexts = apply ? await loadSearchTexts(kv, analysis, keptIds) : new Map();
    for (const [key, entries] of analysis.lists) {
      const current = plan.listUpdates.get(key) ?? entries;
      const slimmed = current.map((entry) => slimEntry(entry, searchTexts.get(entry?.id)));
      const before = JSON.stringify(current).length;
      const after = JSON.stringify(slimmed).length;
      if (after !== before) {
        slimBytesFreed += before - after;
        plan.listUpdates.set(key, slimmed);
      }
    }
  }

  console.log(`\nModo: ${modeArg}${slim ? ' + slim' : ''}${apply ? '' : ' (simulación, usar --apply para borrar)'}`);
  console.log(`Payloads a borrar: ${plan.deleteRecords.length} (${formatMB(plan.recordBytesFreed)})`);
  console.log(`Listas a reescribir: ${plan.listUpdates.size} (${formatMB(plan.listBytesFreed + slimBytesFreed)} menos)`);

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
  console.log(
    `\nListo. Liberado aprox. ${formatMB(plan.recordBytesFreed + plan.listBytesFreed + slimBytesFreed)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
