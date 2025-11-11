'use client';

import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null); // Detalles técnicos del error
  const [loginEmail, setLoginEmail] = useState(''); // Email para login con contraseña
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(''); // Email para magic link
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [availableProviders, setAvailableProviders] = useState({
    github: false,
    google: false,
    email: false,
    credentials: false,
  });
  
  // Detectar si estamos en desarrollo (en el cliente, verificamos la URL)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDevelopment(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    }
  }, []);

  // Obtener proveedores disponibles de NextAuth
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await fetch('/api/auth/providers');
        const providers = await response.json();
        
        setAvailableProviders({
          github: !!providers.github,
          google: !!providers.google,
          email: !!providers.email,
          credentials: !!providers.credentials,
        });
        
        console.log('🔐 Proveedores disponibles:', Object.keys(providers));
      } catch (error) {
        console.error('Error al obtener proveedores:', error);
      }
    };

    fetchProviders();
  }, []);

  useEffect(() => {
    // Verificar si hay un error en la URL (de NextAuth)
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const errorMessages = {
        Configuration: {
          title: 'Error de Configuración',
          message: 'Hay un problema con la configuración del servidor. Verifica que todas las variables de entorno estén configuradas correctamente.',
          details: 'Esto generalmente ocurre cuando falta NEXTAUTH_SECRET, NEXTAUTH_URL, o hay un problema con la configuración de los proveedores de autenticación.',
        },
        AccessDenied: {
          title: 'Acceso Denegado',
          message: 'No tienes permiso para acceder a esta aplicación.',
          details: 'Tu cuenta no tiene los permisos necesarios para acceder.',
        },
        Verification: {
          title: 'Enlace de Verificación Inválido',
          message: 'El enlace de verificación ha expirado o ya fue usado.',
          details: 'Los enlaces de verificación por email tienen un tiempo de expiración. Solicita un nuevo enlace.',
        },
        CredentialsSignin: {
          title: 'Credenciales Incorrectas',
          message: 'Usuario o contraseña incorrectos.',
          details: 'Verifica que hayas ingresado correctamente tu usuario y contraseña.',
        },
        EmailSignin: {
          title: 'Error al Enviar Email',
          message: 'No se pudo enviar el email de verificación.',
          details: 'Verifica la configuración SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD) y NEXTAUTH_URL en el servidor.',
        },
        OAuthSignin: {
          title: 'Error en OAuth',
          message: 'Error al iniciar sesión con el proveedor OAuth.',
          details: 'Hay un problema con la configuración del proveedor OAuth (GitHub, Google, etc.).',
        },
        OAuthCallback: {
          title: 'Error en Callback OAuth',
          message: 'Error al procesar la respuesta del proveedor OAuth.',
          details: 'El proveedor OAuth no pudo completar la autenticación.',
        },
        OAuthCreateAccount: {
          title: 'Error al Crear Cuenta',
          message: 'No se pudo crear la cuenta con el proveedor OAuth.',
          details: 'Hubo un problema al crear tu cuenta. Intenta de nuevo.',
        },
        EmailCreateAccount: {
          title: 'Error al Crear Cuenta',
          message: 'No se pudo crear la cuenta con el email proporcionado.',
          details: 'Hubo un problema al crear tu cuenta. Verifica que el email sea válido.',
        },
        Callback: {
          title: 'Error en Callback',
          message: 'Error al procesar la respuesta de autenticación.',
          details: 'Hubo un problema al procesar la respuesta del servidor de autenticación.',
        },
        OAuthAccountNotLinked: {
          title: 'Cuenta no Vinculada',
          message: 'Esta cuenta de email ya está asociada con otro proveedor.',
          details: 'Para vincular cuentas, inicia sesión con el mismo proveedor que usaste originalmente.',
        },
        SessionRequired: {
          title: 'Sesión Requerida',
          message: 'Debes iniciar sesión para acceder a esta página.',
          details: 'Tu sesión ha expirado o no estás autenticado.',
        },
        Default: {
          title: 'Error Desconocido',
          message: 'Ocurrió un error al iniciar sesión.',
          details: `Código de error: ${errorParam}. Por favor, contacta al administrador si el problema persiste.`,
        },
      };
      
      const errorInfo = errorMessages[errorParam] || errorMessages.Default;
      setError(errorInfo.message);
      setErrorDetails({
        title: errorInfo.title,
        details: errorInfo.details,
        code: errorParam,
      });
    }

    // Verificar si ya está autenticado
    getSession().then((session) => {
      if (session) {
        router.push('/dashboard');
      }
    });
  }, [router, searchParams]);

  const handleSignIn = async (provider, emailAddress = null) => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    
    try {
      // Para el provider de email, NextAuth necesita redirigir para mostrar la página de verificación
      if (provider === 'email') {
        if (!emailAddress) {
          setError('Por favor, ingresa un email válido.');
          setLoading(false);
          return;
        }
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress)) {
          setError('Por favor, ingresa un email válido.');
          setErrorDetails({
            title: 'Email Inválido',
            details: `El formato del email "${emailAddress}" no es válido.`,
            code: 'InvalidEmail',
          });
          setLoading(false);
          return;
        }
        
        console.log('📧 Intentando enviar email de verificación a:', emailAddress);
        
        // Para email, permitir la redirección por defecto de NextAuth
        // NextAuth redirigirá a /api/auth/verify-request después de enviar el email
        const result = await signIn('email', { 
          email: emailAddress,
          callbackUrl: '/dashboard',
          redirect: false  // Cambiar a false para capturar errores
        });
        
        console.log('📧 Resultado del envío de email:', result);
        
        // Si hay un error, mostrarlo
        if (result?.error) {
          const errorMessages = {
            EmailSignin: {
              title: 'Error al Enviar Email',
              message: 'No se pudo enviar el email de verificación.',
              details: 'Verifica la configuración SMTP del servidor. Asegúrate de que SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y NEXTAUTH_URL estén configurados correctamente.',
            },
            Configuration: {
              title: 'Error de Configuración',
              message: 'Hay un problema con la configuración del servidor.',
              details: 'Falta NEXTAUTH_SECRET, NEXTAUTH_URL, o hay un problema con la configuración SMTP.',
            },
          };
          
          const errorInfo = errorMessages[result.error] || {
            title: 'Error Desconocido',
            message: `Error al enviar el email: ${result.error}`,
            details: `Código de error: ${result.error}. Revisa los logs del servidor para más detalles.`,
          };
          
          setError(errorInfo.message);
          setErrorDetails({
            title: errorInfo.title,
            details: errorInfo.details,
            code: result.error,
          });
          setLoading(false);
        } else if (result?.ok) {
          // Si es exitoso, redirigir manualmente a la página de verificación
          router.push(`/verify-email?email=${encodeURIComponent(emailAddress)}`);
        } else if (result?.url) {
          // Si hay una URL, redirigir a ella
          window.location.href = result.url;
        } else {
          // Si no hay respuesta clara, redirigir a la página de verificación
          router.push(`/verify-email?email=${encodeURIComponent(emailAddress)}`);
        }
        return;
      }

      // Para otros proveedores (GitHub, Google, Credentials), usar redirect: false
      console.log(`🔐 Intentando iniciar sesión con proveedor: ${provider}`);
      
      const result = await signIn(provider, { 
        callbackUrl: '/dashboard',
        redirect: false 
      });
      
      console.log(`🔐 Resultado del inicio de sesión (${provider}):`, result);
      
      if (result?.error) {
        const errorMessages = {
          CredentialsSignin: {
            title: 'Credenciales Incorrectas',
            message: 'Usuario o contraseña incorrectos.',
            details: 'Verifica que hayas ingresado correctamente tu usuario y contraseña.',
          },
          Configuration: {
            title: 'Error de Configuración',
            message: 'Hay un problema con la configuración del servidor.',
            details: 'El proveedor de autenticación no está configurado correctamente.',
          },
          AccessDenied: {
            title: 'Acceso Denegado',
            message: 'No tienes permiso para acceder.',
            details: 'Tu cuenta no tiene los permisos necesarios.',
          },
          OAuthSignin: {
            title: 'Error en OAuth',
            message: 'Error al iniciar sesión con el proveedor OAuth.',
            details: `Hay un problema con la configuración de ${provider}. Verifica GITHUB_ID/GITHUB_SECRET o GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.`,
          },
        };
        
        const errorInfo = errorMessages[result.error] || {
          title: 'Error Desconocido',
          message: `Error al iniciar sesión: ${result.error}`,
          details: `Código de error: ${result.error}. Revisa los logs del servidor para más detalles.`,
        };
        
        setError(errorInfo.message);
        setErrorDetails({
          title: errorInfo.title,
          details: errorInfo.details,
          code: result.error,
        });
        setLoading(false);
      } else if (result?.ok) {
        router.push('/dashboard');
      } else if (result?.url) {
        // Para OAuth, puede haber una URL de redirección
        window.location.href = result.url;
      } else {
        setError('No se recibió respuesta del servidor.');
        setErrorDetails({
          title: 'Sin Respuesta',
          details: 'El servidor no respondió correctamente. Verifica que el servidor esté funcionando.',
          code: 'NoResponse',
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Error al iniciar sesión:', error);
      console.error('   Tipo:', error.constructor.name);
      console.error('   Mensaje:', error.message);
      console.error('   Stack:', error.stack);
      
      let errorMessage = 'Error al iniciar sesión.';
      let errorDetailsText = 'Ocurrió un error inesperado.';
      
      // Detectar tipos específicos de errores
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        errorMessage = 'Error de conexión. No se pudo conectar al servidor.';
        errorDetailsText = 'Verifica que el servidor esté ejecutándose y que tengas conexión a internet.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Tiempo de espera agotado. El servidor tardó demasiado en responder.';
        errorDetailsText = 'El servidor puede estar sobrecargado o hay un problema de red.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
        errorDetailsText = error.stack || 'Revisa la consola del navegador para más detalles.';
      }
      
      setError(errorMessage);
      setErrorDetails({
        title: 'Error de Excepción',
        details: errorDetailsText,
        code: error.constructor.name,
        stack: isDevelopment ? error.stack : undefined,
      });
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Por favor, ingresa un email válido.');
      return;
    }
    // handleSignIn manejará la redirección automática para el flujo de email
    await handleSignIn('email', email);
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    
    try {
      if (!loginEmail || !password) {
        setError('Por favor, ingresa email y contraseña.');
        setErrorDetails({
          title: 'Campos Requeridos',
          details: 'El email y la contraseña son obligatorios.',
          code: 'MissingFields',
        });
        setLoading(false);
        return;
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(loginEmail)) {
        setError('Por favor, ingresa un email válido.');
        setErrorDetails({
          title: 'Email Inválido',
          details: `El formato del email "${loginEmail}" no es válido.`,
          code: 'InvalidEmail',
        });
        setLoading(false);
        return;
      }
      
      console.log('🔐 Intentando iniciar sesión con credenciales para email:', loginEmail);
      
      const result = await signIn('credentials', { 
        email: loginEmail,
        password,
        callbackUrl: '/dashboard',
        redirect: false 
      });
      
      console.log('🔐 Resultado del inicio de sesión:', result);
      
      if (result?.error) {
        if (result.error === 'CredentialsSignin') {
          setError('Usuario o contraseña incorrectos.');
          setErrorDetails({
            title: 'Credenciales Incorrectas',
            details: 'El usuario o la contraseña que ingresaste no son correctos. Verifica tus credenciales e intenta de nuevo.',
            code: 'CredentialsSignin',
          });
        } else {
          setError(`Error: ${result.error}`);
          setErrorDetails({
            title: 'Error de Autenticación',
            details: `Código de error: ${result.error}. Revisa los logs del servidor para más detalles.`,
            code: result.error,
          });
        }
        setLoading(false);
      } else if (result?.ok) {
        router.push('/dashboard');
      } else {
        setError('No se recibió respuesta del servidor.');
        setErrorDetails({
          title: 'Sin Respuesta',
          details: 'El servidor no respondió correctamente. Verifica que el servidor esté funcionando.',
          code: 'NoResponse',
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ Error al iniciar sesión:', error);
      console.error('   Tipo:', error.constructor.name);
      console.error('   Mensaje:', error.message);
      console.error('   Stack:', error.stack);
      
      let errorMessage = 'Error al iniciar sesión.';
      let errorDetailsText = 'Ocurrió un error inesperado.';
      
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        errorMessage = 'Error de conexión. No se pudo conectar al servidor.';
        errorDetailsText = 'Verifica que el servidor esté ejecutándose y que tengas conexión a internet.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Tiempo de espera agotado. El servidor tardó demasiado en responder.';
        errorDetailsText = 'El servidor puede estar sobrecargado o hay un problema de red.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
        errorDetailsText = error.stack || 'Revisa la consola del navegador para más detalles.';
      }
      
      setError(errorMessage);
      setErrorDetails({
        title: 'Error de Excepción',
        details: errorDetailsText,
        code: error.constructor.name,
        stack: isDevelopment ? error.stack : undefined,
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            FlowHook
          </h1>
          <p className="text-gray-600">
            Administra tus flujos de webhooks de forma sencilla
          </p>
          <p className="text-sm text-gray-500 mt-2">
            El registro es automático en tu primer inicio de sesión
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  {errorDetails?.title || 'Error'}
                </h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                {errorDetails?.details && (
                  <div className="mt-2">
                    <p className="text-sm text-red-600">{errorDetails.details}</p>
                    {isDevelopment && errorDetails.code && (
                      <p className="mt-1 text-xs text-red-500 font-mono">
                        Código: {errorDetails.code}
                      </p>
                    )}
                    {isDevelopment && errorDetails.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-500 cursor-pointer hover:text-red-700">
                          Ver stack trace (desarrollo)
                        </summary>
                        <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded overflow-auto max-h-40">
                          {errorDetails.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Formulario de credenciales (email + contraseña) */}
        <form onSubmit={handleCredentialsSubmit} className="mb-6 space-y-4">
          <div>
            <label htmlFor="loginEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="loginEmail"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Tu contraseña"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Mostrar separador "O" solo si hay otros proveedores disponibles además de credenciales */}
        {(availableProviders.github || availableProviders.google || availableProviders.email) && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">O</span>
            </div>
          </div>
        )}

        <div className="space-y-4 mt-4">
          {availableProviders.github && (
            <button
              onClick={() => handleSignIn('github')}
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
              </svg>
              {loading ? 'Iniciando sesión...' : 'Continuar con GitHub'}
            </button>
          )}

          {availableProviders.google && (
            <button
              onClick={() => handleSignIn('google')}
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? 'Iniciando sesión...' : 'Continuar con Google'}
            </button>
          )}

          {availableProviders.email && !showEmailForm && (
            <button
              onClick={() => setShowEmailForm(true)}
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Continuar con Email
            </button>
          )}

          {availableProviders.email && showEmailForm && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="tu@email.com"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="flex-1 flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false);
                    setEmail('');
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-500">Cargando...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

