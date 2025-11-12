'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'tu email';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Revisa tu correo
          </h1>
          <p className="text-gray-600 mb-4">
            Hemos enviado un enlace de acceso a <strong>{email}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Haz clic en el enlace del correo para iniciar sesión. Si no lo ves, revisa tu carpeta de spam.
          </p>
          <div className="space-y-3">
            <Link
              href="/login"
              className="block w-full text-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-500">Cargando...</div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}


