'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import FlowList from '@/components/FlowList';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user) {
      // Si el usuario está autenticado pero no tiene contraseña establecida,
      // redirigir a la página de establecer contraseña
      // Nota: Los usuarios de OAuth (GitHub, Google) no necesitan contraseña,
      // pero los usuarios que se autenticaron por email o credentials sí deben tenerla
      const provider = session.user.provider;
      const isOAuth = provider === 'google' || provider === 'github';
      const needsPassword = session.user.hasPassword === false && 
                          session.user.email && 
                          !isOAuth && 
                          (provider === 'email' || provider === 'credentials' || !provider);
      
      if (needsPassword && pathname !== '/set-password') {
        router.push('/set-password');
      }
    }
  }, [status, session, router, pathname]);

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
    <div>
      <FlowList />
    </div>
  );
}

