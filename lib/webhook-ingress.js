import { NextResponse } from 'next/server';
import { getProject, getProjectFlows, getFlow, saveWebhook } from '@/lib/db';
import { executeWebhook } from '@/lib/webhook-executor';
import { verifyIncomingXWebhookSignature } from '@/lib/webhook-signature-verify';

/**
 * Handler compartido para ingress de webhooks (ruta nueva y legacy).
 */
export async function handleWebhookIngress(request, { userId, workspaceId, projectId, flowId, legacy = false }) {
  if (legacy) {
    console.warn(
      `[FlowHook] Webhook legacy URL used (userId in path). Prefer /api/webhooks/{workspaceId}/{projectId}/{flowId}`,
    );
  }

  if (workspaceId && projectId) {
    const project = await getProject(projectId);
    if (!project || project.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Project not found in workspace' }, { status: 404 });
    }
  }

  if (process.env.SECRET_KEY) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 },
      );
    }
    const token = authHeader.substring(7);
    if (token !== process.env.SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) {
    return NextResponse.json({ error: 'Payload too large. Maximum size is 1MB' }, { status: 413 });
  }

  let flow = null;
  if (projectId) {
    const projectFlows = await getProjectFlows(projectId);
    flow = projectFlows.find((f) => f.id === flowId) || null;
  }
  if (!flow && userId) {
    flow = await getFlow(userId, flowId);
  }
  if (!flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
  }

  const rawBody = await request.text();

  if (flow.incomingWebhookSecret && typeof flow.incomingWebhookSecret === 'string') {
    const signatureHeader =
      request.headers.get('x-webhook-signature') ||
      request.headers.get('X-Webhook-Signature');
    const check = verifyIncomingXWebhookSignature(rawBody, flow.incomingWebhookSecret, signatureHeader);
    if (!check.ok) {
      return NextResponse.json({ error: 'Unauthorized', message: check.error }, { status: 401 });
    }
  }

  let body;
  try {
    body = rawBody.trim() === '' ? {} : JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const incomingHeaders = Object.fromEntries(request.headers.entries());

  try {
    const { webhookRecord, webhookResult } = await executeWebhook({
      userId: userId || flow.ownerId,
      projectId: projectId || null,
      flow,
      flowId,
      incomingData: body,
      incomingHeaders,
      mode: 'new',
      originalWebhook: null,
      manual: false,
    });

    const saved = await saveWebhook(userId || flow.ownerId, flowId, webhookRecord, projectId);
    if (!saved) {
      console.error(
        `[FlowHook] Webhook processed for flow ${flowId} but failed to persist history`,
      );
    }

    return NextResponse.json(
      {
        success: webhookResult.success,
        message: webhookResult.message,
        status: webhookResult.status,
        responseTime: webhookResult.responseTime,
        data: webhookRecord.mappedData,
        responseData: webhookResult.responseData || null,
      },
      { status: webhookResult.status || 200 },
    );
  } catch (error) {
    console.error('Error processing webhook in executeWebhook:', error);

    if (error.__flowType === 'conditionsFailed') {
      return NextResponse.json(
        {
          success: false,
          error: 'Conditions not met',
          message: 'Las condiciones configuradas no se cumplieron',
        },
        { status: error.status || 400 },
      );
    }

    if (error.__flowType === 'prevEndpointRequired') {
      return NextResponse.json(
        {
          error: `Failed to fetch data from previous endpoint: ${error.endpoint}`,
          message:
            typeof error.responseData === 'string'
              ? error.responseData
              : error.responseData
              ? JSON.stringify(error.responseData)
              : error.message,
          url: error.url,
          status: error.status || 500,
        },
        { status: error.status || 500 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}

export function methodNotAllowed() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
