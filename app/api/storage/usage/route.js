import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getStorageUsage } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function isAllowed(email) {
  const allowed = (process.env.STORAGE_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(String(email || '').toLowerCase());
}

/**
 * GET /api/storage/usage
 * Espacio ocupado/libre del almacenamiento. Si STORAGE_ADMIN_EMAILS está definida,
 * solo esos emails pueden consultarlo.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAllowed(session.user.email)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'No tenés permiso para ver el almacenamiento.' },
        { status: 403 },
      );
    }

    return NextResponse.json(await getStorageUsage());
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
