import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * Obtiene la sesión del servidor
 * @returns {Promise<Object|null>} Sesión del usuario o null
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Verifica si el usuario está autenticado
 * @returns {Promise<boolean>} true si está autenticado
 */
export async function isAuthenticated() {
  const session = await getSession();
  return !!session?.user;
}

/**
 * Obtiene el ID del usuario de la sesión
 * @returns {Promise<string|null>} ID del usuario o null
 */
export async function getUserId() {
  const session = await getSession();
  return session?.user?.id || null;
}

