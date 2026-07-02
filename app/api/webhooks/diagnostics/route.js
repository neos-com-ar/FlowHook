import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getWebhookStorageDiagnostics, compactWebhookStorageForFlow } from '@/lib/db';
import { normalizeFlowIdParam } from '@/lib/webhook-flow-id.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawFlowId = searchParams.get('flowId');
    const projectId = searchParams.get('projectId');

    if (!rawFlowId) {
      return NextResponse.json(
        { error: 'Missing required parameter: flowId' },
        { status: 400 },
      );
    }

    const flowId = normalizeFlowIdParam(rawFlowId);
    const flowIdNormalized = rawFlowId !== flowId;

    const diagnostics = await getWebhookStorageDiagnostics(
      session.user.id,
      flowId,
      projectId || null,
    );

    return NextResponse.json({
      diagnostics,
      ...(flowIdNormalized ? { flowIdUsed: flowId, flowIdReceived: rawFlowId } : {}),
    });
  } catch (error) {
    console.error('Error getting webhook diagnostics:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawFlowId = searchParams.get('flowId');
    const projectId = searchParams.get('projectId');

    if (!rawFlowId) {
      return NextResponse.json(
        { error: 'Missing required parameter: flowId' },
        { status: 400 },
      );
    }

    const flowId = normalizeFlowIdParam(rawFlowId);
    const result = await compactWebhookStorageForFlow(
      session.user.id,
      flowId,
      projectId || null,
    );

    const diagnostics = await getWebhookStorageDiagnostics(
      session.user.id,
      flowId,
      projectId || null,
    );

    return NextResponse.json({ compact: result, diagnostics });
  } catch (error) {
    console.error('Error compacting webhook storage:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
