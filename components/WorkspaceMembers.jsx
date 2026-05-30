'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Crown, Pencil, Eye, Shield } from 'lucide-react';

const ROLE_ICONS = { owner: Crown, admin: Shield, editor: Pencil, viewer: Eye };

export default function WorkspaceMembers({ workspaceId, isPersonal, onClose }) {
  const { data: session } = useSession();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (workspaceId && session) fetchMembers();
  }, [workspaceId, session]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        const current = data.members.find(m => m.userId === session.user.id);
        setUserRole(current?.role || null);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.pending
          ? `Invitación enviada a ${inviteEmail}`
          : `Usuario ${data.user?.email} agregado al workspace`);
        setInviteEmail('');
        fetchMembers();
      } else {
        const err = await res.json();
        alert(err.error || 'Error al invitar');
      }
    } catch {
      alert('Error al invitar usuario');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!confirm('¿Remover este miembro del workspace?')) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) fetchMembers();
    else {
      const err = await res.json();
      alert(err.error || 'Error al remover');
    }
  };

  const canManage = userRole === 'owner' || userRole === 'admin';

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
        <button onClick={onClose} className="mb-4 text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Miembros del workspace</h2>

        {isPersonal ? (
          <p className="text-sm text-gray-600">El workspace personal no admite miembros externos.</p>
        ) : (
          <>
            {canManage && (
              <form onSubmit={handleInvite} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Invitar miembro</h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {inviting ? 'Enviando...' : 'Invitar'}
                </button>
              </form>
            )}

            {loading ? (
              <p className="text-gray-500 text-sm">Cargando...</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member) => {
                  const Icon = ROLE_ICONS[member.role] || Eye;
                  return (
                    <li key={member.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.userName}</p>
                        <p className="text-xs text-gray-500">{member.userEmail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs bg-white px-2 py-1 rounded border">
                          <Icon className="w-3 h-3" />
                          {member.role}
                        </span>
                        {canManage && member.userId !== session.user.id && member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemove(member.userId)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
