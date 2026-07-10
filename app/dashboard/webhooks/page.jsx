'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ChevronDown,
  Search,
} from 'lucide-react';

const WEBHOOK_DETAIL_SECTIONS = [
  {
    id: 'incomingHeaders',
    title: 'Headers recibidos (origen)',
    description:
      'Cabeceras HTTP de la petición que envió el sistema origen a FlowHook (pueden incluir cabeceras añadidas por la plataforma de despliegue).',
  },
  { id: 'headers', title: 'Headers enviados' },
  { id: 'incomingData', title: 'Datos recibidos' },
  { id: 'mappedData', title: 'Datos enviados' },
  {
    id: 'destinationResponse',
    title: 'Respuesta del destino',
    description:
      'Código HTTP y cuerpo de la respuesta recibida del endpoint destino del flujo.',
  },
  {
    id: 'postResponseActions',
    title: 'Acciones post-respuesta',
    description:
      'Resultados de las acciones ejecutadas después de recibir la respuesta del destino.',
  },
  { id: 'retryInfo', title: 'Información de re-ejecución' },
];

function formatJsonValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getPostResponseActions(detail) {
  const actions = detail?.postResponseActions || detail?.result?.postResponseActions;
  return Array.isArray(actions) ? actions : [];
}

function CollapsibleDetailSection({ title, description, isOpen, onToggle, children }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="p-3 border-t border-gray-200 bg-white">
          {description && (
            <p className="text-xs text-gray-500 mb-2">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

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

function buildInitialFlowFilter(searchParams) {
  const flowIdFromUrl = searchParams.get('flowId');
  if (!flowIdFromUrl) {
    return null;
  }

  const projectIdFromUrl = searchParams.get('projectId');
  return `${projectIdFromUrl || 'legacy'}:${flowIdFromUrl}`;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultWebhookDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
}

async function fetchWebhookDetail(webhook) {
  const params = new URLSearchParams({
    webhookId: webhook.id,
    flowId: webhook.flowId,
  });
  if (webhook.projectId) {
    params.set('projectId', webhook.projectId);
  }

  const response = await fetch(`/api/webhooks/detail?${params.toString()}`);
  if (!response.ok) {
    throw new Error('No se pudo cargar el detalle del webhook');
  }

  const data = await response.json();
  return data.webhook;
}

function WebhooksPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlowKey, setSelectedFlowKey] = useState(() =>
    buildInitialFlowFilter(searchParams),
  );
  const [flows, setFlows] = useState([]);
  const [expandedWebhook, setExpandedWebhook] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState(
    () => getDefaultWebhookDateRange().startDate,
  );
  const [endDate, setEndDate] = useState(
    () => getDefaultWebhookDateRange().endDate,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [retryWebhook, setRetryWebhook] = useState(null);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  const [retryPayloadText, setRetryPayloadText] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryLoading, setRetryLoading] = useState(false);
  const [webhookDetails, setWebhookDetails] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [detailSectionsOpen, setDetailSectionsOpen] = useState({});

  const detailSectionKey = (webhookId, sectionId) => `${webhookId}:${sectionId}`;

  const isDetailSectionOpen = (webhookId, sectionId) =>
    Boolean(detailSectionsOpen[detailSectionKey(webhookId, sectionId)]);

  const toggleDetailSection = (webhookId, sectionId) => {
    const key = detailSectionKey(webhookId, sectionId);
    setDetailSectionsOpen((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const setAllDetailSections = (webhookId, open) => {
    setDetailSectionsOpen((current) => {
      const next = { ...current };
      WEBHOOK_DETAIL_SECTIONS.forEach(({ id }) => {
        next[detailSectionKey(webhookId, id)] = open;
      });
      return next;
    });
  };

  useEffect(() => {
    const flowKeyFromUrl = buildInitialFlowFilter(searchParams);
    if (flowKeyFromUrl) {
      setSelectedFlowKey(flowKeyFromUrl);
    }
  }, [searchParams]);

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
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (session) {
      fetchWebhooks();
    }
  }, [session, selectedFlowKey, currentPage, statusFilter, startDate, endDate, debouncedSearch]);

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
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
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

  const openRetryModal = async (webhook) => {
    setRetryWebhook(webhook);
    setRetryPayloadText('{}');
    setRetryError('');
    setIsRetryModalOpen(true);

    try {
      const detail = webhookDetails[webhook.id] || await fetchWebhookDetail(webhook);
      setWebhookDetails((current) => ({ ...current, [webhook.id]: detail }));
      setRetryPayloadText(
        JSON.stringify(detail.incomingData || {}, null, 2),
      );
    } catch (error) {
      console.error('Error cargando payload para retry:', error);
      setRetryError('No se pudo cargar el payload del webhook');
    }
  };

  const toggleWebhookDetails = async (webhook) => {
    if (expandedWebhook === webhook.id) {
      setExpandedWebhook(null);
      return;
    }

    setExpandedWebhook(webhook.id);

    setDetailSectionsOpen((current) => {
      const next = { ...current };
      WEBHOOK_DETAIL_SECTIONS.forEach(({ id }) => {
        next[detailSectionKey(webhook.id, id)] = id === 'mappedData';
      });
      return next;
    });

    if (webhookDetails[webhook.id]) {
      return;
    }

    try {
      setLoadingDetailId(webhook.id);
      const detail = await fetchWebhookDetail(webhook);
      setWebhookDetails((current) => ({ ...current, [webhook.id]: detail }));
    } catch (error) {
      console.error('Error cargando detalle del webhook:', error);
    } finally {
      setLoadingDetailId(null);
    }
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
      <div className="mb-6 bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Buscar en logs:
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Pedido, cliente, código ERP, CUIT..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Busca en datos recibidos, datos enviados, headers y mensajes de respuesta.
          </p>
        </div>

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
          <p className="text-gray-500 mb-4">
            {debouncedSearch
              ? `No se encontraron logs que coincidan con "${debouncedSearch}".`
              : 'No hay webhooks registrados aún.'}
          </p>
          <p className="text-sm text-gray-400">
            {debouncedSearch
              ? 'Probá con otro término o quitá el filtro de búsqueda.'
              : 'Los webhooks aparecerán aquí cuando se reciban en tus flujos.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                        webhook.result?.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {webhook.result?.success ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Exitoso</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Error</span>
                        </>
                      )}
                    </span>
                    {webhook.projectName && (
                      <span className="text-xs font-semibold text-indigo-600 truncate">
                        {webhook.projectName}
                      </span>
                    )}
                    <span className="text-xs text-gray-700 font-medium truncate">
                      {webhook.flowName || webhook.flowId}
                    </span>
                    {webhook.flowId && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {webhook.flowId}
                      </span>
                    )}
                    {webhook.manualRetry && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                        {`Re-ejecutado${
                          webhook.retryCount ? ` (${webhook.retryCount})` : ''
                        }`}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(webhook.timestamp)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!webhook.result?.success && (
                    <button
                      onClick={() => openRetryModal(webhook)}
                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      Re-ejecutar
                    </button>
                  )}
                  <button
                    onClick={() => toggleWebhookDetails(webhook)}
                    className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    {expandedWebhook === webhook.id
                      ? 'Ocultar'
                      : 'Ver detalles'}
                  </button>
                </div>
              </div>

              {(webhook.destino || webhook.method) && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {webhook.method || 'POST'}
                  </span>
                  <code
                    className="flex-1 min-w-0 text-xs text-gray-600 truncate bg-gray-50 px-2 py-1 rounded"
                    title={webhook.destino || 'N/A'}
                  >
                    {webhook.destino || 'N/A'}
                  </code>
                  {webhook.destino && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(webhook.destino);
                        alert('URL copiada al portapapeles');
                      }}
                      className="p-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors shrink-0"
                      title="Copiar URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-gray-400">HTTP </span>
                  <span className="font-medium text-gray-800">
                    {webhook.result?.status || 'N/A'}
                  </span>
                </span>
                <span>
                  <span className="text-gray-400">Tiempo </span>
                  <span className="font-medium text-gray-800">
                    {formatTime(webhook.result?.responseTime)}
                  </span>
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-gray-400">Mensaje </span>
                  <span className="font-medium text-gray-800">
                    {webhook.result?.message || webhook.result?.error || 'N/A'}
                  </span>
                </span>
              </div>

              {expandedWebhook === webhook.id && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  {loadingDetailId === webhook.id ? (
                    <div className="text-sm text-gray-500">Cargando detalles...</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAllDetailSections(webhook.id, true)}
                          className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          Expandir todo
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllDetailSections(webhook.id, false)}
                          className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          Contraer todo
                        </button>
                      </div>

                      {(() => {
                        const detail = webhookDetails[webhook.id] || webhook;
                        return (
                          <>
                            <CollapsibleDetailSection
                              title="Headers recibidos (origen)"
                              description="Cabeceras HTTP de la petición que envió el sistema origen a FlowHook (pueden incluir cabeceras añadidas por la plataforma de despliegue)."
                              isOpen={isDetailSectionOpen(webhook.id, 'incomingHeaders')}
                              onToggle={() =>
                                toggleDetailSection(webhook.id, 'incomingHeaders')
                              }
                            >
                              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                {JSON.stringify(detail.incomingHeaders || {}, null, 2)}
                              </pre>
                            </CollapsibleDetailSection>

                            <CollapsibleDetailSection
                              title="Headers enviados"
                              isOpen={isDetailSectionOpen(webhook.id, 'headers')}
                              onToggle={() =>
                                toggleDetailSection(webhook.id, 'headers')
                              }
                            >
                              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                {JSON.stringify(detail.headers || {}, null, 2)}
                              </pre>
                            </CollapsibleDetailSection>

                            <CollapsibleDetailSection
                              title="Datos recibidos"
                              isOpen={isDetailSectionOpen(webhook.id, 'incomingData')}
                              onToggle={() =>
                                toggleDetailSection(webhook.id, 'incomingData')
                              }
                            >
                              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                {JSON.stringify(detail.incomingData || {}, null, 2)}
                              </pre>
                            </CollapsibleDetailSection>

                            <CollapsibleDetailSection
                              title="Datos enviados"
                              isOpen={isDetailSectionOpen(webhook.id, 'mappedData')}
                              onToggle={() =>
                                toggleDetailSection(webhook.id, 'mappedData')
                              }
                            >
                              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                {JSON.stringify(detail.mappedData || {}, null, 2)}
                              </pre>
                            </CollapsibleDetailSection>

                            <CollapsibleDetailSection
                              title="Respuesta del destino"
                              description="Código HTTP y cuerpo de la respuesta recibida del endpoint destino del flujo."
                              isOpen={isDetailSectionOpen(webhook.id, 'destinationResponse')}
                              onToggle={() =>
                                toggleDetailSection(webhook.id, 'destinationResponse')
                              }
                            >
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                  <span>
                                    <span className="text-gray-400">HTTP </span>
                                    <span className="font-medium text-gray-800">
                                      {detail.result?.status || 'N/A'}
                                    </span>
                                  </span>
                                  <span>
                                    <span className="text-gray-400">Estado </span>
                                    <span
                                      className={`font-medium ${
                                        detail.result?.success
                                          ? 'text-green-700'
                                          : 'text-red-700'
                                      }`}
                                    >
                                      {detail.result?.success ? 'Exitoso' : 'Error'}
                                    </span>
                                  </span>
                                </div>
                                {detail.result?.responseData != null ? (
                                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                    {formatJsonValue(detail.result.responseData)}
                                  </pre>
                                ) : (
                                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                                    {detail.result?.message ||
                                      detail.result?.error ||
                                      'Sin cuerpo de respuesta registrado'}
                                  </pre>
                                )}
                              </div>
                            </CollapsibleDetailSection>

                            {getPostResponseActions(detail).length > 0 && (
                              <CollapsibleDetailSection
                                title="Acciones post-respuesta"
                                description="Resultados de las acciones ejecutadas después de recibir la respuesta del destino."
                                isOpen={isDetailSectionOpen(webhook.id, 'postResponseActions')}
                                onToggle={() =>
                                  toggleDetailSection(webhook.id, 'postResponseActions')
                                }
                              >
                                <div className="space-y-3">
                                  {getPostResponseActions(detail).map((action, index) => (
                                    <div
                                      key={`${action.name || 'action'}-${index}`}
                                      className="border border-gray-200 rounded-lg overflow-hidden"
                                    >
                                      <div className="px-3 py-2 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-gray-700">
                                          {action.name || `Acción ${index + 1}`}
                                        </span>
                                        <span
                                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                            action.skipped
                                              ? 'bg-yellow-100 text-yellow-800'
                                              : action.success
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'
                                          }`}
                                        >
                                          {action.skipped
                                            ? 'Omitida'
                                            : action.success
                                              ? 'Exitosa'
                                              : 'Error'}
                                        </span>
                                      </div>
                                      <div className="p-3 space-y-2 text-xs">
                                        {action.url && (
                                          <p className="break-all">
                                            <span className="text-gray-400">URL </span>
                                            <span className="font-medium text-gray-800">
                                              {action.url}
                                            </span>
                                          </p>
                                        )}
                                        {action.status && (
                                          <p>
                                            <span className="text-gray-400">HTTP </span>
                                            <span className="font-medium text-gray-800">
                                              {action.status}
                                            </span>
                                          </p>
                                        )}
                                        {action.reason && (
                                          <p className="text-yellow-700">{action.reason}</p>
                                        )}
                                        {action.error && (
                                          <p className="text-red-700">{action.error}</p>
                                        )}
                                        {action.data != null && (
                                          <div>
                                            <p className="text-gray-400 mb-1">
                                              Respuesta recibida
                                            </p>
                                            <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                                              {formatJsonValue(action.data)}
                                            </pre>
                                          </div>
                                        )}
                                        {!action.skipped &&
                                          action.data == null &&
                                          !action.error && (
                                            <p className="text-gray-500">
                                              Sin cuerpo de respuesta registrado
                                            </p>
                                          )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CollapsibleDetailSection>
                            )}
                          </>
                        );
                      })()}

                      {(webhook.retryCount || webhook.lastRetryAt) && (
                        <CollapsibleDetailSection
                          title="Información de re-ejecución"
                          isOpen={isDetailSectionOpen(webhook.id, 'retryInfo')}
                          onToggle={() =>
                            toggleDetailSection(webhook.id, 'retryInfo')
                          }
                        >
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
                        </CollapsibleDetailSection>
                      )}
                    </>
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

export default function WebhooksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-gray-500">Cargando...</div>
        </div>
      }
    >
      <WebhooksPageContent />
    </Suspense>
  );
}

