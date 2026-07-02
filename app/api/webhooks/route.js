import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getWebhooks } from '@/lib/db';
import { normalizeFlowIdParam } from '@/lib/webhook-flow-id.mjs';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const flowId = normalizeFlowIdParam(searchParams.get('flowId') || '');
    const projectId = searchParams.get('projectId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    const result = await getWebhooks(
      session.user.id,
      flowId || null,
      limit,
      offset,
      {
        status,
        startDate,
        endDate,
        projectId: projectId || null,
        search: search || null,
      },
    );

    return NextResponse.json({ 
      webhooks: result.webhooks,
      total: result.total 
    });
  } catch (error) {
    console.error('Error getting webhooks:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

