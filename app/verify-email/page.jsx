'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'tu email';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <Mail className="h-6 w-6 text-green-600" />
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
              className="block w-full text-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al inicio de sesión</span>
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


