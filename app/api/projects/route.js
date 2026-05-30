import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  createProject,
  getUserProjects,
  updateProject,
  deleteProject,
  getProject,
  checkProjectAccess,
  ensureUserWorkspaceSetup,
  getPersonalWorkspace,
  getProjectPermissions,
} from '@/lib/db';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Obtener todos los proyectos del usuario autenticado
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    await ensureUserWorkspaceSetup(userId);

    const projects = workspaceId
      ? await getUserProjects(userId, { workspaceId })
      : await getUserProjects(userId);

    const enrichedProjects = await Promise.all(
      projects.map(async (project) => {
        const permissions = await getProjectPermissions(project.id);
        const memberCount = permissions.length;
        return {
          ...project,
          memberCount,
          isShared: memberCount > 1,
        };
      }),
    );

    return NextResponse.json({ projects: enrichedProjects });
  } catch (error) {
    console.error('Error getting projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Crear un nuevo proyecto
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();

    // Validar campos requeridos
    if (!body.name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Validar nombre (no vacío, longitud razonable)
    if (body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name cannot be empty' },
        { status: 400 }
      );
    }

    if (body.name.length > 100) {
      return NextResponse.json(
        { error: 'Project name is too long (max 100 characters)' },
        { status: 400 }
      );
    }

    await ensureUserWorkspaceSetup(userId);

    let workspaceId = body.workspaceId;
    if (!workspaceId) {
      const personal = await getPersonalWorkspace(userId);
      workspaceId = personal?.id;
    }
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing required field: workspaceId' },
        { status: 400 }
      );
    }

    const project = await createProject(userId, {
      workspaceId,
      name: body.name.trim(),
      description: body.description || '',
      isPersonal: body.isPersonal !== undefined ? body.isPersonal : true,
      color: body.color || '#3B82F6',
      icon: body.icon || '📁',
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Actualizar un proyecto
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene acceso de editor o owner
    const hasAccess = await checkProjectAccess(userId, projectId, 'editor');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this project' },
        { status: 403 }
      );
    }

    // Validar nombre si se proporciona
    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Project name cannot be empty' },
          { status: 400 }
        );
      }
      if (body.name.length > 100) {
        return NextResponse.json(
          { error: 'Project name is too long (max 100 characters)' },
          { status: 400 }
        );
      }
    }

    const updates = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if (body.icon !== undefined) updates.icon = body.icon;

    const updated = await updateProject(projectId, updates);

    if (!updated) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project: updated,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar un proyecto
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    // Verificar que el usuario es owner
    const hasAccess = await checkProjectAccess(userId, projectId, 'owner');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Only the project owner can delete the project' },
        { status: 403 }
      );
    }

    const success = await deleteProject(projectId, userId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

