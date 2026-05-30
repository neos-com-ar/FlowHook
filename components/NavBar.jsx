'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function NavBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [buildNumber, setBuildNumber] = useState(null);
  const menuRef = useRef(null);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  // Cerrar el menú cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Obtener el build number
  useEffect(() => {
    const fetchBuildNumber = async () => {
      try {
        const response = await fetch('/api/build-info');
        if (response.ok) {
          const data = await response.json();
          console.log('Build info recibido:', data);
          // Aceptar cualquier número, incluyendo 0
          if (data.buildNumber !== undefined && data.buildNumber !== null) {
            setBuildNumber(data.buildNumber);
          }
        } else {
          console.error('Error en respuesta de build-info:', response.status);
        }
      } catch (error) {
        console.error('Error al obtener build number:', error);
      }
    };

    if (pathname !== '/login') {
      fetchBuildNumber();
    }
  }, [pathname]);

  if (pathname === '/login') {
    return null;
  }

  // Obtener el email completo del usuario
  const userEmail = session?.user?.email || '';
  // Verificar si el usuario puede cambiar contraseña
  // Solo usuarios que se autenticaron con email o credentials pueden cambiar contraseña
  // Los usuarios de OAuth (Google, GitHub) no pueden cambiar contraseña
  const provider = session?.user?.provider;
  const isOAuth = provider === 'google' || provider === 'github';
  const canChangePassword = session?.user?.hasPassword === true && !isOAuth;

  return (
    <>
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link href="/dashboard" className="flex items-center">
                <span className="text-xl font-bold text-indigo-600">
                  FlowHook
                </span>
              </Link>
              {buildNumber !== null && buildNumber !== undefined && (
                <span className="text-[10px] text-gray-500 font-normal italic">
                  Version 3.0.0 Build {buildNumber}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {status === 'loading' ? (
                <div className="text-gray-500">Cargando...</div>
              ) : session ? (
                <>
                  <WorkspaceSwitcher />
                  <Link
                    href="/dashboard/webhooks"
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Historial de Webhooks
                  </Link>
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <span>{userEmail}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'transform rotate-180' : ''}`} />
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                        <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200">
                          {userEmail}
                        </div>
                        {canChangePassword && (
                          <button
                            onClick={() => {
                              setShowChangePasswordModal(true);
                              setShowUserMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Cambiar Contraseña
                          </button>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Cerrar sesión
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {canChangePassword && (
        <ChangePasswordModal
          isOpen={showChangePasswordModal}
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}
    </>
  );
}

