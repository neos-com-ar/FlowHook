'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Settings, Users } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import WorkspaceSettings from './WorkspaceSettings';
import WorkspaceMembers from './WorkspaceMembers';

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, loading, switchWorkspace, refreshWorkspaces } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setCreating(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await refreshWorkspaces();
        switchWorkspace(data.workspace.id);
        setNewName('');
        setCreating(false);
        setOpen(false);
      } else {
        const err = await res.json();
        alert(err.error || 'Error al crear workspace');
      }
    } catch {
      alert('Error al crear workspace');
    }
  };

  if (loading) {
    return <span className="text-sm text-gray-500">...</span>;
  }

  if (showSettings && activeWorkspace) {
    return (
      <WorkspaceSettings
        workspace={activeWorkspace}
        onClose={() => setShowSettings(false)}
        onSaved={refreshWorkspaces}
      />
    );
  }

  if (showMembers && activeWorkspace) {
    return (
      <WorkspaceMembers
        workspaceId={activeWorkspace.id}
        isPersonal={activeWorkspace.isPersonal}
        onClose={() => setShowMembers(false)}
      />
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors max-w-[200px]"
      >
        <span className="truncate">{activeWorkspace?.name || 'Workspace'}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Workspaces</div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                switchWorkspace(ws.id);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                activeWorkspace?.id === ws.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
              }`}
            >
              <span className="truncate">{ws.name}</span>
              {ws.isPersonal && (
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">Personal</span>
              )}
            </button>
          ))}

          <div className="border-t border-gray-100 my-1" />

          {creating ? (
            <form onSubmit={handleCreate} className="px-3 py-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del workspace"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded">Crear</button>
                <button type="button" onClick={() => setCreating(false)} className="flex-1 px-2 py-1 text-xs bg-gray-100 rounded">Cancelar</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-gray-100 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuevo workspace
            </button>
          )}

          {activeWorkspace && (
            <>
              <button
                onClick={() => { setShowSettings(true); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Configuración
              </button>
              {!activeWorkspace.isPersonal && (
                <button
                  onClick={() => { setShowMembers(true); setOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  Miembros
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
