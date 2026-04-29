// =============================================================================
// Funciones puras del módulo de entity linking (sin dependencias de DB).
// Se separan en un archivo .mjs para poder testearlas con node:test sin
// requerir el bundler de Next.
// =============================================================================
import { randomUUID, randomBytes } from 'crypto';

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export function buildNowHelper(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());

  return {
    date: `${yyyy}-${mm}-${dd}`,
    datetime: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`,
    hour: hh,
    iso: date.toISOString(),
    epoch: String(Math.floor(date.getTime() / 1000)),
    epochMs: String(date.getTime()),
  };
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') {
    return obj;
  }

  const segments = [];
  const parts = path.split('.');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') continue;

    const arrayPattern = /^([^[]+)((?:\[\d+\])+)$/;
    const match = trimmed.match(arrayPattern);
    if (match) {
      segments.push(match[1]);
      const indices = match[2].match(/\[(\d+)\]/g) || [];
      for (const idx of indices) {
        segments.push(parseInt(idx.slice(1, -1), 10));
      }
    } else {
      segments.push(trimmed);
    }
  }

  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof segment === 'number') {
      if (Array.isArray(current)) {
        current = current[segment];
      } else {
        return undefined;
      }
    } else {
      current = current[segment];
    }
  }
  return current;
}

export function resolveTemplate(template, ctx) {
  if (template === null || template === undefined) return '';
  if (typeof template !== 'string') return String(template);

  return template.replace(TEMPLATE_PATTERN, (_match, expr) => {
    const path = expr.trim();
    const value = getNestedValue(ctx, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

export function resolveKeyTemplate(template, ctx) {
  const resolved = resolveTemplate(template, ctx);
  if (!resolved) return null;
  if (/^[:\-_/\s]*$/.test(resolved)) return null;
  return resolved;
}

export function extractSourceMeta(flow, ctx) {
  const config = flow?.entityLinking?.source || {};
  return {
    source_system: resolveTemplate(config.system, ctx) || null,
    source_entity_type: resolveTemplate(config.entityType, ctx) || null,
    source_entity_id: resolveTemplate(config.entityId, ctx) || null,
    source_event_id: resolveTemplate(config.eventId, ctx) || null,
  };
}

export function extractTargetMeta(flow, ctxWithResponse) {
  const config = flow?.entityLinking?.target || {};
  return {
    target_system: resolveTemplate(config.system, ctxWithResponse) || null,
    target_entity_type:
      resolveTemplate(config.entityType, ctxWithResponse) || null,
    target_entity_id:
      resolveTemplate(config.entityId, ctxWithResponse) || null,
  };
}

export function classifyError(error) {
  if (!error) {
    return { kind: 'functional', status: null, message: 'Unknown error' };
  }

  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof error.response?.status === 'number'
        ? error.response.status
        : null;

  const message =
    error.message ||
    (typeof error === 'string' ? error : 'Unknown error');

  const code = error.code || error.response?.code || null;
  const transientCodes = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNABORTED',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ENOTFOUND',
  ]);

  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return { kind: 'transient', status, message };
  }
  if (code && transientCodes.has(code)) {
    return { kind: 'transient', status, message };
  }
  return { kind: 'functional', status, message };
}

export function newCorrelationId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return randomBytes(16).toString('hex');
}

export function logEvent(event, payload = {}) {
  try {
    const line = {
      kind: 'entity_link',
      event,
      ts: new Date().toISOString(),
      ...payload,
    };
    console.log(`[entity_link] ${JSON.stringify(line)}`);
  } catch {
    console.log('[entity_link]', event, payload);
  }
}

export function isEntityLinkingEnabled(flow) {
  return Boolean(
    flow?.entityLinking?.enabled && flow?.entityLinking?.keyTemplate,
  );
}

export function buildEntityLinkContext(mapping) {
  if (!mapping) return null;
  return {
    mapping_key: mapping.mapping_key,
    status: mapping.status,
    source_system: mapping.source_system,
    source_entity_type: mapping.source_entity_type,
    source_entity_id: mapping.source_entity_id,
    source_event_id: mapping.source_event_id,
    target_system: mapping.target_system,
    target_entity_type: mapping.target_entity_type,
    target_entity_id: mapping.target_entity_id,
  };
}

/**
 * Construye el siguiente estado de un mapping ante un nuevo evento que entra
 * en `pending`. Si `existing` es null, crea el registro inicial.
 *
 * Reglas de upsert con merge documentadas en el plan:
 *   - `created_at` → preserva
 *   - `key_template` → preserva
 *   - `retry_count` → incrementa cada vez que el mismo mapping_key es procesado
 *   - `status` → `pending`
 *   - `updated_at` → ahora
 *   - source_*: refresca, fallback al existente
 */
export function buildPendingUpdate({
  existing,
  mappingKey,
  keyTemplate,
  sourceMeta,
  nowIso,
}) {
  if (!existing) {
    return {
      mapping_key: mappingKey,
      key_template: keyTemplate,
      ...sourceMeta,
      target_system: null,
      target_entity_type: null,
      target_entity_id: null,
      status: 'pending',
      last_error: null,
      retry_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      linked_at: null,
    };
  }
  return {
    ...existing,
    source_system: sourceMeta.source_system ?? existing.source_system,
    source_entity_type:
      sourceMeta.source_entity_type ?? existing.source_entity_type,
    source_entity_id:
      sourceMeta.source_entity_id ?? existing.source_entity_id,
    source_event_id:
      sourceMeta.source_event_id ?? existing.source_event_id,
    status: 'pending',
    retry_count: (existing.retry_count || 0) + 1,
    updated_at: nowIso,
  };
}

/**
 * Construye el siguiente estado de un mapping al finalizarlo.
 * Acepta status `linked`, `failed` o `retrying`. Devuelve null si `existing`
 * no existe (no se puede finalizar algo que nunca se inició).
 */
export function buildFinalizeUpdate({
  existing,
  status,
  targetMeta = null,
  lastError = null,
  nowIso,
}) {
  if (!existing) return null;
  const next = {
    ...existing,
    status,
    updated_at: nowIso,
  };
  if (targetMeta) {
    next.target_system = targetMeta.target_system ?? existing.target_system;
    next.target_entity_type =
      targetMeta.target_entity_type ?? existing.target_entity_type;
    next.target_entity_id =
      targetMeta.target_entity_id ?? existing.target_entity_id;
  }
  if (status === 'linked') {
    next.last_error = null;
    next.linked_at = nowIso;
  } else if (lastError) {
    next.last_error = lastError;
  }
  return next;
}
