import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getWebhookStorageDiagnostics } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const flowId = searchParams.get('flowId');
    const projectId = searchParams.get('projectId');

    if (!flowId) {
      return NextResponse.json(
        { error: 'Missing required parameter: flowId' },
        { status: 400 },
      );
    }

    const diagnostics = await getWebhookStorageDiagnostics(
      session.user.id,
      flowId,
      projectId || null,
    );

    return NextResponse.json({ diagnostics });
  } catch (error) {
    console.error('Error getting webhook diagnostics:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
