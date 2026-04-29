import { getEntityMapping, upsertEntityMapping } from './db';
import {
  buildNowHelper,
  resolveTemplate,
  resolveKeyTemplate,
  extractSourceMeta,
  extractTargetMeta,
  classifyError,
  newCorrelationId,
  logEvent,
  isEntityLinkingEnabled,
  buildEntityLinkContext,
  buildPendingUpdate,
  buildFinalizeUpdate,
} from './entity-linking-pure.mjs';

// =============================================================================
// Entity linking genérico
// =============================================================================
//
// Este módulo es agnóstico de dominio: funciona por `source_system`,
// `source_entity_type`, `source_entity_id`, `target_system`,
// `target_entity_type`, `target_entity_id`. No conoce nombres de
// entidades concretas (clientes, pedidos, etc.).
//
// Las funciones puras (template, classifyError, etc.) viven en
// `entity-linking-pure.mjs` para poder testearse con node:test.
// =============================================================================

export {
  buildNowHelper,
  resolveTemplate,
  resolveKeyTemplate,
  extractSourceMeta,
  extractTargetMeta,
  classifyError,
  newCorrelationId,
  logEvent,
  isEntityLinkingEnabled,
  buildEntityLinkContext,
  getEntityMapping,
};

/**
 * Crea (o reusa) un entity_mapping en estado `pending`.
 *
 * Aplica upsert con merge:
 *   - Si no existe: crea uno nuevo en `pending`, con `created_at`/`updated_at`.
 *   - Si existe: incrementa `retry_count`, actualiza `updated_at`, mantiene
 *     `created_at` y `linked_at` previos. El estado pasa a `pending`.
 *
 * Devuelve `{ enabled, mapping, mappingKey, correlationId }`. Si entity
 * linking está deshabilitado en el flow o el `keyTemplate` resuelve a vacío,
 * devuelve `enabled: false`.
 */
export async function beginMapping({
  userId,
  flowId,
  flow,
  ctx,
  correlationId,
}) {
  const corrId = correlationId || newCorrelationId();

  if (!isEntityLinkingEnabled(flow)) {
    return {
      enabled: false,
      mapping: null,
      mappingKey: null,
      correlationId: corrId,
    };
  }

  const keyTemplate = flow.entityLinking.keyTemplate;
  const mappingKey = resolveKeyTemplate(keyTemplate, ctx);

  if (!mappingKey) {
    logEvent('begin_mapping_skipped', {
      reason: 'empty_mapping_key',
      key_template: keyTemplate,
      correlation_id: corrId,
      user_id: userId,
      flow_id: flowId,
    });
    return {
      enabled: false,
      mapping: null,
      mappingKey: null,
      correlationId: corrId,
    };
  }

  const sourceMeta = extractSourceMeta(flow, ctx);
  const nowIso = new Date().toISOString();

  const mapping = await upsertEntityMapping(
    userId,
    flowId,
    mappingKey,
    (existing) =>
      buildPendingUpdate({
        existing,
        mappingKey,
        keyTemplate,
        sourceMeta,
        nowIso,
      }),
  );

  logEvent('begin_mapping', {
    correlation_id: corrId,
    user_id: userId,
    flow_id: flowId,
    mapping_key: mappingKey,
    status: mapping?.status,
    retry_count: mapping?.retry_count,
    source_system: mapping?.source_system,
    source_entity_type: mapping?.source_entity_type,
    source_entity_id: mapping?.source_entity_id,
    source_event_id: mapping?.source_event_id,
  });

  return {
    enabled: true,
    mapping,
    mappingKey,
    correlationId: corrId,
  };
}

/**
 * Finaliza un mapping persistido.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.flowId
 * @param {string} opts.mappingKey
 * @param {'linked'|'failed'|'retrying'} opts.status
 * @param {Object|null} [opts.targetMeta]   target_system/target_entity_type/target_entity_id
 * @param {Object|null} [opts.lastError]    Error clasificado: { kind, status, message }
 * @param {string} opts.correlationId
 * @returns {Promise<Object|null>} mapping persistido
 */
export async function finalizeMapping({
  userId,
  flowId,
  mappingKey,
  status,
  targetMeta = null,
  lastError = null,
  correlationId,
}) {
  if (!userId || !flowId || !mappingKey) return null;

  const nowIso = new Date().toISOString();

  const mapping = await upsertEntityMapping(
    userId,
    flowId,
    mappingKey,
    (existing) =>
      buildFinalizeUpdate({
        existing,
        status,
        targetMeta,
        lastError,
        nowIso,
      }),
  );

  logEvent('finalize_mapping', {
    correlation_id: correlationId,
    user_id: userId,
    flow_id: flowId,
    mapping_key: mappingKey,
    status: mapping?.status,
    target_system: mapping?.target_system,
    target_entity_type: mapping?.target_entity_type,
    target_entity_id: mapping?.target_entity_id,
    last_error: mapping?.last_error,
    linked_at: mapping?.linked_at,
  });

  return mapping;
}
