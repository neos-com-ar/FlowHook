/**
 * Reporte de uso de almacenamiento en KV (solo lectura, no modifica nada).
 *
 * Uso: node --env-file=.env.local scripts/kv-storage-report.mjs
 */
import {
  analyzeStorage,
  createKvFromEnv,
  formatMB,
  planRetention,
} from './kv-storage-shared.mjs';

const FREE_PLAN_BYTES = 256 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const kv = createKvFromEnv();
  const analysis = await analyzeStorage(kv);
  const now = Date.now();

  console.log('\n=== Uso total (suma de valores, sin overhead de Redis) ===');
  console.log(
    `${analysis.totalKeys} claves, ${formatMB(analysis.totalBytes)} ` +
      `(${((analysis.totalBytes / FREE_PLAN_BYTES) * 100).toFixed(1)}% de 256 MB)`,
  );

  console.log('\n=== Por prefijo ===');
  const groups = Array.from(analysis.groups.entries()).sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [group, { count, bytes }] of groups) {
    console.log(`${group.padEnd(22)} ${String(count).padStart(8)} claves  ${formatMB(bytes).padStart(12)}`);
  }

  const { records, referencedIds } = analysis;
  const orphans = records.filter((record) => !referencedIds.has(record.webhookId));
  const sumBytes = (list) => list.reduce((sum, record) => sum + record.bytes, 0);
  const ageBuckets = [
    ['menos de 7 días', (age) => age < 7 * DAY_MS],
    ['7 a 30 días', (age) => age >= 7 * DAY_MS && age < 30 * DAY_MS],
    ['más de 30 días', (age) => age >= 30 * DAY_MS],
  ];

  console.log('\n=== webhook_record (payloads completos) ===');
  console.log(`Total: ${records.length} registros, ${formatMB(sumBytes(records))}`);
  console.log(`Huérfanos (no aparecen en ningún listado): ${orphans.length}, ${formatMB(sumBytes(orphans))}`);
  for (const [label, match] of ageBuckets) {
    const inBucket = records.filter((record) => record.timestampMs !== null && match(now - record.timestampMs));
    console.log(`  ${label.padEnd(16)} ${String(inBucket.length).padStart(8)}  ${formatMB(sumBytes(inBucket)).padStart(12)}`);
  }
  const noTimestamp = records.filter((record) => record.timestampMs === null);
  if (noTimestamp.length > 0) {
    console.log(`  sin fecha en id   ${String(noTimestamp.length).padStart(8)}  ${formatMB(sumBytes(noTimestamp)).padStart(12)}`);
  }

  console.log('\n=== Top 10 flujos por tamaño de payloads ===');
  const byScope = new Map();
  for (const record of records) {
    const current = byScope.get(record.scope) || { count: 0, bytes: 0, orphans: 0 };
    current.count += 1;
    current.bytes += record.bytes;
    if (!referencedIds.has(record.webhookId)) current.orphans += 1;
    byScope.set(record.scope, current);
  }
  Array.from(byScope.entries())
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 10)
    .forEach(([scope, { count, bytes, orphans: orphanCount }]) => {
      const avgKb = count > 0 ? (bytes / count / 1024).toFixed(1) : '0';
      console.log(
        `${scope}\n    ${count} registros (${orphanCount} huérfanos), ${formatMB(bytes)}, promedio ${avgKb} KB`,
      );
    });

  console.log('\n=== Espacio que libera cada opción ===');
  const options = [
    ['Solo huérfanos (listado igual)', { type: 'orphans' }],
    ['Últimos 30 días', { type: 'days', days: 30 }],
    ['Últimos 7 días', { type: 'days', days: 7 }],
    ['Últimos 200 por flujo', { type: 'last', count: 200 }],
    ['Últimos 100 por flujo', { type: 'last', count: 100 }],
  ];
  for (const [label, mode] of options) {
    const plan = planRetention(analysis, mode, now);
    const freed = plan.recordBytesFreed + plan.listBytesFreed;
    const remaining = analysis.totalBytes - freed;
    console.log(
      `${label.padEnd(32)} libera ${formatMB(freed).padStart(12)} ` +
        `(${plan.deleteRecords.length} payloads) -> queda ${formatMB(remaining)} ` +
        `(${((remaining / FREE_PLAN_BYTES) * 100).toFixed(1)}%)`,
    );
  }

  console.log(
    '\nNota: Upstash cuenta algo más que la suma de valores (nombres de clave y overhead interno), ' +
      'así que el % real del panel puede ser mayor.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
