import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { deleteWebhooksBeforeDate } from '@/lib/db';
import { normalizeFlowIdParam } from '@/lib/webhook-flow-id.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/webhooks/delete
 * Body: { beforeDate: "YYYY-MM-DD", flowId?: string, projectId?: string }
 * Borra logs con timestamp < beforeDate (inicio del día UTC).
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const beforeDate = body?.beforeDate || body?.fromDate;
    const rawFlowId = body?.flowId || null;
    const projectId = body?.projectId || null;

    if (!beforeDate || typeof beforeDate !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: beforeDate (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const flowId = rawFlowId ? normalizeFlowIdParam(rawFlowId) : null;

    const result = await deleteWebhooksBeforeDate(session.user.id, beforeDate, {
      flowId,
      projectId: projectId || null,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error deleting webhooks before date:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
