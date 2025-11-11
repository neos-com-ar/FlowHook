'use client';

import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchOnMount={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}

