import './globals.css';
import { Inter } from 'next/font/google';
import NavBar from '@/components/NavBar';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'FlowHook - Plataforma de Webhooks',
  description: 'Plataforma SaaS para administrar múltiples flujos de webhooks configurables por usuario',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>
          <NavBar />
          <main className="min-h-screen bg-gray-50">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}

