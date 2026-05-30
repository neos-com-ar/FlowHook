import { NextResponse } from 'next/server';
import { getProjectFlows, getFlow, saveWebhook } from '@/lib/db';
import { executeWebhook } from '@/lib/webhook-executor';
import { verifyIncomingXWebhookSignature } from '@/lib/webhook-signature-verify';

export async function POST(request, { params }) {
  try {
    // En Next.js 14, params puede ser una Promise
    const resolvedParams = await params;
    const { userId, projectId, flowId } = resolvedParams;

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
    // Primero buscar en el proyecto específico
    let flow = null;
    if (projectId) {
      const projectFlows = await getProjectFlows(projectId);
      flow = projectFlows.find(f => f.id === flowId);
    }
    
    // Si no se encuentra en el proyecto, buscar en flujos antiguos sin proyecto (retrocompatibilidad)
    if (!flow) {
      flow = await getFlow(userId, flowId);
    }
    
    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    const rawBody = await request.text();

    if (
      flow.incomingWebhookSecret &&
      typeof flow.incomingWebhookSecret === 'string'
    ) {
      const signatureHeader =
        request.headers.get('x-webhook-signature') ||
        request.headers.get('X-Webhook-Signature');

      const check = verifyIncomingXWebhookSignature(
        rawBody,
        flow.incomingWebhookSecret,
        signatureHeader,
      );

      if (!check.ok) {
        return NextResponse.json(
          { error: 'Unauthorized', message: check.error },
          { status: 401 },
        );
      }
    }

    let body;
    try {
      body = rawBody.trim() === '' ? {} : JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    // Normalizar headers entrantes para que puedan reutilizarse en plantillas
    // (ej: Authorization: "Bearer {{headers.authorization}}")
    const incomingHeaders = Object.fromEntries(request.headers.entries());

    try {
      const { webhookRecord, webhookResult } = await executeWebhook({
        userId,
        flow,
        flowId,
        incomingData: body,
        incomingHeaders,
        mode: 'new',
        originalWebhook: null,
        manual: false,
      });

      await saveWebhook(userId, flowId, webhookRecord, projectId);

      return NextResponse.json(
        {
          success: webhookResult.success,
          message: webhookResult.message,
          status: webhookResult.status,
          responseTime: webhookResult.responseTime,
          data: webhookRecord.mappedData,
          responseData: webhookResult.responseData || null,
        },
        { status: webhookResult.status || 200 },
      );
    } catch (error) {
      console.error('Error processing webhook in executeWebhook:', error);

      if (error.__flowType === 'conditionsFailed') {
        return NextResponse.json(
          {
            success: false,
            error: 'Conditions not met',
            message: 'Las condiciones configuradas no se cumplieron',
          },
          { status: error.status || 400 },
        );
      }

      if (error.__flowType === 'prevEndpointRequired') {
        return NextResponse.json(
          {
            error: `Failed to fetch data from previous endpoint: ${error.endpoint}`,
            message:
              typeof error.responseData === 'string'
                ? error.responseData
                : error.responseData
                ? JSON.stringify(error.responseData)
                : error.message,
            url: error.url,
            status: error.status || 500,
          },
          { status: error.status || 500 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
          message: error.message,
        },
        { status: 500 },
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

// Solo permitir método POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}


