import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]/route';
import Adapter from '@/lib/adapter';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user || !session.user.email) {
      return new Response(
        JSON.stringify({ error: 'No autorizado. Debes estar autenticado para establecer una contraseña.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { password, confirmPassword } = await request.json();

    // Validar que la contraseña esté presente
    if (!password || !confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'La contraseña y la confirmación son requeridas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Las contraseñas no coinciden.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar longitud mínima de contraseña
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

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

    // Actualizar el usuario con la contraseña hasheada
    await adapter.updateUser({
      ...user,
      password: hashedPassword,
      hasPassword: true,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña establecida correctamente.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error al establecer contraseña:', error);
    return new Response(
      JSON.stringify({ error: 'Error al establecer la contraseña. Por favor, intenta de nuevo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


