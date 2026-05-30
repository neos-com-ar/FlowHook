import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { moveProject } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = params;
    const body = await request.json();
    const { targetWorkspaceId, inviteCollaborators = true } = body;

    if (!targetWorkspaceId) {
      return NextResponse.json({ error: 'Missing targetWorkspaceId' }, { status: 400 });
    }

    const result = await moveProject(projectId, targetWorkspaceId, session.user.id, {
      inviteCollaborators,
    });

    return NextResponse.json({
      success: true,
      ...result,
      webhookUrlHint: `/api/webhooks/${result.targetWorkspaceId}/${projectId}/{flowId}`,
    });
  } catch (error) {
    console.error('Error moving project:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
