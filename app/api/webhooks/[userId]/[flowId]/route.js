import { NextResponse } from 'next/server';
import { getFlow } from '@/lib/db';
import axios from 'axios';

export async function POST(request, { params }) {
  try {
    // En Next.js 14, params puede ser una Promise
    const resolvedParams = await params;
    const { userId, flowId } = resolvedParams;

    // Validar SECRET_KEY si está configurado
    if (process.env.SECRET_KEY) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized: Missing or invalid Authorization header' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      if (token !== process.env.SECRET_KEY) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 401 }
        );
      }
    }

    // Validar tamaño del body (max 1MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large. Maximum size is 1MB' },
        { status: 413 }
      );
    }

    // Obtener el flujo de configuración
    const flow = await getFlow(userId, flowId);
    
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Obtener el body del webhook
    const body = await request.json();

    // Aplicar el mapeo de datos
    const mappedData = {};
    if (flow.map && typeof flow.map === 'object') {
      for (const [destKey, sourceKey] of Object.entries(flow.map)) {
        // Soporte para rutas anidadas con notación de punto
        const value = getNestedValue(body, sourceKey);
        if (value !== undefined) {
          mappedData[destKey] = value;
        }
      }
    } else {
      // Si no hay mapeo, enviar todos los datos
      Object.assign(mappedData, body);
    }

    // Reenviar los datos al destino
    try {
      const response = await axios.post(flow.destino, mappedData, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 segundos
      });

      return NextResponse.json({
        success: true,
        message: 'Webhook processed and forwarded successfully',
        status: response.status,
        data: mappedData,
      });
    } catch (error) {
      console.error('Error forwarding webhook:', error);
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to forward webhook to destination',
          message: error.message,
          data: mappedData,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Función auxiliar para obtener valores anidados
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }
  
  return value;
}

// Solo permitir método POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}

