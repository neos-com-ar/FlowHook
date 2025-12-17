import { getBuildInfo } from '@/lib/build-info';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const buildInfo = getBuildInfo();
    return NextResponse.json(buildInfo);
  } catch (error) {
    return NextResponse.json(
      { buildNumber: 0, lastBuild: null },
      { status: 200 }
    );
  }
}






