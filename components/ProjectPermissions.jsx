'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { X, Crown, Pencil, Eye } from 'lucide-react';

export default function ProjectPermissions({ projectId, onClose }) {
  const { data: session } = useSession();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (projectId && session) {
      fetchPermissions();
    }
  }, [projectId, session]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/permissions`);
      if (response.ok) {
        const data = await response.json();
        setPermissions(data.permissions || []);
        
        // Obtener el rol del usuario actual
        const currentUserPerm = data.permissions.find(
          p => p.userId === session.user.id
        );
        setUserRole(currentUserPerm?.role || null);
      } else {
        console.error('Error fetching permissions');
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      alert('Por favor, ingresa un email');
      return;
    }

    setInviting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.pending) {
          alert(`Invitación enviada a ${inviteEmail}. El usuario será agregado cuando se registre.`);
        } else {
          alert(`Usuario ${data.user?.email || inviteEmail} agregado al proyecto.`);
        }
        setInviteEmail('');
        fetchPermissions();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al invitar usuario'}`);
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      alert('Error al invitar usuario');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    if (!confirm(`¿Cambiar el rol a "${newRole}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: userId,
          newRole,
        }),
      });

      if (response.ok) {
        fetchPermissions();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al actualizar rol'}`);
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Error al actualizar rol');
    }
  };

  const handleRemoveUser = async (userId, userEmail) => {
    if (!confirm(`¿Remover a ${userEmail} del proyecto?`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/projects/${projectId}/permissions?userId=${userId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        fetchPermissions();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Error al remover usuario'}`);
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Error al remover usuario');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">Cargando permisos...</div>
      </div>
    );
  }

  const canManage = userRole === 'owner';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Permisos del Proyecto</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {canManage && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-md">
            <h3 className="text-sm font-medium text-indigo-900 mb-3">
              Invitar Usuario
            </h3>
            <form onSubmit={handleInvite} className="flex space-x-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviting ? 'Enviando...' : 'Invitar'}
              </button>
            </form>
            <p className="mt-2 text-xs text-gray-600">
              Si el usuario no existe, recibirá una invitación cuando se registre.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Miembros del Proyecto ({permissions.length})
          </h3>
          <div className="space-y-2">
            {permissions.map((perm) => {
              const isCurrentUser = perm.userId === session?.user?.id;
              const canEdit = canManage && !isCurrentUser;
              
              return (
                <div
                  key={perm.userId}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-600 font-medium">
                        {perm.userName?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {perm.userName || perm.userEmail}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-gray-500">(Tú)</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{perm.userEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {canEdit ? (
                      <select
                        value={perm.role}
                        onChange={(e) => handleUpdateRole(perm.userId, e.target.value)}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md flex items-center gap-1">
                        {perm.role === 'owner' && <Crown className="w-4 h-4" />}
                        {perm.role === 'editor' && <Pencil className="w-4 h-4" />}
                        {perm.role === 'viewer' && <Eye className="w-4 h-4" />}
                        <span className="capitalize">{perm.role}</span>
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveUser(perm.userId, perm.userEmail)}
                        className="px-3 py-1 text-sm bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Roles:</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li><strong>Owner:</strong> Puede editar, eliminar y gestionar permisos</li>
            <li><strong>Editor:</strong> Puede crear y editar flujos</li>
            <li><strong>Viewer:</strong> Solo puede ver flujos</li>
          </ul>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

