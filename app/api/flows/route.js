import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getUserFlows,
  getFlow,
  saveFlow,
  deleteFlow,
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
    const flows = await getUserFlows(userId);

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

    const flow = {
      id: body.id,
      name: body.name,
      destino: body.destino,
      method: method,
      map: body.map || {},
    };

    const success = await saveFlow(userId, flow);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      flow,
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
    const { flowId, newId, newName } = body;

    if (!flowId) {
      return NextResponse.json(
        { error: 'Missing flowId parameter' },
        { status: 400 }
      );
    }

    // Obtener el flujo original
    const originalFlow = await getFlow(userId, flowId);
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

    // Verificar que el nuevo ID no exista ya
    const existingFlow = await getFlow(userId, newId);
    if (existingFlow) {
      return NextResponse.json(
        { error: 'A flow with this ID already exists' },
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
    };

    const success = await saveFlow(userId, duplicatedFlow);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to duplicate flow' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      flow: duplicatedFlow,
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

    if (!flowId) {
      return NextResponse.json(
        { error: 'Missing flowId parameter' },
        { status: 400 }
      );
    }

    // Verificar que el flujo pertenece al usuario
    const flow = await getFlow(userId, flowId);
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    const success = await deleteFlow(userId, flowId);

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

