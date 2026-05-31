import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { mergeWorkspaces } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: sourceWorkspaceId } = params;
    const body = await request.json();
    const { targetWorkspaceId } = body;

    if (!targetWorkspaceId) {
      return NextResponse.json({ error: 'Missing required field: targetWorkspaceId' }, { status: 400 });
    }

    const result = await mergeWorkspaces(sourceWorkspaceId, targetWorkspaceId, session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error merging workspaces:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 400 });
  }
}
