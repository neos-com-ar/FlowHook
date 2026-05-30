import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getWebhooks, getProjectFlows, getFlow, updateWebhook } from '@/lib/db';
import { executeWebhook } from '@/lib/webhook-executor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { webhookId, flowId, projectId, modifiedPayload } = body || {};

    if (!webhookId || !flowId) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          message: 'webhookId y flowId son requeridos',
        },
        { status: 400 },
      );
    }

    // Buscar el webhook original en el historial de ese flujo
    const { webhooks } = await getWebhooks(userId, flowId, 1000, 0, {
      projectId: projectId || null,
    });
    const originalWebhook =
      webhooks.find((w) => w.id === webhookId) || null;

    if (!originalWebhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    // Solo permitir reintentar fallidos
    if (originalWebhook.result?.success === true) {
      return NextResponse.json(
        {
          error: 'Only failed webhooks can be retried',
        },
        { status: 400 },
      );
    }

    // Resolver el flujo asociado
    let flow = null;
    if (projectId) {
      const projectFlows = await getProjectFlows(projectId);
      flow = projectFlows.find((f) => f.id === flowId) || null;
    }
    if (!flow) {
      flow = await getFlow(userId, flowId);
    }

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 },
      );
    }

    const incomingData =
      modifiedPayload !== undefined
        ? modifiedPayload
        : originalWebhook.incomingData || {};

    const { webhookRecord, webhookResult } = await executeWebhook({
      userId,
      projectId: projectId || null,
      flow,
      flowId,
      incomingData,
      incomingHeaders: originalWebhook.incomingHeaders || {},
      mode: 'retry',
      originalWebhook,
      manual: true,
    });

    const updated = await updateWebhook(
      userId,
      flowId,
      webhookId,
      () => webhookRecord,
      projectId || null,
    );

    if (!updated) {
      return NextResponse.json(
        {
          error: 'Failed to update webhook history',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: webhookResult.success,
        status: webhookResult.status,
        message: webhookResult.message,
        responseTime: webhookResult.responseTime,
      },
      { status: webhookResult.status || 200 },
    );
  } catch (error) {
    console.error('Error retrying webhook:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}


