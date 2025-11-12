import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]/route';
import Adapter from '@/lib/adapter';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user || !session.user.email) {
      return new Response(
        JSON.stringify({ error: 'No autorizado. Debes estar autenticado para cambiar tu contraseña.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = await request.json();

    // Validar que todos los campos estén presentes
    if (!currentPassword || !newPassword || !confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Todos los campos son requeridos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que las nuevas contraseñas coincidan
    if (newPassword !== confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Las nuevas contraseñas no coinciden.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que la nueva contraseña sea diferente a la actual
    if (currentPassword === newPassword) {
      return new Response(
        JSON.stringify({ error: 'La nueva contraseña debe ser diferente a la contraseña actual.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar longitud mínima de contraseña
    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obtener el adapter
    const adapter = Adapter();
    
    // Obtener el usuario actual
    const user = await adapter.getUserByEmail(session.user.email);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verificar que el usuario tenga contraseña establecida
    if (!user.password || !user.hasPassword) {
      return new Response(
        JSON.stringify({ error: 'No tienes una contraseña establecida. Usa la opción de establecer contraseña.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verificar la contraseña actual
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return new Response(
        JSON.stringify({ error: 'La contraseña actual es incorrecta.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar el usuario con la nueva contraseña hasheada
    await adapter.updateUser({
      ...user,
      password: hashedPassword,
      hasPassword: true,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña cambiada correctamente.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return new Response(
      JSON.stringify({ error: 'Error al cambiar la contraseña. Por favor, intenta de nuevo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


