import { NextRequest } from 'next/server';
import {
  handleProxyManifestGet,
  handleProxyManifestOptions,
} from '@/lib/proxyManifestRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handleProxyManifestOptions(request);
}

export async function GET(request: NextRequest) {
  return handleProxyManifestGet(request);
}
