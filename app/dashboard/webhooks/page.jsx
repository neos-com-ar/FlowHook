'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
} from 'lucide-react';

function buildFlowFilterValue(flow) {
  return `${flow.projectId || 'legacy'}:${flow.id}`;
}

function parseFlowFilterValue(value) {
  if (!value) {
    return { projectId: null, flowId: null };
  }

  const separatorIndex = value.indexOf(':');
  if (separatorIndex === -1) {
    return { projectId: null, flowId: value };
  }

  const projectId = value.slice(0, separatorIndex);
  const flowId = value.slice(separatorIndex + 1);

  return {
    projectId: projectId === 'legacy' ? null : projectId,
    flowId,
  };
}

function getInitialFlowFilterFromUrl() {
  if (typeof window === 'undefined') {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const flowIdFromUrl = urlParams.get('flowId');
  if (!flowIdFromUrl) {
    return null;
  }

  const projectIdFromUrl = urlParams.get('projectId');
  return `${projectIdFromUrl || 'legacy'}:${flowIdFromUrl}`;
}

export default function WebhooksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlowKey, setSelectedFlowKey] = useState(getInitialFlowFilterFromUrl);
  const [flows, setFlows] = useState([]);
  const [expandedWebhook, setExpandedWebhook] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [retryWebhook, setRetryWebhook] = useState(null);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  const [retryPayloadText, setRetryPayloadText] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryLoading, setRetryLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchFlows();
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchWebhooks();
    }
  }, [session, selectedFlowKey, currentPage, statusFilter, startDate, endDate]);

  const fetchFlows = async () => {
    try {
      const response = await fetch('/api/flows');
      if (response.ok) {
        const data = await response.json();
        setFlows(data.flows || []);
      }
    } catch (error) {
      console.error('Error fetching flows:', error);
    }
  };

  const fetchWebhooks = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const offset = (currentPage - 1) * pageSize;

      const params = new URLSearchParams();
      params.set('limit', pageSize.toString());
      params.set('offset', offset.toString());
      const { projectId, flowId } = parseFlowFilterValue(selectedFlowKey);
      if (flowId) {
        params.set('flowId', flowId);
      }
      if (projectId) {
        params.set('projectId', projectId);
      }
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      if (startDate) {
        params.set('startDate', startDate);
      }
      if (endDate) {
        params.set('endDate', endDate);
      }

      const response = await fetch(`/api/webhooks?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data.webhooks || []);
        setTotal(data.total || 0);
      } else {
        console.error('Error fetching webhooks');
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchWebhooks(true);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    setExpandedWebhook(null); // Cerrar webhooks expandidos al cambiar de página
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const formatTime = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const openRetryModal = (webhook) => {
    setRetryWebhook(webhook);
    setRetryPayloadText(
      JSON.stringify(webhook.incomingData || {}, null, 2),
    );
    setRetryError('');
    setIsRetryModalOpen(true);
  };

  const closeRetryModal = () => {
    setIsRetryModalOpen(false);
    setRetryWebhook(null);
    setRetryPayloadText('');
    setRetryError('');
    setRetryLoading(false);
  };

  const handleRetrySubmit = async () => {
    if (!retryWebhook) return;

    let parsedPayload = null;
    try {
      parsedPayload = JSON.parse(retryPayloadText || '{}');
    } catch (e) {
      setRetryError('El JSON del payload no es válido');
      return;
    }

    try {
      setRetryLoading(true);
      setRetryError('');

      const response = await fetch('/api/webhooks/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookId: retryWebhook.id,
          flowId: retryWebhook.flowId,
          projectId: retryWebhook.projectId || null,
          modifiedPayload: parsedPayload,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setRetryError(
          result.message ||
            result.error ||
            'Error al re-ejecutar el webhook',
        );
        return;
      }

      closeRetryModal();
      // Refrescar lista de webhooks para ver el nuevo estado
      fetchWebhooks(true);
    } catch (error) {
      console.error('Error realizando retry del webhook:', error);
      setRetryError('Error inesperado al re-ejecutar el webhook');
    } finally {
      setRetryLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Volver al Dashboard</span>
      </Link>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Historial de Webhooks</h1>
          <p className="text-gray-600 mt-2">Visualiza todos los webhooks recibidos y su estado</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title="Actualizar logs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtrar por flujo:
            </label>
            <select
              value={selectedFlowKey || ''}
              onChange={(e) => {
                setSelectedFlowKey(e.target.value || null);
                setCurrentPage(1); // Resetear a la primera página al cambiar el filtro
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos los flujos</option>
              {flows.map((flow) => (
                <option key={buildFlowFilterValue(flow)} value={buildFlowFilterValue(flow)}>
                  {flow.projectName ? `${flow.projectName} - ` : ''}
                  {flow.name} ({flow.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="success">Exitosos</option>
              <option value="error">Errores</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Desde:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hasta:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Cargando webhooks...</div>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No hay webhooks registrados aún.</p>
          <p className="text-sm text-gray-400">
            Los webhooks aparecerán aquí cuando se reciban en tus flujos.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2 flex-wrap gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        webhook.result?.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {webhook.result?.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Exitoso</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>Error</span>
                        </>
                      )}
                    </span>
                    {webhook.projectName && (
                      <>
                        <span className="text-sm font-semibold text-indigo-600">
                          {webhook.projectName}
                        </span>
                        <span className="text-gray-400">•</span>
                      </>
                    )}
                    <span className="text-sm text-gray-700 font-medium">
                      {webhook.flowName || webhook.flowId}
                    </span>
                    {webhook.flowId && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {webhook.flowId}
                      </span>
                    )}
                    {webhook.manualRetry && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        {`Re-ejecutado manualmente${
                          webhook.retryCount
                            ? ` (${webhook.retryCount} vez${
                                webhook.retryCount > 1 ? 'es' : ''
                              })`
                            : ''
                        }`}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(webhook.timestamp)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!webhook.result?.success && (
                    <button
                      onClick={() => openRetryModal(webhook)}
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      Re-ejecutar
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setExpandedWebhook(
                        expandedWebhook === webhook.id ? null : webhook.id,
                      )
                    }
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    {expandedWebhook === webhook.id
                      ? 'Ocultar'
                      : 'Ver detalles'}
                  </button>
                </div>
              </div>

              {(webhook.destino || webhook.method) && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600 font-medium">Endpoint destino:</p>
                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-mono">
                      {webhook.method || 'POST'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 text-xs text-gray-700 break-all bg-gray-50 p-2 rounded">
                      {webhook.destino || 'N/A'}
                    </code>
                    {webhook.destino && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(webhook.destino);
                          alert('URL copiada al portapapeles');
                        }}
                        className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                        title="Copiar URL"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Estado HTTP</p>
                  <p className="text-sm font-medium">
                    {webhook.result?.status || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Tiempo de respuesta</p>
                  <p className="text-sm font-medium">
                    {formatTime(webhook.result?.responseTime)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Mensaje</p>
                  <p className="text-sm font-medium truncate">
                    {webhook.result?.message || webhook.result?.error || 'N/A'}
                  </p>
                </div>
              </div>

              {expandedWebhook === webhook.id && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Datos recibidos:
                    </h3>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(webhook.incomingData || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Headers recibidos (origen):
                    </h3>
                    <p className="text-xs text-gray-500 mb-2">
                      Cabeceras HTTP de la petición que envió el sistema origen a
                      FlowHook (pueden incluir cabeceras añadidas por la plataforma
                      de despliegue).
                    </p>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(webhook.incomingHeaders || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Headers enviados:
                    </h3>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(webhook.headers || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      Datos mapeados enviados:
                    </h3>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(webhook.mappedData || {}, null, 2)}
                    </pre>
                  </div>
                  {webhook.result && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Resultado completo:
                      </h3>
                      <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                        {JSON.stringify(webhook.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  {(webhook.retryCount || webhook.lastRetryAt) && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Información de re-ejecución:
                      </h3>
                      <div className="text-xs text-gray-600 space-y-1">
                        {typeof webhook.retryCount === 'number' && (
                          <p>
                            Reintentos manuales:{' '}
                            <span className="font-semibold">
                              {webhook.retryCount}
                            </span>
                          </p>
                        )}
                        {webhook.lastRetryAt && (
                          <p>
                            Último reintento:{' '}
                            <span className="font-semibold">
                              {formatDate(webhook.lastRetryAt)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>

          {/* Controles de paginación */}
          {totalPages > 1 && (
            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, total)} de {total} webhooks
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        disabled={loading}
                        className={`px-3 py-2 rounded-md transition-colors ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {isRetryModalOpen && retryWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Re-ejecutar webhook fallido
              </h2>
              <button
                onClick={closeRetryModal}
                className="text-gray-400 hover:text-gray-600 text-sm"
                disabled={retryLoading}
              >
                Cerrar
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="text-sm text-gray-700 space-y-1">
                <p>
                  <span className="font-medium">Flujo:</span>{' '}
                  {retryWebhook.flowName || retryWebhook.flowId}
                </p>
                <p>
                  <span className="font-medium">ID webhook:</span>{' '}
                  <span className="font-mono text-xs break-all">
                    {retryWebhook.id}
                  </span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payload a enviar (JSON):
                </label>
                <textarea
                  className="w-full h-64 font-mono text-xs border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={retryPayloadText}
                  onChange={(e) => setRetryPayloadText(e.target.value)}
                  disabled={retryLoading}
                />
                {retryError && (
                  <p className="mt-2 text-xs text-red-600">{retryError}</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={closeRetryModal}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={retryLoading}
              >
                Cancelar
              </button>
              <button
                onClick={handleRetrySubmit}
                disabled={retryLoading}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retryLoading ? 'Re-ejecutando...' : 'Re-ejecutar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

