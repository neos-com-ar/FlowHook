/**
 * Normaliza flowId cuando el usuario pega la URL completa del webhook.
 * Ej: https://flowhook.vercel.app/api/webhooks/ws_x/proj_y/eone-pedido → eone-pedido
 */
export function normalizeFlowIdParam(flowId) {
  if (!flowId || typeof flowId !== 'string') {
    return flowId;
  }

  const trimmed = flowId.trim();
  const marker = '/api/webhooks/';

  if (!trimmed.includes(marker)) {
    return trimmed;
  }

  try {
    const pathname = trimmed.includes('://') ? new URL(trimmed).pathname : trimmed;
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  } catch {
    const segments = trimmed.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  }
}
