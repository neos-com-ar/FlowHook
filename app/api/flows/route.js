import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getUserFlows,
  getFlow,
  saveFlow,
  deleteFlow,
  getAllFlowsForUser,
  saveFlowInProject,
  getProjectFlows,
  deleteFlowFromProject,
  checkProjectAccess,
  getFlow as getFlowFromProject,
} from '@/lib/db';

// Marcar como dinámico porque usa headers (getServerSession)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Obtener todos los flujos del usuario autenticado
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
    const projectId = searchParams.get('projectId');

    let flows;
    if (projectId) {
      // Obtener flujos de un proyecto específico
      const hasAccess = await checkProjectAccess(userId, projectId, 'viewer');
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }
      flows = await getProjectFlows(projectId);
    } else {
      // Obtener todos los flujos accesibles (de todos los proyectos)
      flows = await getAllFlowsForUser(userId);
      
      // También incluir flujos antiguos sin proyecto (para compatibilidad)
      const oldFlows = await getUserFlows(userId);
      const oldFlowsWithoutProject = oldFlows.filter(f => !f.projectId);
      flows = [...flows, ...oldFlowsWithoutProject];
    }

    return NextResponse.json({ flows });
  } catch (error) {
    console.error('Error getting flows:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Crear o actualizar un flujo
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
    if (!body.id || !body.name || !body.destino) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, destino' },
        { status: 400 }
      );
    }

    // Validar projectId (requerido ahora)
    if (!body.projectId) {
      return NextResponse.json(
        { error: 'Missing required field: projectId' },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene permisos de editor en el proyecto
    const hasAccess = await checkProjectAccess(userId, body.projectId, 'editor');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to edit flows in this project' },
        { status: 403 }
      );
    }

    // Validar formato del ID (solo alfanumérico, guiones y guiones bajos)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.id)) {
      return NextResponse.json(
        { error: 'Invalid flow ID format. Only alphanumeric characters, hyphens and underscores are allowed.' },
        { status: 400 }
      );
    }

    // Validar URL del destino
    try {
      new URL(body.destino);
    } catch {
      return NextResponse.json(
        { error: 'Invalid destination URL' },
        { status: 400 }
      );
    }

    // Validar método HTTP
    const allowedMethods = ['POST', 'PUT', 'PATCH'];
    const method = body.method ? body.method.toUpperCase() : 'POST';
    if (!allowedMethods.includes(method)) {
      return NextResponse.json(
        { error: 'Invalid HTTP method. Allowed methods: POST, PUT, PATCH' },
        { status: 400 }
      );
    }

    // Validar endpoints del ERP si están configurados
    // Soporte para array (múltiples) o objeto único (retrocompatibilidad)
    let erpEndpoints = [];
    if (body.erpEndpoints && Array.isArray(body.erpEndpoints)) {
      erpEndpoints = body.erpEndpoints;
    } else if (body.erpEndpoint) {
      // Retrocompatibilidad: convertir objeto único a array
      erpEndpoints = [body.erpEndpoint];
    }
    
    // Validar cada endpoint del ERP
    for (const erpEndpoint of erpEndpoints) {
      if (erpEndpoint.url) {
        try {
          new URL(erpEndpoint.url);
        } catch {
          return NextResponse.json(
            { error: `Invalid ERP endpoint URL: ${erpEndpoint.name || 'unnamed'}` },
            { status: 400 }
          );
        }
        
        // Validar método HTTP del ERP
        if (erpEndpoint.method) {
          const erpMethod = erpEndpoint.method.toUpperCase();
          const allowedErpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
          if (!allowedErpMethods.includes(erpMethod)) {
            return NextResponse.json(
              { error: `Invalid ERP HTTP method for ${erpEndpoint.name || 'unnamed'}. Allowed methods: GET, POST, PUT, PATCH, DELETE` },
              { status: 400 }
            );
          }
        }
      }
    }

    const flow = {
      id: body.id,
      name: body.name,
      destino: body.destino,
      method: method,
      map: body.map || {},
      headers: body.headers || undefined, // Headers personalizados del destino
      erpEndpoints: erpEndpoints.length > 0 ? erpEndpoints : null, // Array de endpoints del ERP
      erpEndpoint: body.erpEndpoint || null, // Mantener para retrocompatibilidad
      ownerId: userId,
    };

    // Guardar en el proyecto
    const success = await saveFlowInProject(body.projectId, flow);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      flow: {
        ...flow,
        projectId: body.projectId,
      },
    });
  } catch (error) {
    console.error('Error saving flow:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Duplicar un flujo
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
    const { flowId, newId, newName, projectId } = body;

    if (!flowId || !projectId) {
      return NextResponse.json(
        { error: 'Missing flowId or projectId parameter' },
        { status: 400 }
      );
    }

    // Verificar permisos del proyecto
    const hasAccess = await checkProjectAccess(userId, projectId, 'editor');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have permission to edit flows in this project' },
        { status: 403 }
      );
    }

    // Obtener el flujo original del proyecto
    const projectFlows = await getProjectFlows(projectId);
    const originalFlow = projectFlows.find(f => f.id === flowId);
    if (!originalFlow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Validar que el nuevo ID no esté vacío
    if (!newId || !newName) {
      return NextResponse.json(
        { error: 'Missing newId or newName' },
        { status: 400 }
      );
    }

    // Validar formato del nuevo ID
    if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
      return NextResponse.json(
        { error: 'Invalid flow ID format. Only alphanumeric characters, hyphens and underscores are allowed.' },
        { status: 400 }
      );
    }

    // Verificar que el nuevo ID no exista ya en el proyecto
    const existingFlow = projectFlows.find(f => f.id === newId);
    if (existingFlow) {
      return NextResponse.json(
        { error: 'A flow with this ID already exists in this project' },
        { status: 400 }
      );
    }

    // Crear el flujo duplicado
    const duplicatedFlow = {
      id: newId,
      name: newName,
      destino: originalFlow.destino,
      method: originalFlow.method || 'POST',
      map: originalFlow.map ? { ...originalFlow.map } : {},
      headers: originalFlow.headers ? { ...originalFlow.headers } : undefined, // Headers personalizados del destino
      erpEndpoints: originalFlow.erpEndpoints ? originalFlow.erpEndpoints.map(e => ({ ...e })) : null,
      erpEndpoint: originalFlow.erpEndpoint ? { ...originalFlow.erpEndpoint } : null, // Retrocompatibilidad
      ownerId: userId,
    };

    const success = await saveFlowInProject(projectId, duplicatedFlow);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to duplicate flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      flow: {
        ...duplicatedFlow,
        projectId,
      },
      message: 'Flow duplicated successfully',
    });
  } catch (error) {
    console.error('Error duplicating flow:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar un flujo
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
    const flowId = searchParams.get('flowId');
    const projectId = searchParams.get('projectId');

    if (!flowId) {
      return NextResponse.json(
        { error: 'Missing flowId parameter' },
        { status: 400 }
      );
    }

    let success;
    if (projectId) {
      // Eliminar de proyecto
      const hasAccess = await checkProjectAccess(userId, projectId, 'editor');
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You do not have permission to delete flows in this project' },
          { status: 403 }
        );
      }

      success = await deleteFlowFromProject(projectId, flowId);
    } else {
      // Eliminar flujo antiguo (sin proyecto) - para compatibilidad
      const flow = await getFlow(userId, flowId);
      if (!flow) {
        return NextResponse.json(
          { error: 'Flow not found' },
          { status: 404 }
        );
      }

      success = await deleteFlow(userId, flowId);
    }

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Flow deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting flow:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

