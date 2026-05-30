import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  checkWorkspaceAccess,
  createPendingWorkspaceInvitation,
  getWorkspace,
} from '@/lib/db';
import Adapter from '@/lib/adapter';

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

    const members = await getWorkspaceMembers(workspaceId);
    const adapter = Adapter();
    const enriched = await Promise.all(
      members.map(async (member) => {
        try {
          const user = await adapter.getUser(member.userId);
          return {
            ...member,
            userEmail: user?.email || 'Unknown',
            userName: user?.name || user?.email || 'Unknown',
          };
        } catch {
          return { ...member, userEmail: 'Unknown', userName: 'Unknown' };
        }
      })
    );

    return NextResponse.json({ members: enriched });
  } catch (error) {
    console.error('Error getting workspace members:', error);
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
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    if (workspace.isPersonal) {
      return NextResponse.json({ error: 'No se pueden invitar miembros al workspace personal' }, { status: 400 });
    }

    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'admin');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Only workspace admins can invite users' }, { status: 403 });
    }

    const body = await request.json();
    const { userEmail, role } = body;
    if (!userEmail || !role) {
      return NextResponse.json({ error: 'Missing required fields: userEmail, role' }, { status: 400 });
    }

    const validRoles = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be one of: admin, editor, viewer' }, { status: 400 });
    }

    const adapter = Adapter();
    const invitedUser = await adapter.getUserByEmail(userEmail);

    if (invitedUser) {
      await addWorkspaceMember(workspaceId, invitedUser.id, role, session.user.id);
      return NextResponse.json({
        success: true,
        user: { id: invitedUser.id, email: invitedUser.email, name: invitedUser.name },
      });
    }

    await createPendingWorkspaceInvitation(userEmail, workspaceId, role, session.user.id);
    return NextResponse.json({
      success: true,
      pending: true,
      email: userEmail,
      message: 'Invitation sent. User will be added when they register.',
    });
  } catch (error) {
    console.error('Error inviting workspace member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = params;
    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'owner');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Only workspace owners can update member roles' }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId, newRole } = body;
    if (!targetUserId || !newRole) {
      return NextResponse.json({ error: 'Missing required fields: targetUserId, newRole' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'editor', 'viewer'];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const members = await getWorkspaceMembers(workspaceId);
    const target = members.find(m => m.userId === targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (target.role === 'owner') {
      const ownerCount = members.filter(m => m.role === 'owner').length;
      if (ownerCount === 1 && newRole !== 'owner') {
        return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 });
      }
    }

    await updateWorkspaceMemberRole(workspaceId, targetUserId, newRole);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating workspace member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = params;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const hasAccess = await checkWorkspaceAccess(session.user.id, workspaceId, 'admin');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Only workspace admins can remove members' }, { status: 403 });
    }

    await removeWorkspaceMember(workspaceId, targetUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing workspace member:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
