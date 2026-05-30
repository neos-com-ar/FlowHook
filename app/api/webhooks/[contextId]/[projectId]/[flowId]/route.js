import { handleWebhookIngress, methodNotAllowed } from '@/lib/webhook-ingress';

/**
 * Ruta unificada de ingress:
 * - /api/webhooks/{workspaceId}/{projectId}/{flowId}  (nueva)
 * - /api/webhooks/{userId}/{projectId}/{flowId}        (legacy)
 *
 * Next.js exige el mismo nombre de segmento dinámico; se usa contextId.
 */
export async function POST(request, { params }) {
  const resolvedParams = await params;
  const { contextId, projectId, flowId } = resolvedParams;
  const isWorkspace = contextId.startsWith('ws_');

  if (isWorkspace) {
    return handleWebhookIngress(request, {
      workspaceId: contextId,
      projectId,
      flowId,
      legacy: false,
    });
  }

  return handleWebhookIngress(request, {
    userId: contextId,
    projectId,
    flowId,
    legacy: true,
  });
}

export async function GET() {
  return methodNotAllowed();
}
