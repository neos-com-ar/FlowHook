import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { archiveWorkspace, restoreWorkspace } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = params;
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'archive';

    if (action === 'restore') {
      const workspace = await restoreWorkspace(workspaceId, session.user.id);
      return NextResponse.json({ success: true, workspace });
    }

    const workspace = await archiveWorkspace(workspaceId, session.user.id);
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    console.error('Error archiving workspace:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 400 });
  }
}
