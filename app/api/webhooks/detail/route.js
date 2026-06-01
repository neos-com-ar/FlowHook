import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getWebhookById } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('webhookId');
    const flowId = searchParams.get('flowId');
    const projectId = searchParams.get('projectId');

    if (!webhookId || !flowId) {
      return NextResponse.json(
        { error: 'Missing required parameters: webhookId, flowId' },
        { status: 400 },
      );
    }

    const webhook = await getWebhookById(
      session.user.id,
      webhookId,
      flowId,
      projectId || null,
    );

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ webhook });
  } catch (error) {
    console.error('Error getting webhook detail:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
