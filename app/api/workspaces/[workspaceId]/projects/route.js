import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getUserProjects,
  createProject,
  checkWorkspaceAccess,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = params;
    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }

    const projects = await getUserProjects(session.user.id, { workspaceId });
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error getting workspace projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = params;
    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'editor');
    if (!hasAccess) {
      return NextResponse.json({ error: 'You do not have permission to create projects in this workspace' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const project = await createProject(session.user.id, {
      workspaceId,
      name: body.name.trim(),
      description: body.description || '',
      isPersonal: body.isPersonal !== undefined ? body.isPersonal : false,
      color: body.color || '#3B82F6',
      icon: body.icon || 'Folder',
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('Error creating workspace project:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
