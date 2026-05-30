import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getProjectPermissions,
  addProjectPermission,
  removeProjectPermission,
  updateProjectPermission,
  checkProjectAccess,
  getUserProjectRole,
  getProject,
  getUserWorkspaceRole,
  addWorkspaceMember,
} from '@/lib/db';
import Adapter from '@/lib/adapter';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Obtener permisos de un proyecto
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { projectId } = params;

    // Verificar que el usuario tiene acceso de viewer
    const hasAccess = await checkProjectAccess(userId, projectId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const permissions = await getProjectPermissions(projectId);

    // Enriquecer con información de usuarios
    const adapter = Adapter();
    const enrichedPermissions = await Promise.all(
      permissions.map(async (perm) => {
        try {
          const user = await adapter.getUser(perm.userId);
          return {
            ...perm,
            userEmail: user?.email || 'Unknown',
            userName: user?.name || user?.email || 'Unknown',
          };
        } catch (error) {
          return {
            ...perm,
            userEmail: 'Unknown',
            userName: 'Unknown',
          };
        }
      })
    );

    return NextResponse.json({ permissions: enrichedPermissions });
  } catch (error) {
    console.error('Error getting project permissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Agregar un permiso (invitar usuario)
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { projectId } = params;
    const body = await request.json();

    // Verificar que el usuario tiene acceso de owner o admin
    const hasAccess = await checkProjectAccess(userId, projectId, 'owner');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Only project owners can invite users' },
        { status: 403 }
      );
    }

    const { userEmail, role } = body;

    if (!userEmail || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: userEmail, role' },
        { status: 400 }
      );
    }

    // Validar rol
    const validRoles = ['owner', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be one of: owner, editor, viewer' },
        { status: 400 }
      );
    }

    // Buscar usuario por email
    const adapter = Adapter();
    const invitedUser = await adapter.getUserByEmail(userEmail);

    if (invitedUser) {
      const project = await getProject(projectId);
      if (project?.workspaceId) {
        const wsRole = await getUserWorkspaceRole(invitedUser.id, project.workspaceId);
        if (!wsRole) {
          await addWorkspaceMember(project.workspaceId, invitedUser.id, 'viewer', userId);
        }
      }

      // Usuario existe, agregar permiso directamente
      const success = await addProjectPermission(
        projectId,
        invitedUser.id,
        role,
        userId
      );

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to add permission' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'User invited successfully',
        user: {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
        },
      });
    } else {
      // Usuario no existe, crear invitación pendiente
      const { createPendingInvitation } = await import('@/lib/db');
      const success = await createPendingInvitation(
        userEmail,
        projectId,
        role,
        userId
      );

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to create invitation' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Invitation sent. User will be added when they register.',
        pending: true,
        email: userEmail,
      });
    }
  } catch (error) {
    console.error('Error adding project permission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Actualizar un permiso (cambiar rol)
export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { projectId } = params;
    const body = await request.json();

    // Verificar que el usuario tiene acceso de owner
    const hasAccess = await checkProjectAccess(userId, projectId, 'owner');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Only project owners can update permissions' },
        { status: 403 }
      );
    }

    const { targetUserId, newRole } = body;

    if (!targetUserId || !newRole) {
      return NextResponse.json(
        { error: 'Missing required fields: targetUserId, newRole' },
        { status: 400 }
      );
    }

    // Validar rol
    const validRoles = ['owner', 'editor', 'viewer'];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be one of: owner, editor, viewer' },
        { status: 400 }
      );
    }

    // No permitir cambiar el rol del owner si es el único owner
    const permissions = await getProjectPermissions(projectId);
    const targetPermission = permissions.find(p => p.userId === targetUserId);
    if (!targetPermission) {
      return NextResponse.json(
        { error: 'User not found in project permissions' },
        { status: 404 }
      );
    }

    if (targetPermission.role === 'owner') {
      const ownerCount = permissions.filter(p => p.role === 'owner').length;
      if (ownerCount === 1 && newRole !== 'owner') {
        return NextResponse.json(
          { error: 'Cannot remove the last owner from the project' },
          { status: 400 }
        );
      }
    }

    const success = await updateProjectPermission(projectId, targetUserId, newRole);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update permission' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Permission updated successfully',
    });
  } catch (error) {
    console.error('Error updating project permission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remover un permiso
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { projectId } = params;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene acceso de owner
    const hasAccess = await checkProjectAccess(userId, projectId, 'owner');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Only project owners can remove permissions' },
        { status: 403 }
      );
    }

    // No permitir remover el último owner
    const permissions = await getProjectPermissions(projectId);
    const targetPermission = permissions.find(p => p.userId === targetUserId);
    if (targetPermission?.role === 'owner') {
      const ownerCount = permissions.filter(p => p.role === 'owner').length;
      if (ownerCount === 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner from the project' },
          { status: 400 }
        );
      }
    }

    // No permitir que un usuario se remueva a sí mismo si es el único owner
    if (targetUserId === userId) {
      const userRole = await getUserProjectRole(userId, projectId);
      if (userRole === 'owner') {
        const ownerCount = permissions.filter(p => p.role === 'owner').length;
        if (ownerCount === 1) {
          return NextResponse.json(
            { error: 'Cannot remove yourself as the last owner. Transfer ownership first.' },
            { status: 400 }
          );
        }
      }
    }

    const success = await removeProjectPermission(projectId, targetUserId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to remove permission' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Permission removed successfully',
    });
  } catch (error) {
    console.error('Error removing project permission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

