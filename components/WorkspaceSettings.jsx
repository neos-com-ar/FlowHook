'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

export default function WorkspaceSettings({ workspace, onClose, onSaved }) {
  const { workspaces, refreshWorkspaces } = useWorkspace();
  const [formData, setFormData] = useState({
    name: workspace.name || '',
    description: workspace.description || '',
    color: workspace.color || '#3B82F6',
    slug: workspace.slug || '',
  });
  const [loading, setLoading] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const mergeTargets = workspaces.filter(
    (ws) => ws.id !== workspace.id && !ws.isPersonal && !ws.archived,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, ...formData }),
      });
      if (res.ok) {
        await refreshWorkspaces();
        onSaved();
        onClose();
      } else {
        const err = await res.json();
        alert(err.error || 'Error al guardar');
      }
    } catch {
      alert('Error al guardar workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm(
      '¿Archivar este workspace?\n\nSe ocultará del selector. Los proyectos permanecen guardados pero no serán accesibles hasta restaurarlo.',
    )) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        alert('Workspace archivado.');
        onClose();
      } else {
        alert(data.error || 'Error al archivar');
      }
    } catch {
      alert('Error al archivar workspace');
    } finally {
      setArchiving(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    const target = mergeTargets.find((ws) => ws.id === mergeTargetId);
    if (!confirm(
      `¿Fusionar "${workspace.name}" en "${target?.name}"?\n\nTodos los proyectos se moverán al workspace destino y este workspace quedará archivado.`,
    )) return;
    setMerging(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetWorkspaceId: mergeTargetId }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        alert(`Fusión completada. ${data.movedProjectCount} proyecto(s) movidos.`);
        onClose();
      } else {
        alert(data.error || 'Error al fusionar');
      }
    } catch {
      alert('Error al fusionar workspaces');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="mb-4 text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Configuración del workspace</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              disabled={workspace.isPersonal}
            />
            {workspace.isPersonal && (
              <p className="text-xs text-gray-500 mt-1">El nombre del workspace personal no se puede cambiar.</p>
            )}
          </div>
          {!workspace.isPersonal && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL legible)</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                title="Letras minúsculas, números y guiones"
              />
              <p className="text-xs text-gray-500 mt-1">Solo para identificación visual. No afecta URLs de webhook.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full border-2 ${formData.color === color ? 'border-gray-900' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>

        {!workspace.isPersonal && (
          <div className="mt-8 pt-6 border-t border-gray-200 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Fusionar con otro workspace</h3>
              <p className="text-xs text-gray-500 mb-3">
                Mueve todos los proyectos y miembros al workspace destino. Este workspace quedará archivado.
              </p>
              <div className="flex gap-2">
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Seleccionar destino...</option>
                  {mergeTargets.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!mergeTargetId || merging}
                  onClick={handleMerge}
                  className="px-4 py-2 text-sm bg-amber-100 text-amber-900 rounded-md hover:bg-amber-200 disabled:opacity-50"
                >
                  {merging ? 'Fusionando...' : 'Fusionar'}
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Archivar workspace</h3>
              <p className="text-xs text-gray-500">
                Oculta el workspace sin borrar proyectos ni datos. Podés restaurarlo desde el selector → Archivados.
              </p>
              <button
                type="button"
                disabled={archiving}
                onClick={handleArchive}
                className="px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50"
              >
                {archiving ? 'Archivando...' : 'Archivar workspace'}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Eliminar permanentemente</h3>
              <p className="text-xs text-gray-500">
                Solo disponible si el workspace no tiene proyectos. Si tiene proyectos, archivalo o mueve los proyectos primero.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
