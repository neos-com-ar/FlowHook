'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Copy,
  Pencil,
  BarChart3,
  Package,
  X,
  Folder,
  BarChart3 as BarChart3Icon,
  Link as LinkIcon,
  Rocket,
  Zap,
  Target,
  Lightbulb,
  Settings,
  Smartphone,
  Globe,
  TrendingUp,
  Palette,
  Lock,
  FileText,
  PartyPopper,
  Star,
  Download,
  Upload,
  Trash2,
} from 'lucide-react';
import FlowEditor from './FlowEditor';

// Mapeo de nombres de iconos a componentes
const ICON_COMPONENTS = {
  Folder,
  BarChart3,
  Link: LinkIcon,
  Rocket,
  Zap,
  Target,
  Lightbulb,
  Settings,
  Smartphone,
  Globe,
  TrendingUp,
  Palette,
  Lock,
  FileText,
  PartyPopper,
  Star,
};

// Helper para renderizar el icono del proyecto (soporta tanto nombres de iconos como emojis antiguos)
const ProjectIcon = ({ iconName, className = "w-6 h-6" }) => {
  // Si es un emoji antiguo, renderizarlo como texto
  if (!iconName || /[\u{1F300}-\u{1F9FF}]/u.test(iconName)) {
    return <span className={className.replace('w-', 'text-').replace('h-', '')}>{iconName || '📁'}</span>;
  }
  // Si es un nombre de icono, usar el componente Lucide
  const IconComponent = ICON_COMPONENTS[iconName] || Folder;
  return <IconComponent className={className} />;
};

