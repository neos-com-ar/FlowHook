'use client';

import { SessionProvider } from 'next-auth/react';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';

export default function Providers({ children }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchOnMount={false}
      refetchInterval={0}
    >
      <WorkspaceProvider>
        {children}
      </WorkspaceProvider>
    </SessionProvider>
  );
}

