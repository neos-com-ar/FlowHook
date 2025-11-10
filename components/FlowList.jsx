'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import FlowEditor from './FlowEditor';

export default function FlowList() {
  const { data: session } = useSession();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [duplicatingFlow, setDuplicatingFlow] = useState(null);
  const [newFlowId, setNewFlowId] = useState('');
  const [newFlowName, setNewFlowName] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (session) {
      fetchFlows();
    }
  }, [session]);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/flows');
      if (response.ok) {
        const data = await response.json();
        setFlows(data.flows || []);
      } else {
        console.error('Error fetching flows');
      }
    } catch (error) {
      console.error('Error fetching flows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (flowId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este flujo?')) {
      return;
    }

    try {
      const response = await fetch(`/api/flows?flowId=${flowId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFlows(flows.filter((f) => f.id !== flowId));
      } else {
        alert('Error al eliminar el flujo');
      }
    } catch (error) {
      console.error('Error deleting flow:', error);
      alert('Error al eliminar el flujo');
    }
  };

  const handleDuplicateClick = (flow) => {
    // Generar un nuevo ID basado en el original
    const timestamp = Date.now();
    const defaultNewId = `${flow.id}-copy-${timestamp}`;
    const defaultNewName = `${flow.name} (Copia)`;
    
    setDuplicatingFlow(flow);
    setNewFlowId(defaultNewId);
    setNewFlowName(defaultNewName);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicatingFlow) return;

    const trimmedId = newFlowId.trim();
    const trimmedName = newFlowName.trim();

    if (!trimmedId || !trimmedName) {
      alert('Por favor, ingresa un ID y un nombre para el flujo duplicado');
      return;
    }

    // Validar formato del ID
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
      alert('El ID solo puede contener letras, números, guiones y guiones bajos');
      return;
    }

    setDuplicating(true);

    try {
      const response = await fetch('/api/flows', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flowId: duplicatingFlow.id,
          newId: trimmedId,
          newName: trimmedName,
        }),
      });

      if (response.ok) {
        // Cerrar el modal
        setDuplicatingFlow(null);
        setNewFlowId('');
        setNewFlowName('');
        // Recargar la lista de flujos
        fetchFlows();
      } else {
        const error = await response.json();
        alert(`Error al duplicar el flujo: ${error.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error duplicating flow:', error);
      alert('Error al duplicar el flujo');
    } finally {
      setDuplicating(false);
    }
  };

  const handleDuplicateCancel = () => {
    setDuplicatingFlow(null);
    setNewFlowId('');
    setNewFlowName('');
  };

  const handleEdit = (flow) => {
    setEditingFlow(flow);
    setShowEditor(true);
  };

  const handleNewFlow = () => {
    setEditingFlow(null);
    setShowEditor(true);
  };

  const handleSave = () => {
    setShowEditor(false);
    setEditingFlow(null);
    fetchFlows();
  };

  const getWebhookUrl = (flowId) => {
    if (!session?.user?.id) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/api/webhooks/${session.user.id}/${flowId}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('URL copiada al portapapeles');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">Cargando flujos...</div>
      </div>
    );
  }

  if (showEditor) {
    return (
      <FlowEditor
        flow={editingFlow}
        onSave={handleSave}
        onCancel={() => {
          setShowEditor(false);
          setEditingFlow(null);
        }}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mis Flujos de Webhooks</h1>
        <button
          onClick={handleNewFlow}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          + Nuevo Flujo
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No tienes flujos configurados aún.</p>
          <button
            onClick={handleNewFlow}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Crear tu primer flujo
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => {
            const webhookUrl = getWebhookUrl(flow.id);
            return (
              <div
                key={flow.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{flow.name}</h2>
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                    {flow.id}
                  </span>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">URL del Webhook:</p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 text-xs bg-gray-100 p-2 rounded truncate">
                      {webhookUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(webhookUrl)}
                      className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                      title="Copiar URL"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-600">Destino:</p>
                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-mono">
                      {flow.method || 'POST'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{flow.destino}</p>
                </div>

                {flow.map && Object.keys(flow.map).length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Mapeo:</p>
                    <div className="text-xs text-gray-500 space-y-1">
                      {Object.entries(flow.map).slice(0, 3).map(([dest, src]) => (
                        <div key={dest}>
                          {src} → {dest}
                        </div>
                      ))}
                      {Object.keys(flow.map).length > 3 && (
                        <div>+{Object.keys(flow.map).length - 3} más</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col space-y-2 mt-4">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(flow)}
                      className="flex-1 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDuplicateClick(flow)}
                      className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors"
                      title="Duplicar flujo"
                    >
                      📋 Duplicar
                    </button>
                  </div>
                  <div className="flex space-x-2">
                    <Link
                      href={`/dashboard/webhooks?flowId=${flow.id}`}
                      className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors text-center"
                    >
                      Ver Historial
                    </Link>
                    <button
                      onClick={() => handleDelete(flow.id)}
                      className="flex-1 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de duplicar flujo */}
      {duplicatingFlow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Duplicar Flujo
              </h3>
              <button
                onClick={handleDuplicateCancel}
                className="text-gray-500 hover:text-gray-700"
                disabled={duplicating}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flujo original
                </label>
                <p className="text-sm text-gray-600">
                  <strong>Nombre:</strong> {duplicatingFlow.name}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>ID:</strong> {duplicatingFlow.id}
                </p>
              </div>

              <div>
                <label htmlFor="newFlowId" className="block text-sm font-medium text-gray-700 mb-1">
                  Nuevo ID del flujo *
                </label>
                <input
                  type="text"
                  id="newFlowId"
                  value={newFlowId}
                  onChange={(e) => setNewFlowId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="ej: mi-flujo-copia"
                  disabled={duplicating}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Solo letras, números, guiones y guiones bajos
                </p>
              </div>

              <div>
                <label htmlFor="newFlowName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nuevo nombre del flujo *
                </label>
                <input
                  type="text"
                  id="newFlowName"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="ej: Mi Flujo (Copia)"
                  disabled={duplicating}
                  required
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-xs text-blue-800">
                  <strong>Nota:</strong> El flujo duplicado incluirá la misma URL de destino y mapeo de campos que el flujo original.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={handleDuplicateCancel}
                disabled={duplicating}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDuplicateConfirm}
                disabled={duplicating || !newFlowId.trim() || !newFlowName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {duplicating ? 'Duplicando...' : 'Duplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

