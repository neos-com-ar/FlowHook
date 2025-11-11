import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getProjectFlows,
  checkProjectAccess,
} from '@/lib/db';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Obtener todos los flujos de un proyecto
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

    // Verificar que el usuario tiene acceso
    const hasAccess = await checkProjectAccess(userId, projectId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    const flows = await getProjectFlows(projectId);

    return NextResponse.json({ flows });
  } catch (error) {
    console.error('Error getting project flows:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

