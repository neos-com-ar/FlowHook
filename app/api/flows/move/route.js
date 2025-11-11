import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  moveFlowBetweenProjects,
  checkProjectAccess,
  getProjectFlows,
} from '@/lib/db';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST: Mover un flujo entre proyectos
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
    const { flowId, fromProjectId, toProjectId } = body;

    if (!flowId || !toProjectId) {
      return NextResponse.json(
        { error: 'Missing required fields: flowId, toProjectId' },
        { status: 400 }
      );
    }

    // Si fromProjectId es null, viene de flujos sin proyecto
    if (fromProjectId && fromProjectId === toProjectId) {
      return NextResponse.json(
        { error: 'Source and target projects cannot be the same' },
        { status: 400 }
      );
    }

    // Verificar permisos del proyecto destino
    const hasAccessTo = await checkProjectAccess(userId, toProjectId, 'editor');
    if (!hasAccessTo) {
      return NextResponse.json(
        { error: 'You do not have permission to move flows to this project' },
        { status: 403 }
      );
    }

    // Si viene de un proyecto, verificar permisos del origen
    if (fromProjectId) {
      const hasAccessFrom = await checkProjectAccess(userId, fromProjectId, 'editor');
      if (!hasAccessFrom) {
        return NextResponse.json(
          { error: 'You do not have permission to move flows from this project' },
          { status: 403 }
        );
      }

      // Verificar que el flujo existe en el proyecto origen
      const { getProjectFlows } = await import('@/lib/db');
      const sourceFlows = await getProjectFlows(fromProjectId);
      const flow = sourceFlows.find(f => f.id === flowId);
      if (!flow) {
        return NextResponse.json(
          { error: 'Flow not found in source project' },
          { status: 404 }
        );
      }
    } else {
      // Verificar que el flujo existe en flujos sin proyecto
      const { getFlow } = await import('@/lib/db');
      const flow = await getFlow(userId, flowId);
      if (!flow) {
        return NextResponse.json(
          { error: 'Flow not found' },
          { status: 404 }
        );
      }
    }

    // Mover el flujo
    const success = await moveFlowBetweenProjects(fromProjectId || null, toProjectId, flowId, userId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to move flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Flow moved successfully',
      flow: {
        ...flow,
        projectId: toProjectId,
      },
    });
  } catch (error) {
    console.error('Error moving flow:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

