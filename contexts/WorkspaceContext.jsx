'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = 'flowhook_active_workspace';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { data: session, status } = useSession();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/workspaces');
      if (!response.ok) return;
      const data = await response.json();
      const list = data.workspaces || [];
      setWorkspaces(list);

      const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const stored = list.find(w => w.id === storedId);
      const personal = list.find(w => w.isPersonal);
      const next = stored || personal || list[0] || null;
      setActiveWorkspace(next);
      if (next && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next.id);
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchWorkspaces();
    } else if (status === 'unauthenticated') {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setLoading(false);
    }
  }, [status, fetchWorkspaces]);

  const switchWorkspace = useCallback((workspaceId) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) {
      setActiveWorkspace(ws);
      localStorage.setItem(STORAGE_KEY, workspaceId);
    }
  }, [workspaces]);

  const refreshWorkspaces = useCallback(async () => {
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      switchWorkspace,
      refreshWorkspaces,
      setActiveWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
