import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { deleteWebhooksFromDate } from '@/lib/db';
import { normalizeFlowIdParam } from '@/lib/webhook-flow-id.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/webhooks/delete
 * Body: { fromDate: "YYYY-MM-DD", flowId?: string, projectId?: string }
 * Borra logs con timestamp >= fromDate (inicio del día UTC).
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const fromDate = body?.fromDate;
    const rawFlowId = body?.flowId || null;
    const projectId = body?.projectId || null;

    if (!fromDate || typeof fromDate !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: fromDate (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const flowId = rawFlowId ? normalizeFlowIdParam(rawFlowId) : null;

    const result = await deleteWebhooksFromDate(session.user.id, fromDate, {
      flowId,
      projectId: projectId || null,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error deleting webhooks from date:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
