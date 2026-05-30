import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  checkProjectAccess,
  getProjectFlows,
  listEntityMappings,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/entity-linking?projectId=...&flowId=...&mappingKey=...&limit=...
 */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const flowId = searchParams.get('flowId');
    const mappingKey = searchParams.get('mappingKey') || undefined;
    const limit = Number(searchParams.get('limit') || 50);

    if (!projectId || !flowId) {
      return NextResponse.json(
        { error: 'Missing required query params: projectId, flowId' },
        { status: 400 },
      );
    }

    const hasAccess = await checkProjectAccess(userId, projectId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 },
      );
    }

    const flows = await getProjectFlows(projectId);
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found in project' },
        { status: 404 },
      );
    }

    const mappings = await listEntityMappings(userId, flowId, {
      mappingKey,
      limit,
      projectId,
    });

    return NextResponse.json({
      success: true,
      flowId,
      count: mappings.length,
      mappings,
    });
  } catch (error) {
    console.error('Error listing entity mappings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