// Función helper para convertir color hex a rgba con opacidad
const hexToRgba = (hex, opacity) => {
  if (!hex || !hex.match(/^#[0-9A-Fa-f]{6}$/)) {
    // Si el color no es válido, usar un color por defecto (azul)
    hex = '#3B82F6';
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const MAP_PREVIEW_LINES = 3;
const MAP_LINE_MAX_CHARS = 52;

function getMappingPreview(map) {
  if (!map || typeof map !== 'object') return { lines: [], remaining: 0 };
  const entries = Object.entries(map);
  const lines = entries.slice(0, MAP_PREVIEW_LINES).map(([dest, src]) => {
    const srcStr = typeof src === 'object' ? JSON.stringify(src) : String(src ?? '');
    const destStr = String(dest);
    let text = `${srcStr} → ${destStr}`;
    if (text.length > MAP_LINE_MAX_CHARS) {
      text = `${text.slice(0, MAP_LINE_MAX_CHARS)}…`;
    }
    return text;
  });
  return {
    lines,
    remaining: Math.max(0, entries.length - MAP_PREVIEW_LINES),
  };
}

function UrlField({ label, url, onCopy, codeClassName = 'bg-gray-100' }) {
  if (!url) return null;
  return (
    <div className={label ? 'mt-2' : ''}>
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2 min-w-0">
        <code
          title={url}
          className={`flex-1 min-w-0 text-xs p-2 rounded truncate cursor-default ${codeClassName}`}
        >
          {url}
        </code>
        <button
          type="button"
          onClick={() => onCopy(url)}
          className="flex-shrink-0 px-2 py-2 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
          title="Copiar URL"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function FlowList({ projectId, projectColor, workspaceId }) {
  const { data: session } = useSession();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [duplicatingFlow, setDuplicatingFlow] = useState(null);
  const [newFlowId, setNewFlowId] = useState('');
  const [newFlowName, setNewFlowName] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [flowsToImport, setFlowsToImport] = useState([]);
  const [selectedFlowsToImport, setSelectedFlowsToImport] = useState({});
  const [movingFlow, setMovingFlow] = useState(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (session) {
      fetchFlows();
    }
  }, [session, projectId]);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const url = projectId 
        ? `/api/flows?projectId=${projectId}`
        : '/api/flows';
      const response = await fetch(url);
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
      const url = projectId
        ? `/api/flows?flowId=${flowId}&projectId=${projectId}`
        : `/api/flows?flowId=${flowId}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFlows(flows.filter((f) => f.id !== flowId));
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al eliminar el flujo'}`);
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
          projectId: projectId || duplicatingFlow.projectId,
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
    if (!projectId) {
      alert('Por favor, selecciona un proyecto primero');
      return;
    }
    setEditingFlow(null);
    setShowEditor(true);
  };

  const handleMoveClick = async (flow) => {
    setMovingFlow(flow);
    setLoadingProjects(true);
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        // Si hay projectId, filtrar el proyecto actual; si no, mostrar todos
        const filtered = projectId
          ? (data.projects || []).filter(p => p.id !== projectId)
          : (data.projects || []);
        setAvailableProjects(filtered);
        setMoveModalOpen(true);
      } else {
        alert('Error al cargar proyectos');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      alert('Error al cargar proyectos');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleMoveConfirm = async (targetProjectId) => {
    if (!movingFlow) {
      return;
    }

    setMoving(true);
    try {
      const response = await fetch('/api/flows/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flowId: movingFlow.id,
          fromProjectId: projectId || null, // null si viene de flujos sin proyecto
          toProjectId: targetProjectId,
        }),
      });

      if (response.ok) {
        setMoveModalOpen(false);
        setMovingFlow(null);
        fetchFlows(); // Recargar la lista
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al mover el flujo'}`);
      }
    } catch (error) {
      console.error('Error moving flow:', error);
      alert('Error al mover el flujo');
    } finally {
      setMoving(false);
    }
  };

  const handleMoveCancel = () => {
    setMoveModalOpen(false);
    setMovingFlow(null);
    setAvailableProjects([]);
  };

  const handleSave = () => {
    setShowEditor(false);
    setEditingFlow(null);
    fetchFlows();
  };

  const getWebhookUrl = (flowId, legacy = false) => {
    if (!projectId) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    if (legacy) {
      if (!session?.user?.id) return '';
      return `${baseUrl}/api/webhooks/${session.user.id}/${projectId}/${flowId}`;
    }
    if (!workspaceId) return '';
    return `${baseUrl}/api/webhooks/${workspaceId}/${projectId}/${flowId}`;
  };

  const getLegacyWebhookUrl = (flowId) => getWebhookUrl(flowId, true);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('URL copiada al portapapeles');
  };

  const handleExportFlows = () => {
    if (flows.length === 0) {
      alert('No hay flujos para exportar');
      return;
    }

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      flows: flows,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowhook-flujos-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSingleFlow = (flow) => {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      flows: [flow],
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    // Usar el ID del flujo en el nombre del archivo, sanitizado para nombres de archivo
    const safeId = flow.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `flowhook-${safeId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target.result);
          
          // Validar estructura del archivo
          if (!jsonData.flows || !Array.isArray(jsonData.flows)) {
            alert('El archivo no tiene un formato válido. Debe contener un array "flows".');
            return;
          }

          if (jsonData.flows.length === 0) {
            alert('El archivo no contiene flujos para importar.');
            return;
          }

          // Validar cada flujo
          const validFlows = [];
          for (const flow of jsonData.flows) {
            if (!flow.id || !flow.name || !flow.destino) {
              console.warn('Flujo inválido omitido:', flow);
              continue;
            }
            validFlows.push(flow);
          }

          if (validFlows.length === 0) {
            alert('No se encontraron flujos válidos en el archivo.');
            return;
          }

          // Inicializar selección (todos seleccionados por defecto)
          const initialSelection = {};
          validFlows.forEach((flow) => {
            initialSelection[flow.id] = true;
          });
          setSelectedFlowsToImport(initialSelection);
          setFlowsToImport(validFlows);
          setImportModalOpen(true);
        } catch (error) {
          console.error('Error parsing JSON:', error);
          alert('Error al leer el archivo. Asegúrate de que sea un archivo JSON válido.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleImportConfirm = async () => {
    const flowsToImportList = flowsToImport.filter(
      (flow) => selectedFlowsToImport[flow.id]
    );

    if (flowsToImportList.length === 0) {
      alert('Por favor, selecciona al menos un flujo para importar.');
      return;
    }

    setImporting(true);

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const flow of flowsToImportList) {
        try {
          // Verificar si el flujo ya existe
          const existingFlow = flows.find((f) => f.id === flow.id);
          if (existingFlow) {
            // Preguntar si quiere sobrescribir
            const overwrite = confirm(
              `El flujo "${flow.name}" (ID: ${flow.id}) ya existe. ¿Deseas sobrescribirlo?`
            );
            if (!overwrite) {
              continue;
            }
          }

          // Validar formato del ID
          if (!/^[a-zA-Z0-9_-]+$/.test(flow.id)) {
            errors.push(`Flujo "${flow.name}": ID inválido`);
            errorCount++;
            continue;
          }

          // Validar URL del destino
          try {
            new URL(flow.destino);
          } catch {
            errors.push(`Flujo "${flow.name}": URL de destino inválida`);
            errorCount++;
            continue;
          }

          // Validar método HTTP
          const allowedMethods = ['POST', 'PUT', 'PATCH'];
          const method = flow.method ? flow.method.toUpperCase() : 'POST';
          if (!allowedMethods.includes(method)) {
            errors.push(`Flujo "${flow.name}": Método HTTP inválido`);
            errorCount++;
            continue;
          }

          const response = await fetch('/api/flows', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: flow.id,
              name: flow.name,
              destino: flow.destino,
              method: method,
              map: flow.map || {},
              webhookSecret: flow.webhookSecret || undefined,
              incomingWebhookSecret: flow.incomingWebhookSecret || undefined,
              erpEndpoints: flow.erpEndpoints || null,
              erpEndpoint: flow.erpEndpoint || null, // Retrocompatibilidad
              projectId: projectId || flow.projectId,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            const error = await response.json();
            errors.push(`Flujo "${flow.name}": ${error.error || 'Error desconocido'}`);
            errorCount++;
          }
        } catch (error) {
          console.error(`Error importing flow ${flow.id}:`, error);
          errors.push(`Flujo "${flow.name}": Error al importar`);
          errorCount++;
        }
      }

      // Cerrar modal y mostrar resultados
      setImportModalOpen(false);
      setFlowsToImport([]);
      setSelectedFlowsToImport({});

      let message = `Importación completada:\n- ${successCount} flujo(s) importado(s) correctamente`;
      if (errorCount > 0) {
        message += `\n- ${errorCount} flujo(s) con errores`;
        if (errors.length > 0) {
          message += '\n\nErrores:\n' + errors.join('\n');
        }
      }
      alert(message);

      // Recargar la lista de flujos
      fetchFlows();
    } catch (error) {
      console.error('Error importing flows:', error);
      alert('Error al importar los flujos');
    } finally {
      setImporting(false);
    }
  };

  const handleImportCancel = () => {
    setImportModalOpen(false);
    setFlowsToImport([]);
    setSelectedFlowsToImport({});
  };

  const toggleFlowSelection = (flowId) => {
    setSelectedFlowsToImport((prev) => ({
      ...prev,
      [flowId]: !prev[flowId],
    }));
  };

  const toggleSelectAll = () => {
    const allSelected = flowsToImport.every(
      (flow) => selectedFlowsToImport[flow.id]
    );
    const newSelection = {};
    flowsToImport.forEach((flow) => {
      newSelection[flow.id] = !allSelected;
    });
    setSelectedFlowsToImport(newSelection);
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
        projectId={projectId}
        onSave={handleSave}
        onCancel={() => {
          setShowEditor(false);
          setEditingFlow(null);
        }}
      />
    );
  }

  // Obtener color de fondo basado en el color del proyecto
  const getBackgroundColor = () => {
    if (!projectColor) return 'transparent';
    return hexToRgba(projectColor, 0.05);
  };

  return (
    <div 
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 rounded-lg"
      style={{ backgroundColor: getBackgroundColor() }}
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mis Flujos de Webhooks</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportFlows}
            disabled={flows.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 font-medium"
            title="Exportar todos los flujos a un archivo JSON"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button
            onClick={handleImportClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors inline-flex items-center gap-2 font-medium"
            title="Importar flujos desde un archivo JSON"
          >
            <Upload className="w-4 h-4" />
            Importar
          </button>
          <button
            onClick={handleNewFlow}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors font-medium"
          >
            + Nuevo Flujo
          </button>
        </div>
      </div>

      {flows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-gray-500 mb-4">No tienes flujos configurados aún.</p>
          <button
            onClick={handleNewFlow}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors font-medium"
          >
            Crear tu primer flujo
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => {
            const webhookUrl = getWebhookUrl(flow.id);
            const legacyWebhookUrl = getLegacyWebhookUrl(flow.id);
            const mappingPreview = getMappingPreview(flow.map);
            return (
              <div
                key={flow.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{flow.name}</h2>
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                    {flow.id}
                  </span>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">URL del Webhook:</p>
                  {webhookUrl ? (
                    <UrlField url={webhookUrl} onCopy={copyToClipboard} />
                  ) : (
                    <code className="block text-xs bg-gray-100 p-2 rounded text-gray-500">
                      Workspace no disponible
                    </code>
                  )}
                  <UrlField
                    label="URL legacy (compatibilidad):"
                    url={legacyWebhookUrl}
                    onCopy={copyToClipboard}
                    codeClassName="bg-yellow-50 border border-yellow-100"
                  />
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-600">Destino:</p>
                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-mono">
                      {flow.method || 'POST'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate cursor-default" title={flow.destino}>
                    {flow.destino}
                  </p>
                </div>

                {mappingPreview.lines.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Mapeo:</p>
                    <div className="text-xs text-gray-500 space-y-0.5 font-mono">
                      {mappingPreview.lines.map((line, index) => (
                        <div key={index} className="truncate" title={line}>
                          {line}
                        </div>
                      ))}
                      {mappingPreview.remaining > 0 && (
                        <div className="text-indigo-600 font-sans pt-0.5">
                          +{mappingPreview.remaining} más
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(flow)}
                    className="px-2 py-2 text-xs bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px]"
                    title="Editar flujo"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateClick(flow)}
                    className="px-2 py-2 text-xs bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px]"
                    title="Duplicar flujo"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <Link
                    href={`/dashboard/webhooks?${flow.projectId ? `projectId=${encodeURIComponent(flow.projectId)}&` : ''}flowId=${encodeURIComponent(flow.id)}`}
                    className="px-2 py-2 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px] text-center"
                    title="Ver historial de webhooks"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Historial</span>
                  </Link>
                  <button
                    onClick={() => handleMoveClick(flow)}
                    className="px-2 py-2 text-xs bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px]"
                    title="Mover a otro proyecto"
                  >
                    <Package className="w-4 h-4" />
                    <span>Mover</span>
                  </button>
                  <button
                    onClick={() => handleExportSingleFlow(flow)}
                    className="px-2 py-2 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px]"
                    title="Exportar este flujo"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar</span>
                  </button>
                  <button
                    onClick={() => handleDelete(flow.id)}
                    className="px-2 py-2 text-xs bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors inline-flex flex-col items-center justify-center gap-1 min-h-[52px]"
                    title="Eliminar flujo"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de importar flujos */}
      {importModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Importar Flujos
              </h3>
              <button
                onClick={handleImportCancel}
                className="text-gray-500 hover:text-gray-700"
                disabled={importing}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                Selecciona los flujos que deseas importar:
              </p>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-700">
                  {flowsToImport.filter((f) => selectedFlowsToImport[f.id]).length} de {flowsToImport.length} seleccionados
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                  disabled={importing}
                >
                  {flowsToImport.every((f) => selectedFlowsToImport[f.id])
                    ? 'Deseleccionar todos'
                    : 'Seleccionar todos'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                {flowsToImport.map((flow) => (
                  <div
                    key={flow.id}
                    className="flex items-start p-3 border-b border-gray-100 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFlowsToImport[flow.id] || false}
                      onChange={() => toggleFlowSelection(flow.id)}
                      disabled={importing}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">{flow.name}</h4>
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                          {flow.id}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {flow.destino}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {flow.method || 'POST'}
                        </span>
                        {flow.map && Object.keys(flow.map).length > 0 && (
                          <span className="text-xs text-gray-500">
                            {Object.keys(flow.map).length} mapeo(s)
                          </span>
                        )}
                      </div>
                      {flows.find((f) => f.id === flow.id) && (
                        <span className="inline-block mt-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                          Ya existe (se sobrescribirá)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
              <p className="text-xs text-blue-800">
                <strong>Nota:</strong> Los flujos con IDs que ya existen serán sobrescritos. 
                Se te pedirá confirmación para cada uno.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleImportCancel}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={
                  importing ||
                  flowsToImport.filter((f) => selectedFlowsToImport[f.id]).length === 0
                }
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importando...' : 'Importar Seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de duplicar flujo */}
      {duplicatingFlow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Duplicar Flujo
              </h3>
              <button
                onClick={handleDuplicateCancel}
                className="text-gray-500 hover:text-gray-700"
                disabled={duplicating}
              >
                <X className="w-4 h-4" />
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

      {/* Modal de mover flujo */}
      {moveModalOpen && movingFlow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Mover Flujo
              </h3>
              <button
                onClick={handleMoveCancel}
                className="text-gray-500 hover:text-gray-700"
                disabled={moving}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                {projectId 
                  ? `Mover "${movingFlow.name}" a otro proyecto:`
                  : `Mover "${movingFlow.name}" a un proyecto:`
                }
              </p>
              {loadingProjects ? (
                <div className="text-center py-4">
                  <div className="text-gray-500">Cargando proyectos...</div>
                </div>
              ) : availableProjects.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-2">No hay otros proyectos disponibles.</p>
                  <p className="text-xs text-gray-400">Crea un nuevo proyecto primero.</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                  {availableProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleMoveConfirm(project.id)}
                      disabled={moving}
                      className="w-full flex items-center space-x-3 p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ProjectIcon iconName={project.icon} className="w-6 h-6" />
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900">{project.name}</p>
                        {project.description && (
                          <p className="text-xs text-gray-500 truncate">{project.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
              <p className="text-xs text-blue-800">
                <strong>Nota:</strong> El flujo se moverá al proyecto seleccionado. 
                Asegúrate de tener permisos de editor en ambos proyectos.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleMoveCancel}
                disabled={moving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

