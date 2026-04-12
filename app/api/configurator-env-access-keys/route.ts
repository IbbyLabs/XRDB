import { NextResponse } from 'next/server';

import { getConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getConfiguratorEnvAccessKeys());
}
