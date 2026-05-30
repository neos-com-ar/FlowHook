import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getUserWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  checkWorkspaceAccess,
  ensureUserWorkspaceSetup,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserWorkspaceSetup(session.user.id);
    const workspaces = await getUserWorkspaces(session.user.id);

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Error getting workspaces:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }
    if (body.name.length > 100) {
      return NextResponse.json({ error: 'Workspace name is too long (max 100 characters)' }, { status: 400 });
    }

    const workspace = await createWorkspace(session.user.id, {
      name: body.name.trim(),
      description: body.description || '',
      color: body.color || '#3B82F6',
      icon: body.icon || 'Folder',
      isPersonal: false,
    });

    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    console.error('Error creating workspace:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId } = body;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId parameter' }, { status: 400 });
    }

    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'admin');
    if (!hasAccess) {
      return NextResponse.json({ error: 'You do not have permission to edit this workspace' }, { status: 403 });
    }

    const updates = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Workspace name cannot be empty' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.slug !== undefined) updates.slug = body.slug;

    const workspace = await updateWorkspace(workspaceId, updates);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId parameter' }, { status: 400 });
    }

    await deleteWorkspace(workspaceId, session.user.id);
    return NextResponse.json({ success: true, message: 'Workspace deleted successfully' });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
